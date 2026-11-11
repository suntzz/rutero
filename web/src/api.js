// Llamadas al servidor. Lanza un Error con .status y .datos cuando la respuesta no es OK.
export async function api(url, opciones = {}) {
  let r;
  try {
    r = await fetch(url, {
      headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opciones,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('No hay conexión con el servidor. Revisa tu internet y vuelve a tocar el botón; no se guardó nada todavía.'), { status: 0 });
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(datos.error || 'Algo salió mal. Intenta de nuevo.'), { status: r.status, datos });
  return datos;
}

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function nombreMes(iso) {
  const f = fecha(iso);
  return `${MESES[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
}

export function minutos(h) {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
}

export function capital(t) {
  return t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export function sinTildes(t) {
  return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

// Clave de una lista animada: cambia solo si cambian los resultados, no con cada tecla
// (un espacio o una letra que no filtra nada no debe volver a animar la lista).
export function claveLista(ids) {
  return ids.join('|');
}

// "13:30" → "1:30 p. m."; "10:00" → "10 a. m." (las horas se guardan siempre en 24 h).
export function hora12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${sufijo}` : `${h12} ${sufijo}`;
}

// Versión corta para celdas pequeñas: "10a", "6:30p".
export function horaCorta(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`;
}

export function rango12(inicio, fin) {
  return `${hora12(inicio)} a ${hora12(fin)}`;
}
