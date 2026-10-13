import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Download, RotateCcw, X } from "lucide-react";
import { fmtDateTime } from "../lib/data.js";
import { MODULE_LABELS, PROJECT_MODULES } from "../lib/sync.js";
import { styles } from "../styles.js";
import { BRAND_DARK, OVERVIEW_LIGHT } from "../theme.js";

const KIND_LABELS = {
  antes_de_restaurar: "Antes de restaurar",
  restauracion: "Restauración",
};

// Lista quién guardó cambios en el proyecto y cuándo (tabla project_history). Cada versión se puede
// descargar como JSON o restaurar: se eligen los módulos a devolver (nunca se restaura todo de un
// clic, para no deshacer sin querer el trabajo reciente de otros en otras pestañas). Antes de
// restaurar, el servidor guarda una foto del estado actual, así que la restauración se puede deshacer.
export function HistoryModal({ project, onClose, canRestoreModule = () => false, onRestore }) {
  const [rows, setRows] = useState(null); // null = cargando
  const [error, setError] = useState(false);
  const [restoring, setRestoring] = useState(null); // fila elegida para restaurar | null
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("project_history")
        .select("*") // "*" para no fallar si alguna columna nueva aún no existe en Supabase
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(50);
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

  const startRestore = (row) => {
    setRestoring(row);
    setSelected([]);
    setRestoreError("");
  };

  const toggle = (m) => setSelected((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const confirmRestore = async () => {
    setBusy(true);
    setRestoreError("");
    const err = await onRestore(restoring.id, selected);
    setBusy(false);
    if (err) setRestoreError(err);
    else onClose();
  };

  if (restoring) {
    const available = PROJECT_MODULES.filter((m) => restoring.data && typeof restoring.data[m] === "object" && restoring.data[m] !== null);
    const labels = selected.map((m) => MODULE_LABELS[m]).join(", ");
    return (
      <div style={styles.modalOverlay} onClick={busy ? undefined : onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.modalHead}>
            <h3 style={styles.h3}>Restaurar versión</h3>
            <button style={styles.iconBtn} onClick={onClose} disabled={busy}><X size={16} /></button>
          </div>
          <p style={styles.confirmMsg}>
            Elige qué módulos de "{project.name}" quieres devolver a como estaban el{" "}
            <strong>{fmtDateTime(new Date(restoring.created_at))}</strong>
            {restoring.updated_by_email ? ` (guardado por ${restoring.updated_by_email})` : ""}.
            Los módulos que no marques se quedan como están ahora.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {available.map((m) => {
              const allowed = canRestoreModule(m);
              return (
                <label
                  key={m}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: allowed ? OVERVIEW_LIGHT.textPrimary : OVERVIEW_LIGHT.textSecondary, cursor: allowed ? "pointer" : "not-allowed" }}
                >
                  <input type="checkbox" checked={selected.includes(m)} disabled={!allowed || busy} onChange={() => toggle(m)} />
                  {MODULE_LABELS[m]}
                  {!allowed && <span style={{ fontSize: 11 }}>— tu cargo no permite editarlo</span>}
                </label>
              );
            })}
          </div>
          <p style={{ ...styles.confirmMsg, fontSize: 12, color: OVERVIEW_LIGHT.textSecondary }}>
            Antes de restaurar se guarda en el historial una copia de cómo está todo ahora ("Antes de restaurar"),
            así que se puede deshacer restaurando esa copia.
          </p>
          {restoreError && <div style={{ ...styles.importError, marginBottom: 10 }}>{restoreError}</div>}
          <div style={styles.confirmBtnRow}>
            <button style={styles.confirmCancelBtn} onClick={() => setRestoring(null)} disabled={busy}>Volver</button>
            <button
              style={{ ...styles.confirmDangerBtn, opacity: selected.length && !busy ? 1 : 0.5 }}
              disabled={!selected.length || busy}
              onClick={confirmRestore}
            >
              {busy ? "Restaurando…" : selected.length ? `Restaurar ${labels}` : "Restaurar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Historial de cambios</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.confirmMsg}>
          Últimos guardados de "{project.name}". Puedes descargar cada versión o restaurar módulos a como estaban en ese momento.
        </p>
        {error ? (
          <div style={{ color: "#E2604F", fontSize: 13 }}>No se pudo cargar el historial. ¿Ya corriste la migración de "project_history" en Supabase?</div>
        ) : rows === null ? (
          <div style={{ color: OVERVIEW_LIGHT.textSecondary, fontSize: 13 }}>Cargando…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: OVERVIEW_LIGHT.textSecondary, fontSize: 13 }}>Todavía no hay historial registrado para este proyecto.</div>
        ) : (
          <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{ ...styles.exportOptionBtn, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "default" }}
              >
                <span style={{ minWidth: 0 }}>
                  {fmtDateTime(new Date(r.created_at))}
                  {KIND_LABELS[r.kind] && (
                    <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: BRAND_DARK, border: `1px solid ${BRAND_DARK}`, borderRadius: 4, padding: "0 4px" }}>
                      {KIND_LABELS[r.kind]}
                    </span>
                  )}
                  {r.changed_modules?.length ? (
                    <span style={{ display: "block", color: OVERVIEW_LIGHT.textSecondary, fontSize: 11 }}>
                      {r.changed_modules.map((m) => MODULE_LABELS[m] || m).join(", ")}
                    </span>
                  ) : null}
                  <span style={{ display: "block", color: OVERVIEW_LIGHT.textSecondary, fontSize: 11 }}>{r.updated_by_email || "—"}</span>
                </span>
                <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button className="ro-ok" style={styles.iconBtn} onClick={() => downloadSnapshot(r)} title="Descargar esta versión como JSON">
                    <Download size={15} />
                  </button>
                  {onRestore && PROJECT_MODULES.some((m) => canRestoreModule(m)) && (
                    <button style={styles.iconBtn} onClick={() => startRestore(r)} title="Restaurar módulos a esta versión">
                      <RotateCcw size={15} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
