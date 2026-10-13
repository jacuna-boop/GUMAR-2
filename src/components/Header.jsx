import { AlertTriangle, Calendar, Clock, DollarSign, FileCheck, FileDown, Landmark, Loader2, MapPin, Save, Wallet, Zap } from "lucide-react";
import { fmtTime } from "../lib/data.js";
import { styles } from "../styles.js";

/* ---------------------------------------------------------------------
   Header + tabs
--------------------------------------------------------------------- */
export function Header({ project, tab, setTab, saveStatus, lastSaved, onSaveNow, onExportPDF, onShowHistory }) {
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

export function SaveIndicator({ status, lastSaved, onSaveNow }) {
  const label =
    status === "saving" ? "Guardando…"
      : status === "error" ? "Sin guardar — reintentar"
      : status === "conflict" ? "Conflicto sin resolver"
      : lastSaved ? `Guardado ${fmtTime(lastSaved)}` : "Guardado";
  const failed = status === "error" || status === "conflict";
  return (
    <button style={{ ...styles.saveBtn, ...(failed ? { borderColor: "#E2604F", background: "#E2604F" } : {}) }} onClick={onSaveNow} title="Forzar guardado ahora">
      {status === "saving" ? (
        <Loader2 size={13} className="spin" />
      ) : failed ? (
        <AlertTriangle size={13} color="#FFFFFF" />
      ) : (
        <Save size={13} color="#5FBF8F" />
      )}
      <span>{label}</span>
    </button>
  );
}

export function TabBtn({ active, onClick, icon, label }) {
  return (
    <button style={{ ...styles.tabBtn, ...(active ? styles.tabBtnActive : {}) }} onClick={onClick}>
      {icon} {label}
    </button>
  );
}
