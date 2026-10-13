import { CAT_STYLE, addMonths, buildEnergizacionCurvaSData, daysBetween, energizacionDiasRefFor, energizacionFpoAlerta, energizacionGroupsFor, energizacionProgress, fmtDate, todayISO } from "../lib/data.js";
import { AlertTriangle, CheckCircle2, Circle, Zap } from "lucide-react";
import { CartesianGrid, Legend as RLegend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { styles } from "../styles.js";
import { BRAND_DARK, FONT_BRAND_BODY, FONT_BRAND_DISPLAY, OVERVIEW_LIGHT } from "../theme.js";
import { Legend } from "../components/common.jsx";
import { AttachmentsButton } from "../components/AttachmentsButton.jsx";

/* ---------------------------------------------------------------------
   Energización module
--------------------------------------------------------------------- */
export function EnergizacionModule({ data, onChange, projectId, isLector }) {
  const esMayor1mw = data.tipo === "mayor1mw";
  const groups = energizacionGroupsFor(data);
  const diasRef = energizacionDiasRefFor(data);
  const elapsed = data.fechaInicio ? daysBetween(data.fechaInicio, todayISO()) : null;
  const fpo = data.fechaInicio ? addMonths(data.fechaInicio, 6) : null;
  const fpoProrroga = data.fechaInicio ? addMonths(data.fechaInicio, 9) : null;
  const fpoAlerta = energizacionFpoAlerta(data);
  const curvaSData = buildEnergizacionCurvaSData(data);
  let cursor = 0;

  const toggleDone = (idx) => {
    const next = data.milestones.map((m, i) =>
      i === idx ? { ...m, done: !m.done, fecha: !m.done ? todayISO() : "" } : m
    );
    onChange({ ...data, milestones: next });
  };

  // Marcar un hito como hecho lo llena con hoy por defecto, pero la fecha real de ejecución puede
  // ser otro día — se puede corregir a mano después.
  const updateMilestoneFecha = (idx, fecha) => {
    const next = data.milestones.map((m, i) => (i === idx ? { ...m, fecha } : m));
    onChange({ ...data, milestones: next });
  };

  const overallPct = energizacionProgress(data);

  // Piloto de tema claro extendido a Energización — mismo patrón que UPME: los estilos exclusivos
  // de este módulo (ener*/wbs*) se editan directo en `styles`, y los compartidos (dateField/input/
  // cardHead/chartBox/pagosAlertBox/miniInput, usados también por otras pestañas aún oscuras) se
  // sobreescriben localmente aquí.
  const lightDateField = { ...styles.dateField, color: "#FFFFFF", fontFamily: FONT_BRAND_BODY };
  const lightInput = { ...styles.input, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightCardHead = { ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_DISPLAY };
  const lightChartBox = { ...styles.chartBox, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightAlertBox = { ...styles.pagosAlertBox, background: OVERVIEW_LIGHT.card, border: "1px solid #E8A33D88" };
  const lightMiniInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
      <div style={styles.enerHeadRow}>
        <label style={lightDateField}>
          <span>Fecha de inicio del proceso (Día 0)</span>
          <input
            type="date"
            value={data.fechaInicio}
            onChange={(e) => onChange({ ...data, fechaInicio: e.target.value })}
            style={lightInput}
          />
        </label>
        <div style={styles.dayCounter}>
          {elapsed === null ? "Asigna la fecha de inicio para empezar a contar días" : (<>Día <strong>{elapsed}</strong> de {diasRef}</>)}
        </div>
        <div style={styles.dayCounter}>
          {esMayor1mw ? "Avance" : "Avance ponderado por costo"}: <strong style={{ color: "#FFFFFF" }}>{overallPct}%</strong>
        </div>
        {esMayor1mw ? (
          <label style={lightDateField}>
            <span>FPO (manual — trámite ante el CND)</span>
            <input
              type="date"
              value={data.fpoManual || ""}
              onChange={(e) => onChange({ ...data, fpoManual: e.target.value })}
              style={lightInput}
            />
          </label>
        ) : (
          <>
            <div style={lightDateField}>
              <span>FPO (6 meses)</span>
              <div style={{ ...lightInput, fontWeight: 700, color: BRAND_DARK }}>{fpo ? fmtDate(fpo) : "—"}</div>
            </div>
            <div style={lightDateField}>
              <span>FPO con prórroga (9 meses)</span>
              <div style={{ ...lightInput, fontWeight: 700, color: BRAND_DARK }}>{fpoProrroga ? fmtDate(fpoProrroga) : "—"}</div>
            </div>
          </>
        )}
        <Legend groups={groups} />
      </div>

      {fpoAlerta && (
        <div style={lightAlertBox}>
          <div style={lightCardHead}><AlertTriangle size={16} color="#E8A33D" /><span>FPO</span></div>
          <ul style={styles.alertList}>
            <li style={{ ...styles.alertItem, color: fpoAlerta.tipo === "vencido" ? "#E2604F" : "#B5790F" }}>{fpoAlerta.texto}</li>
          </ul>
        </div>
      )}

      {curvaSData.length > 0 && (
        <div style={lightChartBox}>
          <div style={lightCardHead}><Zap size={16} color={BRAND_DARK} /><span>Curva S de energización</span></div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={curvaSData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={OVERVIEW_LIGHT.border} />
              <XAxis dataKey="label" tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} unit="%" />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: `1px solid ${OVERVIEW_LIGHT.border}`, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary }} />
              <RLegend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="base" name="Línea base" stroke={BRAND_DARK} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="real" name="Avance real" stroke="#F5B942" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {groups.map((g) => {
        const groupStart = cursor;
        cursor += g.items.length;
        const groupCost = g.items.reduce((s, it) => s + it.cost, 0);
        const doneCost = g.items.reduce(
          (s, it, j) => s + (data.milestones[groupStart + j]?.done ? it.cost : 0),
          0
        );
        const groupPct = groupCost ? Math.round((doneCost / groupCost) * 100) : 100;
        const style = CAT_STYLE[g.cat];

        return (
          <div key={g.id} style={styles.wbsGroup}>
            <div style={styles.wbsGroupHead}>
              <div style={styles.wbsGroupTitle}>
                <span style={{ ...styles.wbsDot, background: style.fg }} />
                {g.label}
              </div>
              <div style={styles.wbsGroupMeta}>
                <span style={styles.wbsCost}>peso {groupCost}</span>
                <span style={{ ...styles.wbsPct, color: groupPct === 100 ? BRAND_DARK : style.fg }}>
                  {groupPct}%
                </span>
              </div>
            </div>
            <div style={styles.wbsBarTrack}>
              <div style={{ ...styles.wbsBarFill, width: `${groupPct}%`, background: style.fg }} />
            </div>

            <div style={styles.wbsItems}>
              {g.items.map((it, j) => {
                const i = groupStart + j;
                const state = data.milestones[i] || { done: false, fecha: "" };
                const delayed = !state.done && elapsed !== null && elapsed > it.day;
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.wbsItemRow,
                      borderLeftColor: state.done ? BRAND_DARK : delayed ? "#E2604F" : OVERVIEW_LIGHT.border,
                    }}
                  >
                    <button
                      style={styles.wbsCheck}
                      onClick={() => toggleDone(i)}
                      aria-label={state.done ? "Marcar como pendiente" : "Marcar como completado"}
                    >
                      {state.done ? (
                        <CheckCircle2 size={17} color={BRAND_DARK} />
                      ) : delayed ? (
                        <AlertTriangle size={17} color="#E2604F" />
                      ) : (
                        <Circle size={17} color="#8FA39B" />
                      )}
                    </button>
                    <span style={state.done ? styles.wbsItemTitleDone : styles.wbsItemTitle}>{it.title}</span>
                    <span style={styles.wbsItemDay}>Día {it.day}</span>
                    <span style={styles.wbsItemCost}>{it.cost}</span>
                    {state.done ? (
                      <input
                        type="date"
                        value={state.fecha || ""}
                        onChange={(e) => updateMilestoneFecha(i, e.target.value)}
                        style={{ ...lightMiniInput, width: 130 }}
                        disabled={isLector}
                        title="Fecha real en que se completó este trámite"
                      />
                    ) : (
                      <span style={styles.wbsItemDatePlaceholder}>—</span>
                    )}
                    {projectId && (
                      <AttachmentsButton projectId={projectId} modulo="energizacion" entidadId={i} readOnly={isLector} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
