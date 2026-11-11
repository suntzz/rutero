// Pruebas de las reglas del servidor con una COPIA de data/ (nunca toca los datos reales).
// Uso: npm test   (o node scripts/prueba-reglas.js [carpeta-temporal])
//   Copia data/ a la carpeta, agrega programaciones de prueba con días pasados, arranca el servidor
//   en el puerto 3100 con "hoy" fijo y el correo en modo prueba, corre los casos y lo apaga.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const ExcelJS = require('exceljs');

const DESTINO = process.argv[2] || path.join(os.tmpdir(), 'rutero-prueba');
const RAIZ = path.join(__dirname, '..');
const PUERTO = 3100;
const URL = `http://localhost:${PUERTO}`;

fs.rmSync(DESTINO, { recursive: true, force: true });
fs.cpSync(path.join(RAIZ, 'data'), DESTINO, { recursive: true });
fs.rmSync(path.join(DESTINO, 'programaciones.jsonl'), { force: true });
fs.rmSync(path.join(DESTINO, 'correos-prueba.jsonl'), { force: true });
// Super usuario solo para esta copia (clave al azar): las pruebas no usan ni conocen la clave real.
const SUPER = { usuario: 'prueba', clave: crypto.randomBytes(12).toString('base64url') };
execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'crear-superusuario.js'), SUPER.usuario], {
  env: { ...process.env, RUTERO_DATA: DESTINO, RUTERO_CLAVE: SUPER.clave }, stdio: 'ignore',
});
const db = JSON.parse(fs.readFileSync(path.join(DESTINO, 'db.json'), 'utf8'));
Object.assign(db, { usuariosNuevos: {}, pdvNuevos: {}, peticiones: [] });

// "Hoy" = día 11 del mes abierto: los índices 0..10 ya no se pueden tocar.
const fechas = Array.from({ length: 31 }, (_, i) => {
  const [y, m, d] = db.periodo.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
});
const HOY = fechas[10];
fs.writeFileSync(path.join(DESTINO, 'db.json'), JSON.stringify(db));

const nut = JSON.parse(fs.readFileSync(path.join(DESTINO, 'nutresa-respaldo.json'), 'utf8'));
const usuarios = Object.values(nut.usuarios);
const activos = (l) => usuarios.filter((u) => u.las.trim() === l.nombre && !/INACTIVO/i.test(u.estado) && u.cargo !== 'LAS');
const lasLista = usuarios.filter((u) => u.cargo === 'LAS' && !/INACTIVO/i.test(u.estado)).sort((a, b) => activos(b).length - activos(a).length);
const LAS = lasLista[0];
const OTRO_LAS = lasLista[1];
const [A, B, C] = activos(LAS);
const AJENO = activos(OTRO_LAS)[0];
const saps = Object.keys(nut.pdv).filter((s) => /^\d+$/.test(s)).slice(0, 4);

const vacio = () => Array(31).fill(null);
const turno = (desde, hasta, inicio = '10:00', fin = '18:00', base = vacio()) => base.map((d, i) => (i >= desde && i <= hasta ? { inicio, fin } : d));

// Programaciones que ya existían antes de "hoy" (tienen días pasados).
const fixture = [
  { id: 'fx-b', version: 1, sap: saps[0], cedula: B.cedula, evento: 'E-VIEJO', dias: turno(2, 20), registradoPor: LAS.nombre, creado: '2026-01-01T00:00:00Z' },
  { id: 'fx-ajeno', version: 1, sap: saps[0], cedula: AJENO.cedula, evento: 'E-VIEJO', dias: turno(12, 14), registradoPor: OTRO_LAS.nombre, creado: '2026-01-01T00:00:00Z' },
];
fs.writeFileSync(path.join(DESTINO, 'programaciones.jsonl'), fixture.map((p) => `${JSON.stringify(p)}\n`).join(''));

// Siempre en archivos: las pruebas nunca escriben en las bases Rutero_* de la API.
const env = { ...process.env, PORT: String(PUERTO), RUTERO_DATA: DESTINO, RUTERO_HOY: HOY, RUTERO_ALMACEN: 'archivos', RUTERO_CARGA_NUTRESA: 'si' };
const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'inherit'] });

// Dos sesiones a la vez: la del LAS y la del área interna.
const cookies = { las: '', admin: '', otro: '' };
let quien = 'las';
async function pedir(ruta, { metodo = 'GET', cuerpo, crudo } = {}) {
  const r = await fetch(URL + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookies[quien] },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookies[quien] = sc.split(';')[0];
  if (crudo) return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) };
  return { status: r.status, json: await r.json().catch(() => null) };
}

let fallas = 0;
function caso(nombre, ok, detalle = '') {
  if (!ok) fallas++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${ok || !detalle ? '' : ` → ${JSON.stringify(detalle).slice(0, 300)}`}`);
}

async function esperarServidor() {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${URL}/api/las`); return; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error('El servidor no arrancó');
}

async function filasRutero(ruta) {
  const anterior = quien;
  quien = 'admin';
  const { buf } = await pedir(ruta, { crudo: true });
  quien = anterior;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Hoja1');
  const cab = ws.getRow(1).values.slice(1);
  const filas = [];
  ws.eachRow((row, n) => { if (n > 1) filas.push(Object.fromEntries(cab.map((c, i) => [c, row.values[i + 1]]))); });
  return { cab, filas };
}

async function main() {
  await esperarServidor();
  const lista = (await pedir('/api/las')).json;
  const yo = lista.find((l) => l.nombre === LAS.nombre.trim());
  const entrar = await pedir('/api/las/entrar', { metodo: 'POST', cuerpo: { id: yo.id, cedula: LAS.cedula } });
  caso('el LAS entra con su cédula', entrar.status === 200, entrar.json);

  const cat = (await pedir('/api/catalogos')).json;
  caso('catálogo con hoy y eventos de Nutresa', cat.hoy === HOY && cat.eventos.length > 0 && !cat.eventos.includes('NA'), cat.hoy);
  // E1 y E2 son eventos distintos al que la persona A tiene en la base (para probar la petición de cambio).
  const [E1, E2] = cat.eventos.filter((e) => e !== String(A.evento).trim().toUpperCase());
  caso('el catálogo trae la marca de cada evento y los correos', cat.eventoMarca[E1] && cat.correos.rutero.includes('brayan') && cat.correos.peticiones.includes('miguel'), cat.correos);

  quien = 'admin';
  const admin = await pedir('/api/admin/login', { metodo: 'POST', cuerpo: SUPER });
  quien = 'las';
  caso('el área entra (super usuario de la copia)', admin.status === 200, admin.json);

  let r = await pedir('/api/programacion', { metodo: 'POST', cuerpo: { cedula: A.cedula, sap: saps[1], evento: E1, dias: turno(5, 12) } });
  caso('no se programan días de hoy o anteriores', r.status === 400, r.json);

  const diasA = turno(12, 20);
  diasA[21] = { novedad: cat.novedades[0] };
  r = await pedir('/api/programacion', { metodo: 'POST', cuerpo: { cedula: A.cedula, sap: saps[1], evento: E1, dias: diasA } });
  caso('programación nueva de mañana en adelante', r.status === 200, r.json);
  caso('evento distinto al de la base → petición de cambio', r.json && r.json.cambio === true, r.json);
  const idA1 = r.json && r.json.id;

  r = await pedir('/api/programacion', { metodo: 'POST', cuerpo: { cedula: A.cedula, sap: saps[2], evento: E2, dias: turno(15, 15, '18:00', '22:00') } });
  caso('otro evento el mismo día → 409 evento', r.status === 409 && r.json.error === 'evento' && r.json.eventos[0].evento === E1, r.json);

  r = await pedir('/api/programacion', { metodo: 'POST', cuerpo: { cedula: A.cedula, sap: saps[2], evento: E2, dias: turno(15, 15, '18:00', '22:00'), unificarEvento: true } });
  caso('con unificarEvento se guarda', r.status === 200, r.json);
  let rut = (await pedir('/api/las/rutero')).json;
  const progsA = rut.programados.find((p) => p.cedula === A.cedula).programaciones;
  caso('la otra programación pasó al evento nuevo', progsA.every((p) => p.evento === E2), progsA.map((p) => p.evento));

  r = await pedir('/api/programacion', { metodo: 'POST', cuerpo: { cedula: A.cedula, sap: saps[3], evento: E2, dias: turno(16, 16, '12:00', '14:00') } });
  caso('choque de horario → 409 cruce', r.status === 409 && r.json.error === 'cruce', r.json);

  r = await pedir('/api/programacion', { metodo: 'POST', cuerpo: { cedula: A.cedula, sap: saps[3], evento: E2, dias: turno(16, 16, '18:00', '20:00') } });
  caso('turnos que se tocan (10-6 y 6-8) sí se permiten', r.status === 200, r.json);
  caso('la petición de cambio no se repite', r.json && r.json.cambio === false, r.json);

  // Modificar una programación con días pasados: los días 0..10 no cambian.
  r = await pedir('/api/programacion/fx-b', { metodo: 'PUT', cuerpo: { evento: 'E-VIEJO', dias: turno(0, 30, '08:00', '16:00') } });
  caso('modificar con un evento que no existe → 400', r.status === 400, r.json);
  r = await pedir('/api/programacion/fx-b', { metodo: 'PUT', cuerpo: { evento: E1, dias: turno(0, 30, '08:00', '16:00') } });
  caso('modificar con otro evento y días pasados → se separa', r.status === 200 && r.json.id !== 'fx-b', r.json);
  rut = (await pedir('/api/las/rutero')).json;
  const progsB = rut.programados.find((p) => p.cedula === B.cedula).programaciones;
  const vieja = progsB.find((p) => p.id === 'fx-b');
  const nueva = progsB.find((p) => p.id !== 'fx-b');
  caso('días pasados conservan horario y evento', vieja.evento === 'E-VIEJO' && vieja.dias[2].inicio === '10:00' && vieja.dias.slice(11).every((d) => !d), vieja);
  caso('días futuros quedan con el evento nuevo y el horario nuevo', nueva.evento === E1 && nueva.dias.slice(0, 11).every((d) => !d) && nueva.dias[11].inicio === '08:00', nueva);

  r = await pedir(`/api/programacion/${nueva.id}`, { metodo: 'PUT', cuerpo: { evento: E1, dias: turno(11, 15, '09:00', '17:00') } });
  caso('modificar sin cambiar evento → misma programación', r.status === 200 && r.json.id === nueva.id, r.json);

  r = await pedir(`/api/programacion/${idA1}/cancelar`, { metodo: 'POST' });
  caso('cancelar desde mañana', r.status === 200, r.json);

  r = await pedir('/api/programacion/fx-ajeno', { metodo: 'PUT', cuerpo: { evento: E1, dias: turno(12, 14) } });
  caso('otro equipo → 403', r.status === 403, r.json);
  r = await pedir('/api/programacion/fx-ajeno/cancelar', { metodo: 'POST' });
  caso('cancelar de otro equipo → 403', r.status === 403, r.json);

  // Estados de la solicitud: pendiente → cargada (área) → pendiente otra vez si el LAS la modifica.
  rut = (await pedir('/api/las/rutero')).json;
  const progN = rut.programados.find((p) => p.cedula === B.cedula).programaciones.find((p) => p.id === nueva.id);
  caso('lo que registra el LAS queda pendiente', progN.estado === 'pendiente', progN);
  quien = 'admin';
  r = await pedir(`/api/admin/programacion/${nueva.id}/estado`, { metodo: 'POST', cuerpo: { estado: 'cargada' } });
  caso('el área la marca cargada', r.status === 200, r.json);
  r = await pedir(`/api/admin/programacion/${nueva.id}/estado`, { metodo: 'POST', cuerpo: { estado: 'devuelta' } });
  caso('devolver sin comentario → 400', r.status === 400, r.json);
  quien = 'las';
  rut = (await pedir('/api/las/rutero')).json;
  caso('el LAS ve "cargada"', rut.programados.find((p) => p.cedula === B.cedula).programaciones.find((p) => p.id === nueva.id).estado === 'cargada');
  r = await pedir(`/api/programacion/${nueva.id}`, { metodo: 'PUT', cuerpo: { evento: E1, dias: turno(11, 16, '09:00', '17:00') } });
  rut = (await pedir('/api/las/rutero')).json;
  caso('si el LAS la modifica vuelve a pendiente', rut.programados.find((p) => p.cedula === B.cedula).programaciones.find((p) => p.id === nueva.id).estado === 'pendiente');
  quien = 'admin';
  r = await pedir('/api/admin/solicitudes');
  const grupo = r.json.las.find((l) => l.nombre === LAS.nombre.trim());
  caso('el área ve las solicitudes por LAS', grupo && grupo.pendientes >= 4, grupo && { pendientes: grupo.pendientes });
  r = await pedir('/api/admin/programacion/fx-ajeno/estado', { metodo: 'POST', cuerpo: { estado: 'devuelta', comentario: 'Falta el SAP correcto' } });
  caso('el área devuelve con comentario', r.status === 200, r.json);
  quien = 'las';

  const { cab, filas } = await filasRutero('/api/admin/rutero.xlsx');
  caso('el 03 Rutero tiene las 18 columnas del formato', cab.length === 18 && !cab.includes('MOTIVO'), cab);
  const deA1 = filas.filter((f) => String(f['CEDULA PERSONAL']) === A.cedula && String(f.SAP) === saps[1]);
  const est = (i) => deA1[i] && [deA1[i].ESTADO, deA1[i]['ESTADO DE LA VISITA']].join(' / ');
  caso('día con horario → PDT VISITA / PROGRAMACION', est(11) === 'PDT VISITA / PROGRAMACION' || est(12) !== undefined, est(11));
  caso('cancelado por el LAS → CANCELADA / CANCELADA POR LAS', est(12) === 'CANCELADA / CANCELADA POR LAS', est(12));
  caso('novedad → CANCELADA / nombre de la novedad', est(21) === `CANCELADA / ${cat.novedades[0]}`, est(21));
  caso('día libre → CANCELADA / SIN PROGRAMACION', est(25) === 'CANCELADA / SIN PROGRAMACION', est(25));
  caso('la MARCA sale del evento según la base', deA1.every((f) => f.MARCA === cat.eventoMarca[f.EVENTO]), deA1[0] && [deA1[0].EVENTO, deA1[0].MARCA]);
  caso('las devueltas no salen en el 03 Rutero', !filas.some((f) => String(f['CEDULA PERSONAL']) === AJENO.cedula));

  // Formato Rutero para enviar al área.
  const fx = await pedir('/api/las/formato.xlsx', { crudo: true });
  const fwb = new ExcelJS.Workbook();
  await fwb.xlsx.load(fx.buf);
  const panel = fwb.getWorksheet('PANEL');
  const nombres = fwb.worksheets.map((w) => w.name).join(',');
  caso('el formato trae las hojas del original', nombres === 'PANEL,EVENTOS,CREAR USUARIOS,CREAR PDV,MASTER USUARIOS,MASTER PDV,Hoja1', nombres);
  const filasPanel = [];
  for (let i = 7; i <= panel.rowCount; i++) if (panel.getCell(i, 2).value) filasPanel.push(panel.getRow(i));
  const filaB = filasPanel.find((f) => String(f.getCell(10).value) === B.cedula && f.getCell(6).value === E1);
  caso('PANEL: una fila por programación del LAS', filasPanel.length === rut.programados.reduce((n, p) => n + p.programaciones.length, 0), filasPanel.length);
  caso('PANEL: fórmulas de búsqueda y horas', filaB && String(filaB.getCell(3).value.formula).includes("'MASTER PDV'!B:C") && String(filaB.getCell(12).value.formula).startsWith('+SUM('), filaB && filaB.getCell(3).value);
  const hora = filaB && filaB.getCell(14 + 11 * 2).value; // ExcelJS lee las horas como fecha del 30/12/1899
  caso('PANEL: días como hora de Excel', hora instanceof Date && hora.toISOString().slice(11, 16) === '09:00', hora);
  const filaA = filasPanel.find((f) => String(f.getCell(10).value) === A.cedula && String(f.getCell(2).value) === saps[1]);
  caso('PANEL: novedad y cancelación como texto', filaA && filaA.getCell(14 + 21 * 2).value === cat.novedades[0] && filaA.getCell(14 + 12 * 2).value === 'CANCELADA POR LAS', filaA && [filaA.getCell(14 + 21 * 2).value, filaA.getCell(14 + 12 * 2).value]);
  r = await pedir('/api/las/rutero/enviar', { metodo: 'POST' });
  caso('ya no existe el envío por correo', r.status === 404, r.status);

  // Peticiones
  caso('el catálogo trae marca → eventos de la base', Array.isArray(cat.marcaEventos[cat.eventoMarca[E1]]) && cat.marcaEventos[cat.eventoMarca[E1]].includes(E1), cat.marcaEventos[cat.eventoMarca[E1]]);
  const otraMarca = Object.keys(cat.marcaEventos).find((m) => !cat.marcaEventos[m].includes(E1));
  const pu = { TELEFONO: '300123', CEDULA: '990000111', NOMBRE: 'Prueba Rutero', REGIONAL: 'BOGOTA', CIUDAD: 'BOGOTA', MARCA: cat.eventoMarca[E1], EVENTO: E1, RUTA: 'INVENTADA1' };
  r = await pedir('/api/peticiones/usuario', { metodo: 'POST', cuerpo: pu });
  caso('teléfono corto → 400', r.status === 400, r.json);
  r = await pedir('/api/peticiones/usuario', { metodo: 'POST', cuerpo: { ...pu, TELEFONO: '3001234567', MARCA: otraMarca } });
  caso('marca y evento que no van juntos → 400', r.status === 400 && /no pertenece/.test(r.json.error), r.json);
  r = await pedir('/api/peticiones/usuario', { metodo: 'POST', cuerpo: { ...pu, TELEFONO: '3001234567' } });
  caso('petición de usuario registrada y pendiente', r.status === 200 && r.json.estado === 'pendiente' && r.json.datos.LAS === LAS.nombre && r.json.datos.ESTADO === 'ACTIVO', r.json);
  const rutasBase = new Set(usuarios.map((u) => u.ruta));
  const ruta1 = r.json && r.json.datos.RUTA;
  caso('la RUTA se genera sola (evento + regional + número), no la que escribe el LAS', /^[A-Z]{3}BO\d{3}$/.test(ruta1) && ruta1 !== 'INVENTADA1', ruta1);
  caso('la RUTA nueva no existe en la base', !rutasBase.has(ruta1), ruta1);
  r = await pedir('/api/peticiones/usuario', { metodo: 'POST', cuerpo: { ...pu, TELEFONO: '3001234567', CEDULA: '990000222', REEMPLAZA: B.cedula } });
  caso('quien reemplaza se queda con la ruta de quien sale', r.status === 200 && r.json.datos.RUTA === B.ruta && r.json.datos.REEMPLAZA.includes(B.cedula), r.json && r.json.datos);
  r = await pedir('/api/peticiones/usuario', { metodo: 'POST', cuerpo: { ...pu, TELEFONO: '3001234567', CEDULA: '990000333', REEMPLAZA: AJENO.cedula } });
  caso('no se reemplaza a alguien de otro equipo', r.status === 400, r.json);
  r = await pedir('/api/peticiones/usuario', { metodo: 'POST', cuerpo: { ...pu, TELEFONO: '3001234567', CEDULA: '990000444', REGIONAL: 'MEDELLIN' } });
  const ruta2 = r.json && r.json.datos.RUTA;
  caso('dos peticiones seguidas no repiten ruta (y usan la regional: ME)', /^[A-Z]{3}ME\d{3}$/.test(ruta2) && ruta2.slice(5) !== ruta1.slice(5), [ruta1, ruta2]);
  r = await pedir('/api/peticiones/usuario', { metodo: 'POST', cuerpo: { ...pu, TELEFONO: '3001234567' } });
  caso('la misma cédula otra vez → 409', r.status === 409, r.json);
  r = await pedir('/api/peticiones/usuario', { metodo: 'POST', cuerpo: { ...pu, TELEFONO: '3001234567', CEDULA: C.cedula } });
  caso('cédula que ya está en el equipo → 409', r.status === 409, r.json);
  const equipo = (await pedir('/api/las/equipo')).json;
  caso('la persona pedida ya se puede programar', equipo.some((p) => p.cedula === '990000111'));

  const pxl = await pedir('/api/peticiones/usuario.xlsx', { crudo: true });
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(pxl.buf);
  const cols = libro.worksheets[0].getRow(1).values.slice(1);
  caso('el Excel de peticiones trae las columnas de Nutresa', cols[1] === 'A QUIEN REEMPLAZA' && cols.slice(2, 15).join(',') ==='TELEFONO,CEDULA,REGIONAL,CIUDAD,NOMBRE,MARCA,EVENTO,RUTA,CARGO,LAS,ENVIO_CAMP,ESTADO,created', cols);
  const tipos = [];
  libro.worksheets[0].eachRow((row, n) => { if (n > 1) tipos.push(row.getCell(1).value); });
  caso('incluye la creación y el cambio de evento', tipos.includes('CREACION DE USUARIO') && tipos.includes('CAMBIO DE EVENTO'), tipos);

  const pp = { SAP: '99887766', PDV: 'Tienda Prueba', REGIONAL: 'BOGOTA', CIUDAD: 'BOGOTA', DIRECCION: 'CL 1 2 3', CANAL: cat.canales[0], EVENTO: E1, MARCA: cat.eventoMarca[E1] };
  r = await pedir('/api/peticiones/pdv', { metodo: 'POST', cuerpo: pp });
  caso('petición de PDV registrada sin geolocalización', r.status === 200 && r.json.estado === 'pendiente' && r.json.datos.LATITUD === 'SIN GEO' && r.json.datos.LONGITUD === 'SIN GEO' && r.json.datos.GEO_OK === 'NA', r.json);
  r = await pedir('/api/pdv?q=99887766');
  caso('el PDV pedido NO aparece para programar', r.json.length === 0, r.json);
  r = await pedir('/api/peticiones/pdv', { metodo: 'POST', cuerpo: { ...pp, SAP: saps[0] } });
  caso('SAP que ya existe → 409', r.status === 409, r.json);

  // Borrador de "Crear rutero": sigue al LAS (en la base), es solo suyo y se termina al registrar.
  r = await pedir('/api/borrador');
  caso('sin borrador al empezar', r.status === 200 && r.json === null, r.json);
  const borr = { paso: 4, persona: { cedula: A.cedula, nombre: A.nombre }, pdv: { sap: saps[1], nombre: 'PDV X' }, evento: E1, dias: turno(12, 14) };
  r = await pedir('/api/borrador', { metodo: 'PUT', cuerpo: borr });
  caso('se guarda el borrador', r.status === 200, r.json);
  r = await pedir('/api/borrador');
  caso('se lee el borrador (paso, persona, días)', r.json && r.json.paso === 4 && r.json.persona.cedula === A.cedula && r.json.dias[12].inicio === '10:00' && r.json.evento === E1, r.json);
  r = await pedir('/api/borrador', { metodo: 'PUT', cuerpo: { ...borr, persona: { cedula: AJENO.cedula, nombre: AJENO.nombre } } });
  caso('no se guarda un borrador con alguien de otro equipo', r.status === 403, r.json);
  r = await pedir('/api/borrador', { metodo: 'PUT', cuerpo: { ...borr, evento: 'EVENTO INVENTADO', dias: [{ inicio: 'x' }] } });
  r = await pedir('/api/borrador');
  caso('el borrador limpia datos raros (evento y días)', r.json && r.json.evento === '' && r.json.dias.length === 31 && r.json.dias.every((d) => d === null), r.json && [r.json.evento, r.json.dias.length]);
  quien = 'otro';
  const yoOtro = lista.find((l) => l.nombre === OTRO_LAS.nombre.trim());
  await pedir('/api/las/entrar', { metodo: 'POST', cuerpo: { id: yoOtro.id, cedula: OTRO_LAS.cedula } });
  r = await pedir('/api/borrador');
  caso('otro LAS no ve el borrador', r.status === 200 && r.json === null, r.json);
  quien = 'las';
  r = await pedir('/api/borrador/terminar', { metodo: 'POST' });
  r = await pedir('/api/borrador');
  caso('al terminar (registrar o empezar de nuevo) ya no hay borrador', r.json === null, r.json);

  // Área interna: peticiones
  quien = 'admin';
  r = await pedir('/api/admin/peticiones');
  caso('el área ve las peticiones (usuario incluye cambios)', r.json.usuario.length >= 2 && r.json.pdv.length === 1, { u: r.json.usuario.length, p: r.json.pdv.length });
  const idPdv = r.json.pdv[0].id;
  r = await pedir(`/api/admin/peticiones/${idPdv}/estado`, { metodo: 'POST', cuerpo: { estado: 'cargada' } });
  caso('el área marca la petición cargada', r.status === 200 && r.json.estado === 'cargada', r.json);
  r = await pedir('/api/admin/rutas-duplicadas');
  caso('comprobación de rutas: las nuevas no quedan repetidas', r.status === 200 && Array.isArray(r.json) && !r.json.some((d) => d.personas.some((p) => p.origen === 'Petición')), r.json);
  r = await pedir('/api/admin/peticiones-usuario.xlsx', { crudo: true });
  caso('descarga de peticiones de usuario', r.status === 200 && r.buf.length > 1000, r.status);
  quien = 'las';
  r = await pedir('/api/peticiones');
  caso('el LAS ve el estado de sus peticiones', r.json.find((p) => p.id === idPdv).estado === 'cargada');

  // Carga directa a Nutresa (solo área interna; en pruebas va a data/cargas-nutresa.jsonl)
  r = await pedir('/api/admin/carga/catalogos');
  caso('un LAS no ve la carga a Nutresa', r.status === 401, r.status);
  quien = 'admin';
  const cc = (await pedir('/api/admin/carga/catalogos')).json;
  caso('el área ve la carga (habilitada, simulada, con LAS)', cc.habilitada && cc.simulada && cc.las.length > 0 && cc.colecciones.usuario === 'usuarios_nutresa', { h: cc.habilitada, s: cc.simulada });
  const [marcaU, evsU] = Object.entries(cc.marcaEventos)[0];
  r = await pedir(`/api/admin/carga/ruta?evento=${encodeURIComponent(evsU[0])}&regional=BOGOTA`);
  caso('sugiere una ruta para evento + regional', /^[A-Z]{3}BO\d{3}$/.test(r.json.ruta), r.json);
  const rutaNueva = r.json.ruta;
  const baseU = { TELEFONO: '3001234567', NOMBRE: 'Prueba Carga Directa', CIUDAD: 'BOGOTA', REGIONAL: 'BOGOTA', MARCA: marcaU, EVENTO: evsU[0], RUTA: rutaNueva, LAS: cc.las[0], CARGO: 'PROMOTOR', ENVIO_CAMP: 'ENVIO', ESTADO: 'ACTIVO' };
  r = await pedir('/api/admin/carga/usuario', { metodo: 'POST', cuerpo: { ...baseU, CEDULA: B.cedula } });
  caso('cédula que ya está en Nutresa → 409 (no se edita)', r.status === 409 && r.json.campo === 'CEDULA', r.json);
  r = await pedir('/api/admin/carga/usuario', { metodo: 'POST', cuerpo: { ...baseU, CEDULA: '990000111', EVENTO: 'EVENTO INVENTADO' } });
  caso('evento que no es de la marca → 400', r.status === 400 && r.json.campo === 'EVENTO', r.json);
  const petU = cc.pendientes.find((p) => p.tipo === 'usuario');
  r = await pedir('/api/admin/carga/usuario', { metodo: 'POST', cuerpo: { ...baseU, CEDULA: '990000111', peticion: petU && petU.id } });
  caso('carga un usuario nuevo con números como en la base', r.status === 200 && r.json.datos.CEDULA === 990000111 && r.json.datos.TELEFONO === 3001234567, r.json);
  caso('la petición de la que salió queda cargada', !petU || (r.json.peticion && r.json.peticion.estado === 'cargada'), r.json.peticion);
  const enviados = fs.readFileSync(path.join(DESTINO, 'cargas-nutresa.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  caso('el registro tiene exactamente las 12 columnas de usuarios_nutresa', enviados[0].coleccion === 'usuarios_nutresa'
    && ['TELEFONO', 'CEDULA', 'REGIONAL', 'CIUDAD', 'NOMBRE', 'MARCA', 'EVENTO', 'RUTA', 'CARGO', 'LAS', 'ENVIO_CAMP', 'ESTADO'].every((k) => k in enviados[0]), Object.keys(enviados[0]));
  r = await pedir('/api/admin/carga/usuario', { metodo: 'POST', cuerpo: { ...baseU, CEDULA: '990000111' } });
  caso('el usuario cargado ya cuenta: repetirlo → 409', r.status === 409, r.json);
  r = await pedir('/api/admin/carga/usuario', { metodo: 'POST', cuerpo: { ...baseU, CEDULA: '990000222' } });
  caso('ruta en otra persona activa → aviso 409', r.status === 409 && r.json.ruta === true, r.json);
  r = await pedir('/api/admin/carga/usuario', { metodo: 'POST', cuerpo: { ...baseU, CEDULA: '990000222', confirmarRuta: true } });
  caso('confirmando el reemplazo se carga', r.status === 200, r.json);
  const [marcaP, evsP] = Object.entries(cc.marcaEventosPdv)[0];
  const baseP = { SAP: '99887766', PDV: 'Tienda Prueba Carga', DIRECCION: 'CL 1 2 3', CIUDAD: 'BOGOTA', REGIONAL: 'BOGOTA', CANAL: cc.canales[0], MARCA: marcaP, EVENTO: evsP[0] };
  r = await pedir('/api/admin/carga/pdv', { metodo: 'POST', cuerpo: baseP });
  caso('PDV sin coordenadas → SIN GEO y GEO_OK NA', r.status === 200 && r.json.datos.LATITUD === 'SIN GEO' && r.json.datos.GEO_OK === 'NA', r.json);
  r = await pedir('/api/admin/carga/pdv', { metodo: 'POST', cuerpo: { ...baseP, SAP: '99887767', LATITUD: '4,6097', LONGITUD: '-74.0817' } });
  caso('PDV con coordenadas → GEO_OK OK', r.status === 200 && r.json.datos.LATITUD === '4.6097' && r.json.datos.GEO_OK === 'OK', r.json);
  r = await pedir('/api/admin/carga/pdv', { metodo: 'POST', cuerpo: baseP });
  caso('SAP que ya existe → 409', r.status === 409 && r.json.campo === 'SAP', r.json);
}

main()
  .catch((e) => { fallas++; console.error(e); })
  .finally(() => {
    servidor.kill();
    fs.rmSync(DESTINO, { recursive: true, force: true });
    console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
    process.exit(fallas ? 1 : 0);
  });
