import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { emptyProjectData, ensureFullProjectData } from "../lib/data.js";
import { PROJECT_MODULES, diffModules, rowVersions, planServerMerge, pickModules, retryDelayMs } from "../lib/sync.js";

const SAVE_DEBOUNCE_MS = 700;
const FAILURES_BEFORE_ERROR = 3;

// Carga, guardado y sincronización en vivo de project_data.
//
// Reglas que evitan perder datos (todas aprendidas a la mala):
// - Se guarda SOLO la columna del módulo que cambió, nunca las 7 — si no, editar UPME pisaba los
//   Pagos que otra persona acababa de guardar.
// - Con la migración supabase/proteger_datos.sql, cada módulo tiene un número de versión. El
//   guardado (rpc save_project_modules) se rechaza si alguien más guardó ese módulo después de
//   que lo abrimos → se muestra un aviso de conflicto en vez de sobrescribir en silencio.
//   Sin la migración, la app sigue funcionando en "modo sin versionado" (guardado por columna,
//   sin detección de conflictos).
// - Si la carga de un proyecto falla, NO se rellena con datos vacíos (eso terminaba guardando un
//   proyecto vacío encima del real): se marca el error y no se puede editar hasta recargar.
// - Un solo guardado en curso por proyecto; lo que se edite mientras tanto sale en el siguiente.
export function useProjectSync(user) {
  const [projectData, setProjectData] = useState({});
  const [loadErrors, setLoadErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState("saved"); // saving | saved | error | conflict
  const [lastSaved, setLastSaved] = useState(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState(null); // motivo cuando la base de datos rechaza por permisos
  const [conflict, setConflict] = useState(null); // { projectId, modules, serverRow }
  const conflictRef = useRef(null);
  const [versioned, setVersioned] = useState(null); // null = aún no se sabe

  const dataRef = useRef({}); // espejo síncrono de projectData
  const versions = useRef({}); // { [id]: { modulo: n } | null }
  const dirty = useRef({}); // { [id]: Set(modulos con cambios sin guardar) }
  const inFlight = useRef({}); // { [id]: { modules: Set, promise } }
  const timers = useRef({});
  const paused = useRef({}); // { [id]: true } mientras hay un conflicto sin resolver
  const failures = useRef({});
  const loading = useRef({});
  const epoch = useRef({}); // se incrementa con cada edición local (para descartar lecturas viejas)

  const commit = useCallback((id, next) => {
    dataRef.current = { ...dataRef.current, [id]: next };
    setProjectData(dataRef.current);
  }, []);

  const dirtySet = (id) => dirty.current[id] || (dirty.current[id] = new Set());
  const busyModules = (id) => new Set([...(dirty.current[id] || []), ...(inFlight.current[id]?.modules || [])]);

  const hasUnsaved = useCallback(() => {
    return Object.values(dirty.current).some((s) => s && s.size > 0)
      || Object.keys(inFlight.current).length > 0;
  }, []);

  const refreshStatus = useCallback(() => {
    if (Object.keys(paused.current).length) return setSaveStatus("conflict");
    const failing = Object.keys(failures.current).some((id) => failures.current[id] >= FAILURES_BEFORE_ERROR && dirty.current[id]?.size);
    if (failing) return setSaveStatus("error");
    setSaveStatus(hasUnsaved() ? "saving" : "saved");
  }, [hasUnsaved]);

  const applyFullRow = useCallback((id, row) => {
    commit(id, ensureFullProjectData(row));
    const v = rowVersions(row);
    versions.current[id] = v;
    setVersioned(v !== null);
    dirty.current[id] = new Set();
  }, [commit]);

  // Historial en modo sin versionado (sin la migración el servidor no lo registra solo).
  const logHistoryLegacy = useCallback(async (id, data) => {
    try {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("project_history")
        .select("id, updated_by, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const snapshot = pickModules(data, PROJECT_MODULES);
      if (recent && recent.updated_by === user.id && recent.created_at > cutoff) {
        await supabase.from("project_history").update({ data: snapshot }).eq("id", recent.id);
      } else {
        await supabase.from("project_history").insert({ project_id: id, data: snapshot, updated_by: user.id, updated_by_email: user.email });
      }
    } catch {
      // "best effort": nunca debe afectar el guardado principal
    }
  }, [user.id, user.email]);

  const saveModules = useCallback(async (id, mods, data) => {
    const changes = pickModules(data, mods);
    const known = versions.current[id];
    if (known) {
      const { data: res, error } = await supabase.rpc("save_project_modules", {
        p_project_id: id,
        p_changes: changes,
        p_expected: pickModules(known, mods),
      });
      if (!error) {
        if (res?.ok) return { ok: true, versions: res.versions };
        return { ok: false, conflict: true, conflicts: res?.conflicts || mods, row: res?.row };
      }
      // La columna existe pero la función no (migración a medias): seguir sin versionado.
      if (error.code !== "PGRST202") return { ok: false, error };
      versions.current[id] = null;
    }
    const { data: saved, error } = await supabase
      .from("project_data")
      .update({ ...changes, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq("project_id", id)
      .select("project_id")
      .maybeSingle();
    // 0 filas sin error = RLS bloqueó el guardado (parece exitoso pero no persiste)
    if (error || !saved) return { ok: false, error: error || new Error("el guardado no afectó ninguna fila (¿permisos?)") };
    return { ok: true, legacy: true };
  }, [user.id]);

  const scheduleFlushRef = useRef(null);

  const flush = useCallback(async (id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    if (paused.current[id]) return;
    if (inFlight.current[id]) return inFlight.current[id].promise; // al terminar se reprograma solo
    const pending = dirty.current[id];
    const data = dataRef.current[id];
    if (!pending || !pending.size || !data) return;

    const mods = [...pending];
    dirty.current[id] = new Set();
    setSaveStatus("saving");

    const run = (async () => {
      let result;
      try {
        result = await saveModules(id, mods, data);
      } catch (error) {
        result = { ok: false, error };
      }
      delete inFlight.current[id];

      if (result.ok) {
        failures.current[id] = 0;
        setSaveErrorMessage(null);
        if (result.versions) {
          // Solo los módulos que guardamos: los demás pueden tener cambios de otros que aún no trajimos.
          const saved = rowVersions({ module_versions: result.versions });
          versions.current[id] = { ...versions.current[id], ...pickModules(saved, mods) };
        } else if (result.legacy) {
          logHistoryLegacy(id, data);
        }
        setLastSaved(new Date());
      } else {
        mods.forEach((m) => dirtySet(id).add(m));
        if (result.conflict) {
          paused.current[id] = true;
          conflictRef.current = { projectId: id, modules: result.conflicts, serverRow: result.row };
          setConflict(conflictRef.current);
        } else {
          console.error("Error guardando project_data:", result.error?.message || result.error);
          if (result.error?.code === "42501") {
            // Sin permiso (lo decide la base de datos): reintentar no sirve, solo avisar por qué.
            failures.current[id] = FAILURES_BEFORE_ERROR;
            setSaveErrorMessage(result.error.message);
          } else {
            failures.current[id] = (failures.current[id] || 0) + 1;
            scheduleFlushRef.current(id, retryDelayMs(failures.current[id]));
          }
        }
      }
      if (!paused.current[id] && dirty.current[id]?.size && !timers.current[id]) scheduleFlushRef.current(id);
      refreshStatus();
    })();
    inFlight.current[id] = { modules: new Set(mods), promise: run };
    return run;
  }, [saveModules, logHistoryLegacy, refreshStatus]);

  const scheduleFlush = useCallback((id, delay = SAVE_DEBOUNCE_MS) => {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => flush(id), delay);
  }, [flush]);
  scheduleFlushRef.current = scheduleFlush;

  const updateProjectData = useCallback((id, updater) => {
    const current = dataRef.current[id];
    if (!current) return; // nunca crear datos "vacíos" encima de un proyecto que no se pudo cargar
    const next = updater(current);
    const changed = diffModules(current, next);
    if (!changed.length) return;
    epoch.current[id] = (epoch.current[id] || 0) + 1;
    commit(id, next);
    changed.forEach((m) => dirtySet(id).add(m));
    setSaveStatus(paused.current[id] ? "conflict" : "saving");
    scheduleFlush(id);
  }, [commit, scheduleFlush]);

  // Guarda ya todo lo pendiente (cerrar sesión, salir de la pestaña, botón "Guardar").
  const flushAll = useCallback(async () => {
    for (let round = 0; round < 3; round++) {
      const ids = new Set([
        ...Object.keys(dirty.current).filter((id) => dirty.current[id]?.size),
        ...Object.keys(inFlight.current),
      ]);
      if (!ids.size) break;
      await Promise.all([...ids].map((id) => (inFlight.current[id] ? inFlight.current[id].promise : flush(id))));
      if ([...ids].every((id) => paused.current[id] || (failures.current[id] || 0) > 0)) break;
    }
    refreshStatus();
  }, [flush, refreshStatus]);

  const retryNow = useCallback((id) => {
    const ids = id ? [id] : Object.keys(dirty.current);
    ids.forEach((pid) => { failures.current[pid] = 0; });
    return flushAll();
  }, [flushAll]);

  const loadProjectData = useCallback(async (id, { force = false } = {}) => {
    if (loading.current[id]) return;
    if (!force && dataRef.current[id]) return;
    loading.current[id] = true;
    setLoadErrors((prev) => { if (!prev[id]) return prev; const n = { ...prev }; delete n[id]; return n; });
    try {
      const { data, error } = await supabase.from("project_data").select("*").eq("project_id", id).maybeSingle();
      if (error) throw error;
      if (data) {
        applyFullRow(id, data);
      } else {
        // El proyecto todavía no tiene fila de datos: crearla. Aquí sí es seguro arrancar vacío,
        // porque no hay nada que pisar.
        const fresh = emptyProjectData();
        const { data: inserted } = await supabase
          .from("project_data")
          .insert({ project_id: id, ...fresh, updated_by: user.id })
          .select()
          .maybeSingle();
        if (inserted) applyFullRow(id, inserted);
        else { commit(id, fresh); versions.current[id] = null; }
      }
    } catch (e) {
      console.error("Error cargando project_data:", e?.message || e);
      setLoadErrors((prev) => ({ ...prev, [id]: e?.message || "error" }));
    } finally {
      delete loading.current[id];
    }
  }, [applyFullRow, commit, user.id]);

  // Trae del servidor los cambios de otras personas, módulo por módulo, sin pisar lo que se está
  // editando aquí. Sirve también para el proyecto abierto.
  const applyServerRow = useCallback((id, row, epochAtFetch) => {
    const local = dataRef.current[id];
    if (!local || !row) return;
    const known = versions.current[id];
    if (known && rowVersions(row)) {
      const plan = planServerMerge(local, known, row, busyModules(id));
      versions.current[id] = plan.versions;
      if (plan.applied.length) commit(id, plan.data);
      return;
    }
    // Sin versionado: solo si no hubo ninguna edición local desde que se pidió la fila.
    if ((epoch.current[id] || 0) !== epochAtFetch || busyModules(id).size) return;
    commit(id, ensureFullProjectData(row));
  }, [commit]);

  useEffect(() => {
    const channel = supabase
      .channel("crm-project-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "project_data" }, async (payload) => {
        const pid = payload.new?.project_id || payload.old?.project_id;
        if (!pid || !dataRef.current[pid]) return; // si no está cargado, se lee fresco cuando se abra
        const epochAtFetch = epoch.current[pid] || 0;
        const { data } = await supabase.from("project_data").select("*").eq("project_id", pid).maybeSingle();
        applyServerRow(pid, data, epochAtFetch);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [applyServerRow]);

  // Resolver un conflicto: "server" descarta lo mío en esos módulos; "mine" guarda lo mío encima.
  const resolveConflict = useCallback((choice) => {
    const c = conflictRef.current;
    if (!c) return;
    const id = c.projectId;
    const row = c.serverRow;
    const serverV = rowVersions(row) || {};
    const known = { ...(versions.current[id] || {}) };
    if (choice === "server" && row) {
      const normalized = ensureFullProjectData(row);
      const next = { ...dataRef.current[id] };
      c.modules.forEach((m) => {
        next[m] = normalized[m];
        known[m] = serverV[m] || 0;
        dirty.current[id]?.delete(m);
      });
      commit(id, next);
    } else {
      c.modules.forEach((m) => { known[m] = serverV[m] || 0; });
    }
    // Traer también lo que otros cambiaron en módulos que no tengo editados.
    const plan = row ? planServerMerge(dataRef.current[id], known, row, busyModules(id)) : { versions: known, applied: [] };
    versions.current[id] = plan.versions;
    if (plan.applied.length) commit(id, plan.data);
    delete paused.current[id];
    failures.current[id] = 0;
    conflictRef.current = null;
    setConflict(null);
    refreshStatus();
    flush(id);
  }, [commit, flush, refreshStatus]);

  // Para proyectos nuevos / importados: registrar la fila tal como quedó en el servidor.
  const setProjectRow = useCallback((id, row) => applyFullRow(id, row), [applyFullRow]);

  const forgetProject = useCallback((id) => {
    clearTimeout(timers.current[id]);
    [timers, dirty, versions, paused, failures, epoch].forEach((r) => { delete r.current[id]; });
    const next = { ...dataRef.current };
    delete next[id];
    dataRef.current = next;
    setProjectData(next);
    setLoadErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
    refreshStatus();
  }, [refreshStatus]);

  const forgetAll = useCallback(() => {
    Object.values(timers.current).forEach(clearTimeout);
    [timers, dirty, versions, paused, failures, epoch].forEach((r) => { r.current = {}; });
    dataRef.current = {};
    setProjectData({});
    setLoadErrors({});
    conflictRef.current = null;
    setConflict(null);
    refreshStatus();
  }, [refreshStatus]);

  const getProjectData = useCallback(() => dataRef.current, []);

  // Descarta lo que no se pudo guardar y vuelve a leer el proyecto del servidor.
  const discardAndReload = useCallback(async () => {
    const ids = Object.keys(dirty.current).filter((id) => dirty.current[id]?.size && !paused.current[id]);
    ids.forEach((id) => {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
      dirty.current[id] = new Set();
      failures.current[id] = 0;
    });
    setSaveErrorMessage(null);
    await Promise.all(ids.map((id) => loadProjectData(id, { force: true })));
    refreshStatus();
  }, [loadProjectData, refreshStatus]);

  // Salir de la página con cambios sin guardar: avisar, e intentar guardar al ocultar la pestaña
  // (en "beforeunload" ya no da tiempo de terminar una petición normal).
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasUnsaved() && !Object.keys(paused.current).length) return;
      flushAll();
      e.preventDefault();
      e.returnValue = "";
    };
    const onHidden = () => { if (document.visibilityState === "hidden") flushAll(); };
    const onOnline = () => retryNow();
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("online", onOnline);
    };
  }, [hasUnsaved, flushAll, retryNow]);

  return {
    projectData, getProjectData, loadErrors, loadProjectData, updateProjectData,
    saveStatus, saveErrorMessage, lastSaved, versioned, conflict, resolveConflict,
    flushAll, retryNow, hasUnsaved, setProjectRow, forgetProject, forgetAll, discardAndReload,
  };
}
