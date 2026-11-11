// Carga las listas del Formato Rutero: eventos, novedades, horas, canales y el mes del PANEL.
// Usuarios y PDV NO se toman del Excel: vienen en vivo de la API de Nutresa.
// Uso: node scripts/cargar-formato.js <archivo.xlsx> [--con-panel]
//   --con-panel  también importa las filas del PANEL como programaciones (solo pruebas, modo archivos).
// Con RUTERO_ALMACEN=api las listas y el mes se guardan en la base Rutero_config.

const { leerFormato } = require('../lib/formato');
const store = require('../lib/store');

async function main() {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error('Uso: node scripts/cargar-formato.js <Formato_Rutero.xlsx> [--con-panel]');
    process.exit(1);
  }
  const conPanel = process.argv.includes('--con-panel');
  await store.iniciar();
  const f = await leerFormato(archivo);
  store.guardarListas(f.maestros);
  if (f.periodo) store.ponerPeriodo(f.periodo, 'cargar-formato');
  if (conPanel) {
    if (store.modo === 'api') throw new Error('--con-panel solo se usa en modo archivos (pruebas).');
    store.reemplazarProgramaciones(f.programaciones.map((p) => ({
      id: store.nuevoId(), ...p, periodo: f.periodo, origen: 'excel', creado: new Date().toISOString(),
    })));
  }
  await store.confirmar();

  console.log(`Guardado en: ${store.modo === 'api' ? 'base Rutero_config' : store.dir}`);
  console.log(`Periodo: ${store.db().periodo}`);
  console.log(`Eventos: ${f.maestros.eventos.length}  Novedades: ${f.maestros.novedades.length}  Canales: ${f.maestros.canales.length}`);
  if (conPanel) console.log(`Programaciones importadas del PANEL: ${store.db().programaciones.length}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
