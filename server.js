// Servidor del Rutero: captura simple en campo + descarga para super usuarios.

const express = require('express');
const ExcelJS = require('exceljs');
const path = require('path');

const store = require('./lib/store');
const rutero = require('./lib/rutero');
const seg = require('./lib/seguridad');
const nutresa = require('./lib/nutresa');
const { formatoRutero } = require('./lib/formatoSalida');
const { siguienteRuta, rutasDuplicadas } = require('./lib/rutas');
const carga = require('./lib/cargaNutresa');

const PORT = process.env.PORT || 3000;
const COOKIE_ADMIN = 'rutero_admin';
const COOKIE_LAS = 'rutero_las';

const app = express();
app.disable('x-powered-by');
// En Railway las peticiones llegan por un proxy: se confía en él para saber la IP real de cada
// persona (el bloqueo por intentos fallidos es por IP) y si la conexión es HTTPS (cookie Secure).
app.set('trust proxy', process.env.RAILWAY_ENVIRONMENT || process.env.RUTERO_DETRAS_DE_PROXY ? 1 : 'loopback');
app.use(seg.cabeceras);
app.use(express.json({ limit: '2mb' }));
// App compilada con Vite (npm run build). /interno no tiene enlaces desde el sitio público.
app.use(express.static(path.join(__dirname, 'dist'), { index: 'index.html', extensions: [] }));

const sesionesAdmin = seg.crearAlmacenSesiones('admin');
const sesionesLas = seg.crearAlmacenSesiones('las');

// Lee la sesión de la cookie y, si se está usando, la renueva (vence tras 1 hora sin uso).
function sesion(req, res, almacen, nombre) {
  const token = seg.leerCookie(req, nombre);
  const datos = almacen.leer(token);
  if (!datos) return null;
  const nuevo = almacen.renovar(token);
  if (nuevo) res.setHeader('Set-Cookie', seg.cookie(req, nombre, nuevo, seg.SESION_MAX_MS / 1000));
  return datos;
}

// ---------- Super usuarios ----------

function soloSuper(req, res, next) {
  const usuario = sesion(req, res, sesionesAdmin, COOKIE_ADMIN);
  if (!usuario) return res.status(401).json({ error: 'Inicia sesión' });
  req.usuario = usuario;
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { usuario, clave } = req.body || {};
  const r = seg.intentarLogin(usuario, clave, req.ip);
  if (!r.ok) {
    const error = r.bloqueado ? 'Demasiados intentos. Espera 15 minutos.' : 'Usuario o clave incorrectos';
    return res.status(r.bloqueado ? 429 : 401).json({ error });
  }
  const token = sesionesAdmin.crear(usuario);
  res.setHeader('Set-Cookie', seg.cookie(req, COOKIE_ADMIN, token, seg.SESION_MAX_MS / 1000));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  sesionesAdmin.borrar(seg.leerCookie(req, COOKIE_ADMIN));
  res.setHeader('Set-Cookie', seg.cookie(req, COOKIE_ADMIN, '', 0));
  res.json({ ok: true });
});

app.get('/api/admin/yo', soloSuper, (req, res) => res.json({ usuario: req.usuario }));

// ---------- Ingreso de LAS (campo) ----------

function listaLas() {
  return Object.values(store.maestros().usuarios)
    .filter((u) => u.cargo.trim().toUpperCase() === 'LAS' && u.estado.trim().toUpperCase() !== 'INACTIVO')
    .map((u) => ({ id: seg.idOpaco(u.cedula), cedula: u.cedula, nombre: u.nombre.trim(), regional: u.regional.trim() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function soloLas(req, res, next) {
  const las = sesion(req, res, sesionesLas, COOKIE_LAS);
  if (!las) return res.status(401).json({ error: 'Primero elige quién eres' });
  req.las = las;
  next();
}

// Toda pregunta por LAS, personas o PDV consulta primero a Nutresa (ver lib/nutresa.js).
async function datosNutresa(req, res, next) {
  try {
    await nutresa.asegurar();
  } catch (e) {
    return next(e);
  }
  if (!Object.keys(store.maestros().usuarios).length) {
    return res.status(503).json({ error: 'Estamos trayendo los datos de Nutresa. Intenta de nuevo en un minuto.' });
  }
  next();
}

app.use(['/api/las', '/api/catalogos', '/api/persona', '/api/pdv', '/api/programacion', '/api/peticiones', '/api/borrador', '/api/admin/rutero.xlsx', '/api/admin/rutas-duplicadas', '/api/admin/carga'], datosNutresa);

// La lista pública lleva un id opaco: la cédula es la clave del LAS y nunca sale aquí.
app.get('/api/las', (req, res) => {
  res.json(listaLas().map(({ id, nombre, regional }) => ({ id, nombre, regional })));
});

// El LAS elige su nombre y escribe su cédula; solo entra si coincide con la de Nutresa.
app.post('/api/las/entrar', (req, res) => {
  const b = req.body || {};
  const las = listaLas().find((l) => l.id === String(b.id || ''));
  if (!las) return res.status(400).json({ error: 'Elige tu nombre de la lista' });
  const r = seg.intentarLoginLas(las.id, b.cedula, las.cedula, req.ip);
  if (!r.ok) {
    const error = r.bloqueado ? 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.' : 'Esa no es tu cédula. Revísala e intenta otra vez.';
    return res.status(r.bloqueado ? 429 : 401).json({ error });
  }
  const token = sesionesLas.crear(las);
  res.setHeader('Set-Cookie', seg.cookie(req, COOKIE_LAS, token, seg.SESION_MAX_MS / 1000));
  res.json({ nombre: las.nombre, regional: las.regional });
});

app.post('/api/las/salir', (req, res) => {
  sesionesLas.borrar(seg.leerCookie(req, COOKIE_LAS));
  res.setHeader('Set-Cookie', seg.cookie(req, COOKIE_LAS, '', 0));
  res.json({ ok: true });
});

app.get('/api/las/yo', soloLas, (req, res) => res.json({ nombre: req.las.nombre, regional: req.las.regional }));

// Promotores a cargo de un LAS (los de Nutresa y las personas que él pidió crear).
function equipoDe(las) {
  const ctx = store.contexto();
  return [...Object.values(ctx.usuarios), ...Object.values(ctx.usuariosNuevos)]
    .filter((u) => u.las.trim() === las.nombre && (u.cargo || 'PROMOTOR') !== 'LAS' && (u.estado || '').toUpperCase() !== 'INACTIVO')
    .map((u) => ({ cedula: u.cedula, nombre: u.nombre, nuevo: !!u.nuevo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

app.get('/api/las/equipo', soloLas, (req, res) => res.json(equipoDe(req.las)));

// Para "¿Reemplaza a alguien?": todo el equipo del LAS en Nutresa, también los inactivos (quien se va).
function reemplazablesDe(las) {
  return Object.values(store.maestros().usuarios)
    .filter((u) => u.las.trim() === las.nombre && (u.cargo || 'PROMOTOR') !== 'LAS')
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

app.get('/api/las/reemplazables', soloLas, (req, res) => {
  res.json(reemplazablesDe(req.las).map((u) => ({
    cedula: u.cedula, nombre: u.nombre.trim(), ruta: u.ruta, marca: u.marca, evento: u.evento, estado: u.estado,
  })));
});

// ---------- Captura en campo ----------

app.use(['/api/catalogos', '/api/persona', '/api/pdv', '/api/programacion', '/api/peticiones'], soloLas);

// "Hoy" en Colombia (AAAA-MM-DD). Solo se programa o modifica de mañana en adelante.
// RUTERO_HOY fija la fecha para las pruebas.
function hoy() {
  return process.env.RUTERO_HOY || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

// Índices del mes que ya no se pueden tocar (hoy y los días anteriores).
function diasCerrados(periodo) {
  const h = hoy();
  return rutero.fechasDelPeriodo(periodo).map((f) => f <= h);
}

// Eventos y marcas salen de la base de Nutresa (usuarios y PDV); si no hay, del Formato Rutero.
function eventosDisponibles() {
  const m = store.maestros();
  const deNutresa = distintos([...Object.values(m.usuarios).map((u) => u.evento), ...Object.values(m.pdv).map((p) => p.evento)]);
  return deNutresa.length ? deNutresa : m.eventos;
}

function marcasDisponibles() {
  const m = store.maestros();
  return distintos([...Object.values(m.usuarios).map((u) => u.marca), ...Object.values(m.pdv).map((p) => p.marca)]);
}

// Evento → marca según la base de usuarios de Nutresa (cada evento tiene una sola marca).
function eventoMarca() {
  const m = {};
  for (const u of Object.values(store.maestros().usuarios)) {
    const e = String(u.evento || '').trim().toUpperCase();
    const k = String(u.marca || '').trim().toUpperCase();
    if (e && e !== 'NA' && k && k !== 'NA' && !m[e]) m[e] = k;
  }
  return m;
}

// Marca → eventos permitidos, según la base de Nutresa (una marca puede tener varios eventos, p. ej.
// BENET/HAKA: NUTRICION EXPERTA y ASESORA ESTRATEGICA). Para PDV se suman las parejas de la base de PDV.
function marcaEventos(conPdv = false) {
  const m = store.maestros();
  const fuentes = conPdv ? [...Object.values(m.usuarios), ...Object.values(m.pdv)] : Object.values(m.usuarios);
  const rel = {};
  for (const u of fuentes) {
    const k = String(u.marca || '').trim().toUpperCase();
    const e = String(u.evento || '').trim().toUpperCase();
    if (!k || !e || k === 'NA' || e === 'NA') continue;
    (rel[k] = rel[k] || new Set()).add(e);
  }
  return Object.fromEntries(Object.keys(rel).sort().map((k) => [k, [...rel[k]].sort()]));
}

function parejaValida(marca, evento, conPdv) {
  return (marcaEventos(conPdv)[marca] || []).includes(evento);
}

app.get('/api/catalogos', (req, res) => {
  const m = store.maestros();
  const periodo = store.db().periodo;
  res.json({
    periodo,
    hoy: hoy(),
    fechas: periodo ? rutero.fechasDelPeriodo(periodo) : [],
    eventos: eventosDisponibles(),
    novedades: m.novedades,
    horas: m.horas,
    canales: m.canales,
    marcas: marcasDisponibles(),
    regionales: distintos([...Object.values(m.usuarios).map((u) => u.regional), ...Object.values(m.pdv).map((p) => p.regional)]),
    eventoMarca: eventoMarca(),
    marcaEventos: marcaEventos(),
    marcaEventosPdv: marcaEventos(true),
    correos: CORREOS,
    ciudades: distintos([...Object.values(m.usuarios).map((u) => u.ciudad), ...Object.values(m.pdv).map((p) => p.ciudad)]),
  });
});

function distintos(lista) {
  return [...new Set(lista.map((v) => String(v || '').trim().toUpperCase()).filter((v) => v && v !== 'NA'))].sort();
}

// Un LAS solo trabaja con su equipo: los promotores que Nutresa le asigna y las personas nuevas
// que él mismo registró.
function esDeMiEquipo(p, las) {
  return (p.las || '').trim() === las.nombre || (p.nuevo && p.registradoPor === las.nombre);
}

function noEsDeMiEquipo(res, p) {
  const suLas = (p.las || '').trim();
  return res.status(403).json({
    error: suLas
      ? `Esa persona es del equipo de ${suLas}, no del tuyo. Solo puedes programar a tus promotores.`
      : 'Esa persona no está en tu equipo. Solo puedes programar a tus promotores.',
  });
}

app.get('/api/persona/:cedula', (req, res) => {
  const cedula = String(req.params.cedula).replace(/\D/g, '');
  const p = rutero.buscarPersona(store.contexto(), cedula);
  if (!p) return res.status(404).json({ error: 'No encontramos esa cédula' });
  if (!esDeMiEquipo(p, req.las)) return noEsDeMiEquipo(res, p);
  res.json({ cedula, nombre: p.nombre, regional: p.regional, ciudad: p.ciudad, las: p.las, evento: p.evento, nuevo: !!p.nuevo });
});

function sinTildes(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

// Búsqueda desde la primera letra: primero los SAP que empiezan igual, luego los nombres que
// empiezan igual, luego los que lo contienen en cualquier parte.
app.get('/api/pdv', (req, res) => {
  const q = sinTildes(String(req.query.q || '').trim());
  if (!q) return res.json([]);
  const ctx = store.contexto();
  const grupos = [[], [], []];
  for (const p of [...Object.values(ctx.pdv), ...Object.values(ctx.pdvNuevos)]) {
    const nombre = sinTildes(p.nombre);
    if (p.sap.startsWith(q)) grupos[0].push(p);
    else if (nombre.startsWith(q)) grupos[1].push(p);
    else if (nombre.includes(q)) grupos[2].push(p);
  }
  res.json(grupos.flat().slice(0, 20));
});

app.get('/api/pdv/:sap', (req, res) => {
  const p = rutero.buscarPdv(store.contexto(), limpiarSap(req.params.sap));
  if (!p) return res.status(404).json({ error: 'No encontramos ese código SAP' });
  res.json(p);
});

// Algunos SAP de Nutresa traen sufijo con guion (12345678-12): se conservan dígitos y guion.
function limpiarSap(v) {
  return String(v || '').replace(/[^\d-]/g, '').replace(/^-+|-+$/g, '');
}

function textoLimpio(v, max = 120) {
  return String(v || '').trim().toUpperCase().slice(0, max);
}

// ---------- Peticiones (usuario, punto de venta y cambio de evento) ----------
// El LAS no crea usuarios ni PDV: deja una petición con los campos de Nutresa, la descarga en Excel
// y la envía por correo al área. Todo queda "pendiente" hasta que el área la marca cargada o devuelta.
// Una persona pedida se puede programar mientras tanto; un PDV no, hasta que llegue de Nutresa.

// A quién se envía cada archivo (se puede cambiar con variables de entorno).
const CORREOS = {
  rutero: seg.variable('CORREO_RUTERO') || 'brayan_zabala@eficacia.com.co',
  peticiones: seg.variable('CORREO_PETICIONES') || 'miguel_restrepo@eficacia.com.co',
};

const TIPO_PETICION = { usuario: 'CREACION DE USUARIO', cambio: 'CAMBIO DE EVENTO', pdv: 'CREACION DE PDV' };

const COLUMNAS_PETICION = {
  usuario: ['TELEFONO', 'CEDULA', 'REGIONAL', 'CIUDAD', 'NOMBRE', 'MARCA', 'EVENTO', 'RUTA', 'CARGO', 'LAS', 'ENVIO_CAMP', 'ESTADO', 'created'],
  pdv: ['EVENTO', 'MARCA', 'SAP', 'PDV', 'REGIONAL', 'CIUDAD', 'DIRECCION', 'CANAL', 'LATITUD', 'LONGITUD', 'GEO_OK'],
};

// Excel de peticiones con las columnas de Nutresa. Las de usuario incluyen los cambios de evento.
function libroPeticiones(tipo, lista) {
  const columnas = [
    { titulo: 'TIPO DE PETICION', valor: (p) => TIPO_PETICION[p.tipo], ancho: 22 },
    ...(tipo === 'usuario' ? [{ titulo: 'A QUIEN REEMPLAZA', valor: (p) => p.datos.REEMPLAZA || '', ancho: 34 }] : []),
    ...COLUMNAS_PETICION[tipo].map((c) => ({
      titulo: c,
      valor: (p) => (c === 'created' ? fechaRegistro(p.datos.created) : ['TELEFONO', 'CEDULA', 'SAP'].includes(c) ? numeroSiSePuede(p.datos[c]) : p.datos[c]),
      ancho: ['NOMBRE', 'LAS', 'PDV', 'DIRECCION', 'EVENTO'].includes(c) ? 32 : 16,
      formato: c === 'created' ? 'd/mm/yyyy h:mm' : undefined,
    })),
    ...(tipo === 'usuario' ? [{ titulo: 'EVENTO / MARCA ANTERIOR', valor: (p) => p.datos.ANTES || '', ancho: 34 }] : []),
    { titulo: 'PEDIDO POR (LAS)', valor: (p) => p.las, ancho: 32 },
    { titulo: 'FECHA PETICION', valor: (p) => fechaRegistro(p.creado), ancho: 18, formato: 'd/mm/yyyy h:mm' },
    { titulo: 'ESTADO EN RUTERO', valor: (p) => ESTADO_SOLICITUD[p.estado || 'pendiente'], ancho: 20 },
  ];
  return libroExcel(tipo === 'usuario' ? 'CREAR USUARIOS' : 'CREAR PDV', columnas, lista);
}

// Toda solicitud del LAS (programación o petición) pasa por el área.
const ESTADO_SOLICITUD = { pendiente: 'PENDIENTE DE CARGUE', cargada: 'CARGADA', devuelta: 'DEVUELTA' };
const SOLICITUD_NUEVA = { estado: 'pendiente', comentario: '', revisado: null, revisadoPor: '' };

function peticionPublica(p) {
  return {
    id: p.id, tipo: p.tipo, datos: p.datos, las: p.las, creado: p.creado,
    estado: p.estado || 'pendiente', comentario: p.comentario || '', revisado: p.revisado || null,
  };
}

function nuevaPeticion(tipo, datos, las) {
  return store.agregarPeticion({ id: store.nuevoId(), tipo, datos, las: las.nombre, creado: new Date().toISOString(), ...SOLICITUD_NUEVA });
}

// Las rutas que guardan son async: esperan a que la base confirme (store.confirmar) antes de responder.
// Si la base falla, el error llega aquí y el LAS ve un mensaje claro en vez de un "guardado" falso.
const guardando = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.post('/api/peticiones/usuario', guardando(async (req, res) => {
  const b = req.body || {};
  const ctx = store.contexto();
  const cedula = String(b.CEDULA || '').replace(/\D/g, '');
  const telefono = String(b.TELEFONO || '').replace(/\D/g, '');
  if (!/^\d{5,12}$/.test(cedula)) return res.status(400).json({ error: 'Escribe la cédula sin puntos (solo números).' });
  if (!/^\d{10}$/.test(telefono)) return res.status(400).json({ error: 'El teléfono debe tener 10 números.' });
  for (const c of ['NOMBRE', 'REGIONAL', 'CIUDAD', 'MARCA', 'EVENTO']) {
    if (!textoLimpio(b[c])) return res.status(400).json({ error: `Falta ${c.toLowerCase()}.` });
  }
  if (!parejaValida(textoLimpio(b.MARCA), textoLimpio(b.EVENTO))) {
    return res.status(400).json({ error: `El evento ${textoLimpio(b.EVENTO)} no pertenece a la marca ${textoLimpio(b.MARCA)}.` });
  }
  // La RUTA la genera el área. Si la persona reemplaza a alguien del equipo, se queda con su ruta.
  let reemplazado = null;
  if (b.REEMPLAZA) {
    reemplazado = reemplazablesDe(req.las).find((u) => u.cedula === String(b.REEMPLAZA).replace(/\D/g, ''));
    if (!reemplazado) return res.status(400).json({ error: 'La persona que reemplaza no está en tu equipo.' });
  }
  const existe = rutero.buscarPersona(ctx, cedula);
  if (existe) {
    return res.status(409).json({
      error: existe.nuevo
        ? `Ya hay una petición para esa cédula (la hizo ${capitalizar(existe.registradoPor)}).`
        : esDeMiEquipo(existe, req.las)
          ? 'Esa cédula ya está en tu equipo: no hace falta pedirla.'
          : `Esa cédula ya existe en el equipo de ${(existe.las || 'otro LAS').trim()}.`,
    });
  }
  const datos = {
    TELEFONO: telefono, CEDULA: cedula, REGIONAL: textoLimpio(b.REGIONAL), CIUDAD: textoLimpio(b.CIUDAD),
    NOMBRE: textoLimpio(b.NOMBRE), MARCA: textoLimpio(b.MARCA), EVENTO: textoLimpio(b.EVENTO),
    CARGO: textoLimpio(b.CARGO, 30) || 'PROMOTOR', LAS: req.las.nombre,
    ENVIO_CAMP: b.ENVIO_CAMP === 'NO ENVIO' ? 'NO ENVIO' : 'ENVIO', ESTADO: 'ACTIVO', created: new Date().toISOString(),
    // Quien sale debe quedar inactivo: así la ruta heredada no queda repetida entre activos.
    REEMPLAZA: reemplazado
      ? `${reemplazado.nombre.trim()} (C.C. ${reemplazado.cedula})${/INACTIVO/i.test(reemplazado.estado) ? '' : ' - INACTIVAR'}`
      : '',
    REEMPLAZA_CEDULA: reemplazado ? reemplazado.cedula : '',
  };
  // Ruta: la de quien sale, o una nueva y única (evento + regional + siguiente número).
  datos.RUTA = reemplazado ? reemplazado.ruta : siguienteRuta({
    evento: datos.EVENTO, regional: datos.REGIONAL, usuarios: Object.values(store.maestros().usuarios), peticiones: store.db().peticiones,
  });
  // Mientras Nutresa la crea, la persona ya se puede programar (store la toma de esta petición).
  const pet = nuevaPeticion('usuario', datos, req.las);
  await store.confirmar();
  res.json(peticionPublica(pet));
}));

app.post('/api/peticiones/pdv', guardando(async (req, res) => {
  const b = req.body || {};
  const ctx = store.contexto();
  const sap = limpiarSap(b.SAP);
  if (!sap) return res.status(400).json({ error: 'Escribe el código SAP.' });
  for (const c of ['PDV', 'REGIONAL', 'CIUDAD', 'DIRECCION', 'CANAL', 'EVENTO', 'MARCA']) {
    if (!textoLimpio(b[c])) return res.status(400).json({ error: `Falta ${c === 'PDV' ? 'el nombre del punto de venta' : c.toLowerCase()}.` });
  }
  if (!parejaValida(textoLimpio(b.MARCA), textoLimpio(b.EVENTO), true)) {
    return res.status(400).json({ error: `El evento ${textoLimpio(b.EVENTO)} no pertenece a la marca ${textoLimpio(b.MARCA)}.` });
  }
  if (rutero.buscarPdv(ctx, sap)) return res.status(409).json({ error: 'Ese SAP ya existe: búscalo al crear el rutero.' });
  const db = store.db();
  if (db.peticiones.some((p) => p.tipo === 'pdv' && p.datos.SAP === sap)) return res.status(409).json({ error: 'Ya hay una petición para ese SAP.' });
  const datos = {
    EVENTO: textoLimpio(b.EVENTO), MARCA: textoLimpio(b.MARCA), SAP: sap, PDV: textoLimpio(b.PDV),
    REGIONAL: textoLimpio(b.REGIONAL), CIUDAD: textoLimpio(b.CIUDAD), DIRECCION: textoLimpio(b.DIRECCION),
    // Los LAS no van a los PDV: la petición va sin geolocalización.
    CANAL: textoLimpio(b.CANAL), LATITUD: 'SIN GEO', LONGITUD: 'SIN GEO', GEO_OK: 'NA',
  };
  const pet = nuevaPeticion('pdv', datos, req.las);
  await store.confirmar();
  res.json(peticionPublica(pet));
}));

function peticionesDe(las) {
  return store.db().peticiones.filter((p) => p.las === las.nombre);
}

app.get('/api/peticiones', (req, res) => {
  res.json(peticionesDe(req.las).map(peticionPublica).reverse());
});

// Excel de las peticiones del LAS para enviarlo al área (usuario incluye los cambios de evento).
app.get('/api/peticiones/:tipo.xlsx', async (req, res) => {
  const tipo = req.params.tipo;
  if (!COLUMNAS_PETICION[tipo]) return res.status(404).end();
  const lista = peticionesDe(req.las).filter((p) => (tipo === 'usuario' ? p.tipo !== 'pdv' : p.tipo === 'pdv'));
  const nombre = `${tipo === 'usuario' ? 'Peticiones de usuario' : 'Peticiones de punto de venta'} - ${capitalizar(req.las.nombre)}.xlsx`;
  await responderLibro(res, nombre, libroPeticiones(tipo, lista));
});

// ---------- Borrador de "Crear rutero" (sigue al LAS en cualquier navegador o celular) ----------
// Uno por LAS y por mes. Vence a las 72 horas. Al registrar o al "Empezar de nuevo" se agrega un
// borrador terminado (la base no permite borrar).
const BORRADOR_VIGENCIA_MS = 72 * 60 * 60 * 1000;

function campos(o, lista) {
  return o && typeof o === 'object' ? Object.fromEntries(lista.map((k) => [k, typeof o[k] === 'string' || typeof o[k] === 'boolean' ? o[k] : ''])) : null;
}

app.get('/api/borrador', soloLas, guardando(async (req, res) => {
  const b = await store.borrador(req.las.nombre);
  const vigente = b && !b.terminado && b.persona && b.periodo === store.db().periodo
    && Date.now() - new Date(b.guardado).getTime() < BORRADOR_VIGENCIA_MS;
  if (!vigente) return res.json(null);
  // Solo si la persona sigue en el equipo de este LAS.
  const persona = rutero.buscarPersona(store.contexto(), b.persona.cedula);
  if (!persona || !esDeMiEquipo(persona, req.las)) return res.json(null);
  res.json({ paso: b.paso, persona: b.persona, pdv: b.pdv, evento: b.evento, dias: b.dias, guardado: b.guardado });
}));

app.put('/api/borrador', soloLas, guardando(async (req, res) => {
  const b = req.body || {};
  const persona = campos(b.persona, ['cedula', 'nombre', 'ciudad', 'regional', 'las', 'evento', 'nuevo']);
  if (!persona || !/^\d{5,15}$/.test(persona.cedula)) return res.status(400).json({ error: 'Borrador sin persona' });
  const p = rutero.buscarPersona(store.contexto(), persona.cedula);
  if (!p || !esDeMiEquipo(p, req.las)) return noEsDeMiEquipo(res, p || {});
  const dias = Array.isArray(b.dias) && b.dias.length === rutero.DIAS_DEL_FORMATO
    ? b.dias.map((d) => (d && d.novedad && store.maestros().novedades.includes(d.novedad) ? { novedad: d.novedad }
      : d && HORA.test(d.inicio) && HORA.test(d.fin) ? { inicio: d.inicio, fin: d.fin } : null))
    : Array(rutero.DIAS_DEL_FORMATO).fill(null);
  store.guardarBorrador(req.las.nombre, {
    periodo: store.db().periodo,
    paso: Math.min(Math.max(Number(b.paso) || 1, 1), 5),
    persona,
    pdv: campos(b.pdv, ['sap', 'nombre', 'ciudad', 'canal', 'direccion', 'regional']),
    evento: eventosDisponibles().includes(b.evento) ? b.evento : '',
    dias,
  });
  await store.confirmar();
  res.json({ ok: true });
}));

app.post('/api/borrador/terminar', soloLas, guardando(async (req, res) => {
  const b = await store.borrador(req.las.nombre);
  if (b && !b.terminado) {
    store.guardarBorrador(req.las.nombre, { periodo: store.db().periodo, terminado: true });
    await store.confirmar();
  }
  res.json({ ok: true });
}));

function capitalizar(t) {
  return String(t || '').toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function validarDias(dias, novedades) {
  if (!Array.isArray(dias) || dias.length !== rutero.DIAS_DEL_FORMATO) return null;
  return dias.map((d) => {
    if (!d) return null;
    if (d.novedad) return novedades.includes(d.novedad) ? { novedad: d.novedad } : null;
    if (HORA.test(d.inicio) && HORA.test(d.fin) && rutero.minutos(d.fin) > rutero.minutos(d.inicio)) {
      return { inicio: d.inicio, fin: d.fin };
    }
    return null;
  });
}

// Lo que la persona ya tiene programado este mes, día por día (para el calendario y los choques).
// `excluir` deja por fuera la programación que se está modificando.
function agenda(cedula, excluir) {
  const ctx = store.contexto();
  const out = [];
  for (const p of store.db().programaciones) {
    if (p.cedula !== cedula || p.id === excluir) continue;
    const pdv = rutero.buscarPdv(ctx, p.sap);
    p.dias.forEach((d, i) => {
      if (d && !d.cancelada) out.push({ dia: i, id: p.id, sap: p.sap, pdv: pdv ? pdv.nombre : p.sap, evento: p.evento, ...d });
    });
  }
  return out;
}

// Un día choca si la persona ya trabaja a una hora que se cruza (en esta u otra tienda), o si ese
// día ya tiene una novedad (vacaciones, incapacidad…) y aquí la ponen a trabajar.
function cruces(cedula, dias, excluir) {
  const out = [];
  for (const o of agenda(cedula, excluir)) {
    const d = dias[o.dia];
    if (!d || !d.inicio) continue;
    const seCruza = o.novedad
      || (rutero.minutos(d.inicio) < rutero.minutos(o.fin) && rutero.minutos(o.inicio) < rutero.minutos(d.fin));
    if (seCruza) out.push(o);
  }
  return out;
}

// Una persona tiene un solo evento por día: devuelve los otros eventos que ya tiene esos días.
function eventosEnConflicto(cedula, dias, evento, excluir) {
  const porEvento = new Map();
  for (const o of agenda(cedula, excluir)) {
    if (!dias[o.dia] || o.evento === evento) continue;
    if (!porEvento.has(o.evento)) porEvento.set(o.evento, { evento: o.evento, dias: new Set(), ids: new Set() });
    porEvento.get(o.evento).dias.add(o.dia);
    porEvento.get(o.evento).ids.add(o.id);
  }
  return [...porEvento.values()].map((e) => ({ evento: e.evento, dias: [...e.dias].sort((a, b) => a - b), ids: [...e.ids] }));
}

// Cambia el evento de una programación solo de mañana en adelante: si ya tiene días pasados,
// esos se quedan con su evento y los días futuros pasan a una programación nueva.
function cambiarEvento(prog, evento, cerrados, las) {
  const pasados = prog.dias.some((d, i) => d && cerrados[i]);
  const marca = eventoMarca()[evento] || '';
  if (!pasados) return store.versionarProgramacion(prog.id, { evento, marca, ...SOLICITUD_NUEVA });
  const futuros = prog.dias.map((d, i) => (cerrados[i] ? null : d));
  store.versionarProgramacion(prog.id, { dias: prog.dias.map((d, i) => (cerrados[i] ? d : null)), ...SOLICITUD_NUEVA });
  if (!futuros.some(Boolean)) return null;
  return store.agregarProgramacion({
    id: store.nuevoId(), sap: prog.sap, cedula: prog.cedula, evento, marca, dias: futuros, origen: 'web',
    registradoPor: las.nombre, creado: new Date().toISOString(), separadaDe: prog.id, ...SOLICITUD_NUEVA,
  });
}

app.get('/api/persona/:cedula/agenda', (req, res) => {
  const cedula = String(req.params.cedula).replace(/\D/g, '');
  const p = rutero.buscarPersona(store.contexto(), cedula);
  if (!p) return res.status(404).json({ error: 'No encontramos esa cédula' });
  if (!esDeMiEquipo(p, req.las)) return noEsDeMiEquipo(res, p);
  res.json(agenda(cedula, String(req.query.excluir || '')));
});

// Revisa días, choques y evento. Devuelve { error } con su código HTTP, o { dias } si todo está bien.
function revisarProgramacion({ cedula, evento, dias: crudos, excluir, unificarEvento, cerrados }) {
  const ctx = store.contexto();
  if (!eventosDisponibles().includes(evento)) return { codigo: 400, cuerpo: { error: 'Elige un evento de la lista' } };
  const dias = validarDias(crudos, ctx.novedades);
  if (!dias) return { codigo: 400, cuerpo: { error: 'Los días no son válidos' } };
  if (!dias.some(Boolean)) return { codigo: 400, cuerpo: { error: 'Marca al menos un día' } };
  // Una persona no puede estar en dos sitios a la misma hora: no se guarda.
  const choques = cruces(cedula, dias, excluir).filter((o) => !cerrados[o.dia]);
  if (choques.length) return { codigo: 409, cuerpo: { error: 'cruce', cruces: choques } };
  const otros = eventosEnConflicto(cedula, dias, evento, excluir);
  if (otros.length && !unificarEvento) return { codigo: 409, cuerpo: { error: 'evento', eventos: otros.map(({ evento: e, dias: d }) => ({ evento: e, dias: d })) } };
  return { dias, otros };
}

function unificar(otros, evento, cerrados, las) {
  const ids = new Set(otros.flatMap((o) => o.ids));
  for (const id of ids) cambiarEvento(store.programacion(id), evento, cerrados, las);
}

// Si la persona queda en un evento distinto al de la base, su marca también cambia: eso lo hace el
// área, así que se deja una petición de cambio (una sola por persona y evento).
function pedirCambioDeEvento(persona, evento, las) {
  const base = String(persona.evento || '').trim().toUpperCase();
  if (!base || base === 'NA' || base === evento) return null;
  const ya = store.db().peticiones.some((p) => p.tipo === 'cambio' && p.datos.CEDULA === persona.cedula && p.datos.EVENTO === evento && p.estado !== 'devuelta');
  if (ya) return null;
  const pet = nuevaPeticion('cambio', {
    TELEFONO: persona.telefono || '', CEDULA: persona.cedula, REGIONAL: persona.regional || '', CIUDAD: persona.ciudad || '',
    NOMBRE: persona.nombre, MARCA: eventoMarca()[evento] || '', EVENTO: evento, RUTA: persona.ruta || '',
    CARGO: persona.cargo || 'PROMOTOR', LAS: las.nombre, ENVIO_CAMP: '', ESTADO: persona.estado || 'ACTIVO',
    created: new Date().toISOString(), ANTES: `${base} / ${String(persona.marca || '').trim().toUpperCase()}`,
  }, las);
  return pet;
}

app.post('/api/programacion', guardando(async (req, res) => {
  const b = req.body || {};
  const ctx = store.contexto();
  const db = store.db();
  if (!db.periodo) return res.status(400).json({ error: 'No hay un mes abierto para programar' });
  const cedula = String(b.cedula || '').replace(/\D/g, '');
  const sap = limpiarSap(b.sap);
  const persona = rutero.buscarPersona(ctx, cedula);
  if (!persona) return res.status(400).json({ error: 'La cédula no está registrada' });
  if (!esDeMiEquipo(persona, req.las)) return noEsDeMiEquipo(res, persona);
  if (!rutero.buscarPdv(ctx, sap)) return res.status(400).json({ error: 'El PDV no está registrado' });
  const cerrados = diasCerrados(db.periodo);
  if (Array.isArray(b.dias) && b.dias.some((d, i) => d && cerrados[i])) {
    return res.status(400).json({ error: 'Solo puedes programar de mañana en adelante.' });
  }
  const r = revisarProgramacion({ cedula, evento: b.evento, dias: b.dias, unificarEvento: b.unificarEvento, cerrados });
  if (r.codigo) return res.status(r.codigo).json(r.cuerpo);
  if (r.otros.length) unificar(r.otros, b.evento, cerrados, req.las);

  const prog = store.agregarProgramacion({
    id: store.nuevoId(), sap, cedula, evento: b.evento, marca: eventoMarca()[b.evento] || '', dias: r.dias, origen: 'web',
    registradoPor: req.las.nombre, creado: new Date().toISOString(), ...SOLICITUD_NUEVA,
  });
  const cambio = pedirCambioDeEvento(persona, b.evento, req.las);
  await store.confirmar();
  res.json({ ok: true, id: prog.id, panel: rutero.calcularPanel(ctx, prog), cambio: !!cambio });
}));

// Programación de este LAS (o error ya respondido).
function miProgramacion(req, res) {
  const prog = store.programacion(String(req.params.id));
  if (!prog) { res.status(404).json({ error: 'Esa programación ya no existe' }); return null; }
  const persona = rutero.buscarPersona(store.contexto(), prog.cedula);
  if (!persona || !esDeMiEquipo(persona, req.las)) { noEsDeMiEquipo(res, persona || {}); return null; }
  return prog;
}

// Modificar: solo cambian los días de mañana en adelante; hoy y los días pasados se copian tal cual.
app.put('/api/programacion/:id', guardando(async (req, res) => {
  const prog = miProgramacion(req, res);
  if (!prog) return;
  const b = req.body || {};
  const cerrados = diasCerrados(store.db().periodo);
  const pedidos = Array.isArray(b.dias) ? b.dias : [];
  const futuros = pedidos.map((d, i) => (cerrados[i] ? null : d));
  const r = revisarProgramacion({ cedula: prog.cedula, evento: b.evento, dias: futuros, excluir: prog.id, unificarEvento: b.unificarEvento, cerrados });
  // "Marca al menos un día" no aplica si los días pasados ya tienen algo.
  if (r.codigo && !(r.cuerpo.error === 'Marca al menos un día' && prog.dias.some((d, i) => d && cerrados[i]))) {
    return res.status(r.codigo).json(r.cuerpo);
  }
  const nuevos = r.dias || futuros.map(() => null);
  if (r.otros && r.otros.length) unificar(r.otros, b.evento, cerrados, req.las);
  const dias = prog.dias.map((d, i) => (cerrados[i] ? d : nuevos[i]));
  const marca = eventoMarca()[b.evento] || '';
  let final;
  if (b.evento !== prog.evento && prog.dias.some((d, i) => d && cerrados[i])) {
    // El evento de los días que ya pasaron no se cambia: los días futuros van en una programación nueva.
    store.versionarProgramacion(prog.id, { dias: prog.dias.map((d, i) => (cerrados[i] ? d : null)), ...SOLICITUD_NUEVA });
    final = store.agregarProgramacion({
      id: store.nuevoId(), sap: prog.sap, cedula: prog.cedula, evento: b.evento, marca, dias: dias.map((d, i) => (cerrados[i] ? null : d)),
      origen: 'web', registradoPor: req.las.nombre, creado: new Date().toISOString(), separadaDe: prog.id, ...SOLICITUD_NUEVA,
    });
  } else {
    final = store.versionarProgramacion(prog.id, { evento: b.evento, marca, dias, modificadoPor: req.las.nombre, ...SOLICITUD_NUEVA });
  }
  const persona = rutero.buscarPersona(store.contexto(), prog.cedula);
  const cambio = pedirCambioDeEvento(persona, b.evento, req.las);
  await store.confirmar();
  res.json({ ok: true, id: final.id, panel: rutero.calcularPanel(store.contexto(), final), cambio: !!cambio });
}));

// Cancelar desde mañana: los días de trabajo futuros quedan CANCELADA (motivo "CANCELADA POR LAS").
app.post('/api/programacion/:id/cancelar', guardando(async (req, res) => {
  const prog = miProgramacion(req, res);
  if (!prog) return;
  const cerrados = diasCerrados(store.db().periodo);
  // Las novedades (vacaciones, incapacidad…) se conservan: siguen siendo el motivo de ese día.
  const dias = prog.dias.map((d, i) => (cerrados[i] || !d || d.novedad ? d : { cancelada: true }));
  store.versionarProgramacion(prog.id, { dias, modificadoPor: req.las.nombre, ...SOLICITUD_NUEVA });
  await store.confirmar();
  res.json({ ok: true });
}));

// ---------- Rutero del LAS (actualizar, validar y descargar el formato) ----------

function programacionesDe(las) {
  const cedulas = new Set(equipoDe(las).map((p) => p.cedula));
  return store.db().programaciones.filter((p) => cedulas.has(p.cedula));
}

app.get('/api/las/rutero', soloLas, (req, res) => {
  const ctx = store.contexto();
  const db = store.db();
  const equipo = equipoDe(req.las);
  const progs = programacionesDe(req.las);
  const porPersona = new Map();
  for (const p of progs) {
    const pdv = rutero.buscarPdv(ctx, p.sap);
    if (!porPersona.has(p.cedula)) porPersona.set(p.cedula, []);
    porPersona.get(p.cedula).push({
      id: p.id, sap: p.sap, pdv: pdv ? pdv.nombre : p.sap, ciudad: pdv ? pdv.ciudad : '', evento: p.evento, dias: p.dias,
      horas: rutero.calcularPanel(ctx, p).horasProgramadas, creado: p.creado, modificado: p.modificado || null,
      estado: p.estado || 'pendiente', comentario: p.comentario || '', revisado: p.revisado || null,
    });
  }
  res.json({
    periodo: db.periodo,
    hoy: hoy(),
    fechas: db.periodo ? rutero.fechasDelPeriodo(db.periodo) : [],
    programados: equipo.filter((p) => porPersona.has(p.cedula)).map((p) => ({ ...p, programaciones: porPersona.get(p.cedula) })),
    sinProgramar: equipo.filter((p) => !porPersona.has(p.cedula)),
  });
});

// Formato Rutero (el Excel con que trabajaban: PANEL, CREAR USUARIOS y CREAR PDV) para enviarlo al área.
app.get('/api/las/formato.xlsx', soloLas, async (req, res) => {
  const db = store.db();
  const wb = await formatoRutero({
    ctx: store.contexto(),
    periodo: db.periodo,
    programaciones: programacionesDe(req.las).filter((p) => p.estado !== 'devuelta'),
    peticiones: peticionesDe(req.las).filter((p) => p.estado !== 'devuelta'),
    eventos: eventosDisponibles(),
  });
  await responderLibro(res, nombreFormato(req.las.nombre, db.periodo), wb);
});

function nombreFormato(nombreLas, periodo) {
  const mes = periodo ? new Date(`${periodo}T12:00:00Z`).toLocaleString('es-CO', { month: 'long', timeZone: 'UTC' }).toUpperCase() : '';
  return `Formato_Rutero ${mes} - ${capitalizar(nombreLas)}.xlsx`;
}

// ---------- Área interna ----------

app.get('/api/admin/resumen', soloSuper, (req, res) => {
  const db = store.db();
  res.json({
    periodo: db.periodo,
    programaciones: db.programaciones.filter((p) => p.estado !== 'devuelta').length,
    pendientes: db.programaciones.filter((p) => (p.estado || 'pendiente') === 'pendiente').length + db.peticiones.filter((p) => (p.estado || 'pendiente') === 'pendiente').length,
    las: new Set(db.programaciones.map((p) => p.registradoPor).filter(Boolean)).size,
    filasRutero: db.periodo ? db.programaciones.filter((p) => p.estado !== 'devuelta').length * rutero.DIAS_DEL_FORMATO : 0,
    peticionesUsuario: db.peticiones.filter((p) => p.tipo !== 'pdv').length,
    peticionesPdv: db.peticiones.filter((p) => p.tipo === 'pdv').length,
    maestros: nutresa.estado(),
  });
});

// Vuelve a traer usuarios y PDV de la API de Nutresa sin esperar al siguiente ciclo.
app.post('/api/admin/actualizar-maestros', soloSuper, async (req, res) => {
  res.json(await nutresa.actualizar().then(() => nutresa.estado()));
});

// Comprobación: rutas que comparten personas activas (base de Nutresa + peticiones vigentes).
app.get('/api/admin/rutas-duplicadas', soloSuper, (req, res) => {
  res.json(rutasDuplicadas(Object.values(store.maestros().usuarios), store.db().peticiones));
});

// Peticiones de los LAS (usuario incluye los cambios de evento).
app.get('/api/admin/peticiones', soloSuper, (req, res) => {
  const lista = store.db().peticiones.map(peticionPublica).reverse();
  res.json({ usuario: lista.filter((p) => p.tipo !== 'pdv'), pdv: lista.filter((p) => p.tipo === 'pdv') });
});

app.get('/api/admin/peticiones-:tipo.xlsx', soloSuper, async (req, res) => {
  const tipo = req.params.tipo;
  if (!COLUMNAS_PETICION[tipo]) return res.status(404).end();
  const nombre = `${tipo === 'usuario' ? 'Peticiones de usuario' : 'Peticiones de punto de venta'} ${store.db().periodo || ''}.xlsx`;
  await responderLibro(res, nombre, libroPeticiones(tipo, store.db().peticiones.filter((p) => (tipo === 'usuario' ? p.tipo !== 'pdv' : p.tipo === 'pdv'))));
});

// Revisión del área: "cargada" (ya está en el sistema) o "devuelta" (con comentario para el LAS).
function revision(req, res) {
  const estado = String((req.body || {}).estado || '');
  const comentario = String((req.body || {}).comentario || '').trim().slice(0, 500);
  if (!['cargada', 'devuelta', 'pendiente'].includes(estado)) { res.status(400).json({ error: 'Estado no válido' }); return null; }
  if (estado === 'devuelta' && !comentario) { res.status(400).json({ error: 'Escribe por qué se devuelve' }); return null; }
  return { estado, comentario: estado === 'devuelta' ? comentario : '', revisado: new Date().toISOString(), revisadoPor: req.usuario };
}

app.post('/api/admin/peticiones/:id/estado', soloSuper, guardando(async (req, res) => {
  if (!store.peticion(req.params.id)) return res.status(404).json({ error: 'No existe esa petición' });
  const r = revision(req, res);
  if (!r) return;
  const pet = store.versionarPeticion(req.params.id, r);
  await store.confirmar();
  res.json(peticionPublica(pet));
}));

// ---------- Carga directa a Nutresa (solo área interna) ----------
// Agrega un usuario o un PDV NUEVO a usuarios_nutresa / pdv_nutresa (ver lib/cargaNutresa.js).
// Nunca edita ni borra: una cédula o un SAP que ya exista se rechaza.

const ESTADOS_USUARIO = ['ACTIVO', 'INACTIVO'];
const CARGOS = ['PROMOTOR', 'LAS'];
const ENVIOS = ['ENVIO', 'NO ENVIO'];

app.get('/api/admin/carga/catalogos', soloSuper, (req, res) => {
  const m = store.maestros();
  res.json({
    habilitada: carga.habilitada(),
    simulada: store.modo !== 'api',
    colecciones: carga.COLECCIONES,
    marcaEventos: marcaEventos(),
    marcaEventosPdv: marcaEventos(true),
    regionales: distintos([...Object.values(m.usuarios).map((u) => u.regional), ...Object.values(m.pdv).map((p) => p.regional)]),
    ciudades: distintos([...Object.values(m.usuarios).map((u) => u.ciudad), ...Object.values(m.pdv).map((p) => p.ciudad)]),
    canales: distintos([...(m.canales || []), ...Object.values(m.pdv).map((p) => p.canal)]),
    las: listaLas().map((l) => l.nombre),
    cargos: CARGOS, estados: ESTADOS_USUARIO, envios: ENVIOS,
    pendientes: store.db().peticiones.filter((p) => (p.estado || 'pendiente') === 'pendiente' && p.tipo !== 'cambio').map(peticionPublica).reverse(),
  });
});

// Ruta sugerida (evento + regional + siguiente número), la misma regla de las peticiones.
app.get('/api/admin/carga/ruta', soloSuper, (req, res) => {
  const evento = textoLimpio(req.query.evento);
  const regional = textoLimpio(req.query.regional);
  if (!evento || !regional) return res.json({ ruta: '' });
  res.json({ ruta: siguienteRuta({ evento, regional, usuarios: Object.values(store.maestros().usuarios), peticiones: store.db().peticiones }) });
});

function cargaApagada(res) {
  if (carga.habilitada()) return false;
  res.status(403).json({ error: 'La carga directa a Nutresa está apagada. Actívala con RUTERO_CARGA_NUTRESA=si.' });
  return true;
}

// Si viene de una petición de un LAS, al cargarla queda marcada "cargada".
function cerrarPeticion(id, req, tipo) {
  const p = id && store.peticion(String(id));
  if (!p || (tipo === 'pdv') !== (p.tipo === 'pdv')) return null;
  return store.versionarPeticion(p.id, { estado: 'cargada', comentario: '', revisado: new Date().toISOString(), revisadoPor: req.usuario, cargadaEnNutresa: true });
}

app.post('/api/admin/carga/usuario', soloSuper, guardando(async (req, res) => {
  if (cargaApagada(res)) return;
  const b = req.body || {};
  const cedula = String(b.CEDULA || '').replace(/\D/g, '');
  const telefono = String(b.TELEFONO || '').replace(/\D/g, '');
  if (!/^\d{5,12}$/.test(cedula)) return res.status(400).json({ error: 'Escribe la cédula sin puntos (solo números).', campo: 'CEDULA' });
  if (!/^\d{7,10}$/.test(telefono)) return res.status(400).json({ error: 'El teléfono debe tener entre 7 y 10 números.', campo: 'TELEFONO' });
  for (const c of ['NOMBRE', 'REGIONAL', 'CIUDAD', 'MARCA', 'EVENTO', 'RUTA', 'LAS']) {
    if (!textoLimpio(b[c])) return res.status(400).json({ error: `Falta ${c.toLowerCase()}.`, campo: c });
  }
  const datos = {
    TELEFONO: Number(telefono), CEDULA: Number(cedula),
    REGIONAL: textoLimpio(b.REGIONAL), CIUDAD: textoLimpio(b.CIUDAD), NOMBRE: textoLimpio(b.NOMBRE),
    MARCA: textoLimpio(b.MARCA), EVENTO: textoLimpio(b.EVENTO), RUTA: textoLimpio(b.RUTA, 20).replace(/\s/g, ''),
    CARGO: CARGOS.includes(textoLimpio(b.CARGO)) ? textoLimpio(b.CARGO) : 'PROMOTOR',
    LAS: textoLimpio(b.LAS),
    ENVIO_CAMP: ENVIOS.includes(textoLimpio(b.ENVIO_CAMP)) ? textoLimpio(b.ENVIO_CAMP) : 'ENVIO',
    ESTADO: ESTADOS_USUARIO.includes(textoLimpio(b.ESTADO)) ? textoLimpio(b.ESTADO) : 'ACTIVO',
  };
  if (!parejaValida(datos.MARCA, datos.EVENTO)) {
    return res.status(400).json({ error: `El evento ${datos.EVENTO} no pertenece a la marca ${datos.MARCA}.`, campo: 'EVENTO' });
  }
  const usuarios = store.maestros().usuarios;
  if (usuarios[cedula]) return res.status(409).json({ error: `Esa cédula ya está en Nutresa (${capitalizar(usuarios[cedula].nombre)}). Rutero no edita registros.`, campo: 'CEDULA' });
  // Una ruta en otra persona activa se avisa; se puede seguir (p. ej. un reemplazo) confirmando.
  const conRuta = Object.values(usuarios).find((u) => u.ruta.toUpperCase() === datos.RUTA && !/INACTIVO/i.test(u.estado));
  if (conRuta && !b.confirmarRuta) {
    return res.status(409).json({ error: `La ruta ${datos.RUTA} ya está en ${capitalizar(conRuta.nombre)}, que sigue activa.`, campo: 'RUTA', ruta: true });
  }
  const id = await carga.cargar('usuario', datos);
  const pet = cerrarPeticion(b.peticion, req, 'usuario');
  if (pet) await store.confirmar();
  console.log(`Carga a Nutresa: usuario ${datos.RUTA} por ${req.usuario}.`);
  res.json({ ok: true, id, datos, peticion: pet ? peticionPublica(pet) : null });
}));

app.post('/api/admin/carga/pdv', soloSuper, guardando(async (req, res) => {
  if (cargaApagada(res)) return;
  const b = req.body || {};
  const sap = limpiarSap(b.SAP);
  if (!sap) return res.status(400).json({ error: 'Escribe el código SAP.', campo: 'SAP' });
  for (const c of ['PDV', 'REGIONAL', 'CIUDAD', 'DIRECCION', 'CANAL', 'MARCA', 'EVENTO']) {
    if (!textoLimpio(b[c])) return res.status(400).json({ error: `Falta ${c === 'PDV' ? 'el nombre del punto de venta' : c.toLowerCase()}.`, campo: c });
  }
  const coord = (v) => {
    const t = String(v || '').trim().replace(',', '.');
    return /^-?\d{1,3}(\.\d+)?$/.test(t) ? t : '';
  };
  const lat = coord(b.LATITUD);
  const lon = coord(b.LONGITUD);
  if ((lat && Math.abs(Number(lat)) > 90) || (lon && Math.abs(Number(lon)) > 180)) {
    return res.status(400).json({ error: 'Latitud o longitud fuera de rango.', campo: 'LATITUD' });
  }
  const conGeo = !!(lat && lon);
  const datos = {
    EVENTO: textoLimpio(b.EVENTO), MARCA: textoLimpio(b.MARCA), SAP: numeroSiSePuede(sap), PDV: textoLimpio(b.PDV),
    REGIONAL: textoLimpio(b.REGIONAL), CIUDAD: textoLimpio(b.CIUDAD), DIRECCION: textoLimpio(b.DIRECCION),
    CANAL: textoLimpio(b.CANAL),
    LATITUD: conGeo ? lat : 'SIN GEO', LONGITUD: conGeo ? lon : 'SIN GEO', GEO_OK: conGeo ? 'OK' : 'NA',
  };
  if (!parejaValida(datos.MARCA, datos.EVENTO, true)) {
    return res.status(400).json({ error: `El evento ${datos.EVENTO} no pertenece a la marca ${datos.MARCA}.`, campo: 'EVENTO' });
  }
  const ya = store.maestros().pdv[sap];
  if (ya) return res.status(409).json({ error: `Ese SAP ya está en Nutresa (${ya.nombre}). Rutero no edita registros.`, campo: 'SAP' });
  const id = await carga.cargar('pdv', datos);
  const pet = cerrarPeticion(b.peticion, req, 'pdv');
  if (pet) await store.confirmar();
  console.log(`Carga a Nutresa: PDV ${sap} por ${req.usuario}.`);
  res.json({ ok: true, id, datos, peticion: pet ? peticionPublica(pet) : null });
}));

// Solicitudes de rutero agrupadas por LAS, con lo que hace falta para revisarlas.
app.get('/api/admin/solicitudes', soloSuper, (req, res) => {
  const ctx = store.contexto();
  const porLas = new Map();
  for (const p of store.db().programaciones) {
    const per = rutero.buscarPersona(ctx, p.cedula) || {};
    const pdv = rutero.buscarPdv(ctx, p.sap) || {};
    const las = (per.las || p.registradoPor || 'SIN LAS').trim();
    if (!porLas.has(las)) porLas.set(las, []);
    porLas.get(las).push({
      id: p.id, cedula: p.cedula, persona: per.nombre || p.cedula, sap: p.sap, pdv: pdv.nombre || p.sap, evento: p.evento,
      marca: p.marca || eventoMarca()[p.evento] || '', dias: p.dias, horas: rutero.calcularPanel(ctx, p).horasProgramadas,
      estado: p.estado || 'pendiente', comentario: p.comentario || '', creado: p.creado, modificado: p.modificado || null,
    });
  }
  res.json({
    fechas: store.db().periodo ? rutero.fechasDelPeriodo(store.db().periodo) : [],
    las: [...porLas.entries()].map(([nombre, lista]) => ({
      nombre,
      pendientes: lista.filter((x) => x.estado === 'pendiente').length,
      cargadas: lista.filter((x) => x.estado === 'cargada').length,
      devueltas: lista.filter((x) => x.estado === 'devuelta').length,
      ultima: lista.map((x) => x.modificado || x.creado).sort().at(-1),
      programaciones: lista,
    })).sort((a, b) => b.pendientes - a.pendientes || a.nombre.localeCompare(b.nombre, 'es')),
  });
});

app.post('/api/admin/programacion/:id/estado', soloSuper, guardando(async (req, res) => {
  if (!store.programacion(req.params.id)) return res.status(404).json({ error: 'Esa programación ya no existe' });
  const r = revision(req, res);
  if (!r) return;
  store.versionarProgramacion(req.params.id, r);
  await store.confirmar();
  res.json({ ok: true });
}));

// "Marcar todo lo pendiente de este LAS como cargado".
app.post('/api/admin/solicitudes/cargar', soloSuper, guardando(async (req, res) => {
  const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.map(String) : [];
  const r = { estado: 'cargada', comentario: '', revisado: new Date().toISOString(), revisadoPor: req.usuario };
  let n = 0;
  for (const id of ids) {
    const p = store.programacion(id);
    if (p && (p.estado || 'pendiente') === 'pendiente') { store.versionarProgramacion(id, r); n++; }
  }
  await store.confirmar();
  res.json({ ok: true, cargadas: n });
}));

// Excel no maneja zonas horarias: se escribe la hora local del servidor (Colombia) tal cual.
function fechaRegistro(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
}

function libroExcel(hoja, columnas, filas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja);
  ws.addRow(columnas.map((c) => c.titulo));
  ws.getRow(1).font = { bold: true };
  filas.forEach((f) => ws.addRow(columnas.map((c) => c.valor(f))));
  columnas.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.ancho || 18;
    if (c.formato) ws.getColumn(i + 1).numFmt = c.formato;
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return wb;
}

async function responderLibro(res, nombre, wb) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nombre)}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  await wb.xlsx.write(res);
  res.end();
}

function fechaExcel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function horaExcel(hhmm) {
  return hhmm ? rutero.minutos(hhmm) / (24 * 60) : null;
}

function numeroSiSePuede(v) {
  return /^\d+$/.test(v) ? Number(v) : v;
}

// 03 Rutero (Hoja1): las 18 columnas del formato. Las solicitudes devueltas no salen.
function libroRutero(programaciones) {
  const db = store.db();
  const vigentes = programaciones.filter((p) => p.estado !== 'devuelta');
  const filas = db.periodo ? rutero.generarRutero(store.contexto(), vigentes, db.periodo, eventoMarca()) : [];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(rutero.COLUMNAS_RUTERO);
  ws.getRow(1).font = { bold: true };
  for (const f of filas) {
    ws.addRow(rutero.COLUMNAS_RUTERO.map((c) => {
      if (c === 'FECHA_VISITA') return fechaExcel(f[c]);
      if (c === 'HORA DE INGRESO' || c === 'HORA DE SALIDA') return horaExcel(f[c]);
      if (c === 'SAP' || c === 'CEDULA PERSONAL') return numeroSiSePuede(f[c]);
      return f[c];
    }));
  }
  ws.getColumn(10).numFmt = 'd/mm/yyyy';
  ws.getColumn(12).numFmt = 'h:mm';
  ws.getColumn(13).numFmt = 'h:mm';
  ws.columns.forEach((col, i) => { col.width = [28, 22, 11, 36, 14, 16, 30, 18, 12, 13, 12, 10, 10, 26, 34, 15, 34, 11][i]; });
  ws.autoFilter = { from: 'A1', to: 'R1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return wb;
}

app.get('/api/admin/rutero.xlsx', soloSuper, async (req, res) => {
  const db = store.db();
  await responderLibro(res, `03 Rutero ${db.periodo || ''}.xlsx`, libroRutero(db.programaciones));
});

app.put('/api/admin/periodo', soloSuper, guardando(async (req, res) => {
  const periodo = String((req.body || {}).periodo || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodo)) return res.status(400).json({ error: 'Fecha inválida' });
  store.ponerPeriodo(periodo, req.usuario);
  await store.confirmar();
  res.json({ ok: true, periodo });
}));

// Errores de las rutas que guardan (por ejemplo, la base no respondió).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Error:', err.message, err.causa ? `(${err.causa.message || err.causa})` : '');
  res.status(err.status || 500).json({ error: err.status === 503 ? err.message : 'Algo salió mal. Intenta otra vez.' });
});

nutresa.actualizar();

store.iniciar().then(() => {
  console.log(`Datos de Rutero: ${store.modo === 'api' ? 'bases Rutero_* de la API' : `archivos en ${store.dir}`}`);
  arrancar();
}).catch((e) => {
  console.error(`No se pudieron leer las bases de Rutero: ${e.message}`);
  process.exit(1);
});

function arrancar() {
  app.listen(PORT, () => console.log(`Rutero en http://localhost:${PORT}  (área interna: /interno)`))
    .on('error', (e) => {
      if (e.code !== 'EADDRINUSE') throw e;
      console.error(`El puerto ${PORT} ya está en uso: probablemente Rutero ya está abierto en http://localhost:${PORT}.`);
      console.error(`Ciérralo primero, o usa otro puerto: PORT=3001 npm run app`);
      process.exit(1);
    });
}
