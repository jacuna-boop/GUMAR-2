/*
 * Datos y funciones puras compartidas por toda la app.
 * Migrado desde el artifact original de Claude — misma lógica de negocio,
 * ahora reutilizable en un proyecto Vite normal.
 */

const UPME_STEPS = [
  { id: "s1", num: 1, label: "Proyecto creado en la UPME" },
  { id: "s2", num: 2, label: "Consecución de fichas técnicas y certificados" },
  { id: "s3", num: 3, label: "Diligenciamiento de información en la plataforma" },
  { id: "s4", num: 4, label: "Pago de tarifa" },
  { id: "s5", num: 5, label: "Radicado" },
  {
    id: "s6",
    num: 6,
    label: "Revisión por parte de la UPME",
    decision: { question: "¿Cumplió con la primera revisión de la UPME?", ifSiSkipTo: "s9", ifNoGoTo: "s7" },
  },
  { id: "s7", num: 7, label: "Comentarios emitidos por la UPME (primera versión)", skipIf: (u) => u.steps.s6?.decision === "si" },
  { id: "s8", num: 8, label: "Subsanación de comentarios emitidos", skipIf: (u) => u.steps.s6?.decision === "si" },
  {
    id: "s9",
    num: 9,
    label: "Verificación de documentación inicial e inicio de revisión del componente técnico",
    decision: { question: "¿Hay comentarios para subsanar?", ifNoSkipTo: "s12", ifSiGoTo: "s10" },
  },
  { id: "s10", num: 10, label: "Emisión de comentarios por parte de la UPME", skipIf: (u) => u.steps.s9?.decision === "no" },
  { id: "s11", num: 11, label: "Subsanación de comentarios", skipIf: (u) => u.steps.s9?.decision === "no" },
  { id: "s12", num: 12, label: "Emisión de certificado" },
];

/* ---------------------------------------------------------------------
   DATA: Actividades de energización con costo (Curva S — 4_CURVA_S_ENERGIZACION)
   'day' = día calendario desde el inicio del proyecto (día 0 = contratación inicial)
   'cost' = peso de la actividad en la curva S (unidades relativas, total = 655)
--------------------------------------------------------------------- */
const ENERGIZACION_GROUPS = [
  { id: "or", label: "Trámites ante el Operador de Red (OR)", cat: "OR", items: [
    { title: "Aprobación del punto de conexión", day: 0, cost: 10 },
    { title: "Solicitud de prórroga", day: 5, cost: 5 },
    { title: "Respuesta de prórroga", day: 5, cost: 10 },
    { title: "Solicitud de visita a punto de conexión", day: 6, cost: 5 },
    { title: "Visita para viabilidad de línea punto de conexión", day: 15, cost: 5 },
    { title: "Radicación de línea ante el OR", day: 71, cost: 5 },
    { title: "Aprobación de línea por parte del OR", day: 112, cost: 10 },
    { title: "Correo del OR con factura de seguimiento (revisión de materiales)", day: 112, cost: 0 },
    { title: "Envío soporte de pago + factura de materiales + solicitud de visita", day: 112, cost: 0 },
    { title: "Visita revisión de materiales", day: 118, cost: 5 },
    { title: "Correo al OR: solicitud descargo de obras previas", day: 118, cost: 5 },
    { title: "Respuesta con fecha de descargo", day: 125, cost: 10 },
    { title: "Descargo de obras previas", day: 131, cost: 10 },
    { title: "Solicitud de descargo final", day: 132, cost: 5 },
    { title: "Visita recepción de proyecto", day: 154, cost: 10 },
    { title: "Descargo energización del proyecto", day: 167, cost: 30 },
    { title: "Programación de visita de protecciones", day: 154, cost: 5 },
    { title: "Visita revisión de protecciones", day: 167, cost: 30 },
  ]},
  { id: "c91", label: "Carta 9.1 · Registro de proyecto en el MDC", cat: "Carta", items: [
    { title: "Solicitud firma Carta 9.1 al OR", day: 21, cost: 5 },
    { title: "Respuesta Carta 9.1 firmada", day: 41, cost: 10 },
    { title: "Correo a XM (crear proyecto en MDC) + envío Carta 9.1", day: 41, cost: 5 },
    { title: "Respuesta: proyecto registrado en MDC", day: 47, cost: 20 },
  ]},
  { id: "c97", label: "Carta 9.7 · Certificado de conexión", cat: "Carta", items: [
    { title: "Enviar formato certificación de conexión y capacidad para firma", day: 21, cost: 5 },
    { title: "Carta 9.7 firmada por el OR", day: 41, cost: 5 },
    { title: "Carga Carta 9.7 a MDC", day: 47, cost: 5 },
    { title: "Carta 9.7 aprobada", day: 54, cost: 10 },
  ]},
  { id: "c95", label: "Carta 9.5 · Disponibilidad de activos", cat: "Carta", items: [
    { title: "Diligenciar formato indisponibilidades excluidas + enviar al OR", day: 41, cost: 5 },
    { title: "Respuesta: firma Carta 9.5 por el OR", day: 54, cost: 5 },
    { title: "Cargar Carta 9.5 en el MDC", day: 54, cost: 5 },
    { title: "Aprobación Carta 9.5 por XM", day: 63, cost: 10 },
  ]},
  { id: "c92", label: "Carta 9.2 · Representante de frontera (RF)", cat: "Carta", items: [
    { title: "Contratación RF y centro de gestión de medida", day: 0, cost: 5 },
    { title: "Solicitar firma al RF de la Carta 9.2", day: 47, cost: 5 },
    { title: "Carta 9.2 firmada", day: 50, cost: 5 },
    { title: "Cargar Carta 9.2 en el MDC", day: 50, cost: 5 },
    { title: "Aprobación Carta 9.2 por XM", day: 54, cost: 5 },
  ]},
  { id: "c93", label: "Carta 9.3 · Datos de RF y medida", cat: "Carta", items: [
    { title: "Diligenciar formato de parámetros técnicos y cargar en MDC", day: 50, cost: 5 },
    { title: "Aprobación Carta 9.3 por XM", day: 54, cost: 5 },
  ]},
  { id: "c96", label: "Carta 9.6 · Código de frontera", cat: "Carta", items: [
    { title: "Compra de medidores, TC, TP, gabinete y cable de control", day: 116, cost: 10 },
    { title: "Contratación tercero verificador (Negawatt)", day: 0, cost: 5 },
    { title: "Llegada de medidores parametrizados", day: 158, cost: 10 },
    { title: "Enviar información CREG 038 al tercero verificador", day: 160, cost: 10 },
    { title: "Certificado de frontera — respuesta del tercero verificador", day: 166, cost: 10 },
    { title: "Cargar en el MDC certificado de frontera", day: 167, cost: 5 },
    { title: "Aprobación Carta 9.6", day: 170, cost: 10 },
  ]},
  { id: "c94", label: "Carta 9.4 · Cumplimiento de protecciones", cat: "Carta", items: [
    { title: "Emisión de acta del OR", day: 170, cost: 20 },
    { title: "Enviar Carta 9.4 al OR para firma", day: 170, cost: 5 },
    { title: "Carta 9.4 firmada OR (FPO)", day: 184, cost: 30 },
    { title: "Cargar Carta 9.4 en MDC", day: 184, cost: 5 },
    { title: "Aprobación de Carta 9.4", day: 188, cost: 10 },
  ]},
  { id: "c98", label: "Carta 9.8 · Declaración del programa de generación", cat: "Carta", items: [
    { title: "Enviar aprobación de Carta 9.4 al RF", day: 188, cost: 5 },
    { title: "RF envía acta al promotor", day: 189, cost: 5 },
    { title: "Carga de acta (Carta 9.8) en MDC", day: 189, cost: 5 },
    { title: "Aprobación Carta 9.8", day: 195, cost: 5 },
  ]},
  { id: "c99", label: "Carta 9.9 · Cumplimiento de reglamentación vigente", cat: "Carta", items: [
    { title: "Enviar documento Carta 9.9 al OR", day: 195, cost: 5 },
    { title: "Carta 9.9 firmada por el OR", day: 196, cost: 5 },
    { title: "Carga Carta 9.9 a MDC", day: 196, cost: 5 },
    { title: "Aprobación Carta 9.9", day: 200, cost: 5 },
  ]},
  { id: "c910", label: "Carta 9.10 · Declaración entrada en operación", cat: "Carta", items: [
    { title: "RF envía Carta 9.10 al promotor", day: 195, cost: 5 },
    { title: "Cargar Carta 9.10 al MDC", day: 196, cost: 5 },
    { title: "Aprobación Carta 9.10", day: 200, cost: 10 },
  ]},
  { id: "cod", label: "Declaración COD", cat: "COD", items: [
    { title: "Declaración de puesta en operación (COD)", day: 200, cost: 10 },
  ]},
  { id: "parque", label: "Construcción del parque", cat: "Parque", items: [
    { title: "Definición de equipos principales (Panel, Inversor, Trafo)", day: 12, cost: 5 },
    { title: "Desarrollo de ingeniería", day: 15, cost: 20 },
    { title: "Construcción del parque", day: 81, cost: 30 },
    { title: "Pago certificado RETIE", day: 113, cost: 0 },
    { title: "Visita RETIE", day: 130, cost: 10 },
    { title: "Certificado RETIE", day: 134, cost: 20 },
  ]},
  { id: "linea", label: "Construcción de línea", cat: "Linea", items: [
    { title: "Desarrollo de ingeniería de línea", day: 15, cost: 20 },
    { title: "Construcción de línea MT", day: 119, cost: 30 },
    { title: "Pruebas VLF", day: 131, cost: 10 },
    { title: "Instalación de reconectador", day: 119, cost: 10 },
    { title: "Pruebas reconectador", day: 124, cost: 5 },
    { title: "Informe de pruebas reconectador", day: 128, cost: 10 },
  ]},
];

const ENERGIZACION_MILESTONES = ENERGIZACION_GROUPS.flatMap((g) =>
  g.items.map((it) => ({ ...it, cat: g.cat, group: g.label, groupId: g.id }))
);
const ENERGIZACION_TOTAL_COST = ENERGIZACION_MILESTONES.reduce((s, m) => s + m.cost, 0);

const CAT_STYLE = {
  OR: { bg: "#3A2E12", fg: "#F5B942", label: "Trámite OR" },
  Linea: { bg: "#0F2A24", fg: "#4FBF8F", label: "Línea" },
  Parque: { bg: "#16261B", fg: "#7FD08A", label: "Parque" },
  Carta: { bg: "#2E1520", fg: "#E77DA8", label: "Carta 9.x" },
  COD: { bg: "#2E1F0C", fg: "#F2C063", label: "COD" },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (isoStart, isoEnd) => {
  const a = new Date(isoStart + "T00:00:00");
  const b = new Date(isoEnd + "T00:00:00");
  return Math.round((b - a) / 86400000);
};
const addYears = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtTime = (date) =>
  date ? date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDateTime = (date) =>
  date
    ? `${date.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })} · ${fmtTime(date)}`
    : "";

function emptyUpmeState() {
  const steps = {};
  UPME_STEPS.forEach((s) => {
    steps[s.id] = { completado: false, fecha: "", decision: null, notas: "" };
  });
  return { steps };
}

function emptyEnergizacionState() {
  return {
    fechaInicio: todayISO(),
    milestones: ENERGIZACION_MILESTONES.map(() => ({ done: false, fecha: "" })),
  };
}

function emptyCronogramaState() {
  return {
    tasks: [], // { id, nombre, fechaInicio, fechaFin, peso }
    seguimiento: [], // { id, fecha, avance } — avance = % acumulado real en esa fecha
  };
}

function emptyPresupuestoState() {
  return {
    // Cada lista tiene items con la misma estructura de columnas que el Excel de referencia:
    // { id, item, categoria, descripcion, cantidad, unidad, valorUnitario (antes de IVA), ivaPct }
    // valorUnitarioConIva, valorTotal e ivaRecuperable se calculan (ver calcPresupuestoItem)
    base: [],
    ejecucion: [],
  };
}

function emptyPagosState() {
  return {
    ordenes: [], // { id, numero, proveedor, valorTotal, pagos: [{ id, fecha, valor, concepto }] }
  };
}

function emptyProjectData() {
  return {
    upme: emptyUpmeState(),
    energizacion: emptyEnergizacionState(),
    cronograma: emptyCronogramaState(),
    presupuesto: emptyPresupuestoState(),
    pagos: emptyPagosState(),
  };
}

// Adds any fields missing from older saved data (e.g. projects created before "presupuesto"/"pagos" existed,
// or before "presupuesto" moved from {items} to {base, ejecucion})
function ensureFullProjectData(data) {
  const rawPresupuesto = data?.presupuesto;
  const presupuesto =
    rawPresupuesto && (rawPresupuesto.base || rawPresupuesto.ejecucion)
      ? { base: rawPresupuesto.base || [], ejecucion: rawPresupuesto.ejecucion || [] }
      : emptyPresupuestoState();

  const rawPagos = data?.pagos;
  const pagos = rawPagos && Array.isArray(rawPagos.ordenes) ? { ordenes: rawPagos.ordenes } : emptyPagosState();

  const rawCronograma = data?.cronograma;
  const cronograma =
    rawCronograma && Array.isArray(rawCronograma.tasks)
      ? { tasks: rawCronograma.tasks, seguimiento: Array.isArray(rawCronograma.seguimiento) ? rawCronograma.seguimiento : [] }
      : emptyCronogramaState();

  const rawUpme = data?.upme;
  const upme = rawUpme && rawUpme.steps ? rawUpme : emptyUpmeState();

  const rawEner = data?.energizacion;
  const energizacion = rawEner && Array.isArray(rawEner.milestones) ? rawEner : emptyEnergizacionState();

  return { upme, energizacion, cronograma, presupuesto, pagos };
}

// Calcula valor unitario con IVA, valor total e IVA recuperable de una línea de presupuesto
function calcPresupuestoItem(it) {
  const cantidad = Number(it.cantidad) || 0;
  const valorUnitario = Number(it.valorUnitario) || 0; // antes de IVA
  const ivaPct = Number(it.ivaPct) || 0;
  const valorUnitarioConIva = valorUnitario * (1 + ivaPct / 100);
  const valorTotal = cantidad * valorUnitarioConIva;
  const ivaRecuperable = valorTotal - cantidad * valorUnitario;
  return { valorUnitarioConIva, valorTotal, ivaRecuperable };
}

function presupuestoListTotal(items) {
  return (items || []).reduce((s, it) => s + calcPresupuestoItem(it).valorTotal, 0);
}

function presupuestoTotals(presupuesto) {
  const base = presupuestoListTotal(presupuesto?.base);
  const ejecutado = presupuestoListTotal(presupuesto?.ejecucion);
  const diferencia = ejecutado - base;
  const pct = base ? Math.round((ejecutado / base) * 100) : 0;
  return { base, ejecutado, diferencia, pct };
}

// Agrupa items de presupuesto por categoría, preservando el orden de primera aparición
function groupPresupuestoItems(items) {
  const order = [];
  const map = {};
  (items || []).forEach((it) => {
    const cat = it.categoria?.trim() || "Sin categoría";
    if (!map[cat]) {
      map[cat] = [];
      order.push(cat);
    }
    map[cat].push(it);
  });
  return order.map((cat) => ({ categoria: cat, items: map[cat] }));
}

function ordenPagado(orden) {
  return (orden.pagos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
}
function ordenSaldo(orden) {
  return (Number(orden.valorTotal) || 0) - ordenPagado(orden);
}
function pagosTotals(pagos) {
  const ordenes = pagos?.ordenes || [];
  const totalOrdenes = ordenes.reduce((s, o) => s + (Number(o.valorTotal) || 0), 0);
  const totalPagado = ordenes.reduce((s, o) => s + ordenPagado(o), 0);
  const totalSaldo = totalOrdenes - totalPagado;
  return { totalOrdenes, totalPagado, totalSaldo };
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

// Parses a number typed/copied in Colombian format (e.g. "338.282" o "338.282,50") into a plain float
function parseColombianNumber(str) {
  if (str === undefined || str === null) return 0;
  let s = String(str).trim();
  if (!s) return 0;
  s = s.replace(/[^0-9.,-]/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/\./g, ""); // "." usado como separador de miles
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parsePercentValue(str) {
  if (!str) return 0;
  const n = parseFloat(String(str).replace("%", "").replace(",", ".").trim());
  return isNaN(n) ? 0 : n;
}

// Parsea filas pegadas desde Excel (separadas por tabulador) al formato de ítems de presupuesto.
// Formato esperado por columna: Ítem | Descripción | Cantidad | Unidad | Valor unitario (antes de IVA) | IVA %
// Una fila donde Cantidad/Unidad/Valor unitario vienen vacías se interpreta como encabezado de categoría
// (p. ej. "1  EQUIPOS PRINCIPALES") y agrupa las filas siguientes bajo esa categoría.
function parsePresupuestoPaste(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);

  const items = [];
  let currentCategoria = "Sin categoría";
  let skipped = 0;

  lines.forEach((line) => {
    const cols = line.split("\t");
    const itemCode = (cols[0] || "").trim();
    const descripcion = (cols[1] || "").trim();
    if (!descripcion) {
      skipped++;
      return;
    }
    if (/^(item|ítem)$/i.test(itemCode) || /^descrip/i.test(descripcion)) return; // fila de encabezados de columnas

    const cantidadRaw = (cols[2] || "").trim();
    const unidadRaw = (cols[3] || "").trim();
    const valorRaw = (cols[4] || "").trim();
    const ivaRaw = (cols[5] || "").trim();

    const isGroupHeader = !cantidadRaw && !unidadRaw && !valorRaw;
    if (isGroupHeader) {
      currentCategoria = descripcion;
      return;
    }

    items.push({
      id: uid(),
      item: itemCode,
      categoria: currentCategoria,
      descripcion,
      cantidad: parseColombianNumber(cantidadRaw),
      unidad: unidadRaw,
      valorUnitario: parseColombianNumber(valorRaw),
      ivaPct: parsePercentValue(ivaRaw),
    });
  });

  return { items, skipped };
}

function fractionElapsed(startISO, endISO, dateISO) {
  const s = new Date(startISO + "T00:00:00").getTime();
  const e = new Date(endISO + "T00:00:00").getTime();
  const d = new Date(dateISO + "T00:00:00").getTime();
  if (e <= s) return d >= s ? 1 : 0;
  return Math.min(1, Math.max(0, (d - s) / (e - s)));
}

function cronogramaPesoTotal(tasks) {
  return tasks.filter((t) => !t.esGrupo).reduce((s, t) => s + (Number(t.peso) || 0), 0);
}

// Builds the merged baseline ("línea base") vs actual ("seguimiento") S-curve series for the chart
function buildCurvaSData(cronograma) {
  const { tasks, seguimiento } = cronograma;
  const leafTasks = tasks.filter((t) => !t.esGrupo);
  const dateSet = new Set();
  leafTasks.forEach((t) => {
    if (t.fechaInicio) dateSet.add(t.fechaInicio);
    if (t.fechaFin) dateSet.add(t.fechaFin);
  });
  seguimiento.forEach((s) => {
    if (s.fecha) dateSet.add(s.fecha);
  });
  if (dateSet.size === 0) return [];
  const sortedDates = Array.from(dateSet).sort();
  const sortedSeg = [...seguimiento].filter((s) => s.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));

  return sortedDates.map((date) => {
    const base = leafTasks.reduce((sum, t) => {
      if (!t.fechaInicio || !t.fechaFin) return sum;
      return sum + (Number(t.peso) || 0) * fractionElapsed(t.fechaInicio, t.fechaFin, date);
    }, 0);
    const lastSeg = [...sortedSeg].filter((s) => s.fecha <= date).pop();
    return {
      date,
      label: fmtDate(date),
      base: Math.round(base * 10) / 10,
      real: lastSeg ? Number(lastSeg.avance) : null,
    };
  });
}

// Convierte una fecha de MS Project como "mar 20/01/26" o "20/01/2026" a formato ISO (aaaa-mm-dd)
function parseProjectDate(str) {
  if (!str) return "";
  const m = String(str).trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  if (!m) return "";
  let [, d, mo, y] = m;
  d = d.padStart(2, "0");
  mo = mo.padStart(2, "0");
  if (y.length === 2) y = "20" + y;
  return `${y}-${mo}-${d}`;
}

// Calcula avance actual ponderado a partir del % completado de cada tarea hoja (para el punto
// más reciente de la curva de seguimiento, cuando se importa/actualiza desde MS Project).
function cronogramaAvanceActual(tasks) {
  const leaf = (tasks || []).filter((t) => !t.esGrupo);
  const pesoTotal = leaf.reduce((s, t) => s + (Number(t.peso) || 0), 0);
  if (!pesoTotal) return 0;
  const avance = leaf.reduce((s, t) => s + (Number(t.peso) || 0) * (Number(t.pctCompletado) || 0) / 100, 0);
  return Math.round((avance / pesoTotal) * pesoTotal * 10) / 10; // = avance ponderado sobre 100
}

// Parsea filas copiadas/pegadas desde MS Project (o Excel con las mismas columnas) para el cronograma.
// Usa la fila de encabezado para ubicar las columnas, así que es tolerante a columnas de más
// (como "Modo de tarea", que no trae texto útil al copiar) o a un orden distinto.
// Heurística de agrupación: una fila cuya "Duración" no es "0 días" se trata como fila de
// resumen/categoría (como "PROCURA EQUIPOS PRINCIPALES"), ya que en cronogramas de este tipo
// las tareas puntuales quedan con 0 días. Se puede corregir manualmente después de importar.
function parseCronogramaPaste(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { tasks: [], skipped: 0 };

  const headerCols = lines[0].split("\t").map((c) => c.trim().toLowerCase());
  const findCol = (...keywords) => headerCols.findIndex((c) => keywords.some((k) => c.includes(k)));
  const idxId = findCol("id");
  const idxNombre = findCol("nombre");
  const idxDuracion = findCol("duraci");
  const idxComienzo = findCol("comienzo", "inicio");
  const idxFin = findCol("fin");
  const idxPred = findCol("predecesor");
  const idxPct = findCol("completado");

  const hasHeader = idxNombre !== -1 && idxComienzo !== -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const tasks = [];
  let skipped = 0;
  dataLines.forEach((line) => {
    const cols = line.split("\t");
    const nombre = (idxNombre !== -1 ? cols[idxNombre] : cols[1] || "").trim();
    if (!nombre) {
      skipped++;
      return;
    }
    const duracionTexto = (idxDuracion !== -1 ? cols[idxDuracion] : "").trim();
    const fechaInicio = parseProjectDate(idxComienzo !== -1 ? cols[idxComienzo] : "");
    const fechaFin = parseProjectDate(idxFin !== -1 ? cols[idxFin] : "");
    const predecesoras = (idxPred !== -1 ? cols[idxPred] : "").trim();
    const pctCompletado = idxPct !== -1 ? parsePercentValue(cols[idxPct]) : 0;
    const displayId = (idxId !== -1 ? cols[idxId] : "").trim();
    const esGrupo = !!duracionTexto && !/^0\s/.test(duracionTexto);
    tasks.push({
      id: uid(), displayId, nombre, duracionTexto, fechaInicio, fechaFin,
      predecesoras, pctCompletado, esGrupo, peso: 0,
    });
  });

  const leaf = tasks.filter((t) => !t.esGrupo);
  if (leaf.length) {
    const pesoIgual = Math.round((100 / leaf.length) * 10) / 10;
    leaf.forEach((t) => { t.peso = pesoIgual; });
  }

  return { tasks, skipped };
}

const STATUS_LABELS = {
  no_iniciado: "No iniciado",
  radicado: "Radicado",
  incompleto: "Subsanación",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

function buildReportHTML(project, data) {
  const upmePct = upmeProgress(data.upme);
  const enerPct = energizacionProgress(data.energizacion);
  const now = new Date();

  const upmeHTML = upmeActiveSteps(data.upme).map((s) => {
    const st = data.upme.steps[s.id];
    const decisionHTML = s.decision
      ? `<div class="phase-meta">${escapeHTML(s.decision.question)}: <strong>${st.decision ? (st.decision === "si" ? "Sí" : "No") : "Sin definir"}</strong></div>`
      : "";
    return `
      <div class="phase-box">
        <div class="phase-head"><span>${s.num}. ${escapeHTML(s.label)}</span><span>${st.completado ? "Completado" : "Pendiente"}</span></div>
        <div class="phase-meta">Fecha: ${fmtDate(st.fecha)}</div>
        ${decisionHTML}
        ${st.notas ? `<div class="phase-meta" style="margin-top:6px">Notas: ${escapeHTML(st.notas)}</div>` : ""}
      </div>`;
  }).join("");

  let cursor = 0;
  const enerHTML = ENERGIZACION_GROUPS.map((g) => {
    const start = cursor;
    cursor += g.items.length;
    const groupCost = g.items.reduce((s, it) => s + it.cost, 0);
    const doneCost = g.items.reduce((s, it, j) => s + (data.energizacion.milestones[start + j]?.done ? it.cost : 0), 0);
    const groupPct = groupCost ? Math.round((doneCost / groupCost) * 100) : 100;
    const rows = g.items
      .map((it, j) => {
        const state = data.energizacion.milestones[start + j];
        return `<tr>
          <td>${state?.done ? "☑" : "☐"}</td>
          <td>${escapeHTML(it.title)}</td>
          <td>${it.day}</td>
          <td>${it.cost}</td>
          <td>${state?.done ? fmtDate(state.fecha) : "—"}</td>
        </tr>`;
      })
      .join("");
    return `
      <div class="group-box">
        <div class="group-head"><span>${escapeHTML(g.label)}</span><span>${groupPct}% · peso ${groupCost}</span></div>
        <table>
          <thead><tr><th>Estado</th><th>Actividad</th><th>Día</th><th>Peso</th><th>Fecha</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>${escapeHTML(project.name)} — Reporte</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1A1A1A; background:#fff; padding: 24px 30px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .meta { font-size: 11px; color: #555; margin-bottom: 4px; }
  .gen-at { font-size: 10px; color: #888; margin-bottom: 18px; }
  h2 { font-size: 15px; margin: 22px 0 4px; border-bottom: 2px solid #1A1A1A; padding-bottom: 4px; }
  .phase-box { border: 1px solid #ccc; border-radius: 6px; padding: 10px 14px; margin-bottom: 10px; break-inside: avoid; }
  .phase-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 12.5px; margin-bottom: 4px; }
  .phase-meta { font-size: 10.5px; color: #555; margin-bottom: 6px; }
  .check-row { font-size: 11px; padding: 2px 0; }
  .group-box { margin-bottom: 14px; break-inside: avoid; }
  .group-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 12px; background: #f0f0f0; padding: 5px 10px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 4px; }
  th { text-align: left; padding: 3px 8px; border-bottom: 1px solid #ccc; color: #555; font-weight: 600; }
  td { padding: 3px 8px; border-bottom: 1px solid #eee; }
  .hint { margin: 18px 0; padding: 10px 14px; background: #FFF7E0; border: 1px solid #F0D98C; border-radius: 6px; font-size: 11px; }
  @media print { .hint { display: none; } }
</style>
</head>
<body>
  <div class="hint">Para guardar como PDF: usa Ctrl+P (o Cmd+P en Mac) y elige "Guardar como PDF".</div>
  <h1>${escapeHTML(project.name)}</h1>
  <div class="meta">${project.capacity ? `${escapeHTML(project.capacity)} MWp` : ""}${project.location ? `  ·  ${escapeHTML(project.location)}` : ""}</div>
  <div class="gen-at">Reporte generado el ${fmtDateTime(now)}</div>
  <h2>Radicación UPME — ${upmePct}% completado</h2>
  ${upmeHTML}
  <h2>Energización — ${enerPct}% completado (ponderado por costo)</h2>
  ${enerHTML}
</body>
</html>`;
}

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Devuelve solo los pasos que aplican según las decisiones tomadas en los pasos 6 y 9
// (excluye 7-8 si la primera revisión se cumplió, y 10-11 si no hubo comentarios para subsanar)
function upmeActiveSteps(upme) {
  return UPME_STEPS.filter((s) => !(s.skipIf && s.skipIf(upme)));
}
function upmeProgress(upme) {
  const active = upmeActiveSteps(upme);
  const done = active.filter((s) => upme.steps[s.id]?.completado).length;
  return active.length ? Math.round((done / active.length) * 100) : 0;
}
function upmeNextStep(upme) {
  const active = upmeActiveSteps(upme);
  return active.find((s) => !upme.steps[s.id]?.completado) || null;
}
function energizacionProgress(ener) {
  let doneCost = 0;
  ENERGIZACION_MILESTONES.forEach((m, i) => {
    if (ener.milestones[i]?.done) doneCost += m.cost;
  });
  return ENERGIZACION_TOTAL_COST ? Math.round((doneCost / ENERGIZACION_TOTAL_COST) * 100) : 0;
}
function nextEnergizacionMilestone(ener) {
  const elapsed = daysBetween(ener.fechaInicio, todayISO());
  let best = null;
  ENERGIZACION_MILESTONES.forEach((m, i) => {
    if (!ener.milestones[i]?.done) {
      if (!best || m.day < best.day) best = { ...m, idx: i };
    }
  });
  if (!best) return null;
  return { ...best, delayed: elapsed > best.day };
}

export {
  UPME_STEPS,
  ENERGIZACION_GROUPS,
  ENERGIZACION_MILESTONES,
  ENERGIZACION_TOTAL_COST,
  CAT_STYLE,
  STATUS_LABELS,
  uid,
  todayISO,
  daysBetween,
  addYears,
  fmtDate,
  fmtTime,
  fmtDateTime,
  emptyUpmeState,
  emptyEnergizacionState,
  emptyCronogramaState,
  emptyPresupuestoState,
  emptyPagosState,
  emptyProjectData,
  ensureFullProjectData,
  fractionElapsed,
  cronogramaPesoTotal,
  buildCurvaSData,
  parseProjectDate,
  cronogramaAvanceActual,
  parseCronogramaPaste,
  buildReportHTML,
  escapeHTML,
  upmeProgress,
  upmeActiveSteps,
  upmeNextStep,
  energizacionProgress,
  nextEnergizacionMilestone,
  presupuestoTotals,
  presupuestoListTotal,
  groupPresupuestoItems,
  calcPresupuestoItem,
  parsePresupuestoPaste,
  ordenPagado,
  ordenSaldo,
  pagosTotals,
  fmtMoney,
};
