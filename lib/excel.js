// Utilidades para leer celdas de Excel con exceljs.

// Devuelve el valor "plano" de una celda (resuelve fórmulas, rich text, etc.).
function valor(cell) {
  let v = cell && cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if ('richText' in v) v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) v = v.text;
    else if ('error' in v) return null;
  }
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : v;
  }
  return v;
}

// Convierte una hora de Excel (Date de 1899 o fracción de día) a "HH:MM".
function aHora(v) {
  if (v === null || v === undefined) return null;
  let minutos;
  if (v instanceof Date) minutos = v.getUTCHours() * 60 + v.getUTCMinutes() + Math.round(v.getUTCSeconds() / 60);
  else if (typeof v === 'number' && v >= 0 && v < 1) minutos = Math.round(v * 24 * 60);
  else return null;
  const h = Math.floor(minutos / 60) % 24;
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Normaliza códigos numéricos (SAP, cédula) a texto sin decimales.
function aCodigo(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return String(Math.round(v));
  const t = String(v).trim().replace(/\.0+$/, '');
  return t === '' ? null : t;
}

function aTexto(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

module.exports = { valor, aHora, aCodigo, aTexto };
