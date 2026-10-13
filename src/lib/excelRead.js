// Lectura de archivos .xlsx subidos por la persona, con exceljs (reemplaza a la librería "xlsx",
// que tiene vulnerabilidades sin parche). Devuelve las filas como objetos { encabezado: valor },
// igual que hacía XLSX.utils.sheet_to_json(ws, { defval: "" }): la fila 1 son los encabezados,
// las celdas vacías vienen como "" y las filas totalmente vacías se omiten.
import ExcelJS from "exceljs";

function cellValue(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result); // fórmula
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return cellValue(v.text); // hipervínculo
    return ""; // errores (#N/A, #REF!…)
  }
  return v;
}

// preferredSheet: nombre de la hoja a leer; si no existe, la última del libro (las plantillas
// traen "Instrucciones" primero).
export async function readSheetRows(arrayBuffer, preferredSheet) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.getWorksheet(preferredSheet) || wb.worksheets[wb.worksheets.length - 1];
  if (!ws) return [];
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cellValue(cell.value)).trim();
  });
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    let hasValue = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const v = cellValue(row.getCell(col).value);
      if (v !== "") hasValue = true;
      obj[h] = v;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}

// Número de serie de fecha de Excel (días desde 1899-12-30) → "AAAA-MM-DD".
export function excelSerialToISO(serial) {
  if (typeof serial !== "number" || !isFinite(serial) || serial <= 0) return "";
  const ms = Math.round(serial * 86400000) + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}
