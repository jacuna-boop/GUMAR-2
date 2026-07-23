import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, ChevronRight, ChevronDown, Sun, FileCheck, Zap, MapPin, Calendar,
  AlertTriangle, CheckCircle2, Circle, Trash2, Loader2, FileDown, Save,
  LayoutGrid, Copy, Check, DollarSign, Wallet, Pencil, ClipboardPaste, Clock, Paperclip, FileUp,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend as RLegend, ResponsiveContainer, BarChart, Bar } from "recharts";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { supabase } from "./lib/supabaseClient";
import { COLOMBIA_LOCATIONS } from "./lib/colombiaLocations";
import Login from "./components/Login";
import CronogramaGantt from "./components/CronogramaGantt";
import gumarLogo from "./assets/gumar-logo.jpg";
import {
  UPME_STEPS, ENERGIZACION_GROUPS, ENERGIZACION_MILESTONES, ENERGIZACION_TOTAL_COST,
  CAT_STYLE, STATUS_LABELS, uid, todayISO, daysBetween, addYears, fmtDate, fmtTime, fmtDateTime,
  emptyUpmeState, emptyEnergizacionState, emptyCronogramaState, emptyPresupuestoState, emptyPagosState,
  emptyProjectData, ensureFullProjectData, buildPresupuestoBaseFromTemplate, buildCronogramaBaseFromTemplate,
  fractionElapsed, cronogramaPesoTotal, buildCurvaSData,
  parseCronogramaPaste, cronogramaAvanceActual, matchCronogramaTasks, applyCronogramaMerge,
  parsePredecesoras, computeCronogramaSchedule, parseProjectDate,
  upmeProgress, upmeActiveSteps, upmeNextStep, energizacionProgress, nextEnergizacionMilestone,
  presupuestoTotals, presupuestoListTotal, groupPresupuestoItems, calcPresupuestoItem, parsePresupuestoPaste,
  parseColombianNumber,
  ordenPagado, ordenProgramado, ordenSaldo, pagosTotals, pagosProximosAlertas, fmtMoney,
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
  const [printTarget, setPrintTarget] = useState(null); // null | "project" | "general" | "tab"
  const [showExportModal, setShowExportModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [role, setRole] = useState("editor"); // "admin" | "editor" | "lector" — "editor" es el default seguro
  const isAdmin = role === "admin";
  const isLector = role === "lector";

  useEffect(() => {
    const onAfterPrint = () => setPrintTarget(null);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);


  const rowToProject = (row) => ({ id: row.id, name: row.name, capacity: row.capacity, location: row.location, createdAt: row.created_at });

  // Initial load: full project list + el rol de quien inició sesión (para permisos)
  useEffect(() => {
    (async () => {
      const [{ data, error }, roleResult] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: true }),
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      ]);
      if (!error && data) setProjects(data.map(rowToProject));
      // Si la columna "role" todavía no existe (no se ha corrido la migración) o no hay perfil,
      // se queda en "editor" por defecto — no rompe el acceso de nadie.
      if (!roleResult.error && roleResult.data?.role) setRole(roleResult.data.role);
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

  // Realtime: reflect teammates' changes without a manual refresh — but never for the project
  // the person has open right now, since a self-echoed refresh could race with a pending save
  // and silently revert an edit (this was the "se ve guardado pero al reabrir no está" bug).
  const selectedIdRef = useRef(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

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
        if (pid === selectedIdRef.current) return; // evita pisar lo que la persona está editando ahora mismo
        supabase.from("project_data").select("*").eq("project_id", pid).maybeSingle().then(({ data }) => {
          if (data) setProjectData((prev) => ({ ...prev, [pid]: ensureFullProjectData(data) }));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const persistProjectData = useCallback(async (id, data, attempt = 1) => {
    setSaveStatus("saving");
    const { data: saved, error } = await supabase
      .from("project_data")
      .upsert({
        project_id: id,
        upme: data.upme,
        energizacion: data.energizacion,
        cronograma: data.cronograma,
        presupuesto: data.presupuesto,
        pagos: data.pagos,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .select()
      .maybeSingle();
    if (error || !saved) {
      console.error("Error guardando project_data:", error?.message || "upsert no devolvió la fila guardada (posible bloqueo de permisos)");
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        return persistProjectData(id, data, attempt + 1);
      }
      setSaveError(true);
      setSaveStatus("idle");
    } else {
      setSaveStatus("saved");
      setLastSaved(new Date());
      logProjectHistory(id, data);
    }
  }, [user.id]);

  // Historial de cambios: guarda una foto del proyecto en cada guardado exitoso, para poder ver
  // después quién cambió qué y cuándo. Para no llenar la tabla con una fila por cada guardado
  // debounced (cada 700ms mientras alguien escribe), si la persona ya tiene una entrada de los
  // últimos 15 minutos, la actualiza en vez de crear una nueva — "best effort": si esto falla no
  // debe afectar el guardado principal del proyecto.
  const logProjectHistory = useCallback(async (id, data) => {
    try {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("project_history")
        .select("id, updated_by, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const snapshot = { upme: data.upme, energizacion: data.energizacion, cronograma: data.cronograma, presupuesto: data.presupuesto, pagos: data.pagos };
      if (recent && recent.updated_by === user.id && recent.created_at > cutoff) {
        await supabase.from("project_history").update({ data: snapshot, created_at: new Date().toISOString() }).eq("id", recent.id);
      } else {
        await supabase.from("project_history").insert({ project_id: id, data: snapshot, updated_by: user.id, updated_by_email: user.email });
      }
    } catch {
      // silencioso a propósito
    }
  }, [user.id, user.email]);

  // Agrupa varios cambios rápidos (p. ej. escribir en un campo de texto) en un solo guardado,
  // en vez de mandar una petición a Supabase por cada tecla — eso era lo que causaba los
  // "No se pudo guardar" al escribir rápido.
  const saveTimers = useRef({});
  const pendingData = useRef({});
  const debouncedPersist = useCallback((id, data) => {
    pendingData.current[id] = data;
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      const toSave = pendingData.current[id];
      delete pendingData.current[id];
      delete saveTimers.current[id];
      persistProjectData(id, toSave);
    }, 700);
  }, [persistProjectData]);

  const saveNow = useCallback(async () => {
    if (selectedId && saveTimers.current[selectedId]) {
      clearTimeout(saveTimers.current[selectedId]);
      delete saveTimers.current[selectedId];
    }
    const toSave = (selectedId && pendingData.current[selectedId]) || projectData[selectedId];
    if (selectedId && pendingData.current[selectedId]) delete pendingData.current[selectedId];
    if (selectedId && toSave) {
      await persistProjectData(selectedId, toSave);
    }
  }, [selectedId, projectData, persistProjectData]);

  const updateProjectData = (id, updater) => {
    setSaveStatus("saving");
    setProjectData((prev) => {
      const current = prev[id] || emptyProjectData();
      const next = updater(current);
      debouncedPersist(id, next);
      return { ...prev, [id]: next };
    });
  };

  // Guarda cualquier cambio pendiente si la persona cierra o cambia de pestaña
  useEffect(() => {
    const flushAll = () => {
      Object.keys(saveTimers.current).forEach((id) => {
        clearTimeout(saveTimers.current[id]);
        const toSave = pendingData.current[id];
        if (toSave) persistProjectData(id, toSave);
      });
    };
    window.addEventListener("beforeunload", flushAll);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      flushAll();
    };
  }, [persistProjectData]);

  const addProject = async (name, capacity, location) => {
    const { data, error } = await supabase.from("projects").insert({ name, capacity, location, created_by: user.id }).select().single();
    if (error || !data) { setSaveError(true); return; }
    const newProject = rowToProject(data);
    setProjects((prev) => [...prev, newProject]);
    // El presupuesto y el cronograma arrancan con las plantillas base en vez de vacíos, para no
    // tener que digitar todo desde cero en cada proyecto nuevo.
    const fresh = {
      ...emptyProjectData(),
      presupuesto: buildPresupuestoBaseFromTemplate(),
      cronograma: buildCronogramaBaseFromTemplate(),
    };
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

  // Descarga un respaldo del proyecto justo antes de borrarlo, para no depender de que alguien se
  // acuerde de exportar a mano antes de una acción que no se puede deshacer.
  const backupProjectBeforeDelete = async (project) => {
    const { data } = await supabase.from("project_data").select("*").eq("project_id", project.id).maybeSingle();
    const bundle = {
      exportedAt: new Date().toISOString(),
      projects: [project],
      projectData: { [project.id]: data ? ensureFullProjectData(data) : emptyProjectData() },
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `respaldo-${project.name.replace(/[^a-z0-9]+/gi, "-")}-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const project = projects.find((p) => p.id === deleteTarget.id);
    if (project) await backupProjectBeforeDelete(project);
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
          isAdmin={isAdmin}
          isLector={isLector}
        />
        <main className="app-main" style={styles.main}>
          {projects.length === 0 ? (
            <EmptyState onAdd={() => setShowAddProject(true)} />
          ) : view === "overview" ? (
            <>
              <div style={styles.overviewHeader}>
                <div>
                  <h1 style={styles.h1}>Resumen general</h1>
                  <div style={styles.headerMeta}>{projects.length} proyecto{projects.length === 1 ? "" : "s"} activos</div>
                </div>
                <button
                  className="no-print"
                  style={styles.pdfBtn}
                  onClick={() => { setPrintTarget("general"); setTimeout(() => window.print(), 50); }}
                >
                  <FileDown size={14} /> Exportar PDF
                </button>
              </div>
              <div style={styles.content}>
                <ResumenGeneral
                  projects={projects}
                  projectData={projectData}
                  onOpenProject={(id, targetTab) => { setSelectedId(id); setView("project"); setTab(targetTab || "resumen"); }}
                />
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
                onExportPDF={() => setShowExportModal(true)}
                onShowHistory={() => setShowHistory(true)}
              />
              {isLector && (
                <div style={styles.readonlyBanner}>
                  <Circle size={12} /> Modo solo lectura — puedes ver y exportar, pero no editar.
                </div>
              )}
              <div style={styles.content} className={isLector ? "readonly-gate" : undefined}>
                {!data ? (
                  <div style={{ color: "#8B9AA3", padding: 40 }}>Cargando proyecto…</div>
                ) : tab === "resumen" ? (
                  <Resumen data={data} setTab={setTab} />
                ) : tab === "upme" ? (
                  <UpmeModule
                    data={data.upme}
                    onChange={(nextUpme) => updateProjectData(selectedId, (cur) => ({ ...cur, upme: nextUpme }))}
                    projectId={selectedId}
                    isLector={isLector}
                  />
                ) : tab === "energizacion" ? (
                  <EnergizacionModule
                    data={data.energizacion}
                    onChange={(nextEner) => updateProjectData(selectedId, (cur) => ({ ...cur, energizacion: nextEner }))}
                    projectId={selectedId}
                    isLector={isLector}
                  />
                ) : tab === "cronograma" ? (
                  <CronogramaModule
                    data={data.cronograma}
                    onChange={(nextCrono) => updateProjectData(selectedId, (cur) => ({ ...cur, cronograma: nextCrono }))}
                    projectId={selectedId}
                    isLector={isLector}
                  />
                ) : tab === "presupuesto" ? (
                  <PresupuestoModule
                    data={data.presupuesto}
                    onChange={(nextPres) => updateProjectData(selectedId, (cur) => ({ ...cur, presupuesto: nextPres }))}
                    pagos={data.pagos}
                  />
                ) : (
                  <PagosModule
                    data={data.pagos}
                    onChange={(nextPagos) => updateProjectData(selectedId, (cur) => ({ ...cur, pagos: nextPagos }))}
                    projectName={selected.name}
                    presupuestoBase={data.presupuesto.base}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
      {printTarget === "project" && selected && data && <PrintResumenProject project={selected} data={data} />}
      {printTarget === "general" && <PrintResumenGeneral projects={projects} projectData={projectData} />}
      {printTarget === "tab" && selected && data && <PrintCurrentTab project={selected} tab={tab} data={data} />}
      {showExportModal && selected && (
        <ExportPdfModal
          tab={tab}
          onClose={() => setShowExportModal(false)}
          onChoose={(target) => {
            setShowExportModal(false);
            setPrintTarget(target);
            setTimeout(() => window.print(), 50);
          }}
        />
      )}
      {showHistory && selected && (
        <HistoryModal project={selected} onClose={() => setShowHistory(false)} />
      )}
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
          message={`¿Eliminar "${deleteTarget.name}" y todo su seguimiento? Se descarga un respaldo en JSON antes de borrar, pero la acción en sí no se puede deshacer.`}
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

function Sidebar({ projects, selectedId, view, onOverview, onSelect, onAdd, onDelete, onEditProject, projectData, onExport, onImportFile, onImportText, userEmail, onSignOut, isAdmin, isLector }) {
  const fileInputRef = React.useRef(null);

  return (
    <aside className="app-sidebar" style={styles.sidebar}>
      <div style={styles.brand}>
        <img src={gumarLogo} alt="Gumar Proyectos" style={styles.brandLogo} />
        <div>
          <div style={styles.brandTitle}>Control de Parques</div>
          <div style={styles.brandTitle}>GUMAR PROYECTOS</div>
        </div>
      </div>

      <button
        style={{ ...styles.overviewNavBtn, ...(view === "overview" ? styles.overviewNavBtnActive : {}) }}
        onClick={onOverview}
      >
        <LayoutGrid size={15} /> Resumen general
      </button>

      {!isLector && (
        <button style={styles.addProjectBtn} onClick={onAdd}>
          <Plus size={15} /> Nuevo proyecto
        </button>
      )}

      <div style={styles.projectList}>
        {projects.length === 0 && (
          <div style={styles.noProjects}>Aún no hay proyectos registrados.</div>
        )}
        {projects.map((p) => {
          const d = projectData[p.id];
          const upmePct = d ? upmeProgress(d.upme) : 0;
          const enerPct = d ? energizacionProgress(d.energizacion) : 0;
          const enerNextMs = d ? nextEnergizacionMilestone(d.energizacion) : null;
          const enerDelayed = enerNextMs && enerNextMs.delayed;
          const presPct = d ? presupuestoTotals(d.presupuesto).pct : 0;
          const pagTotals = d ? pagosTotals(d.pagos) : null;
          const pagPct = pagTotals && pagTotals.totalOrdenes ? Math.round((pagTotals.totalPagado / pagTotals.totalOrdenes) * 100) : 0;
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
                  {!isLector && (
                    <button
                      style={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditProject(p);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      style={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(p);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div style={styles.projectMeta}>
                {p.capacity ? `${p.capacity} MWp` : ""}{p.location ? ` · ${p.location}` : ""}
              </div>
              <MiniBar label="UPME" pct={upmePct} color={upmePct >= 100 ? "#5FBF8F" : "#4FA8D8"} />
              <MiniBar label="Energización" pct={enerPct} color={enerPct >= 100 ? "#5FBF8F" : enerDelayed ? "#E2604F" : "#4FA8D8"} />
              <MiniBar label="Presupuesto" pct={Math.min(100, presPct)} displayLabel={`${presPct}%`} color={presPct > 100 ? "#E2604F" : "#7FD08A"} />
              <MiniBar label="Pagos" pct={Math.min(100, pagPct)} displayLabel={`${pagPct}%`} color={pagPct > 100 ? "#E2604F" : pagPct >= 100 ? "#5FBF8F" : "#4FA8D8"} />
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
          {!isLector && (
            <button style={styles.footerBtn} onClick={() => fileInputRef.current?.click()}>
              Importar archivo
            </button>
          )}
        </div>
        {!isLector && (
          <button style={styles.footerBtnFull} onClick={onImportText}>
            Importar pegando texto
          </button>
        )}
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

function MiniBar({ label, pct, color, displayLabel }) {
  return (
    <div style={styles.miniBarRow}>
      <span style={styles.miniBarLabel}>{label}</span>
      <div style={styles.miniBarTrack}>
        <div style={{ ...styles.miniBarFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={styles.miniBarPct}>{displayLabel ?? `${pct}%`}</span>
    </div>
  );
}

// Formatea un texto de dígitos (con a lo sumo una coma decimal) con puntos de miles, estilo
// colombiano: "1234567" -> "1.234.567", "1234,5" -> "1.234,5".
function formatMilesDisplay(raw) {
  if (!raw) return "";
  const [intPart, decPart] = raw.split(",");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart !== undefined ? `${intFormatted},${decPart}` : intFormatted;
}

// Input numérico que va mostrando los puntos de miles/millones mientras se escribe, para poder ver
// de un vistazo si el número quedó con la cantidad de ceros correcta. Por dentro sigue guardando un
// número plano (onChange recibe un number) — el formato es solo visual.
function MoneyInput({ value, onChange, style, placeholder }) {
  const toText = (v) => (v === "" || v === undefined || v === null || Number(v) === 0 ? "" : formatMilesDisplay(String(v).replace(".", ",")));
  const [text, setText] = useState(() => toText(value));
  const inputRef = useRef(null);

  useEffect(() => {
    if (parseColombianNumber(text) !== (Number(value) || 0)) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    const input = e.target;
    const caret = input.selectionStart;
    const digitsBeforeCaret = input.value.slice(0, caret).replace(/[^0-9,]/g, "").length;

    let raw = input.value.replace(/[^0-9,]/g, "");
    const firstComma = raw.indexOf(",");
    if (firstComma !== -1) raw = raw.slice(0, firstComma + 1) + raw.slice(firstComma + 1).replace(/,/g, "");

    const formatted = formatMilesDisplay(raw);
    setText(formatted);
    onChange(parseColombianNumber(raw));

    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      let count = 0, pos = 0;
      for (; pos < formatted.length && count < digitsBeforeCaret; pos++) {
        if (/[0-9,]/.test(formatted[pos])) count++;
      }
      inputRef.current.setSelectionRange(pos, pos);
    });
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      style={style}
      placeholder={placeholder}
      value={text}
      onChange={handleChange}
    />
  );
}

// Botón de "adjuntos" reutilizable: certificados UPME, actas de energización, fotos de avance de
// obra. Sube a un bucket privado de Supabase Storage y guarda quién/cuándo en la tabla "attachments".
// Los archivos se descargan con URL firmada temporal (el bucket no es público). En modo lector no
// se puede subir ni borrar, solo ver y descargar lo que ya hay.
function AttachmentsButton({ projectId, modulo, entidadId, readOnly }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null); // null = aún no cargado
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const load = async () => {
    const { data } = await supabase
      .from("attachments")
      .select("*")
      .eq("project_id", projectId)
      .eq("modulo", modulo)
      .eq("entidad_id", String(entidadId))
      .order("created_at", { ascending: false });
    setFiles(data || []);
  };

  useEffect(() => {
    if (open && files === null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    const path = `${projectId}/${modulo}/${entidadId}/${uid()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("project-files").upload(path, file);
    if (!uploadError) {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("attachments").insert({
        project_id: projectId, modulo, entidad_id: String(entidadId),
        file_path: path, file_name: file.name,
        uploaded_by: userData?.user?.id, uploaded_by_email: userData?.user?.email,
      });
      await load();
    }
    setBusy(false);
  };

  const handleDownload = async (att) => {
    const { data } = await supabase.storage.from("project-files").createSignedUrl(att.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (att) => {
    setBusy(true);
    await supabase.storage.from("project-files").remove([att.file_path]);
    await supabase.from("attachments").delete().eq("id", att.id);
    await load();
    setBusy(false);
  };

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button type="button" style={styles.attachBtn} onClick={() => setOpen((v) => !v)} title="Adjuntos">
        <Paperclip size={12} /> {files && files.length > 0 ? files.length : ""}
      </button>
      {open && (
        <div style={styles.attachPopover} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#E8EDEF" }}>Adjuntos</span>
            <button type="button" style={styles.iconBtn} onClick={() => setOpen(false)}><X size={13} /></button>
          </div>
          {files === null ? (
            <div style={{ fontSize: 11, color: "#7A8A93" }}>Cargando…</div>
          ) : files.length === 0 ? (
            <div style={{ fontSize: 11, color: "#7A8A93", marginBottom: 6 }}>Sin archivos todavía.</div>
          ) : (
            <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 6 }}>
              {files.map((f) => (
                <div key={f.id} style={styles.attachRow}>
                  <span
                    onClick={() => handleDownload(f)}
                    style={{ cursor: "pointer", color: "#4FA8D8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={f.file_name}
                  >
                    {f.file_name}
                  </span>
                  {!readOnly && (
                    <button type="button" style={styles.rowDeleteBtn} onClick={() => handleDelete(f)} disabled={busy}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!readOnly && (
            <>
              <input ref={inputRef} type="file" style={{ display: "none" }} onChange={handleUpload} />
              <button
                type="button"
                style={{ ...styles.addProjectBtn, width: "100%", opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? "Subiendo…" : "Subir archivo"}
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------
   Header + tabs
--------------------------------------------------------------------- */
function Header({ project, tab, setTab, saveStatus, lastSaved, onSaveNow, onExportPDF, onShowHistory }) {
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
          <TabBtn active={tab === "upme"} onClick={() => setTab("upme")} icon={<FileCheck size={14} />} label="UPME" />
          <TabBtn active={tab === "energizacion"} onClick={() => setTab("energizacion")} icon={<Zap size={14} />} label="Energización" />
          <TabBtn active={tab === "cronograma"} onClick={() => setTab("cronograma")} icon={<Calendar size={14} />} label="Cronograma" />
          <TabBtn active={tab === "presupuesto"} onClick={() => setTab("presupuesto")} icon={<DollarSign size={14} />} label="Presupuesto" />
          <TabBtn active={tab === "pagos"} onClick={() => setTab("pagos")} icon={<Wallet size={14} />} label="Pagos" />
        </div>
        <div style={styles.headerActions}>
          <SaveIndicator status={saveStatus} lastSaved={lastSaved} onSaveNow={onSaveNow} />
          <button style={styles.pdfBtn} onClick={onShowHistory} title="Ver quién cambió qué y cuándo">
            <Clock size={14} /> Historial
          </button>
          <button
            style={styles.pdfBtn}
            onClick={onExportPDF}
            title="Elige qué exportar y guárdalo como PDF desde el diálogo de impresión"
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

function buildProjectAlerts(data) {
  const nextMs = nextEnergizacionMilestone(data.energizacion);
  const elapsed = data.energizacion.fechaInicio ? daysBetween(data.energizacion.fechaInicio, todayISO()) : null;
  const presTotals = presupuestoTotals(data.presupuesto);
  const pagTotals = pagosTotals(data.pagos);
  const alerts = [];
  if (nextMs && nextMs.delayed) {
    alerts.push(`Energización: el hito "${nextMs.title}" está previsto para el día ${nextMs.day} y ya vas en el día ${elapsed}.`);
  }
  if (presTotals.diferencia > 0) {
    alerts.push(`Presupuesto: la ejecución supera la base en ${fmtMoney(presTotals.diferencia)} (${presTotals.pct}%).`);
  }
  if (pagTotals.totalSaldo > 0) {
    alerts.push(`Pagos: hay ${fmtMoney(pagTotals.totalSaldo)} en saldo pendiente por pagar.`);
  }
  pagosProximosAlertas(data.pagos).forEach((a) => alerts.push(a.texto));
  return alerts;
}

function Resumen({ data, setTab }) {
  const upmePct = upmeProgress(data.upme);
  const enerPct = energizacionProgress(data.energizacion);
  const nextMs = nextEnergizacionMilestone(data.energizacion);
  const elapsed = data.energizacion.fechaInicio ? daysBetween(data.energizacion.fechaInicio, todayISO()) : null;
  const presTotals = presupuestoTotals(data.presupuesto);
  const desviacionPct = presTotals.base ? Math.round((presTotals.diferencia / presTotals.base) * 100) : 0;
  const pagTotals = pagosTotals(data.pagos);
  const nextUpme = upmeNextStep(data.upme);
  const alerts = buildProjectAlerts(data);

  return (
    <div style={styles.resumenGrid}>
      <div
        style={{ ...styles.card, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("upme")}
      >
        <div style={styles.cardHead}>
          <FileCheck size={16} color="#4FA8D8" />
          <span>Beneficios tributarios UPME</span>
        </div>
        <BigPct pct={upmePct} color="#4FA8D8" />
        <div style={styles.cardSub}>{nextUpme ? `Siguiente paso: ${nextUpme.num}. ${nextUpme.label}` : "Proceso completado"}</div>
      </div>

      <div
        style={{ ...styles.card, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("energizacion")}
      >
        <div style={styles.cardHead}>
          <Zap size={16} color="#F5B942" />
          <span>Energización</span>
        </div>
        <BigPct pct={enerPct} color="#F5B942" />
        <div style={styles.cardSub}>
          {elapsed === null ? "Falta asignar fecha de inicio de trámites" : `Día ${elapsed} de 200`} · {nextMs ? `Siguiente: ${nextMs.title} (día ${nextMs.day})` : "Todas las actividades completadas"}
        </div>
      </div>

      <div
        style={{ ...styles.card, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("presupuesto")}
      >
        <div style={styles.cardHead}>
          <DollarSign size={16} color="#7FD08A" />
          <span>Presupuesto</span>
        </div>
        <BigPct
          pct={Math.min(100, Math.abs(desviacionPct))}
          color={desviacionPct > 0 ? "#E2604F" : "#7FD08A"}
          label={`${desviacionPct > 0 ? "+" : ""}${desviacionPct}%`}
        />
        <div style={styles.cardSub}>
          Desviación vs. base: {presTotals.diferencia > 0 ? "+" : ""}{fmtMoney(presTotals.diferencia)}
          <br />
          Base {fmtMoney(presTotals.base)} · Ejecución {fmtMoney(presTotals.ejecutado)}
        </div>
      </div>

      <div
        style={{ ...styles.card, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("pagos")}
      >
        <div style={styles.cardHead}>
          <Wallet size={16} color="#E77DA8" />
          <span>Pagos</span>
        </div>
        <BigPct pct={pagTotals.totalOrdenes ? Math.round((pagTotals.totalPagado / pagTotals.totalOrdenes) * 100) : 0} color="#E77DA8" />
        <div style={styles.cardSub}>
          {fmtMoney(pagTotals.totalPagado)} pagado de {fmtMoney(pagTotals.totalOrdenes)} · saldo {fmtMoney(pagTotals.totalSaldo)}
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
    const elapsed = d.energizacion.fechaInicio ? daysBetween(d.energizacion.fechaInicio, todayISO()) : null;
    const delayed = nextMs && nextMs.delayed;
    const pres = presupuestoTotals(d.presupuesto);
    const pag = pagosTotals(d.pagos);
    const alerts = buildProjectAlerts(d);
    return { project: p, loading: false, upmePct, enerPct, nextMs, elapsed, delayed, pres, pag, alerts };
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

      <div style={styles.overviewStatRow}>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 17, color: "#7FD08A" }}>{fmtMoney(totalBase)}</div>
          <div style={styles.overviewStatLabel}>Presupuesto base (todos los proyectos)</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 17, color: "#7FD08A" }}>{fmtMoney(totalEjecutado)}</div>
          <div style={styles.overviewStatLabel}>Presupuesto ejecución (todos)</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 17, color: totalSaldo > 0 ? "#E8A33D" : "#5FBF8F" }}>{fmtMoney(totalSaldo)}</div>
          <div style={styles.overviewStatLabel}>Saldo pendiente por pagar (todos)</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 17, color: plataEnRiesgo > 0 ? "#E2604F" : "#5FBF8F" }}>{fmtMoney(plataEnRiesgo)}</div>
          <div style={styles.overviewStatLabel}>Plata en riesgo (sobrecostos, todos)</div>
        </div>
      </div>

      <div style={{ ...styles.card, marginBottom: 22 }}>
        <div style={styles.cardHead}>
          <AlertTriangle size={16} color="#E8A33D" />
          <span>Alertas por proyecto</span>
        </div>
        {projectsWithAlerts.length === 0 ? (
          <div style={styles.cardSub}>Sin alertas por ahora.</div>
        ) : (
          <div style={styles.alertsByProjectList}>
            {projectsWithAlerts.map(({ project: p, alerts }) => (
              <div key={p.id} style={styles.alertsByProjectGroup}>
                <div
                  style={styles.alertsByProjectName}
                  role="button"
                  onClick={() => onOpenProject(p.id, "resumen")}
                >
                  {p.name}
                </div>
                <ul style={styles.alertList}>
                  {alerts.map((a, i) => (
                    <li key={i} style={styles.alertItem}>{a}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.overviewTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={styles.ovTh}>Proyecto</th>
              <th style={styles.ovTh}>UPME</th>
              <th style={styles.ovTh}>Energización</th>
              <th style={styles.ovTh}>Presupuesto</th>
              <th style={styles.ovTh}>Saldo pendiente</th>
              <th style={styles.ovTh}>Día</th>
              <th style={styles.ovTh}>Siguiente hito</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project: p, loading, upmePct, enerPct, nextMs, elapsed, delayed, pres, pag }) => (
              <tr key={p.id} style={styles.ovRow} onClick={() => onOpenProject(p.id, "resumen")}>
                <td style={styles.ovTdName}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={styles.ovTdMeta}>{p.capacity ? `${p.capacity} MWp` : ""}{p.location ? ` · ${p.location}` : ""}</div>
                </td>
                {loading ? (
                  <td colSpan={6} style={styles.ovTd}>Cargando…</td>
                ) : (
                  <>
                    <td
                      style={styles.ovTd}
                      onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "upme"); }}
                    >
                      <OvBar pct={upmePct} color="#4FA8D8" />
                    </td>
                    <td
                      style={styles.ovTd}
                      onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "energizacion"); }}
                    >
                      <OvBar pct={enerPct} color="#F5B942" />
                    </td>
                    <td
                      style={styles.ovTd}
                      onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "presupuesto"); }}
                    >
                      <OvBar pct={pres.pct} color={pres.pct > 100 ? "#E2604F" : "#7FD08A"} />
                    </td>
                    <td
                      style={{ ...styles.ovTd, color: pag.totalSaldo > 0 ? "#E8A33D" : "#5FBF8F" }}
                      onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "pagos"); }}
                    >
                      {fmtMoney(pag.totalSaldo)}
                    </td>
                    <td style={styles.ovTd}>{elapsed === null ? "—" : `${elapsed} / 200`}</td>
                    <td
                      style={{ ...styles.ovTd, color: delayed ? "#E2604F" : "#B9C4CA" }}
                      onClick={(e) => { e.stopPropagation(); onOpenProject(p.id, "energizacion"); }}
                    >
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

function OvBar({ pct, color, label }) {
  return (
    <div style={styles.ovBarWrap}>
      <div style={styles.ovBarTrack}>
        <div style={{ ...styles.ovBarFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ ...styles.ovBarPct, color }}>{label ?? `${pct}%`}</span>
    </div>
  );
}

function BigPct({ pct, color, label }) {
  return (
    <div style={styles.bigPctWrap}>
      <div style={styles.bigPctTrack}>
        <div style={{ ...styles.bigPctFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ ...styles.bigPctNum, color }}>{label ?? `${pct}%`}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------
   UPME module
--------------------------------------------------------------------- */
function UpmeModule({ data, onChange, projectId, isLector }) {
  const updateStep = (id, patch) => {
    onChange({ ...data, steps: { ...data.steps, [id]: { ...data.steps[id], ...patch } } });
  };

  const skipS7S8 = data.steps.s6?.decision === "si";
  const skipS10S11 = data.steps.s9?.decision === "no";
  const isSkipped = (s) => (s.id === "s7" || s.id === "s8") ? skipS7S8 : (s.id === "s10" || s.id === "s11") ? skipS10S11 : false;

  const active = upmeActiveSteps(data);
  const doneCount = active.filter((s) => data.steps[s.id]?.completado).length;

  return (
    <div>
      <div style={styles.cronoHead}>
        <h3 style={styles.h3}>Beneficios tributarios — trámite ante la UPME</h3>
        <span style={styles.pesoTotalTag}>{doneCount} de {active.length} pasos completados</span>
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
                    background: skipped ? "#232D33" : st.completado ? "#5FBF8F" : "#1C242A",
                    color: skipped ? "#5A6870" : st.completado ? "#0F1417" : "#E8EDEF",
                    borderColor: skipped ? "#2A3339" : st.completado ? "#5FBF8F" : "#4FA8D8",
                    cursor: skipped ? "default" : "pointer",
                    padding: 0,
                  }}
                >
                  {st.completado && !skipped ? <Check size={14} /> : s.num}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ ...styles.upmeStepLabel, ...(skipped ? { color: "#5A6870", textDecoration: "line-through" } : {}) }}>
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
                  <label style={styles.dateField}>
                    <span>Fecha</span>
                    <input type="date" style={styles.input} value={st.fecha} onChange={(e) => updateStep(s.id, { fecha: e.target.value })} />
                  </label>
                  <input
                    style={{ ...styles.input, flex: 1, minWidth: 160 }}
                    placeholder="Notas (opcional)"
                    value={st.notas}
                    onChange={(e) => updateStep(s.id, { notas: e.target.value })}
                  />
                  {s.decision && (
                    <div style={styles.upmeDecisionBox}>
                      <span>{s.decision.question}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          style={{ ...styles.presSubTabBtn, ...(st.decision === "si" ? styles.presSubTabBtnActive : {}) }}
                          onClick={() => updateStep(s.id, { decision: "si" })}
                        >
                          Sí
                        </button>
                        <button
                          style={{ ...styles.presSubTabBtn, ...(st.decision === "no" ? styles.presSubTabBtnActive : {}) }}
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

/* ---------------------------------------------------------------------
   Energización module
--------------------------------------------------------------------- */
function EnergizacionModule({ data, onChange, projectId, isLector }) {
  const elapsed = data.fechaInicio ? daysBetween(data.fechaInicio, todayISO()) : null;
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
          {elapsed === null ? "Asigna la fecha de inicio para empezar a contar días" : (<>Día <strong>{elapsed}</strong> de 200</>)}
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
                const delayed = !state.done && elapsed !== null && elapsed > it.day;
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

function CronogramaModule({ data, onChange, projectId, isLector }) {
  const [newTask, setNewTask] = useState({ nombre: "", fechaInicio: "", fechaFin: "", peso: "", predecesoras: "" });
  const [newSeg, setNewSeg] = useState({ fecha: todayISO(), avance: "" });
  const [showPaste, setShowPaste] = useState(false);
  const [showGantt, setShowGantt] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind: "task" | "seg", id, label } | null

  const pesoTotal = cronogramaPesoTotal(data.tasks);
  const curvaData = buildCurvaSData(data);
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

  return (
    <div>
      <div style={styles.cronoHead}>
        <h3 style={styles.h3}>Cronograma de obra</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...styles.pesoTotalTag, color: Math.round(pesoTotal) === 100 ? "#5FBF8F" : "#E8A33D" }}>
            peso total: {pesoTotal}% {Math.round(pesoTotal) !== 100 ? "(debería sumar 100%)" : ""}
          </span>
          <button style={styles.pasteBtn} onClick={() => setShowPaste(true)}>
            <ClipboardPaste size={14} /> Pegar desde Project/Excel
          </button>
        </div>
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

      <div style={styles.cronoTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={styles.ovTh}>Id</th>
              <th style={styles.ovTh}>Actividad</th>
              <th style={styles.ovTh}>Duración</th>
              <th style={styles.ovTh}>Inicio</th>
              <th style={styles.ovTh}>Fin</th>
              <th style={styles.ovTh}>Predecesoras</th>
              <th style={styles.ovTh}>% Compl.</th>
              <th style={styles.ovTh}>Peso %</th>
              <th style={styles.ovTh}>Grupo</th>
              <th style={styles.ovTh}></th>
            </tr>
          </thead>
          <tbody>
            {data.tasks.map((t) => (
              <tr key={t.id} style={t.esGrupo ? { background: "#1C242A" } : undefined}>
                <td style={styles.ovTd}>
                  <input style={{ ...styles.miniInput, width: 44 }} value={t.displayId || ""} onChange={(e) => updateTask(t.id, { displayId: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <input
                    style={{ ...styles.miniInput, fontWeight: t.esGrupo ? 700 : 400, color: t.esGrupo ? "#F5B942" : "#E8EDEF" }}
                    value={t.nombre}
                    onChange={(e) => updateTask(t.id, { nombre: e.target.value })}
                  />
                </td>
                <td style={styles.ovTd}>
                  <input style={{ ...styles.miniInput, width: 70 }} value={t.duracionTexto || ""} onChange={(e) => updateTask(t.id, { duracionTexto: e.target.value })} placeholder="0 días" />
                </td>
                <td style={styles.ovTd}>
                  {isComputed(t) ? (
                    <span style={styles.cronoComputedDate} title="Calculada a partir de la predecesora">{fmtDate(t.fechaInicio)}</span>
                  ) : (
                    <input type="date" style={styles.miniInput} value={t.fechaInicio} onChange={(e) => updateTask(t.id, { fechaInicio: e.target.value })} />
                  )}
                </td>
                <td style={styles.ovTd}>
                  {isComputed(t) ? (
                    <span style={styles.cronoComputedDate} title="Calculada a partir de la predecesora">{fmtDate(t.fechaFin)}</span>
                  ) : (
                    <input type="date" style={styles.miniInput} value={t.fechaFin} onChange={(e) => updateTask(t.id, { fechaFin: e.target.value })} />
                  )}
                </td>
                <td style={styles.ovTd}>
                  {(() => {
                    const sinResolver = predecesorasNoResueltas(t);
                    return (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <input
                          style={{
                            ...styles.miniInput, width: 70,
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
                <td style={styles.ovTd}>
                  <input type="number" style={{ ...styles.miniInput, width: 56 }} value={t.pctCompletado || 0} onChange={(e) => updateTask(t.id, { pctCompletado: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <input type="number" style={{ ...styles.miniInput, width: 60 }} value={t.peso} onChange={(e) => updateTask(t.id, { peso: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <input type="checkbox" checked={!!t.esGrupo} onChange={(e) => updateTask(t.id, { esGrupo: e.target.checked })} />
                </td>
                <td style={styles.ovTd}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {projectId && <AttachmentsButton projectId={projectId} modulo="cronograma" entidadId={t.id} readOnly={isLector} />}
                    <button style={styles.rowDeleteBtn} onClick={() => askDeleteTask(t)}><Trash2 size={13} /></button>
                  </span>
                </td>
              </tr>
            ))}
            <tr>
              <td style={styles.ovTd}></td>
              <td style={styles.ovTd}>
                <input style={styles.miniInput} placeholder="Nueva actividad" value={newTask.nombre} onChange={(e) => setNewTask({ ...newTask, nombre: e.target.value })} />
              </td>
              <td style={styles.ovTd}></td>
              <td style={styles.ovTd}>
                <input type="date" style={styles.miniInput} value={newTask.fechaInicio} onChange={(e) => setNewTask({ ...newTask, fechaInicio: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <input type="date" style={styles.miniInput} value={newTask.fechaFin} onChange={(e) => setNewTask({ ...newTask, fechaFin: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <input
                  style={{ ...styles.miniInput, width: 70 }}
                  placeholder="ej. 35CC+5 días"
                  value={newTask.predecesoras}
                  onChange={(e) => setNewTask({ ...newTask, predecesoras: e.target.value })}
                />
              </td>
              <td style={styles.ovTd}></td>
              <td style={styles.ovTd}>
                <input type="number" style={{ ...styles.miniInput, width: 60 }} placeholder="%" value={newTask.peso} onChange={(e) => setNewTask({ ...newTask, peso: e.target.value })} />
              </td>
              <td style={styles.ovTd}></td>
              <td style={styles.ovTd}>
                <button style={styles.addRowBtn} onClick={addTask}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={styles.cronoHead}>
        <h3 style={styles.h3}>Gantt</h3>
        <button style={styles.pasteBtn} onClick={() => setShowGantt((v) => !v)}>
          {showGantt ? "Ocultar Gantt" : "Mostrar Gantt"}
        </button>
      </div>
      {showGantt && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8, fontSize: 11.5, color: "#7A8A93" }}>
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

      <div style={styles.cronoHead}>
        <h3 style={styles.h3}>Curva S de construcción</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={styles.pesoTotalTag}>
            avance real hoy: {avanceHoy}%{lastReal && lastReal.fecha !== todayISO() ? ` · último registro: ${lastReal.avance}% (${fmtDate(lastReal.fecha)})` : ""}
          </span>
        </div>
      </div>
      <div style={{ color: "#7A8A93", fontSize: 11.5, margin: "-6px 0 12px" }}>
        El seguimiento se registra solo: cada vez que editas el %completado de una actividad, el punto de hoy se actualiza automáticamente.
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
            {[...data.seguimiento].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((s) => (
              <tr key={s.id}>
                <td style={styles.ovTd}>
                  <input type="date" style={styles.miniInput} value={s.fecha} onChange={(e) => updateSeg(s.id, { fecha: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <input type="number" style={{ ...styles.miniInput, width: 70 }} value={s.avance} onChange={(e) => updateSeg(s.id, { avance: e.target.value })} />
                </td>
                <td style={styles.ovTd}>
                  <button style={styles.rowDeleteBtn} onClick={() => askDeleteSeg(s)}><Trash2 size={13} /></button>
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

function PasteCronogramaModal({ existingTasks, onClose, onImport }) {
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
                <strong style={{ color: "#4FA8D8" }}>{preview.toUpdate.length}</strong> ya existen y se van a actualizar ·{" "}
                <strong style={{ color: "#5FBF8F" }}>{preview.toAdd.length}</strong> son nuevas.
              </div>
              {preview.toUpdate.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: "#7A8A93" }}>
                  Se actualizarán: {preview.toUpdate.map(({ existing }) => existing.nombre).join(", ")}
                </div>
              )}
              {preview.toAdd.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11.5, color: "#7A8A93" }}>
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


function PresupuestoModule({ data, onChange, pagos }) {
  const [activeSub, setActiveSub] = useState("base"); // "base" | "ejecucion"
  const [chartMode, setChartMode] = useState("categoria"); // "categoria" | "actividad"
  const totals = presupuestoTotals(data);

  // Suma lo pagado (solo pagos en estado "pagado", no "programado") de las órdenes que la persona
  // amarró a cada ítem del presupuesto desde la pestaña Pagos — para ver de un vistazo cuánto se ha
  // pagado realmente hacia cada actividad.
  const pagadoPorItem = new Map();
  (pagos?.ordenes || []).forEach((o) => {
    if (!o.presupuestoItemId) return;
    const actual = pagadoPorItem.get(o.presupuestoItemId) || 0;
    pagadoPorItem.set(o.presupuestoItemId, actual + ordenPagado(o));
  });

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
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button
              className="view-toggle"
              style={{ ...styles.presSubTabBtn, ...(chartMode === "categoria" ? styles.presSubTabBtnActive : {}) }}
              onClick={() => setChartMode("categoria")}
            >
              Por categoría
            </button>
            <button
              className="view-toggle"
              style={{ ...styles.presSubTabBtn, ...(chartMode === "actividad" ? styles.presSubTabBtnActive : {}) }}
              onClick={() => setChartMode("actividad")}
            >
              Por actividad
            </button>
          </div>
          <div style={{ ...styles.chartBox, overflowX: chartMode === "actividad" ? "auto" : "hidden" }}>
            <div style={chartMode === "actividad" ? { width: chartWidth } : undefined}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232D33" />
                  <XAxis dataKey="name" tick={false} axisLine={{ stroke: "#232D33" }} tickLine={false} />
                  <YAxis tick={{ fill: "#7A8A93", fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                  <Tooltip
                    contentStyle={{ background: "#171E23", border: "1px solid #2A3339", fontSize: 12, color: "#E8EDEF" }}
                    formatter={(v) => fmtMoney(v)}
                  />
                  <RLegend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="Base"
                    fill="#4FA8D8"
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
          style={{ ...styles.presSubTabBtn, ...(activeSub === "base" ? styles.presSubTabBtnActive : {}) }}
          onClick={() => setActiveSub("base")}
        >
          Presupuesto base
        </button>
        <button
          className="view-toggle"
          style={{ ...styles.presSubTabBtn, ...(activeSub === "ejecucion" ? styles.presSubTabBtnActive : {}) }}
          onClick={() => setActiveSub("ejecucion")}
        >
          Presupuesto de ejecución
        </button>
      </div>

      {activeSub === "ejecucion" && (
        <p style={styles.exportHint}>
          Los ítems marcados con <span style={{ color: "#4FA8D8" }}>●</span> ya existen en el presupuesto base
          (se crearon ahí). Los demás son adicionales, agregados directamente aquí.
        </p>
      )}

      {activeSub === "base" ? (
        <PresupuestoTable items={data.base} onAdd={addBaseItem} onAddMany={addBaseItems} onUpdate={updateBaseItem} onDelete={deleteBaseItem} pagadoPorItem={pagadoPorItem} />
      ) : (
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
        />
      )}
    </div>
  );
}

function PresupuestoTable({ items, onAdd, onAddMany, onUpdate, onDelete, linkedIds, baseValoresPorItem, baseValoresPorCategoria, pagadoPorItem }) {
  const [newItem, setNewItem] = useState({
    item: "", categoria: "", descripcion: "", cantidad: "", unidad: "",
    valorUnitario: "", ivaPct: "",
  });
  const [showPaste, setShowPaste] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null); // { id, label } | null

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
            onAddMany(newItems);
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
            <th style={styles.ovTh}>Pagado (real)</th>
            <th style={styles.ovTh}></th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((group) => {
            const groupTotal = presupuestoListTotal(group.items);
            const baseGroupTotal = baseValoresPorCategoria?.get(group.categoria);
            const groupExcedido = baseGroupTotal !== undefined && groupTotal > baseGroupTotal;
            return (
              <React.Fragment key={group.categoria}>
                <tr>
                  <td colSpan={7} style={styles.presGroupRow}>
                    {group.categoria}
                    {groupExcedido && <span style={styles.presExcedidoTag}> · supera la base ({fmtMoney(groupTotal - baseGroupTotal)})</span>}
                  </td>
                  <td style={{ ...styles.presGroupRow, color: groupExcedido ? "#E2604F" : undefined, fontWeight: groupExcedido ? 800 : undefined }}>
                    {fmtMoney(groupTotal)}
                  </td>
                  <td style={styles.presGroupRow} colSpan={2}></td>
                </tr>
                {group.items.map((it) => {
                  const calc = calcPresupuestoItem(it);
                  const isLinked = linkedIds && linkedIds.has(it.id);
                  const baseValor = baseValoresPorItem?.get(it.id);
                  const itemExcedido = isLinked && baseValor !== undefined && calc.valorTotal > baseValor;
                  return (
                    <tr key={it.id} style={itemExcedido ? { background: "#2A1418" } : undefined}>
                      <td style={styles.ovTd}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {isLinked && <span title="Viene del presupuesto base" style={{ color: "#4FA8D8" }}>●</span>}
                          <input style={{ ...styles.miniInput, width: 56 }} value={it.item} onChange={(e) => onUpdate(it.id, { item: e.target.value })} />
                        </div>
                      </td>
                      <td style={styles.ovTd}>
                        <input style={styles.miniInput} value={it.descripcion} onChange={(e) => onUpdate(it.id, { descripcion: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>
                        <input type="number" style={{ ...styles.miniInput, width: 64 }} value={it.cantidad} onChange={(e) => onUpdate(it.id, { cantidad: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>
                        <input style={{ ...styles.miniInput, width: 64 }} value={it.unidad} onChange={(e) => onUpdate(it.id, { unidad: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>
                        <MoneyInput style={styles.miniInput} value={it.valorUnitario} onChange={(val) => onUpdate(it.id, { valorUnitario: val })} />
                      </td>
                      <td style={styles.ovTd}>
                        <input type="number" style={{ ...styles.miniInput, width: 56 }} value={it.ivaPct} onChange={(e) => onUpdate(it.id, { ivaPct: e.target.value })} />
                      </td>
                      <td style={styles.ovTd}>{fmtMoney(calc.valorUnitarioConIva)}</td>
                      <td style={{ ...styles.ovTd, fontWeight: 700, color: itemExcedido ? "#E2604F" : undefined }}>
                        {fmtMoney(calc.valorTotal)}
                        {itemExcedido && <div style={styles.presExcedidoTag}>+{fmtMoney(calc.valorTotal - baseValor)} vs. base</div>}
                      </td>
                      <td style={styles.ovTd}>{fmtMoney(calc.ivaRecuperable)}</td>
                      <td style={{ ...styles.ovTd, color: pagadoPorItem?.get(it.id) ? "#7FD08A" : "#7A8A93" }}>
                        {fmtMoney(pagadoPorItem?.get(it.id) || 0)}
                      </td>
                      <td style={styles.ovTd}>
                        <button
                          style={styles.rowDeleteBtn}
                          onClick={() => setConfirmDeleteItem({ id: it.id, label: it.descripcion || "este ítem" })}
                        >
                          <Trash2 size={13} />
                        </button>
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
              <MoneyInput style={styles.miniInput} placeholder="$" value={newItem.valorUnitario} onChange={(val) => setNewItem({ ...newItem, valorUnitario: val })} />
            </td>
            <td style={styles.ovTd}>
              <input type="number" style={{ ...styles.miniInput, width: 56 }} placeholder="%" value={newItem.ivaPct} onChange={(e) => setNewItem({ ...newItem, ivaPct: e.target.value })} />
            </td>
            <td style={styles.ovTd} colSpan={2}>
              <input style={styles.miniInput} placeholder="Categoría (ej. Equipos principales)" value={newItem.categoria} onChange={(e) => setNewItem({ ...newItem, categoria: e.target.value })} />
            </td>
            <td style={styles.ovTd}></td>
            <td style={styles.ovTd}></td>
            <td style={styles.ovTd}>
              <button style={styles.addRowBtn} onClick={addItem}><Plus size={14} /></button>
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

// Arma una fila plana por cada pago (y una fila por orden sin pagos). Si el proyecto todavía no
// tiene ninguna orden, arma una fila de ejemplo marcada como tal (para que se sepa que hay que
// borrarla) en vez de una plantilla completamente en blanco.
function buildPagosSheetRows(data) {
  const rows = [];
  if (data.ordenes.length === 0) {
    rows.push({
      numero: "OS-001", proveedor: "Proveedor de ejemplo", descripcion: "Descripción de ejemplo",
      valorTotal: 5000000, fecha: "2026-01-15", valorPagado: 2000000, concepto: "Anticipo", estado: "pagado",
      esEjemplo: true,
    });
    return rows;
  }
  data.ordenes.forEach((o) => {
    const base = { numero: o.numero, proveedor: o.proveedor, descripcion: o.descripcion, valorTotal: o.valorTotal };
    if (o.pagos.length === 0) {
      rows.push({ ...base, fecha: "", valorPagado: "", concepto: "", estado: "" });
    } else {
      o.pagos.forEach((p) => {
        rows.push({ ...base, fecha: p.fecha, valorPagado: p.valor, concepto: p.concepto, estado: p.estado });
      });
    }
  });
  return rows;
}

const PAGOS_COLUMNS = [
  { header: "Número de orden", key: "numero", width: 18 },
  { header: "Proveedor", key: "proveedor", width: 26 },
  { header: "Descripción", key: "descripcion", width: 32 },
  { header: "Valor total orden", key: "valorTotal", width: 20 },
  { header: "Fecha de pago (AAAA-MM-DD)", key: "fecha", width: 24 },
  { header: "Valor pagado", key: "valorPagado", width: 18 },
  { header: "Concepto", key: "concepto", width: 26 },
  { header: "Estado (pagado/programado)", key: "estado", width: 22 },
];
const PAGOS_ACCENT = "FFE77DA8"; // rosa de la pestaña Pagos

async function downloadPagosTemplate(data, projectName) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Parques Solares";
  wb.created = new Date();

  const info = wb.addWorksheet("Instrucciones");
  info.getColumn(1).width = 95;
  info.addRow([`Plantilla de pagos — ${projectName || ""}`]).font = { bold: true, size: 15, color: { argb: PAGOS_ACCENT } };
  info.addRow([]);
  [
    "Cómo llenar esta plantilla:",
    "1. Ve a la pestaña \"Pagos\". Cada fila es un pago.",
    "2. Si una orden tiene varios pagos, repite el mismo \"Número de orden\" en varias filas.",
    "3. Si una orden todavía no tiene ningún pago registrado, deja vacías las columnas de pago",
    "   (Fecha, Valor pagado, Concepto, Estado) y solo llena Número/Proveedor/Descripción/Valor total.",
    "4. \"Estado\" solo acepta pagado o programado — elige de la lista desplegable de esa columna.",
    "5. Las fechas van en formato AAAA-MM-DD, por ejemplo 2026-03-15.",
    "6. Borra la fila de ejemplo (en cursiva) antes de subir el archivo, si no la necesitas.",
    "7. Al subir este archivo a la plataforma, se REEMPLAZAN todas las órdenes de este proyecto",
    "   por lo que traiga el archivo — no se suman a las que ya existen.",
  ].forEach((line, i) => {
    const row = info.addRow([line]);
    if (i === 0) row.font = { bold: true };
  });

  const ws = wb.addWorksheet("Pagos");
  ws.columns = PAGOS_COLUMNS;
  const rows = buildPagosSheetRows(data);
  rows.forEach((r) => {
    const row = ws.addRow(r);
    if (r.esEjemplo) row.font = { italic: true, color: { argb: "FF7A8A93" } };
  });

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAGOS_ACCENT } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "H1" };

  ws.getColumn("valorTotal").numFmt = '"$"#,##0';
  ws.getColumn("valorPagado").numFmt = '"$"#,##0';

  const thin = { style: "thin", color: { argb: "FFDDDDDD" } };
  for (let i = 1; i <= Math.max(rows.length + 1, 30); i++) {
    ws.getRow(i).eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
  }

  const estadoCol = ws.getColumn("estado").letter;
  for (let i = 2; i <= 500; i++) {
    ws.getCell(`${estadoCol}${i}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"pagado,programado"'] };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (projectName || "proyecto").replace(/[^a-z0-9]+/gi, "-");
  a.download = `plantilla-pagos-${safeName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Convierte lo que venga en la celda de fecha (texto, o fecha real de Excel) a "AAAA-MM-DD".
function normalizeExcelDate(val) {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const asProject = parseProjectDate(String(val));
  if (asProject) return asProject;
  const s = String(val).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// Lee el archivo .xlsx que suba la persona y arma la lista de órdenes+pagos (agrupa filas por
// "Número de orden" — varias filas con el mismo número son varios pagos de la misma orden).
function parsePagosWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { cellDates: true });
  // La plantilla trae la hoja "Instrucciones" primero y "Pagos" después — hay que buscarla por
  // nombre, no asumir que es la primera hoja del archivo.
  const sheetName = wb.SheetNames.includes("Pagos") ? "Pagos" : wb.SheetNames[wb.SheetNames.length - 1];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const ordenesMap = new Map();
  let skipped = 0;
  rows.forEach((r) => {
    const numero = String(r["Número de orden"] || "").trim();
    if (!numero) { skipped++; return; }
    if (!ordenesMap.has(numero)) {
      ordenesMap.set(numero, {
        id: uid(),
        numero,
        proveedor: String(r["Proveedor"] || "").trim(),
        descripcion: String(r["Descripción"] || "").trim(),
        valorTotal: parseColombianNumber(r["Valor total orden"]) || Number(r["Valor total orden"]) || 0,
        pagos: [],
      });
    }
    const fecha = normalizeExcelDate(r["Fecha de pago (AAAA-MM-DD)"]);
    const valorRaw = r["Valor pagado"];
    if (fecha && valorRaw !== "" && valorRaw !== undefined) {
      const valor = typeof valorRaw === "number" ? valorRaw : parseColombianNumber(valorRaw);
      const estadoTexto = String(r["Estado (pagado/programado)"] || "pagado").trim().toLowerCase();
      ordenesMap.get(numero).pagos.push({
        id: uid(),
        fecha,
        valor,
        concepto: String(r["Concepto"] || "").trim(),
        estado: estadoTexto === "programado" ? "programado" : "pagado",
      });
    }
  });
  return { ordenes: Array.from(ordenesMap.values()), skipped };
}

function PagosModule({ data, onChange, projectName, presupuestoBase = [] }) {
  const presupuestoGrupos = groupPresupuestoItems(presupuestoBase);
  const presupuestoLabel = (id) => {
    const it = presupuestoBase.find((b) => b.id === id);
    return it ? `${it.item ? `${it.item} · ` : ""}${it.descripcion}` : "";
  };
  const [newOrden, setNewOrden] = useState({ numero: "", proveedor: "", descripcion: "", valorTotal: "", presupuestoItemId: "" });
  const [openId, setOpenId] = useState(null);
  const [newPago, setNewPago] = useState({ fecha: todayISO(), valor: "", concepto: "", estado: "pagado" });
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind: "orden" | "pago", ordenId, pagoId, label } | null
  const [showTemplateUpload, setShowTemplateUpload] = useState(false);
  const totals = pagosTotals(data);
  const alertas = pagosProximosAlertas(data);

  const addOrden = () => {
    if (!newOrden.numero.trim() || !newOrden.valorTotal) return;
    const orden = {
      id: uid(),
      numero: newOrden.numero.trim(),
      proveedor: newOrden.proveedor.trim(),
      descripcion: newOrden.descripcion.trim(),
      valorTotal: Number(newOrden.valorTotal) || 0,
      presupuestoItemId: newOrden.presupuestoItemId || null,
      pagos: [],
    };
    onChange({ ...data, ordenes: [...data.ordenes, orden] });
    setNewOrden({ numero: "", proveedor: "", descripcion: "", valorTotal: "", presupuestoItemId: "" });
    setOpenId(orden.id);
  };
  const updateOrden = (id, patch) => {
    onChange({ ...data, ordenes: data.ordenes.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  };
  const deleteOrden = (id) => onChange({ ...data, ordenes: data.ordenes.filter((o) => o.id !== id) });
  const askDeleteOrden = (o) => setConfirmDelete({ kind: "orden", ordenId: o.id, label: o.numero || "esta orden" });

  const addPago = (ordenId) => {
    if (!newPago.fecha || !newPago.valor) return;
    const pago = { id: uid(), fecha: newPago.fecha, valor: Number(newPago.valor) || 0, concepto: newPago.concepto.trim(), estado: newPago.estado };
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) => (o.id === ordenId ? { ...o, pagos: [...o.pagos, pago] } : o)),
    });
    setNewPago({ fecha: todayISO(), valor: "", concepto: "", estado: "pagado" });
  };
  const deletePago = (ordenId, pagoId) => {
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) => (o.id === ordenId ? { ...o, pagos: o.pagos.filter((p) => p.id !== pagoId) } : o)),
    });
  };
  const askDeletePago = (ordenId, p) =>
    setConfirmDelete({ kind: "pago", ordenId, pagoId: p.id, label: p.concepto ? `${fmtMoney(p.valor)} (${p.concepto})` : fmtMoney(p.valor) });

  const runConfirmedDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "orden") deleteOrden(confirmDelete.ordenId);
    else if (confirmDelete.kind === "pago") deletePago(confirmDelete.ordenId, confirmDelete.pagoId);
    setConfirmDelete(null);
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
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button style={styles.pasteBtn} onClick={() => downloadPagosTemplate(data, projectName)}>
          <FileDown size={14} /> Descargar plantilla Excel
        </button>
        <button style={styles.pasteBtn} onClick={() => setShowTemplateUpload(true)}>
          <FileUp size={14} /> Cargar plantilla Excel
        </button>
      </div>

      {showTemplateUpload && (
        <PagosTemplateModal onClose={() => setShowTemplateUpload(false)} onImport={(ordenes) => { onChange({ ...data, ordenes }); setShowTemplateUpload(false); }} />
      )}

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
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: "#7CA8D8" }}>{fmtMoney(totals.totalProgramado)}</div>
          <div style={styles.overviewStatLabel}>Total programado (pendiente)</div>
        </div>
        <div style={styles.overviewStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: totals.totalSaldo < 0 ? "#E2604F" : totals.totalSaldo > 0 ? "#E8A33D" : "#5FBF8F" }}>{fmtMoney(totals.totalSaldo)}</div>
          <div style={styles.overviewStatLabel}>Saldo pendiente</div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div style={styles.pagosAlertBox}>
          <div style={styles.cardHead}><AlertTriangle size={16} color="#E8A33D" /><span>Pagos programados</span></div>
          <ul style={styles.alertList}>
            {alertas.map((a, i) => (
              <li key={i} style={{ ...styles.alertItem, color: a.tipo === "vencido" ? "#E2604F" : "#E8A33D" }}>{a.texto}</li>
            ))}
          </ul>
        </div>
      )}

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
              const programado = ordenProgramado(o);
              const saldo = ordenSaldo(o);
              const sobrepasado = saldo < 0;
              const pct = o.valorTotal ? Math.round((pagado / o.valorTotal) * 100) : 0;
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
                      {o.presupuestoItemId && presupuestoLabel(o.presupuestoItemId) && (
                        <div style={{ fontSize: 10.5, color: "#7FD08A", marginTop: 3 }}>
                          → {presupuestoLabel(o.presupuestoItemId)}
                        </div>
                      )}
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
                      <MoneyInput
                        style={styles.miniInput}
                        value={o.valorTotal}
                        onChange={(val) => updateOrden(o.id, { valorTotal: val })}
                      />
                    </td>
                    <td style={styles.ovTd}>
                      <OvBar pct={Math.min(100, pct)} label={`${pct}%`} color={sobrepasado ? "#E2604F" : saldo === 0 ? "#5FBF8F" : "#F5B942"} />
                      <div style={{ fontSize: 10.5, color: sobrepasado ? "#E2604F" : "#7A8A93", marginTop: 3, fontFamily: "'JetBrains Mono', monospace", fontWeight: sobrepasado ? 700 : 400 }}>
                        {fmtMoney(pagado)} pagado{programado > 0 ? ` · ${fmtMoney(programado)} programado` : ""} · {sobrepasado ? "excedido en " : "saldo "}{fmtMoney(Math.abs(saldo))}
                      </div>
                    </td>
                    <td style={styles.ovTd}>
                      <button style={styles.rowDeleteBtn} onClick={(e) => { e.stopPropagation(); askDeleteOrden(o); }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ ...styles.ovTd, background: "#12181C" }}>
                        <div style={{ padding: "6px 4px" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: "#B9C4CA" }}>
                            <span>Ítem de presupuesto (opcional):</span>
                            <select
                              style={styles.miniInput}
                              value={o.presupuestoItemId || ""}
                              onChange={(e) => updateOrden(o.id, { presupuestoItemId: e.target.value || null })}
                            >
                              <option value="">Sin vincular</option>
                              {presupuestoGrupos.map((g) => (
                                <optgroup key={g.categoria} label={g.categoria}>
                                  {g.items.map((it) => (
                                    <option key={it.id} value={it.id}>
                                      {it.item ? `${it.item} · ` : ""}{it.descripcion}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </label>
                          <table style={styles.overviewTable}>
                            <thead>
                              <tr>
                                <th style={styles.ovTh}>Estado</th>
                                <th style={styles.ovTh}>Fecha</th>
                                <th style={styles.ovTh}>Valor</th>
                                <th style={styles.ovTh}>Concepto</th>
                                <th style={styles.ovTh}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.pagos.map((p) => {
                                const estado = p.estado || "pagado";
                                return (
                                  <tr key={p.id}>
                                    <td style={styles.ovTd}>
                                      <select
                                        style={styles.miniInput}
                                        value={estado}
                                        onChange={(e) => updatePago(o.id, p.id, { estado: e.target.value })}
                                      >
                                        <option value="pagado">Pagado</option>
                                        <option value="programado">Programado</option>
                                      </select>
                                    </td>
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
                                      <button style={styles.rowDeleteBtn} onClick={() => askDeletePago(o.id, p)}><Trash2 size={13} /></button>
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr>
                                <td style={styles.ovTd}>
                                  <select style={styles.miniInput} value={newPago.estado} onChange={(e) => setNewPago({ ...newPago, estado: e.target.value })}>
                                    <option value="pagado">Pagado</option>
                                    <option value="programado">Programado</option>
                                  </select>
                                </td>
                                <td style={styles.ovTd}>
                                  <input type="date" style={styles.miniInput} value={newPago.fecha} onChange={(e) => setNewPago({ ...newPago, fecha: e.target.value })} />
                                </td>
                                <td style={styles.ovTd}>
                                  <MoneyInput style={styles.miniInput} placeholder="$" value={newPago.valor} onChange={(val) => setNewPago({ ...newPago, valor: val })} />
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
                <select
                  style={{ ...styles.miniInput, marginTop: 4, fontSize: 11 }}
                  value={newOrden.presupuestoItemId}
                  onChange={(e) => setNewOrden({ ...newOrden, presupuestoItemId: e.target.value })}
                >
                  <option value="">Ítem de presupuesto (opcional)</option>
                  {presupuestoGrupos.map((g) => (
                    <optgroup key={g.categoria} label={g.categoria}>
                      {g.items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.item ? `${it.item} · ` : ""}{it.descripcion}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </td>
              <td style={styles.ovTd}>
                <input style={styles.miniInput} placeholder="Proveedor" value={newOrden.proveedor} onChange={(e) => setNewOrden({ ...newOrden, proveedor: e.target.value })} />
              </td>
              <td style={styles.ovTd}>
                <MoneyInput style={styles.miniInput} placeholder="$" value={newOrden.valorTotal} onChange={(val) => setNewOrden({ ...newOrden, valorTotal: val })} />
              </td>
              <td style={styles.ovTd}></td>
              <td style={styles.ovTd}>
                <button style={styles.addRowBtn} onClick={addOrden}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={confirmDelete.kind === "orden" ? "Eliminar orden de servicio" : "Eliminar pago"}
          message={`¿Eliminar ${confirmDelete.kind === "orden" ? "la orden" : "el pago"} "${confirmDelete.label}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={runConfirmedDelete}
        />
      )}
    </div>
  );
}

// Sube el archivo .xlsx lleno y muestra cuántas órdenes/pagos trae antes de aplicar — reemplaza
// TODA la lista de órdenes de este proyecto por lo que traiga el archivo (por eso el aviso).
function PagosTemplateModal({ onClose, onImport }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null); // { ordenes, skipped, totalPagos } | null
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    setFileName(file.name);
    setError("");
    setPreview(null);
    try {
      const buf = await file.arrayBuffer();
      const { ordenes, skipped } = parsePagosWorkbook(buf);
      const totalPagos = ordenes.reduce((s, o) => s + o.pagos.length, 0);
      setPreview({ ordenes, skipped, totalPagos });
    } catch (err) {
      console.error("Error leyendo plantilla de pagos:", err);
      setError(`No se pudo leer ese archivo. ¿Es un .xlsx válido? (${err?.message || "error desconocido"})`);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.exportModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Cargar plantilla de pagos</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>
          Sube el archivo .xlsx que descargaste y llenaste. Esto <strong>reemplaza todas las órdenes de servicio</strong> de
          este proyecto por lo que traiga el archivo — descarga la plantilla actual primero si no quieres perder nada.
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
              Se detectaron <strong>{preview.ordenes.length}</strong> órdenes con <strong>{preview.totalPagos}</strong> pagos en total.
              {preview.skipped > 0 && <> Se ignoraron {preview.skipped} filas sin número de orden.</>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.confirmCancelBtn} onClick={() => { setPreview(null); setFileName(""); }}>Elegir otro archivo</button>
              <button
                style={{ ...styles.addProjectBtn, opacity: preview.ordenes.length ? 1 : 0.5 }}
                disabled={!preview.ordenes.length}
                onClick={() => onImport(preview.ordenes)}
              >
                Reemplazar con {preview.ordenes.length} órdenes
              </button>
            </div>
          </>
        )}
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
const COLOMBIA_DEPARTAMENTOS = Object.keys(COLOMBIA_LOCATIONS).sort((a, b) => a.localeCompare(b, "es"));

// Intenta reconocer "Municipio, Departamento" en el texto de ubicación guardado (para proyectos
// editados que ya traían ese formato); si no matchea ningún departamento conocido, arranca vacío.
function parseUbicacion(location) {
  const [muniRaw, depRaw] = String(location || "").split(",").map((s) => s.trim());
  if (depRaw && COLOMBIA_LOCATIONS[depRaw]?.includes(muniRaw)) {
    return { departamento: depRaw, municipio: muniRaw };
  }
  return { departamento: "", municipio: "" };
}

function ProjectFormModal({ onClose, onSave, initial, title, submitLabel }) {
  const [name, setName] = useState(initial?.name || "");
  const [capacity, setCapacity] = useState(initial?.capacity || "");
  const initialUbicacion = parseUbicacion(initial?.location);
  const [departamento, setDepartamento] = useState(initialUbicacion.departamento);
  const [municipio, setMunicipio] = useState(initialUbicacion.municipio);

  const location = departamento && municipio ? `${municipio}, ${departamento}` : "";

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
          <span>Departamento</span>
          <select
            style={styles.input}
            value={departamento}
            onChange={(e) => { setDepartamento(e.target.value); setMunicipio(""); }}
          >
            <option value="">Selecciona un departamento…</option>
            {COLOMBIA_DEPARTAMENTOS.map((dep) => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
        </label>
        <label style={styles.modalField}>
          <span>Municipio</span>
          <select
            style={styles.input}
            value={municipio}
            disabled={!departamento}
            onChange={(e) => setMunicipio(e.target.value)}
          >
            <option value="">{departamento ? "Selecciona un municipio…" : "Elige primero el departamento"}</option>
            {(COLOMBIA_LOCATIONS[departamento] || []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <button
          style={{ ...styles.addProjectBtn, marginTop: 8, opacity: name.trim() ? 1 : 0.5 }}
          disabled={!name.trim()}
          onClick={() => onSave(name.trim(), capacity.trim(), location)}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

const TAB_LABELS = {
  resumen: "Resumen", upme: "UPME", energizacion: "Energización",
  cronograma: "Cronograma", presupuesto: "Presupuesto", pagos: "Pagos",
};

// Lista quién guardó cambios en el proyecto y cuándo (tabla project_history). Es de solo lectura —
// no restaura nada directamente, para evitar que un clic accidental pise trabajo reciente; si hace
// falta volver a un estado anterior, se descarga esa foto en JSON y se usa "Importar" a mano.
function HistoryModal({ project, onClose }) {
  const [rows, setRows] = useState(null); // null = cargando
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("project_history")
        .select("id, data, updated_by_email, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      if (error) setError(true);
      else setRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  const downloadSnapshot = (row) => {
    const bundle = { exportedAt: row.created_at, projects: [project], projectData: { [project.id]: row.data } };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-${project.name.replace(/[^a-z0-9]+/gi, "-")}-${row.created_at.slice(0, 16).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Historial de cambios</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.confirmMsg}>
          Últimos guardados de "{project.name}". Cada fila descarga una foto de cómo estaba el proyecto en ese momento.
        </p>
        {error ? (
          <div style={{ color: "#E2604F", fontSize: 13 }}>No se pudo cargar el historial. ¿Ya corriste la migración de "project_history" en Supabase?</div>
        ) : rows === null ? (
          <div style={{ color: "#7A8A93", fontSize: 13 }}>Cargando…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: "#7A8A93", fontSize: 13 }}>Todavía no hay historial registrado para este proyecto.</div>
        ) : (
          <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r) => (
              <button
                key={r.id}
                style={{ ...styles.exportOptionBtn, display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left" }}
                onClick={() => downloadSnapshot(r)}
                title="Descargar esta versión como JSON"
              >
                <span>{fmtDateTime(new Date(r.created_at))}</span>
                <span style={{ color: "#7A8A93", fontSize: 11.5 }}>{r.updated_by_email || "—"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportPdfModal({ tab, onClose, onChoose }) {
  const options = [
    { key: "project", label: "Resumen del proyecto" },
    ...(tab !== "resumen" ? [{ key: "tab", label: `Pestaña actual (${TAB_LABELS[tab] || tab})` }] : []),
    { key: "general", label: "Resumen general (todos los proyectos)" },
  ];
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Exportar PDF</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.confirmMsg}>Elige qué quieres exportar. Se abrirá el diálogo de impresión — elige "Guardar como PDF".</p>
        <div style={styles.exportOptionList}>
          {options.map((o) => (
            <button key={o.key} style={styles.exportOptionBtn} onClick={() => onChoose(o.key)}>
              {o.label}
            </button>
          ))}
        </div>
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
const prCard = {
  page: { display: "none" },
  wrap: { background: "#F7F8F9", color: "#1A1A1A", fontFamily: "Arial, Helvetica, sans-serif", padding: "26px 30px" },
  headerRow: { marginBottom: 20 },
  h1: { fontSize: 22, margin: "0 0 2px", fontWeight: 700, color: "#111" },
  meta: { fontSize: 12, color: "#555", marginBottom: 2 },
  genAt: { fontSize: 10.5, color: "#999" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 },
  card: { background: "#fff", border: "1px solid #E2E5E8", borderRadius: 10, padding: "16px 18px", breakInside: "avoid" },
  cardHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: "#333", marginBottom: 10 },
  bigPctRow: { display: "flex", alignItems: "center", gap: 10 },
  bigPctTrack: { flex: 1, height: 7, background: "#E9ECEF", borderRadius: 6, overflow: "hidden" },
  bigPctFill: { height: "100%", borderRadius: 6 },
  bigPctNum: { fontSize: 17, fontWeight: 700, minWidth: 44, textAlign: "right" },
  cardSub: { fontSize: 11, color: "#666", marginTop: 8 },
  statCard: { background: "#fff", border: "1px solid #E2E5E8", borderRadius: 10, padding: "12px 14px", textAlign: "center" },
  statNum: { fontSize: 19, fontWeight: 700, color: "#111" },
  statLabel: { fontSize: 10, color: "#777", marginTop: 3 },
  alertsCard: { background: "#fff", border: "1px solid #E2E5E8", borderRadius: 10, padding: "16px 18px", marginTop: 4, breakInside: "avoid" },
  alertItem: { fontSize: 11.5, color: "#8A5A00", marginBottom: 5 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 6 },
  th: { textAlign: "left", padding: "6px 10px", borderBottom: "2px solid #ddd", color: "#555", fontWeight: 700, fontSize: 10 },
  td: { padding: "6px 10px", borderBottom: "1px solid #eee" },
  tdBarTrack: { display: "inline-block", width: 70, height: 6, background: "#E9ECEF", borderRadius: 4, overflow: "hidden", verticalAlign: "middle", marginRight: 6 },
  tdBarFill: { display: "block", height: "100%", borderRadius: 4 },
  groupHead: {
    display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12,
    background: "#F0F0F0", padding: "6px 10px", borderRadius: 4, marginTop: 14,
  },
  section: { marginBottom: 4, breakInside: "avoid" },
};

function PrCardHead({ color, children }) {
  return (
    <div style={prCard.cardHead}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      {children}
    </div>
  );
}

function PrBigPct({ pct, color, label }) {
  return (
    <div style={prCard.bigPctRow}>
      <div style={prCard.bigPctTrack}><div style={{ ...prCard.bigPctFill, width: `${pct}%`, background: color }} /></div>
      <span style={{ ...prCard.bigPctNum, color }}>{label ?? `${pct}%`}</span>
    </div>
  );
}

// Vista de impresión que reproduce el mismo diseño de tarjetas del Resumen en pantalla,
// adaptado a fondo claro para imprimir (en vez de un reporte tipo documento).
function PrintResumenProject({ project, data }) {
  const upmePct = upmeProgress(data.upme);
  const enerPct = energizacionProgress(data.energizacion);
  const nextMs = nextEnergizacionMilestone(data.energizacion);
  const elapsed = data.energizacion.fechaInicio ? daysBetween(data.energizacion.fechaInicio, todayISO()) : null;
  const presTotals = presupuestoTotals(data.presupuesto);
  const desviacionPct = presTotals.base ? Math.round((presTotals.diferencia / presTotals.base) * 100) : 0;
  const pagTotals = pagosTotals(data.pagos);
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
        </div>

        <div style={prCard.alertsCard}>
          <PrCardHead color="#E8A33D">Alertas</PrCardHead>
          {alerts.length === 0 ? (
            <div style={prCard.cardSub}>Sin alertas por ahora.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {alerts.map((a, i) => <li key={i} style={prCard.alertItem}>{a}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Igual que arriba, pero para el Resumen general (todos los proyectos a la vez).
function PrintResumenGeneral({ projects, projectData }) {
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
function PrintCurrentTab({ project, tab, data }) {
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
        ) : null}
      </div>
    </div>
  );
}

function PrintUpmeContent({ data }) {
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

function PrintEnergizacionContent({ data }) {
  let cursor = 0;
  return (
    <div>
      {ENERGIZACION_GROUPS.map((g) => {
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

function PrintCronogramaContent({ data }) {
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

function PrintPresupuestoContent({ data }) {
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

function PrintPagosContent({ data }) {
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

      .readonly-gate input,
      .readonly-gate select,
      .readonly-gate textarea,
      .readonly-gate button:not(.view-toggle) {
        pointer-events: none;
        opacity: 0.6;
      }

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
  brandLogo: { width: 34, height: 34, borderRadius: 8, objectFit: "cover", flexShrink: 0 },
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
  cardClickable: { cursor: "pointer", transition: "border-color 120ms, background 120ms" },
  cardHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#B9C4CA", marginBottom: 14, fontWeight: 600 },
  cardSub: { color: "#7A8A93", fontSize: 12.5, marginTop: 10 },
  bigPctWrap: { display: "flex", alignItems: "center", gap: 14 },
  bigPctTrack: { flex: 1, height: 8, background: "#232D33", borderRadius: 6, overflow: "hidden" },
  bigPctFill: { height: "100%", borderRadius: 6 },
  bigPctNum: { fontFamily: FONT_MONO, fontSize: 20, fontWeight: 700, minWidth: 52, textAlign: "right" },
  alertList: { margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8 },
  alertItem: { fontSize: 13, color: "#E8A33D" },
  alertsByProjectList: { display: "flex", flexDirection: "column", gap: 16 },
  alertsByProjectGroup: {},
  alertsByProjectName: {
    fontSize: 13, fontWeight: 700, color: "#E8EDEF", marginBottom: 6, cursor: "pointer", width: "fit-content",
  },

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
  exportOptionList: { display: "flex", flexDirection: "column", gap: 8 },
  exportOptionBtn: {
    background: "#1C242A", border: "1px solid #2A3339", color: "#E8EDEF", borderRadius: 8,
    padding: "12px 14px", fontSize: 13, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 500,
    textAlign: "left",
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
  overviewHeader: {
    padding: "22px 32px 14px", borderBottom: "1px solid #1E282E",
    display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12,
  },
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
  cronoComputedDate: {
    fontFamily: FONT_MONO, fontSize: 11.5, color: "#7A8A93", padding: "0 6px", display: "inline-block", cursor: "default",
  },
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
  attachBtn: {
    display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "1px solid #2A3339",
    borderRadius: 6, color: "#7A8A93", cursor: "pointer", padding: "3px 6px", fontSize: 10.5, fontFamily: FONT_MONO,
  },
  attachPopover: {
    position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, background: "#171E23",
    border: "1px solid #2A3339", borderRadius: 10, padding: 10, width: 260, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  attachRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "5px 2px",
    borderBottom: "1px solid #232D33", fontSize: 11.5, color: "#E8EDEF",
  },

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
  presExcedidoTag: { color: "#E2604F", fontSize: 10, fontWeight: 700, textTransform: "none", letterSpacing: 0 },
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

  // UPME step timeline
  upmeStepList: { display: "flex", flexDirection: "column", gap: 10 },
  upmeStepCard: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, padding: "14px 16px" },
  upmeStepCardSkipped: { opacity: 0.55 },
  upmeStepHead: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  upmeStepNum: {
    width: 30, height: 30, borderRadius: "50%", border: "1.5px solid", display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: FONT_MONO, flexShrink: 0,
  },
  upmeStepLabel: { fontSize: 13.5, color: "#E8EDEF", fontWeight: 500 },
  upmeSkippedTag: { fontSize: 10.5, color: "#5A6870", marginTop: 2 },
  upmeCheckToggle: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#7A8A93", cursor: "pointer" },
  upmeStepBody: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12, paddingLeft: 42 },
  upmeDecisionBox: {
    display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#B9C4CA",
    background: "#1C242A", border: "1px solid #2A3339", borderRadius: 8, padding: "8px 12px",
  },
  pagosAlertBox: {
    background: "#171E23", border: "1px solid #E8A33D55", borderRadius: 12, padding: "14px 18px", marginBottom: 18,
  },
  readonlyBanner: {
    display: "flex", alignItems: "center", gap: 8, margin: "0 32px", padding: "8px 14px",
    background: "#1C242A", border: "1px solid #2A3339", borderRadius: 8, color: "#7A8A93", fontSize: 12,
  },
};
