// Formato de fechas para gráficas con eje de tiempo (dataKey "ts" = milisegundos).
// Día 1 de mes: "may 26"; cualquier otro día (el de inicio): "13 abr 26".
export const fechaCortaTs = (ts) =>
  new Date(ts).getDate() === 1
    ? new Date(ts).toLocaleDateString("es-CO", { month: "short", year: "2-digit" })
    : new Date(ts).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" });

export const fechaLargaTs = (ts) =>
  new Date(ts).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

// Una marca el día de inicio y el día 1 de cada mes hasta el último punto (sin esto Recharts pone
// una etiqueta por cada punto y se amontonan).
export function ticksMensuales(data) {
  if (!data?.length) return [];
  const min = data[0].ts;
  const max = data[data.length - 1].ts;
  const d = new Date(min);
  d.setDate(1);
  if (d.getTime() < min) d.setMonth(d.getMonth() + 1);
  const ticks = [min]; // el día de inicio, para que se vea dónde arranca la curva
  if (d.getTime() === min) d.setMonth(d.getMonth() + 1); // si arranca un día 1, no repetirlo
  while (d.getTime() <= max) { ticks.push(d.getTime()); d.setMonth(d.getMonth() + 1); }
  return ticks;
}

// Props del eje X de tiempo: la distancia entre puntos es proporcional a los días.
export const ejeTiempoProps = (data) => ({
  dataKey: "ts",
  type: "number",
  scale: "time",
  domain: ["dataMin", "dataMax"],
  ticks: ticksMensuales(data),
  tickFormatter: fechaCortaTs,
});
