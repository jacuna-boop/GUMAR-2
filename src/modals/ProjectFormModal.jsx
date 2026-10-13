import { COLOMBIA_LOCATIONS } from "../lib/colombiaLocations";
import { useState } from "react";
import { X } from "lucide-react";
import { styles } from "../styles.js";
import { OVERVIEW_LIGHT } from "../theme.js";

/* ---------------------------------------------------------------------
   Add project modal
--------------------------------------------------------------------- */
export const COLOMBIA_DEPARTAMENTOS = Object.keys(COLOMBIA_LOCATIONS).sort((a, b) => a.localeCompare(b, "es"));

// Intenta reconocer "Municipio, Departamento" en el texto de ubicación guardado (para proyectos
// editados que ya traían ese formato); si no matchea ningún departamento conocido, arranca vacío.
export function parseUbicacion(location) {
  const [muniRaw, depRaw] = String(location || "").split(",").map((s) => s.trim());
  if (depRaw && COLOMBIA_LOCATIONS[depRaw]?.includes(muniRaw)) {
    return { departamento: depRaw, municipio: muniRaw };
  }
  return { departamento: "", municipio: "" };
}

export const CLONE_MODULE_OPTIONS = [
  { key: "presupuesto", label: "Presupuesto" },
  { key: "cronograma", label: "Cronograma" },
  { key: "upme", label: "UPME" },
  { key: "energizacion", label: "Energización" },
  { key: "pagos", label: "Pagos" },
  { key: "balance", label: "Balance financiero" },
];

export function ProjectFormModal({ onClose, onSave, initial, title, submitLabel, existingProjects }) {
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
            <div style={{ fontSize: 12, color: OVERVIEW_LIGHT.textSecondary, marginBottom: 6 }}>¿Qué quieres copiar de ese proyecto?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {CLONE_MODULE_OPTIONS.map((m) => (
                <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: OVERVIEW_LIGHT.textPrimary }}>
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
