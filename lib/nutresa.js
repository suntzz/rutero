// Usuarios (LAS y promotores) y PDV leídos de la API de Nutresa (solo lectura).
//
// - Los datos se refrescan cada NUTRESA_VIGENCIA_SEG segundos (60 por defecto) en segundo plano:
//   ningún LAS espera a Nutresa si ya hay datos en memoria. Solo cuando no hay ningún dato (primer
//   arranque sin respaldo) se espera la primera consulta.
// - Si Nutresa tarda o falla, se reintenta (3 intentos por consulta) y, mientras tanto, se sigue con
//   lo último bueno. Ese respaldo también queda en data/nutresa-respaldo.json (en Railway, en un
//   volumen) para que un reinicio no deje a Rutero sin datos.
// - Eventos, novedades, horas y canales siguen saliendo del Formato Rutero (la API no los trae).

const store = require('./store');
const { variable } = require('./seguridad');

const BASE = (variable('NUTRESA_API_URL') || 'https://botai.smartdataautomation.com/api_backend_ai/dinamic-db/report/119').replace(/\/+$/, '');
const RUTA_USUARIOS = variable('NUTRESA_RUTA_USUARIOS') || 'usuarios_nutresa';
const RUTA_PDV = variable('NUTRESA_RUTA_PDV') || 'pdv_nutresa';
const VIGENCIA_MS = (Number(variable('NUTRESA_VIGENCIA_SEG')) || 60) * 1000;
const ESPERA_MS = 45000; // por intento; normalmente responde en 1–2 s, pero a veces tarda mucho más
const INTENTOS = 3;
const PAUSAS_MS = [2000, 5000];

const estado = {
  configurada: false,
  ultimaOk: null, // fecha de la última actualización correcta
  ultimoIntento: null,
  error: '',
  usuarios: 0,
  pdv: 0,
};

// Las columnas pueden venir como "CEDULA", "Cedula", "cédula"…: se comparan sin tildes ni espacios.
function clave(k) {
  return String(k).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function lector(fila) {
  const mapa = {};
  for (const [k, v] of Object.entries(fila || {})) mapa[clave(k)] = v;
  return (...nombres) => {
    for (const n of nombres) {
      const v = mapa[clave(n)];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  };
}

function texto(v) {
  return String(v ?? '').trim();
}

function codigo(v) {
  const t = String(v ?? '').trim().replace(/\.0+$/, '');
  return /^\d+$/.test(t) ? t : t.replace(/\D/g, '');
}

// SAP: número o texto con guion (12345678-12).
function codigoSap(v) {
  return String(v ?? '').trim().replace(/\.0+$/, '').replace(/[^\d-]/g, '');
}

function filas(json) {
  if (Array.isArray(json)) return json;
  for (const k of ['result', 'results', 'data', 'rows', 'items']) {
    if (Array.isArray(json?.[k])) return json[k];
  }
  return [];
}

// Aquí solo se LEE (GET). Rutero nunca edita ni borra en usuarios_nutresa y pdv_nutresa; la única
// escritura es la carga directa del área interna, que solo agrega registros nuevos (lib/cargaNutresa.js).
async function pedir(ruta, token) {
  const r = await fetch(`${BASE}/${ruta}`, {
    method: 'GET',
    headers: { Authorization: `Token ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (r.status === 401 || r.status === 403) {
    throw new Error('Nutresa rechazó el token (NUTRESA_API_TOKEN). Revisa que esté bien copiado y vigente.');
  }
  if (!r.ok) {
    const cuerpo = await r.text().catch(() => '');
    throw new Error(`${ruta}: HTTP ${r.status} ${cuerpo.slice(0, 160)}`);
  }
  return filas(await r.json());
}

// Reintenta si Nutresa tarda o se cae la red; un token rechazado no se reintenta.
async function pedirConReintentos(ruta, token) {
  for (let i = 0; ; i++) {
    try {
      return await pedir(ruta, token);
    } catch (e) {
      if (i >= INTENTOS - 1 || /rechazó el token/.test(e.message)) throw e;
      await new Promise((ok) => setTimeout(ok, PAUSAS_MS[i] || 5000));
    }
  }
}

// Mismos campos que la hoja MASTER USUARIOS del Formato Rutero.
function aUsuarios(lista) {
  const usuarios = {};
  for (const f of lista) {
    const v = lector(f);
    const cedula = codigo(v('CEDULA', 'cedula', 'documento'));
    if (!cedula || usuarios[cedula]) continue;
    usuarios[cedula] = {
      cedula,
      telefono: codigo(v('TELEFONO', 'celular')),
      regional: texto(v('REGIONAL')),
      ciudad: texto(v('CIUDAD')),
      nombre: texto(v('NOMBRE', 'nombre completo')),
      marca: texto(v('MARCA')),
      evento: texto(v('EVENTO')),
      ruta: texto(v('RUTA')),
      cargo: texto(v('CARGO')),
      las: texto(v('LAS')),
      estado: texto(v('ESTADO')),
    };
  }
  return usuarios;
}

// Mismos campos que la hoja MASTER PDV.
function aPdv(lista) {
  const pdv = {};
  for (const f of lista) {
    const v = lector(f);
    const sap = codigoSap(v('SAP', 'codigo sap'));
    if (!sap || pdv[sap]) continue;
    pdv[sap] = {
      sap,
      nombre: texto(v('PDV', 'NOMBRE', 'nombre pdv')),
      ciudad: texto(v('CIUDAD')),
      direccion: texto(v('DIRECCION')),
      canal: texto(v('CANAL')),
      regional: texto(v('REGIONAL')),
      evento: texto(v('EVENTO')),
      marca: texto(v('MARCA')),
      latitud: texto(v('LATITUD')),
      longitud: texto(v('LONGITUD')),
    };
  }
  return pdv;
}

let enCurso = null;

async function traer(token) {
  estado.ultimoIntento = new Date().toISOString();
  try {
    const [crudoU, crudoP] = await Promise.all([pedirConReintentos(RUTA_USUARIOS, token), pedirConReintentos(RUTA_PDV, token)]);
    const usuarios = aUsuarios(crudoU);
    const pdv = aPdv(crudoP);
    // Si la API responde vacía no se reemplaza lo último bueno.
    if (!Object.keys(usuarios).length || !Object.keys(pdv).length) {
      throw new Error(`La API respondió sin datos (usuarios: ${Object.keys(usuarios).length}, PDV: ${Object.keys(pdv).length}).`);
    }
    store.ponerNutresa(usuarios, pdv);
    const cambio = !estado.ultimaOk || estado.error;
    Object.assign(estado, {
      ultimaOk: new Date().toISOString(), error: '',
      usuarios: Object.keys(usuarios).length, pdv: Object.keys(pdv).length,
    });
    if (cambio) console.log(`Conectado a Nutresa: ${estado.usuarios} usuarios, ${estado.pdv} PDV.`);
  } catch (e) {
    const antes = estado.error;
    if (e.name === 'TimeoutError') estado.error = `La API de Nutresa no respondió a tiempo (${INTENTOS} intentos).`;
    else if (e.message === 'fetch failed') estado.error = 'No se pudo conectar con la API de Nutresa (sin red o dirección incorrecta).';
    else estado.error = e.message;
    const hayDatos = Object.keys(store.maestros().usuarios).length > 0;
    if (estado.error !== antes) {
      console.error(`Nutresa no respondió: ${estado.error} ${hayDatos ? 'Rutero sigue con los últimos datos buenos y reintenta solo.' : 'Aún no hay datos: se reintenta cada 15 s.'}`);
    }
  }
}

// Consulta la API ya (el botón "Actualizar" del área interna).
async function actualizar() {
  const token = variable('NUTRESA_API_TOKEN');
  estado.configurada = !!token;
  if (!token) {
    estado.error = 'Falta NUTRESA_API_TOKEN.';
    return estado;
  }
  // Si ya hay una consulta en camino, todos esperan esa misma.
  if (!enCurso) enCurso = traer(token).finally(() => { enCurso = null; });
  await enCurso;
  return estado;
}

// Antes de responder cualquier pregunta sobre LAS, personas o PDV. Si ya hay datos, se responde con
// ellos al instante y, si están viejos, se refrescan en segundo plano. Solo se espera a Nutresa
// cuando no hay ningún dato (la primera vez sin respaldo).
const REINTENTO_MS = 30000;

function toca() {
  const ahora = Date.now();
  const edad = estado.ultimaOk ? ahora - new Date(estado.ultimaOk).getTime() : Infinity;
  const desdeIntento = estado.ultimoIntento ? ahora - new Date(estado.ultimoIntento).getTime() : Infinity;
  if (estado.error) return desdeIntento >= REINTENTO_MS;
  return edad >= VIGENCIA_MS;
}

async function asegurar() {
  const hayDatos = Object.keys(store.maestros().usuarios).length > 0;
  // Sin datos se espera la consulta, pero como mucho 25 s: después el LAS ve "intenta en un momento"
  // y la consulta sigue en segundo plano.
  if (!hayDatos) { await Promise.race([actualizar(), new Promise((ok) => setTimeout(ok, 25000))]); return; }
  if (toca()) actualizar().catch(() => {});
}

// Mientras no haya ningún dato (arranque sin respaldo y Nutresa caída), se insiste cada 15 s sin
// esperar a que alguien entre.
setInterval(() => {
  if (!Object.keys(store.maestros().usuarios).length && !enCurso) actualizar().catch(() => {});
}, 15000).unref();

function verEstado() {
  const m = store.maestros();
  return {
    ...estado,
    vigenciaSeg: VIGENCIA_MS / 1000,
    respaldo: store.respaldoNutresa(),
    enUso: { usuarios: Object.keys(m.usuarios).length, pdv: Object.keys(m.pdv).length },
  };
}

module.exports = { actualizar, asegurar, estado: verEstado, aUsuarios, aPdv };
