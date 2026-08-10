import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildInformePPI01Workbook } from "./informePPI01Excel.js";
import { emptyProjectData } from "./data.js";

function sampleData() {
  const data = emptyProjectData();
  data.balance.valorVentaCliente = 5000000;
  data.presupuesto.base = [{ id: "1", item: "1.1", categoria: "EQUIPOS", descripcion: "Panel", cantidad: 10, unidad: "UND", valorUnitario: 100000, ivaPct: 19 }];
  data.presupuesto.ejecucion = [{ id: "1", item: "1.1", categoria: "EQUIPOS", descripcion: "Panel", cantidad: 10, unidad: "UND", valorUnitario: 110000, ivaPct: 19 }];
  data.energizacion.fechaInicio = "2026-01-01";
  data.info.equipo = [{ id: "e1", cargo: "Director de obra", nombre: "Juan Pérez" }];
  data.info.cortesObra.contratistas = [{ id: "c1", proveedor: "ACME", incluir: true, reteobra: 5000 }];
  data.pagos.ordenes = [{ id: "o1", numero: "1", proveedor: "ACME", valorTotal: 50000, pagos: [{ id: "pg1", fecha: "2026-01-10", valor: 50000, estado: "pagado" }] }];
  return data;
}

// Busca en la columna B (donde caen las etiquetas de labelValueRow/sectionBand) la fila cuyo texto
// empieza con `labelPrefix`, y devuelve el valor de esa fila en la columna D (donde debería caer
// el valor fusionado D:F) — para confirmar que la celda de verdad tiene el dato, no solo que el
// archivo carga sin errores.
function findLabelValue(ws, labelPrefix) {
  for (let r = 1; r <= ws.rowCount; r++) {
    const label = ws.getCell(r, 2).value;
    if (typeof label === "string" && label.startsWith(labelPrefix)) {
      return ws.getCell(r, 4).value;
    }
  }
  return undefined;
}

describe("buildInformePPI01Workbook", () => {
  it("las filas etiqueta:valor (POTENCIA, VALOR CONTRACTUAL, CENTRO DE COSTOS...) sí tienen el dato en la celda de valor", async () => {
    const projects = [{ id: "p1", name: "GD Garza", code: "GP084", capacity: "0,99", location: "Sabanalarga, Atlántico" }];
    const data = sampleData();
    const projectDataById = { p1: data };
    const buffer = await buildInformePPI01Workbook(projects, projectDataById, { fechaPresentacion: "2026-08-10" });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet("INFO BASE");

    expect(findLabelValue(ws, "POTENCIA")).toBe("0,99 MW");
    expect(findLabelValue(ws, "CENTRO DE COSTOS/PROYECTO")).toBe("GP084 - GD Garza");
    expect(findLabelValue(ws, "VALOR CONTRACTUAL")).toBe(5000000);
    expect(findLabelValue(ws, "FECHA PRESENTACIÓN DEL INFORME")).toBeTruthy();
  });

  it("genera un workbook válido para un solo proyecto", async () => {
    const projects = [{ id: "p1", name: "Proyecto Uno", capacity: "1.2", location: "Girardota, Antioquia" }];
    const projectDataById = { p1: sampleData() };
    const buffer = await buildInformePPI01Workbook(projects, projectDataById);
    expect(buffer.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toContain("INFO BASE");
    expect(sheetNames.some((n) => n.startsWith("PPTO SEG"))).toBe(true);
    expect(sheetNames.some((n) => n.startsWith("CURVA S SENERGIZACIÓN"))).toBe(true);
  });

  it("genera un workbook para varios proyectos con nombres de hoja únicos", async () => {
    const projects = [
      { id: "p1", name: "GD Garza", capacity: "1.2", location: "Girardota, Antioquia" },
      { id: "p2", name: "Filigrana", capacity: "9.9", location: "Copacabana, Antioquia" },
    ];
    const projectDataById = { p1: sampleData(), p2: emptyProjectData() };
    const buffer = await buildInformePPI01Workbook(projects, projectDataById);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(new Set(sheetNames).size).toBe(sheetNames.length); // sin duplicados
    // p2 no tiene energización con fecha de inicio -> curva S vacía -> no debería tronar ni tener gráfico
    expect(sheetNames.filter((n) => n.startsWith("PPTO SEG")).length).toBe(2);
  });
});
