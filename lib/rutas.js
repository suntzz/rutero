// Código de ruta de los promotores: 3 letras del evento + 2 letras de la regional + un número de
// 3 cifras que sigue la secuencia de toda la base (NUTRICION EXPERTA en MEDELLIN → NUTME170).
// Ninguna ruta se repite: solo quien reemplaza a otra persona hereda su ruta, y la persona que sale
// debe quedar inactiva.

const PATRON = /^([A-Z]{3})([A-Z]{2})(\d{3})$/;
const PALABRAS_VACIAS = new Set(['CAMPANA', 'CAMPAÑA', 'LA', 'EL', 'LOS', 'LAS', 'DE', 'DEL', 'Y']);

function sinTildes(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

function activo(u) {
  return !/INACTIVO/i.test(u.estado || '');
}

// Las 3 letras de un evento: las que más usa en la base; si no tiene rutas, las de su primera
// palabra con contenido (CAMPANA SALTIN → SAL).
function codigoEvento(evento, usuarios) {
  const e = sinTildes(evento);
  const cuenta = {};
  for (const u of usuarios) {
    const m = PATRON.exec(u.ruta || '');
    if (m && sinTildes(u.evento) === e) cuenta[m[1]] = (cuenta[m[1]] || 0) + 1;
  }
  const masUsado = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  if (masUsado) return masUsado[0];
  const palabra = e.split(/[^A-Z]+/).find((p) => p && !PALABRAS_VACIAS.has(p)) || e.replace(/[^A-Z]/g, '');
  return palabra.slice(0, 3).padEnd(3, 'X');
}

// Las 2 letras de la regional: sus dos primeras (BOGOTA → BO, MEDELLIN → ME, CALI → CA).
function codigoRegional(regional) {
  return sinTildes(regional).replace(/[^A-Z]/g, '').slice(0, 2).padEnd(2, 'X');
}

// Todas las rutas en uso: base de Nutresa y peticiones del área (pendientes o cargadas).
function rutasEnUso(usuarios, peticiones = []) {
  const rutas = new Set(usuarios.map((u) => sinTildes(u.ruta)).filter((r) => r && r !== 'NA'));
  for (const p of peticiones) {
    if (p.tipo !== 'pdv' && p.estado !== 'devuelta' && p.datos.RUTA) rutas.add(sinTildes(p.datos.RUTA));
  }
  return rutas;
}

function siguienteRuta({ evento, regional, usuarios, peticiones }) {
  const enUso = rutasEnUso(usuarios, peticiones);
  let mayor = 0;
  for (const r of enUso) {
    const m = PATRON.exec(r);
    if (m) mayor = Math.max(mayor, Number(m[3]));
  }
  const prefijo = codigoEvento(evento, usuarios) + codigoRegional(regional);
  for (let n = mayor + 1; ; n++) {
    const ruta = prefijo + String(n).padStart(3, '0');
    if (!enUso.has(ruta)) return ruta;
  }
}

// Rutas que comparten personas activas (en la base o en peticiones vigentes): no debería haber ninguna.
function rutasDuplicadas(usuarios, peticiones = []) {
  const porRuta = new Map();
  const anotar = (ruta, quien) => {
    const r = sinTildes(ruta);
    if (!r || r === 'NA') return;
    if (!porRuta.has(r)) porRuta.set(r, []);
    // La misma persona no se cuenta dos veces.
    if (!porRuta.get(r).some((q) => q.cedula === quien.cedula)) porRuta.get(r).push(quien);
  };
  for (const u of usuarios) {
    if (activo(u)) anotar(u.ruta, { cedula: u.cedula, nombre: u.nombre, las: u.las, origen: 'Nutresa' });
  }
  for (const p of peticiones) {
    // Los cambios de evento son de alguien que ya está en la base, con su misma ruta.
    if (p.tipo !== 'usuario' || p.estado === 'devuelta' || !p.datos.RUTA) continue;
    // Quien reemplaza hereda la ruta de quien sale: no cuenta como repetida.
    const sale = p.datos.REEMPLAZA_CEDULA;
    const lista = porRuta.get(sinTildes(p.datos.RUTA));
    if (sale && lista) porRuta.set(sinTildes(p.datos.RUTA), lista.filter((q) => q.cedula !== sale));
    anotar(p.datos.RUTA, { cedula: p.datos.CEDULA, nombre: p.datos.NOMBRE, las: p.las, origen: 'Petición' });
  }
  return [...porRuta.entries()].filter(([, q]) => q.length > 1).map(([ruta, personas]) => ({ ruta, personas }));
}

module.exports = { siguienteRuta, rutasDuplicadas, codigoEvento, codigoRegional, PATRON };
