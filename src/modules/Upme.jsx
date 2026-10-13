import { UPME_STEPS, upmeActiveSteps } from "../lib/data.js";
import { Check } from "lucide-react";
import { styles } from "../styles.js";
import { BRAND_DARK, FONT_BRAND_BODY, FONT_BRAND_DISPLAY, OVERVIEW_LIGHT } from "../theme.js";
import { AttachmentsButton } from "../components/AttachmentsButton.jsx";

/* ---------------------------------------------------------------------
   UPME module
--------------------------------------------------------------------- */
export function UpmeModule({ data, onChange, projectId, isLector }) {
  const updateStep = (id, patch) => {
    onChange({ ...data, steps: { ...data.steps, [id]: { ...data.steps[id], ...patch } } });
  };

  const skipS7S8 = data.steps.s6?.decision === "si";
  const skipS10S11 = data.steps.s9?.decision === "no";
  const isSkipped = (s) => (s.id === "s7" || s.id === "s8") ? skipS7S8 : (s.id === "s10" || s.id === "s11") ? skipS10S11 : false;

  const active = upmeActiveSteps(data);
  const doneCount = active.filter((s) => data.steps[s.id]?.completado).length;

  // Piloto de tema claro (identidad corporativa GUMAR) extendido a la pestaña UPME — mismo patrón
  // que ResumenGeneral: no se toca el objeto `styles` compartido (dateField/input/presSubTabBtn se
  // usan en otras pestañas todavía oscuras), los overrides van locales aquí. El fondo claro se
  // "sangra" por encima del padding de styles.content con márgenes negativos para cubrir todo el
  // área de la pestaña sin tocar ese estilo compartido.
  const lightDateField = { ...styles.dateField, color: OVERVIEW_LIGHT.textSecondary, fontFamily: FONT_BRAND_BODY };
  const lightInput = { ...styles.input, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightSubTabBtn = { ...styles.presSubTabBtn, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textSecondary, fontFamily: FONT_BRAND_BODY };
  const lightSubTabBtnActive = { borderColor: BRAND_DARK, background: BRAND_DARK, color: "#FFFFFF" };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
      <div style={{ ...styles.cronoHead }}>
        <h3 style={{ ...styles.h3, color: "#FFFFFF", fontFamily: FONT_BRAND_DISPLAY }}>Beneficios tributarios — trámite ante la UPME</h3>
        <span style={{ ...styles.pesoTotalTag, color: "#FFFFFF" }}>{doneCount} de {active.length} pasos completados</span>
      </div>

      <div style={styles.upmeStepList}>
        {UPME_STEPS.map((s) => {
          const st = data.steps[s.id];
          const skipped = isSkipped(s);
          return (
            <div key={s.id} style={{ ...styles.upmeStepCard, ...(skipped ? styles.upmeStepCardSkipped : {}) }}>
              <div style={styles.upmeStepHead}>
                <button
                  disabled={skipped}
                  aria-label={skipped ? undefined : st.completado ? "Marcar como pendiente" : "Marcar como completado"}
                  onClick={skipped ? undefined : () => updateStep(s.id, { completado: !st.completado })}
                  style={{
                    ...styles.upmeStepNum,
                    background: skipped ? "#E3E9E6" : st.completado ? BRAND_DARK : "#FFFFFF",
                    color: skipped ? "#8FA39B" : st.completado ? "#FFFFFF" : BRAND_DARK,
                    borderColor: skipped ? "#C7D6D0" : BRAND_DARK,
                    cursor: skipped ? "default" : "pointer",
                    padding: 0,
                  }}
                >
                  {st.completado && !skipped ? <Check size={14} /> : s.num}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ ...styles.upmeStepLabel, ...(skipped ? { color: "#8FA39B", textDecoration: "line-through" } : {}) }}>
                    {s.label}
                  </div>
                  {skipped && <div style={styles.upmeSkippedTag}>Omitido según la respuesta anterior</div>}
                </div>
                {!skipped && (
                  <label style={styles.upmeCheckToggle}>
                    <input type="checkbox" checked={!!st.completado} onChange={(e) => updateStep(s.id, { completado: e.target.checked })} />
                    <span>{st.completado ? "Completado" : "Marcar como completado"}</span>
                  </label>
                )}
                {!skipped && projectId && (
                  <AttachmentsButton projectId={projectId} modulo="upme" entidadId={s.id} readOnly={isLector} />
                )}
              </div>

              {!skipped && (
                <div style={styles.upmeStepBody}>
                  <label style={lightDateField}>
                    <span>Fecha</span>
                    <input type="date" style={lightInput} value={st.fecha} onChange={(e) => updateStep(s.id, { fecha: e.target.value })} />
                  </label>
                  <input
                    style={{ ...lightInput, flex: 1, minWidth: 160 }}
                    placeholder="Notas (opcional)"
                    value={st.notas}
                    onChange={(e) => updateStep(s.id, { notas: e.target.value })}
                  />
                  {s.decision && (
                    <div style={styles.upmeDecisionBox}>
                      <span>{s.decision.question}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          style={{ ...lightSubTabBtn, ...(st.decision === "si" ? lightSubTabBtnActive : {}) }}
                          onClick={() => updateStep(s.id, { decision: "si" })}
                        >
                          Sí
                        </button>
                        <button
                          style={{ ...lightSubTabBtn, ...(st.decision === "no" ? lightSubTabBtnActive : {}) }}
                          onClick={() => updateStep(s.id, { decision: "no" })}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
