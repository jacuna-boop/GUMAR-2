// Arma el .xlsx del informe PP-I-01 (uno o varios proyectos) con ExcelJS, replicando el diseño del
// informe real (logo, franjas verdes, bordes, gráficos de torta nativos): hoja "INFO BASE" (un
// bloque por proyecto, con salto de página entre uno y otro), hoja "PPTO SEG <proyecto>" (presupuesto
// de ejecución) y hoja "CURVA S SENERGIZACIÓN <proyecto>" con el gráfico de línea nativo (ver
// excelNativeChart.js) construido sobre los datos reales de energización de la plataforma.
import ExcelJS from "exceljs";
import { groupPresupuestoItems, calcPresupuestoItem, fmtDate, todayISO } from "./data.js";
import { buildInformeProyecto } from "./informePPI01.js";
import { addLineChart, addPieChart } from "./excelNativeChart.js";

const ACCENT = "FF3C6E9A"; // azul — usado en PPTO SEG / CURVA S (hojas todavía sin rediseño visual)
// Colores exactos extraídos del informe real (260731 PP-I-01 #43.xlsx, hoja INFO BASE):
const DARK_GREEN = "FF769B8F"; // franjas de las secciones 1, 2, 3
const LIGHT_GREEN = "FFB2D8C8"; // franjas de 3.1-3.4, 4 y 5
const LABEL_GRAY = "FFE5E1E6"; // celdas de etiqueta (CARGO, POTENCIA, VALOR CONTRACTUAL...)
const PIE_GREEN = "92D050"; // color exacto de la porción principal en las tortas del informe real
const PIE_ORANGE = "ED7D31"; // porción secundaria (el informe no la fija explícitamente; se estima)
const BORDER = { style: "thin", color: { argb: "FF000000" } };
const BORDER_MED = { style: "medium", color: { argb: "FF000000" } };
const MONEY_FMT = '"$" #,##0';
const PCT_FMT = "0%"; // el informe real usa "0%" (sin decimales), no "0.0%"
// A es un margen angosto (igual que en el informe real); el contenido va en B..F.
const COL_WIDTHS = [3, 24.5, 23, 21, 29, 20];
const FIRST_COL = 2; // B
const LAST_COL = 6; // F

function sanitizeSheetName(name, maxLen = 31) {
  const cleaned = String(name || "Proyecto").replace(/[:\\/?*[\]]/g, "").trim() || "Proyecto";
  return cleaned.slice(0, maxLen);
}

function uniqueSheetName(wb, base) {
  let name = sanitizeSheetName(base);
  let i = 2;
  while (wb.getWorksheet(name)) {
    const suffix = ` ${i}`;
    name = sanitizeSheetName(base, 31 - suffix.length) + suffix;
    i++;
  }
  return name;
}

// --- helpers de estilo de la hoja INFO BASE (fiel al informe real: franjas verdes, bordes) -------

// Franja de título de sección, ancho completo (B:F). color=DARK_GREEN (secciones 1,2,3) o
// LIGHT_GREEN (subsecciones 3.x y secciones 4,5) — así se ve en el informe real, no es simétrico.
function sectionBand(ws, text, color) {
  const row = ws.addRow(["", text]);
  ws.mergeCells(row.number, FIRST_COL, row.number, LAST_COL);
  row.height = 20;
  const dark = color === DARK_GREEN;
  row.getCell(FIRST_COL).font = { bold: true, size: 12, color: { argb: dark ? "FFFFFFFF" : "FF1A1A1A" }, name: "Montserrat" };
  row.getCell(FIRST_COL).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  row.getCell(FIRST_COL).alignment = { horizontal: "center", vertical: "middle" };
  return row;
}

// Fila "ETIQUETA: | valor" — etiqueta en B:C (fondo gris), valor en D:F fusionado.
function labelValueRow(ws, label, value, numFmt) {
  const row = ws.addRow(["", label, "", value]);
  ws.mergeCells(row.number, FIRST_COL, row.number, 3);
  ws.mergeCells(row.number, 4, row.number, LAST_COL);
  row.getCell(FIRST_COL).font = { bold: true, size: 10, name: "Montserrat" };
  row.getCell(FIRST_COL).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LABEL_GRAY } };
  row.getCell(4).font = { name: "Lato" };
  if (numFmt) row.getCell(4).numFmt = numFmt;
  row.getCell(4).alignment = { horizontal: numFmt ? "center" : "left", vertical: "middle" };
  return row;
}

// Fila con DOS pares etiqueta:valor (ej. "Costo estimado inicial" / "Costo proyectado"):
// B:C=label1 (fusionado), D=value1, E=label2, F=value2 — cada celda individual, como en el original.
function twoPairRow(ws, label1, value1, numFmt1, label2, value2, numFmt2) {
  const row = ws.addRow(["", label1, "", value1, label2, value2]);
  if (label1) {
    ws.mergeCells(row.number, FIRST_COL, row.number, 3);
    row.getCell(FIRST_COL).font = { bold: true, size: 10, name: "Montserrat" };
    row.getCell(FIRST_COL).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LABEL_GRAY } };
  }
  if (numFmt1) row.getCell(4).numFmt = numFmt1;
  row.getCell(4).font = { name: "Lato" };
  row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
  if (label2) {
    row.getCell(5).font = { bold: true, size: 10, name: "Montserrat" };
    row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LABEL_GRAY } };
  }
  if (numFmt2) row.getCell(6).numFmt = numFmt2;
  row.getCell(6).font = { name: "Lato" };
  row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
  return row;
}

// Encabezado de tabla de datos (CARGO/NOMBRE, DEPARTAMENTO/MUNICIPIO, CANTIDAD/POTENCIA/MARCA/
// REFERENCIA...) — SIEMPRE fondo gris claro (no verde: el verde es solo para los títulos de sección).
function grayHeaderRow(ws, spans) {
  // spans: [{ text, col, span }]
  const values = [""];
  spans.forEach((s) => { values[s.col - 1] = s.text; });
  const row = ws.addRow(values);
  spans.forEach((s) => {
    if (s.span > 1) ws.mergeCells(row.number, s.col, row.number, s.col + s.span - 1);
    const cell = row.getCell(s.col);
    cell.font = { bold: true, size: 9.5, name: "Montserrat" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LABEL_GRAY } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  return row;
}

function dataRow(ws, spans) {
  const values = [""];
  spans.forEach((s) => { values[s.col - 1] = s.value; });
  const row = ws.addRow(values);
  spans.forEach((s) => {
    if (s.span > 1) ws.mergeCells(row.number, s.col, row.number, s.col + s.span - 1);
    row.getCell(s.col).font = { name: "Lato" };
    row.getCell(s.col).alignment = { horizontal: "center", vertical: "middle" };
  });
  return row;
}

function applyBorders(ws, r1, r2) {
  for (let r = r1; r <= r2; r++) {
    for (let c = FIRST_COL; c <= LAST_COL; c++) {
      const top = r === r1 ? BORDER_MED : BORDER;
      const bottom = r === r2 ? BORDER_MED : BORDER;
      const left = c === FIRST_COL ? BORDER_MED : BORDER;
      const right = c === LAST_COL ? BORDER_MED : BORDER;
      ws.getCell(r, c).border = { top, left, bottom, right };
    }
  }
}

function buildInfoBaseSheet(wb, informes, meta, logoBuffer) {
  const ws = wb.addWorksheet("INFO BASE");
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let logoImageId = null;
  if (logoBuffer) {
    logoImageId = wb.addImage({ buffer: logoBuffer, extension: "jpeg" });
  }

  const total = informes.length;
  const pieAnchors = [];
  const lineChartAnchors = [];

  informes.forEach((inf, idx) => {
    const blockStart = ws.rowCount + 1;

    // --- encabezado: logo + INFORME / CONTROL PRESUPUESTAL... + CÓDIGO/VERSIÓN/FECHA/PÁGINA ---
    const r1 = ws.addRow(["", "", "INFORME"]);
    ws.mergeCells(r1.number, 3, r1.number, LAST_COL);
    r1.getCell(3).font = { bold: true, size: 15, name: "Montserrat" };
    r1.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
    r1.height = 22;

    const r2 = ws.addRow(["", "", "CONTROL PRESUPUESTAL Y CRONOGRAMA DE PROYECTOS"]);
    ws.mergeCells(r2.number, 3, r2.number, LAST_COL);
    r2.getCell(3).font = { bold: true, size: 12, name: "Montserrat" };
    r2.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
    r2.height = 22;

    if (logoImageId !== null) {
      // Tamaño fijo (no estirado a una celda) igual al del informe real (~168x80 px), anclado
      // en la esquina superior izquierda del bloque — así no se deforma sin importar el ancho
      // de las columnas de esta hoja.
      ws.addImage(logoImageId, { tl: { col: FIRST_COL - 1, row: r1.number - 1 }, ext: { width: 168, height: 80 } });
    }

    grayHeaderRow(ws, [
      { text: "CÓDIGO", col: 3, span: 1 },
      { text: "VERSIÓN", col: 4, span: 1 },
      { text: "FECHA", col: 5, span: 1 },
      { text: "PÁGINA", col: 6, span: 1 },
    ]);
    dataRow(ws, [
      { value: "PP-I-01", col: 3, span: 1 },
      { value: "01", col: 4, span: 1 },
      { value: fmtDate(meta.fechaPresentacion || todayISO()), col: 5, span: 1 },
      { value: `${idx + 1} DE ${total}`, col: 6, span: 1 },
    ]);

    labelValueRow(ws, "PERIODO DEL INFORME:", `${meta.periodoDesde ? fmtDate(meta.periodoDesde) : ""}${meta.periodoDesde || meta.periodoHasta ? " - " : ""}${meta.periodoHasta ? fmtDate(meta.periodoHasta) : ""}`);
    labelValueRow(ws, "FECHA PRESENTACIÓN DEL INFORME:", fmtDate(meta.fechaPresentacion || todayISO()));
    labelValueRow(ws, "NOMBRE DEL RESPONSABLE:", meta.responsableNombre || "");
    labelValueRow(ws, "CARGO DEL RESPONSABLE:", meta.responsableCargo || "");
    ws.addRow([]);
    labelValueRow(ws, "CENTRO DE COSTOS/PROYECTO:", inf.codigo ? `${inf.codigo} - ${inf.nombre}` : inf.nombre);
    ws.addRow([]);

    // --- 1. equipo de trabajo ---
    sectionBand(ws, "1. EQUIPO DE TRABAJO", DARK_GREEN);
    grayHeaderRow(ws, [{ text: "CARGO", col: FIRST_COL, span: 2 }, { text: "NOMBRE", col: 4, span: 3 }]);
    if (inf.equipo.length === 0) {
      dataRow(ws, [{ value: "(sin equipo asignado)", col: FIRST_COL, span: 5 }]);
    } else {
      inf.equipo.forEach((m) => dataRow(ws, [{ value: m.cargo || "", col: FIRST_COL, span: 2 }, { value: m.nombre || "", col: 4, span: 3 }]));
    }
    ws.addRow([]);

    // --- 2. ubicación ---
    sectionBand(ws, "2. UBICACIÓN DEL PROYECTO", DARK_GREEN);
    grayHeaderRow(ws, [{ text: "DEPARTAMENTO", col: FIRST_COL, span: 2 }, { text: "MUNICIPIO", col: 4, span: 3 }]);
    dataRow(ws, [{ value: inf.departamento || "", col: FIRST_COL, span: 2 }, { value: inf.municipio || "", col: 4, span: 3 }]);
    ws.addRow([]);

    // --- 3. información técnica ---
    sectionBand(ws, "3. INFORMACIÓN TÉCNICA", DARK_GREEN);
    labelValueRow(ws, "POTENCIA", inf.potencia ? `${inf.potencia} MW` : "");
    labelValueRow(ws, "FPO SIN EXTENSIÓN", inf.fpoSinExtension ? fmtDate(inf.fpoSinExtension) : "");
    labelValueRow(ws, "FPO CON EXTENSIÓN", inf.fpoConExtension ? fmtDate(inf.fpoConExtension) : "");
    ws.addRow([]);

    const ft = inf.fichaTecnica;
    sectionBand(ws, "3.1 INFORMACIÓN DE MÓDULOS SOLARES", LIGHT_GREEN);
    grayHeaderRow(ws, [{ text: "CANTIDAD", col: FIRST_COL, span: 1 }, { text: "POTENCIA Wp", col: 3, span: 1 }, { text: "MARCA", col: 4, span: 1 }, { text: "REFERENCIA", col: 5, span: 2 }]);
    dataRow(ws, [{ value: ft.paneles.cantidad, col: FIRST_COL, span: 1 }, { value: ft.paneles.potenciaWp, col: 3, span: 1 }, { value: ft.paneles.marca, col: 4, span: 1 }, { value: ft.paneles.referencia, col: 5, span: 2 }]);

    sectionBand(ws, "3.2 INFORMACIÓN DE INVERSORES", LIGHT_GREEN);
    grayHeaderRow(ws, [{ text: "CANTIDAD", col: FIRST_COL, span: 1 }, { text: "CAPACIDAD", col: 3, span: 1 }, { text: "MARCA", col: 4, span: 1 }, { text: "REFERENCIA", col: 5, span: 2 }]);
    dataRow(ws, [{ value: ft.inversores.cantidad, col: FIRST_COL, span: 1 }, { value: ft.inversores.capacidad, col: 3, span: 1 }, { value: ft.inversores.marca, col: 4, span: 1 }, { value: ft.inversores.referencia, col: 5, span: 2 }]);

    sectionBand(ws, "3.3 SOLUCIÓN DE TRANSFORMACIÓN", LIGHT_GREEN);
    twoPairRow(ws, "TIPO", ft.transformador.tipo, null, "MARCA", ft.transformador.marca, null);

    sectionBand(ws, "3.4 SOLUCIÓN DE ESTRUCTURA - MESAS", LIGHT_GREEN);
    grayHeaderRow(ws, [{ text: "CONFIGURACIÓN", col: FIRST_COL, span: 1 }, { text: "CANTIDAD", col: 3, span: 1 }, { text: "PROVEEDOR", col: 4, span: 3 }]);
    dataRow(ws, [{ value: ft.estructura.configuracion, col: FIRST_COL, span: 1 }, { value: ft.estructura.cantidad, col: 3, span: 1 }, { value: ft.estructura.proveedor, col: 4, span: 3 }]);
    ws.addRow([]);

    // --- 4. información presupuestal y financiera ---
    sectionBand(ws, "4. INFORMACIÓN PRESUPUESTAL Y FINANCIERA", LIGHT_GREEN);
    labelValueRow(ws, "VALOR CONTRACTUAL:", inf.financiero.valorContractual, MONEY_FMT);
    twoPairRow(ws, "COSTO ESTIMADO INICIAL:", inf.financiero.costoEstimadoInicial, MONEY_FMT, "COSTO PROYECTADO:", inf.financiero.costoProyectado, MONEY_FMT);
    twoPairRow(ws, "EBITDA:", inf.financiero.ebitda, MONEY_FMT, "EFICIENCIA DEL COSTO:", inf.financiero.eficienciaCosto, PCT_FMT);
    twoPairRow(ws, null, null, null, "GANANCIA O PÉRDIDA:", inf.financiero.gananciaPerdida, PCT_FMT);
    ws.addRow([]);

    // dos tortas lado a lado: Estado de inversiones (bajo B:C) y Eficiencia del costo (bajo D:F).
    // Tamaño FIJO (no estirado a una celda), más angosto que el ancho real de B:C para que no se
    // encimen entre sí ni con la torta vecina.
    const pieRowStart = ws.rowCount + 1;
    const PIE_ROWS = 10;
    for (let i = 0; i < PIE_ROWS; i++) ws.addRow([]);
    const PIE_EXT_EMU = { cx: 3050000, cy: 1650000 }; // ~3.33in x ~1.8in

    const pagado = inf.inversiones.totalPagado;
    const pendiente = Math.max(0, inf.financiero.costoProyectado - pagado);
    pieAnchors.push({
      estadoInversiones: {
        fromCell: `${colName(FIRST_COL)}${pieRowStart}`,
        extEmu: PIE_EXT_EMU,
        slices: [
          { name: "Monto pagado", value: pagado, color: PIE_GREEN },
          { name: "Pendiente por pagar", value: pendiente, color: PIE_ORANGE },
        ],
      },
      eficienciaCosto: {
        fromCell: `${colName(4)}${pieRowStart}`,
        extEmu: PIE_EXT_EMU,
        slices: [
          { name: "Eficiencia del costo", value: inf.financiero.eficienciaCosto * 100, color: PIE_GREEN },
          { name: "Ganancia/Pérdida", value: inf.financiero.gananciaPerdida * 100, color: PIE_ORANGE },
        ],
      },
    });
    ws.addRow([]);

    twoPairRow(
      ws,
      "CUMPLIMIENTO CURVA S SEGUIMIENTO:",
      inf.cumplimientoSeguimiento?.real != null ? inf.cumplimientoSeguimiento.real / 100 : null,
      PCT_FMT,
      "CUMPLIMIENTO CURVA S ENERGIZACIÓN:",
      inf.cumplimientoEnergizacion?.real != null ? inf.cumplimientoEnergizacion.real / 100 : 0,
      PCT_FMT
    );

    // Curva(s) S: seguimiento (obra/cronograma) y energización, cada una con datos reales de la
    // plataforma. Si hay las dos, van lado a lado (como en el informe real); si solo hay una, va a
    // todo el ancho. Tamaño fijo, datos literales (no necesitan hoja de respaldo), eje de categorías
    // rotado y con salto de etiquetas para que no se amontonen con muchos puntos.
    const tieneSeguimiento = inf.curvaSSeguimiento.length > 0;
    const tieneEnergizacion = inf.curvaSEnergizacion.length > 0;
    if (tieneSeguimiento || tieneEnergizacion) {
      const curveRowStart = ws.rowCount + 1;
      const CURVE_ROWS = 14;
      for (let i = 0; i < CURVE_ROWS; i++) ws.addRow([]);
      const bothSideBySide = tieneSeguimiento && tieneEnergizacion;
      const curveExt = bothSideBySide ? { cx: 3050000, cy: 2300000 } : { cx: 5300000, cy: 2300000 }; // ~3.33x2.51in ó ~5.8x2.51in

      if (tieneSeguimiento) {
        lineChartAnchors.push({
          fromCell: `${colName(FIRST_COL)}${curveRowStart}`,
          extEmu: curveExt,
          title: "CURVA S - SEGUIMIENTO DE OBRA",
          series: [
            { name: "% Base", categories: inf.curvaSSeguimiento.map((p) => p.label), values: inf.curvaSSeguimiento.map((p) => p.base), color: "4FA8D8" },
            { name: "% Ejecutado", categories: inf.curvaSSeguimiento.map((p) => p.label), values: inf.curvaSSeguimiento.map((p) => p.real), color: "F5B942" },
          ],
        });
      }
      if (tieneEnergizacion) {
        lineChartAnchors.push({
          fromCell: `${colName(bothSideBySide ? 4 : FIRST_COL)}${curveRowStart}`,
          extEmu: curveExt,
          title: "CURVA S - TRÁMITES ENERGIZACIÓN",
          series: [
            { name: "% Base", categories: inf.curvaSEnergizacion.map((p) => p.label), values: inf.curvaSEnergizacion.map((p) => p.base), color: "4FA8D8" },
            { name: "% Ejecutado", categories: inf.curvaSEnergizacion.map((p) => p.label), values: inf.curvaSEnergizacion.map((p) => p.real), color: "F5B942" },
          ],
        });
      }
      ws.addRow([]);
    }

    // --- 5. cortes de obra ---
    sectionBand(ws, "5. CORTES DE OBRA", LIGHT_GREEN);
    grayHeaderRow(ws, [{ text: "CONTRATISTA", col: FIRST_COL, span: 2 }, { text: "# DE CORTE", col: 4, span: 1 }, { text: "VR ACUMULADO", col: 5, span: 1 }, { text: "RETEOBRA", col: 6, span: 1 }]);
    if (inf.cortesObra.length === 0) {
      dataRow(ws, [{ value: "(sin contratistas seleccionados)", col: FIRST_COL, span: 5 }]);
    } else {
      inf.cortesObra.forEach((c) => {
        const row = dataRow(ws, [
          { value: c.proveedor, col: FIRST_COL, span: 2 },
          { value: c.numCortes, col: 4, span: 1 },
          { value: c.vrAcumulado, col: 5, span: 1 },
          { value: c.reteobra, col: 6, span: 1 },
        ]);
        row.getCell(5).numFmt = MONEY_FMT;
        row.getCell(6).numFmt = MONEY_FMT;
      });
      const totalReteobra = inf.cortesObra.reduce((s, c) => s + (Number(c.reteobra) || 0), 0);
      const totalRow = dataRow(ws, [{ value: "TOTAL RETEOBRA", col: FIRST_COL, span: 5 }, { value: totalReteobra, col: 6, span: 1 }]);
      totalRow.getCell(FIRST_COL).font = { bold: true, name: "Montserrat" };
      totalRow.getCell(6).font = { bold: true, name: "Lato" };
      totalRow.getCell(6).numFmt = MONEY_FMT;
    }

    const blockEnd = ws.rowCount;
    applyBorders(ws, blockStart, blockEnd);

    if (idx < total - 1) {
      ws.addRow([]);
      ws.getRow(ws.rowCount).addPageBreak();
    }
  });

  return { ws, pieAnchors, lineChartAnchors };
}

function colName(n) {
  return String.fromCharCode(64 + n);
}

function buildPptoSegSheet(wb, data, suffix) {
  const ws = wb.addWorksheet(uniqueSheetName(wb, `PPTO SEG ${suffix}`));
  ws.columns = [
    { header: "Ítem", key: "item", width: 10 },
    { header: "Categoría / Descripción", key: "descripcion", width: 40 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Unidad", key: "unidad", width: 10 },
    { header: "Valor unitario", key: "valorUnitario", width: 20 },
    { header: "IVA %", key: "ivaPct", width: 10 },
    { header: "Valor total", key: "valorTotal", width: 20 },
  ];
  const groups = groupPresupuestoItems(data?.presupuesto?.ejecucion);
  groups.forEach(({ categoria, items }) => {
    const catRow = ws.addRow({ descripcion: categoria });
    catRow.font = { bold: true };
    catRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDEF" } };
    items.forEach((it) => {
      const calc = calcPresupuestoItem(it);
      ws.addRow({
        item: it.item,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        unidad: it.unidad,
        valorUnitario: it.valorUnitario,
        ivaPct: it.ivaPct,
        valorTotal: calc.valorTotal,
      });
    });
  });
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
  });
  ws.getColumn("valorUnitario").numFmt = MONEY_FMT;
  ws.getColumn("valorTotal").numFmt = MONEY_FMT;
  ws.getColumn("ivaPct").numFmt = '0"%"';
  return ws;
}

function buildCurvaSSheet(wb, informe, suffix) {
  const sheetName = uniqueSheetName(wb, `CURVA S SENERGIZACIÓN ${suffix}`);
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [
    { header: "FECHA", key: "label", width: 14 },
    { header: "% BASE", key: "base", width: 12 },
    { header: "% EJECUTADO", key: "real", width: 14 },
  ];
  informe.curvaSEnergizacion.forEach((p) => ws.addRow({ label: p.label, base: p.base, real: p.real }));
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
  });
  return {
    sheetName,
    n: informe.curvaSEnergizacion.length,
    base: informe.curvaSEnergizacion.map((p) => p.base),
    real: informe.curvaSEnergizacion.map((p) => p.real),
  };
}

// projects: [{ id, name, capacity, location }], projectDataById: { [id]: fullProjectData }
// opts: { logoBuffer, periodoDesde, periodoHasta, fechaPresentacion, responsableNombre, responsableCargo, soloInfoBase }
// periodoHasta (o fechaPresentacion si no hay periodo) también actúa como fecha de corte del avance
// real de la curva S de energización.
async function buildInformePPI01Workbook(projects, projectDataById, opts = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Parques Solares";
  wb.created = new Date();

  // El avance real de la curva S de energización se corta en "periodo hasta" (o la fecha de
  // presentación si no hay periodo) — para que un informe de un periodo pasado no muestre avance
  // cargado después de esa fecha.
  const cutoffDate = opts.periodoHasta || opts.fechaPresentacion || todayISO();
  const informes = projects.map((p) => buildInformeProyecto(p, projectDataById[p.id], cutoffDate));
  const { pieAnchors, lineChartAnchors } = buildInfoBaseSheet(wb, informes, opts, opts.logoBuffer);

  let curvaSMeta = [];
  if (!opts.soloInfoBase) {
    const usedSuffixes = new Set();
    curvaSMeta = projects.map((p, idx) => {
      let suffix = sanitizeSheetName(p.name, 14) || `Proyecto ${idx + 1}`;
      if (usedSuffixes.has(suffix)) suffix = `${suffix} ${idx + 1}`;
      usedSuffixes.add(suffix);

      buildPptoSegSheet(wb, projectDataById[p.id], suffix);
      return buildCurvaSSheet(wb, informes[idx], suffix);
    });
  }

  let buffer = await wb.xlsx.writeBuffer();

  for (const anchors of pieAnchors) {
    buffer = await addPieChart(buffer, {
      sheetName: "INFO BASE",
      fromCell: anchors.estadoInversiones.fromCell,
      extEmu: anchors.estadoInversiones.extEmu,
      title: "Estado de inversiones",
      slices: anchors.estadoInversiones.slices,
    });
    buffer = await addPieChart(buffer, {
      sheetName: "INFO BASE",
      fromCell: anchors.eficienciaCosto.fromCell,
      extEmu: anchors.eficienciaCosto.extEmu,
      title: "Eficiencia del costo",
      slices: anchors.eficienciaCosto.slices,
    });
  }

  for (const anchor of lineChartAnchors) {
    buffer = await addLineChart(buffer, {
      sheetName: "INFO BASE",
      fromCell: anchor.fromCell,
      extEmu: anchor.extEmu,
      title: anchor.title,
      series: anchor.series,
    });
  }

  for (const meta of curvaSMeta) {
    if (meta.n < 1) continue;
    const lastRow = 1 + meta.n;
    buffer = await addLineChart(buffer, {
      sheetName: meta.sheetName,
      fromCell: "E2",
      toCell: "N22",
      title: "Curva S de energización",
      series: [
        {
          name: "% Base",
          categoriesRef: `'${meta.sheetName}'!$A$2:$A$${lastRow}`,
          valuesRef: `'${meta.sheetName}'!$B$2:$B$${lastRow}`,
          values: meta.base,
          color: "4FA8D8",
        },
        {
          name: "% Ejecutado",
          categoriesRef: `'${meta.sheetName}'!$A$2:$A$${lastRow}`,
          valuesRef: `'${meta.sheetName}'!$C$2:$C$${lastRow}`,
          values: meta.real,
          color: "F5B942",
        },
      ],
    });
  }

  return buffer;
}

export { buildInformePPI01Workbook, sanitizeSheetName };
