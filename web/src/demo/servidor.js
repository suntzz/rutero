// Servidor de mentiras para la demo pública: responde las mismas rutas /api que server.js, con datos
// inventados y guardando todo en el navegador (localStorage). No habla con Nutresa ni con ninguna base.
// Las reglas principales son las mismas (de mañana en adelante, choques de horario, un evento por día,
// marca ↔ evento, ruta automática); los Excel no se generan en la demo.

import { CANALES, HORAS, LAS, NOVEDADES, PDV, SUPER, USUARIOS } from './datos';

const CLAVE = 'rutero-demo-v1';
const DIAS = 31;

function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function periodoInicial() {
  return `${hoy().slice(0, 7)}-01`;
}

function nuevoEstado() {
  return {
    periodo: periodoInicial(),
    usuarios: Object.fromEntries(USUARIOS.map((u) => [u.cedula, u])),
    pdv: Object.fromEntries(PDV.map((x) => [x.sap, x])),
    programaciones: [],
    peticiones: [],
    borradores: {},
    las: null,
    admin: false,
  };
}

let db;
function cargar() {
  try { db = JSON.parse(localStorage.getItem(CLAVE)) || nuevoEstado(); } catch { db = nuevoEstado(); }
  if (!db.usuarios) db = nuevoEstado();
}
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch { /* sin almacenamiento: queda en memoria */ }
}
export function reiniciarDemo() {
  try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
  db = nuevoEstado();
}
cargar();

// ---------- Utilidades (mismas reglas que lib/) ----------
const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const id = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const ahora = () => new Date().toISOString();
const mayus = (v, max = 120) => String(v || '').trim().toUpperCase().slice(0, max);
const distintos = (l) => [...new Set(l.map((v) => mayus(v)).filter((v) => v && v !== 'NA'))].sort();
const capital = (t) => String(t || '').toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
const NUEVA = { estado: 'pendiente', comentario: '', revisado: null };

function fechas() {
  const [y, m, d] = db.periodo.split('-').map(Number);
  return Array.from({ length: DIAS }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}
const cerrados = () => fechas().map((f) => f <= hoy());

function marcaEventos(conPdv = false) {
  const rel = {};
  for (const u of [...Object.values(db.usuarios), ...(conPdv ? Object.values(db.pdv) : [])]) {
    if (u.marca && u.evento) (rel[u.marca] = rel[u.marca] || new Set()).add(u.evento);
  }
  return Object.fromEntries(Object.keys(rel).sort().map((k) => [k, [...rel[k]].sort()]));
}
const eventoMarca = () => Object.fromEntries(Object.entries(marcaEventos(true)).flatMap(([m, evs]) => evs.map((e) => [e, m])));
const eventos = () => Object.keys(eventoMarca()).sort();

function usuariosPedidos() {
  const m = {};
  for (const p of db.peticiones) {
    if (p.tipo !== 'usuario' || p.estado === 'devuelta') continue;
    const d = p.datos;
    m[d.CEDULA] = { cedula: d.CEDULA, nombre: d.NOMBRE, las: p.las, regional: d.REGIONAL, ciudad: d.CIUDAD, marca: d.MARCA, evento: d.EVENTO, ruta: d.RUTA, estado: 'ACTIVO', cargo: 'PROMOTOR', nuevo: true, registradoPor: p.las };
  }
  return m;
}
const persona = (c) => db.usuarios[c] || usuariosPedidos()[c] || null;
const pdvDe = (s) => db.pdv[s] || null;
const delEquipo = (p, las) => p && ((p.las || '').trim() === las.nombre || (p.nuevo && p.registradoPor === las.nombre));

function equipo(las) {
  return [...Object.values(db.usuarios), ...Object.values(usuariosPedidos())]
    .filter((u) => u.las === las.nombre && u.cargo !== 'LAS' && u.estado !== 'INACTIVO')
    .map((u) => ({ cedula: u.cedula, nombre: u.nombre, nuevo: !!u.nuevo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function horas(dias) {
  return Math.round(dias.reduce((s, d) => s + (d && d.inicio ? (minutos(d.fin) - minutos(d.inicio)) / 60 : 0), 0) * 10) / 10;
}

function vigentes() {
  return db.programaciones;
}

function agenda(cedula, excluir) {
  const out = [];
  for (const p of vigentes()) {
    if (p.cedula !== cedula || p.id === excluir) continue;
    p.dias.forEach((d, i) => { if (d && !d.cancelada) out.push({ dia: i, id: p.id, sap: p.sap, pdv: pdvDe(p.sap)?.nombre || p.sap, evento: p.evento, ...d }); });
  }
  return out;
}

function siguienteRuta(evento, regional) {
  const letras = mayus(evento).replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
  const reg = mayus(regional).replace(/[^A-Z]/g, '').slice(0, 2).padEnd(2, 'X');
  const rutas = [...Object.values(db.usuarios).map((u) => u.ruta), ...db.peticiones.map((p) => p.datos.RUTA)];
  const max = Math.max(100, ...rutas.map((r) => (/^[A-Z]{5}(\d{3})$/.exec(r || '') || [])[1]).filter(Boolean).map(Number));
  return `${letras}${reg}${String(max + 1).padStart(3, '0')}`;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
function validarDias(dias) {
  if (!Array.isArray(dias) || dias.length !== DIAS) return null;
  return dias.map((d) => {
    if (!d) return null;
    if (d.novedad) return NOVEDADES.includes(d.novedad) ? { novedad: d.novedad } : null;
    if (HORA.test(d.inicio) && HORA.test(d.fin) && minutos(d.fin) > minutos(d.inicio)) return { inicio: d.inicio, fin: d.fin };
    return null;
  });
}

function revisar({ cedula, evento, dias: crudos, excluir, unificarEvento }) {
  if (!eventos().includes(evento)) return [400, { error: 'Elige un evento de la lista' }];
  const dias = validarDias(crudos);
  if (!dias) return [400, { error: 'Los días no son válidos' }];
  if (!dias.some(Boolean)) return [400, { error: 'Marca al menos un día' }];
  const c = cerrados();
  const choques = agenda(cedula, excluir).filter((o) => {
    const d = dias[o.dia];
    return d && d.inicio && !c[o.dia] && (o.novedad || (minutos(d.inicio) < minutos(o.fin) && minutos(o.inicio) < minutos(d.fin)));
  });
  if (choques.length) return [409, { error: 'cruce', cruces: choques }];
  const porEvento = new Map();
  for (const o of agenda(cedula, excluir)) {
    if (!dias[o.dia] || o.evento === evento) continue;
    if (!porEvento.has(o.evento)) porEvento.set(o.evento, { evento: o.evento, dias: new Set(), ids: new Set() });
    porEvento.get(o.evento).dias.add(o.dia);
    porEvento.get(o.evento).ids.add(o.id);
  }
  const otros = [...porEvento.values()];
  if (otros.length && !unificarEvento) return [409, { error: 'evento', eventos: otros.map((e) => ({ evento: e.evento, dias: [...e.dias].sort((a, b) => a - b) })) }];
  for (const e of otros) for (const pid of e.ids) Object.assign(db.programaciones.find((x) => x.id === pid), { evento, marca: eventoMarca()[evento] || '', ...NUEVA });
  return [0, dias];
}

function pedirCambio(per, evento, las) {
  if (!per.evento || per.evento === evento) return false;
  if (db.peticiones.some((p) => p.tipo === 'cambio' && p.datos.CEDULA === per.cedula && p.datos.EVENTO === evento)) return false;
  db.peticiones.push({
    id: id(), tipo: 'cambio', las: las.nombre, creado: ahora(), ...NUEVA,
    datos: { TELEFONO: per.telefono || '', CEDULA: per.cedula, REGIONAL: per.regional, CIUDAD: per.ciudad, NOMBRE: per.nombre, MARCA: eventoMarca()[evento] || '', EVENTO: evento, RUTA: per.ruta || '', CARGO: 'PROMOTOR', LAS: las.nombre, ESTADO: 'ACTIVO', ANTES: `${per.evento} / ${per.marca}` },
  });
  return true;
}

const publica = (p) => ({ id: p.id, tipo: p.tipo, datos: p.datos, las: p.las, creado: p.creado, estado: p.estado, comentario: p.comentario, revisado: p.revisado });

// ---------- Rutas ----------
const rutas = [];
const ruta = (metodo, patron, fn, quien) => rutas.push({ metodo, patron, fn, quien });

ruta('GET', /^\/api\/las$/, () => LAS.map(({ id: i, nombre, regional }) => ({ id: i, nombre, regional })));
ruta('POST', /^\/api\/las\/entrar$/, ({ body }) => {
  const las = LAS.find((l) => l.id === body.id);
  if (!las) return [400, { error: 'Elige tu nombre de la lista' }];
  if (String(body.cedula || '').replace(/\D/g, '') !== las.cedula) return [401, { error: 'Esa no es tu cédula. En la demo es 52123456 o 71123456.' }];
  db.las = { nombre: las.nombre, regional: las.regional };
  return db.las;
});
ruta('POST', /^\/api\/las\/salir$/, () => { db.las = null; return { ok: true }; });
ruta('GET', /^\/api\/las\/yo$/, ({ las }) => las, 'las');
ruta('GET', /^\/api\/las\/equipo$/, ({ las }) => equipo(las), 'las');
ruta('GET', /^\/api\/las\/reemplazables$/, ({ las }) => Object.values(db.usuarios).filter((u) => u.las === las.nombre)
  .map((u) => ({ cedula: u.cedula, nombre: u.nombre, ruta: u.ruta, marca: u.marca, evento: u.evento, estado: u.estado })), 'las');

ruta('GET', /^\/api\/catalogos$/, () => ({
  periodo: db.periodo, hoy: hoy(), fechas: fechas(), eventos: eventos(), novedades: NOVEDADES, horas: HORAS, canales: CANALES,
  marcas: distintos(Object.values(db.usuarios).map((u) => u.marca)),
  regionales: distintos([...Object.values(db.usuarios), ...Object.values(db.pdv)].map((x) => x.regional)),
  eventoMarca: eventoMarca(), marcaEventos: marcaEventos(), marcaEventosPdv: marcaEventos(true),
  correos: { rutero: 'brayan_zabala@eficacia.com.co', peticiones: 'miguel_restrepo@eficacia.com.co' },
  ciudades: distintos([...Object.values(db.usuarios), ...Object.values(db.pdv)].map((x) => x.ciudad)),
}), 'las');

ruta('GET', /^\/api\/persona\/(\d+)\/agenda$/, ({ m, las, q }) => {
  const p = persona(m[1]);
  if (!p) return [404, { error: 'No encontramos esa cédula' }];
  if (!delEquipo(p, las)) return [403, { error: 'Esa persona no está en tu equipo.' }];
  return agenda(m[1], q.get('excluir') || '');
}, 'las');
ruta('GET', /^\/api\/persona\/(\d+)$/, ({ m, las }) => {
  const p = persona(m[1]);
  if (!p) return [404, { error: 'No encontramos esa cédula' }];
  if (!delEquipo(p, las)) return [403, { error: `Esa persona es del equipo de ${p.las}, no del tuyo. Solo puedes programar a tus promotores.` }];
  return { cedula: p.cedula, nombre: p.nombre, regional: p.regional, ciudad: p.ciudad, las: p.las, evento: p.evento, nuevo: !!p.nuevo };
}, 'las');
ruta('GET', /^\/api\/pdv$/, ({ q }) => {
  const t = mayus(q.get('q')).normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return [];
  const sin = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const l = Object.values(db.pdv);
  return [...l.filter((x) => x.sap.startsWith(t)), ...l.filter((x) => !x.sap.startsWith(t) && sin(x.nombre).includes(t))].slice(0, 20);
}, 'las');
ruta('GET', /^\/api\/pdv\/([\d-]+)$/, ({ m }) => pdvDe(m[1]) || [404, { error: 'No encontramos ese código SAP' }], 'las');

ruta('POST', /^\/api\/programacion$/, ({ body, las }) => {
  const per = persona(String(body.cedula || ''));
  if (!per) return [400, { error: 'La cédula no está registrada' }];
  if (!delEquipo(per, las)) return [403, { error: 'Esa persona no está en tu equipo.' }];
  if (!pdvDe(body.sap)) return [400, { error: 'El PDV no está registrado' }];
  const c = cerrados();
  if (Array.isArray(body.dias) && body.dias.some((d, i) => d && c[i])) return [400, { error: 'Solo puedes programar de mañana en adelante.' }];
  const [codigo, r] = revisar({ cedula: per.cedula, evento: body.evento, dias: body.dias, unificarEvento: body.unificarEvento });
  if (codigo) return [codigo, r];
  const prog = { id: id(), sap: body.sap, cedula: per.cedula, evento: body.evento, marca: eventoMarca()[body.evento] || '', dias: r, registradoPor: las.nombre, creado: ahora(), ...NUEVA };
  db.programaciones.push(prog);
  return { ok: true, id: prog.id, panel: { horasProgramadas: horas(r) }, cambio: pedirCambio(per, body.evento, las) };
}, 'las');
ruta('PUT', /^\/api\/programacion\/([\w-]+)$/, ({ m, body, las }) => {
  const prog = db.programaciones.find((x) => x.id === m[1]);
  if (!prog) return [404, { error: 'Esa programación ya no existe' }];
  const c = cerrados();
  const futuros = (body.dias || []).map((d, i) => (c[i] ? null : d));
  const [codigo, r] = revisar({ cedula: prog.cedula, evento: body.evento, dias: futuros, excluir: prog.id, unificarEvento: body.unificarEvento });
  if (codigo && !(r.error === 'Marca al menos un día' && prog.dias.some((d, i) => d && c[i]))) return [codigo, r];
  const nuevos = codigo ? futuros.map(() => null) : r;
  Object.assign(prog, { evento: body.evento, marca: eventoMarca()[body.evento] || '', dias: prog.dias.map((d, i) => (c[i] ? d : nuevos[i])), modificado: ahora(), ...NUEVA });
  return { ok: true, id: prog.id, panel: { horasProgramadas: horas(prog.dias) }, cambio: pedirCambio(persona(prog.cedula), body.evento, las) };
}, 'las');
ruta('POST', /^\/api\/programacion\/([\w-]+)\/cancelar$/, ({ m }) => {
  const prog = db.programaciones.find((x) => x.id === m[1]);
  if (!prog) return [404, { error: 'Esa programación ya no existe' }];
  const c = cerrados();
  Object.assign(prog, { dias: prog.dias.map((d, i) => (c[i] || !d || d.novedad ? d : { cancelada: true })), modificado: ahora(), ...NUEVA });
  return { ok: true };
}, 'las');

ruta('GET', /^\/api\/las\/rutero$/, ({ las }) => {
  const eq = equipo(las);
  const por = new Map();
  for (const p of vigentes()) {
    if (!eq.some((x) => x.cedula === p.cedula)) continue;
    const pdv = pdvDe(p.sap);
    if (!por.has(p.cedula)) por.set(p.cedula, []);
    por.get(p.cedula).push({ id: p.id, sap: p.sap, pdv: pdv?.nombre || p.sap, ciudad: pdv?.ciudad || '', evento: p.evento, dias: p.dias, horas: horas(p.dias), creado: p.creado, modificado: p.modificado || null, estado: p.estado, comentario: p.comentario, revisado: p.revisado });
  }
  return { periodo: db.periodo, hoy: hoy(), fechas: fechas(), programados: eq.filter((p) => por.has(p.cedula)).map((p) => ({ ...p, programaciones: por.get(p.cedula) })), sinProgramar: eq.filter((p) => !por.has(p.cedula)) };
}, 'las');

ruta('GET', /^\/api\/borrador$/, ({ las }) => {
  const b = db.borradores[las.nombre];
  return b && !b.terminado && b.periodo === db.periodo ? b : null;
}, 'las');
ruta('PUT', /^\/api\/borrador$/, ({ body, las }) => {
  db.borradores[las.nombre] = { paso: body.paso, persona: body.persona, pdv: body.pdv, evento: body.evento, dias: body.dias, periodo: db.periodo, guardado: ahora() };
  return { ok: true };
}, 'las');
ruta('POST', /^\/api\/borrador\/terminar$/, ({ las }) => { delete db.borradores[las.nombre]; return { ok: true }; }, 'las');

ruta('GET', /^\/api\/peticiones$/, ({ las }) => db.peticiones.filter((p) => p.las === las.nombre).map(publica).reverse(), 'las');
ruta('POST', /^\/api\/peticiones\/usuario$/, ({ body: b, las }) => {
  const cedula = String(b.CEDULA || '').replace(/\D/g, '');
  if (!/^\d{5,12}$/.test(cedula)) return [400, { error: 'Escribe la cédula sin puntos (solo números).' }];
  if (!/^\d{10}$/.test(String(b.TELEFONO || ''))) return [400, { error: 'El teléfono debe tener 10 números.' }];
  if (!(marcaEventos()[mayus(b.MARCA)] || []).includes(mayus(b.EVENTO))) return [400, { error: `El evento ${mayus(b.EVENTO)} no pertenece a la marca ${mayus(b.MARCA)}.` }];
  if (persona(cedula)) return [409, { error: 'Esa cédula ya existe.' }];
  const reemplazado = b.REEMPLAZA ? db.usuarios[b.REEMPLAZA] : null;
  const datos = {
    TELEFONO: b.TELEFONO, CEDULA: cedula, REGIONAL: mayus(b.REGIONAL), CIUDAD: mayus(b.CIUDAD), NOMBRE: mayus(b.NOMBRE), MARCA: mayus(b.MARCA), EVENTO: mayus(b.EVENTO),
    CARGO: 'PROMOTOR', LAS: las.nombre, ENVIO_CAMP: b.ENVIO_CAMP || 'ENVIO', ESTADO: 'ACTIVO', created: ahora(),
    REEMPLAZA: reemplazado ? `${reemplazado.nombre} (C.C. ${reemplazado.cedula})` : '',
  };
  datos.RUTA = reemplazado ? reemplazado.ruta : siguienteRuta(datos.EVENTO, datos.REGIONAL);
  const pet = { id: id(), tipo: 'usuario', datos, las: las.nombre, creado: ahora(), ...NUEVA };
  db.peticiones.push(pet);
  return publica(pet);
}, 'las');
ruta('POST', /^\/api\/peticiones\/pdv$/, ({ body: b, las }) => {
  const sap = String(b.SAP || '').replace(/[^\d-]/g, '');
  if (!sap) return [400, { error: 'Escribe el código SAP.' }];
  if (pdvDe(sap) || db.peticiones.some((p) => p.tipo === 'pdv' && p.datos.SAP === sap)) return [409, { error: 'Ese SAP ya existe o ya fue pedido.' }];
  const datos = { EVENTO: mayus(b.EVENTO), MARCA: mayus(b.MARCA), SAP: sap, PDV: mayus(b.PDV), REGIONAL: mayus(b.REGIONAL), CIUDAD: mayus(b.CIUDAD), DIRECCION: mayus(b.DIRECCION), CANAL: mayus(b.CANAL), LATITUD: 'SIN GEO', LONGITUD: 'SIN GEO', GEO_OK: 'NA' };
  const pet = { id: id(), tipo: 'pdv', datos, las: las.nombre, creado: ahora(), ...NUEVA };
  db.peticiones.push(pet);
  return publica(pet);
}, 'las');

// ---------- Área interna ----------
ruta('POST', /^\/api\/admin\/login$/, ({ body }) => {
  if (body.usuario !== SUPER.usuario || body.clave !== SUPER.clave) return [401, { error: 'En la demo el usuario y la clave son: demo' }];
  db.admin = true;
  return { ok: true };
});
ruta('POST', /^\/api\/admin\/logout$/, () => { db.admin = false; return { ok: true }; });
ruta('GET', /^\/api\/admin\/yo$/, () => ({ usuario: 'demo' }), 'admin');
const maestros = () => ({ configurada: true, error: '', ultimaOk: ahora(), respaldo: null, enUso: { usuarios: Object.keys(db.usuarios).length, pdv: Object.keys(db.pdv).length } });
ruta('GET', /^\/api\/admin\/resumen$/, () => ({
  periodo: db.periodo,
  programaciones: db.programaciones.filter((p) => p.estado !== 'devuelta').length,
  pendientes: [...db.programaciones, ...db.peticiones].filter((p) => p.estado === 'pendiente').length,
  las: new Set(db.programaciones.map((p) => p.registradoPor)).size,
  filasRutero: db.programaciones.filter((p) => p.estado !== 'devuelta').length * DIAS,
  peticionesUsuario: db.peticiones.filter((p) => p.tipo !== 'pdv').length,
  peticionesPdv: db.peticiones.filter((p) => p.tipo === 'pdv').length,
  maestros: maestros(),
}), 'admin');
ruta('POST', /^\/api\/admin\/actualizar-maestros$/, () => maestros(), 'admin');
ruta('GET', /^\/api\/admin\/rutas-duplicadas$/, () => {
  const por = {};
  for (const u of Object.values(db.usuarios)) if (u.estado !== 'INACTIVO' && u.ruta) (por[u.ruta] = por[u.ruta] || []).push({ nombre: u.nombre, cedula: u.cedula, origen: 'Nutresa' });
  return Object.entries(por).filter(([, l]) => l.length > 1).map(([r, personas]) => ({ ruta: r, personas }));
}, 'admin');
ruta('GET', /^\/api\/admin\/peticiones$/, () => {
  const l = db.peticiones.map(publica).reverse();
  return { usuario: l.filter((p) => p.tipo !== 'pdv'), pdv: l.filter((p) => p.tipo === 'pdv') };
}, 'admin');
function revision(body) {
  if (!['cargada', 'devuelta', 'pendiente'].includes(body.estado)) return [400, { error: 'Estado no válido' }];
  if (body.estado === 'devuelta' && !String(body.comentario || '').trim()) return [400, { error: 'Escribe por qué se devuelve' }];
  return { estado: body.estado, comentario: body.estado === 'devuelta' ? String(body.comentario).trim() : '', revisado: ahora() };
}
ruta('POST', /^\/api\/admin\/peticiones\/([\w-]+)\/estado$/, ({ m, body }) => {
  const p = db.peticiones.find((x) => x.id === m[1]);
  if (!p) return [404, { error: 'No existe esa petición' }];
  const r = revision(body);
  if (Array.isArray(r)) return r;
  Object.assign(p, r);
  return publica(p);
}, 'admin');
ruta('GET', /^\/api\/admin\/solicitudes$/, () => {
  const por = new Map();
  for (const p of db.programaciones) {
    const per = persona(p.cedula) || {};
    const las = per.las || p.registradoPor;
    if (!por.has(las)) por.set(las, []);
    por.get(las).push({ id: p.id, cedula: p.cedula, persona: per.nombre || p.cedula, sap: p.sap, pdv: pdvDe(p.sap)?.nombre || p.sap, evento: p.evento, marca: p.marca, dias: p.dias, horas: horas(p.dias), estado: p.estado, comentario: p.comentario, creado: p.creado, modificado: p.modificado || null });
  }
  return {
    fechas: fechas(),
    las: [...por.entries()].map(([nombre, l]) => ({
      nombre, programaciones: l,
      pendientes: l.filter((x) => x.estado === 'pendiente').length, cargadas: l.filter((x) => x.estado === 'cargada').length,
      devueltas: l.filter((x) => x.estado === 'devuelta').length, ultima: l.map((x) => x.modificado || x.creado).sort().at(-1),
    })),
  };
}, 'admin');
ruta('POST', /^\/api\/admin\/programacion\/([\w-]+)\/estado$/, ({ m, body }) => {
  const p = db.programaciones.find((x) => x.id === m[1]);
  if (!p) return [404, { error: 'Esa programación ya no existe' }];
  const r = revision(body);
  if (Array.isArray(r)) return r;
  Object.assign(p, r);
  return { ok: true };
}, 'admin');
ruta('POST', /^\/api\/admin\/solicitudes\/cargar$/, ({ body }) => {
  let n = 0;
  for (const p of db.programaciones) if ((body.ids || []).includes(p.id) && p.estado === 'pendiente') { Object.assign(p, { estado: 'cargada', revisado: ahora() }); n++; }
  return { ok: true, cargadas: n };
}, 'admin');
ruta('PUT', /^\/api\/admin\/periodo$/, ({ body }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.periodo || '')) return [400, { error: 'Fecha no válida' }];
  db.periodo = body.periodo;
  return { ok: true, periodo: db.periodo };
}, 'admin');

// Carga directa a Nutresa (en la demo solo se agrega a los datos inventados).
ruta('GET', /^\/api\/admin\/carga\/catalogos$/, () => ({
  habilitada: true, simulada: true, colecciones: { usuario: 'usuarios_nutresa', pdv: 'pdv_nutresa' },
  marcaEventos: marcaEventos(), marcaEventosPdv: marcaEventos(true),
  regionales: distintos([...Object.values(db.usuarios), ...Object.values(db.pdv)].map((x) => x.regional)),
  ciudades: distintos([...Object.values(db.usuarios), ...Object.values(db.pdv)].map((x) => x.ciudad)),
  canales: CANALES, las: LAS.map((l) => l.nombre), cargos: ['PROMOTOR', 'LAS'], estados: ['ACTIVO', 'INACTIVO'], envios: ['ENVIO', 'NO ENVIO'],
  pendientes: db.peticiones.filter((p) => p.estado === 'pendiente' && p.tipo !== 'cambio').map(publica).reverse(),
}), 'admin');
ruta('GET', /^\/api\/admin\/carga\/ruta$/, ({ q }) => ({ ruta: q.get('evento') && q.get('regional') ? siguienteRuta(q.get('evento'), q.get('regional')) : '' }), 'admin');
function cerrarPeticion(pid) {
  const p = pid && db.peticiones.find((x) => x.id === pid);
  if (!p) return null;
  Object.assign(p, { estado: 'cargada', comentario: '', revisado: ahora() });
  return publica(p);
}
ruta('POST', /^\/api\/admin\/carga\/usuario$/, ({ body: b }) => {
  const cedula = String(b.CEDULA || '').replace(/\D/g, '');
  if (!/^\d{5,12}$/.test(cedula)) return [400, { error: 'Escribe la cédula sin puntos (solo números).', campo: 'CEDULA' }];
  if (!/^\d{7,10}$/.test(String(b.TELEFONO || ''))) return [400, { error: 'El teléfono debe tener entre 7 y 10 números.', campo: 'TELEFONO' }];
  if (db.usuarios[cedula]) return [409, { error: `Esa cédula ya está en Nutresa (${capital(db.usuarios[cedula].nombre)}). Rutero no edita registros.`, campo: 'CEDULA' }];
  const datos = { TELEFONO: Number(b.TELEFONO), CEDULA: Number(cedula), REGIONAL: mayus(b.REGIONAL), CIUDAD: mayus(b.CIUDAD), NOMBRE: mayus(b.NOMBRE), MARCA: mayus(b.MARCA), EVENTO: mayus(b.EVENTO), RUTA: mayus(b.RUTA, 20), CARGO: mayus(b.CARGO) || 'PROMOTOR', LAS: mayus(b.LAS), ENVIO_CAMP: mayus(b.ENVIO_CAMP) || 'ENVIO', ESTADO: mayus(b.ESTADO) || 'ACTIVO' };
  if (!(marcaEventos()[datos.MARCA] || []).includes(datos.EVENTO)) return [400, { error: `El evento ${datos.EVENTO} no pertenece a la marca ${datos.MARCA}.`, campo: 'EVENTO' }];
  const con = Object.values(db.usuarios).find((u) => u.ruta === datos.RUTA && u.estado !== 'INACTIVO');
  if (con && !b.confirmarRuta) return [409, { error: `La ruta ${datos.RUTA} ya está en ${capital(con.nombre)}, que sigue activa.`, campo: 'RUTA', ruta: true }];
  db.usuarios[cedula] = { cedula, nombre: datos.NOMBRE, las: datos.LAS, regional: datos.REGIONAL, ciudad: datos.CIUDAD, marca: datos.MARCA, evento: datos.EVENTO, ruta: datos.RUTA, estado: datos.ESTADO, cargo: datos.CARGO, telefono: String(datos.TELEFONO) };
  return { ok: true, id: `demo-${Date.now()}`, datos, peticion: cerrarPeticion(b.peticion) };
}, 'admin');
ruta('POST', /^\/api\/admin\/carga\/pdv$/, ({ body: b }) => {
  const sap = String(b.SAP || '').replace(/[^\d-]/g, '');
  if (!sap) return [400, { error: 'Escribe el código SAP.', campo: 'SAP' }];
  if (db.pdv[sap]) return [409, { error: `Ese SAP ya está en Nutresa (${db.pdv[sap].nombre}). Rutero no edita registros.`, campo: 'SAP' }];
  const geo = String(b.LATITUD || '').trim() && String(b.LONGITUD || '').trim();
  const datos = { EVENTO: mayus(b.EVENTO), MARCA: mayus(b.MARCA), SAP: Number(sap) || sap, PDV: mayus(b.PDV), REGIONAL: mayus(b.REGIONAL), CIUDAD: mayus(b.CIUDAD), DIRECCION: mayus(b.DIRECCION), CANAL: mayus(b.CANAL), LATITUD: geo ? b.LATITUD.replace(',', '.') : 'SIN GEO', LONGITUD: geo ? b.LONGITUD.replace(',', '.') : 'SIN GEO', GEO_OK: geo ? 'OK' : 'NA' };
  if (!(marcaEventos(true)[datos.MARCA] || []).includes(datos.EVENTO)) return [400, { error: `El evento ${datos.EVENTO} no pertenece a la marca ${datos.MARCA}.`, campo: 'EVENTO' }];
  db.pdv[sap] = { sap, nombre: datos.PDV, ciudad: datos.CIUDAD, regional: datos.REGIONAL, canal: datos.CANAL, direccion: datos.DIRECCION, marca: datos.MARCA, evento: datos.EVENTO, latitud: datos.LATITUD, longitud: datos.LONGITUD };
  return { ok: true, id: `demo-${Date.now()}`, datos, peticion: cerrarPeticion(b.peticion) };
}, 'admin');

// ---------- Despacho ----------
export async function responder(url, opciones = {}) {
  const u = new URL(url, location.origin);
  const camino = u.pathname.replace(/^.*?(\/api\/)/, '/api/');
  const metodo = (opciones.method || 'GET').toUpperCase();
  let body = {};
  try { body = opciones.body ? JSON.parse(opciones.body) : {}; } catch { body = {}; }
  cargar();
  await new Promise((ok) => setTimeout(ok, 120 + Math.random() * 180)); // se siente como una red real
  for (const r of rutas) {
    const m = r.metodo === metodo && r.patron.exec(camino);
    if (!m) continue;
    if (r.quien === 'las' && !db.las) return [401, { error: 'Tu sesión terminó. Vuelve a entrar.' }];
    if (r.quien === 'admin' && !db.admin) return [401, { error: 'Entra con tu usuario.' }];
    const out = r.fn({ m, body, q: u.searchParams, las: db.las });
    guardar();
    return Array.isArray(out) && typeof out[0] === 'number' ? out : [200, out];
  }
  return [404, { error: 'Esto no está disponible en la demo.' }];
}
