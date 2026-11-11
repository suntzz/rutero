// Carga directa de un usuario o un PDV nuevo a las bases de Nutresa (usuarios_nutresa y pdv_nutresa).
//
// Es la ÚNICA excepción a "Nutresa es solo lectura", y está cerrada por todos lados:
// - Solo la usa el área interna (rutas con soloSuper en server.js); los LAS no la ven.
// - Solo AGREGA un registro nuevo (POST). Nunca edita ni borra lo que ya existe, y el servidor
//   rechaza una cédula o un SAP que ya esté en la base.
// - Se envía UNA sola vez, sin reintentos (un reintento podría duplicar el registro en Nutresa).
// - Está apagada salvo que la variable RUTERO_CARGA_NUTRESA valga "si".
// - En modo archivos (npm test) no toca la API: lo deja en data/cargas-nutresa.jsonl.

const fs = require('fs');
const path = require('path');
const seg = require('./seguridad');
const store = require('./store');
const { aUsuarios, aPdv } = require('./nutresa');

const BASE = (seg.variable('NUTRESA_API_URL') || 'https://botai.smartdataautomation.com/api_backend_ai/dinamic-db/report/119').replace(/\/+$/, '');
const COLECCIONES = {
  usuario: seg.variable('NUTRESA_RUTA_USUARIOS') || 'usuarios_nutresa',
  pdv: seg.variable('NUTRESA_RUTA_PDV') || 'pdv_nutresa',
};
const ESPERA_MS = 30000;
const SIMULADO = path.join(process.env.RUTERO_DATA || path.join(__dirname, '..', 'data'), 'cargas-nutresa.jsonl');

function habilitada() {
  return String(process.env.RUTERO_CARGA_NUTRESA || seg.variable('RUTERO_CARGA_NUTRESA') || '').trim().toLowerCase() === 'si';
}

async function enviar(tipo, doc) {
  const coleccion = COLECCIONES[tipo];
  if (!coleccion) throw new Error('Tipo de carga no válido.');
  if (store.modo !== 'api') {
    fs.appendFileSync(SIMULADO, `${JSON.stringify({ coleccion, ...doc, simulado: new Date().toISOString() })}\n`);
    return `local-${Date.now()}`;
  }
  const r = await fetch(`${BASE}/${coleccion}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${seg.variable('NUTRESA_API_TOKEN')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(doc),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json.status !== 'ok') {
    const e = new Error(`Nutresa no aceptó el registro (${r.status}). No se cargó nada.`);
    e.status = 502;
    throw e;
  }
  return json.insert_id || '';
}

// Agrega el registro y lo suma a lo que Rutero tiene en memoria, para que se vea sin esperar a la
// siguiente consulta a Nutresa.
async function cargar(tipo, doc) {
  const id = await enviar(tipo, doc);
  const m = store.maestros();
  if (tipo === 'usuario') store.ponerNutresa({ ...m.usuarios, ...aUsuarios([doc]) }, m.pdv);
  else store.ponerNutresa(m.usuarios, { ...m.pdv, ...aPdv([doc]) });
  return id;
}

module.exports = { cargar, habilitada, COLECCIONES };
