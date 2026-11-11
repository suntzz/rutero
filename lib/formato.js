// Lee el "Formato Rutero" (Excel que llenan en campo) y extrae maestros y programaciones.

const ExcelJS = require('exceljs');
const { valor, aHora, aCodigo, aTexto } = require('./excel');
const { DIAS_DEL_FORMATO } = require('./rutero');

const NOVEDADES_POR_DEFECTO = ['COMPENSATORIO', 'REUNIONES PROGRAMADAS', 'VACACIONES', 'INCAPACIDAD'];

function filas(ws, desde = 2) {
  const out = [];
  if (!ws) return out;
  for (let r = desde; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const vals = [];
    for (let c = 1; c <= ws.columnCount; c++) vals.push(valor(row.getCell(c)));
    if (vals.some((v) => v !== null)) out.push(vals);
  }
  return out;
}

function hoja(wb, nombre) {
  return wb.worksheets.find((w) => w.name.trim().toUpperCase() === nombre);
}

async function leerFormato(origen) {
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(origen)) await wb.xlsx.load(origen);
  else await wb.xlsx.readFile(origen);

  // MASTER USUARIOS: A TELEFONO, B CEDULA, C REGIONAL, D CIUDAD, E NOMBRE, F MARCA, G EVENTO, H RUTA, I CARGO, J LAS, L ESTADO
  const usuarios = {};
  for (const v of filas(hoja(wb, 'MASTER USUARIOS'))) {
    const cedula = aCodigo(v[1]);
    if (!cedula || usuarios[cedula]) continue;
    usuarios[cedula] = {
      cedula, telefono: aCodigo(v[0]) || '', regional: aTexto(v[2]), ciudad: aTexto(v[3]),
      nombre: aTexto(v[4]), marca: aTexto(v[5]), evento: aTexto(v[6]), ruta: aTexto(v[7]),
      cargo: aTexto(v[8]), las: aTexto(v[9]), estado: aTexto(v[11]),
    };
  }

  // CREAR USUARIOS: A REEMPLAZA, B TELEFONO, C CEDULA, D REGIONAL, E CIUDAD, F NOMBRE, G MARCA, H EVENTO, I LAS
  const usuariosNuevos = {};
  for (const v of filas(hoja(wb, 'CREAR USUARIOS'))) {
    const cedula = aCodigo(v[2]);
    if (!cedula || usuariosNuevos[cedula]) continue;
    usuariosNuevos[cedula] = {
      cedula, reemplaza: aTexto(v[0]), telefono: aCodigo(v[1]) || '', regional: aTexto(v[3]),
      ciudad: aTexto(v[4]), nombre: aTexto(v[5]), marca: aTexto(v[6]), evento: aTexto(v[7]),
      las: aTexto(v[8]), ruta: '', nuevo: true,
    };
  }

  // MASTER PDV: A _id, B SAP, C PDV, D CIUDAD, E DIRECCION, F CANAL, G REGIONAL
  const pdv = {};
  for (const v of filas(hoja(wb, 'MASTER PDV'))) {
    const sap = aCodigo(v[1]);
    if (!sap || pdv[sap]) continue;
    pdv[sap] = {
      sap, nombre: aTexto(v[2]), ciudad: aTexto(v[3]), direccion: aTexto(v[4]),
      canal: aTexto(v[5]), regional: aTexto(v[6]),
    };
  }

  // CREAR PDV: A SAP, B PDV, C REGIONAL, D CIUDAD, E DIRECCION, F CANAL
  const pdvNuevos = {};
  for (const v of filas(hoja(wb, 'CREAR PDV'))) {
    const sap = aCodigo(v[0]);
    if (!sap || pdvNuevos[sap]) continue;
    pdvNuevos[sap] = {
      sap, nombre: aTexto(v[1]), regional: aTexto(v[2]), ciudad: aTexto(v[3]),
      direccion: aTexto(v[4]), canal: aTexto(v[5]), nuevo: true,
    };
  }

  const eventos = filas(hoja(wb, 'EVENTOS')).map((v) => aTexto(v[0]).trim()).filter(Boolean);

  // Hoja1 (oculta): A novedades + horas, D canales
  const listas = filas(hoja(wb, 'HOJA1'), 1);
  const novedades = listas.map((v) => v[0]).filter((v) => typeof v === 'string').map((v) => v.trim());
  const horas = listas.map((v) => aHora(v[0])).filter(Boolean);
  const canales = listas.map((v) => v[3]).filter((v) => typeof v === 'string').map((v) => v.trim());

  // PANEL: periodo en C2, encabezados en fila 6, datos desde fila 7.
  const panel = hoja(wb, 'PANEL');
  let periodo = null;
  const programaciones = [];
  if (panel) {
    const c2 = valor(panel.getCell('C2'));
    if (c2 instanceof Date) periodo = c2.toISOString().slice(0, 10);
    for (let r = 7; r <= panel.rowCount; r++) {
      const row = panel.getRow(r);
      const sap = aCodigo(valor(row.getCell(2)));
      const cedula = aCodigo(valor(row.getCell(10)));
      if (!sap && !cedula) continue;
      const dias = [];
      for (let i = 0; i < DIAS_DEL_FORMATO; i++) {
        const vi = valor(row.getCell(14 + i * 2));
        const vf = valor(row.getCell(15 + i * 2));
        const texto = [vi, vf].find((x) => typeof x === 'string');
        if (texto) dias.push({ novedad: texto.trim().toUpperCase() });
        else {
          const inicio = aHora(vi);
          const fin = aHora(vf);
          dias.push(inicio && fin ? { inicio, fin } : null);
        }
      }
      programaciones.push({
        sap: sap || '', cedula: cedula || '', evento: aTexto(valor(row.getCell(6))).trim(), dias,
      });
    }
  }

  return {
    maestros: {
      usuarios, pdv, eventos,
      novedades: novedades.length ? novedades : NOVEDADES_POR_DEFECTO,
      horas, canales,
    },
    usuariosNuevos, pdvNuevos, periodo, programaciones,
  };
}

module.exports = { leerFormato };
