import { daysBetween, energizacionFpoFecha, energizacionFpoFechaSinExtension, energizacionProgress, fmtDate, fmtMoney, nextEnergizacionMilestone, pagosTotals, presupuestoTotals, todayISO, upmeProgress } from "../lib/data.js";
import { AlertTriangle } from "lucide-react";
import { buildProjectAlerts } from "./Resumen.jsx";
import { BRAND_DARK, OVERVIEW_LIGHT } from "../theme.js";
import { styles } from "../styles.js";
import { OvBar } from "../components/common.jsx";

export function ResumenGeneral({ projects, projectData, onOpenProject }) {
  if (projects.length === 0) {
    return <div style={{ color: "#DCEAE4", padding: 20 }}>Aún no hay proyectos.</div>;
  }

  const rows = projects.map((p) => {
    const d = projectData[p.id];
    if (!d) return { project: p, loading: true };
    const upmePct = upmeProgress(d.upme);
    const enerPct = energizacionProgress(d.energizacion);
    const nextMs = nextEnergizacionMilestone(d.energizacion);
    const elapsed = d.energizacion.fechaInicio ? daysBetween(d.energizacion.fechaInicio, todayISO()) : null;
    const delayed = nextMs && nextMs.delayed;
    const pres = presupuestoTotals(d.presupuesto);
    const pag = pagosTotals(d.pagos);
    const alerts = buildProjectAlerts(d);
    const fpoFecha = energizacionFpoFecha(d.energizacion); // ya incluye la prórroga (6+3 meses) para ≤1MW
    const fpoInicio = d.energizacion.fechaInicio;
    const fpoDiasRestantes = fpoFecha ? daysBetween(todayISO(), fpoFecha) : null;
    const fpoTotalDias = fpoFecha && fpoInicio ? daysBetween(fpoInicio, fpoFecha) : null;
    const fpoTranscurridos = fpoInicio ? daysBetween(fpoInicio, todayISO()) : null;
    const fpoPct = fpoTotalDias && fpoTotalDias > 0 ? Math.min(100, Math.max(0, Math.round((fpoTranscurridos / fpoTotalDias) * 100))) : 0;
    const fpoColor = fpoDiasRestantes === null ? BRAND_DARK : fpoDiasRestantes < 0 ? "#E2604F" : fpoDiasRestantes <= 30 ? "#B5790F" : BRAND_DARK;
    const fpoLabel = fpoDiasRestantes === null ? "—" : fpoDiasRestantes < 0 ? `-${Math.abs(fpoDiasRestantes)}d` : `${fpoDiasRestantes}d`;
    // Marca en la barra dónde cae la FPO SIN prórroga (6 meses) — solo existe para proyectos ≤1MW.
    const fpoBaseFecha = energizacionFpoFechaSinExtension(d.energizacion);
    const fpoBaseMarkerPct = fpoBaseFecha && fpoInicio && fpoTotalDias > 0
      ? Math.min(100, Math.max(0, (daysBetween(fpoInicio, fpoBaseFecha) / fpoTotalDias) * 100))
      : null;
    return { project: p, loading: false, upmePct, enerPct, nextMs, elapsed, delayed, pres, pag, alerts, fpoFecha, fpoPct, fpoColor, fpoLabel, fpoBaseFecha, fpoBaseMarkerPct };
  });

  const loaded = rows.filter((r) => !r.loading);
  const avgUpme = loaded.length ? Math.round(loaded.reduce((s, r) => s + r.upmePct, 0) / loaded.length) : 0;
  const avgEner = loaded.length ? Math.round(loaded.reduce((s, r) => s + r.enerPct, 0) / loaded.length) : 0;
  const delayedCount = loaded.filter((r) => r.delayed).length;
  const totalBase = loaded.reduce((s, r) => s + r.pres.base, 0);
  const totalEjecutado = loaded.reduce((s, r) => s + r.pres.ejecutado, 0);
  const totalSaldo = loaded.reduce((s, r) => s + r.pag.totalSaldo, 0);
  const projectsWithAlerts = loaded.filter((r) => r.alerts.length > 0);
  // Plata en riesgo: suma de los sobrecostos (solo donde ejecución > base) entre todos los proyectos.
  const plataEnRiesgo = loaded.reduce((s, r) => s + Math.max(0, r.pres.diferencia), 0);

  const statCard = { ...styles.overviewStat, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const statLabel = { ...styles.overviewStatLabel, color: OVERVIEW_LIGHT.textSecondary };

  return (
    <div>
      <div style={styles.overviewStatRow} className="app-stat-row">
        <div style={statCard}>
          <div style={{ ...styles.overviewStatNum, color: OVERVIEW_LIGHT.textPrimary }}>{projects.length}</div>
          <div style={statLabel}>Proyectos</div>
        </div>
        <div style={statCard}>
          <div style={{ ...styles.overviewStatNum, color: BRAND_DARK }}>{avgUpme}%</div>
          <div style={statLabel}>Avance UPME promedio</div>
        </div>
        <div style={statCard}>
          <div style={{ ...styles.overviewStatNum, color: BRAND_DARK }}>{avgEner}%</div>
          <div style={statLabel}>Avance energización promedio</div>
        </div>
        <div style={statCard}>
          <div style={{ ...styles.overviewStatNum, color: delayedCount ? "#E2604F" : BRAND_DARK }}>{delayedCount}</div>
          <div style={statLabel}>Proyectos atrasados</div>
        </div>
      </div>

      <div style={styles.overviewStatRow} className="app-stat-row">
        <div style={statCard}>
          <div style={{ ...styles.overviewStatNum, fontSize: 17, color: BRAND_DARK }}>{fmtMoney(totalBase)}</div>
          <div style={statLabel}>Presupuesto base (todos los proyectos)</div>
        </div>
        <div style={statCard}>
          <div style={{ ...styles.overviewStatNum, fontSize: 17, color: BRAND_DARK }}>{fmtMoney(totalEjecutado)}</div>
          <div style={statLabel}>Presupuesto ejecución (todos)</div>
        </div>
        <div style={statCard}>
          <div style={{ ...styles.overviewStatNum, fontSize: 17, color: totalSaldo > 0 ? "#C98A1E" : BRAND_DARK }}>{fmtMoney(totalSaldo)}</div>
          <div style={statLabel}>Saldo pendiente por pagar (todos)</div>
        </div>
        <div style={statCard}>
          <div style={{ ...styles.overviewStatNum, fontSize: 17, color: plataEnRiesgo > 0 ? "#E2604F" : BRAND_DARK }}>{fmtMoney(plataEnRiesgo)}</div>
          <div style={statLabel}>Plata en riesgo (sobrecostos, todos)</div>
        </div>
      </div>

      <div style={{ ...styles.card, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, marginBottom: 22 }}>
        <div style={{ ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary }}>
          <AlertTriangle size={16} color="#C98A1E" />
          <span>Alertas por proyecto</span>
        </div>
        {projectsWithAlerts.length === 0 ? (
          <div style={{ ...styles.cardSub, color: OVERVIEW_LIGHT.textSecondary }}>Sin alertas por ahora.</div>
        ) : (
          <div style={styles.alertsByProjectList}>
            {projectsWithAlerts.map(({ project: p, alerts }) => {
              const counts = new Map();
              alerts.forEach((a) => counts.set(a.modulo, (counts.get(a.modulo) || 0) + 1));
              return (
                <div key={p.id} style={styles.alertsByProjectGroup}>
                  <div
                    style={{ ...styles.alertsByProjectName, color: OVERVIEW_LIGHT.textPrimary }}
                    role="button"
                    onClick={() => onOpenProject(p.id, "resumen")}
                  >
                    {p.name}
                  </div>
                  <div style={styles.alertModuloTagRow}>
                    {Array.from(counts.entries()).map(([modulo, count]) => (
                      <span key={modulo} style={{ ...styles.alertModuloTag, background: BRAND_DARK, color: "#FFFFFF", border: "none" }}>{modulo} ({count})</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ ...styles.overviewTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` }}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Proyecto</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>FPO</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>UPME</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Energización</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Presupuesto</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Saldo pendiente</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Día</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Siguiente hito</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project: p, loading, upmePct, enerPct, nextMs, elapsed, delayed, pres, pag, fpoFecha, fpoPct, fpoColor, fpoLabel, fpoBaseFecha, fpoBaseMarkerPct }) => {
              const ovTdLight = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
              return (
                <tr key={p.id} style={styles.ovRow} onClick={() => onOpenProject(p.id, "resumen")}>
                  <td style={{ ...styles.ovTdName, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ ...styles.ovTdMeta, color: OVERVIEW_LIGHT.textSecondary }}>{p.capacity ? `${p.capacity} MWp` : ""}{p.location ? ` · ${p.location}` : ""}</div>
                  </td>
                  {loading ? (
                    <td colSpan={7} style={ovTdLight}>Cargando…</td>
                  ) : (
                    <>
                      <td
                        style={ovTdLight}
                        onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "energizacion"); }}
                        title={fpoFecha ? `FPO: ${fmtDate(fpoFecha)}${fpoBaseFecha ? ` · sin prórroga: ${fmtDate(fpoBaseFecha)}` : ""}` : ""}
                      >
                        {fpoFecha ? (
                          <OvBar
                            pct={fpoPct}
                            color={fpoColor}
                            label={fpoLabel}
                            trackColor={OVERVIEW_LIGHT.barTrack}
                            markerPct={fpoBaseMarkerPct}
                            markerTitle={fpoBaseFecha ? `FPO sin prórroga: ${fmtDate(fpoBaseFecha)}` : undefined}
                          />
                        ) : "—"}
                      </td>
                      <td
                        style={ovTdLight}
                        onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "upme"); }}
                      >
                        <OvBar pct={upmePct} color={BRAND_DARK} trackColor={OVERVIEW_LIGHT.barTrack} />
                      </td>
                      <td
                        style={ovTdLight}
                        onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "energizacion"); }}
                      >
                        <OvBar pct={enerPct} color={BRAND_DARK} trackColor={OVERVIEW_LIGHT.barTrack} />
                      </td>
                      <td
                        style={ovTdLight}
                        onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "presupuesto"); }}
                      >
                        <OvBar pct={pres.pct} color={pres.pct > 100 ? "#E2604F" : BRAND_DARK} trackColor={OVERVIEW_LIGHT.barTrack} />
                      </td>
                      <td
                        style={{ ...ovTdLight, color: pag.totalSaldo > 0 ? "#B5790F" : BRAND_DARK }}
                        onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "pagos"); }}
                      >
                        {fmtMoney(pag.totalSaldo)}
                      </td>
                      <td style={ovTdLight}>{elapsed === null ? "—" : `${elapsed} / 200`}</td>
                      <td
                        style={{ ...ovTdLight, color: delayed ? "#E2604F" : OVERVIEW_LIGHT.textSecondary }}
                        onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "energizacion"); }}
                      >
                        {nextMs ? `${nextMs.title} (día ${nextMs.day})${delayed ? " · atrasado" : ""}` : "Completado"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
