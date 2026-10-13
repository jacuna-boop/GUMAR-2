import React, { useState } from "react";
import gumarLogo from "../assets/gumar-logo.jpg";
import { ChevronDown, ChevronRight, LayoutGrid, Pencil, Plus, Settings, Trash2, Users } from "lucide-react";
import { energizacionProgress, nextEnergizacionMilestone, pagosTotals, presupuestoTotals, upmeProgress } from "../lib/data.js";
import { styles } from "../styles.js";
import { MiniBar } from "./common.jsx";

// Los datos de cada proyecto se reemplazan (no se mutan) al editar, así que se puede cachear el
// resumen por objeto: al escribir en un proyecto solo se recalcula ese, no todos los de la lista.
const summaryCache = new WeakMap();
const EMPTY_SUMMARY = { upmePct: 0, enerPct: 0, enerDelayed: false, presPct: 0, pagPct: 0 };
function projectSummary(d) {
  if (!d) return EMPTY_SUMMARY;
  let s = summaryCache.get(d);
  if (!s) {
    const enerNextMs = nextEnergizacionMilestone(d.energizacion);
    const pagTotals = pagosTotals(d.pagos);
    s = {
      upmePct: upmeProgress(d.upme),
      enerPct: energizacionProgress(d.energizacion),
      enerDelayed: !!(enerNextMs && enerNextMs.delayed),
      presPct: presupuestoTotals(d.presupuesto).pct,
      pagPct: pagTotals.totalOrdenes ? Math.round((pagTotals.totalPagado / pagTotals.totalOrdenes) * 100) : 0,
    };
    summaryCache.set(d, s);
  }
  return s;
}

export function Sidebar({ projects, selectedId, view, onOverview, onSelect, onAdd, onDelete, onEditProject, onManageMembers, onManageCargos, projectData, onExport, onImportFile, onImportText, userEmail, onSignOut, myFullName, onEditName, isAdmin, isLector, canDeleteProjects, canManageUsers }) {
  const fileInputRef = React.useRef(null);
  const [footerOpen, setFooterOpen] = useState(false);

  return (
    <aside className="app-sidebar" style={styles.sidebar}>
      <button
        style={styles.brand}
        onClick={onOverview}
        title="Ir a Resumen general"
      >
        <img src={gumarLogo} alt="Gumar Proyectos" style={styles.brandLogo} />
        <div style={styles.brandWordmark}>
          <div style={styles.brandWordmarkLine}>GUMAR</div>
          <div style={styles.brandWordmarkLine}>PROYECTOS</div>
        </div>
      </button>

      <button
        className="sb-nav-btn"
        style={{ ...styles.overviewNavBtn, ...(view === "overview" ? styles.overviewNavBtnActive : {}) }}
        onClick={onOverview}
      >
        <LayoutGrid size={15} /> Resumen general
      </button>

      {canManageUsers && (
        <button className="sb-nav-btn" style={styles.overviewNavBtn} onClick={onManageCargos}>
          <Users size={15} /> Cargos y usuarios
        </button>
      )}

      {!isLector && (
        <button style={styles.addProjectBtn} onClick={onAdd}>
          <Plus size={15} /> Nuevo proyecto
        </button>
      )}

      <div style={styles.projectList}>
        {projects.length === 0 && (
          <div style={styles.noProjects}>Aún no hay proyectos registrados.</div>
        )}
        {projects.map((p) => {
          const { upmePct, enerPct, enerDelayed, presPct, pagPct } = projectSummary(projectData[p.id]);
          return (
            <div
              key={p.id}
              style={{
                ...styles.projectItem,
                ...(view === "project" && p.id === selectedId ? styles.projectItemActive : {}),
              }}
              onClick={() => onSelect(p.id)}
            >
              <div style={styles.projectItemTop}>
                <span style={styles.projectName}>{p.name}</span>
                <div style={{ display: "flex", gap: 2 }}>
                  {!isLector && (
                    <button
                      style={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditProject(p);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {canManageUsers && (
                    <button
                      style={styles.deleteBtn}
                      title="Gestionar acceso"
                      onClick={(e) => {
                        e.stopPropagation();
                        onManageMembers(p);
                      }}
                    >
                      <Users size={13} />
                    </button>
                  )}
                  {canDeleteProjects && (
                    <button
                      style={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(p);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div style={styles.projectMeta}>
                {p.capacity ? `${p.capacity} MWp` : ""}{p.location ? ` · ${p.location}` : ""}
              </div>
              <MiniBar label="UPME" pct={upmePct} color={upmePct >= 100 ? "#5FBF8F" : "#4FA8D8"} />
              <MiniBar label="Energización" pct={enerPct} color={enerPct >= 100 ? "#5FBF8F" : enerDelayed ? "#E2604F" : "#4FA8D8"} />
              <MiniBar label="Presupuesto" pct={Math.min(100, presPct)} displayLabel={`${presPct}%`} color={presPct > 100 ? "#E2604F" : "#7FD08A"} />
              <MiniBar label="Pagos" pct={Math.min(100, pagPct)} displayLabel={`${pagPct}%`} color={pagPct > 100 ? "#E2604F" : pagPct >= 100 ? "#5FBF8F" : "#4FA8D8"} />
            </div>
          );
        })}
      </div>

      <div style={styles.sidebarFooter}>
        <div style={styles.sharedNote}>
          Conectado como <strong>{myFullName || userEmail}</strong> — solo ves los proyectos a los que te dieron acceso.
        </div>
        {footerOpen && (
          <>
            <button style={styles.footerBtnFull} onClick={onEditName}>
              {myFullName ? "Editar mi nombre" : "Agregar mi nombre"}
            </button>
            <div style={styles.footerBtnRow}>
              <button style={styles.footerBtn} onClick={onExport}>
                Exportar datos
              </button>
              {!isLector && (
                <button style={styles.footerBtn} onClick={() => fileInputRef.current?.click()}>
                  Importar archivo
                </button>
              )}
            </div>
            {!isLector && (
              <button style={styles.footerBtnFull} onClick={onImportText}>
                Importar pegando texto
              </button>
            )}
            <button style={styles.footerBtnFull} onClick={onSignOut}>
              Cerrar sesión
            </button>
          </>
        )}
        <button
          className="sb-nav-btn"
          style={{ ...styles.footerToggleBtn, ...(footerOpen ? styles.footerToggleBtnActive : {}) }}
          onClick={() => setFooterOpen((v) => !v)}
        >
          <Settings size={14} />
          <span style={{ flex: 1, textAlign: "left" }}>Más opciones</span>
          {footerOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </aside>
  );
}
