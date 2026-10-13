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

describe("mergeImportedOrdenes (plantilla de Pagos)", async () => {
  const { mergeImportedOrdenes } = await import("./excelTemplates.js");
  const existing = [
    {
      id: "o1", numero: "OS-1", proveedor: "Viejo", valorTotal: 100,
      presupuestoItems: [{ itemId: "i1", valor: 100 }],
      pagos: [
        { id: "p1", fecha: "2026-03-01", valor: 50, aprobado: true, aprobadoPor: "Ana", aprobadoEn: "2026-03-02" },
        { id: "p2", fecha: "2026-04-01", valor: 50, aprobado: true, aprobadoPor: "Ana" },
      ],
    },
    { id: "o2", numero: "OS-2", pagos: [{ id: "p3", fecha: "2026-05-01", valor: 10 }] },
  ];
  const imported = [
    { id: "n1", numero: " os-1 ", proveedor: "Nuevo", valorTotal: 120, pagos: [
      { id: "x1", fecha: "2026-03-01", valor: 50, concepto: "Anticipo", estado: "pagado" },
      { id: "x2", fecha: "2026-06-01", valor: 70, estado: "programado" },
    ] },
    { id: "n3", numero: "OS-3", pagos: [] },
  ];
  const r = mergeImportedOrdenes(existing, imported);

  it("conserva id y amarres de la orden existente y toma lo nuevo del archivo", () => {
    const o = r.ordenes[0];
    expect(o.id).toBe("o1");
    expect(o.proveedor).toBe("Nuevo");
    expect(o.valorTotal).toBe(120);
    expect(o.presupuestoItems).toEqual([{ itemId: "i1", valor: 100 }]);
    expect(r.amarresConservados).toBe(1);
  });
  it("conserva id y aprobación del pago que coincide en fecha y valor", () => {
    const [p1, nuevo] = r.ordenes[0].pagos;
    expect(p1).toMatchObject({ id: "p1", aprobado: true, aprobadoPor: "Ana", concepto: "Anticipo" });
    expect(nuevo.id).toBe("x2");
    expect(nuevo.aprobado).toBeUndefined();
    expect(r.aprobacionesConservadas).toBe(1);
  });
  it("cuenta los pagos aprobados que el archivo elimina; las órdenes nuevas quedan igual", () => {
    expect(r.aprobadosEliminados).toBe(1); // p2
    expect(r.ordenes[1]).toEqual(imported[1]);
    expect(r.ordenes).toHaveLength(2); // OS-2 no está en el archivo → se reemplaza
  });
});
