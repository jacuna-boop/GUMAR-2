import React, { useRef, useState } from "react";
import { buildFlujoCajaPeriodos, calcPresupuestoItem, costoRealPorItemMap, ordenesDescuadradas, flujoCajaSumaPct, flujoCajaTotalesPorPeriodo, fmtMoney, groupPresupuestoItems, pagadoPorItemMap, pagosTotals, parsePresupuestoPaste, presupuestoListTotal, presupuestoTotals, uid } from "../lib/data.js";
import { Bar, BarChart, CartesianGrid, Legend as RLegend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, ClipboardPaste, FileDown, FileUp, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { styles } from "../styles.js";
import { BRAND_DARK, FONT_BRAND_BODY, OVERVIEW_LIGHT } from "../theme.js";
import { downloadPresupuestoTemplate, parsePresupuestoWorkbook } from "../lib/excelTemplates.js";
import { MoneyInput } from "../components/common.jsx";
import { ConfirmModal } from "../modals/dialogs.jsx";

export function PresupuestoModule({ data, onChange, pagos, projectName }) {
  const [activeSub, setActiveSub] = useState("base"); // "base" | "ejecucion"
  const [chartMode, setChartMode] = useState("categoria"); // "categoria" | "actividad"
  const totals = presupuestoTotals(data);

  // Suma lo pagado (solo pagos en estado "pagado", no "programado") de las órdenes que la persona
  // amarró a cada ítem del presupuesto desde la pestaña Pagos — para ver de un vistazo cuánto se ha
  // pagado realmente hacia cada actividad. Una orden se puede repartir entre varios ítems, así que
  // esto reparte lo pagado proporcionalmente (ver pagadoPorItemMap en data.js).
  const pagadoPorItem = pagadoPorItemMap(pagos);

  // Costo real (valor de las órdenes amarradas, ver pestaña "Costo real") por ítem — se usa para
  // avisar en Presupuesto de ejecución cuándo un ítem quedó corto: si ya se contrató más de lo que
  // dice ejecución, esa fila se resalta para que la persona la actualice a mano.
  const costoRealPorItem = costoRealPorItemMap(pagos);

  // Por categoría: se ve completa en la página sin scroll (útil como vista general).
  const chartDataByCategoria = (() => {
    const map = new Map();
    data.base.forEach((it) => {
      const cat = it.categoria?.trim() || "Sin categoría";
      const cur = map.get(cat) || { name: cat, Base: 0, Ejecución: 0 };
      cur.Base += calcPresupuestoItem(it).valorTotal;
      map.set(cat, cur);
    });
    data.ejecucion.forEach((it) => {
      const cat = it.categoria?.trim() || "Sin categoría";
      const cur = map.get(cat) || { name: cat, Base: 0, Ejecución: 0 };
      cur.Ejecución += calcPresupuestoItem(it).valorTotal;
      map.set(cat, cur);
    });
    return Array.from(map.values());
  })();

  // Por actividad: compara ítem por ítem, emparejando base y ejecución por su código de "Ítem"
  // (columna compartida entre ambas listas, ej. "2.2"), no por el id interno — filas pegadas desde
  // Excel a cada lista por separado generan ids aleatorios distintos aunque sean la misma actividad,
  // así que emparejar por id las mostraba como actividades separadas. Con muchos ítems se ve ancha
  // (scroll horizontal) — para una vista que quepa completa en la página usa "Por categoría".
  const itemLabel = (it) => (it.item ? `${it.item} · ${it.descripcion}` : it.descripcion) || "(sin nombre)";
  const chartKey = (it) => (it.item && it.item.trim()) || it.id;
  const chartMap = new Map();
  data.base.forEach((it) => {
    chartMap.set(chartKey(it), { name: itemLabel(it), Base: calcPresupuestoItem(it).valorTotal, Ejecución: 0 });
  });
  data.ejecucion.forEach((it) => {
    const key = chartKey(it);
    const valorTotal = calcPresupuestoItem(it).valorTotal;
    if (chartMap.has(key)) {
      chartMap.get(key).Ejecución = valorTotal;
    } else {
      chartMap.set(key, { name: itemLabel(it), Base: 0, Ejecución: valorTotal });
    }
  });
  const chartDataByActividad = Array.from(chartMap.values()).map((d) => ({
    ...d,
    name: d.name.length > 22 ? d.name.slice(0, 22) + "…" : d.name,
  }));

  const chartData = chartMode === "categoria" ? chartDataByCategoria : chartDataByActividad;
  const chartWidth = chartMode === "categoria" ? null : Math.max(700, chartData.length * 90);

  // Ítems de "base": al crearlos se replican automáticamente en "ejecución" (mismo id, en $0,
  // listos para registrar lo real). Los campos de identidad (ítem/categoría/descripción/unidad)
  // se mantienen sincronizados si se editan desde base; cantidad/valor/IVA quedan independientes.
  const addBaseItem = (fields) => {
    const id = uid();
    const baseItem = { id, ...fields };
    const ejecItem = {
      id, item: fields.item, categoria: fields.categoria, descripcion: fields.descripcion,
      unidad: fields.unidad, cantidad: 0, valorUnitario: 0, ivaPct: fields.ivaPct, tocado: false,
    };
    onChange({ ...data, base: [...data.base, baseItem], ejecucion: [...data.ejecucion, ejecItem] });
  };
  const addBaseItems = (newItems) => {
    const ejecItems = newItems.map((it) => ({
      id: it.id, item: it.item, categoria: it.categoria, descripcion: it.descripcion,
      unidad: it.unidad, cantidad: 0, valorUnitario: 0, ivaPct: it.ivaPct, tocado: false,
    }));
    onChange({ ...data, base: [...data.base, ...newItems], ejecucion: [...data.ejecucion, ...ejecItems] });
  };
  const updateBaseItem = (id, patch) => {
    const syncKeys = ["item", "categoria", "descripcion", "unidad"];
    const sync = {};
    syncKeys.forEach((k) => { if (k in patch) sync[k] = patch[k]; });
    const hasLinked = data.ejecucion.some((it) => it.id === id);
    onChange({
      ...data,
      base: data.base.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      ejecucion: hasLinked && Object.keys(sync).length
        ? data.ejecucion.map((it) => (it.id === id ? { ...it, ...sync } : it))
        : data.ejecucion,
    });
  };
  const deleteBaseItem = (id) => {
    const linked = data.ejecucion.find((it) => it.id === id);
    // Ítems creados antes de que existiera el campo "tocado" no lo tienen — para esos, se usa el
    // criterio viejo (cantidad/valor en $0) como respaldo. Para los nuevos, "tocado" es la fuente
    // real de verdad, porque ejecución ya no arranca en $0 sino igual a base.
    const tocado = linked?.tocado ?? ((Number(linked?.cantidad) || 0) !== 0 || (Number(linked?.valorUnitario) || 0) !== 0);
    const untouched = linked && !tocado;
    onChange({
      ...data,
      base: data.base.filter((it) => it.id !== id),
      ejecucion: untouched ? data.ejecucion.filter((it) => it.id !== id) : data.ejecucion,
    });
  };

  // Ítems de "ejecución": los que vienen de base ya existen; aquí solo se agregan los adicionales
  // no contemplados en la base.
  const addEjecItem = (fields) => onChange({ ...data, ejecucion: [...data.ejecucion, { id: uid(), ...fields }] });
  const addEjecItems = (newItems) => onChange({ ...data, ejecucion: [...data.ejecucion, ...newItems] });
  const updateEjecItem = (id, patch) => onChange({ ...data, ejecucion: data.ejecucion.map((it) => (it.id === id ? { ...it, ...patch, tocado: true } : it)) });
  const deleteEjecItem = (id) => onChange({ ...data, ejecucion: data.ejecucion.filter((it) => it.id !== id) });

  const baseIds = new Set(data.base.map((it) => it.id));
  const baseValoresPorItem = new Map(data.base.map((it) => [it.id, calcPresupuestoItem(it).valorTotal]));
  const baseValoresPorCategoria = new Map();
  data.base.forEach((it) => {
    const cat = it.categoria?.trim() || "Sin categoría";
    baseValoresPorCategoria.set(cat, (baseValoresPorCategoria.get(cat) || 0) + calcPresupuestoItem(it).valorTotal);
  });

  // Piloto de tema claro extendido a Presupuesto — mismo patrón que UPME/Energización/Cronograma.
  const lightStat = { ...styles.overviewStat, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightStatLabel = { ...styles.overviewStatLabel, color: OVERVIEW_LIGHT.textSecondary };
  const lightSubTabBtn = { ...styles.presSubTabBtn, background: "none", border: "1px solid #FFFFFF66", color: "#FFFFFF", fontFamily: FONT_BRAND_BODY };
  // La pestaña activa solo cambia el relleno a blanco — mismo tamaño/borde que las demás.
  const lightSubTabBtnActive = { background: OVERVIEW_LIGHT.card, borderColor: OVERVIEW_LIGHT.card, color: OVERVIEW_LIGHT.textPrimary, fontWeight: 700 };
  const lightChartBox = { ...styles.chartBox, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightExportHint = { ...styles.exportHint, color: "#DCEAE4" };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
      <div style={styles.overviewStatRow} className="app-stat-row">
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: BRAND_DARK }}>{fmtMoney(totals.base)}</div>
          <div style={lightStatLabel}>Presupuesto base</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: "#B5790F" }}>{fmtMoney(totals.ejecutado)}</div>
          <div style={lightStatLabel}>Presupuesto ejecución</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: totals.diferencia > 0 ? "#E2604F" : BRAND_DARK }}>
            {totals.diferencia > 0 ? "+" : ""}{fmtMoney(totals.diferencia)}
          </div>
          <div style={lightStatLabel}>Diferencia</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, color: totals.pct > 100 ? "#E2604F" : BRAND_DARK }}>{totals.pct}%</div>
          <div style={lightStatLabel}>% ejecutado vs. base</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 0 }}>
            <button
              className="view-toggle"
              style={{ ...lightSubTabBtn, ...(chartMode === "categoria" ? lightSubTabBtnActive : {}) }}
              onClick={() => setChartMode("categoria")}
            >
              Por categoría
            </button>
            <button
              className="view-toggle"
              style={{ ...lightSubTabBtn, ...(chartMode === "actividad" ? lightSubTabBtnActive : {}) }}
              onClick={() => setChartMode("actividad")}
            >
              Por actividad
            </button>
          </div>
          <div style={{ ...lightChartBox, overflowX: chartMode === "actividad" ? "auto" : "hidden" }}>
            <div style={chartMode === "actividad" ? { width: chartWidth } : undefined}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={OVERVIEW_LIGHT.border} />
                  <XAxis dataKey="name" tick={false} axisLine={{ stroke: OVERVIEW_LIGHT.border }} tickLine={false} />
                  <YAxis tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                  <Tooltip
                    contentStyle={{ background: "#FFFFFF", border: `1px solid ${OVERVIEW_LIGHT.border}`, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary }}
                    formatter={(v) => fmtMoney(v)}
                  />
                  <RLegend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="Base"
                    fill={BRAND_DARK}
                    radius={[4, 4, 0, 0]}
                    background={({ x, y, width, height, index }) => {
                      const d = chartData[index];
                      const excedido = d && d.Ejecución > d.Base;
                      if (!excedido) return <rect x={x} y={y} width={width} height={height} fill="transparent" />;
                      // Un solo rectángulo limpio (sin esquinas redondas) que cubre las dos barras de
                      // la actividad completa, igual de sencillo que el gris que Recharts pinta al pasar el mouse.
                      return <rect x={x} y={y} width={width * 2.15} height={height} fill="#E2604F" fillOpacity={0.28} />;
                    }}
                  />
                  <Bar dataKey="Ejecución" fill="#F5B942" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      <div style={styles.presSubTabs}>
        <button
          className="view-toggle"
          style={{ ...lightSubTabBtn, ...(activeSub === "base" ? lightSubTabBtnActive : {}) }}
          onClick={() => setActiveSub("base")}
        >
          Presupuesto base
        </button>
        <button
          className="view-toggle"
          style={{ ...lightSubTabBtn, ...(activeSub === "ejecucion" ? lightSubTabBtnActive : {}) }}
          onClick={() => setActiveSub("ejecucion")}
        >
          Presupuesto de ejecución
        </button>
        <button
          className="view-toggle"
          style={{ ...lightSubTabBtn, ...(activeSub === "costoReal" ? lightSubTabBtnActive : {}) }}
          onClick={() => setActiveSub("costoReal")}
        >
          Costo real
        </button>
        <button
          className="view-toggle"
          style={{ ...lightSubTabBtn, ...(activeSub === "flujoCaja" ? lightSubTabBtnActive : {}) }}
          onClick={() => setActiveSub("flujoCaja")}
        >
          Flujo de caja
        </button>
      </div>

      {activeSub === "ejecucion" && (
        <p style={lightExportHint}>
          Los ítems marcados con <span style={{ color: BRAND_DARK }}>●</span> ya existen en el presupuesto base
          (se crearon ahí). Los demás son adicionales, agregados directamente aquí.
        </p>
      )}

      {activeSub === "base" ? (
        <PresupuestoTable items={data.base} onAdd={addBaseItem} onAddMany={addBaseItems} onUpdate={updateBaseItem} onDelete={deleteBaseItem} pagadoPorItem={pagadoPorItem} projectName={projectName} />
      ) : activeSub === "ejecucion" ? (
        <PresupuestoTable
          items={data.ejecucion}
          onAdd={addEjecItem}
          onAddMany={addEjecItems}
          onUpdate={updateEjecItem}
          pagadoPorItem={pagadoPorItem}
          onDelete={deleteEjecItem}
          linkedIds={baseIds}
          baseValoresPorItem={baseValoresPorItem}
          baseValoresPorCategoria={baseValoresPorCategoria}
          costoRealPorItem={costoRealPorItem}
        />
      ) : activeSub === "costoReal" ? (
        <CostoRealModule items={data.base} pagos={pagos} />
      ) : (
        <FlujoCajaModule
          items={data.base}
          flujoCaja={data.flujoCaja}
          onChange={(nextFlujoCaja) => onChange({ ...data, flujoCaja: nextFlujoCaja })}
        />
      )}
    </div>
  );
}

// Flujo de caja: distribuye el presupuesto BASE en % por período (quincenal o mensual), igual que
// la hoja "FLUJO DE CAJA" del Excel de referencia (PP-F-02) — un % manual por ítem y período, el
// valor en $ de cada celda sale de (valor total del ítem × ese %). Quincenal y mensual se guardan
// aparte (ver emptyFlujoCajaState en data.js) para no perder lo digitado al cambiar de modo.
export function FlujoCajaModule({ items, flujoCaja, onChange }) {
  const modo = flujoCaja.modo === "mensual" ? "mensual" : "quincenal";
  const porcentajes = modo === "mensual" ? flujoCaja.porcentajesMensual : flujoCaja.porcentajesQuincenal;
  const porcentajesKey = modo === "mensual" ? "porcentajesMensual" : "porcentajesQuincenal";
  const periodos = buildFlujoCajaPeriodos(flujoCaja.fechaInicio, flujoCaja.fechaFin, modo);
  const grouped = groupPresupuestoItems(items);
  const totalesPorPeriodo = flujoCajaTotalesPorPeriodo(items, porcentajes, periodos);
  const totalGeneral = totalesPorPeriodo.reduce((s, p) => s + p.total, 0);
  const totalPresupuestoBase = presupuestoListTotal(items);

  const setModo = (nextModo) => onChange({ ...flujoCaja, modo: nextModo });
  const setFecha = (key, value) => onChange({ ...flujoCaja, [key]: value });
  const updatePct = (itemId, periodoIndex, value) => {
    const num = value === "" ? undefined : Math.max(0, Math.min(100, Number(value) || 0));
    const itemPcts = { ...(porcentajes[itemId] || {}) };
    if (num === undefined) delete itemPcts[periodoIndex];
    else itemPcts[periodoIndex] = num;
    onChange({ ...flujoCaja, [porcentajesKey]: { ...porcentajes, [itemId]: itemPcts } });
  };

  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightMiniInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightSubTabBtn = { ...styles.presSubTabBtn, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textSecondary, fontFamily: FONT_BRAND_BODY };
  const lightSubTabBtnActive = { borderColor: BRAND_DARK, background: BRAND_DARK, color: "#FFFFFF" };
  const pctInputStyle = { ...lightMiniInput, width: 52, padding: "4px 5px", fontSize: 11, textAlign: "center" };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary, fontFamily: FONT_BRAND_BODY }}>
          <span>Fecha de inicio</span>
          <input type="date" style={lightMiniInput} value={flujoCaja.fechaInicio} onChange={(e) => setFecha("fechaInicio", e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary, fontFamily: FONT_BRAND_BODY }}>
          <span>Fecha de fin</span>
          <input type="date" style={lightMiniInput} value={flujoCaja.fechaFin} onChange={(e) => setFecha("fechaFin", e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            style={{ ...lightSubTabBtn, ...(modo === "quincenal" ? lightSubTabBtnActive : {}) }}
            onClick={() => setModo("quincenal")}
          >
            Quincenal
          </button>
          <button
            style={{ ...lightSubTabBtn, ...(modo === "mensual" ? lightSubTabBtnActive : {}) }}
            onClick={() => setModo("mensual")}
          >
            Mensual
          </button>
        </div>
      </div>

      {periodos.length === 0 ? (
        <div style={{ color: OVERVIEW_LIGHT.textSecondary, fontSize: 13, padding: "10px 0" }}>
          Define la fecha de inicio y fin del flujo de caja para ver los períodos.
        </div>
      ) : (
        <>
          <div style={{ ...lightTableWrap, overflowX: "auto" }}>
            <table style={{ ...styles.overviewTable, minWidth: 480 + periodos.length * 60 }}>
              <thead>
                <tr>
                  <th style={{ ...lightOvTh, position: "sticky", left: 0, background: OVERVIEW_LIGHT.card, minWidth: 260 }}>Ítem</th>
                  {periodos.map((p) => (
                    <th key={p.index} style={{ ...lightOvTh, textAlign: "center", minWidth: 60 }}>{p.label}</th>
                  ))}
                  <th style={{ ...lightOvTh, textAlign: "center", minWidth: 60 }}>% total</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((group) => (
                  <React.Fragment key={group.categoria}>
                    <tr>
                      <td
                        colSpan={periodos.length + 2}
                        style={{ ...styles.presGroupRow, position: "sticky", left: 0 }}
                      >
                        {group.categoria}
                      </td>
                    </tr>
                    {group.items.map((it) => {
                      const suma = flujoCajaSumaPct(porcentajes[it.id]);
                      const ok = Math.abs(suma - 100) < 0.01;
                      const vacio = suma === 0;
                      return (
                        <tr key={it.id}>
                          <td style={{ ...lightOvTd, position: "sticky", left: 0, background: OVERVIEW_LIGHT.card, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
                            {it.item ? `${it.item} · ` : ""}{it.descripcion}
                          </td>
                          {periodos.map((p) => (
                            <td key={p.index} style={{ ...lightOvTd, textAlign: "center", padding: "4px 6px" }}>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                style={pctInputStyle}
                                value={porcentajes[it.id]?.[p.index] ?? ""}
                                onChange={(e) => updatePct(it.id, p.index, e.target.value)}
                              />
                            </td>
                          ))}
                          <td style={{ ...lightOvTd, textAlign: "center", fontWeight: 700, color: vacio ? OVERVIEW_LIGHT.textSecondary : ok ? BRAND_DARK : "#E2604F" }}>
                            {suma}%
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...lightOvTd, position: "sticky", left: 0, background: OVERVIEW_LIGHT.card, fontWeight: 700 }}>Total por período</td>
                  {totalesPorPeriodo.map((p) => (
                    <td key={p.index} style={{ ...lightOvTd, textAlign: "center", fontSize: 10, fontWeight: 700 }}>
                      {p.total > 0 ? fmtMoney(p.total) : "—"}
                    </td>
                  ))}
                  <td style={lightOvTd}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ marginTop: 6, fontSize: 11.5, color: "#DCEAE4" }}>
            Total distribuido: {fmtMoney(totalGeneral)} de {fmtMoney(totalPresupuestoBase)} del presupuesto base
            {totalPresupuestoBase > 0 && Math.abs(totalGeneral - totalPresupuestoBase) > 1 && (
              <span style={{ color: "#FFE8B3" }}> — quedan ítems sin distribuir al 100%.</span>
            )}
          </div>

          {totalGeneral > 0 && (
            <div style={{ ...lightTableWrap, marginTop: 14, padding: "16px 8px 4px" }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={totalesPorPeriodo.map((p) => ({ name: p.label, Total: p.total }))} margin={{ top: 10, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={OVERVIEW_LIGHT.border} />
                  <XAxis dataKey="name" tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} />
                  <YAxis tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                  <Tooltip contentStyle={{ background: "#FFFFFF", border: `1px solid ${OVERVIEW_LIGHT.border}`, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary }} formatter={(v) => fmtMoney(v)} />
                  <Bar dataKey="Total" fill={BRAND_DARK} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Costo real: de solo lectura, muestra por ítem del presupuesto base cuánto suman las órdenes de
// servicio de Pagos que tiene amarradas (su valor completo, no lo pagado/programado) — para ver el
// costo realmente contratado por actividad sin tocar "Presupuesto de ejecución", que sigue siendo
// 100% manual. Una orden se puede repartir entre varios ítems (ver Pagos), así que esto suma la
// porción asignada a cada uno (costoRealPorItemMap en data.js).
export function CostoRealModule({ items, pagos }) {
  const costoPorItem = costoRealPorItemMap(pagos);
  const grouped = groupPresupuestoItems(items);
  // Solo ítems que existen en la base: así el total coincide con la suma de las filas (los amarres a
  // ítems ya borrados no se ven en ninguna fila).
  const totalAmarrado = items.reduce((s, it) => s + (costoPorItem.get(it.id) || 0), 0);
  const totalOrdenes = pagosTotals(pagos).totalOrdenes;
  const { descuadradas, sinAmarre } = ordenesDescuadradas(pagos);

  const lightHint = { ...styles.exportHint, color: OVERVIEW_LIGHT.pageTextSecondary };
  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };

  return (
    <div>
      <p style={lightHint}>
        Costo real de cada ítem del presupuesto base, según el valor completo de las órdenes de servicio que
        tiene amarradas en Pagos (no lo pagado ni lo programado). Es de solo lectura y no afecta el presupuesto
        de ejecución, que se sigue digitando a mano.
      </p>
      <div style={lightTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={lightOvTh}>Ítem</th>
              <th style={lightOvTh}>Costo real (órdenes amarradas)</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => {
              const groupTotal = group.items.reduce((s, it) => s + (costoPorItem.get(it.id) || 0), 0);
              return (
                <React.Fragment key={group.categoria}>
                  <tr>
                    <td style={styles.presGroupRow}>{group.categoria}</td>
                    <td style={{ ...styles.presGroupRow, fontWeight: 700 }}>{fmtMoney(groupTotal)}</td>
                  </tr>
                  {group.items.map((it) => (
                    <tr key={it.id}>
                      <td style={lightOvTd}>{it.item ? `${it.item} · ` : ""}{it.descripcion}</td>
                      <td style={{ ...lightOvTd, color: costoPorItem.get(it.id) ? BRAND_DARK : OVERVIEW_LIGHT.textSecondary }}>
                        {fmtMoney(costoPorItem.get(it.id) || 0)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...lightOvTd, fontWeight: 700 }}>Total amarrado a ítems</td>
              <td style={{ ...lightOvTd, fontWeight: 700 }}>{fmtMoney(totalAmarrado)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {(descuadradas.length > 0 || sinAmarre.length > 0) && (
        <div style={{ ...lightTableWrap, marginTop: 14, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#B5790F", marginBottom: 6 }}>
            Órdenes a revisar (Costo real suma {fmtMoney(totalAmarrado)} de {fmtMoney(totalOrdenes)} en órdenes)
          </div>
          <div style={{ fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary, marginBottom: 8 }}>
            Costo real suma el valor completo de las órdenes cargadas a cada ítem. Las órdenes sin ítem no suman en ninguno; las repartidas entre varios ítems se reparten según el valor asignado a cada uno. Corrígelas en la pestaña Pagos.
          </div>
          <table style={styles.overviewTable}>
            <thead>
              <tr>
                <th style={lightOvTh}>Orden</th>
                <th style={lightOvTh}>Valor orden</th>
                <th style={lightOvTh}>Asignado a ítems</th>
                <th style={lightOvTh}>Problema</th>
              </tr>
            </thead>
            <tbody>
              {descuadradas.map(({ orden, asignado, valorTotal, diferencia, items }) => (
                <tr key={orden.id}>
                  <td style={lightOvTd}>{orden.numero}{orden.proveedor ? ` · ${orden.proveedor}` : ""}</td>
                  <td style={lightOvTd}>{fmtMoney(valorTotal)}</td>
                  <td style={lightOvTd}>{fmtMoney(asignado)}</td>
                  <td style={{ ...lightOvTd, color: diferencia < 0 ? "#E2604F" : "#B5790F" }}>
                    {`Repartida en ${items} ítems: lo asignado ${diferencia > 0 ? "no alcanza" : "supera"} el valor de la orden (se reparte en proporción)`}
                  </td>
                </tr>
              ))}
              {sinAmarre.map((o) => (
                <tr key={o.id}>
                  <td style={lightOvTd}>{o.numero}{o.proveedor ? ` · ${o.proveedor}` : ""}</td>
                  <td style={lightOvTd}>{fmtMoney(o.valorTotal)}</td>
                  <td style={lightOvTd}>{fmtMoney(0)}</td>
                  <td style={{ ...lightOvTd, color: "#B5790F" }}>Sin ítem amarrado</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PresupuestoTable({ items, onAdd, onAddMany, onUpdate, onDelete, linkedIds, baseValoresPorItem, baseValoresPorCategoria, pagadoPorItem, costoRealPorItem, projectName }) {
  const [newItem, setNewItem] = useState({
    item: "", categoria: "", descripcion: "", cantidad: "", unidad: "",
    valorUnitario: "", ivaPct: "",
  });
  const [showPaste, setShowPaste] = useState(false);
  const [showTemplateUpload, setShowTemplateUpload] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null); // { id, label } | null
  const [searchQuery, setSearchQuery] = useState("");
  // Filas bloqueadas por defecto (solo texto) para no dañar nada sin querer — hay que darle al
  // lápiz para poder editar valor/cantidad/nombre/categoría de un ítem ya creado.
  const [editingIds, setEditingIds] = useState(new Set());
  const toggleEditing = (id) => setEditingIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const grouped = groupPresupuestoItems(items);

  const addItem = () => {
    if (!newItem.descripcion.trim()) return;
    onAdd({
      item: newItem.item.trim(),
      categoria: newItem.categoria.trim() || "Sin categoría",
      descripcion: newItem.descripcion.trim(),
      cantidad: Number(newItem.cantidad) || 0,
      unidad: newItem.unidad.trim(),
      valorUnitario: Number(newItem.valorUnitario) || 0,
      ivaPct: Number(newItem.ivaPct) || 0,
    });
    setNewItem({ item: "", categoria: "", descripcion: "", cantidad: "", unidad: "", valorUnitario: "", ivaPct: "" });
  };

  // Piloto de tema claro extendido a Presupuesto (tabla de ítems) — mismo patrón que el resto.
  const lightPasteBtn = { ...styles.pasteBtn, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY };
  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightMiniInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightRowDeleteBtn = { ...styles.rowDeleteBtn, color: "#8FA39B" };
  const lightAddRowBtn = { ...styles.addRowBtn, background: BRAND_DARK, color: "#FFFFFF" };
  const lightReadonlyText = { ...styles.presReadonlyText, color: OVERVIEW_LIGHT.textPrimary };
  const lightExcedidoTag = { ...styles.presExcedidoTag };

  // Busca por código de ítem o descripción — sin distinguir mayúsculas/acentos. Los totales de
  // categoría se calculan siempre sobre TODOS los ítems (no solo los que coinciden), para no
  // mostrar un "supera la base" engañoso mientras se filtra la vista.
  const normalize = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const searchTerm = normalize(searchQuery.trim());

  return (
    <div>
      <div style={styles.pasteBtnRow}>
        {projectName && (
          <>
            <button className="ro-ok" style={lightPasteBtn} onClick={() => downloadPresupuestoTemplate(items, projectName)}>
              <FileDown size={14} /> Descargar plantilla Excel
            </button>
            <button style={lightPasteBtn} onClick={() => setShowTemplateUpload(true)}>
              <FileUp size={14} /> Cargar plantilla Excel
            </button>
          </>
        )}
        <button style={lightPasteBtn} onClick={() => setShowPaste(true)}>
          <ClipboardPaste size={14} /> Pegar desde Excel
        </button>
      </div>
      {showPaste && (
        <PastePresupuestoModal
          onClose={() => setShowPaste(false)}
          onImport={(newItems) => {
            onAddMany(newItems);
            setShowPaste(false);
          }}
        />
      )}
      {showTemplateUpload && (
        <PresupuestoTemplateModal
          onClose={() => setShowTemplateUpload(false)}
          onImport={(newItems) => {
            onAddMany(newItems);
            setShowTemplateUpload(false);
          }}
        />
      )}

      <div style={{ position: "relative", marginBottom: 10, maxWidth: 360 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: OVERVIEW_LIGHT.textSecondary, pointerEvents: "none" }} />
        <input
          style={{ ...lightMiniInput, paddingLeft: 30 }}
          className="ro-ok" placeholder="Buscar ítem por código o descripción..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div style={lightTableWrap}>
      <table style={styles.overviewTable}>
        <thead>
          <tr>
            <th style={lightOvTh}>Ítem</th>
            <th style={lightOvTh}>Descripción</th>
            <th style={lightOvTh}>Cant.</th>
            <th style={lightOvTh}>Unidad</th>
            <th style={lightOvTh}>Valor unit. (sin IVA)</th>
            <th style={lightOvTh}>IVA %</th>
            <th style={lightOvTh}>Valor unit. (con IVA)</th>
            <th style={lightOvTh}>Valor total</th>
            <th style={lightOvTh}>IVA recuperable</th>
            <th style={lightOvTh}>Pagado (real)</th>
            <th style={lightOvTh}>Categoría</th>
            <th style={lightOvTh}></th>
          </tr>
        </thead>
        <tbody>
          {searchTerm && !grouped.some((g) => g.items.some((it) => normalize(it.item).includes(searchTerm) || normalize(it.descripcion).includes(searchTerm))) && (
            <tr>
              <td colSpan={12} style={{ ...lightOvTd, textAlign: "center", color: OVERVIEW_LIGHT.textSecondary }}>
                {searchQuery.trim() ? `Sin resultados para "${searchQuery}".` : "Todavía no hay nada registrado aquí."}
              </td>
            </tr>
          )}
          {grouped.map((group) => {
            const groupTotal = presupuestoListTotal(group.items);
            const baseGroupTotal = baseValoresPorCategoria?.get(group.categoria);
            const groupExcedido = baseGroupTotal !== undefined && groupTotal > baseGroupTotal;
            const visibleItems = searchTerm
              ? group.items.filter((it) => normalize(it.item).includes(searchTerm) || normalize(it.descripcion).includes(searchTerm))
              : group.items;
            if (searchTerm && visibleItems.length === 0) return null;
            return (
              <React.Fragment key={group.categoria}>
                <tr>
                  <td colSpan={7} style={styles.presGroupRow}>
                    {group.categoria}
                    {groupExcedido && <span style={lightExcedidoTag}> · supera la base ({fmtMoney(groupTotal - baseGroupTotal)})</span>}
                  </td>
                  <td style={{ ...styles.presGroupRow, color: groupExcedido ? "#E2604F" : "#1F332C", fontWeight: groupExcedido ? 800 : undefined }}>
                    {fmtMoney(groupTotal)}
                  </td>
                  <td style={styles.presGroupRow} colSpan={4}></td>
                </tr>
                {visibleItems.map((it) => {
                  const calc = calcPresupuestoItem(it);
                  const isLinked = linkedIds && linkedIds.has(it.id);
                  const baseValor = baseValoresPorItem?.get(it.id);
                  const itemExcedido = isLinked && baseValor !== undefined && calc.valorTotal > baseValor;
                  const costoReal = costoRealPorItem?.get(it.id) || 0;
                  const necesitaActualizar = !!costoRealPorItem && costoReal > calc.valorTotal;
                  const editing = editingIds.has(it.id);
                  return (
                    <tr key={it.id} style={(itemExcedido || necesitaActualizar) ? { background: "#FBE4E1" } : undefined}>
                      <td style={lightOvTd}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {isLinked && <span title="Viene del presupuesto base" style={{ color: BRAND_DARK }}>●</span>}
                          {editing ? (
                            <input style={{ ...lightMiniInput, width: 56 }} value={it.item} onChange={(e) => onUpdate(it.id, { item: e.target.value })} />
                          ) : (
                            <span style={lightReadonlyText}>{it.item}</span>
                          )}
                        </div>
                      </td>
                      <td style={lightOvTd}>
                        {editing ? (
                          <input style={lightMiniInput} value={it.descripcion} onChange={(e) => onUpdate(it.id, { descripcion: e.target.value })} />
                        ) : (
                          <span style={lightReadonlyText}>{it.descripcion}</span>
                        )}
                      </td>
                      <td style={lightOvTd}>
                        {editing ? (
                          <input type="number" style={{ ...lightMiniInput, width: 64 }} value={it.cantidad} onChange={(e) => onUpdate(it.id, { cantidad: e.target.value })} />
                        ) : (
                          <span style={lightReadonlyText}>{it.cantidad}</span>
                        )}
                      </td>
                      <td style={lightOvTd}>
                        {editing ? (
                          <input style={{ ...lightMiniInput, width: 64 }} value={it.unidad} onChange={(e) => onUpdate(it.id, { unidad: e.target.value })} />
                        ) : (
                          <span style={lightReadonlyText}>{it.unidad}</span>
                        )}
                      </td>
                      <td style={lightOvTd}>
                        {editing ? (
                          <MoneyInput style={lightMiniInput} value={it.valorUnitario} onChange={(val) => onUpdate(it.id, { valorUnitario: val })} />
                        ) : (
                          <span style={lightReadonlyText}>{fmtMoney(it.valorUnitario)}</span>
                        )}
                      </td>
                      <td style={lightOvTd}>
                        {editing ? (
                          <input type="number" style={{ ...lightMiniInput, width: 56 }} value={it.ivaPct} onChange={(e) => onUpdate(it.id, { ivaPct: e.target.value })} />
                        ) : (
                          <span style={lightReadonlyText}>{Number(it.ivaPct) || 0}%</span>
                        )}
                      </td>
                      <td style={lightOvTd}>{fmtMoney(calc.valorUnitarioConIva)}</td>
                      <td style={{ ...lightOvTd, fontWeight: 700, color: (itemExcedido || necesitaActualizar) ? "#E2604F" : OVERVIEW_LIGHT.textPrimary }}>
                        {fmtMoney(calc.valorTotal)}
                        {itemExcedido && <div style={lightExcedidoTag}>+{fmtMoney(calc.valorTotal - baseValor)} vs. base</div>}
                        {necesitaActualizar && (
                          <div style={lightExcedidoTag} title="El costo real (órdenes amarradas en Pagos) es mayor a lo digitado aquí">
                            Costo real: {fmtMoney(costoReal)} — actualiza este ítem
                          </div>
                        )}
                      </td>
                      <td style={lightOvTd}>
                        {editing ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, opacity: calc.ivaEsRecuperable ? 1 : 0.5 }}>
                            <input
                              type="checkbox"
                              title="¿IVA recuperable?"
                              checked={calc.ivaEsRecuperable}
                              onChange={(e) => onUpdate(it.id, { ivaEsRecuperable: e.target.checked })}
                            />
                            <MoneyInput
                              style={{ ...lightMiniInput, width: 90 }}
                              value={calc.ivaRecuperableValor}
                              onChange={(val) => onUpdate(it.id, { ivaRecuperableValor: val, ivaEsRecuperable: true })}
                            />
                          </div>
                        ) : (
                          <span style={lightReadonlyText}>{fmtMoney(calc.ivaRecuperable)}</span>
                        )}
                      </td>
                      <td style={{ ...lightOvTd, color: pagadoPorItem?.get(it.id) ? BRAND_DARK : OVERVIEW_LIGHT.textSecondary }}>
                        {fmtMoney(pagadoPorItem?.get(it.id) || 0)}
                      </td>
                      <td style={lightOvTd}>
                        {editing && (
                          <input style={lightMiniInput} value={it.categoria} onChange={(e) => onUpdate(it.id, { categoria: e.target.value })} />
                        )}
                      </td>
                      <td style={lightOvTd}>
                        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <button
                            type="button"
                            style={lightRowDeleteBtn}
                            title={editing ? "Bloquear esta fila" : "Editar esta fila"}
                            onClick={() => toggleEditing(it.id)}
                          >
                            {editing ? <Check size={13} /> : <Pencil size={13} />}
                          </button>
                          <button
                            style={lightRowDeleteBtn}
                            onClick={() => setConfirmDeleteItem({ id: it.id, label: it.descripcion || "este ítem" })}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
          <tr>
            <td style={lightOvTd}>
              <input style={{ ...lightMiniInput, width: 56 }} placeholder="1.1" value={newItem.item} onChange={(e) => setNewItem({ ...newItem, item: e.target.value })} />
            </td>
            <td style={lightOvTd}>
              <input style={lightMiniInput} placeholder="Descripción" value={newItem.descripcion} onChange={(e) => setNewItem({ ...newItem, descripcion: e.target.value })} />
            </td>
            <td style={lightOvTd}>
              <input type="number" style={{ ...lightMiniInput, width: 64 }} placeholder="0" value={newItem.cantidad} onChange={(e) => setNewItem({ ...newItem, cantidad: e.target.value })} />
            </td>
            <td style={lightOvTd}>
              <input style={{ ...lightMiniInput, width: 64 }} placeholder="UND" value={newItem.unidad} onChange={(e) => setNewItem({ ...newItem, unidad: e.target.value })} />
            </td>
            <td style={lightOvTd}>
              <MoneyInput style={lightMiniInput} placeholder="$" value={newItem.valorUnitario} onChange={(val) => setNewItem({ ...newItem, valorUnitario: val })} />
            </td>
            <td style={lightOvTd}>
              <input type="number" style={{ ...lightMiniInput, width: 56 }} placeholder="%" value={newItem.ivaPct} onChange={(e) => setNewItem({ ...newItem, ivaPct: e.target.value })} />
            </td>
            <td style={lightOvTd}></td>
            <td style={lightOvTd}></td>
            <td style={lightOvTd}></td>
            <td style={lightOvTd}></td>
            <td style={lightOvTd}>
              <input style={lightMiniInput} placeholder="Categoría (ej. Equipos principales)" value={newItem.categoria} onChange={(e) => setNewItem({ ...newItem, categoria: e.target.value })} />
            </td>
            <td style={lightOvTd}>
              <button style={lightAddRowBtn} onClick={addItem}><Plus size={14} /></button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      {confirmDeleteItem && (
        <ConfirmModal
          title="Eliminar ítem"
          message={`¿Eliminar "${confirmDeleteItem.label}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={() => setConfirmDeleteItem(null)}
          onConfirm={() => { onDelete(confirmDeleteItem.id); setConfirmDeleteItem(null); }}
        />
      )}
    </div>
  );
}

export function PresupuestoTemplateModal({ onClose, onImport }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null); // { items, skipped, categorias } | null
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    setFileName(file.name);
    setError("");
    setPreview(null);
    try {
      const buf = await file.arrayBuffer();
      const { items, skipped } = await parsePresupuestoWorkbook(buf);
      const categorias = Array.from(new Set(items.map((it) => it.categoria)));
      setPreview({ items, skipped, categorias });
    } catch (err) {
      console.error("Error leyendo plantilla de presupuesto:", err);
      setError(`No se pudo leer ese archivo. ¿Es un .xlsx válido? (${err?.message || "error desconocido"})`);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.exportModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Cargar plantilla de presupuesto</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>
          Sube el archivo .xlsx que descargaste y llenaste. Los ítems se <strong>agregan</strong> a la
          base de este proyecto — no reemplazan los que ya existen.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <button style={{ ...styles.addProjectBtn, marginTop: 4 }} onClick={() => fileInputRef.current?.click()}>
          {fileName || "Elegir archivo…"}
        </button>
        {error && <div style={styles.importError}>{error}</div>}
        {preview && (
          <>
            <div style={styles.pastePreview}>
              Se detectaron <strong>{preview.items.length}</strong> ítems
              {preview.categorias.length > 0 && <> en {preview.categorias.length} categorías ({preview.categorias.join(", ")})</>}.
              {preview.skipped > 0 && <> Se ignoraron {preview.skipped} filas sin descripción.</>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.confirmCancelBtn} onClick={() => { setPreview(null); setFileName(""); }}>Elegir otro archivo</button>
              <button
                style={{ ...styles.addProjectBtn, opacity: preview.items.length ? 1 : 0.5 }}
                disabled={!preview.items.length}
                onClick={() => onImport(preview.items)}
              >
                Agregar {preview.items.length} ítems
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PastePresupuestoModal({ onClose, onImport }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null); // { items, skipped, categorias } | null

  const process = () => {
    const { items, skipped } = parsePresupuestoPaste(text);
    const categorias = Array.from(new Set(items.map((it) => it.categoria)));
    setPreview({ items, skipped, categorias });
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.exportModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Pegar presupuesto desde Excel</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>
          En Excel, selecciona las columnas <strong>Ítem, Descripción, Cantidad, Unidad, Valor unitario (antes de IVA)
          e IVA %</strong> (en ese orden) — puedes incluir las filas de categoría (como "1  EQUIPOS PRINCIPALES") que
          tengan Cantidad/Unidad/Valor unitario vacíos, se usan para agrupar. Copia (Ctrl/Cmd+C) y pega aquí abajo.
        </p>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          placeholder="Pega aquí las filas copiadas de Excel…"
          style={styles.exportTextarea}
        />
        {!preview ? (
          <button style={{ ...styles.addProjectBtn, marginTop: 10, opacity: text.trim() ? 1 : 0.5 }} disabled={!text.trim()} onClick={process}>
            Procesar
          </button>
        ) : (
          <>
            <div style={styles.pastePreview}>
              Se detectaron <strong>{preview.items.length}</strong> ítems
              {preview.categorias.length > 0 && <> en {preview.categorias.length} categorías ({preview.categorias.join(", ")})</>}.
              {preview.skipped > 0 && <> Se ignoraron {preview.skipped} filas sin descripción.</>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.confirmCancelBtn} onClick={() => setPreview(null)}>Volver a pegar</button>
              <button
                style={{ ...styles.addProjectBtn, opacity: preview.items.length ? 1 : 0.5 }}
                disabled={!preview.items.length}
                onClick={() => onImport(preview.items)}
              >
                Importar {preview.items.length} ítems
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
