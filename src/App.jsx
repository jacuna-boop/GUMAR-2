import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, X, ChevronRight, ChevronDown, Sun, FileCheck, Zap, MapPin, Calendar,
  AlertTriangle, CheckCircle2, Circle, Trash2, Loader2, FileDown, Save,
  LayoutGrid, Copy, Check, DollarSign, Wallet, Pencil, ClipboardPaste,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend as RLegend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { supabase } from "./lib/supabaseClient";
import Login from "./components/Login";
import {
  UPME_PHASES, ENERGIZACION_GROUPS, ENERGIZACION_MILESTONES, ENERGIZACION_TOTAL_COST,
  CAT_STYLE, STATUS_LABELS, uid, todayISO, daysBetween, addYears, fmtDate, fmtTime, fmtDateTime,
  emptyUpmeState, emptyEnergizacionState, emptyCronogramaState, emptyPresupuestoState, emptyPagosState,
  emptyProjectData, ensureFullProjectData,
  fractionElapsed, cronogramaPesoTotal, buildCurvaSData, buildReportHTML, escapeHTML,
  upmeProgress, energizacionProgress, nextEnergizacionMilestone,
  presupuestoTotals, presupuestoListTotal, groupPresupuestoItems, calcPresupuestoItem, parsePresupuestoPaste,
  ordenPagado, ordenSaldo, pagosTotals, fmtMoney,
} from "./lib/data.js";

/* ---------------------------------------------------------------------
   Auth gate: shows Login until there's a Supabase session, then Dashboard
--------------------------------------------------------------------- */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={styles.loadingScreen}>
        <Loader2 className="spin" size={28} color="#F5B942" />
      </div>
    );
  }
  if (!session) return <Login />;
  return <Dashboard session={session} />;
}

/* ---------------------------------------------------------------------
   Main dashboard (equivalent to the original Claude-artifact App())
--------------------------------------------------------------------- */
function Dashboard({ session }) {
  const user = session.user;
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("resumen");
  const [loading, setLoading] = useState(true);
  const [projectData, setProjectData] = useState({}); // { [id]: {upme, energizacion, cronograma} }
  const [showAddProject, setShowAddProject] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saved"); // idle | saving | saved
  const [lastSaved, setLastSaved] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name } | null
  const [editingProject, setEditingProject] = useState(null); // project object | null
  const [showImportText, setShowImportText] = useState(false);
  const [view, setView] = useState("overview"); // "overview" | "project"

  const rowToProject = (row) => ({ id: row.id, name: row.name, capacity: row.capacity, location: row.location, createdAt: row.created_at });

  // Initial load: full project list
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: true });
      if (!error && data) setProjects(data.map(rowToProject));
      setLoading(false);
    })();
  }, []);

  const loadProjectData = useCallback(async (id) => {
    try {
      const { data, error } = await supabase.from("project_data").select("*").eq("project_id", id).maybeSingle();
      if (error) throw error;
      if (data) {
        setProjectData((prev) => ({ ...prev, [id]: ensureFullProjectData({ upme: data.upme, energizacion: data.energizacion, cronograma: data.cronograma, presupuesto: data.presupuesto, pagos: data.pagos }) }));
      } else {
        const fresh = emptyProjectData();
        await supabase.from("project_data").insert({
          project_id: id, upme: fresh.upme, energizacion: fresh.energizacion, cronograma: fresh.cronograma, presupuesto: fresh.presupuesto, pagos: fresh.pagos, updated_by: user.id,
        });
        setProjectData((prev) => ({ ...prev, [id]: fresh }));
      }
    } catch {
      setProjectData((prev) => ({ ...prev, [id]: emptyProjectData() }));
    }
  }, [user.id]);

  // Load selected project's data when selection changes
  useEffect(() => {
    if (!selectedId) return;
    if (projectData[selectedId]) return;
    loadProjectData(selectedId);
  }, [selectedId, projectData, loadProjectData]);

  // Overview needs every project's data loaded
  useEffect(() => {
    if (view !== "overview") return;
    const missing = projects.filter((p) => !projectData[p.id]);
    missing.forEach((p) => loadProjectData(p.id));
  }, [view, projects, projectData, loadProjectData]);

  // Realtime: reflect teammates' changes without a manual refresh
  useEffect(() => {
    const channel = supabase
      .channel("crm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        supabase.from("projects").select("*").order("created_at", { ascending: true }).then(({ data }) => {
          if (data) setProjects(data.map(rowToProject));
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "project_data" }, (payload) => {
        const pid = payload.new?.project_id || payload.old?.project_id;
        if (!pid) return;
        supabase.from("project_data").select("*").eq("project_id", pid).maybeSingle().then(({ data }) => {
          if (data) setProjectData((prev) => ({ ...prev, [pid]: ensureFullProjectData(data) }));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const persistProjectData = useCallback(async (id, data) => {
    setSaveStatus("saving");
    const { error } = await supabase.from("project_data").upsert({
      project_id: id,
      upme: data.upme,
      energizacion: data.energizacion,
      cronograma: data.cronograma,
      presupuesto: data.presupuesto,
      pagos: data.pagos,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    });
    if (error) {
      setSaveError(true);
      setSaveStatus("idle");
    } else {
      setSaveStatus("saved");
      setLastSaved(new Date());
    }
  }, [user.id]);

  const saveNow = useCallback(async () => {
    if (selectedId && projectData[selectedId]) {
      await persistProjectData(selectedId, projectData[selectedId]);
    }
  }, [selectedId, projectData, persistProjectData]);

  const updateProjectData = (id, updater) => {
    setProjectData((prev) => {
      const current = prev[id] || emptyProjectData();
      const next = updater(current);
      persistProjectData(id, next);
      return { ...prev, [id]: next };
    });
  };

  const addProject = async (name, capacity, location) => {
    const { data, error } = await supabase.from("projects").insert({ name, capacity, location, created_by: user.id }).select().single();
    if (error || !data) { setSaveError(true); return; }
    const newProject = rowToProject(data);
    setProjects((prev) => [...prev, newProject]);
    const fresh = emptyProjectData();
    await supabase.from("project_data").insert({
      project_id: newProject.id, upme: fresh.upme, energizacion: fresh.energizacion, cronograma: fresh.cronograma, presupuesto: fresh.presupuesto, pagos: fresh.pagos, updated_by: user.id,
    });
    setProjectData((prev) => ({ ...prev, [newProject.id]: fresh }));
    setSelectedId(newProject.id);
    setView("project");
    setShowAddProject(false);
  };

  const updateProjectInfo = async (id, name, capacity, location) => {
    const { error } = await supabase.from("projects").update({ name, capacity, location }).eq("id", id);
    if (error) { setSaveError(true); return; }
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name, capacity, location } : p)));
  };

  const deleteProject = async (id) => {
    await supabase.from("projects").delete().eq("id", id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setProjectData((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (selectedId === id) setSelectedId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteProject(deleteTarget.id);
    setDeleteTarget(null);
  };

  // Real file download — works normally here (this is a regular website, not a sandboxed artifact)
  const exportData = async () => {
    const missing = projects.filter((p) => !projectData[p.id]);
    for (const p of missing) await loadProjectData(p.id);
    const bundle = { exportedAt: new Date().toISOString(), projects, projectData };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `control-parques-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFromBundle = async (bundle) => {
    if (!bundle.projects) throw new Error("formato inválido");
    for (const p of bundle.projects) {
      const { data: inserted, error } = await supabase
        .from("projects")
        .insert({ name: p.name, capacity: p.capacity, location: p.location, created_by: user.id })
        .select()
        .single();
      if (error || !inserted) continue;
      const pd = bundle.projectData?.[p.id] ? ensureFullProjectData(bundle.projectData[p.id]) : emptyProjectData();
      await supabase.from("project_data").upsert({
        project_id: inserted.id, upme: pd.upme, energizacion: pd.energizacion, cronograma: pd.cronograma, presupuesto: pd.presupuesto, pagos: pd.pagos, updated_by: user.id,
      });
    }
    const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: true });
    if (data) setProjects(data.map(rowToProject));
    setProjectData({});
    setView("overview");
  };

  const importData = async (file) => {
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      await importFromBundle(bundle);
    } catch {
      setSaveError(true);
    }
  };

  const importFromText = async (text) => {
    try {
      const bundle = JSON.parse(text);
      await importFromBundle(bundle);
      setShowImportText(false);
    } catch {
      setSaveError(true);
    }
  };

  const selected = projects.find((p) => p.id === selectedId);
  const data = projectData[selectedId];

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <Loader2 className="spin" size={28} color="#F5B942" />
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <GlobalStyle />
      <div className="no-print app-noprint" style={styles.noPrintWrap}>
        <Sidebar
          projects={projects}
          selectedId={selectedId}
          view={view}
          onOverview={() => setView("overview")}
          onSelect={(id) => {
            setSelectedId(id);
            setView("project");
            setTab("resumen");
          }}
          onAdd={() => setShowAddProject(true)}
          onDelete={(p) => setDeleteTarget({ id: p.id, name: p.name })}
          onEditProject={(p) => setEditingProject(p)}
          projectData={projectData}
          onExport={exportData}
          onImportFile={importData}
          onImportText={() => setShowImportText(true)}
          userEmail={user.email}
          onSignOut={() => supabase.auth.signOut()}
        />
        <main className="app-main" style={styles.main}>
          {projects.length === 0 ? (
            <EmptyState onAdd={() => setShowAddProject(true)} />
          ) : view === "overview" ? (
            <>
              <div style={styles.overviewHeader}>
                <h1 style={styles.h1}>Resumen general</h1>
                <div style={styles.headerMeta}>{projects.length} proyecto{projects.length === 1 ? "" : "s"} activos</div>
              </div>
              <div style={styles.content}>
                <ResumenGeneral projects={projects} projectData={projectData} onOpenProject={(id) => { setSelectedId(id); setView("project"); }} />
              </div>
            </>
          ) : !selected ? (
            <EmptyState onAdd={() => setShowAddProject(true)} />
          ) : (
            <>
              <Header
                project={selected}
                tab={tab}
                setTab={setTab}
                saveStatus={saveStatus}
                lastSaved={lastSaved}
                onSaveNow={saveNow}
                onExportPDF={() => window.print()}
              />
              <div style={styles.content}>
                {!data ? (
                  <div style={{ color: "#8B9AA3", padding: 40 }}>Cargando proyecto…</div>
                ) : tab === "resumen" ? (
                  <Resumen data={data} />
                ) : tab === "upme" ? (
                  <UpmeModule
                    data={data.upme}
                    onChange={(nextUpme) => updateProjectData(selectedId, (cur) => ({ ...cur, upme: nextUpme }))}
                  />
                ) : tab === "energizacion" ? (
                  <EnergizacionModule
                    data={data.energizacion}
                    onChange={(nextEner) => updateProjectData(selectedId, (cur) => ({ ...cur, energizacion: nextEner }))}
                  />
                ) : tab === "cronograma" ? (
                  <CronogramaModule
                    data={data.cronograma}
                    onChange={(nextCrono) => updateProjectData(selectedId, (cur) => ({ ...cur, cronograma: nextCrono }))}
                  />
                ) : tab === "presupuesto" ? (
                  <PresupuestoModule
                    data={data.presupuesto}
                    onChange={(nextPres) => updateProjectData(selectedId, (cur) => ({ ...cur, presupuesto: nextPres }))}
                  />
                ) : (
                  <PagosModule
                    data={data.pagos}
                    onChange={(nextPagos) => updateProjectData(selectedId, (cur) => ({ ...cur, pagos: nextPagos }))}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
      {selected && data && <PrintReport project={selected} data={data} />}
      {showAddProject && (
        <ProjectFormModal
          title="Nuevo proyecto"
          submitLabel="Crear proyecto"
          onClose={() => setShowAddProject(false)}
          onSave={addProject}
        />
      )}
      {editingProject && (
        <ProjectFormModal
          title="Editar proyecto"
          submitLabel="Guardar cambios"
          initial={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={(name, capacity, location) => {
            updateProjectInfo(editingProject.id, name, capacity, location);
            setEditingProject(null);
          }}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Eliminar proyecto"
          message={`¿Eliminar "${deleteTarget.name}" y todo su seguimiento? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
      {showImportText && (
        <ImportTextModal onClose={() => setShowImportText(false)} onImport={importFromText} />
      )}
      {saveError && (
        <div className="no-print" style={styles.saveError}>
          No se pudo guardar el último cambio. Verifica tu conexión.
          <button onClick={() => setSaveError(false)} style={styles.saveErrorClose}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ projects, selectedId, view, onOverview, onSelect, onAdd, onDelete, onEditProject, projectData, onExport, onImportFile, onImportText, userEmail, onSignOut }) {
  const fileInputRef = React.useRef(null);

  return (
    <aside className="app-sidebar" style={styles.sidebar}>
      <div style={styles.brand}>
        <Sun size={20} color="#F5B942" />
        <div>
          <div style={styles.brandTitle}>Control de Parques</div>
          <div style={styles.brandSub}>UPME · Energización</div>
        </div>
      </div>

      <button
        style={{ ...styles.overviewNavBtn, ...(view === "overview" ? styles.overviewNavBtnActive : {}) }}
        onClick={onOverview}
      >
        <LayoutGrid size={15} /> Resumen general
      </button>

      <button style={styles.addProjectBtn} onClick={onAdd}>
        <Plus size={15} /> Nuevo proyecto
      </button>

      <div style={styles.projectList}>
        {projects.length === 0 && (
          <div style={styles.noProjects}>Aún no hay proyectos registrados.</div>
        )}
        {projects.map((p) => {
          const d = projectData[p.id];
          const upmePct = d ? upmeProgress(d.upme) : 0;
          const enerPct = d ? energizacionProgress(d.energizacion) : 0;
          return (
            <div
              key={p.id}
              style={{
                ...styles.projectItem,
                ...(view === "project" && p.id === selectedId ? styles.projectItemActive : {}),
              }}
              onClick={() => onSelect(p.id)}
            >
              <div style={styles.projectItemTop}>
                <span style={styles.projectName}>{p.name}</span>
                <div style={{ display: "flex", gap: 2 }}>
                  <button
                    style={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditProject(p);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    style={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(p);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div style={styles.projectMeta}>
                {p.capacity ? `${p.capacity} MWp` : ""}{p.location ? ` · ${p.location}` : ""}
              </div>
              <MiniBar label="UPME" pct={upmePct} color="#4FA8D8" />
              <MiniBar label="Energización" pct={enerPct} color="#F5B942" />
            </div>
          );
        })}
      </div>

      <div style={styles.sidebarFooter}>
        <div style={styles.sharedNote}>
          Conectado como <strong>{userEmail}</strong> — todos los usuarios de este equipo ven y editan los mismos datos.
        </div>
        <div style={styles.footerBtnRow}>
          <button style={styles.footerBtn} onClick={onExport}>
            Exportar datos
          </button>
          <button style={styles.footerBtn} onClick={() => fileInputRef.current?.click()}>
            Importar archivo
          </button>
        </div>
        <button style={styles.footerBtnFull} onClick={onImportText}>
          Importar pegando texto
        </button>
        <button style={styles.footerBtnFull} onClick={onSignOut}>
          Cerrar sesión
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </aside>
  );
}

function MiniBar({ label, pct, color }) {
  return (
    <div style={styles.miniBarRow}>
      <span style={styles.miniBarLabel}>{label}</span>
      <div style={styles.miniBarTrack}>
        <div style={{ ...styles.miniBarFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={styles.miniBarPct}>{pct}%</span>
    </div>
  );
}

/* ---------------------------------------------------------------------
   Header + tabs
--------------------------------------------------------------------- */
function Header({ project, tab, setTab, saveStatus, lastSaved, onSaveNow, onExportPDF }) {
  return (
    <div style={styles.header}>
      <div>
        <h1 style={styles.h1}>{project.name}</h1>
        <div style={styles.headerMeta}>
          {project.capacity ? `${project.capacity} MWp` : ""}{project.location ? `  ·  ${project.location}` : ""}
        </div>
      </div>
      <div style={styles.headerRight}>
        <div style={styles.tabs}>
          <TabBtn active={tab === "resumen"} onClick={() => setTab("resumen")} icon={<MapPin size={14} />} label="Resumen" />
          <TabBtn active={tab === "upme"} onClick={() => setTab("upme")} icon={<FileCheck size={14} />} label="Radicación UPME" />
          <TabBtn active={tab === "energizacion"} onClick={() => setTab("energizacion")} icon={<Zap size={14} />} label="Energización" />
          <TabBtn active={tab === "cronograma"} onClick={() => setTab("cronograma")} icon={<Calendar size={14} />} label="Cronograma" />
          <TabBtn active={tab === "presupuesto"} onClick={() => setTab("presupuesto")} icon={<DollarSign size={14} />} label="Presupuesto" />
          <TabBtn active={tab === "pagos"} onClick={() => setTab("pagos")} icon={<Wallet size={14} />} label="Pagos" />
        </div>
        <div style={styles.headerActions}>
          <SaveIndicator status={saveStatus} lastSaved={lastSaved} onSaveNow={onSaveNow} />
          <button
            style={styles.pdfBtn}
            onClick={onExportPDF}
            title="Descarga un reporte HTML — ábrelo y usa Ctrl+P / Cmd+P para guardarlo como PDF"
          >
            <FileDown size={14} /> Exportar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ status, lastSaved, onSaveNow }) {
  const label =
    status === "saving" ? "Guardando…" : lastSaved ? `Guardado ${fmtTime(lastSaved)}` : "Guardado";
  return (
    <button style={styles.saveBtn} onClick={onSaveNow} title="Forzar guardado ahora">
      {status === "saving" ? (
        <Loader2 size={13} className="spin" />
      ) : (
        <Save size={13} color="#5FBF8F" />
      )}
      <span>{label}</span>
    </button>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button style={{ ...styles.tabBtn, ...(active ? styles.tabBtnActive : {}) }} onClick={onClick}>
      {icon} {label}
    </button>
  );
}

/* ---------------------------------------------------------------------
   Resumen
--------------------------------------------------------------------- */

function Resumen({ data }) {
  const upmePct = upmeProgress(data.upme);
  const enerPct = energizacionProgress(data.energizacion);
  const nextMs = nextEnergizacionMilestone(data.energizacion);
  const elapsed = daysBetween(data.energizacion.fechaInicio, todayISO());

  const currentUpmePhase = UPME_PHASES.find((p) => data.upme.phases[p.id].status !== "aprobado") || UPME_PHASES[UPME_PHASES.length - 1];

  const alerts = [];
  if (nextMs && nextMs.delayed) {
    alerts.push(`Energización: el hito "${nextMs.title}" está previsto para el día ${nextMs.day} y ya vas en el día ${elapsed}.`);
  }
  UPME_PHASES.forEach((p) => {
    const ph = data.upme.phases[p.id];
    if (ph.status === "aprobado" && ph.fechaRespuesta) {
      const vigenciaHasta = addYears(ph.fechaRespuesta, p.vigenciaAnios);
      const diasRestantes = daysBetween(todayISO(), vigenciaHasta);
      if (diasRestantes <= 60 && diasRestantes >= 0) {
        alerts.push(`UPME: la vigencia de "${p.label}" vence el ${fmtDate(vigenciaHasta)} (en ${diasRestantes} días).`);
      } else if (diasRestantes < 0) {
        alerts.push(`UPME: la vigencia de "${p.label}" venció el ${fmtDate(vigenciaHasta)}.`);
      }
    }
  });

  return (
    <div style={styles.resumenGrid}>
      <div style={styles.card}>
        <div style={styles.cardHead}>
          <FileCheck size={16} color="#4FA8D8" />
          <span>Radicación UPME</span>
        </div>
        <BigPct pct={upmePct} color="#4FA8D8" />
        <div style={styles.cardSub}>Fase actual: {currentUpmePhase.label}</div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHead}>
          <Zap size={16} color="#F5B942" />
          <span>Energización</span>
        </div>
        <BigPct pct={enerPct} color="#F5B942" />
        <div style={styles.cardSub}>
          Día {elapsed} de 200 · {nextMs ? `Siguiente: ${nextMs.title} (día ${nextMs.day})` : "Todas las actividades completadas"}
        </div>
      </div>

      <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
        <div style={styles.cardHead}>
          <AlertTriangle size={16} color="#E8A33D" />
          <span>Alertas</span>
        </div>
        {alerts.length === 0 ? (
          <div style={styles.cardSub}>Sin alertas por ahora.</div>
        ) : (
          <ul style={styles.alertList}>
            {alerts.map((a, i) => (
              <li key={i} style={styles.alertItem}>{a}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ResumenGeneral({ projects, projectData, onOpenProject }) {
  if (projects.length === 0) {
    return <div style={{ color: "#7A8A93", padding: 20 }}>Aún no hay proyectos.</div>;
  }

  const rows = projects.map((p) => {
    const d = projectData[p.id];
    if (!d) return { project: p, loading: true };
    const upmePct = upmeProgress(d.upme);
    const enerPct = energizacionProgress(d.energizacion);
    const nextMs = nextEnergizacionMilestone(d.energizacion);
    const elapsed = daysBetween(d.energizacion.fechaInicio, todayISO());
    const delayed = nextMs && nextMs.delayed;
    return { project: p, loading: false, upmePct, enerPct, nextMs, elapsed, delayed };
  });

  const loaded = rows.filter((r) => !r.loading);
  const avgUpme = loaded.length ? Math.round(loaded.reduce((s, r) => s + r.upmePct, 0) / loaded.length) : 0;
  const avgEner = loaded.length ? Math.round(loaded.reduce((s, r) => s + r.enerPct, 0) / loaded.length) : 0;
  const delayedCount = loaded.filter((r) => r.delayed).length;

  return (
    <div>
      <div style={styles.overviewStatRow}>
        <div style={styles.overviewStat}>
          <div style={styles.overviewStatNum}>{projects.length}</div>
          <div style={styles.overviewStatLabel}>Proyectos</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, color: "#4FA8D8" }}>{avgUpme}%</div>
          <div style={styles.overviewStatLabel}>Avance UPME promedio</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, color: "#F5B942" }}>{avgEner}%</div>
          <div style={styles.overviewStatLabel}>Avance energización promedio</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, color: delayedCount ? "#E2604F" : "#5FBF8F" }}>{delayedCount}</div>
          <div style={styles.overviewStatLabel}>Proyectos atrasados</div>
        </div>
      </div>

      <div style={styles.overviewTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={styles.ovTh}>Proyecto</th>
              <th style={styles.ovTh}>UPME</th>
              <th style={styles.ovTh}>Energización</th>
              <th style={styles.ovTh}>Día</th>
              <th style={styles.ovTh}>Siguiente hito</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project: p, loading, upmePct, enerPct, nextMs, elapsed, delayed }) => (
              <tr key={p.id} style={styles.ovRow} onClick={() => onOpenProject(p.id)}>
                <td style={styles.ovTdName}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={styles.ovTdMeta}>{p.capacity ? `${p.capacity} MWp` : ""}{p.location ? ` · ${p.location}` : ""}</div>
                </td>
                {loading ? (
                  <td colSpan={4} style={styles.ovTd}>Cargando…</td>
                ) : (
                  <>
                    <td style={styles.ovTd}><OvBar pct={upmePct} color="#4FA8D8" /></td>
                    <td style={styles.ovTd}><OvBar pct={enerPct} color="#F5B942" /></td>
                    <td style={styles.ovTd}>{elapsed} / 200</td>
                    <td style={{ ...styles.ovTd, color: delayed ? "#E2604F" : "#B9C4CA" }}>
                      {nextMs ? `${nextMs.title} (día ${nextMs.day})${delayed ? " · atrasado" : ""}` : "Completado"}
                    </td>
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

function OvBar({ pct, color }) {
  return (
    <div style={styles.ovBarWrap}>
      <div style={styles.ovBarTrack}>
        <div style={{ ...styles.ovBarFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ ...styles.ovBarPct, color }}>{pct}%</span>
    </div>
  );
}

function BigPct({ pct, color }) {
  return (
    <div style={styles.bigPctWrap}>
      <div style={styles.bigPctTrack}>
        <div style={{ ...styles.bigPctFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ ...styles.bigPctNum, color }}>{pct}%</span>
    </div>
  );
}

/* ---------------------------------------------------------------------
   UPME module
--------------------------------------------------------------------- */
function UpmeModule({ data, onChange }) {
  const [openPhase, setOpenPhase] = useState(UPME_PHASES[0].id);

  const setPhase = (phaseId, patch) => {
    onChange({
      ...data,
      phases: {
        ...data.phases,
        [phaseId]: { ...data.phases[phaseId], ...patch },
      },
    });
  };

  const toggleItem = (phaseId, itemIdx) => {
    const cur = data.phases[phaseId].checklist;
    const next = cur.map((v, i) => (i === itemIdx ? !v : v));
    setPhase(phaseId, { checklist: next });
  };

  return (
    <div>
      <div style={styles.timelineStrip}>
        {UPME_PHASES.map((p, i) => {
          const ph = data.phases[p.id];
          const pct = Math.round((ph.checklist.filter(Boolean).length / p.checklist.length) * 100);
          return (
            <React.Fragment key={p.id}>
              <div
                style={{ ...styles.phaseNode, ...(openPhase === p.id ? styles.phaseNodeActive : {}) }}
                onClick={() => setOpenPhase(p.id)}
              >
                <div style={styles.phaseNodeCircle(pct, statusColor(ph.status))}>
                  {ph.status === "aprobado" ? <CheckCircle2 size={16} /> : <span>{pct}%</span>}
                </div>
                <div style={styles.phaseNodeLabel}>{p.label}</div>
                <StatusPill status={ph.status} />
              </div>
              {i < UPME_PHASES.length - 1 && <div style={styles.timelineConnector} />}
            </React.Fragment>
          );
        })}
      </div>

      {UPME_PHASES.filter((p) => p.id === openPhase).map((p) => {
        const ph = data.phases[p.id];
        const vigenciaHasta = ph.fechaRespuesta ? addYears(ph.fechaRespuesta, p.vigenciaAnios) : null;
        return (
          <div key={p.id} style={styles.phaseDetail}>
            <div style={styles.phaseDetailHead}>
              <h3 style={styles.h3}>{p.label}</h3>
              <select
                value={ph.status}
                onChange={(e) => setPhase(p.id, { status: e.target.value })}
                style={styles.select}
              >
                <option value="no_iniciado">No iniciado</option>
                <option value="radicado">Radicado</option>
                <option value="incompleto">Incompleto (subsanación)</option>
                <option value="aprobado">Aprobado</option>
                <option value="rechazado">Rechazado</option>
              </select>
            </div>

            <div style={styles.dateRow}>
              <label style={styles.dateField}>
                <span>Fecha de radicación</span>
                <input
                  type="date"
                  value={ph.fechaRadicacion}
                  onChange={(e) => setPhase(p.id, { fechaRadicacion: e.target.value })}
                  style={styles.input}
                />
              </label>
              <label style={styles.dateField}>
                <span>Fecha respuesta UPME</span>
                <input
                  type="date"
                  value={ph.fechaRespuesta}
                  onChange={(e) => setPhase(p.id, { fechaRespuesta: e.target.value })}
                  style={styles.input}
                />
              </label>
              <div style={styles.dateField}>
                <span>Plazo de respuesta UPME</span>
                <div style={styles.staticValue}>{p.plazoRespuestaDias} días hábiles</div>
              </div>
              {vigenciaHasta && (
                <div style={styles.dateField}>
                  <span>Vigente hasta</span>
                  <div style={styles.staticValue}>{fmtDate(vigenciaHasta)}</div>
                </div>
              )}
            </div>

            <div style={styles.checklist}>
              {p.checklist.map((item, i) => (
                <label key={i} style={styles.checkItem} onClick={() => toggleItem(p.id, i)}>
                  {ph.checklist[i] ? <CheckCircle2 size={16} color="#5FBF8F" /> : <Circle size={16} color="#5A6870" />}
                  <span style={ph.checklist[i] ? styles.checkTextDone : styles.checkText}>{item}</span>
                </label>
              ))}
            </div>

            <textarea
              placeholder="Notas de esta fase…"
              value={ph.notas}
              onChange={(e) => setPhase(p.id, { notas: e.target.value })}
              style={styles.textarea}
            />
          </div>
        );
      })}
    </div>
  );
}

function statusColor(status) {
  return { no_iniciado: "#5A6870", radicado: "#4FA8D8", incompleto: "#E8A33D", aprobado: "#5FBF8F", rechazado: "#E2604F" }[status];
}
function StatusPill({ status }) {
  const map = {
    no_iniciado: ["No iniciado", "#5A6870"],
    radicado: ["Radicado", "#4FA8D8"],
    incompleto: ["Subsanación", "#E8A33D"],
    aprobado: ["Aprobado", "#5FBF8F"],
    rechazado: ["Rechazado", "#E2604F"],
  };
  const [text, color] = map[status];
  return <span style={{ ...styles.pill, color, borderColor: color }}>{text}</span>;
}

/* ---------------------------------------------------------------------
   Energización module
--------------------------------------------------------------------- */
function EnergizacionModule({ data, onChange }) {
  const elapsed = daysBetween(data.fechaInicio, todayISO());
  let cursor = 0;

  const toggleDone = (idx) => {
    const next = data.milestones.map((m, i) =>
      i === idx ? { ...m, done: !m.done, fecha: !m.done ? todayISO() : "" } : m
    );
    onChange({ ...data, milestones: next });
  };

  const overallPct = energizacionProgress(data);

  return (
    <div>
      <div style={styles.enerHeadRow}>
        <label style={styles.dateField}>
          <span>Fecha de inicio del proceso (Día 0)</span>
          <input
            type="date"
            value={data.fechaInicio}
            onChange={(e) => onChange({ ...data, fechaInicio: e.target.value })}
            style={styles.input}
          />
        </label>
        <div style={styles.dayCounter}>
          Día <strong>{elapsed}</strong> de 200
        </div>
        <div style={styles.dayCounter}>
          Avance ponderado por costo: <strong style={{ color: "#F5B942" }}>{overallPct}%</strong>
        </div>
        <Legend />
      </div>

      {ENERGIZACION_GROUPS.map((g) => {
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
                <span style={{ ...styles.wbsPct, color: groupPct === 100 ? "#5FBF8F" : style.fg }}>
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
                const state = data.milestones[i];
                const delayed = !state.done && elapsed > it.day;
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.wbsItemRow,
                      borderLeftColor: state.done ? "#5FBF8F" : delayed ? "#E2604F" : "#2A3339",
                    }}
                  >
                    <button
                      style={styles.wbsCheck}
                      onClick={() => toggleDone(i)}
                      aria-label={state.done ? "Marcar como pendiente" : "Marcar como completado"}
                    >
                      {state.done ? (
                        <CheckCircle2 size={17} color="#5FBF8F" />
                      ) : delayed ? (
                        <AlertTriangle size={17} color="#E2604F" />
                      ) : (
                        <Circle size={17} color="#5A6870" />
                      )}
                    </button>
                    <span style={state.done ? styles.wbsItemTitleDone : styles.wbsItemTitle}>{it.title}</span>
                    <span style={styles.wbsItemDay}>Día {it.day}</span>
                    <span style={styles.wbsItemCost}>{it.cost}</span>
                    {state.done ? (
                      <span style={styles.wbsItemDate}>{fmtDate(state.fecha)}</span>
                    ) : (
                      <span style={styles.wbsItemDatePlaceholder}>—</span>
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

function CronogramaModule({ data, onChange }) {
  const [newTask, setNewTask] = useState({ nombre: "", fechaInicio: "", fechaFin: "", peso: "" });
  const [newSeg, setNewSeg] = useState({ fecha: todayISO(), avance: "" });

  const pesoTotal = cronogramaPesoTotal(data.tasks);
  const curvaData = buildCurvaSData(data);
  const lastReal = [...data.seguimiento].filter((s) => s.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();

  const addTask = () => {
    if (!newTask.nombre.trim() || !newTask.fechaInicio || !newTask.fechaFin || newTask.peso === "") return;
    const task = { id: uid(), nombre: newTask.nombre.trim(), fechaInicio: newTask.fechaInicio, fechaFin: newTask.fechaFin, peso: Number(newTask.peso) };
    onChange({ ...data, tasks: [...data.tasks, task] });
    setNewTask({ nombre: "", fechaInicio: "", fechaFin: "", peso: "" });
  };
  const updateTask = (id, patch) => onChange({ ...data, tasks: data.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const deleteTask = (id) => onChange({ ...data, tasks: data.tasks.filter((t) => t.id !== id) });

  const addSeg = () => {
    if (!newSeg.fecha || newSeg.avance === "") return;
    const entry = { id: uid(), fecha: newSeg.fecha, avance: Number(newSeg.avance) };
    onChange({ ...data, seguimiento: [...data.seguimiento, entry] });
    setNewSeg({ fecha: todayISO(), avance: "" });
  };
  const updateSeg = (id, patch) => onChange({ ...data, seguimiento: data.seguimiento.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const deleteSeg = (id) => onChange({ ...data, seguimiento: data.seguimiento.filter((s) => s.id !== id) });

  const sortedTasks = [...data.tasks].sort((a, b) => (a.fechaInicio || "").localeCompare(b.fechaInicio || ""));
  const sortedSeg = [...data.seguimiento].sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <div>
      <div style={styles.cronoHead}>
        <h3 style={styles.h3}>Cronograma de obra</h3>
        <span style={{ ...styles.pesoTotalTag, color: Math.round(pesoTotal) === 100 ? "#5FBF8F" : "#E8A33D" }}>
          peso total: {pesoTotal}% {Math.round(pesoTotal) !== 100 ? "(debería sumar 100%)" : ""}
        </span>
      </div>

      <div style={styles.cronoTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={styles.ovTh}>Actividad</th>
              <th style={styles.ovTh}>Inicio</th>
              <th style={styles.ovTh}>Fin</th>
              <th style={styles.ovTh}>Peso %</th>
              <th style={styles.ovTh}></th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.map((t) => (
              <tr key={t.id}>
                <td style={styles.ovTd}>
                  <input style={styles.miniInput} value={t.nombre} onChange={(e) => updateTask(t.id, { nombre: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <input type="date" style={styles.miniInput} value={t.fechaInicio} onChange={(e) => updateTask(t.id, { fechaInicio: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <input type="date" style={styles.miniInput} value={t.fechaFin} onChange={(e) => updateTask(t.id, { fechaFin: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <input type="number" style={{ ...styles.miniInput, width: 60 }} value={t.peso} onChange={(e) => updateTask(t.id, { peso: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <button style={styles.rowDeleteBtn} onClick={() => deleteTask(t.id)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={styles.ovTd}>
                <input style={styles.miniInput} placeholder="Nueva actividad" value={newTask.nombre} onChange={(e) => setNewTask({ ...newTask, nombre: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <input type="date" style={styles.miniInput} value={newTask.fechaInicio} onChange={(e) => setNewTask({ ...newTask, fechaInicio: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <input type="date" style={styles.miniInput} value={newTask.fechaFin} onChange={(e) => setNewTask({ ...newTask, fechaFin: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <input type="number" style={{ ...styles.miniInput, width: 60 }} placeholder="%" value={newTask.peso} onChange={(e) => setNewTask({ ...newTask, peso: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <button style={styles.addRowBtn} onClick={addTask}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={styles.cronoHead}>
        <h3 style={styles.h3}>Curva S de construcción</h3>
        {lastReal && <span style={styles.pesoTotalTag}>último avance real: {lastReal.avance}% ({fmtDate(lastReal.fecha)})</span>}
      </div>

      {curvaData.length === 0 ? (
        <div style={{ color: "#7A8A93", fontSize: 13, padding: "10px 0 20px" }}>
          Agrega actividades con fechas para ver la línea base, y registros de avance real para ver la línea de seguimiento.
        </div>
      ) : (
        <div style={styles.chartBox}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={curvaData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232D33" />
              <XAxis dataKey="label" tick={{ fill: "#7A8A93", fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: "#7A8A93", fontSize: 10 }} unit="%" />
              <Tooltip contentStyle={{ background: "#171E23", border: "1px solid #2A3339", fontSize: 12, color: "#E8EDEF" }} />
              <RLegend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="base" name="Línea base" stroke="#4FA8D8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="real" name="Seguimiento real" stroke="#F5B942" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={styles.cronoTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={styles.ovTh}>Fecha de corte</th>
              <th style={styles.ovTh}>Avance real acumulado</th>
              <th style={styles.ovTh}></th>
            </tr>
          </thead>
          <tbody>
            {sortedSeg.map((s) => (
              <tr key={s.id}>
                <td style={styles.ovTd}>
                  <input type="date" style={styles.miniInput} value={s.fecha} onChange={(e) => updateSeg(s.id, { fecha: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <input type="number" style={{ ...styles.miniInput, width: 70 }} value={s.avance} onChange={(e) => updateSeg(s.id, { avance: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <button style={styles.rowDeleteBtn} onClick={() => deleteSeg(s.id)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={styles.ovTd}>
                <input type="date" style={styles.miniInput} value={newSeg.fecha} onChange={(e) => setNewSeg({ ...newSeg, fecha: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <input type="number" style={{ ...styles.miniInput, width: 70 }} placeholder="%" value={newSeg.avance} onChange={(e) => setNewSeg({ ...newSeg, avance: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <button style={styles.addRowBtn} onClick={addSeg}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PresupuestoModule({ data, onChange }) {
  const [activeSub, setActiveSub] = useState("base"); // "base" | "ejecucion"
  const totals = presupuestoTotals(data);

  const baseByCat = groupPresupuestoItems(data.base);
  const ejecByCat = groupPresupuestoItems(data.ejecucion);
  const catNames = Array.from(new Set([...baseByCat.map((g) => g.categoria), ...ejecByCat.map((g) => g.categoria)]));
  const chartData = catNames.map((cat) => ({
    name: cat.length > 16 ? cat.slice(0, 16) + "…" : cat,
    Base: presupuestoListTotal((baseByCat.find((g) => g.categoria === cat) || {}).items),
    Ejecución: presupuestoListTotal((ejecByCat.find((g) => g.categoria === cat) || {}).items),
  }));

  const currentItems = activeSub === "base" ? data.base : data.ejecucion;
  const setCurrentItems = (nextItems) => onChange({ ...data, [activeSub]: nextItems });

  return (
    <div>
      <div style={styles.overviewStatRow}>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: "#4FA8D8" }}>{fmtMoney(totals.base)}</div>
          <div style={styles.overviewStatLabel}>Presupuesto base</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: "#F5B942" }}>{fmtMoney(totals.ejecutado)}</div>
          <div style={styles.overviewStatLabel}>Presupuesto ejecución</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: totals.diferencia > 0 ? "#E2604F" : "#5FBF8F" }}>
            {totals.diferencia > 0 ? "+" : ""}{fmtMoney(totals.diferencia)}
          </div>
          <div style={styles.overviewStatLabel}>Diferencia</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, color: totals.pct > 100 ? "#E2604F" : "#5FBF8F" }}>{totals.pct}%</div>
          <div style={styles.overviewStatLabel}>% ejecutado vs. base</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div style={styles.chartBox}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232D33" />
              <XAxis dataKey="name" tick={{ fill: "#7A8A93", fontSize: 10 }} />
              <YAxis tick={{ fill: "#7A8A93", fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
              <Tooltip
                contentStyle={{ background: "#171E23", border: "1px solid #2A3339", fontSize: 12, color: "#E8EDEF" }}
                formatter={(v) => fmtMoney(v)}
              />
              <RLegend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Base" fill="#4FA8D8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Ejecución" fill="#F5B942" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={styles.presSubTabs}>
        <button
          style={{ ...styles.presSubTabBtn, ...(activeSub === "base" ? styles.presSubTabBtnActive : {}) }}
          onClick={() => setActiveSub("base")}
        >
          Presupuesto base
        </button>
        <button
          style={{ ...styles.presSubTabBtn, ...(activeSub === "ejecucion" ? styles.presSubTabBtnActive : {}) }}
          onClick={() => setActiveSub("ejecucion")}
        >
          Presupuesto de ejecución
        </button>
      </div>

      <PresupuestoTable items={currentItems} onChange={setCurrentItems} />
    </div>
  );
}

function PresupuestoTable({ items, onChange }) {
  const [newItem, setNewItem] = useState({
    item: "", categoria: "", descripcion: "", cantidad: "", unidad: "",
    valorUnitario: "", ivaPct: "",
  });
  const [showPaste, setShowPaste] = useState(false);

  const grouped = groupPresupuestoItems(items);

  const updateItem = (id, patch) => {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const deleteItem = (id) => onChange(items.filter((it) => it.id !== id));
  const addItem = () => {
    if (!newItem.descripcion.trim()) return;
    const item = {
      id: uid(),
      item: newItem.item.trim(),
      categoria: newItem.categoria.trim() || "Sin categoría",
      descripcion: newItem.descripcion.trim(),
      cantidad: Number(newItem.cantidad) || 0,
      unidad: newItem.unidad.trim(),
      valorUnitario: Number(newItem.valorUnitario) || 0,
      ivaPct: Number(newItem.ivaPct) || 0,
    };
    onChange([...items, item]);
    setNewItem({ item: "", categoria: "", descripcion: "", cantidad: "", unidad: "", valorUnitario: "", ivaPct: "" });
  };

  return (
    <div>
      <div style={styles.pasteBtnRow}>
        <button style={styles.pasteBtn} onClick={() => setShowPaste(true)}>
          <ClipboardPaste size={14} /> Pegar desde Excel
        </button>
      </div>
      {showPaste && (
        <PastePresupuestoModal
          onClose={() => setShowPaste(false)}
          onImport={(newItems) => {
            onChange([...items, ...newItems]);
            setShowPaste(false);
          }}
        />
      )}
      <div style={styles.cronoTableWrap}>
      <table style={styles.overviewTable}>
        <thead>
          <tr>
            <th style={styles.ovTh}>Ítem</th>
            <th style={styles.ovTh}>Descripción</th>
            <th style={styles.ovTh}>Cant.</th>
            <th style={styles.ovTh}>Unidad</th>
            <th style={styles.ovTh}>Valor unit. (sin IVA)</th>
            <th style={styles.ovTh}>IVA %</th>
            <th style={styles.ovTh}>Valor unit. (con IVA)</th>
            <th style={styles.ovTh}>Valor total</th>
            <th style={styles.ovTh}>IVA recuperable</th>
            <th style={styles.ovTh}></th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((group) => {
            const groupTotal = presupuestoListTotal(group.items);
            return (
              <React.Fragment key={group.categoria}>
                <tr>
                  <td colSpan={7} style={styles.presGroupRow}>{group.categoria}</td>
                  <td style={styles.presGroupRow}>{fmtMoney(groupTotal)}</td>
                  <td style={styles.presGroupRow} colSpan={2}></td>
                </tr>
                {group.items.map((it) => {
                  const calc = calcPresupuestoItem(it);
                  return (
                    <tr key={it.id}>
                      <td style={styles.ovTd}>
                        <input style={{ ...styles.miniInput, width: 56 }} value={it.item} onChange={(e) => updateItem(it.id, { item: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>
                        <input style={styles.miniInput} value={it.descripcion} onChange={(e) => updateItem(it.id, { descripcion: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>
                        <input type="number" style={{ ...styles.miniInput, width: 64 }} value={it.cantidad} onChange={(e) => updateItem(it.id, { cantidad: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>
                        <input style={{ ...styles.miniInput, width: 64 }} value={it.unidad} onChange={(e) => updateItem(it.id, { unidad: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>
                        <input type="number" style={styles.miniInput} value={it.valorUnitario} onChange={(e) => updateItem(it.id, { valorUnitario: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>
                        <input type="number" style={{ ...styles.miniInput, width: 56 }} value={it.ivaPct} onChange={(e) => updateItem(it.id, { ivaPct: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>{fmtMoney(calc.valorUnitarioConIva)}</td>
                      <td style={{ ...styles.ovTd, fontWeight: 600 }}>{fmtMoney(calc.valorTotal)}</td>
                      <td style={styles.ovTd}>{fmtMoney(calc.ivaRecuperable)}</td>
                      <td style={styles.ovTd}>
                        <button style={styles.rowDeleteBtn} onClick={() => deleteItem(it.id)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
          <tr>
            <td style={styles.ovTd}>
              <input style={{ ...styles.miniInput, width: 56 }} placeholder="1.1" value={newItem.item} onChange={(e) => setNewItem({ ...newItem, item: e.target.value })} />
            </td>
            <td style={styles.ovTd}>
              <input style={styles.miniInput} placeholder="Descripción" value={newItem.descripcion} onChange={(e) => setNewItem({ ...newItem, descripcion: e.target.value })} />
            </td>
            <td style={styles.ovTd}>
              <input type="number" style={{ ...styles.miniInput, width: 64 }} placeholder="0" value={newItem.cantidad} onChange={(e) => setNewItem({ ...newItem, cantidad: e.target.value })} />
            </td>
            <td style={styles.ovTd}>
              <input style={{ ...styles.miniInput, width: 64 }} placeholder="UND" value={newItem.unidad} onChange={(e) => setNewItem({ ...newItem, unidad: e.target.value })} />
            </td>
            <td style={styles.ovTd}>
              <input type="number" style={styles.miniInput} placeholder="$" value={newItem.valorUnitario} onChange={(e) => setNewItem({ ...newItem, valorUnitario: e.target.value })} />
            </td>
            <td style={styles.ovTd}>
              <input type="number" style={{ ...styles.miniInput, width: 56 }} placeholder="%" value={newItem.ivaPct} onChange={(e) => setNewItem({ ...newItem, ivaPct: e.target.value })} />
            </td>
            <td style={styles.ovTd} colSpan={2}>
              <input style={styles.miniInput} placeholder="Categoría (ej. Equipos principales)" value={newItem.categoria} onChange={(e) => setNewItem({ ...newItem, categoria: e.target.value })} />
            </td>
            <td style={styles.ovTd}></td>
            <td style={styles.ovTd}>
              <button style={styles.addRowBtn} onClick={addItem}><Plus size={14} /></button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}


function PagosModule({ data, onChange }) {
  const [newOrden, setNewOrden] = useState({ numero: "", proveedor: "", descripcion: "", valorTotal: "" });
  const [openId, setOpenId] = useState(null);
  const [newPago, setNewPago] = useState({ fecha: todayISO(), valor: "", concepto: "" });
  const totals = pagosTotals(data);

  const addOrden = () => {
    if (!newOrden.numero.trim() || newOrden.valorTotal === "") return;
    const orden = {
      id: uid(),
      numero: newOrden.numero.trim(),
      proveedor: newOrden.proveedor.trim(),
      descripcion: newOrden.descripcion.trim(),
      valorTotal: Number(newOrden.valorTotal) || 0,
      pagos: [],
    };
    onChange({ ...data, ordenes: [...data.ordenes, orden] });
    setNewOrden({ numero: "", proveedor: "", descripcion: "", valorTotal: "" });
    setOpenId(orden.id);
  };
  const updateOrden = (id, patch) => {
    onChange({ ...data, ordenes: data.ordenes.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  };
  const deleteOrden = (id) => onChange({ ...data, ordenes: data.ordenes.filter((o) => o.id !== id) });

  const addPago = (ordenId) => {
    if (!newPago.fecha || newPago.valor === "") return;
    const pago = { id: uid(), fecha: newPago.fecha, valor: Number(newPago.valor) || 0, concepto: newPago.concepto.trim() };
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) => (o.id === ordenId ? { ...o, pagos: [...o.pagos, pago] } : o)),
    });
    setNewPago({ fecha: todayISO(), valor: "", concepto: "" });
  };
  const deletePago = (ordenId, pagoId) => {
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) => (o.id === ordenId ? { ...o, pagos: o.pagos.filter((p) => p.id !== pagoId) } : o)),
    });
  };
  const updatePago = (ordenId, pagoId, patch) => {
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) =>
        o.id === ordenId ? { ...o, pagos: o.pagos.map((p) => (p.id === pagoId ? { ...p, ...patch } : p)) } : o
      ),
    });
  };

  return (
    <div>
      <div style={styles.overviewStatRow}>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18 }}>{fmtMoney(totals.totalOrdenes)}</div>
          <div style={styles.overviewStatLabel}>Total en órdenes de servicio</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: "#5FBF8F" }}>{fmtMoney(totals.totalPagado)}</div>
          <div style={styles.overviewStatLabel}>Total pagado</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: totals.totalSaldo > 0 ? "#E8A33D" : "#5FBF8F" }}>{fmtMoney(totals.totalSaldo)}</div>
          <div style={styles.overviewStatLabel}>Saldo pendiente</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={styles.overviewStatNum}>{data.ordenes.length}</div>
          <div style={styles.overviewStatLabel}>Órdenes de servicio</div>
        </div>
      </div>

      <div style={styles.cronoTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={styles.ovTh}>Orden de servicio</th>
              <th style={styles.ovTh}>Concepto / Descripción</th>
              <th style={styles.ovTh}>Proveedor</th>
              <th style={styles.ovTh}>Valor total</th>
              <th style={styles.ovTh}>Pagado / Saldo</th>
              <th style={styles.ovTh}></th>
            </tr>
          </thead>
          <tbody>
            {data.ordenes.map((o) => {
              const pagado = ordenPagado(o);
              const saldo = ordenSaldo(o);
              const pct = o.valorTotal ? Math.min(100, Math.round((pagado / o.valorTotal) * 100)) : 0;
              const isOpen = openId === o.id;
              return (
                <React.Fragment key={o.id}>
                  <tr style={styles.ovRow} onClick={() => setOpenId(isOpen ? null : o.id)}>
                    <td style={styles.ovTdName} onClick={(e) => e.stopPropagation()}>
                      <input
                        style={{ ...styles.miniInput, fontWeight: 600 }}
                        value={o.numero}
                        onChange={(e) => updateOrden(o.id, { numero: e.target.value })}
                      />
                    </td>
                    <td style={styles.ovTd} onClick={(e) => e.stopPropagation()}>
                      <input
                        style={styles.miniInput}
                        placeholder="Concepto de la orden"
                        value={o.descripcion || ""}
                        onChange={(e) => updateOrden(o.id, { descripcion: e.target.value })}
                      />
                    </td>
                    <td style={styles.ovTd} onClick={(e) => e.stopPropagation()}>
                      <input
                        style={styles.miniInput}
                        placeholder="Proveedor"
                        value={o.proveedor || ""}
                        onChange={(e) => updateOrden(o.id, { proveedor: e.target.value })}
                      />
                    </td>
                    <td style={styles.ovTd} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        style={styles.miniInput}
                        value={o.valorTotal}
                        onChange={(e) => updateOrden(o.id, { valorTotal: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td style={styles.ovTd}>
                      <OvBar pct={pct} color={saldo <= 0 ? "#5FBF8F" : "#F5B942"} />
                      <div style={{ fontSize: 10.5, color: "#7A8A93", marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtMoney(pagado)} pagado · saldo {fmtMoney(saldo)}
                      </div>
                    </td>
                    <td style={styles.ovTd}>
                      <button style={styles.rowDeleteBtn} onClick={(e) => { e.stopPropagation(); deleteOrden(o.id); }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ ...styles.ovTd, background: "#12181C" }}>
                        <div style={{ padding: "6px 4px" }}>
                          <table style={styles.overviewTable}>
                            <thead>
                              <tr>
                                <th style={styles.ovTh}>Fecha de pago</th>
                                <th style={styles.ovTh}>Valor</th>
                                <th style={styles.ovTh}>Concepto</th>
                                <th style={styles.ovTh}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.pagos.map((p) => (
                                <tr key={p.id}>
                                  <td style={styles.ovTd}>
                                    <input
                                      type="date"
                                      style={styles.miniInput}
                                      value={p.fecha}
                                      onChange={(e) => updatePago(o.id, p.id, { fecha: e.target.value })}
                                    />
                                  </td>
                                  <td style={styles.ovTd}>
                                    <input
                                      type="number"
                                      style={styles.miniInput}
                                      value={p.valor}
                                      onChange={(e) => updatePago(o.id, p.id, { valor: Number(e.target.value) || 0 })}
                                    />
                                  </td>
                                  <td style={styles.ovTd}>
                                    <input
                                      style={styles.miniInput}
                                      placeholder="Concepto"
                                      value={p.concepto || ""}
                                      onChange={(e) => updatePago(o.id, p.id, { concepto: e.target.value })}
                                    />
                                  </td>
                                  <td style={styles.ovTd}>
                                    <button style={styles.rowDeleteBtn} onClick={() => deletePago(o.id, p.id)}><Trash2 size={13} /></button>
                                  </td>
                                </tr>
                              ))}
                              <tr>
                                <td style={styles.ovTd}>
                                  <input type="date" style={styles.miniInput} value={newPago.fecha} onChange={(e) => setNewPago({ ...newPago, fecha: e.target.value })} />
                                </td>
                                <td style={styles.ovTd}>
                                  <input type="number" style={styles.miniInput} placeholder="$" value={newPago.valor} onChange={(e) => setNewPago({ ...newPago, valor: e.target.value })} />
                                </td>
                                <td style={styles.ovTd}>
                                  <input style={styles.miniInput} placeholder="Concepto (opcional)" value={newPago.concepto} onChange={(e) => setNewPago({ ...newPago, concepto: e.target.value })} />
                                </td>
                                <td style={styles.ovTd}>
                                  <button style={styles.addRowBtn} onClick={() => addPago(o.id)}><Plus size={14} /></button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            <tr>
              <td style={styles.ovTd}>
                <input style={styles.miniInput} placeholder="N.° de orden" value={newOrden.numero} onChange={(e) => setNewOrden({ ...newOrden, numero: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <input style={styles.miniInput} placeholder="Concepto de la orden" value={newOrden.descripcion} onChange={(e) => setNewOrden({ ...newOrden, descripcion: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <input style={styles.miniInput} placeholder="Proveedor" value={newOrden.proveedor} onChange={(e) => setNewOrden({ ...newOrden, proveedor: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <input type="number" style={styles.miniInput} placeholder="$" value={newOrden.valorTotal} onChange={(e) => setNewOrden({ ...newOrden, valorTotal: e.target.value })} />
              </td>
              <td style={styles.ovTd}></td>
              <td style={styles.ovTd}>
                <button style={styles.addRowBtn} onClick={addOrden}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div style={styles.legend}>
      {Object.entries(CAT_STYLE).map(([k, v]) => (
        <span key={k} style={{ ...styles.legendItem, color: v.fg }}>
          ● {v.label}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------
   Add project modal
--------------------------------------------------------------------- */
function ProjectFormModal({ onClose, onSave, initial, title, submitLabel }) {
  const [name, setName] = useState(initial?.name || "");
  const [capacity, setCapacity] = useState(initial?.capacity || "");
  const [location, setLocation] = useState(initial?.location || "");

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>{title}</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <label style={styles.modalField}>
          <span>Nombre del proyecto</span>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Filigrana 9.9 MWp" autoFocus />
        </label>
        <label style={styles.modalField}>
          <span>Capacidad (MWp)</span>
          <input style={styles.input} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Ej. 9.9" />
        </label>
        <label style={styles.modalField}>
          <span>Ubicación</span>
          <input style={styles.input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej. Cesar" />
        </label>
        <button
          style={{ ...styles.addProjectBtn, marginTop: 8, opacity: name.trim() ? 1 : 0.5 }}
          disabled={!name.trim()}
          onClick={() => onSave(name.trim(), capacity.trim(), location.trim())}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, onCancel, onConfirm }) {
  return (
    <div style={styles.modalOverlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>{title}</h3>
          <button style={styles.iconBtn} onClick={onCancel}><X size={16} /></button>
        </div>
        <p style={styles.confirmMsg}>{message}</p>
        <div style={styles.confirmBtnRow}>
          <button style={styles.confirmCancelBtn} onClick={onCancel}>Cancelar</button>
          <button style={styles.confirmDangerBtn} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ExportModal({ title, filename, content, isHTML, onClose }) {
  const [copied, setCopied] = useState(false);
  const textareaRef = React.useRef(null);

  useEffect(() => {
    // Auto-select all text so a manual Ctrl/Cmd+C also works as a fallback
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      textareaRef.current?.focus();
      textareaRef.current?.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Selection remains for the person to copy manually with Ctrl/Cmd+C
      }
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.exportModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>{title}</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>
          La descarga automática de archivos no está disponible aquí. Copia el contenido y pégalo en un
          archivo nuevo llamado <strong>{filename}</strong> {isHTML ? "usando el Bloc de notas (o similar) — luego ábrelo y usa Ctrl+P / Cmd+P para guardarlo como PDF." : "usando el Bloc de notas (o similar)."}
        </p>
        <button style={styles.copyBtn} onClick={copy}>
          {copied ? <Check size={14} color="#5FBF8F" /> : <Copy size={14} />}
          {copied ? "Copiado" : "Copiar al portapapeles"}
        </button>
        <textarea ref={textareaRef} readOnly value={content} style={styles.exportTextarea} onFocus={(e) => e.target.select()} />
      </div>
    </div>
  );
}

function ImportTextModal({ onClose, onImport }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(false);

  const handleImport = () => {
    try {
      JSON.parse(text);
      setError(false);
      onImport(text);
    } catch {
      setError(true);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.exportModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Importar pegando texto</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>Pega aquí el contenido de un respaldo JSON exportado antes.</p>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setError(false); }}
          placeholder='{"projects": [...], "projectData": {...}}'
          style={styles.exportTextarea}
        />
        {error && <div style={styles.importError}>Ese texto no es un JSON de respaldo válido.</div>}
        <button style={{ ...styles.addProjectBtn, marginTop: 10, opacity: text.trim() ? 1 : 0.5 }} disabled={!text.trim()} onClick={handleImport}>
          Importar
        </button>
      </div>
    </div>
  );
}

function PastePresupuestoModal({ onClose, onImport }) {
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

function EmptyState({ onAdd }) {
  return (
    <div style={styles.emptyState}>
      <Sun size={40} color="#F5B942" />
      <h2 style={styles.h2}>Aún no tienes proyectos</h2>
      <p style={styles.emptyP}>Crea tu primer parque solar para empezar a llevar el seguimiento de radicación UPME y energización.</p>
      <button style={styles.addProjectBtn} onClick={onAdd}><Plus size={15} /> Nuevo proyecto</button>
    </div>
  );
}

/* ---------------------------------------------------------------------
   Printable report (used for "Exportar PDF" via window.print)
--------------------------------------------------------------------- */
const pr = {
  page: { display: "none" },
  wrap: { background: "#fff", color: "#1A1A1A", fontFamily: "Arial, Helvetica, sans-serif", padding: "24px 30px", fontSize: 12 },
  h1: { fontSize: 20, margin: "0 0 2px", fontWeight: 700 },
  meta: { fontSize: 11, color: "#555", marginBottom: 4 },
  genAt: { fontSize: 10, color: "#888", marginBottom: 18 },
  h2: { fontSize: 15, fontWeight: 700, margin: "22px 0 4px", borderBottom: "2px solid #1A1A1A", paddingBottom: 4 },
  bigStat: { fontSize: 13, fontWeight: 700, margin: "4px 0 14px" },
  phaseBox: { border: "1px solid #ccc", borderRadius: 6, padding: "10px 14px", marginBottom: 10, breakInside: "avoid" },
  phaseHead: { display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12.5, marginBottom: 4 },
  phaseMeta: { fontSize: 10.5, color: "#555", marginBottom: 6 },
  checkRow: { fontSize: 11, padding: "2px 0" },
  groupBox: { marginBottom: 14, breakInside: "avoid" },
  groupHead: { display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12, background: "#f0f0f0", padding: "5px 10px", borderRadius: 4 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 10.5, marginTop: 4 },
  th: { textAlign: "left", padding: "3px 8px", borderBottom: "1px solid #ccc", color: "#555", fontWeight: 600 },
  td: { padding: "3px 8px", borderBottom: "1px solid #eee" },
};

function PrintReport({ project, data }) {
  const upmePct = upmeProgress(data.upme);
  const enerPct = energizacionProgress(data.energizacion);
  const now = new Date();

  return (
    <div className="print-only" style={pr.page}>
      <div style={pr.wrap}>
        <h1 style={pr.h1}>{project.name}</h1>
        <div style={pr.meta}>
          {project.capacity ? `${project.capacity} MWp` : ""}{project.location ? `  ·  ${project.location}` : ""}
        </div>
        <div style={pr.genAt}>Reporte generado el {fmtDateTime(now)}</div>

        <div style={pr.h2}>Radicación UPME — {upmePct}% completado</div>
        {UPME_PHASES.map((p) => {
          const ph = data.upme.phases[p.id];
          const statusLabel = {
            no_iniciado: "No iniciado", radicado: "Radicado", incompleto: "Subsanación",
            aprobado: "Aprobado", rechazado: "Rechazado",
          }[ph.status];
          const vigenciaHasta = ph.fechaRespuesta ? addYears(ph.fechaRespuesta, p.vigenciaAnios) : null;
          return (
            <div key={p.id} style={pr.phaseBox}>
              <div style={pr.phaseHead}>
                <span>{p.label}</span>
                <span>{statusLabel}</span>
              </div>
              <div style={pr.phaseMeta}>
                Radicación: {fmtDate(ph.fechaRadicacion)} · Respuesta UPME: {fmtDate(ph.fechaRespuesta)}
                {vigenciaHasta ? ` · Vigente hasta: ${fmtDate(vigenciaHasta)}` : ""}
              </div>
              {p.checklist.map((item, i) => (
                <div key={i} style={pr.checkRow}>{ph.checklist[i] ? "☑" : "☐"} {item}</div>
              ))}
              {ph.notas && <div style={{ ...pr.phaseMeta, marginTop: 6 }}>Notas: {ph.notas}</div>}
            </div>
          );
        })}

        <div style={pr.h2}>Energización — {enerPct}% completado (ponderado por costo)</div>
        {ENERGIZACION_GROUPS.map((g, gi) => {
          const start = ENERGIZACION_GROUPS.slice(0, gi).reduce((s, gg) => s + gg.items.length, 0);
          const groupCost = g.items.reduce((s, it) => s + it.cost, 0);
          const doneCost = g.items.reduce((s, it, j) => s + (data.energizacion.milestones[start + j]?.done ? it.cost : 0), 0);
          const groupPct = groupCost ? Math.round((doneCost / groupCost) * 100) : 100;
          return (
            <div key={g.id} style={pr.groupBox}>
              <div style={pr.groupHead}>
                <span>{g.label}</span>
                <span>{groupPct}% · peso {groupCost}</span>
              </div>
              <table style={pr.table}>
                <thead>
                  <tr>
                    <th style={pr.th}>Estado</th>
                    <th style={pr.th}>Actividad</th>
                    <th style={pr.th}>Día</th>
                    <th style={pr.th}>Peso</th>
                    <th style={pr.th}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it, j) => {
                    const state = data.energizacion.milestones[start + j];
                    return (
                      <tr key={j}>
                        <td style={pr.td}>{state?.done ? "☑" : "☐"}</td>
                        <td style={pr.td}>{it.title}</td>
                        <td style={pr.td}>{it.day}</td>
                        <td style={pr.td}>{it.cost}</td>
                        <td style={pr.td}>{state?.done ? fmtDate(state.fecha) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body, html, #root { margin:0; padding:0; }
      input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
      ::selection { background: #F5B94255; }
      select option { background:#171E23; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .print-only { display: none; }
      @media print {
        body { background: #ffffff !important; }
        .no-print { display: none !important; }
        .print-only { display: block !important; }
      }

      @media (max-width: 780px) {
        .app-noprint { flex-direction: column !important; }
        .app-sidebar {
          width: 100% !important; min-width: 100% !important;
          height: auto !important; max-height: 46vh !important;
          position: static !important; border-right: none !important;
          border-bottom: 1px solid #232D33 !important;
        }
        .app-main { min-height: 54vh; }
      }
    `}</style>
  );
}

/* ---------------------------------------------------------------------
   Styles
--------------------------------------------------------------------- */
const FONT_DISPLAY = "'Space Grotesk', 'Segoe UI', sans-serif";
const FONT_BODY = "'Inter', 'Segoe UI', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'SFMono-Regular', monospace";

const styles = {
  app: {
    display: "flex",
    minHeight: "100vh",
    background: "#0F1417",
    color: "#E8EDEF",
    fontFamily: FONT_BODY,
  },
  loadingScreen: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    width: "100%",
    background: "#0F1417",
  },
  sidebar: {
    width: 260,
    minWidth: 260,
    background: "#12181C",
    borderRight: "1px solid #232D33",
    padding: "18px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    height: "100vh",
    position: "sticky",
    top: 0,
    overflowY: "auto",
  },
  brand: { display: "flex", alignItems: "center", gap: 10, padding: "4px 4px 8px" },
  brandTitle: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15, letterSpacing: 0.2 },
  brandSub: { fontSize: 11, color: "#7A8A93", marginTop: 1 },
  addProjectBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    background: "#F5B942", color: "#161311", border: "none", borderRadius: 8,
    padding: "9px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer",
    fontFamily: FONT_BODY,
  },
  projectList: { display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" },
  noProjects: { color: "#5A6870", fontSize: 12.5, padding: "10px 4px" },
  sidebarFooter: { marginTop: "auto", paddingTop: 14, borderTop: "1px solid #232D33", display: "flex", flexDirection: "column", gap: 8 },
  sharedNote: { fontSize: 10.5, color: "#7A8A93", lineHeight: 1.4, padding: "0 2px" },
  footerBtnRow: { display: "flex", gap: 6 },
  footerBtn: {
    flex: 1, background: "#171E23", border: "1px solid #2A3339", color: "#C7D0D4", borderRadius: 8,
    padding: "8px 6px", fontSize: 11, cursor: "pointer", fontFamily: FONT_BODY,
  },
  projectItem: {
    background: "#171E23", border: "1px solid #232D33", borderRadius: 10,
    padding: "10px 12px", cursor: "pointer",
  },
  projectItemActive: { borderColor: "#F5B942", background: "#1C1A14" },
  projectItemTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  projectName: { fontSize: 13.5, fontWeight: 600, fontFamily: FONT_DISPLAY },
  deleteBtn: { background: "none", border: "none", color: "#5A6870", cursor: "pointer", padding: 2 },
  projectMeta: { fontSize: 11, color: "#7A8A93", marginBottom: 8, fontFamily: FONT_MONO },
  miniBarRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 },
  miniBarLabel: { fontSize: 9.5, color: "#7A8A93", width: 62, flexShrink: 0 },
  miniBarTrack: { flex: 1, height: 4, background: "#232D33", borderRadius: 4, overflow: "hidden" },
  miniBarFill: { height: "100%", borderRadius: 4 },
  miniBarPct: { fontSize: 9.5, color: "#7A8A93", width: 28, textAlign: "right", fontFamily: FONT_MONO },

  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  noPrintWrap: { display: "flex", flex: 1, minWidth: 0 },
  header: {
    padding: "22px 32px 0", display: "flex", justifyContent: "space-between",
    alignItems: "flex-end", flexWrap: "wrap", gap: 16, borderBottom: "1px solid #1E282E",
  },
  h1: { fontFamily: FONT_DISPLAY, fontSize: 24, margin: 0, fontWeight: 600, letterSpacing: 0.2 },
  headerMeta: { color: "#7A8A93", fontSize: 12.5, marginTop: 4, fontFamily: FONT_MONO },
  headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 },
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  saveBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #232D33",
    color: "#7A8A93", padding: "6px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11.5,
    fontFamily: FONT_MONO,
  },
  pdfBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "#1C242A", border: "1px solid #2A3339",
    color: "#E8EDEF", padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12,
    fontFamily: FONT_BODY, fontWeight: 500,
  },
  tabs: { display: "flex", gap: 4, paddingBottom: 14 },
  tabBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
    color: "#7A8A93", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
    fontFamily: FONT_BODY, fontWeight: 500,
  },
  tabBtnActive: { background: "#1C242A", color: "#E8EDEF" },
  content: { padding: "26px 32px 60px", overflowY: "auto" },

  resumenGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  card: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, padding: 20 },
  cardHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#B9C4CA", marginBottom: 14, fontWeight: 600 },
  cardSub: { color: "#7A8A93", fontSize: 12.5, marginTop: 10 },
  bigPctWrap: { display: "flex", alignItems: "center", gap: 14 },
  bigPctTrack: { flex: 1, height: 8, background: "#232D33", borderRadius: 6, overflow: "hidden" },
  bigPctFill: { height: "100%", borderRadius: 6 },
  bigPctNum: { fontFamily: FONT_MONO, fontSize: 20, fontWeight: 700, minWidth: 52, textAlign: "right" },
  alertList: { margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8 },
  alertItem: { fontSize: 13, color: "#E8A33D" },

  timelineStrip: { display: "flex", alignItems: "center", overflowX: "auto", padding: "6px 2px 18px" },
  phaseNode: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", minWidth: 140, opacity: 0.75 },
  phaseNodeActive: { opacity: 1 },
  phaseNodeCircle: (pct, color) => ({
    width: 44, height: 44, borderRadius: "50%", border: `2px solid ${color}`,
    display: "flex", alignItems: "center", justifyContent: "center", color,
    fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
  }),
  phaseNodeLabel: { fontSize: 12.5, textAlign: "center", fontWeight: 600, fontFamily: FONT_DISPLAY },
  timelineConnector: { flex: 1, height: 2, background: "#232D33", minWidth: 30 },

  phaseDetail: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, padding: 22, marginTop: 6 },
  phaseDetailHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  h3: { fontFamily: FONT_DISPLAY, fontSize: 16, margin: 0, fontWeight: 600 },
  h2: { fontFamily: FONT_DISPLAY, fontSize: 19, margin: "14px 0 6px", fontWeight: 600 },
  select: {
    background: "#1C242A", color: "#E8EDEF", border: "1px solid #2A3339", borderRadius: 8,
    padding: "7px 10px", fontSize: 12.5, fontFamily: FONT_BODY,
  },
  dateRow: { display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18 },
  dateField: { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, color: "#7A8A93" },
  input: {
    background: "#1C242A", color: "#E8EDEF", border: "1px solid #2A3339", borderRadius: 8,
    padding: "8px 10px", fontSize: 13, fontFamily: FONT_MONO,
  },
  staticValue: { fontFamily: FONT_MONO, fontSize: 13, color: "#E8EDEF", padding: "8px 0" },
  checklist: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  checkItem: { display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" },
  checkText: { fontSize: 13, color: "#C7D0D4" },
  checkTextDone: { fontSize: 13, color: "#5A6870", textDecoration: "line-through" },
  textarea: {
    width: "100%", minHeight: 60, background: "#1C242A", color: "#E8EDEF",
    border: "1px solid #2A3339", borderRadius: 8, padding: 10, fontSize: 12.5,
    fontFamily: FONT_BODY, resize: "vertical",
  },
  pill: { fontSize: 10, border: "1px solid", borderRadius: 20, padding: "2px 8px", fontFamily: FONT_MONO },

  enerHeadRow: { display: "flex", alignItems: "flex-end", gap: 24, flexWrap: "wrap" },
  dayCounter: { fontFamily: FONT_MONO, fontSize: 13, color: "#F5B942", paddingBottom: 4 },
  legend: { display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, marginLeft: "auto", paddingBottom: 6 },
  legendItem: { fontFamily: FONT_BODY },
  wbsGroup: { marginTop: 22, background: "#141B20", border: "1px solid #212B31", borderRadius: 12, padding: "16px 18px" },
  wbsGroupHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 },
  wbsGroupTitle: { display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_DISPLAY, fontSize: 13.5, fontWeight: 600, color: "#E8EDEF" },
  wbsDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  wbsGroupMeta: { display: "flex", alignItems: "center", gap: 10 },
  wbsCost: { fontFamily: FONT_MONO, fontSize: 11, color: "#7A8A93" },
  wbsPct: { fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700 },
  wbsBarTrack: { height: 4, background: "#212B31", borderRadius: 4, overflow: "hidden", marginBottom: 12 },
  wbsBarFill: { height: "100%", borderRadius: 4 },
  wbsItems: { display: "flex", flexDirection: "column", gap: 2 },
  wbsItemRow: {
    display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
    borderLeft: "2.5px solid", borderRadius: 4,
  },
  wbsCheck: { background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" },
  wbsItemTitle: { flex: 1, fontSize: 12.5, color: "#C7D0D4" },
  wbsItemTitleDone: { flex: 1, fontSize: 12.5, color: "#5A6870", textDecoration: "line-through" },
  wbsItemDay: { fontFamily: FONT_MONO, fontSize: 10.5, color: "#7A8A93", width: 52, textAlign: "right" },
  wbsItemCost: { fontFamily: FONT_MONO, fontSize: 10.5, color: "#7A8A93", width: 26, textAlign: "right" },
  wbsItemDate: { fontFamily: FONT_MONO, fontSize: 10.5, color: "#5FBF8F", width: 74, textAlign: "right" },
  wbsItemDatePlaceholder: { fontFamily: FONT_MONO, fontSize: 10.5, color: "#3E4A50", width: 74, textAlign: "right" },


  modalOverlay: {
    position: "fixed", inset: 0, background: "#00000090", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 50,
  },
  modal: { background: "#171E23", border: "1px solid #2A3339", borderRadius: 14, padding: 24, width: 360 },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  iconBtn: { background: "none", border: "none", color: "#7A8A93", cursor: "pointer" },
  modalField: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#7A8A93", marginBottom: 14 },
  confirmMsg: { fontSize: 13, color: "#C7D0D4", lineHeight: 1.5, margin: "0 0 18px" },
  confirmBtnRow: { display: "flex", gap: 8, justifyContent: "flex-end" },
  confirmCancelBtn: {
    background: "none", border: "1px solid #2A3339", color: "#C7D0D4", borderRadius: 8,
    padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: FONT_BODY,
  },
  confirmDangerBtn: {
    background: "#E2604F", border: "none", color: "#fff", borderRadius: 8,
    padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 600,
  },

  emptyState: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    height: "100%", textAlign: "center", padding: 40, gap: 4,
  },
  emptyP: { color: "#7A8A93", fontSize: 13.5, maxWidth: 320, margin: "0 0 14px" },

  saveError: {
    position: "fixed", bottom: 20, right: 20, background: "#2E1520", border: "1px solid #E2604F",
    color: "#E8EDEF", padding: "10px 14px", borderRadius: 8, fontSize: 12.5, display: "flex",
    alignItems: "center", gap: 10, maxWidth: 320,
  },
  saveErrorClose: { background: "none", border: "none", color: "#E8EDEF", cursor: "pointer" },

  // Sidebar overview nav
  overviewNavBtn: {
    display: "flex", alignItems: "center", gap: 8, background: "#171E23", border: "1px solid #232D33",
    color: "#B9C4CA", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, cursor: "pointer",
    fontFamily: FONT_BODY, fontWeight: 500,
  },
  overviewNavBtnActive: { borderColor: "#4FA8D8", background: "#12202A", color: "#E8EDEF" },
  footerBtnFull: {
    width: "100%", background: "#171E23", border: "1px solid #2A3339", color: "#C7D0D4", borderRadius: 8,
    padding: "8px 6px", fontSize: 11, cursor: "pointer", fontFamily: FONT_BODY,
  },

  // Overview / Resumen general screen
  overviewHeader: { padding: "22px 32px 14px", borderBottom: "1px solid #1E282E" },
  overviewStatRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 },
  overviewStat: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, padding: "16px 18px" },
  overviewStatNum: { fontFamily: FONT_MONO, fontSize: 26, fontWeight: 700, color: "#E8EDEF" },
  overviewStatLabel: { fontSize: 11.5, color: "#7A8A93", marginTop: 4 },
  overviewTableWrap: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, overflow: "hidden" },
  overviewTable: { width: "100%", borderCollapse: "collapse" },
  ovTh: {
    textAlign: "left", padding: "10px 16px", fontSize: 11, color: "#7A8A93", fontWeight: 600,
    borderBottom: "1px solid #232D33", textTransform: "uppercase", letterSpacing: 0.3,
  },
  ovTd: { padding: "10px 16px", fontSize: 12.5, color: "#C7D0D4", borderBottom: "1px solid #1E282E", verticalAlign: "middle" },
  ovTdName: { padding: "10px 16px", borderBottom: "1px solid #1E282E", verticalAlign: "middle" },
  ovTdMeta: { fontSize: 10.5, color: "#7A8A93", fontFamily: FONT_MONO, marginTop: 2 },
  ovRow: { cursor: "pointer" },
  ovBarWrap: { display: "flex", alignItems: "center", gap: 8, minWidth: 140 },
  ovBarTrack: { flex: 1, height: 5, background: "#232D33", borderRadius: 4, overflow: "hidden" },
  ovBarFill: { height: "100%", borderRadius: 4 },
  ovBarPct: { fontFamily: FONT_MONO, fontSize: 11, width: 34, textAlign: "right" },

  // Export / import-text modals
  exportModal: {
    background: "#171E23", border: "1px solid #2A3339", borderRadius: 14, padding: 24,
    width: 560, maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column",
  },
  exportHint: { fontSize: 12.5, color: "#B9C4CA", lineHeight: 1.5, margin: "0 0 14px" },
  copyBtn: {
    display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start", background: "#1C242A",
    border: "1px solid #2A3339", color: "#E8EDEF", borderRadius: 8, padding: "8px 14px",
    fontSize: 12.5, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 500, marginBottom: 12,
  },
  exportTextarea: {
    width: "100%", flex: 1, minHeight: 260, background: "#0F1417", color: "#8FDBAE",
    border: "1px solid #2A3339", borderRadius: 8, padding: 12, fontSize: 11, fontFamily: FONT_MONO,
    resize: "vertical",
  },
  importError: { color: "#E2604F", fontSize: 12, marginTop: 8 },

  // Cronograma module
  cronoHead: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 10px", flexWrap: "wrap", gap: 8 },
  pesoTotalTag: { fontFamily: FONT_MONO, fontSize: 11.5, color: "#7A8A93" },
  cronoTableWrap: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, overflow: "auto", marginBottom: 8 },
  miniInput: {
    width: "100%", background: "#1C242A", color: "#E8EDEF", border: "1px solid #2A3339", borderRadius: 6,
    padding: "5px 8px", fontSize: 11.5, fontFamily: FONT_BODY,
  },
  addRowBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", background: "#F5B942", color: "#161311",
    border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer",
  },
  rowDeleteBtn: { background: "none", border: "none", color: "#5A6870", cursor: "pointer", padding: 4 },
  chartBox: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, padding: "16px 8px 4px", marginBottom: 18 },

  // Presupuesto module
  presSubTabs: { display: "flex", gap: 6, marginBottom: 14 },
  presSubTabBtn: {
    background: "#171E23", border: "1px solid #232D33", color: "#7A8A93", borderRadius: 8,
    padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 500,
  },
  presSubTabBtnActive: { borderColor: "#F5B942", background: "#1C1A14", color: "#E8EDEF" },
  presGroupRow: {
    padding: "8px 16px", fontSize: 11.5, fontWeight: 700, color: "#F5B942", background: "#1C242A",
    borderBottom: "1px solid #232D33", textTransform: "uppercase", letterSpacing: 0.3,
  },
  pasteBtnRow: { display: "flex", justifyContent: "flex-end", marginBottom: 10 },
  pasteBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "#1C242A", border: "1px solid #2A3339",
    color: "#E8EDEF", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer",
    fontFamily: FONT_BODY, fontWeight: 500,
  },
  pastePreview: {
    fontSize: 12.5, color: "#B9C4CA", lineHeight: 1.5, background: "#1C242A", border: "1px solid #2A3339",
    borderRadius: 8, padding: "10px 12px", marginBottom: 12,
  },
};
