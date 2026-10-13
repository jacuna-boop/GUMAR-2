import { useState } from "react";
import { FileDown, Loader2, X } from "lucide-react";
import { styles } from "../styles.js";
import { OVERVIEW_LIGHT } from "../theme.js";

// Selector de proyectos para el informe PP-I-01 (control presupuestal y cronograma) — cubre varios
// proyectos en un solo archivo, así que se elige aparte del "Exportar PDF" normal (que es de un
// proyecto o del resumen general).
export function InformePPI01Modal({ projects, onClose, onExportExcel, onExportPDF }) {
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
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: OVERVIEW_LIGHT.textPrimary }}>
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
