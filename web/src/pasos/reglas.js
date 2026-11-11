// Reglas del calendario que el front calcula igual que el servidor (server.js: cruces y eventos).
import { fecha, minutos, rango12 } from '../api';
import { nombreNovedad } from '../Calendario';

export function vacios(n) {
  return Array.from({ length: n }, () => null);
}

// Índices del mes que ya no se pueden tocar: hoy y los días anteriores (hora de Colombia).
export function diasCerrados(cat) {
  return new Set(cat.fechas.flatMap((f, i) => (f <= cat.hoy ? [i] : [])));
}

export function contar(dias) {
  let diasT = 0; let horas = 0; let nov = 0;
  dias.forEach((d) => {
    if (!d || d.cancelada) return;
    if (d.novedad) nov++;
    else { diasT++; horas += (minutos(d.fin) - minutos(d.inicio)) / 60; }
  });
  return { diasT, horas, nov };
}

// Horarios más usados, como botones; "Otro horario" abre las listas de horas.
export const HORARIOS = [['10:00', '18:00'], ['11:00', '19:00'], ['09:00', '17:00'], ['08:00', '16:00'], ['06:00', '14:00'], ['14:00', '22:00']];

// Días en que la persona ya está ocupada a esa hora en otra programación (agenda del servidor).
export function calcularChoques(agenda, dias, cerrados = new Set()) {
  const lista = agenda.filter((o) => {
    const d = dias[o.dia];
    if (cerrados.has(o.dia) || !d || !d.inicio) return false;
    return o.novedad || (minutos(d.inicio) < minutos(o.fin) && minutos(o.inicio) < minutos(d.fin));
  });
  return { dias: new Set(lista.map((o) => o.dia)), lista };
}

// Una persona tiene un solo evento por día: otros eventos que ya tiene en los días marcados.
export function otrosEventos(agenda, dias, evento) {
  const m = new Map();
  for (const o of agenda) {
    if (!dias[o.dia] || o.evento === evento) continue;
    if (!m.has(o.evento)) m.set(o.evento, new Set());
    m.get(o.evento).add(o.dia);
  }
  return [...m.entries()].map(([ev, ds]) => ({ evento: ev, dias: [...ds].sort((a, b) => a - b) }));
}

export function numerosDeDia(cat, indices) {
  return indices.map((i) => fecha(cat.fechas[i]).getUTCDate());
}

export function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

// Agrupa los días por lo que se marcó: "10 a. m. – 6 p. m." → [2, 3, 4…], "Vacaciones" → [10, 11]…
export function agruparDias(cat, dias) {
  const grupos = new Map();
  dias.forEach((d, i) => {
    const clave = !d ? 'Libre' : d.cancelada ? 'Cancelado' : d.novedad ? nombreNovedad(d.novedad) : rango12(d.inicio, d.fin);
    const tipo = !d ? 'libre' : d.novedad || d.cancelada ? 'novedad' : 'trabaja';
    if (!grupos.has(clave)) grupos.set(clave, { tipo, dias: [] });
    const f = fecha(cat.fechas[i]);
    grupos.get(clave).dias.push(i === cat.fechas.length - 1 && f.getUTCDate() === 1 ? `${f.getUTCDate()} (mes sig.)` : f.getUTCDate());
  });
  const orden = { trabaja: 0, novedad: 1, libre: 2 };
  return [...grupos.entries()].sort((a, b) => orden[a[1].tipo] - orden[b[1].tipo]);
}
