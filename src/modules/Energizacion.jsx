import React, { useState } from "react";
import { CAT_STYLE, addMonths, buildEnergizacionCurvaSData, cambiarNormaEnergizacion, hitosCno2233Marcados, daysBetween, energizacionDiasRefFor, energizacionFpoAlerta, energizacionGroupsFor, energizacionProgress, fmtDate, fmtDateTime, todayISO, uid } from "../lib/data.js";
import { AlertTriangle, CheckCircle2, Circle, MessageSquare, Trash2, Zap } from "lucide-react";
import { CartesianGrid, Legend as RLegend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { styles } from "../styles.js";
import { BRAND_DARK, FONT_BRAND_BODY, FONT_BRAND_DISPLAY, OVERVIEW_LIGHT } from "../theme.js";
import { Legend } from "../components/common.jsx";
import { AttachmentsButton } from "../components/AttachmentsButton.jsx";

// Fecha local (aaaa-mm-dd) de un Date.
const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
import { ejeTiempoProps, fechaLargaTs } from "../lib/fechasGrafica.js";

/* ---------------------------------------------------------------------
   Energización module
--------------------------------------------------------------------- */
export function EnergizacionModule({ data, onChange, projectId, isLector, autorNombre = "" }) {
  const esMayor1mw = data.tipo === "mayor1mw";
  const groups = energizacionGroupsFor(data);
  const diasRef = energizacionDiasRefFor(data);
  const elapsed = data.fechaInicio ? daysBetween(data.fechaInicio, todayISO()) : null;
  const fpo = data.fechaInicio ? addMonths(data.fechaInicio, 6) : null;
  const fpoProrroga = data.fechaInicio ? addMonths(data.fechaInicio, 9) : null;
  const fpoAlerta = energizacionFpoAlerta(data);
  const curvaSData = buildEnergizacionCurvaSData(data);
  let cursor = 0;

  // Comentarios por trámite: bitácora en milestones[i].comentarios = [{ id, texto, autor, fecha }].
  // Se guardan con el resto de Energización, así que solo los puede escribir quien edita ese módulo.
  const [comentariosAbiertos, setComentariosAbiertos] = useState({});
  const cambiarComentarios = (idx, fn) => {
    const milestones = [...data.milestones];
    while (milestones.length <= idx) milestones.push({ done: false, fecha: "" });
    milestones[idx] = { ...milestones[idx], comentarios: fn(milestones[idx].comentarios || []) };
    onChange({ ...data, milestones });
  };
  const agregarComentario = (idx, texto) => cambiarComentarios(idx, (lista) => [
    ...lista,
    { id: uid(), texto: texto.trim(), autor: autorNombre || "—", fecha: new Date().toISOString() },
  ]);
  const borrarComentario = (idx, id) => cambiarComentarios(idx, (lista) => lista.filter((c) => c.id !== id));

  // Marcar un hito como hecho pregunta primero la fecha real (antes se ponía "hoy" sin avisar, y los
  // hitos marcados tarde quedaban con una fecha falsa que deformaba la curva de avance real).
  // Desmarcarlo sí es inmediato y borra la fecha.
  const [hitoPorMarcar, setHitoPorMarcar] = useState(null); // { idx, titulo, fechaEsperada, fecha } | null
  const toggleDone = (idx, titulo, day) => {
    if (data.milestones[idx]?.done) {
      onChange({ ...data, milestones: data.milestones.map((m, i) => (i === idx ? { ...m, done: false, fecha: "" } : m)) });
      return;
    }
    let fechaEsperada = "";
    if (data.fechaInicio) {
      const d = new Date(data.fechaInicio + "T00:00:00");
      d.setDate(d.getDate() + day);
      fechaEsperada = toISODate(d);
    }
    setHitoPorMarcar({ idx, titulo, fechaEsperada, fecha: todayISO() });
  };
  const confirmarHito = () => {
    const { idx, fecha } = hitoPorMarcar;
    onChange({ ...data, milestones: data.milestones.map((m, i) => (i === idx ? { ...m, done: true, fecha } : m)) });
    setHitoPorMarcar(null);
  };

  // La fecha real de un hito ya marcado se puede corregir después, directo en su fila
  // (por ejemplo, hitos que se marcaron tarde).
  const updateMilestoneFecha = (idx, fecha) => {
    const next = data.milestones.map((m, i) => (i === idx ? { ...m, fecha } : m));
    onChange({ ...data, milestones: next });
  };

  // Cambiar de norma conserva todo lo marcado; solo volver a 2121 borra lo de la Carta 9.7 nueva.
  const cambiarNorma = (norma) => {
    if (norma === "2121" && hitosCno2233Marcados(data) > 0
      && !window.confirm("Volver a CNO 2121 quita la Carta 9.7 (Ecuación de demanda y factores), que ya tiene pasos marcados. ¿Continuar?")) return;
    onChange(cambiarNormaEnergizacion(data, norma));
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
        {!esMayor1mw && (
          <label style={lightDateField} title="CNO 2233 agrega la Carta 9.7 (Ecuación de demanda y factores) y corre la numeración de las siguientes">
            <span>Norma CNO</span>
            <select value={data.norma === "2233" ? "2233" : "2121"} onChange={(e) => cambiarNorma(e.target.value)} style={lightInput} disabled={isLector}>
              <option value="2121">CNO 2121</option>
              <option value="2233">CNO 2233</option>
            </select>
          </label>
        )}
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
              <XAxis {...ejeTiempoProps(curvaSData)} tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} unit="%" />
              <Tooltip labelFormatter={fechaLargaTs} formatter={(v) => `${v}%`} contentStyle={{ background: "#FFFFFF", border: `1px solid ${OVERVIEW_LIGHT.border}`, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary }} />
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
                  <React.Fragment key={i}>
                  <div
                    style={{
                      ...styles.wbsItemRow,
                      borderLeftColor: state.done ? BRAND_DARK : delayed ? "#E2604F" : OVERVIEW_LIGHT.border,
                    }}
                  >
                    <button
                      style={styles.wbsCheck}
                      onClick={() => toggleDone(i, it.title, it.day)}
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
                    <button
                      type="button"
                      className="ro-ok"
                      title={(state.comentarios || []).length ? "Ver comentarios" : "Agregar comentario"}
                      onClick={() => setComentariosAbiertos((prev) => ({ ...prev, [i]: !prev[i] }))}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
                        color: (state.comentarios || []).length ? BRAND_DARK : "#8FA39B", fontSize: 11.5, fontWeight: 600,
                      }}
                    >
                      <MessageSquare size={15} />
                      {(state.comentarios || []).length > 0 && (state.comentarios || []).length}
                    </button>
                  </div>
                  {comentariosAbiertos[i] && (
                    <ComentariosTramite
                      comentarios={state.comentarios || []}
                      puedeComentar={!isLector}
                      onAgregar={(texto) => agregarComentario(i, texto)}
                      onBorrar={(id) => borrarComentario(i, id)}
                      autor={autorNombre}
                    />
                  )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })}

      {hitoPorMarcar && (
        <div style={styles.modalOverlay} onClick={() => setHitoPorMarcar(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <h3 style={styles.h3}>¿Cuándo se cumplió?</h3>
            </div>
            <p style={styles.confirmMsg}>
              <strong>{hitoPorMarcar.titulo}</strong>
              <br />
              Elige la fecha real en que se completó. Esta fecha es la que dibuja la curva de avance real.
            </p>
            <input
              type="date"
              autoFocus
              value={hitoPorMarcar.fecha}
              onChange={(e) => setHitoPorMarcar({ ...hitoPorMarcar, fecha: e.target.value })}
              style={{ ...lightInput, width: "100%", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              <button style={styles.exportOptionBtn} onClick={() => setHitoPorMarcar({ ...hitoPorMarcar, fecha: todayISO() })}>Hoy</button>
              {hitoPorMarcar.fechaEsperada && (
                <button style={styles.exportOptionBtn} onClick={() => setHitoPorMarcar({ ...hitoPorMarcar, fecha: hitoPorMarcar.fechaEsperada })}>
                  Fecha esperada ({fmtDate(hitoPorMarcar.fechaEsperada)})
                </button>
              )}
            </div>
            <div style={styles.confirmBtnRow}>
              <button style={styles.confirmCancelBtn} onClick={() => setHitoPorMarcar(null)}>Cancelar</button>
              <button
                style={{ ...styles.addProjectBtn, opacity: hitoPorMarcar.fecha ? 1 : 0.5 }}
                disabled={!hitoPorMarcar.fecha}
                onClick={confirmarHito}
              >
                Marcar como cumplido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bitácora de comentarios de un trámite: lista (quién y cuándo) + campo para agregar. Cada quien solo
// puede borrar sus propios comentarios.
function ComentariosTramite({ comentarios, puedeComentar, onAgregar, onBorrar, autor }) {
  const [texto, setTexto] = useState("");
  const agregar = () => {
    if (!texto.trim()) return;
    onAgregar(texto);
    setTexto("");
  };
  return (
    <div style={{ margin: "0 0 8px 34px", padding: "10px 12px", borderLeft: `2px solid ${OVERVIEW_LIGHT.border}`, background: "#F7FAF9", borderRadius: 6 }}>
      {comentarios.length === 0 && (
        <div style={{ fontSize: 12, color: OVERVIEW_LIGHT.textSecondary, marginBottom: puedeComentar ? 8 : 0 }}>Sin comentarios todavía.</div>
      )}
      {comentarios.map((c) => (
        <div key={c.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: OVERVIEW_LIGHT.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
            <strong style={{ color: OVERVIEW_LIGHT.textPrimary }}>{c.autor}</strong>
            <span>{fmtDateTime(new Date(c.fecha))}</span>
            {puedeComentar && c.autor === autor && (
              <button
                type="button"
                title="Borrar mi comentario"
                onClick={() => { if (window.confirm("¿Borrar este comentario?")) onBorrar(c.id); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#8FA39B", padding: 0, display: "inline-flex" }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: OVERVIEW_LIGHT.textPrimary, whiteSpace: "pre-wrap", marginTop: 2 }}>{c.texto}</div>
        </div>
      ))}
      {puedeComentar ? (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <textarea
            rows={2}
            placeholder="Escribe un comentario…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) agregar(); }}
            style={{ flex: 1, resize: "vertical", padding: "6px 8px", fontSize: 12.5, fontFamily: FONT_BRAND_BODY, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 6, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary }}
          />
          <button type="button" onClick={agregar} disabled={!texto.trim()} style={{ ...styles.addProjectBtn, opacity: texto.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}>
            Comentar
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: OVERVIEW_LIGHT.textSecondary }}>Solo quien edita Energización puede comentar.</div>
      )}
    </div>
  );
}
