// Motor del rutero: replica las fórmulas del "Formato Rutero" y arma
// el archivo "03 Rutero" (una fila por persona, PDV y día).

const DIAS_DEL_FORMATO = 31; // el formato siempre trae 31 columnas de días desde el periodo

const COLUMNAS_RUTERO = [
  'EVENTO', 'MARCA', 'SAP', 'PDV', 'REGIONAL', 'CIUDAD', 'DIRECCION', 'CANAL', 'RUTA',
  'FECHA_VISITA', 'ESTADO', 'HORA DE INGRESO', 'HORA DE SALIDA', 'ESTADO DE LA VISITA',
  'PERSONAL', 'CEDULA PERSONAL', 'LAS', 'LAS CEDULA',
];

// Motivo de los días que el LAS cancela desde "Actualizar rutero".
const MOTIVO_CANCELADA_POR_LAS = 'CANCELADA POR LAS';

function minutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Fechas del periodo: la fecha inicial y los 30 días siguientes (N6, P6 = N6+1, ...).
function fechasDelPeriodo(periodo) {
  const [y, m, d] = periodo.split('-').map(Number);
  const fechas = [];
  for (let i = 0; i < DIAS_DEL_FORMATO; i++) {
    const f = new Date(Date.UTC(y, m - 1, d + i));
    fechas.push(f.toISOString().slice(0, 10));
  }
  return fechas;
}

// Busca un PDV: primero en MASTER PDV y luego en CREAR PDV (como el IFERROR(VLOOKUP...)).
function buscarPdv(m, sap) {
  return m.pdv[sap] || m.pdvNuevos[sap] || null;
}

// Busca una persona: primero en MASTER USUARIOS y luego en CREAR USUARIOS.
function buscarPersona(m, cedula) {
  return m.usuarios[cedula] || m.usuariosNuevos[cedula] || null;
}

// Un día con horario queda PDT VISITA / PROGRAMACION. Un día sin horario queda CANCELADA y en
// ESTADO DE LA VISITA va el motivo: la novedad, CANCELADA POR LAS o SIN PROGRAMACION (día libre).
function estadoDelDia(dia) {
  if (dia && dia.inicio && dia.fin) return { estado: 'PDT VISITA', visita: 'PROGRAMACION' };
  if (dia && dia.novedad) return { estado: 'CANCELADA', visita: dia.novedad };
  if (dia && dia.cancelada) return { estado: 'CANCELADA', visita: MOTIVO_CANCELADA_POR_LAS };
  return { estado: 'CANCELADA', visita: 'SIN PROGRAMACION' };
}

// Columnas calculadas del PANEL (C, D, E, G, H, I, K, L, M).
function calcularPanel(m, p) {
  const pdv = buscarPdv(m, p.sap);
  const per = buscarPersona(m, p.cedula);
  const revisar = 'REVISAR INFORMACION';
  let inicio = 0;
  let fin = 0;
  for (const d of p.dias || []) {
    if (d && d.inicio && d.fin) {
      inicio += minutos(d.inicio);
      fin += minutos(d.fin);
    }
  }
  return {
    pdv: pdv ? pdv.nombre : revisar,
    canal: pdv ? pdv.canal : revisar,
    las: per ? per.las : revisar,
    regional: per ? per.regional : revisar,
    ciudad: pdv ? pdv.ciudad : revisar,
    asesor: per ? per.nombre : revisar,
    horasProgramadas: fin && inicio ? (fin - inicio) / 60 : 0,
  };
}

// Genera las filas del 03 Rutero: agrupado por día y, dentro del día, en el orden del formato.
// MARCA sale del evento de la programación (en la base cada evento tiene una sola marca).
function generarRutero(m, programaciones, periodo, eventoMarca = {}) {
  const fechas = fechasDelPeriodo(periodo);
  const filas = [];
  fechas.forEach((fecha, i) => {
    for (const p of programaciones) {
      const pdv = buscarPdv(m, p.sap) || {};
      const per = buscarPersona(m, p.cedula) || {};
      const dia = (p.dias || [])[i] || null;
      const { estado, visita } = estadoDelDia(dia);
      const conHora = visita === 'PROGRAMACION';
      filas.push({
        'EVENTO': p.evento || '',
        'MARCA': p.marca || eventoMarca[p.evento] || per.marca || '',
        'SAP': p.sap,
        'PDV': pdv.nombre || '',
        'REGIONAL': pdv.regional || '',
        'CIUDAD': pdv.ciudad || '',
        'DIRECCION': pdv.direccion || '',
        'CANAL': pdv.canal || '',
        'RUTA': per.ruta || '',
        'FECHA_VISITA': fecha,
        'ESTADO': estado,
        'HORA DE INGRESO': conHora ? dia.inicio : '',
        'HORA DE SALIDA': conHora ? dia.fin : '',
        'ESTADO DE LA VISITA': visita,
        'PERSONAL': per.nombre || '',
        'CEDULA PERSONAL': p.cedula,
        'LAS': per.las || '',
        'LAS CEDULA': 0,
      });
    }
  });
  return filas;
}

module.exports = {
  COLUMNAS_RUTERO, DIAS_DEL_FORMATO, MOTIVO_CANCELADA_POR_LAS, fechasDelPeriodo, buscarPdv, buscarPersona,
  calcularPanel, generarRutero, estadoDelDia, minutos,
};
