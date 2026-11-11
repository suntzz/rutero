// Prueba de carga: muchos LAS guardando programaciones al mismo tiempo.
// Uso: node scripts/prueba-carga.js [url] [guardados_por_las]
// Correrla contra un servidor con datos de prueba (RUTERO_DATA apuntando a una copia).

const BASE = process.argv[2] || 'http://localhost:3100';
const POR_LAS = Number(process.argv[3] || 10);

async function pedir(ruta, { cookie, ...op } = {}) {
  let r;
  try {
    r = await fetch(BASE + ruta, {
    ...op,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: op.body ? JSON.stringify(op.body) : undefined,
    });
  } catch {
    return { status: 0, datos: { error: 'sin conexión' }, reintento: () => pedir(ruta, { cookie, ...op }) };
  }
  const datos = await r.json().catch(() => ({}));
  return { status: r.status, datos, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

function azar(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

(async () => {
  const lasLista = (await pedir('/api/las')).datos;
  // 1) Todos los LAS entran a la vez.
  const sesiones = await Promise.all(lasLista.map(async (l) => {
    const r = await pedir('/api/las/entrar', { method: 'POST', body: { id: l.id } });
    return { ...l, cookie: r.cookie };
  }));
  const cat = (await pedir('/api/catalogos', { cookie: sesiones[0].cookie })).datos;
  const tiendas = (await pedir('/api/pdv?q=EXITO', { cookie: sesiones[0].cookie })).datos;
  const equipos = await Promise.all(sesiones.map((s) => pedir('/api/las/equipo', { cookie: s.cookie }).then((r) => r.datos)));

  // 2) Cada LAS manda POR_LAS programaciones y registra una tienda nueva, todo en paralelo.
  const envios = [];
  sesiones.forEach((s, i) => {
    const equipo = equipos[i].length ? equipos[i] : equipos.find((e) => e.length);
    for (let k = 0; k < POR_LAS; k++) {
      const dias = cat.fechas.map((_, d) => (d % 7 === 6 ? null : d % 11 === 3 ? { novedad: 'VACACIONES' } : { inicio: '10:00', fin: '18:00' }));
      envios.push(pedir('/api/programacion', {
        method: 'POST', cookie: s.cookie,
        body: { cedula: azar(equipo).cedula, sap: azar(tiendas).sap, evento: azar(cat.eventos), dias, confirmarCruces: true },
      }));
    }
    envios.push(pedir('/api/pdv', {
      method: 'POST', cookie: s.cookie,
      body: { sap: String(990000000 + i), nombre: `TIENDA PRUEBA ${i}`, ciudad: 'CALI', canal: cat.canales[0] },
    }));
  });

  const t0 = Date.now();
  let res = await Promise.all(envios);
  const ms = Date.now() - t0;
  const sinConexion = res.filter((r) => r.status === 0).length;
  // Como haría la persona: vuelve a tocar "Guardar" en las que no conectaron.
  res = await Promise.all(res.map((r) => (r.status === 0 ? r.reintento() : r)));
  const ok = res.filter((r) => r.status === 200).length;
  const fallas = res.filter((r) => r.status !== 200);
  const ids = res.map((r) => r.datos.id).filter(Boolean);

  console.log(`LAS simultáneos: ${sesiones.length}`);
  console.log(`Peticiones enviadas a la vez: ${envios.length} en ${ms} ms`);
  console.log(`Sin conexión al primer intento: ${sinConexion} (reintentadas una vez)`);
  console.log(`OK: ${ok}  Fallidas: ${fallas.length}`, fallas.slice(0, 3).map((f) => `${f.status} ${f.datos.error}`));
  console.log(`IDs únicos: ${new Set(ids).size} de ${ids.length}`);
  console.log(JSON.stringify({ esperadas: sesiones.length * POR_LAS, ids }));
})();
