import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { X } from "lucide-react";
import { fmtDateTime } from "../lib/data.js";
import { MODULE_LABELS } from "../lib/sync.js";
import { styles } from "../styles.js";
import { OVERVIEW_LIGHT } from "../theme.js";

// Lista quién guardó cambios en el proyecto y cuándo (tabla project_history). Es de solo lectura —
// no restaura nada directamente, para evitar que un clic accidental pise trabajo reciente; si hace
// falta volver a un estado anterior, se descarga esa foto en JSON y se usa "Importar" a mano.
export function HistoryModal({ project, onClose }) {
  const [rows, setRows] = useState(null); // null = cargando
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("project_history")
        .select("*") // "*" para no fallar si changed_modules aún no existe (falta proteger_datos.sql)
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
          <div style={{ color: OVERVIEW_LIGHT.textSecondary, fontSize: 13 }}>Cargando…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: OVERVIEW_LIGHT.textSecondary, fontSize: 13 }}>Todavía no hay historial registrado para este proyecto.</div>
        ) : (
          <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r) => (
              <button
                key={r.id}
                style={{ ...styles.exportOptionBtn, display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left" }}
                onClick={() => downloadSnapshot(r)}
                title="Descargar esta versión como JSON"
              >
                <span>
                  {fmtDateTime(new Date(r.created_at))}
                  {r.changed_modules?.length ? (
                    <span style={{ display: "block", color: OVERVIEW_LIGHT.textSecondary, fontSize: 11 }}>
                      {r.changed_modules.map((m) => MODULE_LABELS[m] || m).join(", ")}
                    </span>
                  ) : null}
                </span>
                <span style={{ color: OVERVIEW_LIGHT.textSecondary, fontSize: 11.5 }}>{r.updated_by_email || "—"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
