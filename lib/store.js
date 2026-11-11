// Almacenamiento de Rutero. Dos modos (RUTERO_ALMACEN):
//
// - "api" (producción): las bases propias en la API dinamic-db
//     Rutero_programaciones · Rutero_peticiones · Rutero_config · Rutero_borradores
// - "archivos" (pruebas locales): data/programaciones.jsonl, data/db.json, data/maestros.json
//
// En los dos modos nada se edita en su lugar: modificar, cancelar o revisar agrega un registro con
// el mismo id y la versión siguiente; al leer vale la versión más alta. Todo vive en memoria para
// que las búsquedas sean rápidas, y cada ruta que guarda espera `confirmar()` antes de responder:
// si la base no confirma, se recarga lo que hay en la base y el LAS ve un error.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seg = require('./seguridad');
const api = require('./baseApi');

const MODO = (process.env.RUTERO_ALMACEN || seg.variable('RUTERO_ALMACEN') || 'archivos').toLowerCase() === 'api' ? 'api' : 'archivos';
const DIR = process.env.RUTERO_DATA || path.join(__dirname, '..', 'data');
const MAESTROS = path.join(DIR, 'maestros.json');
const DB = path.join(DIR, 'db.json');
const PROGRAMACIONES = path.join(DIR, 'programaciones.jsonl');
// Última respuesta buena de la API de Nutresa (usuarios y PDV); solo se usa si la API no responde.
const NUTRESA = path.join(DIR, 'nutresa-respaldo.json');

const BASES = { programaciones: 'Rutero_programaciones', peticiones: 'Rutero_peticiones', config: 'Rutero_config', borradores: 'Rutero_borradores' };
const BORRADORES = path.join(DIR, 'borradores.json');
const borradores = new Map(); // nombre del LAS -> último borrador (o null)

function leer(archivo, porDefecto) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch {
    return porDefecto;
  }
}

function escribir(archivo, datos) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 1));
  fs.renameSync(tmp, archivo);
}

// Lee el registro de programaciones; ignora una última línea incompleta si el equipo se apagó escribiendo.
function leerProgramaciones() {
  if (!fs.existsSync(PROGRAMACIONES)) return [];
  return fs.readFileSync(PROGRAMACIONES, 'utf8').split('\n').filter(Boolean).flatMap((linea) => {
    try {
      return [JSON.parse(linea)];
    } catch {
      return [];
    }
  });
}

function escribirProgramaciones(lista) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${PROGRAMACIONES}.tmp`;
  fs.writeFileSync(tmp, lista.map((p) => `${JSON.stringify(p)}\n`).join(''));
  fs.renameSync(tmp, PROGRAMACIONES);
}

// ---------- Estado en memoria ----------

let listas = { eventos: [], novedades: [], horas: [], canales: [] };
let nutresa = leer(NUTRESA, { usuarios: {}, pdv: {}, fecha: null });
// usuariosNuevos y pdvNuevos solo existen en datos viejos (modo archivos); hoy las personas pedidas
// salen de las peticiones.
const db = { periodo: null, usuariosNuevos: {}, pdvNuevos: {}, peticiones: [], programaciones: [] };

const vigentes = new Map(); // id -> última versión de la programación
const peticionesPorId = new Map(); // id -> última versión de la petición

function sinTiempo(periodo) {
  return periodo ? String(periodo).slice(0, 10) : null;
}

function registrarProgramacion(linea) {
  const actual = vigentes.get(linea.id);
  const v = { version: 1, ...linea, periodo: sinTiempo(linea.periodo) };
  if (!actual || (v.version || 1) >= (actual.version || 1)) vigentes.set(v.id, v);
}

function registrarPeticion(p) {
  const actual = peticionesPorId.get(p.id);
  const v = { version: 1, ...p };
  if (!actual || (v.version || 1) >= (actual.version || 1)) peticionesPorId.set(v.id, v);
}

// Solo cuentan las programaciones del mes abierto (las de otros meses quedan como historial).
function delMes(p) {
  return !p.anulada && (!p.periodo || p.periodo === db.periodo);
}

function actualizarListas() {
  db.programaciones = [...vigentes.values()].filter(delMes);
  db.peticiones = [...peticionesPorId.values()];
}

function limpiarRegistro(doc) {
  const { _id, created, modified, ...resto } = doc;
  return resto;
}

// ---------- Persistencia ----------

let cola = [];

function persistir(tarea) {
  const p = Promise.resolve().then(tarea);
  p.catch(() => {}); // el error se reporta en confirmar()
  cola.push(p);
}

function guardarDbArchivo() {
  escribir(DB, { periodo: db.periodo, usuariosNuevos: db.usuariosNuevos, pdvNuevos: db.pdvNuevos, peticiones: db.peticiones });
}

async function cargarDesdeApi() {
  const [progs, pets, config] = await Promise.all([
    api.listar(BASES.programaciones), api.listar(BASES.peticiones), api.listar(BASES.config),
  ]);
  // Config: vale el último registro de cada tipo.
  const ultimo = (tipo) => config.filter((c) => c.tipo === tipo).at(-1);
  // Reinicio: lo guardado antes de la última marca (pruebas) no cuenta. La API no permite borrar,
  // así que los registros viejos siguen en la base pero Rutero los ignora.
  const reinicio = ultimo('reinicio');
  const despues = (doc) => !reinicio || String(doc.created || '') > String(reinicio.created || reinicio.desde || '');
  vigentes.clear();
  peticionesPorId.clear();
  progs.filter(despues).map(limpiarRegistro).forEach(registrarProgramacion);
  pets.filter(despues).map(limpiarRegistro).forEach(registrarPeticion);
  const per = ultimo('periodo');
  const lis = ultimo('listas');
  db.periodo = per ? sinTiempo(per.periodo) : null;
  if (lis) listas = { eventos: lis.eventos || [], novedades: lis.novedades || [], horas: lis.horas || [], canales: lis.canales || [] };
  actualizarListas();
  return { periodo: !!per, listas: !!lis };
}

function cargarDesdeArchivos() {
  const { usuarios: _u, pdv: _p, ...guardadas } = leer(MAESTROS, {});
  listas = { eventos: [], novedades: [], horas: [], canales: [], ...guardadas };
  const d = leer(DB, {});
  db.periodo = d.periodo || null;
  db.usuariosNuevos = d.usuariosNuevos || {};
  db.pdvNuevos = d.pdvNuevos || {};
  vigentes.clear();
  peticionesPorId.clear();
  // Versiones anteriores guardaban las programaciones dentro de db.json: se pasan al registro.
  if (Array.isArray(d.programaciones) && d.programaciones.length && !fs.existsSync(PROGRAMACIONES)) escribirProgramaciones(d.programaciones);
  leerProgramaciones().forEach(registrarProgramacion);
  (d.peticiones || []).forEach(registrarPeticion);
  actualizarListas();
}

// Personas pedidas por los LAS: se pueden programar mientras Nutresa las crea.
function usuariosPedidos() {
  const m = { ...db.usuariosNuevos };
  for (const p of db.peticiones) {
    if (p.tipo !== 'usuario' || p.estado === 'devuelta') continue;
    const d = p.datos;
    m[d.CEDULA] = {
      cedula: d.CEDULA, nombre: d.NOMBRE, telefono: d.TELEFONO, regional: d.REGIONAL, ciudad: d.CIUDAD, marca: d.MARCA,
      evento: d.EVENTO, ruta: d.RUTA, cargo: d.CARGO, las: p.las, estado: 'ACTIVO',
      nuevo: true, creado: p.creado, registradoPor: p.las, peticion: p.id,
    };
  }
  return m;
}

const store = {
  modo: MODO,
  dir: DIR,

  // Carga todo al arrancar. En modo api, si las bases no tienen aún el mes o las listas del Formato,
  // se toman una sola vez de data/ (si existe) y se guardan en Rutero_config.
  async iniciar() {
    if (MODO === 'archivos') { cargarDesdeArchivos(); return; }
    const hay = await cargarDesdeApi();
    const local = leer(DB, {});
    const maestrosLocal = leer(MAESTROS, null);
    if (!hay.periodo && local.periodo) await store.ponerPeriodo(local.periodo, 'migración inicial');
    if (!hay.listas && maestrosLocal) {
      const { usuarios: _u, pdv: _p, ...l } = maestrosLocal;
      await store.guardarListas(l);
    }
    await store.confirmar();
  },

  // Espera a que la base confirme lo que se guardó en esta petición. Si algo falló, recarga lo que
  // hay en la base (para no quedar con datos que no se guardaron) y lanza el error.
  async confirmar() {
    const pendientes = cola;
    cola = [];
    const r = await Promise.allSettled(pendientes);
    const fallo = r.find((x) => x.status === 'rejected');
    if (!fallo) return;
    borradores.clear();
    if (MODO === 'api') await cargarDesdeApi().catch(() => {});
    else cargarDesdeArchivos();
    const e = new Error('No se pudo guardar en la base. Intenta otra vez en un momento.');
    e.status = 503;
    e.causa = fallo.reason;
    throw e;
  },

  maestros: () => ({ ...listas, usuarios: nutresa.usuarios, pdv: nutresa.pdv }),
  db: () => db,
  // Vista combinada que usa el motor del rutero.
  contexto: () => ({ ...store.maestros(), usuariosNuevos: usuariosPedidos(), pdvNuevos: db.pdvNuevos }),

  // Listas del Formato Rutero (npm run cargar).
  guardarListas({ eventos, novedades, horas, canales }) {
    listas = { eventos, novedades, horas, canales };
    if (MODO === 'api') persistir(() => api.agregar(BASES.config, { tipo: 'listas', ...listas, creado: new Date().toISOString() }));
    else escribir(MAESTROS, listas);
  },

  ponerPeriodo(periodo, por = '') {
    db.periodo = sinTiempo(periodo);
    actualizarListas();
    if (MODO === 'api') persistir(() => api.agregar(BASES.config, { tipo: 'periodo', periodo: db.periodo, por, creado: new Date().toISOString() }));
    else guardarDbArchivo();
  },

  // Usuarios y PDV recién leídos de Nutresa: en memoria y como respaldo en disco (si se puede).
  // El archivo solo se reescribe si los datos cambiaron (no 2 MB cada minuto).
  ponerNutresa(usuarios, pdv) {
    const huella = crypto.createHash('sha1').update(JSON.stringify([usuarios, pdv])).digest('hex');
    const cambio = huella !== nutresa.huella;
    nutresa = { usuarios, pdv, fecha: new Date().toISOString(), huella };
    if (cambio) {
      try { escribir(NUTRESA, nutresa); } catch { /* sin disco: queda en memoria */ }
    }
  },
  respaldoNutresa: () => nutresa.fecha,

  // ---------- Programaciones ----------
  agregarProgramacion(p) {
    const linea = { version: 1, periodo: db.periodo, ...p };
    registrarProgramacion(linea);
    actualizarListas();
    if (MODO === 'api') persistir(() => api.agregar(BASES.programaciones, linea));
    else fs.appendFileSync(PROGRAMACIONES, `${JSON.stringify(linea)}\n`);
    return linea;
  },
  // Nueva versión de una programación existente (modificar, cancelar, cambiar de evento o revisar).
  versionarProgramacion(id, cambios) {
    const actual = vigentes.get(id);
    const linea = { ...actual, ...cambios, id, version: (actual.version || 1) + 1, modificado: new Date().toISOString() };
    registrarProgramacion(linea);
    actualizarListas();
    if (MODO === 'api') persistir(() => api.agregar(BASES.programaciones, linea));
    else fs.appendFileSync(PROGRAMACIONES, `${JSON.stringify(linea)}\n`);
    return linea;
  },
  programacion: (id) => {
    const p = vigentes.get(id);
    return p && delMes(p) ? p : null;
  },
  // Solo para cargar el PANEL de un Formato en pruebas (modo archivos).
  reemplazarProgramaciones(lista) {
    escribirProgramaciones(lista);
    vigentes.clear();
    lista.forEach(registrarProgramacion);
    actualizarListas();
  },

  // ---------- Peticiones (usuario, PDV y cambio de evento) ----------
  agregarPeticion(p) {
    const v = { version: 1, ...p };
    registrarPeticion(v);
    actualizarListas();
    if (MODO === 'api') persistir(() => api.agregar(BASES.peticiones, v));
    else guardarDbArchivo();
    return v;
  },
  versionarPeticion(id, cambios) {
    const actual = peticionesPorId.get(id);
    const v = { ...actual, ...cambios, id, version: (actual.version || 1) + 1, modificado: new Date().toISOString() };
    registrarPeticion(v);
    actualizarListas();
    if (MODO === 'api') persistir(() => api.agregar(BASES.peticiones, v));
    else guardarDbArchivo();
    return v;
  },
  peticion: (id) => peticionesPorId.get(id) || null,

  // ---------- Borradores de "Crear rutero" (uno por LAS) ----------
  // No se cargan al arrancar: se leen de la base la primera vez que el LAS los pide y quedan en memoria.
  async borrador(las) {
    if (borradores.has(las)) return borradores.get(las);
    let ultimo = null;
    if (MODO === 'api') {
      const lista = await api.listar(BASES.borradores, { las });
      for (const b of lista) if (!ultimo || String(b.guardado) >= String(ultimo.guardado)) ultimo = b;
      if (ultimo) ultimo = { ...limpiarRegistro(ultimo), periodo: sinTiempo(ultimo.periodo) };
    } else {
      ultimo = leer(BORRADORES, {})[las] || null;
    }
    borradores.set(las, ultimo);
    return ultimo;
  },
  guardarBorrador(las, datos) {
    const b = { las, ...datos, guardado: new Date().toISOString() };
    borradores.set(las, b);
    if (MODO === 'api') persistir(() => api.agregar(BASES.borradores, b));
    else escribir(BORRADORES, { ...leer(BORRADORES, {}), [las]: b });
    return b;
  },

  nuevoId: () => crypto.randomUUID(),
};

module.exports = store;
