// Borrador de "Crear rutero": lo que el LAS va llenando se guarda en la base Rutero_borradores
// (lo sigue en cualquier navegador o celular) y, además, en este navegador por si se cae la red.
// Uno por LAS, solo para el mes abierto; el servidor lo da por vencido a las 72 horas y se termina
// al registrar la solicitud o al tocar "Empezar de nuevo".
// Para no llenar la base, al servidor se manda al cambiar de paso y, mientras marca días, como mucho
// uno cada 4 s.

import { api } from './api';

const VIGENCIA_MS = 72 * 60 * 60 * 1000;
const ESPERA_MS = 4000;
const clave = (las) => `rutero-borrador:${las.nombre}`;

let pendiente = null; // { las, datos } aún no enviado al servidor
let temporizador = null;

function leerLocal(las, periodo) {
  try {
    const b = JSON.parse(localStorage.getItem(clave(las)));
    if (!b || !b.persona || b.periodo !== periodo || Date.now() - b.guardado > VIGENCIA_MS) return null;
    return b;
  } catch {
    return null;
  }
}

function guardarLocal(las, datos) {
  try {
    localStorage.setItem(clave(las), JSON.stringify({ ...datos, guardado: Date.now() }));
  } catch { /* sin almacenamiento (incógnito, lleno): queda solo en el servidor */ }
}

function borrarLocal(las) {
  try {
    localStorage.removeItem(clave(las));
  } catch { /* nada que borrar */ }
}

// Primero el del servidor (sirve en cualquier dispositivo); si no responde, el de este navegador.
export async function leerBorrador(las, periodo) {
  try {
    const b = await api('/api/borrador');
    if (!b) { borrarLocal(las); return null; }
    return { ...b, guardado: new Date(b.guardado).getTime() };
  } catch {
    return leerLocal(las, periodo);
  }
}

function enviar(keepalive = false) {
  clearTimeout(temporizador);
  temporizador = null;
  if (!pendiente) return;
  const { datos } = pendiente;
  pendiente = null;
  fetch('/api/borrador', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos), keepalive, credentials: 'same-origin',
  }).catch(() => { /* queda la copia local */ });
}

export function guardarBorrador(las, datos, { ya = false } = {}) {
  guardarLocal(las, datos);
  pendiente = { las, datos };
  if (ya) enviar();
  else if (!temporizador) temporizador = setTimeout(enviar, ESPERA_MS);
}

export function borrarBorrador(las) {
  clearTimeout(temporizador);
  temporizador = null;
  pendiente = null;
  borrarLocal(las);
  api('/api/borrador/terminar', { method: 'POST' }).catch(() => {});
}

// Si cierra la pestaña antes de los 4 s, se manda lo que falte.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => enviar(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviar(true); });
}

export function haceCuanto(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}
