import { ejeTiempoProps } from "../lib/fechasGrafica.js";
import { addMonths, balanceMargenTotals, balanceTotals, calcPresupuestoItem, cronogramaAvanceActual, cronogramaPesoTotal, daysBetween, energizacionGroupsFor, energizacionProgress, fmtDate, fmtDateTime, fmtMoney, groupPresupuestoItems, nextEnergizacionMilestone, ordenPagado, ordenSaldo, pagosTotals, presupuestoListTotal, presupuestoTotals, todayISO, upmeActiveSteps, upmeNextStep, upmeProgress } from "../lib/data.js";
import { buildInformeProyecto } from "../lib/informePPI01.js";
import { CartesianGrid, Legend as RLegend, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import React from "react";
import { prCard } from "../styles.js";
import { buildProjectAlerts } from "../modules/Resumen.jsx";
import { TAB_LABELS } from "../lib/permisos.js";

export function PrCardHead({ color, children }) {
  return (
    <div style={prCard.cardHead}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      {children}
    </div>
  );
}

export function PrBigPct({ pct, color, label }) {
  return (
    <div style={prCard.bigPctRow}>
      <div style={prCard.bigPctTrack}><div style={{ ...prCard.bigPctFill, width: `${pct}%`, background: color }} /></div>
      <span style={{ ...prCard.bigPctNum, color }}>{label ?? `${pct}%`}</span>
    </div>
  );
}

// Vista de impresión que reproduce el mismo diseño de tarjetas del Resumen en pantalla,
// adaptado a fondo claro para imprimir (en vez de un reporte tipo documento).
export function PrintResumenProject({ project, data }) {
  const upmePct = upmeProgress(data.upme);
  const enerPct = energizacionProgress(data.energizacion);
  const nextMs = nextEnergizacionMilestone(data.energizacion);
  const elapsed = data.energizacion.fechaInicio ? daysBetween(data.energizacion.fechaInicio, todayISO()) : null;
  const presTotals = presupuestoTotals(data.presupuesto);
  const desviacionPct = presTotals.base ? Math.round((presTotals.diferencia / presTotals.base) * 100) : 0;
  const pagTotals = pagosTotals(data.pagos);
  const balTotals = balanceTotals(data.balance, data.pagos);
  const nextUpme = upmeNextStep(data.upme);
  const alerts = buildProjectAlerts(data);
  const now = new Date();

  return (
    <div className="print-only" style={prCard.page}>
      <div style={prCard.wrap}>
        <div style={prCard.headerRow}>
          <h1 style={prCard.h1}>{project.name}</h1>
          <div style={prCard.meta}>{project.capacity ? `${project.capacity} MWp` : ""}{project.location ? `  ·  ${project.location}` : ""}</div>
          <div style={prCard.genAt}>Generado el {fmtDateTime(now)}</div>
        </div>

        <div style={prCard.grid}>
          <div style={prCard.card}>
            <PrCardHead color="#4FA8D8">Beneficios tributarios UPME</PrCardHead>
            <PrBigPct pct={upmePct} color="#2C7DB8" />
            <div style={prCard.cardSub}>{nextUpme ? `Siguiente paso: ${nextUpme.num}. ${nextUpme.label}` : "Proceso completado"}</div>
          </div>
          <div style={prCard.card}>
            <PrCardHead color="#F5B942">Energización</PrCardHead>
            <PrBigPct pct={enerPct} color="#C98A1E" />
            <div style={prCard.cardSub}>{elapsed === null ? "Falta asignar fecha de inicio de trámites" : `Día ${elapsed} de 200`} · {nextMs ? `Siguiente: ${nextMs.title} (día ${nextMs.day})` : "Completado"}</div>
          </div>
          <div style={prCard.card}>
            <PrCardHead color="#7FD08A">Presupuesto</PrCardHead>
            <PrBigPct
              pct={Math.min(100, Math.abs(desviacionPct))}
              color={desviacionPct > 0 ? "#C0392B" : "#3E9B4F"}
              label={`${desviacionPct > 0 ? "+" : ""}${desviacionPct}%`}
            />
            <div style={prCard.cardSub}>
              Desviación vs. base: {presTotals.diferencia > 0 ? "+" : ""}{fmtMoney(presTotals.diferencia)}
              <br />
              Base {fmtMoney(presTotals.base)} · Ejecución {fmtMoney(presTotals.ejecutado)}
            </div>
          </div>
          <div style={prCard.card}>
            <PrCardHead color="#E77DA8">Pagos</PrCardHead>
            <PrBigPct pct={pagTotals.totalOrdenes ? Math.round((pagTotals.totalPagado / pagTotals.totalOrdenes) * 100) : 0} color="#C24E7C" />
            <div style={prCard.cardSub}>{fmtMoney(pagTotals.totalPagado)} pagado de {fmtMoney(pagTotals.totalOrdenes)} · saldo {fmtMoney(pagTotals.totalSaldo)}</div>
          </div>
          <div style={prCard.card}>
            <PrCardHead color="#A78BFA">Balance financiero</PrCardHead>
            <div style={{ fontSize: 22, fontWeight: 700, color: balTotals.saldo >= 0 ? "#3E9B4F" : "#C0392B" }}>{fmtMoney(balTotals.saldo)}</div>
            <div style={prCard.cardSub}>Ingresos {fmtMoney(balTotals.totalIngresos)} · Pagos {fmtMoney(balTotals.totalPagos)}</div>
          </div>
        </div>

        <div style={prCard.alertsCard}>
          <PrCardHead color="#E8A33D">Alertas</PrCardHead>
          {alerts.length === 0 ? (
            <div style={prCard.cardSub}>Sin alertas por ahora.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {alerts.map((a, i) => <li key={i} style={prCard.alertItem}>{a.texto}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Igual que arriba, pero para el Resumen general (todos los proyectos a la vez).
export function PrintResumenGeneral({ projects, projectData }) {
  const now = new Date();
  const rows = projects.map((p) => {
    const d = projectData[p.id];
    if (!d) return { project: p, loading: true };
    return {
      project: p, loading: false,
      upmePct: upmeProgress(d.upme),
      enerPct: energizacionProgress(d.energizacion),
      pres: presupuestoTotals(d.presupuesto),
      pag: pagosTotals(d.pagos),
    };
  });
  const loaded = rows.filter((r) => !r.loading);
  const avgUpme = loaded.length ? Math.round(loaded.reduce((s, r) => s + r.upmePct, 0) / loaded.length) : 0;
  const avgEner = loaded.length ? Math.round(loaded.reduce((s, r) => s + r.enerPct, 0) / loaded.length) : 0;
  const totalBase = loaded.reduce((s, r) => s + r.pres.base, 0);
  const totalEjecutado = loaded.reduce((s, r) => s + r.pres.ejecutado, 0);
  const totalSaldo = loaded.reduce((s, r) => s + r.pag.totalSaldo, 0);

  return (
    <div className="print-only" style={prCard.page}>
      <div style={prCard.wrap}>
        <div style={prCard.headerRow}>
          <h1 style={prCard.h1}>Resumen general</h1>
          <div style={prCard.meta}>{projects.length} proyecto{projects.length === 1 ? "" : "s"}</div>
          <div style={prCard.genAt}>Generado el {fmtDateTime(now)}</div>
        </div>

        <div style={prCard.statGrid}>
          <div style={prCard.statCard}><div style={prCard.statNum}>{projects.length}</div><div style={prCard.statLabel}>Proyectos</div></div>
          <div style={prCard.statCard}><div style={{ ...prCard.statNum, color: "#2C7DB8" }}>{avgUpme}%</div><div style={prCard.statLabel}>Avance UPME promedio</div></div>
          <div style={prCard.statCard}><div style={{ ...prCard.statNum, color: "#C98A1E" }}>{avgEner}%</div><div style={prCard.statLabel}>Avance energización promedio</div></div>
          <div style={prCard.statCard}><div style={{ ...prCard.statNum, color: totalSaldo > 0 ? "#C98A1E" : "#3E9B4F" }}>{fmtMoney(totalSaldo)}</div><div style={prCard.statLabel}>Saldo pendiente total</div></div>
        </div>
        <div style={{ ...prCard.cardSub, marginBottom: 14 }}>
          Presupuesto base: {fmtMoney(totalBase)} · Presupuesto ejecución: {fmtMoney(totalEjecutado)}
        </div>

        <table style={prCard.table}>
          <thead>
            <tr>
              <th style={prCard.th}>Proyecto</th>
              <th style={prCard.th}>UPME</th>
              <th style={prCard.th}>Energización</th>
              <th style={prCard.th}>Presupuesto</th>
              <th style={prCard.th}>Saldo pendiente</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project: p, loading, upmePct, enerPct, pres, pag }) => (
              <tr key={p.id}>
                <td style={prCard.td}>
                  <strong>{p.name}</strong>
                  <div style={{ fontSize: 10, color: "#888" }}>{p.capacity ? `${p.capacity} MWp` : ""}{p.location ? ` · ${p.location}` : ""}</div>
                </td>
                {loading ? (
                  <td colSpan={4} style={prCard.td}>Cargando…</td>
                ) : (
                  <>
                    <td style={prCard.td}>
                      <span style={prCard.tdBarTrack}><span style={{ ...prCard.tdBarFill, width: `${upmePct}%`, background: "#4FA8D8" }} /></span>{upmePct}%
                    </td>
                    <td style={prCard.td}>
                      <span style={prCard.tdBarTrack}><span style={{ ...prCard.tdBarFill, width: `${enerPct}%`, background: "#F5B942" }} /></span>{enerPct}%
                    </td>
                    <td style={prCard.td}>
                      <span style={prCard.tdBarTrack}><span style={{ ...prCard.tdBarFill, width: `${Math.min(100, pres.pct)}%`, background: pres.pct > 100 ? "#C0392B" : "#7FD08A" }} /></span>{pres.pct}%
                    </td>
                    <td style={prCard.td}>{fmtMoney(pag.totalSaldo)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Vista de impresión de la pestaña que se esté viendo en ese momento dentro de un proyecto
// (UPME, Energización, Cronograma, Presupuesto o Pagos), con el mismo lenguaje visual claro de prCard.
export function PrintCurrentTab({ project, tab, data }) {
  const now = new Date();
  return (
    <div className="print-only" style={prCard.page}>
      <div style={prCard.wrap}>
        <div style={prCard.headerRow}>
          <h1 style={prCard.h1}>{project.name}</h1>
          <div style={prCard.meta}>
            {project.capacity ? `${project.capacity} MWp` : ""}{project.location ? `  ·  ${project.location}` : ""}
            {"  ·  "}{TAB_LABELS[tab] || tab}
          </div>
          <div style={prCard.genAt}>Generado el {fmtDateTime(now)}</div>
        </div>
        {tab === "upme" ? (
          <PrintUpmeContent data={data.upme} />
        ) : tab === "energizacion" ? (
          <PrintEnergizacionContent data={data.energizacion} />
        ) : tab === "cronograma" ? (
          <PrintCronogramaContent data={data.cronograma} />
        ) : tab === "presupuesto" ? (
          <PrintPresupuestoContent data={data.presupuesto} />
        ) : tab === "pagos" ? (
          <PrintPagosContent data={data.pagos} />
        ) : tab === "balance" ? (
          <PrintBalanceContent data={data.balance} pagos={data.pagos} presupuesto={data.presupuesto} />
        ) : null}
      </div>
    </div>
  );
}

export function PrintUpmeContent({ data }) {
  const active = upmeActiveSteps(data);
  return (
    <table style={prCard.table}>
      <thead>
        <tr>
          <th style={prCard.th}>#</th>
          <th style={prCard.th}>Paso</th>
          <th style={prCard.th}>Estado</th>
          <th style={prCard.th}>Fecha</th>
          <th style={prCard.th}>Notas</th>
        </tr>
      </thead>
      <tbody>
        {active.map((s) => {
          const st = data.steps[s.id];
          return (
            <tr key={s.id}>
              <td style={prCard.td}>{s.num}</td>
              <td style={prCard.td}>
                {s.label}
                {s.decision && (
                  <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>
                    {s.decision.question} {st.decision ? (st.decision === "si" ? "Sí" : "No") : "Sin definir"}
                  </div>
                )}
              </td>
              <td style={prCard.td}>{st.completado ? "Completado" : "Pendiente"}</td>
              <td style={prCard.td}>{st.fecha ? fmtDate(st.fecha) : "—"}</td>
              <td style={prCard.td}>{st.notas || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function PrintEnergizacionContent({ data }) {
  let cursor = 0;
  const esMayor1mw = data.tipo === "mayor1mw";
  const groups = energizacionGroupsFor(data);
  const fpo = data.fechaInicio ? addMonths(data.fechaInicio, 6) : null;
  const fpoProrroga = data.fechaInicio ? addMonths(data.fechaInicio, 9) : null;
  return (
    <div>
      {esMayor1mw ? (
        data.fpoManual && (
          <div style={{ ...prCard.cardSub, marginBottom: 10 }}>
            FPO: {fmtDate(data.fpoManual)}
          </div>
        )
      ) : (
        data.fechaInicio && (
          <div style={{ ...prCard.cardSub, marginBottom: 10 }}>
            FPO (6 meses): {fmtDate(fpo)} · FPO con prórroga (9 meses): {fmtDate(fpoProrroga)}
          </div>
        )
      )}
      {groups.map((g) => {
        const start = cursor;
        cursor += g.items.length;
        const groupCost = g.items.reduce((s, it) => s + it.cost, 0);
        const doneCost = g.items.reduce((s, it, j) => s + (data.milestones[start + j]?.done ? it.cost : 0), 0);
        const groupPct = groupCost ? Math.round((doneCost / groupCost) * 100) : 100;
        return (
          <div key={g.id} style={prCard.section}>
            <div style={prCard.groupHead}>
              <span>{g.label}</span>
              <span>{groupPct}% · peso {groupCost}</span>
            </div>
            <table style={prCard.table}>
              <thead>
                <tr>
                  <th style={prCard.th}>Estado</th>
                  <th style={prCard.th}>Actividad</th>
                  <th style={prCard.th}>Día</th>
                  <th style={prCard.th}>Peso</th>
                  <th style={prCard.th}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it, j) => {
                  const state = data.milestones[start + j];
                  return (
                    <tr key={j}>
                      <td style={prCard.td}>{state?.done ? "✓" : "—"}</td>
                      <td style={prCard.td}>{it.title}</td>
                      <td style={prCard.td}>{it.day}</td>
                      <td style={prCard.td}>{it.cost}</td>
                      <td style={prCard.td}>{state?.done ? fmtDate(state.fecha) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function PrintCronogramaContent({ data }) {
  const pesoTotal = cronogramaPesoTotal(data.tasks);
  const avance = cronogramaAvanceActual(data.tasks);
  return (
    <div>
      <div style={{ ...prCard.cardSub, marginBottom: 10 }}>
        Peso total: {pesoTotal}% · Avance ponderado actual: {avance}%
      </div>
      <table style={prCard.table}>
        <thead>
          <tr>
            <th style={prCard.th}>Tarea</th>
            <th style={prCard.th}>Duración</th>
            <th style={prCard.th}>Inicio</th>
            <th style={prCard.th}>Fin</th>
            <th style={prCard.th}>% completado</th>
            <th style={prCard.th}>Peso</th>
          </tr>
        </thead>
        <tbody>
          {data.tasks.map((t) => (
            <tr key={t.id}>
              <td style={{ ...prCard.td, fontWeight: t.esGrupo ? 700 : 400 }}>{t.nombre}</td>
              <td style={prCard.td}>{t.duracionTexto || "—"}</td>
              <td style={prCard.td}>{t.fechaInicio ? fmtDate(t.fechaInicio) : "—"}</td>
              <td style={prCard.td}>{t.fechaFin ? fmtDate(t.fechaFin) : "—"}</td>
              <td style={prCard.td}>{t.esGrupo ? "—" : `${t.pctCompletado || 0}%`}</td>
              <td style={prCard.td}>{t.esGrupo ? "—" : `${t.peso}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrintPresupuestoContent({ data }) {
  const totals = presupuestoTotals(data);
  const baseByCat = groupPresupuestoItems(data.base);
  const ejecByCat = groupPresupuestoItems(data.ejecucion);
  const cats = Array.from(new Set([...baseByCat.map((g) => g.categoria), ...ejecByCat.map((g) => g.categoria)]));
  const baseTotalsByCat = new Map(baseByCat.map((g) => [g.categoria, presupuestoListTotal(g.items)]));
  const ejecTotalsByCat = new Map(ejecByCat.map((g) => [g.categoria, presupuestoListTotal(g.items)]));

  return (
    <div>
      <div style={{ ...prCard.cardSub, marginBottom: 10 }}>
        Base: {fmtMoney(totals.base)} · Ejecución: {fmtMoney(totals.ejecutado)} · {totals.pct}% ejecutado
      </div>
      <table style={prCard.table}>
        <thead>
          <tr>
            <th style={prCard.th}>Categoría</th>
            <th style={prCard.th}>Base</th>
            <th style={prCard.th}>Ejecución</th>
            <th style={prCard.th}>Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((cat) => {
            const base = baseTotalsByCat.get(cat) || 0;
            const ejec = ejecTotalsByCat.get(cat) || 0;
            return (
              <tr key={cat}>
                <td style={prCard.td}>{cat}</td>
                <td style={prCard.td}>{fmtMoney(base)}</td>
                <td style={prCard.td}>{fmtMoney(ejec)}</td>
                <td style={prCard.td}>{fmtMoney(ejec - base)}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...prCard.td, fontWeight: 700 }}>Total</td>
            <td style={{ ...prCard.td, fontWeight: 700 }}>{fmtMoney(totals.base)}</td>
            <td style={{ ...prCard.td, fontWeight: 700 }}>{fmtMoney(totals.ejecutado)}</td>
            <td style={{ ...prCard.td, fontWeight: 700 }}>{fmtMoney(totals.diferencia)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function PrintPagosContent({ data }) {
  const totals = pagosTotals(data);
  return (
    <div>
      <div style={{ ...prCard.cardSub, marginBottom: 10 }}>
        Total órdenes: {fmtMoney(totals.totalOrdenes)} · Pagado: {fmtMoney(totals.totalPagado)} · Saldo: {fmtMoney(totals.totalSaldo)}
      </div>
      <table style={prCard.table}>
        <thead>
          <tr>
            <th style={prCard.th}>Orden</th>
            <th style={prCard.th}>Proveedor</th>
            <th style={prCard.th}>Valor total</th>
            <th style={prCard.th}>Pagado</th>
            <th style={prCard.th}>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {(data.ordenes || []).map((o) => (
            <tr key={o.id}>
              <td style={prCard.td}>{o.numero}</td>
              <td style={prCard.td}>{o.proveedor}</td>
              <td style={prCard.td}>{fmtMoney(o.valorTotal)}</td>
              <td style={prCard.td}>{fmtMoney(ordenPagado(o))}</td>
              <td style={prCard.td}>{fmtMoney(ordenSaldo(o))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Vista de impresión de pagos PROGRAMADOS dentro de un rango de fechas (el "desde"/"hasta" que se
// eligió en PagosRangeExportModal). Cada bando del rango es opcional por separado.
export function PrintPagosRangeContent({ project, data, range }) {
  const now = new Date();
  const rows = [];
  (data.ordenes || []).forEach((o) => {
    (o.pagos || []).forEach((p) => {
      if ((p.estado || "pagado") !== "programado") return;
      if (!p.fecha) return;
      if (range.from && p.fecha < range.from) return;
      if (range.to && p.fecha > range.to) return;
      rows.push({ ...p, ordenNumero: o.numero, proveedor: o.proveedor, ordenDescripcion: o.descripcion });
    });
  });
  rows.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const total = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const rangoTexto = range.from && range.to
    ? `del ${fmtDate(range.from)} al ${fmtDate(range.to)}`
    : range.from
      ? `desde el ${fmtDate(range.from)}`
      : range.to
        ? `hasta el ${fmtDate(range.to)}`
        : "todas las fechas";

  return (
    <div className="print-only" style={prCard.page}>
      <div style={prCard.wrap}>
        <div style={prCard.headerRow}>
          <h1 style={prCard.h1}>{project.name}</h1>
          <div style={prCard.meta}>Pagos programados — {rangoTexto}</div>
          <div style={prCard.genAt}>Generado el {fmtDateTime(now)}</div>
        </div>
        <div style={{ ...prCard.cardSub, marginBottom: 10 }}>
          {rows.length} pago{rows.length === 1 ? "" : "s"} programado{rows.length === 1 ? "" : "s"} · Total: {fmtMoney(total)}
        </div>
        <table style={prCard.table}>
          <thead>
            <tr>
              <th style={prCard.th}>Fecha</th>
              <th style={prCard.th}>Orden</th>
              <th style={prCard.th}>Proveedor</th>
              <th style={prCard.th}>Concepto</th>
              <th style={prCard.th}>Valor</th>
              <th style={prCard.th}>Pago aprobado por</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={prCard.td}>{fmtDate(r.fecha)}</td>
                <td style={prCard.td}>{r.ordenNumero}</td>
                <td style={prCard.td}>{r.proveedor}</td>
                <td style={prCard.td}>{r.concepto || r.ordenDescripcion}</td>
                <td style={prCard.td}>{fmtMoney(r.valor)}</td>
                <td style={prCard.td}>{r.aprobado && r.aprobadoPor ? r.aprobadoPor : "Sin aprobar"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PrintBalanceContent({ data, pagos, presupuesto }) {
  const totals = balanceTotals(data, pagos);
  const margen = balanceMargenTotals(data, presupuesto);
  return (
    <div>
      <div style={{ ...prCard.cardSub, marginBottom: 6 }}>
        Valor de venta: {fmtMoney(margen.valorVenta)} · Valor base: {fmtMoney(margen.presupuestoBase)} ·
        {" "}Valor del proyecto (ejecución): {fmtMoney(margen.presupuestoEjecucion)} · Utilidad real: {fmtMoney(margen.utilidadReal)}
      </div>
      <div style={{ ...prCard.cardSub, marginBottom: 10 }}>
        Ingresos: {fmtMoney(totals.totalIngresos)} · Pagos: {fmtMoney(totals.totalPagos)} · Queda: {fmtMoney(totals.saldo)}
      </div>
      <table style={prCard.table}>
        <thead>
          <tr>
            <th style={prCard.th}>Hito de pago</th>
            <th style={prCard.th}>Fecha programada</th>
            <th style={prCard.th}>Valor esperado</th>
            <th style={prCard.th}>¿Pagado?</th>
            <th style={prCard.th}>Fecha de pago</th>
            <th style={prCard.th}>Valor pagado</th>
          </tr>
        </thead>
        <tbody>
          {(data.hitos || []).map((h) => (
            <tr key={h.id}>
              <td style={prCard.td}>{h.nombre}</td>
              <td style={prCard.td}>{fmtDate(h.fechaProgramada)}</td>
              <td style={prCard.td}>{fmtMoney(h.valorEsperado)}</td>
              <td style={prCard.td}>{h.pagado ? "Sí" : "No"}</td>
              <td style={prCard.td}>{h.pagado ? fmtDate(h.fechaPago) : ""}</td>
              <td style={prCard.td}>{h.pagado ? fmtMoney(h.valorPagado) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Informe PP-I-01 en PDF: una "página" por proyecto (salto de página forzado entre uno y otro),
// con el mismo contenido que la hoja INFO BASE del Excel (buildInformeProyecto es la fuente única
// para ambos formatos) más una tabla de PPTO SEG y la Curva S de energización dibujada como gráfico
// vectorial (no imagen rasterizada) para que se vea nítida al imprimir/guardar como PDF.
export function PrintInformePPI01({ projects, projectDataById }) {
  const now = new Date();
  const total = projects.length;
  return (
    <div className="print-only" style={prCard.page}>
      {projects.map((project, idx) => {
        const data = projectDataById[project.id];
        const inf = buildInformeProyecto(project, data);
        const groups = groupPresupuestoItems(inf.presupuestoEjecucion);
        return (
          <div key={project.id} style={{ ...prCard.wrap, pageBreakAfter: idx < total - 1 ? "always" : "auto" }}>
            <div style={prCard.headerRow}>
              <h1 style={prCard.h1}>Informe PP-I-01 — {project.name}</h1>
              <div style={prCard.meta}>Página {idx + 1} de {total}</div>
              <div style={prCard.genAt}>Generado el {fmtDateTime(now)}</div>
            </div>

            <div style={prCard.card}>
              <PrCardHead color="#4FA8D8">1. Equipo de trabajo</PrCardHead>
              {inf.equipo.length === 0 ? (
                <div style={prCard.cardSub}>Sin equipo asignado.</div>
              ) : (
                <table style={prCard.table}>
                  <thead><tr><th style={prCard.th}>Cargo</th><th style={prCard.th}>Nombre</th></tr></thead>
                  <tbody>
                    {inf.equipo.map((m) => <tr key={m.id}><td style={prCard.td}>{m.cargo}</td><td style={prCard.td}>{m.nombre}</td></tr>)}
                  </tbody>
                </table>
              )}
            </div>

            <div style={prCard.card}>
              <PrCardHead color="#7FD08A">2. Ubicación</PrCardHead>
              <div style={prCard.cardSub}>{inf.ubicacion || "Sin ubicación registrada."}</div>
            </div>

            <div style={prCard.card}>
              <PrCardHead color="#F5B942">3. Información técnica</PrCardHead>
              <div style={prCard.cardSub}>
                Potencia: {inf.potencia ? `${inf.potencia} MWp` : "—"} · FPO: {inf.fpo ? fmtDate(inf.fpo) : "sin definir"}
              </div>
              <table style={prCard.table}>
                <tbody>
                  <tr><td style={prCard.td}><b>3.1 Paneles</b></td><td style={prCard.td}>{inf.fichaTecnica.paneles.cantidad} und · {inf.fichaTecnica.paneles.potenciaWp} Wp · {inf.fichaTecnica.paneles.marca} {inf.fichaTecnica.paneles.referencia}</td></tr>
                  <tr><td style={prCard.td}><b>3.2 Inversores</b></td><td style={prCard.td}>{inf.fichaTecnica.inversores.cantidad} und · {inf.fichaTecnica.inversores.capacidad} · {inf.fichaTecnica.inversores.marca} {inf.fichaTecnica.inversores.referencia}</td></tr>
                  <tr><td style={prCard.td}><b>3.3 Transformador</b></td><td style={prCard.td}>{inf.fichaTecnica.transformador.tipo} · {inf.fichaTecnica.transformador.marca}</td></tr>
                  <tr><td style={prCard.td}><b>3.4 Estructura</b></td><td style={prCard.td}>{inf.fichaTecnica.estructura.configuracion} · {inf.fichaTecnica.estructura.cantidad} und · {inf.fichaTecnica.estructura.proveedor}</td></tr>
                </tbody>
              </table>
            </div>

            <div style={prCard.card}>
              <PrCardHead color="#A78BFA">4. Información presupuestal y financiera</PrCardHead>
              <div style={prCard.statGrid}>
                <div style={prCard.statCard}><div style={prCard.statNum}>{fmtMoney(inf.financiero.valorContractual)}</div><div style={prCard.statLabel}>Valor contractual</div></div>
                <div style={prCard.statCard}><div style={prCard.statNum}>{fmtMoney(inf.financiero.costoEstimadoInicial)}</div><div style={prCard.statLabel}>Costo estimado inicial</div></div>
                <div style={prCard.statCard}><div style={prCard.statNum}>{fmtMoney(inf.financiero.costoProyectado)}</div><div style={prCard.statLabel}>Costo proyectado</div></div>
                <div style={prCard.statCard}><div style={{ ...prCard.statNum, color: inf.financiero.ebitda >= 0 ? "#3E9B4F" : "#C0392B" }}>{fmtMoney(inf.financiero.ebitda)}</div><div style={prCard.statLabel}>EBITDA / Ganancia o pérdida</div></div>
                <div style={prCard.statCard}><div style={prCard.statNum}>{Math.round(inf.financiero.eficienciaCosto * 100)}%</div><div style={prCard.statLabel}>Eficiencia del costo</div></div>
                <div style={prCard.statCard}><div style={prCard.statNum}>{inf.cumplimientoEnergizacion ? `${inf.cumplimientoEnergizacion.real}%` : "—"}</div><div style={prCard.statLabel}>Cumplimiento Curva S energización</div></div>
              </div>
            </div>

            {inf.curvaSEnergizacion.length > 0 && (
              <div style={prCard.card}>
                <PrCardHead color="#F5B942">Curva S de energización</PrCardHead>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={inf.curvaSEnergizacion} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E5E8" />
                    <XAxis {...ejeTiempoProps(inf.curvaSEnergizacion)} tick={{ fill: "#777", fontSize: 9 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#777", fontSize: 9 }} unit="%" />
                    <RLegend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="base" name="Línea base" stroke="#4FA8D8" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="real" name="Avance real" stroke="#F5B942" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div style={prCard.card}>
              <PrCardHead color="#E77DA8">5. Cortes de obra</PrCardHead>
              {inf.cortesObra.length === 0 ? (
                <div style={prCard.cardSub}>Sin contratistas seleccionados.</div>
              ) : (
                <table style={prCard.table}>
                  <thead>
                    <tr>
                      <th style={prCard.th}>Contratista</th><th style={prCard.th}># de corte</th>
                      <th style={prCard.th}>Vr acumulado</th><th style={prCard.th}>Reteobra</th><th style={prCard.th}>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inf.cortesObra.map((c) => (
                      <tr key={c.proveedor}>
                        <td style={prCard.td}>{c.proveedor}</td>
                        <td style={prCard.td}>{c.numCortes}</td>
                        <td style={prCard.td}>{fmtMoney(c.vrAcumulado)}</td>
                        <td style={prCard.td}>{fmtMoney(c.reteobra)}</td>
                        <td style={prCard.td}>{fmtMoney(c.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={prCard.card}>
              <PrCardHead color="#7FD08A">PPTO SEG — Presupuesto de ejecución</PrCardHead>
              {groups.length === 0 ? (
                <div style={prCard.cardSub}>Sin ítems en presupuesto de ejecución.</div>
              ) : (
                <table style={prCard.table}>
                  <thead>
                    <tr>
                      <th style={prCard.th}>Ítem</th><th style={prCard.th}>Descripción</th><th style={prCard.th}>Cant.</th>
                      <th style={prCard.th}>Unidad</th><th style={prCard.th}>Valor unitario</th><th style={prCard.th}>Valor total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <React.Fragment key={g.categoria}>
                        <tr><td style={{ ...prCard.td, fontWeight: 700 }} colSpan={6}>{g.categoria}</td></tr>
                        {g.items.map((it) => {
                          const calc = calcPresupuestoItem(it);
                          return (
                            <tr key={it.id}>
                              <td style={prCard.td}>{it.item}</td>
                              <td style={prCard.td}>{it.descripcion}</td>
                              <td style={prCard.td}>{it.cantidad}</td>
                              <td style={prCard.td}>{it.unidad}</td>
                              <td style={prCard.td}>{fmtMoney(it.valorUnitario)}</td>
                              <td style={prCard.td}>{fmtMoney(calc.valorTotal)}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
