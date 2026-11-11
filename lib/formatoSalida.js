// Arma el "Formato Rutero" (el Excel con que trabajaban los LAS) a partir de lo que el LAS registró
// en Rutero, para que lo descargue y lo envíe al área. Misma estructura que el original:
//   PANEL: periodo en C2, encabezados en la fila 6 y una fila por persona + PDV desde la 7, con las
//          fórmulas de búsqueda (C, D, E, G, H, I) y de horas (K, L, M); los días van de N en adelante
//          en pares INICIO / FIN (hora, o el nombre de la novedad).
//   CREAR USUARIOS, CREAR PDV: las peticiones del LAS.
//   MASTER USUARIOS, MASTER PDV: solo las filas que usa el PANEL (para que las fórmulas funcionen).
//   EVENTOS, Hoja1: las listas.

const ExcelJS = require('exceljs');
const { DIAS_DEL_FORMATO, minutos } = require('./rutero');

const PRIMERA_FILA = 7;
const COL_DIA = 14; // N

const VERDE = 'FF92D050';
const AZUL = 'FF66CCFF';

function letra(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function numero(v) {
  return /^\d+$/.test(String(v || '')) ? Number(v) : v || '';
}

function fechaUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function relleno(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

// Fórmulas de la fila r, iguales a las del Formato original.
function formulas(r) {
  const buscar = (llave, rango1, col1, rango2, col2) => `+IF(${llave}${r}="","",IFERROR(IFERROR(VLOOKUP(${llave}${r},${rango1},${col1},FALSE),VLOOKUP(${llave}${r},${rango2},${col2},FALSE)),"REVISAR INFORMACION"))`;
  const inicios = [];
  const fines = [];
  for (let i = 0; i < DIAS_DEL_FORMATO; i++) {
    inicios.push(`${letra(COL_DIA + i * 2)}${r}`);
    fines.push(`${letra(COL_DIA + i * 2 + 1)}${r}`);
  }
  return {
    3: buscar('B', "'MASTER PDV'!B:C", 2, "'CREAR PDV'!A:B", 2),
    4: buscar('B', "'MASTER PDV'!B:F", 5, "'CREAR PDV'!A:F", 6),
    5: buscar('J', "'MASTER USUARIOS'!B:J", 9, "'CREAR USUARIOS'!C:I", 7),
    7: buscar('J', "'MASTER USUARIOS'!B:C", 2, "'CREAR USUARIOS'!C:D", 2),
    8: buscar('B', "'MASTER PDV'!B:D", 3, "'CREAR PDV'!A:D", 4),
    9: buscar('J', "'MASTER USUARIOS'!B:E", 4, "'CREAR USUARIOS'!C:F", 4),
    11: `+IF(OR(L${r}="",L${r}=0,M${r}="",M${r}=0),"",M${r}-L${r})`,
    12: `+SUM(${inicios.join(',')})*24`,
    13: `+SUM(${fines.join(',')})*24`,
  };
}

function hojaPanel(wb, periodo, programaciones) {
  const ws = wb.addWorksheet('PANEL', { views: [{ state: 'frozen', xSplit: 10, ySplit: 6 }] });
  ws.getCell('B2').value = 'PERIODO';
  ws.getCell('B2').font = { bold: true };
  ws.getCell('C2').value = periodo ? fechaUTC(periodo) : null;
  ws.getCell('C2').numFmt = 'd/mm/yyyy';

  const titulos = ['SAP', 'PDV', 'CANAL', 'LAS', 'EVENTO', 'REGIONAL', 'CIUDAD', 'ASESOR O PROMOTOR', 'CEDULA', 'HORAS PROGRAMADAS', 'HORAS IN FN', 'HORAS SL FN'];
  titulos.forEach((t, i) => {
    const c = ws.getCell(6, 2 + i);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = relleno(VERDE);
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  for (const col of [2, 6, 10]) {
    ws.getCell(5, col).value = 'DILIGENCIAR';
    ws.getCell(5, col).font = { bold: true };
  }
  for (let i = 0; i < DIAS_DEL_FORMATO; i++) {
    for (const [k, rotulo] of [[0, 'INICIO'], [1, 'FIN']]) {
      const col = COL_DIA + i * 2 + k;
      const pareja = letra(COL_DIA + i * 2);
      ws.getCell(4, col).value = rotulo;
      ws.getCell(4, col).alignment = { horizontal: 'center' };
      const dia = ws.getCell(6, col);
      dia.value = { formula: i === 0 ? '+C2' : `+${letra(COL_DIA + (i - 1) * 2)}6+1` };
      dia.numFmt = 'd/mm/yyyy';
      const nombre = ws.getCell(5, col);
      nombre.value = { formula: `+TEXT(${pareja}6,"DDDD")` };
      for (const c of [dia, nombre]) {
        c.fill = relleno(AZUL);
        c.font = { bold: true };
        c.alignment = { horizontal: 'center' };
      }
    }
  }

  programaciones.forEach((p, n) => {
    const r = PRIMERA_FILA + n;
    const fila = ws.getRow(r);
    fila.getCell(2).value = numero(p.sap);
    fila.getCell(6).value = p.evento;
    fila.getCell(10).value = numero(p.cedula);
    for (const [col, f] of Object.entries(formulas(r))) fila.getCell(Number(col)).value = { formula: f };
    fila.getCell(11).numFmt = '0';
    fila.getCell(12).numFmt = '0.00';
    fila.getCell(13).numFmt = '0';
    (p.dias || []).forEach((d, i) => {
      const ini = fila.getCell(COL_DIA + i * 2);
      const fin = fila.getCell(COL_DIA + i * 2 + 1);
      ini.numFmt = 'h:mm AM/PM';
      fin.numFmt = 'h:mm AM/PM';
      if (!d) return;
      if (d.inicio && d.fin) {
        ini.value = minutos(d.inicio) / (24 * 60);
        fin.value = minutos(d.fin) / (24 * 60);
      } else {
        const texto = d.novedad || 'CANCELADA POR LAS';
        ini.value = texto;
        fin.value = texto;
      }
    });
  });

  ws.columns.forEach((c, i) => {
    c.width = [5, 15, 28, 16, 25, 30, 18, 16, 38, 15, 15, 15, 15][i] || 12;
  });
  return ws;
}

function hojaTabla(wb, nombre, columnas, filas, opciones = {}) {
  const ws = wb.addWorksheet(nombre, opciones);
  ws.addRow(columnas);
  ws.getRow(1).font = { bold: true };
  filas.forEach((f) => ws.addRow(f));
  ws.columns.forEach((c) => { c.width = 18; });
  return ws;
}

async function formatoRutero({ ctx, periodo, programaciones, peticiones, eventos }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rutero';
  hojaPanel(wb, periodo, programaciones);

  hojaTabla(wb, 'EVENTOS', ['EVENTO'], (eventos || ctx.eventos || []).map((e) => [e]), { state: 'hidden' });

  const usuariosPedidos = peticiones.filter((p) => p.tipo !== 'pdv');
  hojaTabla(wb, 'CREAR USUARIOS', ['A QUIEN REEMPLAZA', 'TELEFONO', 'CEDULA', 'REGIONAL', 'CIUDAD', 'NOMBRE', 'MARCA', 'EVENTO', 'LAS'],
    usuariosPedidos.map(({ tipo, datos: d }) => [
      tipo === 'cambio' ? `CAMBIO DE EVENTO (antes: ${d.ANTES || ''})` : d.REEMPLAZA || '',
      numero(d.TELEFONO), numero(d.CEDULA), d.REGIONAL, d.CIUDAD, d.NOMBRE, d.MARCA, d.EVENTO, d.LAS,
    ]));

  hojaTabla(wb, 'CREAR PDV', ['SAP', 'PDV', 'REGIONAL', 'CIUDAD', 'DIRECCION', 'CANAL'],
    peticiones.filter((p) => p.tipo === 'pdv').map(({ datos: d }) => [numero(d.SAP), d.PDV, d.REGIONAL, d.CIUDAD, d.DIRECCION, d.CANAL]));

  // En MASTER va lo que está en Nutresa; las personas pedidas siguen en CREAR USUARIOS.
  const cedulas = [...new Set(programaciones.map((p) => p.cedula))];
  hojaTabla(wb, 'MASTER USUARIOS', ['TELEFONO', 'CEDULA', 'REGIONAL', 'CIUDAD', 'NOMBRE', 'MARCA', 'EVENTO', 'RUTA', 'CARGO', 'LAS', 'ENVIO_CAMP', 'ESTADO'],
    cedulas.map((c) => ctx.usuarios[c]).filter(Boolean).map((u) => [
      numero(u.telefono), numero(u.cedula), u.regional, u.ciudad, u.nombre, u.marca, u.evento, u.ruta, u.cargo, u.las, '', u.estado,
    ]));
  const saps = [...new Set(programaciones.map((p) => p.sap))];
  hojaTabla(wb, 'MASTER PDV', ['_id', 'SAP', 'PDV', 'CIUDAD', 'DIRECCION', 'CANAL', 'REGIONAL'],
    saps.map((s) => ctx.pdv[s]).filter(Boolean).map((p) => ['', numero(p.sap), p.nombre, p.ciudad, p.direccion, p.canal, p.regional]));

  // Hoja1 (oculta): novedades y horas en A, canales en D.
  const hoja1 = wb.addWorksheet('Hoja1', { state: 'hidden' });
  const colA = [...(ctx.novedades || []), ...(ctx.horas || []).map((h) => minutos(h) / (24 * 60))];
  const largo = Math.max(colA.length, (ctx.canales || []).length);
  for (let i = 0; i < largo; i++) {
    const fila = hoja1.getRow(i + 1);
    if (i < colA.length) {
      fila.getCell(1).value = colA[i];
      if (typeof colA[i] === 'number') fila.getCell(1).numFmt = 'h:mm AM/PM';
    }
    if (ctx.canales && i < ctx.canales.length) fila.getCell(4).value = ctx.canales[i];
  }

  return wb;
}

module.exports = { formatoRutero };
