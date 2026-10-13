import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { styles } from "../styles.js";
import { OVERVIEW_LIGHT } from "../theme.js";
import { CARGO_PERMISOS, CARGO_PERMISO_GROUPS } from "../lib/permisos.js";
import { ConfirmModal } from "./dialogs.jsx";

// Modal de admin: marca qué personas pueden ver/editar este proyecto. Los admins siempre tienen
// acceso a todo (no aparecen como editables aquí, se muestran ya marcados y bloqueados).
export function ProjectMembersModal({ project, onClose }) {
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
          <div style={{ padding: "16px 0", color: OVERVIEW_LIGHT.textSecondary, fontSize: 13 }}>Cargando…</div>
        ) : profiles.length === 0 ? (
          <div style={{ padding: "16px 0", color: OVERVIEW_LIGHT.textSecondary, fontSize: 13 }}>No hay usuarios registrados todavía.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto", marginTop: 8 }}>
            {profiles.map((p) => {
              const isProfAdmin = p.role === "admin";
              return (
                <label
                  key={p.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderRadius: 8, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, opacity: busyId === p.id ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isProfAdmin || memberIds.has(p.id)}
                    disabled={isProfAdmin || busyId === p.id}
                    onChange={(e) => toggle(p.id, e.target.checked)}
                  />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 13, color: OVERVIEW_LIGHT.textPrimary }}>{p.full_name || p.email}</span>
                    <span style={{ fontSize: 11, color: OVERVIEW_LIGHT.textSecondary }}>
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

// Admin (solo lectura aquí, arriba de todo). Crea/edita cargos con sus casillas de permisos, y
// asigna el cargo de cada persona registrada. Arranca en blanco a propósito — nadie (salvo admin)
// tiene ningún permiso hasta que se cree un cargo y se le asigne. El admin también puede elegirse
// un cargo — no le cambia ningún permiso (admin siempre puede todo), es solo la etiqueta que se usa
// en "Cargo del responsable" al exportar el informe PP-I-01.
export function CargosModal({ myUserId, onClose }) {
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
    const { data: updated, error: err } = await supabase.from("cargos").update({ [key]: value }).eq("id", cargo.id).select("id");
    if (err) { setError("No se pudo guardar el cambio. Intenta de nuevo."); await load(); }
    else if (!updated?.length) { setError("No puedes cambiar las casillas de tu propio cargo (solo un admin puede)."); await load(); }
    setBusy(false);
  };

  const deleteCargo = async (id) => {
    setBusy(true);
    const { data: deleted, error: err } = await supabase.from("cargos").delete().eq("id", id).select("id");
    if (err || !deleted?.length) setError("No se pudo eliminar el cargo (no puedes eliminar el tuyo propio).");
    await load();
    setBusy(false);
  };

  const assignCargo = async (profileId, cargoId) => {
    setBusy(true);
    setError("");
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, cargo_id: cargoId || null } : p)));
    const { error: err } = await supabase.from("profiles").update({ cargo_id: cargoId || null }).eq("id", profileId);
    if (err) { setError(profileId === myUserId ? "No puedes cambiar tu propio cargo (solo un admin puede)." : "No se pudo asignar el cargo. Intenta de nuevo."); await load(); }
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
            <div style={{ padding: "16px 0", color: OVERVIEW_LIGHT.textSecondary, fontSize: 13 }}>Cargando…</div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: OVERVIEW_LIGHT.textPrimary, margin: "8px 0" }}>Usuarios</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", marginBottom: 20 }}>
                {profiles.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <span style={{ fontSize: 12.5, color: OVERVIEW_LIGHT.textPrimary }}>{p.full_name || p.email}</span>
                      <span style={{ fontSize: 11, color: OVERVIEW_LIGHT.textSecondary }}>{p.email}{p.role === "admin" ? " · admin (acceso a todo)" : ""}</span>
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

              <div style={{ fontSize: 13, fontWeight: 700, color: OVERVIEW_LIGHT.textPrimary, margin: "8px 0" }}>Cargos</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", marginBottom: 10 }}>
                {cargos.length === 0 && (
                  <div style={{ fontSize: 12, color: OVERVIEW_LIGHT.textSecondary }}>Todavía no hay cargos creados — crea el primero abajo.</div>
                )}
                {cargos.map((c) => {
                  const isOpen = expandedCargoId === c.id;
                  return (
                    <div key={c.id} style={{ background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 8, overflow: "hidden" }}>
                      <div
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px 10px 6px", cursor: "pointer" }}
                        onClick={() => setExpandedCargoId(isOpen ? null : c.id)}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {isOpen ? <ChevronDown size={15} color={OVERVIEW_LIGHT.textSecondary} /> : <ChevronRight size={15} color={OVERVIEW_LIGHT.textSecondary} />}
                          <strong style={{ fontSize: 13, color: OVERVIEW_LIGHT.textPrimary }}>{c.nombre}</strong>
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
                            <div key={group.title} style={{ borderTop: gi > 0 ? `1px solid ${OVERVIEW_LIGHT.border}` : "none", paddingTop: gi > 0 ? 10 : 0, marginTop: gi > 0 ? 10 : 0 }}>
                              <div style={{ fontSize: 10, color: OVERVIEW_LIGHT.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{group.title}</div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px 16px" }}>
                                {group.keys.map((key) => {
                                  const perm = CARGO_PERMISOS.find((p) => p.key === key);
                                  return (
                                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary }}>
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
export function EditNameModal({ userId, currentName, onClose, onSaved }) {
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
