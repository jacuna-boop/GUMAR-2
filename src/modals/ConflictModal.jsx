import { useEffect, useState } from "react";
import { MODULE_LABELS } from "../lib/sync.js";
import { supabase } from "../lib/supabaseClient";
import { fmtDateTime, todayISO } from "../lib/data.js";
import { styles } from "../styles.js";

// Alguien más guardó el mismo módulo mientras esta persona lo editaba (ver useProjectSync). No se
// guarda nada hasta que se elija qué versión queda; se puede descargar la propia antes de decidir.
export function ConflictModal({ conflict, projectName, localData, onResolve }) {
  const [who, setWho] = useState("");
  const row = conflict.serverRow;
  const labels = conflict.modules.map((m) => MODULE_LABELS[m] || m).join(", ");

  useEffect(() => {
    if (!row?.updated_by) return;
    let cancelled = false;
    supabase.from("profiles").select("full_name, email").eq("id", row.updated_by).maybeSingle().then(({ data }) => {
      if (!cancelled && data) setWho(data.full_name || data.email || "");
    });
    return () => { cancelled = true; };
  }, [row?.updated_by]);

  const downloadMine = () => {
    const mine = {};
    conflict.modules.forEach((m) => { mine[m] = localData?.[m]; });
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), project: projectName, modules: mine }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mis-cambios-${projectName.replace(/[^a-z0-9]+/gi, "-")}-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Otra persona editó lo mismo</h3>
        </div>
        <p style={styles.confirmMsg}>
          {who || "Alguien"} guardó cambios en <b>{labels}</b> de "{projectName}"
          {row?.updated_at ? ` (${fmtDateTime(new Date(row.updated_at))})` : ""} mientras tú lo editabas.
          Para no borrar el trabajo de nadie, tus cambios en {conflict.modules.length > 1 ? "esos módulos" : "ese módulo"} no se han guardado todavía.
        </p>
        <p style={styles.confirmMsg}>
          Si no estás seguro, descarga primero tus cambios como respaldo.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button style={styles.exportOptionBtn} onClick={downloadMine}>Descargar mis cambios (JSON)</button>
          <button style={styles.exportOptionBtn} onClick={() => onResolve("server")} disabled={!row}>
            Ver la versión de la otra persona (descarta mis cambios en {labels})
          </button>
          <button style={{ ...styles.exportOptionBtn, color: "#C0392B" }} onClick={() => onResolve("mine")}>
            Guardar mi versión encima (reemplaza lo que guardó la otra persona)
          </button>
        </div>
      </div>
    </div>
  );
}
