import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, ChevronRight, ChevronDown, Sun, FileCheck, Zap, MapPin, Calendar,
  AlertTriangle, CheckCircle2, Circle, Trash2, Loader2, FileDown, Save,
  LayoutGrid, Copy, Check, DollarSign, Wallet, Pencil, ClipboardPaste, Clock, Paperclip, FileUp, Users, Link2,
  Landmark, Search, Settings,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend as RLegend, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from "recharts";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { supabase } from "./lib/supabaseClient";
import { COLOMBIA_LOCATIONS } from "./lib/colombiaLocations";
import Login from "./components/Login";
import CronogramaGantt from "./components/CronogramaGantt";
import gumarLogo from "./assets/gumar-logo.jpg";
import {
  UPME_STEPS,
  CAT_STYLE, STATUS_LABELS, uid, todayISO, daysBetween, addYears, addMonths, fmtDate, fmtTime, fmtDateTime,
  emptyUpmeState, emptyEnergizacionState, emptyCronogramaState, emptyPresupuestoState, emptyPagosState,
  emptyBalanceState, balanceTotals, balanceMargenTotals, balanceFlujoCaja, balanceHitosAlertas,
  emptyProyectoInfoState, buildEnergizacionCurvaSData, buildCortesObra,
  cronogramaCurvaSAlerta,
  clonePresupuestoState, cloneCronogramaState, clonePagosState, cloneBalanceState, cloneUpmeState, cloneEnergizacionState,
  emptyProjectData, ensureFullProjectData, buildPresupuestoBaseFromTemplate, buildCronogramaBaseFromTemplate,
  fractionElapsed, cronogramaPesoTotal, buildCurvaSData,
  parseCronogramaPaste, cronogramaAvanceActual, matchCronogramaTasks, applyCronogramaMerge,
  parsePredecesoras, computeCronogramaSchedule, parseProjectDate,
  upmeProgress, upmeActiveSteps, upmeNextStep, energizacionProgress, nextEnergizacionMilestone, energizacionFpoAlerta,
  classifyEnergizacionTipo, energizacionGroupsFor, energizacionDiasRefFor,
  presupuestoTotals, presupuestoListTotal, groupPresupuestoItems, calcPresupuestoItem, parsePresupuestoPaste,
  parseColombianNumber,
  ordenPagado, ordenProgramado, ordenSaldo, pagosTotals, pagosProximosAlertas, fmtMoney,
} from "./lib/data.js";
import { buildInformeProyecto } from "./lib/informePPI01.js";
import { buildInformePPI01Workbook } from "./lib/informePPI01Excel.js";

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
  const [managingMembers, setManagingMembers] = useState(null); // project object | null
  const [showCargosModal, setShowCargosModal] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [pagosExportRange, setPagosExportRange] = useState(null); // { from, to } | null
  const [showImportText, setShowImportText] = useState(false);
  const [view, setView] = useState("overview"); // "overview" | "project"
  const [printTarget, setPrintTarget] = useState(null); // null | "project" | "general" | "tab"
  const [showExportModal, setShowExportModal] = useState(false);
  const [showInformePPI01Modal, setShowInformePPI01Modal] = useState(false);
  const [informePPI01Ids, setInformePPI01Ids] = useState(null); // array de project ids | null (dispara la vista de impresión)
  const [showHistory, setShowHistory] = useState(false);
  const [role, setRole] = useState("editor"); // "admin" | "editor" | "lector" — "editor" es el default seguro
  const [cargoPerms, setCargoPerms] = useState({}); // casillas del cargo asignado (ver tabla "cargos") — vacío = sin permisos
  const [myFullName, setMyFullName] = useState("");
  const [myCargoName, setMyCargoName] = useState(""); // nombre del cargo asignado (para "Cargo del responsable" del informe PP-I-01)
  const isAdmin = role === "admin";
  const isLector = role === "lector";
  // admin siempre puede todo; lector nunca puede editar nada (sin importar el cargo); el resto
  // depende de si su cargo tiene esa casilla marcada.
  const hasPerm = useCallback((key) => isAdmin || (!isLector && !!cargoPerms?.[key]), [isAdmin, isLector, cargoPerms]);
  const canDeleteProjects = hasPerm("puede_eliminar_proyectos");
  const canManageUsers = hasPerm("puede_gestionar_usuarios");

  useEffect(() => {
    const onAfterPrint = () => { setPrintTarget(null); setPagosExportRange(null); setInformePPI01Ids(null); };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);


  const rowToProject = (row) => ({ id: row.id, name: row.name, capacity: row.capacity, location: row.location, code: row.code || "", createdAt: row.created_at });

  // Initial load: full project list + el rol y cargo de quien inició sesión (para permisos)
  useEffect(() => {
    (async () => {
      const [{ data, error }, roleResult] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: true }),
        supabase.from("profiles").select("role, full_name, cargos(*)").eq("id", user.id).maybeSingle(),
      ]);
      if (!error && data) setProjects(data.map(rowToProject));
      // Si la columna "role"/"cargo_id" todavía no existe (no se ha corrido la migración) o no hay
      // perfil/cargo asignado, se queda en los valores por defecto — no rompe el acceso de nadie.
      if (!roleResult.error && roleResult.data?.role) setRole(roleResult.data.role);
      if (!roleResult.error && roleResult.data?.cargos) setCargoPerms(roleResult.data.cargos);
      if (!roleResult.error && roleResult.data?.cargos?.nombre) setMyCargoName(roleResult.data.cargos.nombre);
      if (!roleResult.error && roleResult.data?.full_name) setMyFullName(roleResult.data.full_name);
      setLoading(false);
    })();
  }, []);

  const loadProjectData = useCallback(async (id) => {
    try {
      const { data, error } = await supabase.from("project_data").select("*").eq("project_id", id).maybeSingle();
      if (error) throw error;
      if (data) {
        setProjectData((prev) => ({ ...prev, [id]: ensureFullProjectData({ upme: data.upme, energizacion: data.energizacion, cronograma: data.cronograma, presupuesto: data.presupuesto, pagos: data.pagos, balance: data.balance, info: data.info }) }));
      } else {
        const fresh = emptyProjectData();
        await supabase.from("project_data").insert({
          project_id: id, upme: fresh.upme, energizacion: fresh.energizacion, cronograma: fresh.cronograma, presupuesto: fresh.presupuesto, pagos: fresh.pagos, balance: fresh.balance, info: fresh.info, updated_by: user.id,
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
        balance: data.balance,
        info: data.info,
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
      const snapshot = { upme: data.upme, energizacion: data.energizacion, cronograma: data.cronograma, presupuesto: data.presupuesto, pagos: data.pagos, balance: data.balance, info: data.info };
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

  // cloneFrom: null, o { sourceProjectId, modules: { upme, energizacion, cronograma, presupuesto, pagos, balance } }
  // — cada módulo marcado se copia tal cual del proyecto de origen (con ids nuevos); los que no se
  // marcan arrancan como en un proyecto nuevo normal (plantilla base para presupuesto/cronograma).
  const addProject = async (name, capacity, location, cloneFrom, code) => {
    const { data, error } = await supabase.from("projects").insert({ name, capacity, location, code: code || null, created_by: user.id }).select().single();
    if (error || !data) { setSaveError(true); return; }
    const newProject = rowToProject(data);
    setProjects((prev) => [...prev, newProject]);
    // El presupuesto y el cronograma arrancan con las plantillas base en vez de vacíos, para no
    // tener que digitar todo desde cero en cada proyecto nuevo.
    const fresh = {
      ...emptyProjectData(),
      presupuesto: buildPresupuestoBaseFromTemplate(),
      cronograma: buildCronogramaBaseFromTemplate(),
      // >1MWp usa el trámite de energización ante el CND en vez del trámite ante el OR de siempre.
      energizacion: emptyEnergizacionState(classifyEnergizacionTipo(capacity)),
    };
    if (cloneFrom?.sourceProjectId) {
      const { data: srcRow } = await supabase.from("project_data").select("*").eq("project_id", cloneFrom.sourceProjectId).maybeSingle();
      const src = ensureFullProjectData(srcRow || {});
      const mods = cloneFrom.modules || {};
      if (mods.upme) fresh.upme = cloneUpmeState(src.upme);
      if (mods.energizacion) fresh.energizacion = cloneEnergizacionState(src.energizacion);
      if (mods.cronograma) fresh.cronograma = cloneCronogramaState(src.cronograma);
      if (mods.presupuesto) fresh.presupuesto = clonePresupuestoState(src.presupuesto);
      if (mods.pagos) fresh.pagos = clonePagosState(src.pagos);
      if (mods.balance) fresh.balance = cloneBalanceState(src.balance);
    }
    await supabase.from("project_data").insert({
      project_id: newProject.id, upme: fresh.upme, energizacion: fresh.energizacion, cronograma: fresh.cronograma, presupuesto: fresh.presupuesto, pagos: fresh.pagos, balance: fresh.balance, info: fresh.info, updated_by: user.id,
    });
    setProjectData((prev) => ({ ...prev, [newProject.id]: fresh }));
    setSelectedId(newProject.id);
    setView("project");
    setShowAddProject(false);
  };

  const updateProjectInfo = async (id, name, capacity, location, code) => {
    const { error } = await supabase.from("projects").update({ name, capacity, location, code: code || null }).eq("id", id);
    if (error) { setSaveError(true); return; }
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name, capacity, location, code: code || "" } : p)));
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
  const tabReadOnly = tab !== "resumen" && !hasPerm(TAB_PERM_KEY[tab]);

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
          onManageMembers={(p) => setManagingMembers(p)}
          onManageCargos={() => setShowCargosModal(true)}
          projectData={projectData}
          onExport={exportData}
          onImportFile={importData}
          onImportText={() => setShowImportText(true)}
          userEmail={user.email}
          onSignOut={() => supabase.auth.signOut()}
          myFullName={myFullName}
          onEditName={() => setShowEditNameModal(true)}
          isAdmin={isAdmin}
          isLector={isLector}
          canDeleteProjects={canDeleteProjects}
          canManageUsers={canManageUsers}
        />
        <main className="app-main" style={styles.main}>
          {projects.length === 0 ? (
            <EmptyState onAdd={() => setShowAddProject(true)} />
          ) : view === "overview" ? (
            <div style={{ background: OVERVIEW_LIGHT.page, minHeight: "100%" }}>
              <div style={{ ...styles.overviewHeader, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>
                <div>
                  <h1 style={{ ...styles.h1, color: OVERVIEW_LIGHT.pageTextPrimary, fontFamily: FONT_BRAND_DISPLAY }}>Resumen general</h1>
                  <div style={{ ...styles.headerMeta, color: OVERVIEW_LIGHT.pageTextSecondary, fontFamily: FONT_BRAND_BODY }}>
                    {projects.length} proyecto{projects.length === 1 ? "" : "s"} activos
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="no-print"
                    style={{ ...styles.pdfBtn, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY }}
                    onClick={() => { setPrintTarget("general"); setTimeout(() => window.print(), 50); }}
                  >
                    <FileDown size={14} /> Exportar PDF
                  </button>
                  <button
                    className="no-print"
                    style={{ ...styles.pdfBtn, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY }}
                    onClick={() => setShowInformePPI01Modal(true)}
                  >
                    <FileDown size={14} /> Exportar informe PP-I-01
                  </button>
                </div>
              </div>
              <div style={{ ...styles.content, fontFamily: FONT_BRAND_BODY }}>
                <ResumenGeneral
                  projects={projects}
                  projectData={projectData}
                  onOpenProject={(id, targetTab) => { setSelectedId(id); setView("project"); setTab(targetTab || "resumen"); }}
                />
              </div>
            </div>
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
              {tabReadOnly && (
                <div style={styles.readonlyBanner}>
                  <Circle size={12} /> Modo solo lectura en esta pestaña — puedes ver y exportar, pero no editar.
                </div>
              )}
              <div style={styles.content} className={tabReadOnly ? "readonly-gate" : undefined}>
                {!data ? (
                  <div style={{ color: "#8B9AA3", padding: 40 }}>Cargando proyecto…</div>
                ) : tab === "resumen" ? (
                  <Resumen
                    data={data}
                    setTab={setTab}
                    onChangeInfo={(nextInfo) => updateProjectData(selectedId, (cur) => ({ ...cur, info: nextInfo }))}
                  />
                ) : tab === "upme" ? (
                  <UpmeModule
                    data={data.upme}
                    onChange={(nextUpme) => updateProjectData(selectedId, (cur) => ({ ...cur, upme: nextUpme }))}
                    projectId={selectedId}
                    isLector={tabReadOnly}
                  />
                ) : tab === "energizacion" ? (
                  <EnergizacionModule
                    data={data.energizacion}
                    onChange={(nextEner) => updateProjectData(selectedId, (cur) => ({ ...cur, energizacion: nextEner }))}
                    projectId={selectedId}
                    isLector={tabReadOnly}
                  />
                ) : tab === "cronograma" ? (
                  <CronogramaModule
                    data={data.cronograma}
                    onChange={(nextCrono) => updateProjectData(selectedId, (cur) => ({ ...cur, cronograma: nextCrono }))}
                    projectId={selectedId}
                    isLector={tabReadOnly}
                  />
                ) : tab === "presupuesto" ? (
                  <PresupuestoModule
                    data={data.presupuesto}
                    onChange={(nextPres) => updateProjectData(selectedId, (cur) => ({ ...cur, presupuesto: nextPres }))}
                    pagos={data.pagos}
                    projectName={selected.name}
                  />
                ) : tab === "pagos" ? (
                  <PagosModule
                    data={data.pagos}
                    onChange={(nextPagos) => updateProjectData(selectedId, (cur) => ({ ...cur, pagos: nextPagos }))}
                    projectName={selected.name}
                    presupuestoBase={data.presupuesto.base}
                    canAprobarPagos={hasPerm("puede_aprobar_pagos")}
                    approverName={myFullName || user.email}
                    onExportProgramados={(range) => {
                      setPagosExportRange(range);
                      setTimeout(() => window.print(), 50);
                    }}
                  />
                ) : (
                  <BalanceModule
                    data={data.balance}
                    onChange={(nextBalance) => updateProjectData(selectedId, (cur) => ({ ...cur, balance: nextBalance }))}
                    pagos={data.pagos}
                    presupuesto={data.presupuesto}
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
      {pagosExportRange && selected && data && (
        <PrintPagosRangeContent project={selected} data={data.pagos} range={pagosExportRange} />
      )}
      {informePPI01Ids && (
        <PrintInformePPI01
          projects={projects.filter((p) => informePPI01Ids.includes(p.id))}
          projectDataById={projectData}
        />
      )}
      {showInformePPI01Modal && (
        <InformePPI01Modal
          projects={projects}
          onClose={() => setShowInformePPI01Modal(false)}
          onExportExcel={async (ids, { periodoDesde, periodoHasta } = {}) => {
            const selProjects = projects.filter((p) => ids.includes(p.id));
            const logoBuffer = await fetch(gumarLogo).then((r) => r.arrayBuffer());
            // Se vuelve a consultar el nombre/cargo justo antes de exportar (en vez de usar
            // myFullName/myCargoName, que solo se cargan una vez al abrir la sesión) — así, si
            // acabas de asignarte un cargo en el panel de Cargos, el informe ya lo refleja sin
            // tener que recargar la página.
            const { data: freshProfile } = await supabase.from("profiles").select("full_name, cargos(nombre)").eq("id", user.id).maybeSingle();
            const buffer = await buildInformePPI01Workbook(selProjects, projectData, {
              logoBuffer,
              periodoDesde,
              periodoHasta,
              fechaPresentacion: todayISO(),
              responsableNombre: freshProfile?.full_name || myFullName || user.email,
              responsableCargo: freshProfile?.cargos?.nombre || myCargoName,
              soloInfoBase: true,
            });
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `informe-ppi01-${todayISO()}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
            setShowInformePPI01Modal(false);
          }}
          onExportPDF={(ids) => {
            setShowInformePPI01Modal(false);
            setInformePPI01Ids(ids);
            setTimeout(() => window.print(), 50);
          }}
        />
      )}
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
          existingProjects={projects}
        />
      )}
      {editingProject && (
        <ProjectFormModal
          title="Editar proyecto"
          submitLabel="Guardar cambios"
          initial={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={(name, capacity, location, _cloneFrom, code) => {
            updateProjectInfo(editingProject.id, name, capacity, location, code);
            setEditingProject(null);
          }}
        />
      )}
      {managingMembers && (
        <ProjectMembersModal project={managingMembers} onClose={() => setManagingMembers(null)} />
      )}
      {showCargosModal && (
        <CargosModal onClose={() => setShowCargosModal(false)} />
      )}
      {showEditNameModal && (
        <EditNameModal
          userId={user.id}
          currentName={myFullName}
          onClose={() => setShowEditNameModal(false)}
          onSaved={(name) => { setMyFullName(name); setShowEditNameModal(false); }}
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

function Sidebar({ projects, selectedId, view, onOverview, onSelect, onAdd, onDelete, onEditProject, onManageMembers, onManageCargos, projectData, onExport, onImportFile, onImportText, userEmail, onSignOut, myFullName, onEditName, isAdmin, isLector, canDeleteProjects, canManageUsers }) {
  const fileInputRef = React.useRef(null);
  const [footerOpen, setFooterOpen] = useState(false);

  return (
    <aside className="app-sidebar" style={styles.sidebar}>
      <div style={styles.brand}>
        <img src={gumarLogo} alt="Gumar Proyectos" style={styles.brandLogo} />
        <div style={styles.brandWordmark}>
          <div style={styles.brandWordmarkLine}>GUMAR</div>
          <div style={styles.brandWordmarkLine}>PROYECTOS</div>
        </div>
      </div>

      <button
        className="sb-nav-btn"
        style={{ ...styles.overviewNavBtn, ...(view === "overview" ? styles.overviewNavBtnActive : {}) }}
        onClick={onOverview}
      >
        <LayoutGrid size={15} /> Resumen general
      </button>

      {canManageUsers && (
        <button className="sb-nav-btn" style={styles.overviewNavBtn} onClick={onManageCargos}>
          <Users size={15} /> Cargos y usuarios
        </button>
      )}

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
                  {canManageUsers && (
                    <button
                      style={styles.deleteBtn}
                      title="Gestionar acceso"
                      onClick={(e) => {
                        e.stopPropagation();
                        onManageMembers(p);
                      }}
                    >
                      <Users size={13} />
                    </button>
                  )}
                  {canDeleteProjects && (
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
          Conectado como <strong>{myFullName || userEmail}</strong> — solo ves los proyectos a los que te dieron acceso.
        </div>
        {footerOpen && (
          <>
            <button style={styles.footerBtnFull} onClick={onEditName}>
              {myFullName ? "Editar mi nombre" : "Agregar mi nombre"}
            </button>
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
          </>
        )}
        <button
          className="sb-nav-btn"
          style={{ ...styles.footerToggleBtn, ...(footerOpen ? styles.footerToggleBtnActive : {}) }}
          onClick={() => setFooterOpen((v) => !v)}
        >
          <Settings size={14} />
          <span style={{ flex: 1, textAlign: "left" }}>Más opciones</span>
          {footerOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
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
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
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

  const handleAddLink = async () => {
    const url = linkUrl.trim();
    if (!url) return;
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("attachments").insert({
      project_id: projectId, modulo, entidad_id: String(entidadId),
      link_url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
      file_name: linkLabel.trim() || url,
      uploaded_by: userData?.user?.id, uploaded_by_email: userData?.user?.email,
    });
    setLinkUrl("");
    setLinkLabel("");
    await load();
    setBusy(false);
  };

  const handleDownload = async (att) => {
    if (att.link_url) { window.open(att.link_url, "_blank"); return; }
    const { data } = await supabase.storage.from("project-files").createSignedUrl(att.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (att) => {
    setBusy(true);
    if (att.file_path) await supabase.storage.from("project-files").remove([att.file_path]);
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
                    style={{ cursor: "pointer", color: "#4FA8D8", display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={f.link_url || f.file_name}
                  >
                    {f.link_url ? <Link2 size={11} style={{ flexShrink: 0 }} /> : <Paperclip size={11} style={{ flexShrink: 0 }} />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{f.file_name}</span>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                <input
                  placeholder="Nombre (opcional)"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  style={{ ...styles.miniInput, width: "100%" }}
                />
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    placeholder="Pega un enlace (Drive, SharePoint...)"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    style={{ ...styles.miniInput, flex: 1 }}
                  />
                  <button
                    type="button"
                    style={{ ...styles.iconBtn, opacity: busy || !linkUrl.trim() ? 0.5 : 1 }}
                    disabled={busy || !linkUrl.trim()}
                    onClick={handleAddLink}
                    title="Adjuntar enlace"
                  >
                    <Link2 size={13} />
                  </button>
                </div>
              </div>
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
        <div style={styles.headerEyebrow}>Control de Parques</div>
        <h1 style={styles.h1}>{project.name}</h1>
        <div style={styles.headerMeta}>
          {project.capacity ? `${project.capacity} MWp` : ""}{project.location ? `  ·  ${project.location}` : ""}
        </div>
      </div>
      <div style={styles.headerRight}>
        <div style={styles.tabs} className="app-tabs">
          <TabBtn active={tab === "resumen"} onClick={() => setTab("resumen")} icon={<MapPin size={14} />} label="Resumen" />
          <TabBtn active={tab === "balance"} onClick={() => setTab("balance")} icon={<Landmark size={14} />} label="Balance financiero" />
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

// Cada alerta trae su módulo de origen ("modulo") además del texto — así el Resumen general puede
// mostrar solo "Presupuesto (1) · Cronograma (12)" sin el detalle, y el Resumen del proyecto puede
// seguir mostrando el texto completo. Cronograma es la excepción: como puede generar una alerta por
// cada actividad atrasada (fácilmente decenas), se condensa a una sola línea con el conteo incluso
// en el Resumen del proyecto — los demás módulos siguen mostrando cada alerta tal cual.
function buildProjectAlerts(data) {
  const nextMs = nextEnergizacionMilestone(data.energizacion);
  const elapsed = data.energizacion.fechaInicio ? daysBetween(data.energizacion.fechaInicio, todayISO()) : null;
  const presTotals = presupuestoTotals(data.presupuesto);
  const pagTotals = pagosTotals(data.pagos);
  const alerts = [];
  if (nextMs && nextMs.delayed) {
    alerts.push({ modulo: "Energización", texto: `Energización: el hito "${nextMs.title}" está previsto para el día ${nextMs.day} y ya vas en el día ${elapsed}.` });
  }
  const fpoAlerta = energizacionFpoAlerta(data.energizacion);
  if (fpoAlerta) alerts.push({ modulo: "Energización", texto: fpoAlerta.texto });
  if (presTotals.diferencia > 0) {
    alerts.push({ modulo: "Presupuesto", texto: `Presupuesto: la ejecución supera la base en ${fmtMoney(presTotals.diferencia)} (${presTotals.pct}%).` });
  }
  if (pagTotals.totalSaldo > 0) {
    alerts.push({ modulo: "Pagos", texto: `Pagos: hay ${fmtMoney(pagTotals.totalSaldo)} en saldo pendiente por pagar.` });
  }
  pagosProximosAlertas(data.pagos).forEach((a) => alerts.push({ modulo: "Pagos", texto: a.texto }));
  balanceHitosAlertas(data.balance).forEach((a) => alerts.push({ modulo: "Balance financiero", texto: a.texto }));
  const curvaSAlerta = cronogramaCurvaSAlerta(data.cronograma);
  if (curvaSAlerta) alerts.push({ modulo: "Cronograma", texto: curvaSAlerta.texto });
  return alerts;
}

function Resumen({ data, setTab, onChangeInfo }) {
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

  // Piloto de tema claro extendido a Resumen (por proyecto) — mismo patrón que el resto: no se toca
  // `styles.card`/`cardHead`/`cardSub` (compartidos con TODA la app), overrides locales aquí.
  const lightCard = { ...styles.card, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightCardHead = { ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_DISPLAY };
  const lightCardSub = { ...styles.cardSub, color: OVERVIEW_LIGHT.textSecondary };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
    <div style={styles.resumenGrid} className="app-resumen-grid">
      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("balance")}
      >
        <div style={lightCardHead}>
          <Landmark size={16} color={BRAND_DARK} />
          <span>Balance financiero</span>
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 700, color: balTotals.saldo >= 0 ? BRAND_DARK : "#E2604F" }}>
          {fmtMoney(balTotals.saldo)}
        </div>
        <div style={lightCardSub}>
          Ingresos {fmtMoney(balTotals.totalIngresos)} · Pagos {fmtMoney(balTotals.totalPagos)}
        </div>
      </div>

      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("upme")}
      >
        <div style={lightCardHead}>
          <FileCheck size={16} color={BRAND_DARK} />
          <span>Beneficios tributarios UPME</span>
        </div>
        <BigPct pct={upmePct} color={BRAND_DARK} trackColor="#E3E9E6" />
        <div style={lightCardSub}>{nextUpme ? `Siguiente paso: ${nextUpme.num}. ${nextUpme.label}` : "Proceso completado"}</div>
      </div>

      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("energizacion")}
      >
        <div style={lightCardHead}>
          <Zap size={16} color={BRAND_DARK} />
          <span>Energización</span>
        </div>
        <BigPct pct={enerPct} color={BRAND_DARK} trackColor="#E3E9E6" />
        <div style={lightCardSub}>
          {elapsed === null ? "Falta asignar fecha de inicio de trámites" : `Día ${elapsed} de 200`} · {nextMs ? `Siguiente: ${nextMs.title} (día ${nextMs.day})` : "Todas las actividades completadas"}
        </div>
      </div>

      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("presupuesto")}
      >
        <div style={lightCardHead}>
          <DollarSign size={16} color={BRAND_DARK} />
          <span>Presupuesto</span>
        </div>
        <BigPct
          pct={Math.min(100, Math.abs(desviacionPct))}
          color={desviacionPct > 0 ? "#E2604F" : BRAND_DARK}
          label={`${desviacionPct > 0 ? "+" : ""}${desviacionPct}%`}
          trackColor="#E3E9E6"
        />
        <div style={lightCardSub}>
          Desviación vs. base: {presTotals.diferencia > 0 ? "+" : ""}{fmtMoney(presTotals.diferencia)}
          <br />
          Base {fmtMoney(presTotals.base)} · Ejecución {fmtMoney(presTotals.ejecutado)}
        </div>
      </div>

      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("pagos")}
      >
        <div style={lightCardHead}>
          <Wallet size={16} color={BRAND_DARK} />
          <span>Pagos</span>
        </div>
        <BigPct pct={pagTotals.totalOrdenes ? Math.round((pagTotals.totalPagado / pagTotals.totalOrdenes) * 100) : 0} color={BRAND_DARK} trackColor="#E3E9E6" />
        <div style={lightCardSub}>
          {fmtMoney(pagTotals.totalPagado)} pagado de {fmtMoney(pagTotals.totalOrdenes)} · saldo {fmtMoney(pagTotals.totalSaldo)}
        </div>
      </div>

      <div style={{ ...lightCard, gridColumn: "1 / -1" }}>
        <div style={lightCardHead}>
          <AlertTriangle size={16} color="#E8A33D" />
          <span>Alertas</span>
        </div>
        {alerts.length === 0 ? (
          <div style={lightCardSub}>Sin alertas por ahora.</div>
        ) : (
          <ul style={styles.alertList}>
            {alerts.map((a, i) => (
              <li key={i} style={{ ...styles.alertItem, color: "#B5790F" }}>{a.texto}</li>
            ))}
          </ul>
        )}
      </div>

      {onChangeInfo && <ProyectoInfoSection info={data.info} pagos={data.pagos} onChange={onChangeInfo} />}
    </div>
    </div>
  );
}

// Info para el informe semanal PP-I-01: equipo de trabajo, ficha técnica de equipos, y cortes de
// obra (derivados de los proveedores de Pagos, marcando cuáles cuentan como contratista).
function ProyectoInfoSection({ info, pagos, onChange }) {
  const [newMiembro, setNewMiembro] = useState({ cargo: "", nombre: "" });

  const addMiembro = () => {
    if (!newMiembro.cargo.trim() && !newMiembro.nombre.trim()) return;
    onChange({ ...info, equipo: [...info.equipo, { id: uid(), ...newMiembro }] });
    setNewMiembro({ cargo: "", nombre: "" });
  };
  const updateMiembro = (id, patch) => onChange({ ...info, equipo: info.equipo.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const deleteMiembro = (id) => onChange({ ...info, equipo: info.equipo.filter((m) => m.id !== id) });

  const updateFicha = (grupo, campo, val) => {
    onChange({ ...info, fichaTecnica: { ...info.fichaTecnica, [grupo]: { ...info.fichaTecnica[grupo], [campo]: val } } });
  };

  const proveedores = Array.from(new Set((pagos?.ordenes || []).map((o) => (o.proveedor || "").trim()).filter(Boolean)));
  const contratistasMap = new Map((info.cortesObra.contratistas || []).map((c) => [c.proveedor, c]));
  const toggleContratista = (proveedor, checked) => {
    const existing = contratistasMap.get(proveedor);
    const next = existing
      ? info.cortesObra.contratistas.map((c) => (c.proveedor === proveedor ? { ...c, incluir: checked } : c))
      : [...info.cortesObra.contratistas, { id: uid(), proveedor, incluir: checked, reteobra: 0 }];
    onChange({ ...info, cortesObra: { contratistas: next } });
  };
  const updateReteobra = (proveedor, reteobra) => {
    onChange({ ...info, cortesObra: { contratistas: info.cortesObra.contratistas.map((c) => (c.proveedor === proveedor ? { ...c, reteobra } : c)) } });
  };
  const cortes = buildCortesObra(pagos, info.cortesObra);
  const fichaLabel = { fontSize: 11, fontWeight: 700, color: OVERVIEW_LIGHT.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 };
  const lightCard = { ...styles.card, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightCardHead = { ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_DISPLAY };
  const lightCardSub = { ...styles.cardSub, color: OVERVIEW_LIGHT.textSecondary };
  const lightMiniInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const fichaField = { ...lightMiniInput, marginBottom: 6 };
  const lightRowDeleteBtn = { ...styles.rowDeleteBtn, color: "#8FA39B" };
  const lightAddRowBtn = { ...styles.addRowBtn, background: BRAND_DARK, color: "#FFFFFF" };
  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightExportHint = { ...styles.exportHint, color: OVERVIEW_LIGHT.textSecondary };

  return (
    <>
      <div style={{ ...lightCard, gridColumn: "1 / -1" }}>
        <div style={lightCardHead}><Users size={16} color="#4FA8D8" /><span>Equipo de trabajo</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {info.equipo.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={{ ...lightMiniInput, flex: 1 }} placeholder="Cargo" value={m.cargo} onChange={(e) => updateMiembro(m.id, { cargo: e.target.value })} />
              <input style={{ ...lightMiniInput, flex: 1 }} placeholder="Nombre" value={m.nombre} onChange={(e) => updateMiembro(m.id, { nombre: e.target.value })} />
              <button style={lightRowDeleteBtn} onClick={() => deleteMiembro(m.id)}><Trash2 size={13} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ ...lightMiniInput, flex: 1 }} placeholder="Cargo (ej. Residente de obra)" value={newMiembro.cargo} onChange={(e) => setNewMiembro({ ...newMiembro, cargo: e.target.value })} />
            <input style={{ ...lightMiniInput, flex: 1 }} placeholder="Nombre" value={newMiembro.nombre} onChange={(e) => setNewMiembro({ ...newMiembro, nombre: e.target.value })} />
            <button style={lightAddRowBtn} onClick={addMiembro}><Plus size={14} /></button>
          </div>
        </div>
      </div>

      <div style={{ ...lightCard, gridColumn: "1 / -1" }}>
        <div style={lightCardHead}><FileCheck size={16} color="#7FD08A" /><span>Ficha técnica</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 10 }}>
          <div>
            <div style={fichaLabel}>Paneles solares</div>
            <input style={fichaField} placeholder="Cantidad" value={info.fichaTecnica.paneles.cantidad} onChange={(e) => updateFicha("paneles", "cantidad", e.target.value)} />
            <input style={fichaField} placeholder="Potencia (Wp)" value={info.fichaTecnica.paneles.potenciaWp} onChange={(e) => updateFicha("paneles", "potenciaWp", e.target.value)} />
            <input style={fichaField} placeholder="Marca" value={info.fichaTecnica.paneles.marca} onChange={(e) => updateFicha("paneles", "marca", e.target.value)} />
            <input style={fichaField} placeholder="Referencia" value={info.fichaTecnica.paneles.referencia} onChange={(e) => updateFicha("paneles", "referencia", e.target.value)} />
          </div>
          <div>
            <div style={fichaLabel}>Inversores</div>
            <input style={fichaField} placeholder="Cantidad" value={info.fichaTecnica.inversores.cantidad} onChange={(e) => updateFicha("inversores", "cantidad", e.target.value)} />
            <input style={fichaField} placeholder="Capacidad" value={info.fichaTecnica.inversores.capacidad} onChange={(e) => updateFicha("inversores", "capacidad", e.target.value)} />
            <input style={fichaField} placeholder="Marca" value={info.fichaTecnica.inversores.marca} onChange={(e) => updateFicha("inversores", "marca", e.target.value)} />
            <input style={fichaField} placeholder="Referencia" value={info.fichaTecnica.inversores.referencia} onChange={(e) => updateFicha("inversores", "referencia", e.target.value)} />
          </div>
          <div>
            <div style={fichaLabel}>Transformador</div>
            <input style={fichaField} placeholder="Tipo" value={info.fichaTecnica.transformador.tipo} onChange={(e) => updateFicha("transformador", "tipo", e.target.value)} />
            <input style={fichaField} placeholder="Marca" value={info.fichaTecnica.transformador.marca} onChange={(e) => updateFicha("transformador", "marca", e.target.value)} />
          </div>
          <div>
            <div style={fichaLabel}>Estructura — mesas</div>
            <input style={fichaField} placeholder="Configuración" value={info.fichaTecnica.estructura.configuracion} onChange={(e) => updateFicha("estructura", "configuracion", e.target.value)} />
            <input style={fichaField} placeholder="Cantidad" value={info.fichaTecnica.estructura.cantidad} onChange={(e) => updateFicha("estructura", "cantidad", e.target.value)} />
            <input style={fichaField} placeholder="Proveedor" value={info.fichaTecnica.estructura.proveedor} onChange={(e) => updateFicha("estructura", "proveedor", e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ ...lightCard, gridColumn: "1 / -1" }}>
        <div style={lightCardHead}><Wallet size={16} color="#E77DA8" /><span>Cortes de obra</span></div>
        <p style={lightExportHint}>Marca qué proveedores de Pagos cuentan como contratista de obra, y digita su retención (reteobra).</p>
        {proveedores.length === 0 ? (
          <div style={lightCardSub}>Todavía no hay proveedores registrados en Pagos.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {proveedores.map((prov) => {
              const c = contratistasMap.get(prov);
              return (
                <div key={prov} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!c?.incluir} onChange={(e) => toggleContratista(prov, e.target.checked)} />
                  <span style={{ flex: 1, fontSize: 12.5, color: OVERVIEW_LIGHT.textPrimary }}>{prov}</span>
                  {c?.incluir && (
                    <MoneyInput style={{ ...lightMiniInput, width: 140 }} placeholder="Reteobra" value={c.reteobra} onChange={(val) => updateReteobra(prov, val)} />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {cortes.length > 0 && (
          <div style={lightTableWrap}>
            <table style={styles.overviewTable}>
              <thead>
                <tr>
                  <th style={lightOvTh}>Contratista</th>
                  <th style={lightOvTh}># de corte</th>
                  <th style={lightOvTh}>Vr acumulado</th>
                  <th style={lightOvTh}>Reteobra</th>
                  <th style={lightOvTh}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {cortes.map((c) => (
                  <tr key={c.proveedor}>
                    <td style={lightOvTd}>{c.proveedor}</td>
                    <td style={lightOvTd}>{c.numCortes}</td>
                    <td style={lightOvTd}>{fmtMoney(c.vrAcumulado)}</td>
                    <td style={lightOvTd}>{fmtMoney(c.reteobra)}</td>
                    <td style={{ ...lightOvTd, fontWeight: 700 }}>{fmtMoney(c.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// Piloto de tema claro (identidad corporativa GUMAR) para "Resumen general" — ver
// C:\Users\disen\.claude\plans\sparkling-kindling-book.md para el porqué de este alcance.
// Los hex de marca (BRAND_DARK/BRAND_LIGHT) vienen del manual de identidad corporativa; el resto
// de OVERVIEW_LIGHT son tonos neutros derivados razonables. Deliberadamente NO se toca el objeto
// `styles` compartido — estos overrides solo aplican dentro de esta vista, spreadeados encima de
// styles.card/etc. en los sitios donde se usan, así ninguna otra pestaña se ve afectada.
const BRAND_DARK = "#6B8E89";
const BRAND_LIGHT = "#A9D3C4";
const OFF_WHITE = "#F2F6F4"; // blanco suave (no puro #FFFFFF), con un toque del verde de marca
const OVERVIEW_LIGHT = {
  page: BRAND_DARK,  // fondo general: verde oscuro
  card: OFF_WHITE,   // tarjetas/superficies: blanco suave (antes verde claro)
  border: "#8FBBAC",
  barTrack: "#E3E9E6", // fondo de las barras de progreso (gris neutro, no verde saturado)
  textPrimary: "#22312D",   // texto sobre tarjetas (verde claro)
  textSecondary: "#3E5850", // texto secundario sobre tarjetas (verde claro)
  pageTextPrimary: "#FFFFFF",   // texto directo sobre el fondo (verde oscuro)
  pageTextSecondary: "#DCEAE4", // texto secundario directo sobre el fondo (verde oscuro)
};
const FONT_BRAND_DISPLAY = "'Montserrat', 'Segoe UI', sans-serif";
const FONT_BRAND_BODY = "'Lato', 'Segoe UI', sans-serif";

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
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>UPME</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Energización</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Presupuesto</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Saldo pendiente</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Día</th>
              <th style={{ ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` }}>Siguiente hito</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project: p, loading, upmePct, enerPct, nextMs, elapsed, delayed, pres, pag }) => {
              const ovTdLight = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
              return (
                <tr key={p.id} style={styles.ovRow} onClick={() => onOpenProject(p.id, "resumen")}>
                  <td style={{ ...styles.ovTdName, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ ...styles.ovTdMeta, color: OVERVIEW_LIGHT.textSecondary }}>{p.capacity ? `${p.capacity} MWp` : ""}{p.location ? ` · ${p.location}` : ""}</div>
                  </td>
                  {loading ? (
                    <td colSpan={6} style={ovTdLight}>Cargando…</td>
                  ) : (
                    <>
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

function OvBar({ pct, color, label, trackColor }) {
  return (
    <div style={styles.ovBarWrap}>
      <div style={{ ...styles.ovBarTrack, ...(trackColor ? { background: trackColor } : {}) }}>
        <div style={{ ...styles.ovBarFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ ...styles.ovBarPct, color }}>{label ?? `${pct}%`}</span>
    </div>
  );
}

function BigPct({ pct, color, label, trackColor }) {
  return (
    <div style={styles.bigPctWrap}>
      <div style={{ ...styles.bigPctTrack, ...(trackColor ? { background: trackColor } : {}) }}>
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

/* ---------------------------------------------------------------------
   Energización module
--------------------------------------------------------------------- */
function EnergizacionModule({ data, onChange, projectId, isLector }) {
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
            {data.tasks.map((t) => (
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


function PresupuestoModule({ data, onChange, pagos, projectName }) {
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
      </div>

      {activeSub === "ejecucion" && (
        <p style={lightExportHint}>
          Los ítems marcados con <span style={{ color: BRAND_DARK }}>●</span> ya existen en el presupuesto base
          (se crearon ahí). Los demás son adicionales, agregados directamente aquí.
        </p>
      )}

      {activeSub === "base" ? (
        <PresupuestoTable items={data.base} onAdd={addBaseItem} onAddMany={addBaseItems} onUpdate={updateBaseItem} onDelete={deleteBaseItem} pagadoPorItem={pagadoPorItem} projectName={projectName} />
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

function PresupuestoTable({ items, onAdd, onAddMany, onUpdate, onDelete, linkedIds, baseValoresPorItem, baseValoresPorCategoria, pagadoPorItem, projectName }) {
  const [newItem, setNewItem] = useState({
    item: "", categoria: "", descripcion: "", cantidad: "", unidad: "",
    valorUnitario: "", ivaPct: "",
  });
  const [showPaste, setShowPaste] = useState(false);
  const [showTemplateUpload, setShowTemplateUpload] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null); // { id, label } | null
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

  return (
    <div>
      <div style={styles.pasteBtnRow}>
        {projectName && (
          <>
            <button style={lightPasteBtn} onClick={() => downloadPresupuestoTemplate(items, projectName)}>
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
          {grouped.map((group) => {
            const groupTotal = presupuestoListTotal(group.items);
            const baseGroupTotal = baseValoresPorCategoria?.get(group.categoria);
            const groupExcedido = baseGroupTotal !== undefined && groupTotal > baseGroupTotal;
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
                {group.items.map((it) => {
                  const calc = calcPresupuestoItem(it);
                  const isLinked = linkedIds && linkedIds.has(it.id);
                  const baseValor = baseValoresPorItem?.get(it.id);
                  const itemExcedido = isLinked && baseValor !== undefined && calc.valorTotal > baseValor;
                  const editing = editingIds.has(it.id);
                  return (
                    <tr key={it.id} style={itemExcedido ? { background: "#FBE4E1" } : undefined}>
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
                      <td style={{ ...lightOvTd, fontWeight: 700, color: itemExcedido ? "#E2604F" : OVERVIEW_LIGHT.textPrimary }}>
                        {fmtMoney(calc.valorTotal)}
                        {itemExcedido && <div style={lightExcedidoTag}>+{fmtMoney(calc.valorTotal - baseValor)} vs. base</div>}
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

const PRESUPUESTO_ACCENT = "FF7FD08A"; // verde de la pestaña Presupuesto

const PRESUPUESTO_COLUMNS = [
  { header: "Ítem", key: "item", width: 10 },
  { header: "Categoría / Descripción", key: "descripcion", width: 38 },
  { header: "Cantidad", key: "cantidad", width: 12 },
  { header: "Unidad", key: "unidad", width: 10 },
  { header: "Valor unitario (antes de IVA)", key: "valorUnitario", width: 22 },
  { header: "IVA %", key: "ivaPct", width: 10 },
  { header: "Valor unitario (con IVA)", key: "valorUnitarioConIva", width: 22 },
  { header: "Valor total", key: "valorTotal", width: 20 },
  { header: "IVA recuperable (referencia)", key: "ivaRecuperable", width: 22 },
];

// Arma una fila por cada categoría (encabezado en negrilla, sin Cantidad/Unidad/Valor unitario)
// seguida de sus ítems — igual a como ya se ve el presupuesto en la app. Si el proyecto no tiene
// ítems todavía, arma una categoría y 2 ítems de ejemplo (en cursiva) para que se vea el formato.
function buildPresupuestoSheetRows(items) {
  if (!items || items.length === 0) {
    return [
      { item: "1", descripcion: "EQUIPOS PRINCIPALES", esCategoria: true, esEjemplo: true },
      { item: "1.1", descripcion: "Paneles fotovoltaicos 710w", cantidad: 2230, unidad: "UND", valorUnitario: 318952, ivaPct: 0, esEjemplo: true },
      { item: "1.2", descripcion: "Inversor 330kW", cantidad: 3, unidad: "UND", valorUnitario: 29000000, ivaPct: 0, esEjemplo: true },
    ];
  }
  const grupos = groupPresupuestoItems(items);
  const rows = [];
  grupos.forEach((g, gi) => {
    rows.push({ item: String(gi + 1), descripcion: g.categoria, esCategoria: true });
    g.items.forEach((it) => {
      rows.push({ item: it.item, descripcion: it.descripcion, cantidad: it.cantidad, unidad: it.unidad, valorUnitario: it.valorUnitario, ivaPct: it.ivaPct });
    });
  });
  return rows;
}

async function downloadPresupuestoTemplate(items, projectName) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Parques Solares";
  wb.created = new Date();

  const info = wb.addWorksheet("Instrucciones");
  info.getColumn(1).width = 95;
  info.addRow([`Plantilla de presupuesto — ${projectName || ""}`]).font = { bold: true, size: 15, color: { argb: PRESUPUESTO_ACCENT } };
  info.addRow([]);
  [
    "Cómo llenar esta plantilla:",
    "1. Ve a la pestaña \"Presupuesto\". Cada fila es un ítem del presupuesto.",
    "2. Las filas de categoría (como \"1  EQUIPOS PRINCIPALES\") solo llevan Ítem y Descripción —",
    "   deja vacías Cantidad/Unidad/Valor unitario/IVA en esas filas, así se detectan como categoría.",
    "3. Los ítems van debajo de su categoría, con Cantidad, Unidad, Valor unitario (antes de IVA) e IVA %.",
    "4. Escribe el IVA como número sin el símbolo % (por ejemplo 19, no 19%).",
    "5. Las columnas \"Valor unitario (con IVA)\", \"Valor total\" e \"IVA recuperable\" se calculan solas —",
    "   son de referencia mientras llenas, no hace falta tocarlas (no se leen al subir el archivo).",
    "6. Borra las filas de ejemplo (en cursiva) antes de subir el archivo, si no las necesitas.",
    "7. Al subir este archivo a la plataforma, los ítems se AGREGAN a la base del proyecto —",
    "   no reemplazan los que ya existen.",
  ].forEach((line, i) => {
    const row = info.addRow([line]);
    if (i === 0) row.font = { bold: true };
  });

  const ws = wb.addWorksheet("Presupuesto");
  ws.columns = PRESUPUESTO_COLUMNS;
  const rows = buildPresupuestoSheetRows(items);
  rows.forEach((r) => {
    const row = ws.addRow(r);
    const n = row.number;
    if (!r.esCategoria) {
      row.getCell("valorUnitarioConIva").value = { formula: `E${n}*(1+F${n}/100)` };
      row.getCell("valorTotal").value = { formula: `C${n}*G${n}` };
      row.getCell("ivaRecuperable").value = { formula: `H${n}-C${n}*E${n}` };
    } else {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDEF" } };
    }
    row.font = { bold: !!r.esCategoria, italic: !!r.esEjemplo, color: r.esEjemplo ? { argb: "FF7A8A93" } : undefined };
  });

  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRESUPUESTO_ACCENT } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "I1" };

  ws.getColumn("valorUnitario").numFmt = '"$"#,##0';
  ws.getColumn("valorUnitarioConIva").numFmt = '"$"#,##0';
  ws.getColumn("valorTotal").numFmt = '"$"#,##0';
  ws.getColumn("ivaRecuperable").numFmt = '"$"#,##0';
  ws.getColumn("ivaPct").numFmt = '0"%"';

  const thin = { style: "thin", color: { argb: "FFDDDDDD" } };
  for (let i = 1; i <= Math.max(rows.length + 1, 40); i++) {
    ws.getRow(i).eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (projectName || "proyecto").replace(/[^a-z0-9]+/gi, "-");
  a.download = `plantilla-presupuesto-${safeName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Lee el .xlsx de presupuesto que suba la persona: detecta filas de categoría (Cantidad/Unidad/
// Valor unitario vacíos) igual que "Pegar desde Excel", pero leyendo el archivo directo — evita
// los problemas de copiar/pegar (columnas ocultas, autofiltro, formato del portapapeles).
function parsePresupuestoWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { cellDates: false });
  const sheetName = wb.SheetNames.includes("Presupuesto") ? "Presupuesto" : wb.SheetNames[wb.SheetNames.length - 1];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const items = [];
  let currentCategoria = "Sin categoría";
  let skipped = 0;
  rows.forEach((r) => {
    const descripcion = String(r["Categoría / Descripción"] || "").trim();
    if (!descripcion) { skipped++; return; }
    const itemCode = String(r["Ítem"] || "").trim();
    const cantidadRaw = r["Cantidad"];
    const unidadRaw = String(r["Unidad"] || "").trim();
    const valorRaw = r["Valor unitario (antes de IVA)"];
    const ivaRaw = r["IVA %"];
    const isGroupHeader = (cantidadRaw === "" || cantidadRaw === undefined) && !unidadRaw && (valorRaw === "" || valorRaw === undefined);
    if (isGroupHeader) { currentCategoria = descripcion; return; }
    items.push({
      id: uid(),
      item: itemCode,
      categoria: currentCategoria,
      descripcion,
      cantidad: typeof cantidadRaw === "number" ? cantidadRaw : parseColombianNumber(cantidadRaw),
      unidad: unidadRaw,
      valorUnitario: typeof valorRaw === "number" ? valorRaw : parseColombianNumber(valorRaw),
      ivaPct: typeof ivaRaw === "number" ? ivaRaw : (Number(ivaRaw) || 0),
    });
  });
  return { items, skipped };
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

function PagosModule({ data, onChange, projectName, presupuestoBase = [], canAprobarPagos = false, approverName = "", onExportProgramados }) {
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
  const [showRangeExport, setShowRangeExport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const totals = pagosTotals(data);
  const alertas = pagosProximosAlertas(data);

  // Busca por número de orden, proveedor o concepto/descripción — sin distinguir mayúsculas/acentos.
  const normalize = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const searchTerm = normalize(searchQuery.trim());
  const ordenesFiltradas = searchTerm
    ? data.ordenes.filter((o) =>
        normalize(o.numero).includes(searchTerm) ||
        normalize(o.proveedor).includes(searchTerm) ||
        normalize(o.descripcion).includes(searchTerm)
      )
    : data.ordenes;

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

  // Piloto de tema claro extendido a Pagos — mismo patrón que el resto de pestañas.
  const lightPasteBtn = { ...styles.pasteBtn, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY };
  const lightStat = { ...styles.overviewStat, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightStatLabel = { ...styles.overviewStatLabel, color: OVERVIEW_LIGHT.textSecondary };
  const lightAlertBox = { ...styles.pagosAlertBox, background: OVERVIEW_LIGHT.card, border: "1px solid #E8A33D88" };
  const lightCardHead = { ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_DISPLAY };
  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTdName = { ...styles.ovTdName, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightMiniInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightRowDeleteBtn = { ...styles.rowDeleteBtn, color: "#8FA39B" };
  const lightAddRowBtn = { ...styles.addRowBtn, background: BRAND_DARK, color: "#FFFFFF" };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button style={lightPasteBtn} onClick={() => downloadPagosTemplate(data, projectName)}>
          <FileDown size={14} /> Descargar plantilla Excel
        </button>
        <button style={lightPasteBtn} onClick={() => setShowTemplateUpload(true)}>
          <FileUp size={14} /> Cargar plantilla Excel
        </button>
        <button style={lightPasteBtn} onClick={() => setShowRangeExport(true)}>
          <FileDown size={14} /> Exportar programados por fecha
        </button>
      </div>

      {showTemplateUpload && (
        <PagosTemplateModal onClose={() => setShowTemplateUpload(false)} onImport={(ordenes) => { onChange({ ...data, ordenes }); setShowTemplateUpload(false); }} />
      )}

      {showRangeExport && (
        <PagosRangeExportModal
          onClose={() => setShowRangeExport(false)}
          onExport={(range) => { onExportProgramados?.(range); setShowRangeExport(false); }}
        />
      )}

      <div style={styles.overviewStatRow} className="app-stat-row">
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: OVERVIEW_LIGHT.textPrimary }}>{fmtMoney(totals.totalOrdenes)}</div>
          <div style={lightStatLabel}>Total en órdenes de servicio</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: BRAND_DARK }}>{fmtMoney(totals.totalPagado)}</div>
          <div style={lightStatLabel}>Total pagado</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: "#B5790F" }}>{fmtMoney(totals.totalProgramado)}</div>
          <div style={lightStatLabel}>Total programado (pendiente)</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: totals.totalSaldo < 0 ? "#E2604F" : totals.totalSaldo > 0 ? "#B5790F" : BRAND_DARK }}>{fmtMoney(totals.totalSaldo)}</div>
          <div style={lightStatLabel}>Saldo pendiente</div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div style={lightAlertBox}>
          <div style={lightCardHead}><AlertTriangle size={16} color="#E8A33D" /><span>Pagos programados</span></div>
          <ul style={styles.alertList}>
            {alertas.map((a, i) => (
              <li key={i} style={{ ...styles.alertItem, color: a.tipo === "vencido" ? "#E2604F" : "#B5790F" }}>{a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 10, maxWidth: 360 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: OVERVIEW_LIGHT.textSecondary, pointerEvents: "none" }} />
        <input
          style={{ ...lightMiniInput, paddingLeft: 30 }}
          placeholder="Buscar por proveedor, orden o concepto..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div style={lightTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={lightOvTh}>Orden de servicio</th>
              <th style={lightOvTh}>Concepto / Descripción</th>
              <th style={lightOvTh}>Proveedor</th>
              <th style={lightOvTh}>Valor total</th>
              <th style={lightOvTh}>Pagado / Saldo</th>
              <th style={lightOvTh}></th>
            </tr>
          </thead>
          <tbody>
            {ordenesFiltradas.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...lightOvTd, textAlign: "center", color: OVERVIEW_LIGHT.textSecondary }}>
                  Sin resultados para "{searchQuery}".
                </td>
              </tr>
            )}
            {ordenesFiltradas.map((o) => {
              const pagado = ordenPagado(o);
              const programado = ordenProgramado(o);
              const saldo = ordenSaldo(o);
              const sobrepasado = saldo < 0;
              const pct = o.valorTotal ? Math.round((pagado / o.valorTotal) * 100) : 0;
              const isOpen = openId === o.id;
              return (
                <React.Fragment key={o.id}>
                  <tr style={styles.ovRow} onClick={() => setOpenId(isOpen ? null : o.id)}>
                    <td style={lightOvTdName}>
                      <input
                        style={{ ...lightMiniInput, fontWeight: 600 }}
                        value={o.numero}
                        onChange={(e) => updateOrden(o.id, { numero: e.target.value })}
                      />
                    </td>
                    <td style={lightOvTd}>
                      <input
                        style={lightMiniInput}
                        placeholder="Concepto de la orden"
                        value={o.descripcion || ""}
                        onChange={(e) => updateOrden(o.id, { descripcion: e.target.value })}
                      />
                      {o.presupuestoItemId && presupuestoLabel(o.presupuestoItemId) && (
                        <div style={{ fontSize: 10.5, color: BRAND_DARK, marginTop: 3 }}>
                          → {presupuestoLabel(o.presupuestoItemId)}
                        </div>
                      )}
                    </td>
                    <td style={lightOvTd} onClick={(e) => e.stopPropagation()}>
                      <input
                        style={lightMiniInput}
                        placeholder="Proveedor"
                        value={o.proveedor || ""}
                        onChange={(e) => updateOrden(o.id, { proveedor: e.target.value })}
                      />
                    </td>
                    <td style={lightOvTd} onClick={(e) => e.stopPropagation()}>
                      <MoneyInput
                        style={lightMiniInput}
                        value={o.valorTotal}
                        onChange={(val) => updateOrden(o.id, { valorTotal: val })}
                      />
                    </td>
                    <td style={lightOvTd}>
                      <OvBar pct={Math.min(100, pct)} label={`${pct}%`} color={sobrepasado ? "#E2604F" : saldo === 0 ? BRAND_DARK : "#F5B942"} trackColor={OVERVIEW_LIGHT.barTrack} />
                      <div style={{ fontSize: 10.5, color: sobrepasado ? "#E2604F" : OVERVIEW_LIGHT.textSecondary, marginTop: 3, fontFamily: "'JetBrains Mono', monospace", fontWeight: sobrepasado ? 700 : 400 }}>
                        {fmtMoney(pagado)} pagado{programado > 0 ? ` · ${fmtMoney(programado)} programado` : ""} · {sobrepasado ? "excedido en " : "saldo "}{fmtMoney(Math.abs(saldo))}
                      </div>
                    </td>
                    <td style={lightOvTd}>
                      <button style={lightRowDeleteBtn} onClick={(e) => { e.stopPropagation(); askDeleteOrden(o); }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ ...lightOvTd, background: "#EAF3EE" }}>
                        <div style={{ padding: "6px 4px" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary }}>
                            <span>Ítem de presupuesto (opcional):</span>
                            <select
                              style={lightMiniInput}
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
                                <th style={lightOvTh}>Estado</th>
                                <th style={lightOvTh}>Fecha</th>
                                <th style={lightOvTh}>Valor</th>
                                <th style={lightOvTh}>Concepto</th>
                                <th style={lightOvTh}>Aprobado</th>
                                <th style={lightOvTh}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.pagos.map((p) => {
                                const estado = p.estado || "pagado";
                                return (
                                  <tr key={p.id}>
                                    <td style={lightOvTd}>
                                      <select
                                        style={lightMiniInput}
                                        value={estado}
                                        onChange={(e) => updatePago(o.id, p.id, { estado: e.target.value })}
                                      >
                                        <option value="pagado">Pagado</option>
                                        <option value="programado">Programado</option>
                                      </select>
                                    </td>
                                    <td style={lightOvTd}>
                                      <input
                                        type="date"
                                        style={lightMiniInput}
                                        value={p.fecha}
                                        onChange={(e) => updatePago(o.id, p.id, { fecha: e.target.value })}
                                      />
                                    </td>
                                    <td style={lightOvTd}>
                                      <input
                                        type="number"
                                        style={lightMiniInput}
                                        value={p.valor}
                                        onChange={(e) => updatePago(o.id, p.id, { valor: Number(e.target.value) || 0 })}
                                      />
                                    </td>
                                    <td style={lightOvTd}>
                                      <input
                                        style={lightMiniInput}
                                        placeholder="Concepto"
                                        value={p.concepto || ""}
                                        onChange={(e) => updatePago(o.id, p.id, { concepto: e.target.value })}
                                      />
                                    </td>
                                    <td style={lightOvTd}>
                                      <input
                                        type="checkbox"
                                        className="approve-toggle"
                                        title={canAprobarPagos ? "Marcar como aprobado" : "No tienes permiso para aprobar pagos"}
                                        checked={!!p.aprobado}
                                        disabled={!canAprobarPagos}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          updatePago(o.id, p.id, checked
                                            ? { aprobado: true, aprobadoPor: approverName, aprobadoEn: todayISO() }
                                            : { aprobado: false, aprobadoPor: null, aprobadoEn: null });
                                        }}
                                      />
                                      {p.aprobado && p.aprobadoPor && (
                                        <div style={{ fontSize: 10, color: OVERVIEW_LIGHT.textSecondary, marginTop: 3 }}>
                                          Aprobado por {p.aprobadoPor}{p.aprobadoEn ? ` (${fmtDate(p.aprobadoEn)})` : ""}
                                        </div>
                                      )}
                                    </td>
                                    <td style={lightOvTd}>
                                      <button style={lightRowDeleteBtn} onClick={() => askDeletePago(o.id, p)}><Trash2 size={13} /></button>
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr>
                                <td style={lightOvTd}>
                                  <select style={lightMiniInput} value={newPago.estado} onChange={(e) => setNewPago({ ...newPago, estado: e.target.value })}>
                                    <option value="pagado">Pagado</option>
                                    <option value="programado">Programado</option>
                                  </select>
                                </td>
                                <td style={lightOvTd}>
                                  <input type="date" style={lightMiniInput} value={newPago.fecha} onChange={(e) => setNewPago({ ...newPago, fecha: e.target.value })} />
                                </td>
                                <td style={lightOvTd}>
                                  <MoneyInput style={lightMiniInput} placeholder="$" value={newPago.valor} onChange={(val) => setNewPago({ ...newPago, valor: val })} />
                                </td>
                                <td style={lightOvTd}>
                                  <input style={lightMiniInput} placeholder="Concepto (opcional)" value={newPago.concepto} onChange={(e) => setNewPago({ ...newPago, concepto: e.target.value })} />
                                </td>
                                <td style={lightOvTd}></td>
                                <td style={lightOvTd}>
                                  <button style={lightAddRowBtn} onClick={() => addPago(o.id)}><Plus size={14} /></button>
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
              <td style={lightOvTd}>
                <input style={lightMiniInput} placeholder="N.° de orden" value={newOrden.numero} onChange={(e) => setNewOrden({ ...newOrden, numero: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <input style={lightMiniInput} placeholder="Concepto de la orden" value={newOrden.descripcion} onChange={(e) => setNewOrden({ ...newOrden, descripcion: e.target.value })} />
                <select
                  style={{ ...lightMiniInput, marginTop: 4, fontSize: 11 }}
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
              <td style={lightOvTd}>
                <input style={lightMiniInput} placeholder="Proveedor" value={newOrden.proveedor} onChange={(e) => setNewOrden({ ...newOrden, proveedor: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <MoneyInput style={lightMiniInput} placeholder="$" value={newOrden.valorTotal} onChange={(val) => setNewOrden({ ...newOrden, valorTotal: val })} />
              </td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}>
                <button style={lightAddRowBtn} onClick={addOrden}><Plus size={14} /></button>
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

// Balance financiero: hitos de pago del cliente (con fecha y valor esperado). Al marcar un hito
// como pagado se registra la fecha/valor real — de ahí sale el total de "ingresos" (no hay una
// lista de ingresos aparte). "Plata que sale" viene del módulo de Pagos (lo ya pagado a proveedores).
function BalanceModule({ data, onChange, pagos, presupuesto }) {
  const [newHito, setNewHito] = useState({ nombre: "", fechaProgramada: "", valorEsperado: "" });
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, label } | null
  const totals = balanceTotals(data, pagos);
  const margen = balanceMargenTotals(data, presupuesto);
  const alertas = balanceHitosAlertas(data);
  const flujoData = balanceFlujoCaja(data, pagos);
  // Barra tipo "bullet": la ejecución real es la barra gruesa, el presupuesto base es una marca de
  // referencia (el plan) y el valor de venta es la meta — así se ve de un vistazo cuánto margen queda.
  const margenMaxRef = Math.max(margen.valorVenta, margen.presupuestoBase, margen.presupuestoEjecucion, 1) * 1.05;
  const margenPct = (v) => Math.min(100, (v / margenMaxRef) * 100);
  const ejecucionSobreVenta = margen.presupuestoEjecucion > margen.valorVenta;

  const addHito = () => {
    if (!newHito.nombre.trim()) return;
    const hito = {
      id: uid(),
      nombre: newHito.nombre.trim(),
      fechaProgramada: newHito.fechaProgramada,
      valorEsperado: Number(newHito.valorEsperado) || 0,
      pagado: false,
      fechaPago: "",
      valorPagado: 0,
    };
    onChange({ ...data, hitos: [...data.hitos, hito] });
    setNewHito({ nombre: "", fechaProgramada: "", valorEsperado: "" });
  };

  const updateHito = (id, patch) => {
    onChange({ ...data, hitos: data.hitos.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  };

  const togglePagado = (h, checked) => {
    updateHito(h.id, checked
      ? { pagado: true, fechaPago: h.fechaPago || todayISO(), valorPagado: h.valorPagado || h.valorEsperado }
      : { pagado: false });
  };

  const deleteHito = (id) => onChange({ ...data, hitos: data.hitos.filter((h) => h.id !== id) });

  // Piloto de tema claro extendido a Balance financiero. El gráfico "Pagos del cliente vs. pagos de
  // la empresa" y sus 2 tarjetas de Ingresos/Pagos realizados quedan con sus colores actuales
  // (verde/rosa) por ahora, en espera del tono exacto del manual de marca para "pagos de la empresa".
  const lightChartBox = { ...styles.chartBox, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightCardHead = { ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_DISPLAY };
  const lightStat = { ...styles.overviewStat, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightStatLabel = { ...styles.overviewStatLabel, color: OVERVIEW_LIGHT.textSecondary };
  const lightInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightAlertBox = { ...styles.pagosAlertBox, background: OVERVIEW_LIGHT.card, border: "1px solid #E8A33D88" };
  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightReadonlyText = { ...styles.presReadonlyText, color: OVERVIEW_LIGHT.textSecondary };
  const lightRowDeleteBtn = { ...styles.rowDeleteBtn, color: "#8FA39B" };
  const lightAddRowBtn = { ...styles.addRowBtn, background: BRAND_DARK, color: "#FFFFFF" };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
      <div style={lightChartBox}>
        <div style={lightCardHead}><Landmark size={16} color={BRAND_DARK} /><span>Valor del proyecto</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 14px" }}>
          <span style={{ fontSize: 12, color: OVERVIEW_LIGHT.textSecondary }}>Valor de venta al cliente (contrato):</span>
          <MoneyInput
            style={{ ...lightInput, width: 160 }}
            value={data.valorVentaCliente}
            onChange={(val) => onChange({ ...data, valorVentaCliente: val })}
          />
        </div>
        <div style={styles.overviewStatRow} className="app-stat-row">
          <div style={lightStat}>
            <div style={{ ...styles.overviewStatNum, fontSize: 18, color: BRAND_DARK }}>{fmtMoney(margen.valorVenta)}</div>
            <div style={lightStatLabel}>Valor de venta (cliente)</div>
          </div>
          <div style={lightStat}>
            <div style={{ ...styles.overviewStatNum, fontSize: 18, color: OVERVIEW_LIGHT.textSecondary }}>{fmtMoney(margen.presupuestoBase)}</div>
            <div style={lightStatLabel}>Valor base (presupuesto base)</div>
          </div>
          <div style={lightStat}>
            <div style={{ ...styles.overviewStatNum, fontSize: 18, color: BRAND_DARK }}>{fmtMoney(margen.presupuestoEjecucion)}</div>
            <div style={lightStatLabel}>Valor del proyecto (ejecución)</div>
          </div>
          <div style={lightStat}>
            <div style={{ ...styles.overviewStatNum, fontSize: 18, color: margen.utilidadReal >= 0 ? BRAND_DARK : "#E2604F" }}>{fmtMoney(margen.utilidadReal)}</div>
            <div style={lightStatLabel}>Utilidad real (venta − ejecución)</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 4px 8px" }}>
          {[
            { label: "Valor de venta (meta)", value: margen.valorVenta, color: BRAND_DARK },
            { label: "Presupuesto base (plan)", value: margen.presupuestoBase, color: BRAND_LIGHT },
            { label: "Presupuesto ejecución (real)", value: margen.presupuestoEjecucion, color: ejecucionSobreVenta ? "#E2604F" : BRAND_DARK },
          ].map((row) => (
            <div key={row.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary, marginBottom: 4 }}>
                <span>{row.label}</span>
                <span style={{ fontFamily: FONT_MONO, color: OVERVIEW_LIGHT.textPrimary }}>{fmtMoney(row.value)}</span>
              </div>
              <div style={{ height: 16, background: "#E3E9E6", borderRadius: 5 }}>
                <div style={{ height: "100%", width: `${margenPct(row.value)}%`, background: row.color, borderRadius: 5, transition: "width 0.2s" }} />
              </div>
            </div>
          ))}
          {ejecucionSobreVenta && (
            <div style={styles.presExcedidoTag}>
              La ejecución ya supera el valor de venta en {fmtMoney(margen.presupuestoEjecucion - margen.valorVenta)}
            </div>
          )}
        </div>
      </div>

      <div style={styles.overviewStatRow} className="app-stat-row">
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: BRAND_DARK }}>{fmtMoney(totals.totalIngresos)}</div>
          <div style={lightStatLabel}>Ingresos (consignado por el cliente)</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: "#B5790F" }}>{fmtMoney(totals.totalPagos)}</div>
          <div style={lightStatLabel}>Pagos realizados a proveedores</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: totals.saldo >= 0 ? BRAND_DARK : "#E2604F" }}>{fmtMoney(totals.saldo)}</div>
          <div style={lightStatLabel}>Queda</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: OVERVIEW_LIGHT.textSecondary }}>{fmtMoney(totals.totalEsperado)}</div>
          <div style={lightStatLabel}>Total esperado (todos los hitos)</div>
        </div>
      </div>

      <div style={lightChartBox}>
        <div style={lightCardHead}><Wallet size={16} color={BRAND_DARK} /><span>Pagos del cliente vs. pagos de la empresa (acumulado)</span></div>
        {flujoData.length === 0 ? (
          <div style={{ color: OVERVIEW_LIGHT.textSecondary, fontSize: 13, padding: "10px 0 4px" }}>
            Marca hitos como pagados y registra pagos a proveedores para ver esta gráfica.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={flujoData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="balFlujoIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_DARK} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={BRAND_DARK} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="balFlujoPagos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F5B942" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#F5B942" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={OVERVIEW_LIGHT.border} />
              <XAxis dataKey="label" tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} />
              <YAxis tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} tickFormatter={(v) => fmtMoney(v)} width={90} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ background: "#FFFFFF", border: `1px solid ${OVERVIEW_LIGHT.border}`, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary }} />
              <RLegend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="ingresos" name="Pagos del cliente" stroke={BRAND_DARK} strokeWidth={2} fill="url(#balFlujoIngresos)" />
              <Area type="monotone" dataKey="pagos" name="Pagos de la empresa" stroke="#F5B942" strokeWidth={2} fill="url(#balFlujoPagos)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {alertas.length > 0 && (
        <div style={lightAlertBox}>
          <div style={lightCardHead}><AlertTriangle size={16} color="#E8A33D" /><span>Hitos de pago del cliente</span></div>
          <ul style={styles.alertList}>
            {alertas.map((a, i) => (
              <li key={i} style={{ ...styles.alertItem, color: a.tipo === "vencido" ? "#E2604F" : "#B5790F" }}>{a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={lightTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={lightOvTh}>Hito de pago</th>
              <th style={lightOvTh}>Fecha programada</th>
              <th style={lightOvTh}>Valor esperado</th>
              <th style={lightOvTh}>¿Pagado?</th>
              <th style={lightOvTh}>Fecha de pago</th>
              <th style={lightOvTh}>Valor pagado</th>
              <th style={lightOvTh}></th>
            </tr>
          </thead>
          <tbody>
            {data.hitos.map((h) => (
              <tr key={h.id}>
                <td style={lightOvTd}>
                  <input style={lightInput} value={h.nombre} onChange={(e) => updateHito(h.id, { nombre: e.target.value })} />
                </td>
                <td style={lightOvTd}>
                  <input type="date" style={lightInput} value={h.fechaProgramada || ""} onChange={(e) => updateHito(h.id, { fechaProgramada: e.target.value })} />
                </td>
                <td style={lightOvTd}>
                  <MoneyInput style={lightInput} value={h.valorEsperado} onChange={(val) => updateHito(h.id, { valorEsperado: val })} />
                </td>
                <td style={lightOvTd}>
                  <input type="checkbox" checked={!!h.pagado} onChange={(e) => togglePagado(h, e.target.checked)} />
                </td>
                <td style={lightOvTd}>
                  {h.pagado ? (
                    <input type="date" style={lightInput} value={h.fechaPago || ""} onChange={(e) => updateHito(h.id, { fechaPago: e.target.value })} />
                  ) : (
                    <span style={lightReadonlyText}>—</span>
                  )}
                </td>
                <td style={lightOvTd}>
                  {h.pagado ? (
                    <MoneyInput style={lightInput} value={h.valorPagado} onChange={(val) => updateHito(h.id, { valorPagado: val })} />
                  ) : (
                    <span style={lightReadonlyText}>—</span>
                  )}
                </td>
                <td style={lightOvTd}>
                  <button style={lightRowDeleteBtn} onClick={() => setConfirmDelete({ id: h.id, label: h.nombre || "este hito" })}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={lightOvTd}>
                <input style={lightInput} placeholder="Ej. Anticipo, Entrega 1..." value={newHito.nombre} onChange={(e) => setNewHito({ ...newHito, nombre: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <input type="date" style={lightInput} value={newHito.fechaProgramada} onChange={(e) => setNewHito({ ...newHito, fechaProgramada: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <MoneyInput style={lightInput} placeholder="$" value={newHito.valorEsperado} onChange={(val) => setNewHito({ ...newHito, valorEsperado: val })} />
              </td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}>
                <button style={lightAddRowBtn} onClick={addHito}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Eliminar hito de pago"
          message={`¿Eliminar el hito "${confirmDelete.label}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { deleteHito(confirmDelete.id); setConfirmDelete(null); }}
        />
      )}
    </div>
  );
}

// Sube el archivo .xlsx lleno y muestra cuántas órdenes/pagos trae antes de aplicar — reemplaza
// TODA la lista de órdenes de este proyecto por lo que traiga el archivo (por eso el aviso).
// Deja elegir un rango de fechas para exportar (imprimir) los pagos con estado "programado" cuya
// fecha caiga dentro de ese rango. Ambas fechas son opcionales por separado (solo "desde", solo
// "hasta", o ambas) para no obligar a acotar por los dos lados.
function PagosRangeExportModal({ onClose, onExport }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Exportar pagos programados</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>
          Elige el rango de fechas de los pagos programados que quieres exportar. Se abrirá el
          diálogo de impresión — elige "Guardar como PDF".
        </p>
        <label style={styles.modalField}>
          <span>Desde</span>
          <input type="date" style={styles.input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={styles.modalField}>
          <span>Hasta</span>
          <input type="date" style={styles.input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button style={{ ...styles.addProjectBtn, marginTop: 8 }} onClick={() => onExport({ from, to })}>
          Exportar
        </button>
      </div>
    </div>
  );
}

function PresupuestoTemplateModal({ onClose, onImport }) {
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
      const { items, skipped } = parsePresupuestoWorkbook(buf);
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

// Sin "groups" muestra todas las categorías (comportamiento de siempre); con "groups" (ver
// EnergizacionModule) solo muestra las categorías que ese trámite en concreto usa.
function Legend({ groups }) {
  const cats = groups ? Array.from(new Set(groups.map((g) => g.cat))) : Object.keys(CAT_STYLE);
  return (
    <div style={styles.legend}>
      {cats.map((k) => {
        const v = CAT_STYLE[k];
        if (!v) return null;
        return (
          <span key={k} style={{ ...styles.legendItem, color: v.fg }}>
            ● {v.label}
          </span>
        );
      })}
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

const CLONE_MODULE_OPTIONS = [
  { key: "presupuesto", label: "Presupuesto" },
  { key: "cronograma", label: "Cronograma" },
  { key: "upme", label: "UPME" },
  { key: "energizacion", label: "Energización" },
  { key: "pagos", label: "Pagos" },
  { key: "balance", label: "Balance financiero" },
];

function ProjectFormModal({ onClose, onSave, initial, title, submitLabel, existingProjects }) {
  const [name, setName] = useState(initial?.name || "");
  const [code, setCode] = useState(initial?.code || "");
  const [capacity, setCapacity] = useState(initial?.capacity || "");
  const initialUbicacion = parseUbicacion(initial?.location);
  const [departamento, setDepartamento] = useState(initialUbicacion.departamento);
  const [municipio, setMunicipio] = useState(initialUbicacion.municipio);
  const [cloneSourceId, setCloneSourceId] = useState("");
  const [cloneModules, setCloneModules] = useState({
    presupuesto: true, cronograma: true, upme: false, energizacion: false, pagos: false, balance: false,
  });

  const location = departamento && municipio ? `${municipio}, ${departamento}` : "";
  const canClone = !initial && existingProjects && existingProjects.length > 0;

  const handleSave = () => {
    const cloneFrom = cloneSourceId
      ? { sourceProjectId: cloneSourceId, modules: cloneModules }
      : null;
    onSave(name.trim(), capacity.trim(), location, cloneFrom, code.trim());
  };

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
          <span>Código corto (opcional)</span>
          <input style={styles.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. GP084" />
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

        {canClone && (
          <label style={styles.modalField}>
            <span>Crear con base a un proyecto existente (opcional)</span>
            <select style={styles.input} value={cloneSourceId} onChange={(e) => setCloneSourceId(e.target.value)}>
              <option value="">Desde cero (plantilla en blanco)</option>
              {existingProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}

        {canClone && cloneSourceId && (
          <div style={{ margin: "4px 0 12px" }}>
            <div style={{ fontSize: 12, color: "#7A8A93", marginBottom: 6 }}>¿Qué quieres copiar de ese proyecto?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {CLONE_MODULE_OPTIONS.map((m) => (
                <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#E8EDEF" }}>
                  <input
                    type="checkbox"
                    checked={!!cloneModules[m.key]}
                    onChange={(e) => setCloneModules({ ...cloneModules, [m.key]: e.target.checked })}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <button
          style={{ ...styles.addProjectBtn, marginTop: 8, opacity: name.trim() ? 1 : 0.5 }}
          disabled={!name.trim()}
          onClick={handleSave}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

const TAB_LABELS = {
  resumen: "Resumen", upme: "UPME", energizacion: "Energización",
  cronograma: "Cronograma", presupuesto: "Presupuesto", pagos: "Pagos", balance: "Balance financiero",
};

// Qué casilla de "cargos" controla la edición de cada pestaña (resumen no tiene, es solo dashboard).
const TAB_PERM_KEY = {
  upme: "puede_editar_upme",
  energizacion: "puede_editar_energizacion",
  cronograma: "puede_editar_cronograma",
  presupuesto: "puede_editar_presupuesto",
  pagos: "puede_editar_pagos",
  balance: "puede_editar_balance",
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

// Selector de proyectos para el informe PP-I-01 (control presupuestal y cronograma) — cubre varios
// proyectos en un solo archivo, así que se elige aparte del "Exportar PDF" normal (que es de un
// proyecto o del resumen general).
function InformePPI01Modal({ projects, onClose, onExportExcel, onExportPDF }) {
  const [selected, setSelected] = useState(() => new Set(projects.map((p) => p.id)));
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  const [generating, setGenerating] = useState(false);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedIds = Array.from(selected);
  const disabled = selectedIds.length === 0;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.exportModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Exportar informe PP-I-01</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>
          Elige los proyectos que quieres incluir (control presupuestal y cronograma) — cada uno
          queda en su propia página/hoja del informe.
        </p>
        <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, margin: "8px 0 14px" }}>
          {projects.map((p) => (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#E8EDEF" }}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              {p.name}{p.capacity ? ` — ${p.capacity} MWp` : ""}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <label style={{ ...styles.modalField, flex: 1 }}>
            <span>Periodo del informe — desde</span>
            <input type="date" style={styles.input} value={periodoDesde} onChange={(e) => setPeriodoDesde(e.target.value)} />
          </label>
          <label style={{ ...styles.modalField, flex: 1 }}>
            <span>Periodo del informe — hasta</span>
            <input type="date" style={styles.input} value={periodoHasta} onChange={(e) => setPeriodoHasta(e.target.value)} />
          </label>
        </div>
        {disabled && <div style={{ color: "#E8A33D", fontSize: 12, marginBottom: 10 }}>Elige al menos un proyecto.</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            style={{ ...styles.addProjectBtn, flex: 1, opacity: disabled || generating ? 0.6 : 1 }}
            disabled={disabled || generating}
            onClick={async () => {
              setGenerating(true);
              try {
                await onExportExcel(selectedIds, { periodoDesde, periodoHasta });
              } finally {
                setGenerating(false);
              }
            }}
          >
            {generating ? <Loader2 className="spin" size={14} /> : <FileDown size={14} />} Descargar Excel
          </button>
          <button
            style={{ ...styles.confirmCancelBtn, flex: 1, opacity: disabled ? 0.6 : 1 }}
            disabled={disabled}
            onClick={() => onExportPDF(selectedIds)}
          >
            Exportar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de admin: marca qué personas pueden ver/editar este proyecto. Los admins siempre tienen
// acceso a todo (no aparecen como editables aquí, se muestran ya marcados y bloqueados).
function ProjectMembersModal({ project, onClose }) {
  const [profiles, setProfiles] = useState([]);
  const [memberIds, setMemberIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: members, error: membersError }] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, role").order("email"),
        supabase.from("project_members").select("user_id").eq("project_id", project.id),
      ]);
      if (membersError) setError("No se pudo cargar quién tiene acceso. Intenta de nuevo.");
      setProfiles(profs || []);
      setMemberIds(new Set((members || []).map((m) => m.user_id)));
      setLoading(false);
    })();
  }, [project.id]);

  const toggle = async (userId, checked) => {
    setBusyId(userId);
    setError("");
    if (checked) {
      const { error: err } = await supabase.from("project_members").insert({ project_id: project.id, user_id: userId });
      if (err) setError("No se pudo dar acceso. Intenta de nuevo.");
      else setMemberIds((prev) => new Set(prev).add(userId));
    } else {
      const { error: err } = await supabase.from("project_members").delete().eq("project_id", project.id).eq("user_id", userId);
      if (err) setError("No se pudo quitar el acceso. Intenta de nuevo.");
      else setMemberIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    }
    setBusyId(null);
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Acceso a "{project.name}"</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.confirmMsg}>
          Marca quién puede ver y editar este proyecto. Los administradores siempre tienen acceso a
          todos los proyectos, sin importar esta lista.
        </p>
        {error && <div style={styles.importError}>{error}</div>}
        {loading ? (
          <div style={{ padding: "16px 0", color: "#7A8A93", fontSize: 13 }}>Cargando…</div>
        ) : profiles.length === 0 ? (
          <div style={{ padding: "16px 0", color: "#7A8A93", fontSize: 13 }}>No hay usuarios registrados todavía.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto", marginTop: 8 }}>
            {profiles.map((p) => {
              const isProfAdmin = p.role === "admin";
              return (
                <label
                  key={p.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderRadius: 8, background: "#1C242A", opacity: busyId === p.id ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isProfAdmin || memberIds.has(p.id)}
                    disabled={isProfAdmin || busyId === p.id}
                    onChange={(e) => toggle(p.id, e.target.checked)}
                  />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 13, color: "#E8EDEF" }}>{p.full_name || p.email}</span>
                    <span style={{ fontSize: 11, color: "#7A8A93" }}>
                      {p.email}{isProfAdmin ? " · admin (acceso a todo)" : ""}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const CARGO_PERMISOS = [
  { key: "puede_editar_upme", label: "Editar UPME" },
  { key: "puede_editar_energizacion", label: "Editar Energización" },
  { key: "puede_editar_cronograma", label: "Editar Cronograma" },
  { key: "puede_editar_presupuesto", label: "Editar Presupuesto" },
  { key: "puede_editar_pagos", label: "Editar Pagos" },
  { key: "puede_aprobar_pagos", label: "Aprobar pagos" },
  { key: "puede_editar_balance", label: "Editar Balance financiero" },
  { key: "puede_eliminar_proyectos", label: "Eliminar proyectos" },
  { key: "puede_gestionar_usuarios", label: "Gestionar cargos y usuarios" },
];

// Agrupa los permisos por tema (en vez de un solo bloque de 9 casillas) para que un cargo
// expandido se pueda leer de un vistazo en vez de sentirse como un muro de checkboxes.
const CARGO_PERMISO_GROUPS = [
  { title: "Módulos", keys: ["puede_editar_upme", "puede_editar_energizacion", "puede_editar_cronograma", "puede_editar_presupuesto"] },
  { title: "Pagos", keys: ["puede_editar_pagos", "puede_aprobar_pagos"] },
  { title: "Administración", keys: ["puede_editar_balance", "puede_eliminar_proyectos", "puede_gestionar_usuarios"] },
];

// Admin (solo lectura aquí, arriba de todo). Crea/edita cargos con sus casillas de permisos, y
// asigna el cargo de cada persona registrada. Arranca en blanco a propósito — nadie (salvo admin)
// tiene ningún permiso hasta que se cree un cargo y se le asigne. El admin también puede elegirse
// un cargo — no le cambia ningún permiso (admin siempre puede todo), es solo la etiqueta que se usa
// en "Cargo del responsable" al exportar el informe PP-I-01.
function CargosModal({ onClose }) {
  const [cargos, setCargos] = useState(null); // null = cargando
  const [profiles, setProfiles] = useState([]);
  const [newCargoName, setNewCargoName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteCargo, setConfirmDeleteCargo] = useState(null); // { id, nombre } | null
  const [expandedCargoId, setExpandedCargoId] = useState(null); // solo un cargo expandido a la vez

  const load = async () => {
    const [{ data: cargosData, error: cargosErr }, { data: profilesData }] = await Promise.all([
      supabase.from("cargos").select("*").order("nombre"),
      supabase.from("profiles").select("id, email, full_name, role, cargo_id").order("email"),
    ]);
    if (cargosErr) setError("No se pudo cargar los cargos. Intenta de nuevo.");
    setCargos(cargosData || []);
    setProfiles(profilesData || []);
  };

  useEffect(() => { load(); }, []);

  const addCargo = async () => {
    if (!newCargoName.trim()) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("cargos").insert({ nombre: newCargoName.trim() });
    if (err) setError("No se pudo crear el cargo (¿ya existe uno con ese nombre?).");
    else { setNewCargoName(""); await load(); }
    setBusy(false);
  };

  const updateCargoPerm = async (cargo, key, value) => {
    setBusy(true);
    setError("");
    setCargos((prev) => prev.map((c) => (c.id === cargo.id ? { ...c, [key]: value } : c)));
    const { error: err } = await supabase.from("cargos").update({ [key]: value }).eq("id", cargo.id);
    if (err) { setError("No se pudo guardar el cambio. Intenta de nuevo."); await load(); }
    setBusy(false);
  };

  const deleteCargo = async (id) => {
    setBusy(true);
    await supabase.from("cargos").delete().eq("id", id);
    await load();
    setBusy(false);
  };

  const assignCargo = async (profileId, cargoId) => {
    setBusy(true);
    setError("");
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, cargo_id: cargoId || null } : p)));
    const { error: err } = await supabase.from("profiles").update({ cargo_id: cargoId || null }).eq("id", profileId);
    if (err) { setError("No se pudo asignar el cargo. Intenta de nuevo."); await load(); }
    setBusy(false);
  };

  return (
    <>
      <div style={styles.modalOverlay} onClick={onClose}>
        <div style={{ ...styles.exportModal, width: 640 }} onClick={(e) => e.stopPropagation()}>
          <div style={styles.modalHead}>
            <h3 style={styles.h3}>Cargos y usuarios</h3>
            <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
          </div>
          {error && <div style={styles.importError}>{error}</div>}
          {cargos === null ? (
            <div style={{ padding: "16px 0", color: "#7A8A93", fontSize: 13 }}>Cargando…</div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDEF", margin: "8px 0" }}>Usuarios</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", marginBottom: 20 }}>
                {profiles.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "#1C242A", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <span style={{ fontSize: 12.5, color: "#E8EDEF" }}>{p.full_name || p.email}</span>
                      <span style={{ fontSize: 11, color: "#7A8A93" }}>{p.email}{p.role === "admin" ? " · admin (acceso a todo)" : ""}</span>
                    </div>
                    <select
                      style={{ ...styles.miniInput, width: 190 }}
                      value={p.cargo_id || ""}
                      disabled={busy}
                      onChange={(e) => assignCargo(p.id, e.target.value)}
                    >
                      <option value="">Sin cargo</option>
                      {cargos.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDEF", margin: "8px 0" }}>Cargos</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", marginBottom: 10 }}>
                {cargos.length === 0 && (
                  <div style={{ fontSize: 12, color: "#7A8A93" }}>Todavía no hay cargos creados — crea el primero abajo.</div>
                )}
                {cargos.map((c) => {
                  const isOpen = expandedCargoId === c.id;
                  return (
                    <div key={c.id} style={{ background: "#1C242A", borderRadius: 8, overflow: "hidden" }}>
                      <div
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px 10px 6px", cursor: "pointer" }}
                        onClick={() => setExpandedCargoId(isOpen ? null : c.id)}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {isOpen ? <ChevronDown size={15} color="#7A8A93" /> : <ChevronRight size={15} color="#7A8A93" />}
                          <strong style={{ fontSize: 13, color: "#E8EDEF" }}>{c.nombre}</strong>
                        </span>
                        <button
                          style={styles.rowDeleteBtn}
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteCargo({ id: c.id, nombre: c.nombre }); }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {isOpen && (
                        <div style={{ padding: "0 12px 12px" }}>
                          {CARGO_PERMISO_GROUPS.map((group, gi) => (
                            <div key={group.title} style={{ borderTop: gi > 0 ? "1px solid #232D33" : "none", paddingTop: gi > 0 ? 10 : 0, marginTop: gi > 0 ? 10 : 0 }}>
                              <div style={{ fontSize: 10, color: "#5F6B72", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{group.title}</div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px 16px" }}>
                                {group.keys.map((key) => {
                                  const perm = CARGO_PERMISOS.find((p) => p.key === key);
                                  return (
                                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#C7D1D6" }}>
                                      <input
                                        type="checkbox"
                                        checked={!!c[key]}
                                        disabled={busy}
                                        onChange={(e) => updateCargoPerm(c, key, e.target.checked)}
                                      />
                                      {perm.label}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ ...styles.miniInput, flex: 1 }}
                  placeholder="Nombre del cargo nuevo (ej. Contador)"
                  value={newCargoName}
                  onChange={(e) => setNewCargoName(e.target.value)}
                />
                <button style={{ ...styles.addProjectBtn, opacity: newCargoName.trim() ? 1 : 0.5 }} disabled={!newCargoName.trim() || busy} onClick={addCargo}>
                  <Plus size={14} /> Crear cargo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {confirmDeleteCargo && (
        <ConfirmModal
          title="Eliminar cargo"
          message={`¿Eliminar el cargo "${confirmDeleteCargo.nombre}"? Quien lo tenga asignado se queda sin permisos hasta que le asignes otro.`}
          confirmLabel="Eliminar"
          onCancel={() => setConfirmDeleteCargo(null)}
          onConfirm={() => { deleteCargo(confirmDeleteCargo.id); setConfirmDeleteCargo(null); }}
        />
      )}
    </>
  );
}

// Cualquier persona puede editar su propio nombre (a diferencia del cargo, que solo el admin
// asigna) — hoy en día "full_name" solo se guardaba una vez, al crear la cuenta, sin forma de
// corregirlo después. Se usa como "Nombre del responsable" al exportar el informe PP-I-01.
function EditNameModal({ userId, currentName, onClose, onSaved }) {
  const [name, setName] = useState(currentName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", userId);
    if (err) { setError("No se pudo guardar el nombre. Intenta de nuevo."); setBusy(false); return; }
    onSaved(name.trim());
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Mi nombre</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        {error && <div style={styles.importError}>{error}</div>}
        <label style={styles.modalField}>
          <span>Nombre completo</span>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Juan Acuña Guerrero" autoFocus />
        </label>
        <button style={{ ...styles.addProjectBtn, marginTop: 8, opacity: name.trim() ? 1 : 0.5 }} disabled={!name.trim() || busy} onClick={save}>
          Guardar
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
        ) : tab === "balance" ? (
          <PrintBalanceContent data={data.balance} pagos={data.pagos} presupuesto={data.presupuesto} />
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

// Vista de impresión de pagos PROGRAMADOS dentro de un rango de fechas (el "desde"/"hasta" que se
// eligió en PagosRangeExportModal). Cada bando del rango es opcional por separado.
function PrintPagosRangeContent({ project, data, range }) {
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

function PrintBalanceContent({ data, pagos, presupuesto }) {
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
function PrintInformePPI01({ projects, projectDataById }) {
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
                    <XAxis dataKey="label" tick={{ fill: "#777", fontSize: 9 }} />
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

function GlobalStyle() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body, html, #root { margin:0; padding:0; }
      input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
      ::selection { background: #F5B94255; }
      select option { background:#FFFFFF; color:#22312D; }
      select optgroup { background:#F2F6F4; color:#22312D; font-style:normal; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .readonly-gate input:not(.approve-toggle),
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
        .app-tabs { overflow-x: auto !important; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; }
        .app-tabs::-webkit-scrollbar { height: 3px; }
        .app-resumen-grid { grid-template-columns: 1fr !important; }
        .app-stat-row { grid-template-columns: repeat(2, 1fr) !important; }
        .app-main input, .app-main select, .app-main button { min-height: 34px; }
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
    background: BRAND_DARK,
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
  brand: { display: "flex", alignItems: "center", gap: 12, padding: "4px 4px 10px" },
  brandLogo: { width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 },
  brandSub: { fontSize: 11, color: "#7A8A93", marginTop: 1, fontFamily: FONT_BRAND_BODY },
  // "GUMAR" / "PROYECTOS" apiladas en 2 líneas, mismo tamaño y alineación para que se vean
  // simétricas entre sí.
  brandWordmark: { lineHeight: 1.15 },
  brandWordmarkLine: { fontFamily: FONT_BRAND_DISPLAY, fontWeight: 700, fontSize: 15, letterSpacing: 0.5, color: "#FFFFFF" },
  addProjectBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    background: BRAND_LIGHT, color: "#1F332C", border: "none", borderRadius: 8,
    padding: "9px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer",
    fontFamily: FONT_BRAND_BODY,
  },
  projectList: { display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" },
  noProjects: { color: "#5A6870", fontSize: 12.5, padding: "10px 4px", fontFamily: FONT_BRAND_BODY },
  sidebarFooter: { marginTop: "auto", paddingTop: 14, borderTop: "1px solid #232D33", display: "flex", flexDirection: "column", gap: 8 },
  sharedNote: { fontSize: 10.5, color: "#7A8A93", lineHeight: 1.4, padding: "0 2px", fontFamily: FONT_BRAND_BODY },
  footerBtnRow: { display: "flex", gap: 6 },
  footerBtn: {
    flex: 1, background: BRAND_LIGHT, border: "1px solid #8FBBAC", color: "#1F332C", borderRadius: 8,
    padding: "8px 6px", fontSize: 11, cursor: "pointer", fontFamily: FONT_BRAND_BODY,
  },
  projectItem: {
    background: OFF_WHITE, border: "1px solid #8FBBAC", borderRadius: 10,
    padding: "10px 12px", cursor: "pointer",
  },
  projectItemActive: { borderColor: BRAND_DARK, background: "#D9F5E6" },
  projectItemTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  projectName: { fontSize: 13.5, fontWeight: 600, fontFamily: FONT_BRAND_DISPLAY, color: "#1F332C" },
  deleteBtn: { background: "none", border: "none", color: "#3E5850", cursor: "pointer", padding: 2 },
  projectMeta: { fontSize: 11, color: "#3E5850", marginBottom: 8, fontFamily: FONT_BRAND_BODY },
  miniBarRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 },
  miniBarLabel: { fontSize: 9.5, color: "#3E5850", width: 62, flexShrink: 0, fontFamily: FONT_BRAND_BODY },
  miniBarTrack: { flex: 1, height: 4, background: "#E3E9E6", borderRadius: 4, overflow: "hidden" },
  miniBarFill: { height: "100%", borderRadius: 4 },
  miniBarPct: { fontSize: 9.5, color: "#1F332C", width: 28, textAlign: "right", fontFamily: FONT_BRAND_BODY },

  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  noPrintWrap: { display: "flex", flex: 1, minWidth: 0 },
  header: {
    padding: "22px 32px 18px", display: "flex", justifyContent: "space-between",
    alignItems: "flex-end", flexWrap: "wrap", gap: 16, background: BRAND_DARK,
  },
  headerEyebrow: { fontFamily: FONT_BRAND_BODY, fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "#DCEAE4" },
  h1: { fontFamily: FONT_BRAND_DISPLAY, fontSize: 24, margin: 0, fontWeight: 600, letterSpacing: 0.2, color: "#FFFFFF" },
  headerMeta: { color: "#DCEAE4", fontSize: 12.5, marginTop: 4, fontFamily: FONT_MONO },
  headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 },
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  saveBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #8FBBAC",
    color: "#FFFFFF", padding: "6px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11.5,
    fontFamily: FONT_MONO,
  },
  pdfBtn: {
    display: "flex", alignItems: "center", gap: 6, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`,
    color: OVERVIEW_LIGHT.textPrimary, padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12,
    fontFamily: FONT_BRAND_BODY, fontWeight: 500,
  },
  tabs: { display: "flex", gap: 4, paddingBottom: 14 },
  tabBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #FFFFFF66",
    color: "#FFFFFF", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
    fontFamily: FONT_BRAND_BODY, fontWeight: 500,
  },
  // La pestaña activa solo cambia el relleno a blanco — mismo tamaño/borde/radio que las demás,
  // para que todas queden simétricas entre sí.
  tabBtnActive: { background: OVERVIEW_LIGHT.card, border: "1px solid " + OVERVIEW_LIGHT.card, color: OVERVIEW_LIGHT.textPrimary, fontWeight: 700 },
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
  alertModuloTagRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  alertModuloTag: {
    fontSize: 11, fontWeight: 600, color: "#E8A33D", background: "#2A2013",
    border: "1px solid #4A3820", borderRadius: 20, padding: "3px 10px",
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
  dayCounter: { fontFamily: FONT_MONO, fontSize: 13, color: "#FFFFFF", paddingBottom: 4 },
  legend: { display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, marginLeft: "auto", paddingBottom: 6 },
  legendItem: { fontFamily: FONT_BRAND_BODY },
  wbsGroup: { marginTop: 22, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 12, padding: "16px 18px" },
  wbsGroupHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 },
  wbsGroupTitle: { display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_BRAND_DISPLAY, fontSize: 13.5, fontWeight: 600, color: OVERVIEW_LIGHT.textPrimary },
  wbsDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  wbsGroupMeta: { display: "flex", alignItems: "center", gap: 10 },
  wbsCost: { fontFamily: FONT_MONO, fontSize: 11, color: OVERVIEW_LIGHT.textSecondary },
  wbsPct: { fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700 },
  wbsBarTrack: { height: 4, background: "#E3E9E6", borderRadius: 4, overflow: "hidden", marginBottom: 12 },
  wbsBarFill: { height: "100%", borderRadius: 4 },
  wbsItems: { display: "flex", flexDirection: "column", gap: 2 },
  wbsItemRow: {
    display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
    borderLeft: "2.5px solid", borderRadius: 4,
  },
  wbsCheck: { background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" },
  wbsItemTitle: { flex: 1, fontSize: 12.5, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY },
  wbsItemTitleDone: { flex: 1, fontSize: 12.5, color: "#8FA39B", textDecoration: "line-through", fontFamily: FONT_BRAND_BODY },
  wbsItemDay: { fontFamily: FONT_MONO, fontSize: 10.5, color: OVERVIEW_LIGHT.textSecondary, width: 52, textAlign: "right" },
  wbsItemCost: { fontFamily: FONT_MONO, fontSize: 10.5, color: OVERVIEW_LIGHT.textSecondary, width: 26, textAlign: "right" },
  wbsItemDate: { fontFamily: FONT_MONO, fontSize: 10.5, color: "#5FBF8F", width: 74, textAlign: "right" },
  wbsItemDatePlaceholder: { fontFamily: FONT_MONO, fontSize: 10.5, color: "#B8C4BF", width: 74, textAlign: "right" },


  modalOverlay: {
    position: "fixed", inset: 0, background: "#00000090", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 50,
  },
  modal: { background: "#171E23", border: "1px solid #2A3339", borderRadius: 14, padding: 24, width: "min(360px, calc(100vw - 32px))" },
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
    display: "flex", alignItems: "center", gap: 8, background: BRAND_LIGHT, border: "1px solid #8FBBAC",
    color: "#1F332C", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, cursor: "pointer",
    fontFamily: FONT_BRAND_BODY, fontWeight: 500,
  },
  overviewNavBtnActive: { borderColor: OVERVIEW_LIGHT.card, background: OVERVIEW_LIGHT.card, color: OVERVIEW_LIGHT.textPrimary, fontWeight: 700 },
  footerBtnFull: {
    width: "100%", background: BRAND_LIGHT, border: "1px solid #8FBBAC", color: "#1F332C", borderRadius: 8,
    padding: "8px 6px", fontSize: 11, cursor: "pointer", fontFamily: FONT_BRAND_BODY,
  },
  footerToggleBtn: {
    width: "100%", display: "flex", alignItems: "center", gap: 6, background: "none",
    border: "1px solid #8FBBAC", color: "#DCEAE4", borderRadius: 8,
    padding: "8px 10px", fontSize: 11.5, cursor: "pointer", fontFamily: FONT_BRAND_BODY, fontWeight: 500,
  },
  footerToggleBtnActive: { background: OVERVIEW_LIGHT.card, borderColor: OVERVIEW_LIGHT.card, color: OVERVIEW_LIGHT.textPrimary, fontWeight: 700 },

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
    fontFamily: FONT_MONO, fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary, padding: "0 6px", display: "inline-block", cursor: "default",
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
  presSubTabs: { display: "flex", gap: 4, marginBottom: 0 },
  presSubTabBtn: {
    background: "#171E23", border: "1px solid #232D33", color: "#7A8A93", borderRadius: 8,
    padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 500,
  },
  presSubTabBtnActive: { borderColor: "#F5B942", background: "#1C1A14", color: "#E8EDEF" },
  presGroupRow: {
    padding: "8px 16px", fontSize: 11.5, fontWeight: 700, color: "#1F332C", background: BRAND_LIGHT,
    borderBottom: `1px solid ${OVERVIEW_LIGHT.border}`, textTransform: "uppercase", letterSpacing: 0.3,
  },
  presExcedidoTag: { color: "#E2604F", fontSize: 10, fontWeight: 700, textTransform: "none", letterSpacing: 0 },
  presReadonlyText: {
    display: "inline-block", padding: "5px 8px", fontSize: 11.5, fontFamily: FONT_BODY, color: "#C7D1D6",
  },
  pasteBtnRow: { display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 },
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
  upmeStepCard: { background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 12, padding: "14px 16px" },
  upmeStepCardSkipped: { opacity: 0.7 },
  upmeStepHead: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  upmeStepNum: {
    width: 30, height: 30, borderRadius: "50%", border: "1.5px solid", display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: FONT_MONO, flexShrink: 0,
  },
  upmeStepLabel: { fontSize: 13.5, color: OVERVIEW_LIGHT.textPrimary, fontWeight: 500, fontFamily: FONT_BRAND_BODY },
  upmeSkippedTag: { fontSize: 10.5, color: "#8FA39B", marginTop: 2, fontFamily: FONT_BRAND_BODY },
  upmeCheckToggle: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary, cursor: "pointer", fontFamily: FONT_BRAND_BODY },
  upmeStepBody: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12, paddingLeft: 42 },
  upmeDecisionBox: {
    display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY,
    background: BRAND_LIGHT, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 8, padding: "8px 12px",
  },
  pagosAlertBox: {
    background: "#171E23", border: "1px solid #E8A33D55", borderRadius: 12, padding: "14px 18px", marginBottom: 18,
  },
  readonlyBanner: {
    display: "flex", alignItems: "center", gap: 8, margin: "0 32px", padding: "8px 14px",
    background: "#1C242A", border: "1px solid #2A3339", borderRadius: 8, color: "#7A8A93", fontSize: 12,
  },
};
