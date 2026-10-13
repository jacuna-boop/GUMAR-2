// Funciones puras del guardado por módulo (ver useProjectSync). Separadas aquí para poder
// probarlas sin Supabase ni React.
import { ensureFullProjectData } from "./data.js";

// Las 7 columnas jsonb de project_data — cada una se guarda y versiona por separado.
export const PROJECT_MODULES = ["upme", "energizacion", "cronograma", "presupuesto", "pagos", "balance", "info"];

export const MODULE_LABELS = {
  upme: "UPME",
  energizacion: "Energización",
  cronograma: "Cronograma",
  presupuesto: "Presupuesto",
  pagos: "Pagos",
  balance: "Balance financiero",
  info: "Información del proyecto",
};

// Qué módulos cambiaron entre dos versiones locales. Los módulos se actualizan de forma inmutable
// ({...data}), así que basta comparar referencias.
export function diffModules(prev, next) {
  if (!prev) return [...PROJECT_MODULES];
  return PROJECT_MODULES.filter((m) => prev[m] !== next[m]);
}

// Versiones por módulo de una fila de project_data. null = la columna module_versions no existe
// todavía (no se ha corrido supabase/proteger_datos.sql) → modo sin versionado.
export function rowVersions(row) {
  if (!row || !("module_versions" in row)) return null;
  const v = row.module_versions && typeof row.module_versions === "object" ? row.module_versions : {};
  const out = {};
  PROJECT_MODULES.forEach((m) => { out[m] = Number(v[m]) || 0; });
  return out;
}

// Decide qué traer de una fila del servidor (realtime o recarga) sin pisar lo que la persona está
// editando: solo se aplican los módulos con una versión más nueva que la que tenemos y que no
// tengan cambios locales pendientes ni un guardado en curso ("busy"). Los módulos ocupados que
// cambiaron en el servidor se reportan en "stale" — su próximo guardado va a dar conflicto.
export function planServerMerge(local, knownVersions, row, busy = new Set()) {
  const serverVersions = rowVersions(row);
  if (!serverVersions || !knownVersions) return { data: local, versions: knownVersions, applied: [], stale: [] };
  const normalized = ensureFullProjectData(row);
  const data = { ...local };
  const versions = { ...knownVersions };
  const applied = [];
  const stale = [];
  PROJECT_MODULES.forEach((m) => {
    if (serverVersions[m] <= (knownVersions[m] || 0)) return;
    if (busy.has(m)) { stale.push(m); return; }
    data[m] = normalized[m];
    versions[m] = serverVersions[m];
    applied.push(m);
  });
  return { data: applied.length ? data : local, versions, applied, stale };
}

export function pickModules(obj, modules) {
  const out = {};
  modules.forEach((m) => { if (obj && m in obj) out[m] = obj[m]; });
  return out;
}

// Espera entre reintentos de guardado: 1s, 2s, 4s, 8s… hasta 15s como máximo.
export function retryDelayMs(failures) {
  return Math.min(1000 * 2 ** Math.max(0, failures - 1), 15000);
}
