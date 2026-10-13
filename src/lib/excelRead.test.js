import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { readSheetRows, excelSerialToISO } from "./excelRead.js";

async function buildWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Instrucciones").addRow(["Cómo llenar…"]);
  const ws = wb.addWorksheet("Pagos");
  ws.addRow(["Número de orden", "Valor pagado", "Fecha de pago (AAAA-MM-DD)", "Concepto"]);
  ws.addRow(["OS-1", 1500000, new Date(Date.UTC(2026, 2, 15)), { richText: [{ text: "Anti" }, { text: "cipo" }] }]);
  ws.addRow([]); // fila vacía: se omite
  ws.addRow(["OS-2", { formula: "1+1", result: 2 }, "", null]);
  return wb.xlsx.writeBuffer();
}

describe("readSheetRows", () => {
  it("lee la hoja pedida con la fila 1 como encabezados", async () => {
    const rows = await readSheetRows(await buildWorkbook(), "Pagos");
    expect(rows).toHaveLength(2);
    expect(rows[0]["Número de orden"]).toBe("OS-1");
    expect(rows[0]["Valor pagado"]).toBe(1500000);
    expect(rows[0]["Fecha de pago (AAAA-MM-DD)"].toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(rows[0]["Concepto"]).toBe("Anticipo");
    expect(rows[1]["Valor pagado"]).toBe(2); // resultado de la fórmula
    expect(rows[1]["Concepto"]).toBe("");
  });

  it("si la hoja no existe, usa la última", async () => {
    const rows = await readSheetRows(await buildWorkbook(), "NoExiste");
    expect(rows[0]["Número de orden"]).toBe("OS-1");
  });
});

describe("excelSerialToISO", () => {
  it("convierte números de serie de Excel", () => {
    expect(excelSerialToISO(46096)).toBe("2026-03-15");
    expect(excelSerialToISO(1)).toBe("1899-12-31");
    expect(excelSerialToISO(0)).toBe("");
  });
});
