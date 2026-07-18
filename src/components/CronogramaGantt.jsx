import React from "react";
import { daysBetween, fmtDate, parsePredecesoras, computeCriticalPath } from "../lib/data";

const ROW_H = 26;
const PX_PER_DAY = 6;
const LABEL_COL_W = 260;

// Gantt visual del cronograma: barras posicionadas por fecha, con las flechas de dependencia entre
// predecesora/sucesora (como el Project original) y la ruta crítica resaltada en rojo. Usa las
// fechas ya calculadas por computeCronogramaSchedule — este componente solo dibuja, no recalcula nada.
export default function CronogramaGantt({ tasks }) {
  const withDates = tasks.filter((t) => t.fechaInicio && t.fechaFin);
  if (withDates.length === 0) {
    return <div style={{ color: "#7A8A93", fontSize: 13, padding: "10px 0" }}>Agrega actividades con fechas para ver el Gantt.</div>;
  }

  const minDate = withDates.reduce((m, t) => (t.fechaInicio < m ? t.fechaInicio : m), withDates[0].fechaInicio);
  const maxDate = withDates.reduce((m, t) => (t.fechaFin > m ? t.fechaFin : m), withDates[0].fechaFin);
  const totalDays = Math.max(1, daysBetween(minDate, maxDate));
  const chartW = totalDays * PX_PER_DAY;
  const chartH = tasks.length * ROW_H;

  const xOf = (iso) => daysBetween(minDate, iso) * PX_PER_DAY;

  const byDisplayId = new Map();
  tasks.forEach((t, i) => {
    const did = (t.displayId || "").trim();
    if (did && !byDisplayId.has(did)) byDisplayId.set(did, i);
  });
  const critical = computeCriticalPath(tasks);

  // Marcas de mes para el eje de tiempo superior
  const monthTicks = [];
  {
    const d = new Date(minDate + "T00:00:00");
    d.setDate(1);
    const end = new Date(maxDate + "T00:00:00");
    while (d <= end) {
      const iso = d.toISOString().slice(0, 10);
      monthTicks.push({ x: xOf(iso), label: d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }) });
      d.setMonth(d.getMonth() + 1);
    }
  }

  // Conectores predecesora -> sucesora, con el borde correcto según el tipo de relación
  const connectors = [];
  tasks.forEach((t, iSucc) => {
    if (t.esGrupo) return;
    parsePredecesoras(t.predecesoras).forEach((p) => {
      const iPred = byDisplayId.get(p.id);
      if (iPred === undefined) return;
      const pred = tasks[iPred];
      if (!pred.fechaInicio || !pred.fechaFin) return;
      const predLeft = xOf(pred.fechaInicio);
      const predRight = Math.max(predLeft + 2, xOf(pred.fechaFin));
      const succLeft = xOf(t.fechaInicio);
      const succRight = Math.max(succLeft + 2, xOf(t.fechaFin));
      const fromX = p.tipo === "CC" || p.tipo === "CF" ? predLeft : predRight;
      const toX = p.tipo === "FF" || p.tipo === "CF" ? succRight : succLeft;
      const fromY = iPred * ROW_H + ROW_H / 2;
      const toY = iSucc * ROW_H + ROW_H / 2;
      const midX = fromX + (toX - fromX) / 2;
      const isCritical = critical.has(pred.id) && critical.has(t.id);
      connectors.push({
        key: `${pred.id}-${t.id}`,
        d: `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`,
        critical: isCritical,
      });
    });
  });

  return (
    <div style={{ background: "#171E23", border: "1px solid #232D33", borderRadius: 12, overflow: "auto" }}>
      <div style={{ display: "flex", width: LABEL_COL_W + chartW + 20, minWidth: "100%" }}>
        <div style={{ width: LABEL_COL_W, flexShrink: 0, borderRight: "1px solid #232D33" }}>
          <div style={{ height: 24, borderBottom: "1px solid #232D33" }} />
          {tasks.map((t) => (
            <div
              key={t.id}
              title={t.nombre}
              style={{
                height: ROW_H, display: "flex", alignItems: "center", padding: "0 10px",
                fontSize: 11, color: t.esGrupo ? "#F5B942" : "#B9C4CA", fontWeight: t.esGrupo ? 700 : 400,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                background: t.esGrupo ? "#1C242A" : undefined,
              }}
            >
              {t.displayId ? `${t.displayId} · ` : ""}{t.nombre}
            </div>
          ))}
        </div>

        <div style={{ position: "relative", width: chartW + 20 }}>
          <div style={{ height: 24, position: "relative", borderBottom: "1px solid #232D33" }}>
            {monthTicks.map((m, i) => (
              <div key={i} style={{ position: "absolute", left: m.x, top: 4, fontSize: 10, color: "#7A8A93", borderLeft: "1px solid #232D33", paddingLeft: 4 }}>
                {m.label}
              </div>
            ))}
          </div>

          <svg width={chartW + 20} height={chartH} style={{ position: "absolute", top: 24, left: 0, pointerEvents: "none" }}>
            <defs>
              <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#5A6870" />
              </marker>
              <marker id="gantt-arrow-critical" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#E2604F" />
              </marker>
            </defs>
            {connectors.map((c) => (
              <path
                key={c.key}
                d={c.d}
                fill="none"
                stroke={c.critical ? "#E2604F" : "#3A444B"}
                strokeWidth={c.critical ? 1.5 : 1}
                markerEnd={c.critical ? "url(#gantt-arrow-critical)" : "url(#gantt-arrow)"}
              />
            ))}
          </svg>

          <div style={{ position: "relative" }}>
            {tasks.map((t, i) => {
              if (!t.fechaInicio || !t.fechaFin) return <div key={t.id} style={{ height: ROW_H }} />;
              const left = xOf(t.fechaInicio);
              const right = Math.max(left + 2, xOf(t.fechaFin));
              const isMilestone = t.fechaInicio === t.fechaFin;
              const isCritical = critical.has(t.id);
              const barColor = t.esGrupo ? "#F5B942" : isCritical ? "#E2604F" : "#4FA8D8";
              const top = i * ROW_H + (t.esGrupo ? 6 : 5);
              const barH = t.esGrupo ? ROW_H - 12 : ROW_H - 10;

              return (
                <div key={t.id} title={`${t.nombre}\n${fmtDate(t.fechaInicio)} → ${fmtDate(t.fechaFin)}`} style={{ height: ROW_H, position: "relative" }}>
                  {isMilestone ? (
                    <div
                      style={{
                        position: "absolute", left: left - 5, top: i * ROW_H + ROW_H / 2 - 5,
                        width: 10, height: 10, transform: "rotate(45deg)",
                        background: isCritical ? "#E2604F" : "#7FD08A",
                      }}
                    />
                  ) : (
                    <div style={{ position: "absolute", left, top, width: right - left, height: barH, borderRadius: 3, background: barColor, opacity: t.esGrupo ? 0.9 : 0.85 }}>
                      {!t.esGrupo && t.pctCompletado > 0 && (
                        <div
                          style={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: `${Math.min(100, t.pctCompletado)}%`,
                            background: "rgba(0,0,0,0.35)", borderRadius: "3px 0 0 3px",
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
