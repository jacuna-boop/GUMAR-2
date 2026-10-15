import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { Circle, FileDown, Loader2, X } from "lucide-react";
import Login from "./components/Login";
import { useProjectSync } from "./hooks/useProjectSync";
import { buildCronogramaBaseFromTemplate, buildPresupuestoBaseFromTemplate, classifyEnergizacionTipo, cloneBalanceState, cloneCronogramaState, cloneEnergizacionState, clonePagosState, clonePresupuestoState, cloneUpmeState, emptyEnergizacionState, emptyProjectData, ensureFullProjectData, todayISO } from "./lib/data.js";
import gumarLogo from "./assets/gumar-logo.jpg";

import { styles } from "./styles.js";
import { TAB_PERM_KEY } from "./lib/permisos.js";
import { GlobalStyle } from "./components/GlobalStyle.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { EmptyState, ProjectsLoadError } from "./components/common.jsx";
import { FONT_BRAND_BODY, FONT_BRAND_DISPLAY, OVERVIEW_LIGHT } from "./theme.js";
import { ResumenGeneral } from "./modules/ResumenGeneral.jsx";
import { Header } from "./components/Header.jsx";
import { Resumen } from "./modules/Resumen.jsx";
import { UpmeModule } from "./modules/Upme.jsx";
import { EnergizacionModule } from "./modules/Energizacion.jsx";
import { CronogramaModule } from "./modules/Cronograma.jsx";
import { PresupuestoModule } from "./modules/Presupuesto.jsx";
import { PagosModule } from "./modules/Pagos.jsx";
import { BalanceModule } from "./modules/Balance.jsx";
import { PrintCurrentTab, PrintInformePPI01, PrintPagosRangeContent, PrintResumenGeneral, PrintResumenProject } from "./print/PrintViews.jsx";
import { InformePPI01Modal } from "./modals/InformePPI01Modal.jsx";
import { ConfirmModal, ExportPdfModal, ImportTextModal } from "./modals/dialogs.jsx";
import { HistoryModal } from "./modals/HistoryModal.jsx";
import { ProjectFormModal } from "./modals/ProjectFormModal.jsx";
import { CargosModal, EditNameModal, ProjectMembersModal } from "./modals/admin.jsx";
import { ConflictModal } from "./modals/ConflictModal.jsx";

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
        <Loader2 className="spin" size={28} color="#FFFFFF" />
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
  const {
    projectData, getProjectData, loadErrors, loadProjectData, updateProjectData,
    saveStatus, saveErrorMessage, lastSaved, versioned, conflict, resolveConflict,
    flushAll, retryNow, hasUnsaved, setProjectRow, forgetProject, forgetAll, discardAndReload, restoreFromHistory,
  } = useProjectSync(user);
  const [showAddProject, setShowAddProject] = useState(false);
  const [saveError, setSaveError] = useState(false); // errores de acciones puntuales (crear, importar…)
  const [hideMigrationHint, setHideMigrationHint] = useState(false);
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
  const [role, setRole] = useState("lector"); // "admin" | "editor" | "lector" — si no se pudo leer el perfil, solo lectura (la base de datos igual decide)
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
  // Información del proyecto (Resumen): quien pueda editar algún módulo — igual que en la base de datos.
  const canEditInfo = Object.values(TAB_PERM_KEY).some((k) => hasPerm(k));

  useEffect(() => {
    const onAfterPrint = () => { setPrintTarget(null); setPagosExportRange(null); setInformePPI01Ids(null); };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);


  const rowToProject = (row) => ({ id: row.id, name: row.name, capacity: row.capacity, location: row.location, code: row.code || "", createdAt: row.created_at });

  // Lista de proyectos con reintentos. Antes un error al abrir la página (red, token vencido justo
  // al despertar el equipo) se ignoraba y se veía "Aún no tienes proyectos" aunque sí hubiera.
  // Una lista vacía sin error también se reintenta una vez: puede ser una consulta que salió sin
  // la sesión lista (RLS devuelve 0 filas en vez de error).
  const [projectsError, setProjectsError] = useState(false);
  const fetchProjects = useCallback(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: true });
      if (!error && data && (data.length > 0 || attempt >= 2)) return data;
      if (error) console.error("Error cargando proyectos:", error.message);
      if (attempt < 3) {
        if (error) await supabase.auth.refreshSession().catch(() => {});
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
    return null;
  }, []);

  const loadProjects = useCallback(async () => {
    const data = await fetchProjects();
    if (data) {
      setProjects(data.map(rowToProject));
      setProjectsError(false);
    } else {
      setProjectsError(true);
    }
  }, [fetchProjects]);

  // Initial load: full project list + el rol y cargo de quien inició sesión (para permisos)
  useEffect(() => {
    (async () => {
      const [, roleResult] = await Promise.all([
        loadProjects(),
        supabase.from("profiles").select("role, full_name, cargos(*)").eq("id", user.id).maybeSingle(),
      ]);
      // Si la columna "role"/"cargo_id" todavía no existe (no se ha corrido la migración) o no hay
      // perfil/cargo asignado, se queda en los valores por defecto — no rompe el acceso de nadie.
      if (!roleResult.error && roleResult.data?.role) setRole(roleResult.data.role);
      if (!roleResult.error && roleResult.data?.cargos) setCargoPerms(roleResult.data.cargos);
      if (!roleResult.error && roleResult.data?.cargos?.nombre) setMyCargoName(roleResult.data.cargos.nombre);
      if (!roleResult.error && roleResult.data?.full_name) setMyFullName(roleResult.data.full_name);
      setLoading(false);
    })();
  }, []);

  // Si la lista quedó vacía o con error, volver a intentar cuando la persona regresa a la pestaña.
  const projectsCountRef = useRef(0);
  useEffect(() => { projectsCountRef.current = projects.length; }, [projects.length]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && projectsCountRef.current === 0) loadProjects();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadProjects]);

  // Load selected project's data when selection changes (si falló, se reintenta con el botón, no solo)
  useEffect(() => {
    if (!selectedId || projectData[selectedId] || loadErrors[selectedId]) return;
    loadProjectData(selectedId);
  }, [selectedId, projectData, loadErrors, loadProjectData]);

  // Overview needs every project's data loaded
  useEffect(() => {
    if (view !== "overview") return;
    const missing = projects.filter((p) => !projectData[p.id] && !loadErrors[p.id]);
    missing.forEach((p) => loadProjectData(p.id));
  }, [view, projects, projectData, loadErrors, loadProjectData]);

  // Realtime de la lista de proyectos (los datos de cada proyecto los sincroniza useProjectSync).
  useEffect(() => {
    const channel = supabase
      .channel("crm-projects")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        supabase.from("projects").select("*").order("created_at", { ascending: true }).then(({ data }) => {
          if (data) setProjects(data.map(rowToProject));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const saveNow = useCallback(() => retryNow(), [retryNow]);

  // Antes de cerrar sesión, guardar lo pendiente mientras el token todavía sirve.
  const signOut = async () => {
    await flushAll();
    if (hasUnsaved() && !window.confirm("Hay cambios que no se pudieron guardar. Si cierras sesión ahora se pierden. ¿Cerrar sesión de todas formas?")) return;
    await supabase.auth.signOut();
  };

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
    const { data: insertedRow, error: insertError } = await supabase.from("project_data").insert({
      project_id: newProject.id, upme: fresh.upme, energizacion: fresh.energizacion, cronograma: fresh.cronograma, presupuesto: fresh.presupuesto, pagos: fresh.pagos, balance: fresh.balance, info: fresh.info, updated_by: user.id,
    }).select().maybeSingle();
    if (insertError || !insertedRow) setSaveError(true);
    else setProjectRow(newProject.id, insertedRow);
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
    const { data: deleted, error } = await supabase.from("projects").delete().eq("id", id).select("id");
    if (error || !deleted?.length) { setSaveError(true); return; } // RLS lo rechazó: no quitarlo de la pantalla
    setProjects((prev) => prev.filter((p) => p.id !== id));
    forgetProject(id);
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
    await Promise.all(missing.map((p) => loadProjectData(p.id)));
    const bundle = { exportedAt: new Date().toISOString(), projects, projectData: getProjectData() };
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
        project_id: inserted.id, upme: pd.upme, energizacion: pd.energizacion, cronograma: pd.cronograma, presupuesto: pd.presupuesto, pagos: pd.pagos, balance: pd.balance, info: pd.info, updated_by: user.id,
      });
    }
    const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: true });
    if (data) setProjects(data.map(rowToProject));
    await flushAll();
    forgetAll();
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
        <Loader2 className="spin" size={28} color="#FFFFFF" />
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
          onSignOut={signOut}
          myFullName={myFullName}
          onEditName={() => setShowEditNameModal(true)}
          isAdmin={isAdmin}
          isLector={isLector}
          canDeleteProjects={canDeleteProjects}
          canManageUsers={canManageUsers}
        />
        <main className="app-main" style={styles.main}>
          {projects.length === 0 && projectsError ? (
            <ProjectsLoadError onRetry={loadProjects} />
          ) : projects.length === 0 ? (
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
                  loadErrors[selectedId] ? (
                    <div style={{ color: "#E2604F", padding: 40, fontSize: 13.5 }}>
                      No se pudieron cargar los datos de este proyecto. Para no arriesgar la información guardada, no se puede editar hasta que cargue bien.
                      <div style={{ marginTop: 12 }}>
                        <button style={styles.pdfBtn} onClick={() => loadProjectData(selectedId, { force: true })}>Reintentar</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: "#8B9AA3", padding: 40 }}>Cargando proyecto…</div>
                  )
                ) : tab === "resumen" ? (
                  <Resumen
                    data={data}
                    setTab={setTab}
                    onChangeInfo={(nextInfo) => updateProjectData(selectedId, (cur) => ({ ...cur, info: nextInfo }))}
                    infoReadOnly={!canEditInfo}
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
            const { buildInformePPI01Workbook } = await import("./lib/informePPI01Excel.js"); // carga diferida (exceljs)
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
        <HistoryModal
          project={selected}
          onClose={() => setShowHistory(false)}
          canRestoreModule={(m) => (m === "info" ? canEditInfo : hasPerm(TAB_PERM_KEY[m]))}
          onRestore={(historyId, modules) => restoreFromHistory(selected.id, historyId, modules)}
        />
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
        <CargosModal myUserId={user.id} onClose={() => setShowCargosModal(false)} />
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
      {conflict && (
        <ConflictModal
          conflict={conflict}
          projectName={projects.find((p) => p.id === conflict.projectId)?.name || "este proyecto"}
          localData={projectData[conflict.projectId]}
          onResolve={resolveConflict}
        />
      )}
      {saveStatus === "error" && (
        <div className="no-print" style={{ ...styles.saveError, bottom: saveError ? 80 : 20 }}>
          {saveErrorMessage ? (
            <>
              No se guardó: {saveErrorMessage}
              <button onClick={discardAndReload} style={{ ...styles.saveErrorClose, textDecoration: "underline", whiteSpace: "nowrap" }}>
                Descartar y recargar
              </button>
            </>
          ) : (
            <>
              No se pudieron guardar tus últimos cambios. Siguen en esta pantalla y se reintenta solo; no cierres la pestaña.
              <button onClick={saveNow} style={{ ...styles.saveErrorClose, textDecoration: "underline", whiteSpace: "nowrap" }}>
                Reintentar
              </button>
            </>
          )}
        </div>
      )}
      {versioned === false && isAdmin && !hideMigrationHint && (
        <div className="no-print" style={{ ...styles.saveError, bottom: "auto", top: 20, background: "#2E2815", borderColor: "#F5B942" }}>
          Falta correr supabase/proteger_datos.sql en Supabase: sin eso no se detectan conflictos entre editores ni se guarda el historial en el servidor.
          <button onClick={() => setHideMigrationHint(true)} style={styles.saveErrorClose}><X size={14} /></button>
        </div>
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
