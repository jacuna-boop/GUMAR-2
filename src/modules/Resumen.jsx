import { balanceHitosAlertas, balanceTotals, buildCortesObra, cronogramaCurvaSAlerta, daysBetween, energizacionFpoAlerta, energizacionFpoFecha, energizacionFpoFechaSinExtension, energizacionProgress, fmtDate, fmtMoney, nextEnergizacionMilestone, pagosProximosAlertas, pagosTotals, presupuestoTotals, todayISO, uid, upmeNextStep, upmeProgress } from "../lib/data.js";
import { AlertTriangle, Calendar, DollarSign, FileCheck, Landmark, Plus, Trash2, Users, Wallet, Zap } from "lucide-react";
import { useState } from "react";
import { BRAND_DARK, FONT_BRAND_DISPLAY, FONT_MONO, OVERVIEW_LIGHT } from "../theme.js";
import { styles } from "../styles.js";
import { BigPct, MoneyInput } from "../components/common.jsx";

/* ---------------------------------------------------------------------
   Resumen
--------------------------------------------------------------------- */

// Cada alerta trae su módulo de origen ("modulo") además del texto — así el Resumen general puede
// mostrar solo "Presupuesto (1) · Cronograma (12)" sin el detalle, y el Resumen del proyecto puede
// seguir mostrando el texto completo. Cronograma es la excepción: como puede generar una alerta por
// cada actividad atrasada (fácilmente decenas), se condensa a una sola línea con el conteo incluso
// en el Resumen del proyecto — los demás módulos siguen mostrando cada alerta tal cual.
export function buildProjectAlerts(data) {
  const nextMs = nextEnergizacionMilestone(data.energizacion);
  const elapsed = data.energizacion.fechaInicio ? daysBetween(data.energizacion.fechaInicio, todayISO()) : null;
  const presTotals = presupuestoTotals(data.presupuesto);
  const pagTotals = pagosTotals(data.pagos);
  const alerts = [];
  if (nextMs && nextMs.delayed) {
    alerts.push({ modulo: "Energización", texto: `Energización: el hito "${nextMs.title}" está previsto para el día ${nextMs.day} y ya vas en el día ${elapsed}.` });
  }
  const fpoAlerta = energizacionFpoAlerta(data.energizacion);
  if (fpoAlerta) alerts.push({ modulo: "Energización", texto: fpoAlerta.texto });
  if (presTotals.diferencia > 0) {
    alerts.push({ modulo: "Presupuesto", texto: `Presupuesto: la ejecución supera la base en ${fmtMoney(presTotals.diferencia)} (${presTotals.pct}%).` });
  }
  if (pagTotals.totalSaldo > 0) {
    alerts.push({ modulo: "Pagos", texto: `Pagos: hay ${fmtMoney(pagTotals.totalSaldo)} en saldo pendiente por pagar.` });
  }
  pagosProximosAlertas(data.pagos).forEach((a) => alerts.push({ modulo: "Pagos", texto: a.texto }));
  balanceHitosAlertas(data.balance).forEach((a) => alerts.push({ modulo: "Balance financiero", texto: a.texto }));
  const curvaSAlerta = cronogramaCurvaSAlerta(data.cronograma);
  if (curvaSAlerta) alerts.push({ modulo: "Cronograma", texto: curvaSAlerta.texto });
  return alerts;
}

export function Resumen({ data, setTab, onChangeInfo, infoReadOnly = false }) {
  const upmePct = upmeProgress(data.upme);
  const enerPct = energizacionProgress(data.energizacion);
  const nextMs = nextEnergizacionMilestone(data.energizacion);
  const elapsed = data.energizacion.fechaInicio ? daysBetween(data.energizacion.fechaInicio, todayISO()) : null;
  const presTotals = presupuestoTotals(data.presupuesto);
  const desviacionPct = presTotals.base ? Math.round((presTotals.diferencia / presTotals.base) * 100) : 0;
  const pagTotals = pagosTotals(data.pagos);
  const balTotals = balanceTotals(data.balance, data.pagos);
  const nextUpme = upmeNextStep(data.upme);
  const alerts = buildProjectAlerts(data);

  // FPO (con prórroga, ver energizacionFpoFecha): línea de tiempo desde "Día 0" hasta la fecha de
  // FPO — el % de la barra es cuánto de ese período ya transcurrió, no un avance de tareas.
  const fpoFecha = energizacionFpoFecha(data.energizacion);
  const fpoInicio = data.energizacion.fechaInicio;
  const fpoDiasRestantes = fpoFecha ? daysBetween(todayISO(), fpoFecha) : null;
  const fpoTotalDias = fpoFecha && fpoInicio ? daysBetween(fpoInicio, fpoFecha) : null;
  const fpoTranscurridos = fpoInicio ? daysBetween(fpoInicio, todayISO()) : null;
  const fpoPct = fpoTotalDias && fpoTotalDias > 0 ? Math.min(100, Math.max(0, Math.round((fpoTranscurridos / fpoTotalDias) * 100))) : 0;
  const fpoColor = fpoDiasRestantes === null ? BRAND_DARK : fpoDiasRestantes < 0 ? "#E2604F" : fpoDiasRestantes <= 30 ? "#E8A33D" : BRAND_DARK;
  const fpoLabel = fpoDiasRestantes === null ? "—" : fpoDiasRestantes < 0 ? `Vencida hace ${Math.abs(fpoDiasRestantes)}d` : `Faltan ${fpoDiasRestantes}d`;
  // Marca en la barra dónde cae la FPO SIN prórroga (6 meses) — solo existe para proyectos ≤1MW.
  const fpoBaseFecha = energizacionFpoFechaSinExtension(data.energizacion);
  const fpoBaseMarkerPct = fpoBaseFecha && fpoInicio && fpoTotalDias > 0
    ? Math.min(100, Math.max(0, (daysBetween(fpoInicio, fpoBaseFecha) / fpoTotalDias) * 100))
    : null;

  // Piloto de tema claro extendido a Resumen (por proyecto) — mismo patrón que el resto: no se toca
  // `styles.card`/`cardHead`/`cardSub` (compartidos con TODA la app), overrides locales aquí.
  const lightCard = { ...styles.card, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightCardHead = { ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_DISPLAY };
  const lightCardSub = { ...styles.cardSub, color: OVERVIEW_LIGHT.textSecondary };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
    <div style={styles.resumenGrid} className="app-resumen-grid">
      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("balance")}
      >
        <div style={lightCardHead}>
          <Landmark size={16} color={BRAND_DARK} />
          <span>Balance financiero</span>
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 700, color: balTotals.saldo >= 0 ? BRAND_DARK : "#E2604F" }}>
          {fmtMoney(balTotals.saldo)}
        </div>
        <div style={lightCardSub}>
          Ingresos {fmtMoney(balTotals.totalIngresos)} · Pagos {fmtMoney(balTotals.totalPagos)}
        </div>
      </div>

      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("upme")}
      >
        <div style={lightCardHead}>
          <FileCheck size={16} color={BRAND_DARK} />
          <span>Beneficios tributarios UPME</span>
        </div>
        <BigPct pct={upmePct} color={BRAND_DARK} trackColor="#E3E9E6" />
        <div style={lightCardSub}>{nextUpme ? `Siguiente paso: ${nextUpme.num}. ${nextUpme.label}` : "Proceso completado"}</div>
      </div>

      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("energizacion")}
      >
        <div style={lightCardHead}>
          <Zap size={16} color={BRAND_DARK} />
          <span>Energización</span>
        </div>
        <BigPct pct={enerPct} color={BRAND_DARK} trackColor="#E3E9E6" />
        <div style={lightCardSub}>
          {elapsed === null ? "Falta asignar fecha de inicio de trámites" : `Día ${elapsed} de 200`} · {nextMs ? `Siguiente: ${nextMs.title} (día ${nextMs.day})` : "Todas las actividades completadas"}
        </div>
      </div>

      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("energizacion")}
      >
        <div style={lightCardHead}>
          <Calendar size={16} color={fpoColor} />
          <span>FPO (con prórroga)</span>
        </div>
        <BigPct
          pct={fpoPct}
          color={fpoColor}
          label={fpoLabel}
          trackColor="#E3E9E6"
          markerPct={fpoBaseMarkerPct}
          markerTitle={fpoBaseFecha ? `FPO sin prórroga: ${fmtDate(fpoBaseFecha)}` : undefined}
        />
        <div style={lightCardSub}>
          {fpoFecha ? `Fecha: ${fmtDate(fpoFecha)}` : "Falta asignar fecha de inicio de energización"}
          {fpoBaseFecha && <><br />Sin prórroga: {fmtDate(fpoBaseFecha)}</>}
        </div>
      </div>

      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("presupuesto")}
      >
        <div style={lightCardHead}>
          <DollarSign size={16} color={BRAND_DARK} />
          <span>Presupuesto</span>
        </div>
        <BigPct
          pct={Math.min(100, Math.abs(desviacionPct))}
          color={desviacionPct > 0 ? "#E2604F" : BRAND_DARK}
          label={`${desviacionPct > 0 ? "+" : ""}${desviacionPct}%`}
          trackColor="#E3E9E6"
        />
        <div style={lightCardSub}>
          Desviación vs. base: {presTotals.diferencia > 0 ? "+" : ""}{fmtMoney(presTotals.diferencia)}
          <br />
          Base {fmtMoney(presTotals.base)} · Ejecución {fmtMoney(presTotals.ejecutado)}
        </div>
      </div>

      <div
        style={{ ...lightCard, ...styles.cardClickable }}
        role="button"
        onClick={() => setTab?.("pagos")}
      >
        <div style={lightCardHead}>
          <Wallet size={16} color={BRAND_DARK} />
          <span>Pagos</span>
        </div>
        <BigPct pct={pagTotals.totalOrdenes ? Math.round((pagTotals.totalPagado / pagTotals.totalOrdenes) * 100) : 0} color={BRAND_DARK} trackColor="#E3E9E6" />
        <div style={lightCardSub}>
          {fmtMoney(pagTotals.totalPagado)} pagado de {fmtMoney(pagTotals.totalOrdenes)} · saldo {fmtMoney(pagTotals.totalSaldo)}
        </div>
      </div>

      <div style={{ ...lightCard, gridColumn: "1 / -1" }}>
        <div style={lightCardHead}>
          <AlertTriangle size={16} color="#E8A33D" />
          <span>Alertas</span>
        </div>
        {alerts.length === 0 ? (
          <div style={lightCardSub}>Sin alertas por ahora.</div>
        ) : (
          <ul style={styles.alertList}>
            {alerts.map((a, i) => (
              <li key={i} style={{ ...styles.alertItem, color: "#B5790F" }}>{a.texto}</li>
            ))}
          </ul>
        )}
      </div>

      {onChangeInfo && (
        <div className={infoReadOnly ? "readonly-gate" : undefined}>
          <ProyectoInfoSection info={data.info} pagos={data.pagos} onChange={onChangeInfo} />
        </div>
      )}
    </div>
    </div>
  );
}

// Info para el informe semanal PP-I-01: equipo de trabajo, ficha técnica de equipos, y cortes de
// obra (derivados de los proveedores de Pagos, marcando cuáles cuentan como contratista).
export function ProyectoInfoSection({ info, pagos, onChange }) {
  const [newMiembro, setNewMiembro] = useState({ cargo: "", nombre: "" });

  const addMiembro = () => {
    if (!newMiembro.cargo.trim() && !newMiembro.nombre.trim()) return;
    onChange({ ...info, equipo: [...info.equipo, { id: uid(), ...newMiembro }] });
    setNewMiembro({ cargo: "", nombre: "" });
  };
  const updateMiembro = (id, patch) => onChange({ ...info, equipo: info.equipo.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const deleteMiembro = (id) => onChange({ ...info, equipo: info.equipo.filter((m) => m.id !== id) });

  const updateFicha = (grupo, campo, val) => {
    onChange({ ...info, fichaTecnica: { ...info.fichaTecnica, [grupo]: { ...info.fichaTecnica[grupo], [campo]: val } } });
  };

  const proveedores = Array.from(new Set((pagos?.ordenes || []).map((o) => (o.proveedor || "").trim()).filter(Boolean)));
  const contratistasMap = new Map((info.cortesObra.contratistas || []).map((c) => [c.proveedor, c]));
  const toggleContratista = (proveedor, checked) => {
    const existing = contratistasMap.get(proveedor);
    const next = existing
      ? info.cortesObra.contratistas.map((c) => (c.proveedor === proveedor ? { ...c, incluir: checked } : c))
      : [...info.cortesObra.contratistas, { id: uid(), proveedor, incluir: checked, reteobra: 0 }];
    onChange({ ...info, cortesObra: { contratistas: next } });
  };
  const updateReteobra = (proveedor, reteobra) => {
    onChange({ ...info, cortesObra: { contratistas: info.cortesObra.contratistas.map((c) => (c.proveedor === proveedor ? { ...c, reteobra } : c)) } });
  };
  const cortes = buildCortesObra(pagos, info.cortesObra);
  const fichaLabel = { fontSize: 11, fontWeight: 700, color: OVERVIEW_LIGHT.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 };
  const lightCard = { ...styles.card, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightCardHead = { ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_DISPLAY };
  const lightCardSub = { ...styles.cardSub, color: OVERVIEW_LIGHT.textSecondary };
  const lightMiniInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const fichaField = { ...lightMiniInput, marginBottom: 6 };
  const lightRowDeleteBtn = { ...styles.rowDeleteBtn, color: "#8FA39B" };
  const lightAddRowBtn = { ...styles.addRowBtn, background: BRAND_DARK, color: "#FFFFFF" };
  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightExportHint = { ...styles.exportHint, color: OVERVIEW_LIGHT.textSecondary };

  return (
    <>
      <div style={{ ...lightCard, gridColumn: "1 / -1" }}>
        <div style={lightCardHead}><Users size={16} color="#4FA8D8" /><span>Equipo de trabajo</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {info.equipo.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={{ ...lightMiniInput, flex: 1 }} placeholder="Cargo" value={m.cargo} onChange={(e) => updateMiembro(m.id, { cargo: e.target.value })} />
              <input style={{ ...lightMiniInput, flex: 1 }} placeholder="Nombre" value={m.nombre} onChange={(e) => updateMiembro(m.id, { nombre: e.target.value })} />
              <button style={lightRowDeleteBtn} onClick={() => deleteMiembro(m.id)}><Trash2 size={13} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ ...lightMiniInput, flex: 1 }} placeholder="Cargo (ej. Residente de obra)" value={newMiembro.cargo} onChange={(e) => setNewMiembro({ ...newMiembro, cargo: e.target.value })} />
            <input style={{ ...lightMiniInput, flex: 1 }} placeholder="Nombre" value={newMiembro.nombre} onChange={(e) => setNewMiembro({ ...newMiembro, nombre: e.target.value })} />
            <button style={lightAddRowBtn} onClick={addMiembro}><Plus size={14} /></button>
          </div>
        </div>
      </div>

      <div style={{ ...lightCard, gridColumn: "1 / -1" }}>
        <div style={lightCardHead}><FileCheck size={16} color="#7FD08A" /><span>Ficha técnica</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 10 }}>
          <div>
            <div style={fichaLabel}>Paneles solares</div>
            <input style={fichaField} placeholder="Cantidad" value={info.fichaTecnica.paneles.cantidad} onChange={(e) => updateFicha("paneles", "cantidad", e.target.value)} />
            <input style={fichaField} placeholder="Potencia (Wp)" value={info.fichaTecnica.paneles.potenciaWp} onChange={(e) => updateFicha("paneles", "potenciaWp", e.target.value)} />
            <input style={fichaField} placeholder="Marca" value={info.fichaTecnica.paneles.marca} onChange={(e) => updateFicha("paneles", "marca", e.target.value)} />
            <input style={fichaField} placeholder="Referencia" value={info.fichaTecnica.paneles.referencia} onChange={(e) => updateFicha("paneles", "referencia", e.target.value)} />
          </div>
          <div>
            <div style={fichaLabel}>Inversores</div>
            <input style={fichaField} placeholder="Cantidad" value={info.fichaTecnica.inversores.cantidad} onChange={(e) => updateFicha("inversores", "cantidad", e.target.value)} />
            <input style={fichaField} placeholder="Capacidad" value={info.fichaTecnica.inversores.capacidad} onChange={(e) => updateFicha("inversores", "capacidad", e.target.value)} />
            <input style={fichaField} placeholder="Marca" value={info.fichaTecnica.inversores.marca} onChange={(e) => updateFicha("inversores", "marca", e.target.value)} />
            <input style={fichaField} placeholder="Referencia" value={info.fichaTecnica.inversores.referencia} onChange={(e) => updateFicha("inversores", "referencia", e.target.value)} />
          </div>
          <div>
            <div style={fichaLabel}>Transformador</div>
            <input style={fichaField} placeholder="Tipo" value={info.fichaTecnica.transformador.tipo} onChange={(e) => updateFicha("transformador", "tipo", e.target.value)} />
            <input style={fichaField} placeholder="Marca" value={info.fichaTecnica.transformador.marca} onChange={(e) => updateFicha("transformador", "marca", e.target.value)} />
          </div>
          <div>
            <div style={fichaLabel}>Estructura — mesas</div>
            <input style={fichaField} placeholder="Configuración" value={info.fichaTecnica.estructura.configuracion} onChange={(e) => updateFicha("estructura", "configuracion", e.target.value)} />
            <input style={fichaField} placeholder="Cantidad" value={info.fichaTecnica.estructura.cantidad} onChange={(e) => updateFicha("estructura", "cantidad", e.target.value)} />
            <input style={fichaField} placeholder="Proveedor" value={info.fichaTecnica.estructura.proveedor} onChange={(e) => updateFicha("estructura", "proveedor", e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ ...lightCard, gridColumn: "1 / -1" }}>
        <div style={lightCardHead}><Wallet size={16} color="#E77DA8" /><span>Cortes de obra</span></div>
        <p style={lightExportHint}>Marca qué proveedores de Pagos cuentan como contratista de obra, y digita su retención (reteobra).</p>
        {proveedores.length === 0 ? (
          <div style={lightCardSub}>Todavía no hay proveedores registrados en Pagos.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {proveedores.map((prov) => {
              const c = contratistasMap.get(prov);
              return (
                <div key={prov} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!c?.incluir} onChange={(e) => toggleContratista(prov, e.target.checked)} />
                  <span style={{ flex: 1, fontSize: 12.5, color: OVERVIEW_LIGHT.textPrimary }}>{prov}</span>
                  {c?.incluir && (
                    <MoneyInput style={{ ...lightMiniInput, width: 140 }} placeholder="Reteobra" value={c.reteobra} onChange={(val) => updateReteobra(prov, val)} />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {cortes.length > 0 && (
          <div style={lightTableWrap}>
            <table style={styles.overviewTable}>
              <thead>
                <tr>
                  <th style={lightOvTh}>Contratista</th>
                  <th style={lightOvTh}># de corte</th>
                  <th style={lightOvTh}>Vr acumulado</th>
                  <th style={lightOvTh}>Reteobra</th>
                  <th style={lightOvTh}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {cortes.map((c) => (
                  <tr key={c.proveedor}>
                    <td style={lightOvTd}>{c.proveedor}</td>
                    <td style={lightOvTd}>{c.numCortes}</td>
                    <td style={lightOvTd}>{fmtMoney(c.vrAcumulado)}</td>
                    <td style={lightOvTd}>{fmtMoney(c.reteobra)}</td>
                    <td style={{ ...lightOvTd, fontWeight: 700 }}>{fmtMoney(c.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
