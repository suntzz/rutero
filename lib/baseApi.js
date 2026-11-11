// Cliente de las bases propias de Rutero en la API dinamic-db (Rutero_programaciones,
// Rutero_peticiones, Rutero_config, Rutero_borradores). Solo GET (listar) y POST (agregar): nada se edita ni se borra;
// cada cambio es un registro nuevo con la versión siguiente.
// usuarios_nutresa y pdv_nutresa NO se tocan desde aquí (ver lib/nutresa.js, solo lectura).

const seg = require('./seguridad');

const BASE = (seg.variable('RUTERO_API_URL') || seg.variable('NUTRESA_API_URL')
  || 'https://botai.smartdataautomation.com/api_backend_ai/dinamic-db/report/119').replace(/\/+$/, '');
const ESPERA_MS = 20000;
const PERMITIDAS = new Set(['Rutero_programaciones', 'Rutero_peticiones', 'Rutero_config', 'Rutero_borradores']);

function encabezados() {
  return {
    Authorization: `Token ${seg.variable('RUTERO_API_TOKEN') || seg.variable('NUTRESA_API_TOKEN')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function revisar(coleccion) {
  if (!PERMITIDAS.has(coleccion)) throw new Error(`Rutero no escribe en "${coleccion}".`);
}

// La API devuelve las fechas sin zona ("2026-11-05T18:07:49.069000"): se guardaron en UTC.
const FECHA_SIN_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
function normalizar(v) {
  if (Array.isArray(v)) return v.map(normalizar);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizar(x)]));
  if (typeof v === 'string' && FECHA_SIN_ZONA.test(v)) return `${v.slice(0, 23)}Z`;
  return v;
}

// `filtros` (opcional) filtra en la base por campos exactos, por ejemplo { las: 'NOMBRE' }.
async function listar(coleccion, filtros = {}) {
  revisar(coleccion);
  const q = new URLSearchParams(filtros).toString();
  const r = await fetch(`${BASE}/${coleccion}${q ? `?${q}` : ''}`, { method: 'GET', headers: encabezados(), signal: AbortSignal.timeout(ESPERA_MS) });
  if (!r.ok) throw new Error(`No se pudo leer ${coleccion} (${r.status}).`);
  const json = await r.json();
  return Array.isArray(json.result) ? json.result.map(normalizar) : [];
}

// Agrega un registro. Reintenta una vez si la red falla: un registro repetido no hace daño porque
// al leer vale la versión más alta de cada id.
async function agregar(coleccion, doc) {
  revisar(coleccion);
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(`${BASE}/${coleccion}`, {
        method: 'POST', headers: encabezados(), body: JSON.stringify(doc), signal: AbortSignal.timeout(ESPERA_MS),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || json.status !== 'ok') throw new Error(`La base ${coleccion} no guardó (${r.status}).`);
      return json.insert_id;
    } catch (e) {
      if (intento >= 2) throw e;
    }
  }
}

module.exports = { listar, agregar };
