import { X } from "lucide-react";
import { useState } from "react";
import { TAB_LABELS } from "../lib/permisos.js";
import { styles } from "../styles.js";

export function ExportPdfModal({ tab, onClose, onChoose }) {
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

export function ConfirmModal({ title, message, confirmLabel, onCancel, onConfirm }) {
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

export function ImportTextModal({ onClose, onImport }) {
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
