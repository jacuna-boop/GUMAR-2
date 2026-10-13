import { useMemo, useState } from "react";
import { applyCronogramaMerge, buildCurvaSData, computeCronogramaSchedule, cronogramaAvanceActual, cronogramaPesoTotal, fmtDate, matchCronogramaTasks, parseCronogramaPaste, parsePredecesoras, todayISO, uid } from "../lib/data.js";
import { AlertTriangle, ClipboardPaste, Plus, Search, Trash2, X } from "lucide-react";
import { CartesianGrid, Legend as RLegend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CronogramaGantt from "../components/CronogramaGantt";
import { styles } from "../styles.js";
import { BRAND_DARK, BRAND_LIGHT, FONT_BRAND_BODY, FONT_BRAND_DISPLAY, OVERVIEW_LIGHT } from "../theme.js";
import { AttachmentsButton } from "../components/AttachmentsButton.jsx";
import { ConfirmModal } from "../modals/dialogs.jsx";

export function CronogramaModule({ data, onChange, projectId, isLector }) {
  const [newTask, setNewTask] = useState({ nombre: "", fechaInicio: "", fechaFin: "", peso: "", predecesoras: "" });
  const [newSeg, setNewSeg] = useState({ fecha: todayISO(), avance: "" });
  const [showPaste, setShowPaste] = useState(false);
  const [showGantt, setShowGantt] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind: "task" | "seg", id, label } | null
  const [searchQuery, setSearchQuery] = useState("");

  const pesoTotal = cronogramaPesoTotal(data.tasks);
  // Solo se recalcula si cambian tareas o seguimiento (no al escribir en el buscador, etc.).
  const curvaData = useMemo(() => buildCurvaSData(data), [data.tasks, data.seguimiento]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastReal = [...data.seguimiento].filter((s) => s.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
  const avanceHoy = cronogramaAvanceActual(data.tasks);

  // Registra (o actualiza) el punto de seguimiento de HOY automáticamente, para que llevar el
  // seguimiento sea solo cuestión de editar el %completado de cada actividad.
  const upsertAvanceHoy = (tasksNext) => {
    const hoy = todayISO();
    const avance = cronogramaAvanceActual(tasksNext);
    const existing = data.seguimiento.find((s) => s.fecha === hoy);
    return existing
      ? data.seguimiento.map((s) => (s.fecha === hoy ? { ...s, avance } : s))
      : [...data.seguimiento, { id: uid(), fecha: hoy, avance }];
  };

  // Referencias de "Id" que sí existen hoy en la tabla — para saber qué predecesoras resuelven a
  // otra tarea (y por lo tanto calculan su fecha solas) vs. cuáles quedan sin resolver.
  const knownDisplayIds = new Set(data.tasks.map((t) => (t.displayId || "").trim()).filter(Boolean));
  const isComputed = (t) => !t.esGrupo && parsePredecesoras(t.predecesoras).some((p) => knownDisplayIds.has(p.id));
  // Ids de predecesoras que no matchean ninguna tarea existente — para avisar en vez de fallar en silencio.
  const predecesorasNoResueltas = (t) => {
    if (t.esGrupo) return [];
    return parsePredecesoras(t.predecesoras).filter((p) => !knownDisplayIds.has(p.id)).map((p) => p.id);
  };

  // Busca por Id o nombre de actividad — sin distinguir mayúsculas/acentos.
  const normalize = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const searchTerm = normalize(searchQuery.trim());
  const visibleTasks = searchTerm
    ? data.tasks.filter((t) => normalize(t.displayId).includes(searchTerm) || normalize(t.nombre).includes(searchTerm))
    : data.tasks;

  const addTask = () => {
    if (!newTask.nombre.trim() || !newTask.fechaInicio || !newTask.fechaFin || newTask.peso === "") return;
    const task = {
      id: uid(), nombre: newTask.nombre.trim(), fechaInicio: newTask.fechaInicio, fechaFin: newTask.fechaFin,
      predecesoras: newTask.predecesoras.trim(), peso: Number(newTask.peso), esGrupo: false, pctCompletado: 0,
    };
    onChange({ ...data, tasks: computeCronogramaSchedule([...data.tasks, task]) });
    setNewTask({ nombre: "", fechaInicio: "", fechaFin: "", peso: "", predecesoras: "" });
  };
  const updateTask = (id, patch) => {
    const nextTasks = computeCronogramaSchedule(data.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const nextSeguimiento = "pctCompletado" in patch ? upsertAvanceHoy(nextTasks) : data.seguimiento;
    onChange({ ...data, tasks: nextTasks, seguimiento: nextSeguimiento });
  };
  const deleteTask = (id) => onChange({ ...data, tasks: computeCronogramaSchedule(data.tasks.filter((t) => t.id !== id)) });
  const askDeleteTask = (t) => setConfirmDelete({ kind: "task", id: t.id, label: t.nombre || "esta tarea" });

  const addSeg = () => {
    if (!newSeg.fecha || newSeg.avance === "") return;
    const entry = { id: uid(), fecha: newSeg.fecha, avance: Number(newSeg.avance) };
    onChange({ ...data, seguimiento: [...data.seguimiento, entry] });
    setNewSeg({ fecha: todayISO(), avance: "" });
  };
  const updateSeg = (id, patch) => onChange({ ...data, seguimiento: data.seguimiento.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const deleteSeg = (id) => onChange({ ...data, seguimiento: data.seguimiento.filter((s) => s.id !== id) });
  const askDeleteSeg = (s) => setConfirmDelete({ kind: "seg", id: s.id, label: `el registro del ${fmtDate(s.fecha)}` });

  const runConfirmedDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "task") deleteTask(confirmDelete.id);
    else if (confirmDelete.kind === "seg") deleteSeg(confirmDelete.id);
    setConfirmDelete(null);
  };

  // Piloto de tema claro extendido a Cronograma — mismo patrón que UPME/Energización: estilos
  // compartidos (chartBox/cronoTableWrap/ovTh/ovTd/miniInput/pasteBtn/rowDeleteBtn/addRowBtn, usados
  // también por Presupuesto/Pagos aún oscuros) se sobreescriben localmente aquí, sin tocar `styles`.
  const lightPasteBtn = { ...styles.pasteBtn, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY };
  const lightChartBox = { ...styles.chartBox, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightMiniInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightRowDeleteBtn = { ...styles.rowDeleteBtn, color: "#8FA39B" };
  const lightAddRowBtn = { ...styles.addRowBtn, background: BRAND_DARK, color: "#FFFFFF" };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
      <div style={styles.cronoHead}>
        <h3 style={{ ...styles.h3, color: "#FFFFFF", fontFamily: FONT_BRAND_DISPLAY }}>Cronograma de obra</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...styles.pesoTotalTag, color: Math.round(pesoTotal) === 100 ? "#FFFFFF" : "#FFE8B3" }}>
            peso total: {pesoTotal}% {Math.round(pesoTotal) !== 100 ? "(debería sumar 100%)" : ""}
          </span>
          <button style={lightPasteBtn} onClick={() => setShowPaste(true)}>
            <ClipboardPaste size={14} /> Pegar desde Project/Excel
          </button>
        </div>
      </div>

      <div style={styles.cronoHead}>
        <h3 style={{ ...styles.h3, color: "#FFFFFF", fontFamily: FONT_BRAND_DISPLAY }}>Curva S de construcción</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...styles.pesoTotalTag, color: "#FFFFFF" }}>
            avance real hoy: {avanceHoy}%{lastReal && lastReal.fecha !== todayISO() ? ` · último registro: ${lastReal.avance}% (${fmtDate(lastReal.fecha)})` : ""}
          </span>
        </div>
      </div>
      <div style={{ color: "#DCEAE4", fontSize: 11.5, margin: "-6px 0 12px" }}>
        El seguimiento se registra solo: cada vez que editas el %completado de una actividad, el punto de hoy se actualiza automáticamente.
      </div>

      {curvaData.length === 0 ? (
        <div style={{ color: "#DCEAE4", fontSize: 13, padding: "10px 0 20px" }}>
          Agrega actividades con fechas para ver la línea base, y registros de avance real para ver la línea de seguimiento.
        </div>
      ) : (
        <div style={lightChartBox}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={curvaData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={OVERVIEW_LIGHT.border} />
              <XAxis dataKey="label" tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} unit="%" />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: `1px solid ${OVERVIEW_LIGHT.border}`, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary }} />
              <RLegend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="base" name="Línea base" stroke={BRAND_DARK} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="real" name="Seguimiento real" stroke="#F5B942" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={lightTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={lightOvTh}>Fecha de corte</th>
              <th style={lightOvTh}>Avance real acumulado</th>
              <th style={lightOvTh}></th>
            </tr>
          </thead>
          <tbody>
            {[...data.seguimiento].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((s) => (
              <tr key={s.id}>
                <td style={lightOvTd}>
                  <input type="date" style={lightMiniInput} value={s.fecha} onChange={(e) => updateSeg(s.id, { fecha: e.target.value })} />
                </td>
                <td style={lightOvTd}>
                  <input type="number" style={{ ...lightMiniInput, width: 70 }} value={s.avance} onChange={(e) => updateSeg(s.id, { avance: e.target.value })} />
                </td>
                <td style={lightOvTd}>
                  <button style={lightRowDeleteBtn} onClick={() => askDeleteSeg(s)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={lightOvTd}>
                <input type="date" style={lightMiniInput} value={newSeg.fecha} onChange={(e) => setNewSeg({ ...newSeg, fecha: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <input type="number" style={{ ...lightMiniInput, width: 70 }} placeholder="%" value={newSeg.avance} onChange={(e) => setNewSeg({ ...newSeg, avance: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <button style={lightAddRowBtn} onClick={addSeg}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {showPaste && (
        <PasteCronogramaModal
          existingTasks={data.tasks}
          onClose={() => setShowPaste(false)}
          onImport={(mergedTasks) => {
            onChange({ ...data, tasks: mergedTasks });
            setShowPaste(false);
          }}
        />
      )}

      <div style={{ position: "relative", marginBottom: 10, maxWidth: 360 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: OVERVIEW_LIGHT.textSecondary, pointerEvents: "none" }} />
        <input
          style={{ ...lightMiniInput, paddingLeft: 30 }}
          className="ro-ok" placeholder="Buscar actividad por Id o nombre..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div style={lightTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={lightOvTh}>Id</th>
              <th style={lightOvTh}>Actividad</th>
              <th style={lightOvTh}>Duración</th>
              <th style={lightOvTh}>Inicio</th>
              <th style={lightOvTh}>Fin</th>
              <th style={lightOvTh}>Predecesoras</th>
              <th style={lightOvTh}>% Compl.</th>
              <th style={lightOvTh}>Peso %</th>
              <th style={lightOvTh}>Grupo</th>
              <th style={lightOvTh}></th>
            </tr>
          </thead>
          <tbody>
            {searchTerm && visibleTasks.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...lightOvTd, textAlign: "center", color: OVERVIEW_LIGHT.textSecondary }}>
                  {searchQuery.trim() ? `Sin resultados para "${searchQuery}".` : "Todavía no hay nada registrado aquí."}
                </td>
              </tr>
            )}
            {visibleTasks.map((t) => (
              <tr key={t.id} style={t.esGrupo ? { background: BRAND_LIGHT } : undefined}>
                <td style={lightOvTd}>
                  <input style={{ ...lightMiniInput, width: 44 }} value={t.displayId || ""} onChange={(e) => updateTask(t.id, { displayId: e.target.value })} />
                </td>
                <td style={lightOvTd}>
                  <input
                    style={{ ...lightMiniInput, fontWeight: t.esGrupo ? 700 : 400, color: t.esGrupo ? BRAND_DARK : OVERVIEW_LIGHT.textPrimary }}
                    value={t.nombre}
                    onChange={(e) => updateTask(t.id, { nombre: e.target.value })}
                  />
                </td>
                <td style={lightOvTd}>
                  <input style={{ ...lightMiniInput, width: 70 }} value={t.duracionTexto || ""} onChange={(e) => updateTask(t.id, { duracionTexto: e.target.value })} placeholder="0 días" />
                </td>
                <td style={lightOvTd}>
                  {isComputed(t) ? (
                    <span style={styles.cronoComputedDate} title="Calculada a partir de la predecesora">{fmtDate(t.fechaInicio)}</span>
                  ) : (
                    <input type="date" style={lightMiniInput} value={t.fechaInicio} onChange={(e) => updateTask(t.id, { fechaInicio: e.target.value })} />
                  )}
                </td>
                <td style={lightOvTd}>
                  {isComputed(t) ? (
                    <span style={styles.cronoComputedDate} title="Calculada a partir de la predecesora">{fmtDate(t.fechaFin)}</span>
                  ) : (
                    <input type="date" style={lightMiniInput} value={t.fechaFin} onChange={(e) => updateTask(t.id, { fechaFin: e.target.value })} />
                  )}
                </td>
                <td style={lightOvTd}>
                  {(() => {
                    const sinResolver = predecesorasNoResueltas(t);
                    return (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <input
                          style={{
                            ...lightMiniInput, width: 70,
                            ...(sinResolver.length > 0 ? { borderColor: "#E2604F", color: "#E2604F" } : {}),
                          }}
                          value={t.predecesoras || ""}
                          placeholder="ej. 35CC+5 días"
                          onChange={(e) => updateTask(t.id, { predecesoras: e.target.value })}
                        />
                        {sinResolver.length > 0 && (
                          <AlertTriangle
                            size={13}
                            color="#E2604F"
                            title={`No se encontró la tarea con Id "${sinResolver.join(", ")}" — revisa el Id o corrígelo.`}
                          />
                        )}
                      </span>
                    );
                  })()}
                </td>
                <td style={lightOvTd}>
                  <input type="number" style={{ ...lightMiniInput, width: 56 }} value={t.pctCompletado || 0} onChange={(e) => updateTask(t.id, { pctCompletado: e.target.value })} />
                </td>
                <td style={lightOvTd}>
                  <input type="number" style={{ ...lightMiniInput, width: 60 }} value={t.peso} onChange={(e) => updateTask(t.id, { peso: e.target.value })} />
                </td>
                <td style={lightOvTd}>
                  <input type="checkbox" checked={!!t.esGrupo} onChange={(e) => updateTask(t.id, { esGrupo: e.target.checked })} />
                </td>
                <td style={lightOvTd}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {projectId && <AttachmentsButton projectId={projectId} modulo="cronograma" entidadId={t.id} readOnly={isLector} />}
                    <button style={lightRowDeleteBtn} onClick={() => askDeleteTask(t)}><Trash2 size={13} /></button>
                  </span>
                </td>
              </tr>
            ))}
            <tr>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}>
                <input style={lightMiniInput} placeholder="Nueva actividad" value={newTask.nombre} onChange={(e) => setNewTask({ ...newTask, nombre: e.target.value })} />
              </td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}>
                <input type="date" style={lightMiniInput} value={newTask.fechaInicio} onChange={(e) => setNewTask({ ...newTask, fechaInicio: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <input type="date" style={lightMiniInput} value={newTask.fechaFin} onChange={(e) => setNewTask({ ...newTask, fechaFin: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <input
                  style={{ ...lightMiniInput, width: 70 }}
                  placeholder="ej. 35CC+5 días"
                  value={newTask.predecesoras}
                  onChange={(e) => setNewTask({ ...newTask, predecesoras: e.target.value })}
                />
              </td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}>
                <input type="number" style={{ ...lightMiniInput, width: 60 }} placeholder="%" value={newTask.peso} onChange={(e) => setNewTask({ ...newTask, peso: e.target.value })} />
              </td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}>
                <button style={lightAddRowBtn} onClick={addTask}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={styles.cronoHead}>
        <h3 style={{ ...styles.h3, color: "#FFFFFF", fontFamily: FONT_BRAND_DISPLAY }}>Gantt</h3>
        <button style={lightPasteBtn} onClick={() => setShowGantt((v) => !v)}>
          {showGantt ? "Ocultar Gantt" : "Mostrar Gantt"}
        </button>
      </div>
      {showGantt && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8, fontSize: 11.5, color: "#DCEAE4" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#4FA8D8", display: "inline-block" }} /> tarea
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#F5B942", display: "inline-block" }} /> grupo/fase
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#E2604F", display: "inline-block" }} /> ruta crítica
            </span>
            <span>◆ hito</span>
          </div>
          <div style={{ marginBottom: 18 }}>
            <CronogramaGantt tasks={data.tasks} />
          </div>
        </>
      )}

      {confirmDelete && (
        <ConfirmModal
          title={confirmDelete.kind === "task" ? "Eliminar tarea" : "Eliminar registro de seguimiento"}
          message={`¿Eliminar ${confirmDelete.kind === "task" ? "la tarea" : ""} "${confirmDelete.label}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={runConfirmedDelete}
        />
      )}
    </div>
  );
}

export function PasteCronogramaModal({ existingTasks, onClose, onImport }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null); // { skipped, grupos, toUpdate, toAdd } | null

  const process = () => {
    const { tasks, skipped } = parseCronogramaPaste(text);
    const grupos = tasks.filter((t) => t.esGrupo).length;
    const { toUpdate, toAdd } = matchCronogramaTasks(existingTasks, tasks);
    setPreview({ skipped, grupos, total: tasks.length, toUpdate, toAdd });
  };

  const confirmImport = () => {
    onImport(applyCronogramaMerge(existingTasks, preview.toUpdate, preview.toAdd));
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.exportModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Pegar cronograma desde MS Project / Excel</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>
          En MS Project, selecciona las columnas <strong>Id, Nombre de tarea, Duración, Comienzo, Fin, Predecesoras
          y % completado</strong> (incluye la fila de encabezados) y cópialas (Ctrl/Cmd+C). Pega aquí abajo.
          Las filas de resumen/fase (con duración distinta de "0 días") se detectan automáticamente como categorías —
          puedes corregirlo después con la casilla "Grupo" en la tabla. Si una tarea ya existe (mismo Id de Project,
          o si no hay Id, mismo nombre) se actualiza en vez de duplicarse — conservando el peso y la casilla "Grupo"
          que hayas ajustado a mano. El peso de las tareas nuevas empieza en 0; ajústalo tú.
        </p>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          placeholder="Pega aquí las filas copiadas de MS Project…"
          style={styles.exportTextarea}
        />
        {!preview ? (
          <button style={{ ...styles.addProjectBtn, marginTop: 10, opacity: text.trim() ? 1 : 0.5 }} disabled={!text.trim()} onClick={process}>
            Procesar
          </button>
        ) : (
          <>
            <div style={styles.pastePreview}>
              Se detectaron <strong>{preview.total}</strong> filas ({preview.grupos} de categoría/fase,{" "}
              {preview.total - preview.grupos} tareas).
              {preview.skipped > 0 && <> Se ignoraron {preview.skipped} filas sin nombre.</>}
              <div style={{ marginTop: 6 }}>
                <strong style={{ color: BRAND_DARK }}>{preview.toUpdate.length}</strong> ya existen y se van a actualizar ·{" "}
                <strong style={{ color: BRAND_DARK }}>{preview.toAdd.length}</strong> son nuevas.
              </div>
              {preview.toUpdate.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary }}>
                  Se actualizarán: {preview.toUpdate.map(({ existing }) => existing.nombre).join(", ")}
                </div>
              )}
              {preview.toAdd.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary }}>
                  Nuevas: {preview.toAdd.map((t) => t.nombre).join(", ")}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.confirmCancelBtn} onClick={() => setPreview(null)}>Volver a pegar</button>
              <button
                style={{ ...styles.addProjectBtn, opacity: preview.total ? 1 : 0.5 }}
                disabled={!preview.total}
                onClick={confirmImport}
              >
                Importar ({preview.toUpdate.length} actualizadas, {preview.toAdd.length} nuevas)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
