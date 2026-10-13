// exceljs pesa ~1 MB: se descarga solo cuando alguien genera o lee un Excel, no al abrir la app.
const loadExcelJS = () => import("exceljs").then((m) => m.default);
import { groupPresupuestoItems, parseColombianNumber, parseProjectDate, uid } from "./data.js";
import { excelSerialToISO, readSheetRows } from "./excelRead.js";

// Arma una fila plana por cada pago (y una fila por orden sin pagos). Si el proyecto todavía no
// tiene ninguna orden, arma una fila de ejemplo marcada como tal (para que se sepa que hay que
// borrarla) en vez de una plantilla completamente en blanco.
export function buildPagosSheetRows(data) {
  const rows = [];
  if (data.ordenes.length === 0) {
    rows.push({
      numero: "OS-001", proveedor: "Proveedor de ejemplo", descripcion: "Descripción de ejemplo",
      valorTotal: 5000000, fecha: "2026-01-15", valorPagado: 2000000, concepto: "Anticipo", estado: "pagado",
      esEjemplo: true,
    });
    return rows;
  }
  data.ordenes.forEach((o) => {
    const base = { numero: o.numero, proveedor: o.proveedor, descripcion: o.descripcion, valorTotal: o.valorTotal };
    if (o.pagos.length === 0) {
      rows.push({ ...base, fecha: "", valorPagado: "", concepto: "", estado: "" });
    } else {
      o.pagos.forEach((p) => {
        rows.push({ ...base, fecha: p.fecha, valorPagado: p.valor, concepto: p.concepto, estado: p.estado });
      });
    }
  });
  return rows;
}

export const PAGOS_COLUMNS = [
  { header: "Número de orden", key: "numero", width: 18 },
  { header: "Proveedor", key: "proveedor", width: 26 },
  { header: "Descripción", key: "descripcion", width: 32 },
  { header: "Valor total orden", key: "valorTotal", width: 20 },
  { header: "Fecha de pago (AAAA-MM-DD)", key: "fecha", width: 24 },
  { header: "Valor pagado", key: "valorPagado", width: 18 },
  { header: "Concepto", key: "concepto", width: 26 },
  { header: "Estado (pagado/programado)", key: "estado", width: 22 },
];

export const PAGOS_ACCENT = "FFE77DA8"; // rosa de la pestaña Pagos

export async function downloadPagosTemplate(data, projectName) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Parques Solares";
  wb.created = new Date();

  const info = wb.addWorksheet("Instrucciones");
  info.getColumn(1).width = 95;
  info.addRow([`Plantilla de pagos — ${projectName || ""}`]).font = { bold: true, size: 15, color: { argb: PAGOS_ACCENT } };
  info.addRow([]);
  [
    "Cómo llenar esta plantilla:",
    "1. Ve a la pestaña \"Pagos\". Cada fila es un pago.",
    "2. Si una orden tiene varios pagos, repite el mismo \"Número de orden\" en varias filas.",
    "3. Si una orden todavía no tiene ningún pago registrado, deja vacías las columnas de pago",
    "   (Fecha, Valor pagado, Concepto, Estado) y solo llena Número/Proveedor/Descripción/Valor total.",
    "4. \"Estado\" solo acepta pagado o programado — elige de la lista desplegable de esa columna.",
    "5. Las fechas van en formato AAAA-MM-DD, por ejemplo 2026-03-15.",
    "6. Borra la fila de ejemplo (en cursiva) antes de subir el archivo, si no la necesitas.",
    "7. Al subir este archivo a la plataforma, se REEMPLAZAN todas las órdenes de este proyecto",
    "   por lo que traiga el archivo — no se suman a las que ya existen.",
  ].forEach((line, i) => {
    const row = info.addRow([line]);
    if (i === 0) row.font = { bold: true };
  });

  const ws = wb.addWorksheet("Pagos");
  ws.columns = PAGOS_COLUMNS;
  const rows = buildPagosSheetRows(data);
  rows.forEach((r) => {
    const row = ws.addRow(r);
    if (r.esEjemplo) row.font = { italic: true, color: { argb: "FF7A8A93" } };
  });

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAGOS_ACCENT } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "H1" };

  ws.getColumn("valorTotal").numFmt = '"$"#,##0';
  ws.getColumn("valorPagado").numFmt = '"$"#,##0';

  const thin = { style: "thin", color: { argb: "FFDDDDDD" } };
  for (let i = 1; i <= Math.max(rows.length + 1, 30); i++) {
    ws.getRow(i).eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
  }

  const estadoCol = ws.getColumn("estado").letter;
  for (let i = 2; i <= 500; i++) {
    ws.getCell(`${estadoCol}${i}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"pagado,programado"'] };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (projectName || "proyecto").replace(/[^a-z0-9]+/gi, "-");
  a.download = `plantilla-pagos-${safeName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export const PRESUPUESTO_ACCENT = "FF7FD08A"; // verde de la pestaña Presupuesto

export const PRESUPUESTO_COLUMNS = [
  { header: "Ítem", key: "item", width: 10 },
  { header: "Categoría / Descripción", key: "descripcion", width: 38 },
  { header: "Cantidad", key: "cantidad", width: 12 },
  { header: "Unidad", key: "unidad", width: 10 },
  { header: "Valor unitario (antes de IVA)", key: "valorUnitario", width: 22 },
  { header: "IVA %", key: "ivaPct", width: 10 },
  { header: "Valor unitario (con IVA)", key: "valorUnitarioConIva", width: 22 },
  { header: "Valor total", key: "valorTotal", width: 20 },
  { header: "IVA recuperable (referencia)", key: "ivaRecuperable", width: 22 },
];

// Arma una fila por cada categoría (encabezado en negrilla, sin Cantidad/Unidad/Valor unitario)
// seguida de sus ítems — igual a como ya se ve el presupuesto en la app. Si el proyecto no tiene
// ítems todavía, arma una categoría y 2 ítems de ejemplo (en cursiva) para que se vea el formato.
export function buildPresupuestoSheetRows(items) {
  if (!items || items.length === 0) {
    return [
      { item: "1", descripcion: "EQUIPOS PRINCIPALES", esCategoria: true, esEjemplo: true },
      { item: "1.1", descripcion: "Paneles fotovoltaicos 710w", cantidad: 2230, unidad: "UND", valorUnitario: 318952, ivaPct: 0, esEjemplo: true },
      { item: "1.2", descripcion: "Inversor 330kW", cantidad: 3, unidad: "UND", valorUnitario: 29000000, ivaPct: 0, esEjemplo: true },
    ];
  }
  const grupos = groupPresupuestoItems(items);
  const rows = [];
  grupos.forEach((g, gi) => {
    rows.push({ item: String(gi + 1), descripcion: g.categoria, esCategoria: true });
    g.items.forEach((it) => {
      rows.push({ item: it.item, descripcion: it.descripcion, cantidad: it.cantidad, unidad: it.unidad, valorUnitario: it.valorUnitario, ivaPct: it.ivaPct });
    });
  });
  return rows;
}

export async function downloadPresupuestoTemplate(items, projectName) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Parques Solares";
  wb.created = new Date();

  const info = wb.addWorksheet("Instrucciones");
  info.getColumn(1).width = 95;
  info.addRow([`Plantilla de presupuesto — ${projectName || ""}`]).font = { bold: true, size: 15, color: { argb: PRESUPUESTO_ACCENT } };
  info.addRow([]);
  [
    "Cómo llenar esta plantilla:",
    "1. Ve a la pestaña \"Presupuesto\". Cada fila es un ítem del presupuesto.",
    "2. Las filas de categoría (como \"1  EQUIPOS PRINCIPALES\") solo llevan Ítem y Descripción —",
    "   deja vacías Cantidad/Unidad/Valor unitario/IVA en esas filas, así se detectan como categoría.",
    "3. Los ítems van debajo de su categoría, con Cantidad, Unidad, Valor unitario (antes de IVA) e IVA %.",
    "4. Escribe el IVA como número sin el símbolo % (por ejemplo 19, no 19%).",
    "5. Las columnas \"Valor unitario (con IVA)\", \"Valor total\" e \"IVA recuperable\" se calculan solas —",
    "   son de referencia mientras llenas, no hace falta tocarlas (no se leen al subir el archivo).",
    "6. Borra las filas de ejemplo (en cursiva) antes de subir el archivo, si no las necesitas.",
    "7. Al subir este archivo a la plataforma, los ítems se AGREGAN a la base del proyecto —",
    "   no reemplazan los que ya existen.",
  ].forEach((line, i) => {
    const row = info.addRow([line]);
    if (i === 0) row.font = { bold: true };
  });

  const ws = wb.addWorksheet("Presupuesto");
  ws.columns = PRESUPUESTO_COLUMNS;
  const rows = buildPresupuestoSheetRows(items);
  rows.forEach((r) => {
    const row = ws.addRow(r);
    const n = row.number;
    if (!r.esCategoria) {
      row.getCell("valorUnitarioConIva").value = { formula: `E${n}*(1+F${n}/100)` };
      row.getCell("valorTotal").value = { formula: `C${n}*G${n}` };
      row.getCell("ivaRecuperable").value = { formula: `H${n}-C${n}*E${n}` };
    } else {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDEF" } };
    }
    row.font = { bold: !!r.esCategoria, italic: !!r.esEjemplo, color: r.esEjemplo ? { argb: "FF7A8A93" } : undefined };
  });

  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRESUPUESTO_ACCENT } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "I1" };

  ws.getColumn("valorUnitario").numFmt = '"$"#,##0';
  ws.getColumn("valorUnitarioConIva").numFmt = '"$"#,##0';
  ws.getColumn("valorTotal").numFmt = '"$"#,##0';
  ws.getColumn("ivaRecuperable").numFmt = '"$"#,##0';
  ws.getColumn("ivaPct").numFmt = '0"%"';

  const thin = { style: "thin", color: { argb: "FFDDDDDD" } };
  for (let i = 1; i <= Math.max(rows.length + 1, 40); i++) {
    ws.getRow(i).eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (projectName || "proyecto").replace(/[^a-z0-9]+/gi, "-");
  a.download = `plantilla-presupuesto-${safeName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Lee el .xlsx de presupuesto que suba la persona: detecta filas de categoría (Cantidad/Unidad/
// Valor unitario vacíos) igual que "Pegar desde Excel", pero leyendo el archivo directo — evita
// los problemas de copiar/pegar (columnas ocultas, autofiltro, formato del portapapeles).
export async function parsePresupuestoWorkbook(arrayBuffer) {
  const rows = await readSheetRows(arrayBuffer, "Presupuesto");
  const items = [];
  let currentCategoria = "Sin categoría";
  let skipped = 0;
  rows.forEach((r) => {
    const descripcion = String(r["Categoría / Descripción"] || "").trim();
    if (!descripcion) { skipped++; return; }
    const itemCode = String(r["Ítem"] || "").trim();
    const cantidadRaw = r["Cantidad"];
    const unidadRaw = String(r["Unidad"] || "").trim();
    const valorRaw = r["Valor unitario (antes de IVA)"];
    const ivaRaw = r["IVA %"];
    const isGroupHeader = (cantidadRaw === "" || cantidadRaw === undefined) && !unidadRaw && (valorRaw === "" || valorRaw === undefined);
    if (isGroupHeader) { currentCategoria = descripcion; return; }
    items.push({
      id: uid(),
      item: itemCode,
      categoria: currentCategoria,
      descripcion,
      cantidad: typeof cantidadRaw === "number" ? cantidadRaw : parseColombianNumber(cantidadRaw),
      unidad: unidadRaw,
      valorUnitario: typeof valorRaw === "number" ? valorRaw : parseColombianNumber(valorRaw),
      ivaPct: typeof ivaRaw === "number" ? ivaRaw : (Number(ivaRaw) || 0),
    });
  });
  return { items, skipped };
}

// Convierte lo que venga en la celda de fecha (texto, o fecha real de Excel) a "AAAA-MM-DD".
export function normalizeExcelDate(val) {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "number") {
    return excelSerialToISO(val);
  }
  const asProject = parseProjectDate(String(val));
  if (asProject) return asProject;
  const s = String(val).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// Lee el archivo .xlsx que suba la persona y arma la lista de órdenes+pagos (agrupa filas por
// "Número de orden" — varias filas con el mismo número son varios pagos de la misma orden).
export async function parsePagosWorkbook(arrayBuffer) {
  // La plantilla trae la hoja "Instrucciones" primero y "Pagos" después — se busca por nombre.
  const rows = await readSheetRows(arrayBuffer, "Pagos");
  const ordenesMap = new Map();
  let skipped = 0;
  rows.forEach((r) => {
    const numero = String(r["Número de orden"] || "").trim();
    if (!numero) { skipped++; return; }
    if (!ordenesMap.has(numero)) {
      ordenesMap.set(numero, {
        id: uid(),
        numero,
        proveedor: String(r["Proveedor"] || "").trim(),
        descripcion: String(r["Descripción"] || "").trim(),
        valorTotal: parseColombianNumber(r["Valor total orden"]) || Number(r["Valor total orden"]) || 0,
        pagos: [],
      });
    }
    const fecha = normalizeExcelDate(r["Fecha de pago (AAAA-MM-DD)"]);
    const valorRaw = r["Valor pagado"];
    if (fecha && valorRaw !== "" && valorRaw !== undefined) {
      const valor = typeof valorRaw === "number" ? valorRaw : parseColombianNumber(valorRaw);
      const estadoTexto = String(r["Estado (pagado/programado)"] || "pagado").trim().toLowerCase();
      ordenesMap.get(numero).pagos.push({
        id: uid(),
        fecha,
        valor,
        concepto: String(r["Concepto"] || "").trim(),
        estado: estadoTexto === "programado" ? "programado" : "pagado",
      });
    }
  });
  return { ordenes: Array.from(ordenesMap.values()), skipped };
}
