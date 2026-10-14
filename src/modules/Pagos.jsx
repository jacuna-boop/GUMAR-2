import { fmtDate, fmtMoney, groupPresupuestoItems, ordenPagado, ordenPresupuestoAsignado, valorSugeridoAmarre, actualizarValorOrden, ordenProgramado, ordenSaldo, pagosProximosAlertas, pagosTotals, todayISO, uid } from "../lib/data.js";
import React, { useRef, useState } from "react";
import { AlertTriangle, FileDown, FileUp, Plus, Search, Trash2, X } from "lucide-react";
import { styles } from "../styles.js";
import { BRAND_DARK, FONT_BRAND_BODY, FONT_BRAND_DISPLAY, OVERVIEW_LIGHT } from "../theme.js";
import { downloadPagosTemplate, mergeImportedOrdenes, parsePagosWorkbook } from "../lib/excelTemplates.js";
import { MoneyInput, OvBar, PresupuestoItemSelect } from "../components/common.jsx";
import { ConfirmModal } from "../modals/dialogs.jsx";

export function PagosModule({ data, onChange, projectName, presupuestoBase = [], canAprobarPagos = false, approverName = "", onExportProgramados }) {
  const presupuestoGrupos = groupPresupuestoItems(presupuestoBase);
  const presupuestoLabel = (id) => {
    const it = presupuestoBase.find((b) => b.id === id);
    return it ? `${it.item ? `${it.item} · ` : ""}${it.descripcion}` : "";
  };
  const [newOrden, setNewOrden] = useState({ numero: "", proveedor: "", descripcion: "", valorTotal: "", presupuestoItemId: "" });
  const [openId, setOpenId] = useState(null);
  const [newPago, setNewPago] = useState({ fecha: todayISO(), valor: "", concepto: "", estado: "pagado" });
  const [newLink, setNewLink] = useState({ itemId: "", valor: "" });
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind: "orden" | "pago", ordenId, pagoId, label } | null
  const [showTemplateUpload, setShowTemplateUpload] = useState(false);
  const [showRangeExport, setShowRangeExport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const totals = pagosTotals(data);
  const alertas = pagosProximosAlertas(data);

  // Busca por número de orden, proveedor o concepto/descripción — sin distinguir mayúsculas/acentos.
  const normalize = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const searchTerm = normalize(searchQuery.trim());
  const ordenesFiltradas = searchTerm
    ? data.ordenes.filter((o) =>
        normalize(o.numero).includes(searchTerm) ||
        normalize(o.proveedor).includes(searchTerm) ||
        normalize(o.descripcion).includes(searchTerm)
      )
    : data.ordenes;

  const addOrden = () => {
    if (!newOrden.numero.trim() || !newOrden.valorTotal) return;
    const valorTotal = Number(newOrden.valorTotal) || 0;
    const orden = {
      id: uid(),
      numero: newOrden.numero.trim(),
      proveedor: newOrden.proveedor.trim(),
      descripcion: newOrden.descripcion.trim(),
      valorTotal,
      presupuestoItems: newOrden.presupuestoItemId ? [{ id: uid(), itemId: newOrden.presupuestoItemId, valor: valorTotal }] : [],
      pagos: [],
    };
    onChange({ ...data, ordenes: [...data.ordenes, orden] });
    setNewOrden({ numero: "", proveedor: "", descripcion: "", valorTotal: "", presupuestoItemId: "" });
    setOpenId(orden.id);
  };
  const updateOrden = (id, patch) => {
    onChange({ ...data, ordenes: data.ordenes.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  };
  const deleteOrden = (id) => onChange({ ...data, ordenes: data.ordenes.filter((o) => o.id !== id) });
  // Los pagos aprobados solo los puede borrar o cambiar de valor quien puede aprobar (la base de
  // datos también lo impone — ver supabase/seguridad_permisos.sql).
  const BLOQUEO_APROBADO = "Este pago ya está aprobado. Solo quien tiene permiso de aprobar pagos puede borrarlo o cambiar su valor.";
  const askDeleteOrden = (o) => {
    if (!canAprobarPagos && o.pagos.some((p) => p.aprobado)) { window.alert("Esta orden tiene pagos aprobados. Solo quien tiene permiso de aprobar pagos puede borrarla."); return; }
    setConfirmDelete({ kind: "orden", ordenId: o.id, label: o.numero || "esta orden" });
  };

  // Una orden se puede repartir entre varios ítems del presupuesto: cada link guarda cuánto de esa
  // orden le corresponde a ese ítem (ver costoRealPorItemMap en data.js, que suma esto por ítem).
  const addPresupuestoLink = (ordenId) => {
    if (!newLink.itemId) return;
    // Sin valor escrito: se asigna lo que falta de la orden (antes quedaba en $0 y no sumaba en Costo real).
    const orden = data.ordenes.find((o) => o.id === ordenId);
    const link = { id: uid(), itemId: newLink.itemId, valor: Number(newLink.valor) || valorSugeridoAmarre(orden) };
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) => (o.id === ordenId ? { ...o, presupuestoItems: [...(o.presupuestoItems || []), link] } : o)),
    });
    setNewLink({ itemId: "", valor: "" });
  };
  const updatePresupuestoLink = (ordenId, linkId, patch) => {
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) =>
        o.id === ordenId ? { ...o, presupuestoItems: (o.presupuestoItems || []).map((l) => (l.id === linkId ? { ...l, ...patch } : l)) } : o
      ),
    });
  };
  const deletePresupuestoLink = (ordenId, linkId) => {
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) =>
        o.id === ordenId ? { ...o, presupuestoItems: (o.presupuestoItems || []).filter((l) => l.id !== linkId) } : o
      ),
    });
  };

  const addPago = (ordenId) => {
    if (!newPago.fecha || !newPago.valor) return;
    const pago = { id: uid(), fecha: newPago.fecha, valor: Number(newPago.valor) || 0, concepto: newPago.concepto.trim(), estado: newPago.estado };
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) => (o.id === ordenId ? { ...o, pagos: [...o.pagos, pago] } : o)),
    });
    setNewPago({ fecha: todayISO(), valor: "", concepto: "", estado: "pagado" });
  };
  const deletePago = (ordenId, pagoId) => {
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) => (o.id === ordenId ? { ...o, pagos: o.pagos.filter((p) => p.id !== pagoId) } : o)),
    });
  };
  const askDeletePago = (ordenId, p) => {
    if (!canAprobarPagos && p.aprobado) { window.alert(BLOQUEO_APROBADO); return; }
    setConfirmDelete({ kind: "pago", ordenId, pagoId: p.id, label: p.concepto ? `${fmtMoney(p.valor)} (${p.concepto})` : fmtMoney(p.valor) });
  };

  const runConfirmedDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "orden") deleteOrden(confirmDelete.ordenId);
    else if (confirmDelete.kind === "pago") deletePago(confirmDelete.ordenId, confirmDelete.pagoId);
    setConfirmDelete(null);
  };
  const updatePago = (ordenId, pagoId, patch) => {
    onChange({
      ...data,
      ordenes: data.ordenes.map((o) =>
        o.id === ordenId ? { ...o, pagos: o.pagos.map((p) => {
          if (p.id !== pagoId) return p;
          // Cambiar el valor de un pago aprobado le quita la aprobación: hay que volver a aprobarlo.
          if (p.aprobado && "valor" in patch && patch.valor !== p.valor) {
            return { ...p, ...patch, aprobado: false, aprobadoPor: null, aprobadoEn: null };
          }
          return { ...p, ...patch };
        }) } : o
      ),
    });
  };

  // Piloto de tema claro extendido a Pagos — mismo patrón que el resto de pestañas.
  const lightPasteBtn = { ...styles.pasteBtn, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY };
  const lightStat = { ...styles.overviewStat, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightStatLabel = { ...styles.overviewStatLabel, color: OVERVIEW_LIGHT.textSecondary };
  const lightAlertBox = { ...styles.pagosAlertBox, background: OVERVIEW_LIGHT.card, border: "1px solid #E8A33D88" };
  const lightCardHead = { ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_DISPLAY };
  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTdName = { ...styles.ovTdName, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightMiniInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightRowDeleteBtn = { ...styles.rowDeleteBtn, color: "#8FA39B" };
  const lightAddRowBtn = { ...styles.addRowBtn, background: BRAND_DARK, color: "#FFFFFF" };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button className="ro-ok" style={lightPasteBtn} onClick={() => downloadPagosTemplate(data, projectName)}>
          <FileDown size={14} /> Descargar plantilla Excel
        </button>
        <button style={lightPasteBtn} onClick={() => setShowTemplateUpload(true)}>
          <FileUp size={14} /> Cargar plantilla Excel
        </button>
        <button className="ro-ok" style={lightPasteBtn} onClick={() => setShowRangeExport(true)}>
          <FileDown size={14} /> Exportar programados por fecha
        </button>
      </div>

      {showTemplateUpload && (
        <PagosTemplateModal existingOrdenes={data.ordenes} canAprobarPagos={canAprobarPagos} onClose={() => setShowTemplateUpload(false)} onImport={(ordenes) => { onChange({ ...data, ordenes }); setShowTemplateUpload(false); }} />
      )}

      {showRangeExport && (
        <div className="ro-scope">
          <PagosRangeExportModal
            onClose={() => setShowRangeExport(false)}
            onExport={(range) => { onExportProgramados?.(range); setShowRangeExport(false); }}
          />
        </div>
      )}

      <div style={styles.overviewStatRow} className="app-stat-row">
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: OVERVIEW_LIGHT.textPrimary }}>{fmtMoney(totals.totalOrdenes)}</div>
          <div style={lightStatLabel}>Total en órdenes de servicio</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: BRAND_DARK }}>{fmtMoney(totals.totalPagado)}</div>
          <div style={lightStatLabel}>Total pagado</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: "#B5790F" }}>{fmtMoney(totals.totalProgramado)}</div>
          <div style={lightStatLabel}>Total programado (pendiente)</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: totals.totalSaldo < 0 ? "#E2604F" : totals.totalSaldo > 0 ? "#B5790F" : BRAND_DARK }}>{fmtMoney(totals.totalSaldo)}</div>
          <div style={lightStatLabel}>Saldo pendiente</div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div style={lightAlertBox}>
          <div style={lightCardHead}><AlertTriangle size={16} color="#E8A33D" /><span>Pagos programados</span></div>
          <ul style={styles.alertList}>
            {alertas.map((a, i) => (
              <li key={i} style={{ ...styles.alertItem, color: a.tipo === "vencido" ? "#E2604F" : "#B5790F" }}>{a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 10, maxWidth: 360 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: OVERVIEW_LIGHT.textSecondary, pointerEvents: "none" }} />
        <input
          style={{ ...lightMiniInput, paddingLeft: 30 }}
          className="ro-ok" placeholder="Buscar por proveedor, orden o concepto..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div style={lightTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={lightOvTh}>Orden de servicio</th>
              <th style={lightOvTh}>Concepto / Descripción</th>
              <th style={lightOvTh}>Proveedor</th>
              <th style={lightOvTh}>Valor total</th>
              <th style={lightOvTh}>Pagado / Saldo</th>
              <th style={lightOvTh}></th>
            </tr>
          </thead>
          <tbody>
            {ordenesFiltradas.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...lightOvTd, textAlign: "center", color: OVERVIEW_LIGHT.textSecondary }}>
                  {searchQuery.trim() ? `Sin resultados para "${searchQuery}".` : "Todavía no hay nada registrado aquí."}
                </td>
              </tr>
            )}
            {ordenesFiltradas.map((o) => {
              const pagado = ordenPagado(o);
              const programado = ordenProgramado(o);
              const saldo = ordenSaldo(o);
              const sobrepasado = saldo < 0;
              const pct = o.valorTotal ? Math.round((pagado / o.valorTotal) * 100) : 0;
              const isOpen = openId === o.id;
              return (
                <React.Fragment key={o.id}>
                  <tr style={styles.ovRow} onClick={() => setOpenId(isOpen ? null : o.id)}>
                    <td style={lightOvTdName}>
                      <input
                        style={{ ...lightMiniInput, fontWeight: 600 }}
                        value={o.numero}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateOrden(o.id, { numero: e.target.value })}
                      />
                    </td>
                    <td style={lightOvTd}>
                      <input
                        style={lightMiniInput}
                        placeholder="Concepto de la orden"
                        value={o.descripcion || ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateOrden(o.id, { descripcion: e.target.value })}
                      />
                      {(o.presupuestoItems || []).length > 0 && (
                        <div style={{ fontSize: 10.5, color: BRAND_DARK, marginTop: 3 }}>
                          → {(o.presupuestoItems || [])
                            .filter((l) => presupuestoLabel(l.itemId))
                            .map((l) => `${presupuestoLabel(l.itemId)} (${fmtMoney(l.valor)})`)
                            .join(" · ")}
                        </div>
                      )}
                    </td>
                    <td style={lightOvTd} onClick={(e) => e.stopPropagation()}>
                      <input
                        style={lightMiniInput}
                        placeholder="Proveedor"
                        value={o.proveedor || ""}
                        onChange={(e) => updateOrden(o.id, { proveedor: e.target.value })}
                      />
                    </td>
                    <td style={lightOvTd} onClick={(e) => e.stopPropagation()}>
                      <MoneyInput
                        style={lightMiniInput}
                        value={o.valorTotal}
                        onChange={(val) => onChange({ ...data, ordenes: data.ordenes.map((x) => (x.id === o.id ? actualizarValorOrden(x, val) : x)) })}
                      />
                    </td>
                    <td style={lightOvTd}>
                      <OvBar pct={Math.min(100, pct)} label={`${pct}%`} color={sobrepasado ? "#E2604F" : saldo === 0 ? BRAND_DARK : "#F5B942"} trackColor={OVERVIEW_LIGHT.barTrack} />
                      <div style={{ fontSize: 10.5, color: sobrepasado ? "#E2604F" : OVERVIEW_LIGHT.textSecondary, marginTop: 3, fontFamily: "'JetBrains Mono', monospace", fontWeight: sobrepasado ? 700 : 400 }}>
                        {fmtMoney(pagado)} pagado{programado > 0 ? ` · ${fmtMoney(programado)} programado` : ""} · {sobrepasado ? "excedido en " : "saldo "}{fmtMoney(Math.abs(saldo))}
                      </div>
                    </td>
                    <td style={lightOvTd}>
                      <button style={lightRowDeleteBtn} onClick={(e) => { e.stopPropagation(); askDeleteOrden(o); }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ ...lightOvTd, background: "#EAF3EE" }}>
                        <div style={{ padding: "6px 4px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: OVERVIEW_LIGHT.textPrimary, marginBottom: 6 }}>
                            Ítems de presupuesto amarrados (opcional) — una orden se puede repartir entre varios
                          </div>
                          <table style={styles.overviewTable}>
                            <thead>
                              <tr>
                                <th style={lightOvTh}>Ítem</th>
                                <th style={lightOvTh}>Valor asignado</th>
                                <th style={lightOvTh}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.presupuestoItems || []).map((link) => (
                                <tr key={link.id}>
                                  <td style={lightOvTd}>
                                    <PresupuestoItemSelect
                                      groups={presupuestoGrupos}
                                      value={link.itemId}
                                      onChange={(id) => updatePresupuestoLink(o.id, link.id, { itemId: id })}
                                      style={lightMiniInput}
                                    />
                                  </td>
                                  <td style={lightOvTd}>
                                    <MoneyInput
                                      style={lightMiniInput}
                                      value={link.valor}
                                      onChange={(val) => updatePresupuestoLink(o.id, link.id, { valor: val })}
                                    />
                                  </td>
                                  <td style={lightOvTd}>
                                    <button style={lightRowDeleteBtn} onClick={() => deletePresupuestoLink(o.id, link.id)}><Trash2 size={13} /></button>
                                  </td>
                                </tr>
                              ))}
                              <tr>
                                <td style={lightOvTd}>
                                  <PresupuestoItemSelect
                                    groups={presupuestoGrupos}
                                    value={newLink.itemId}
                                    onChange={(id) => setNewLink({ ...newLink, itemId: id })}
                                    style={lightMiniInput}
                                    emptyLabel="Elegir ítem..."
                                  />
                                </td>
                                <td style={lightOvTd}>
                                  <MoneyInput style={lightMiniInput} placeholder={valorSugeridoAmarre(o) ? `Falta ${fmtMoney(valorSugeridoAmarre(o))}` : "$"} value={newLink.valor} onChange={(val) => setNewLink({ ...newLink, valor: val })} />
                                </td>
                                <td style={lightOvTd}>
                                  <button style={lightAddRowBtn} onClick={() => addPresupuestoLink(o.id)}><Plus size={14} /></button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          {(o.presupuestoItems || []).length > 0 && (() => {
                            // Cargada a un solo ítem: cuenta completa en Costo real. Solo las repartidas entre
                            // varios ítems dependen del valor asignado a cada uno.
                            const repartida = new Set(o.presupuestoItems.filter((l) => l.itemId).map((l) => l.itemId)).size > 1;
                            if (!repartida) {
                              return (
                                <div style={{ fontSize: 10.5, color: OVERVIEW_LIGHT.textSecondary, margin: "4px 0 12px" }}>
                                  Cargada completa ({fmtMoney(o.valorTotal)}) al ítem amarrado en Costo real.
                                </div>
                              );
                            }
                            const asignado = ordenPresupuestoAsignado(o);
                            const excede = asignado > o.valorTotal;
                            const falta = o.valorTotal - asignado > 1;
                            return (
                              <div style={{ fontSize: 10.5, color: excede ? "#E2604F" : falta ? "#B5790F" : OVERVIEW_LIGHT.textSecondary, margin: "4px 0 12px", fontWeight: excede || falta ? 600 : 400 }}>
                                Repartida entre ítems. Asignado: {fmtMoney(asignado)} de {fmtMoney(o.valorTotal)} (valor de la orden)
                                {(excede || falta) && " — no cuadra: en Costo real se reparte en proporción a lo asignado."}
                              </div>
                            );
                          })()}
                          <table style={styles.overviewTable}>
                            <thead>
                              <tr>
                                <th style={lightOvTh}>Estado</th>
                                <th style={lightOvTh}>Fecha</th>
                                <th style={lightOvTh}>Valor</th>
                                <th style={lightOvTh}>Concepto</th>
                                <th style={lightOvTh}>Aprobado</th>
                                <th style={lightOvTh}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.pagos.map((p) => {
                                const estado = p.estado || "pagado";
                                return (
                                  <tr key={p.id}>
                                    <td style={lightOvTd}>
                                      <select
                                        style={lightMiniInput}
                                        value={estado}
                                        onChange={(e) => updatePago(o.id, p.id, { estado: e.target.value })}
                                      >
                                        <option value="pagado">Pagado</option>
                                        <option value="programado">Programado</option>
                                      </select>
                                    </td>
                                    <td style={lightOvTd}>
                                      <input
                                        type="date"
                                        style={lightMiniInput}
                                        value={p.fecha}
                                        onChange={(e) => updatePago(o.id, p.id, { fecha: e.target.value })}
                                      />
                                    </td>
                                    <td style={lightOvTd}>
                                      <input
                                        type="number"
                                        style={lightMiniInput}
                                        value={p.valor}
                                        disabled={!!p.aprobado && !canAprobarPagos}
                                        title={p.aprobado ? (canAprobarPagos ? "Si cambias el valor, el pago pierde la aprobación" : BLOQUEO_APROBADO) : undefined}
                                        onChange={(e) => updatePago(o.id, p.id, { valor: Number(e.target.value) || 0 })}
                                      />
                                    </td>
                                    <td style={lightOvTd}>
                                      <input
                                        style={lightMiniInput}
                                        placeholder="Concepto"
                                        value={p.concepto || ""}
                                        onChange={(e) => updatePago(o.id, p.id, { concepto: e.target.value })}
                                      />
                                    </td>
                                    <td style={lightOvTd}>
                                      <input
                                        type="checkbox"
                                        className="approve-toggle"
                                        title={canAprobarPagos ? "Marcar como aprobado" : "No tienes permiso para aprobar pagos"}
                                        checked={!!p.aprobado}
                                        disabled={!canAprobarPagos}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          updatePago(o.id, p.id, checked
                                            ? { aprobado: true, aprobadoPor: approverName, aprobadoEn: todayISO() }
                                            : { aprobado: false, aprobadoPor: null, aprobadoEn: null });
                                        }}
                                      />
                                      {p.aprobado && p.aprobadoPor && (
                                        <div style={{ fontSize: 10, color: OVERVIEW_LIGHT.textSecondary, marginTop: 3 }}>
                                          Aprobado por {p.aprobadoPor}{p.aprobadoEn ? ` (${fmtDate(p.aprobadoEn)})` : ""}
                                        </div>
                                      )}
                                    </td>
                                    <td style={lightOvTd}>
                                      <button style={lightRowDeleteBtn} onClick={() => askDeletePago(o.id, p)}><Trash2 size={13} /></button>
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr>
                                <td style={lightOvTd}>
                                  <select style={lightMiniInput} value={newPago.estado} onChange={(e) => setNewPago({ ...newPago, estado: e.target.value })}>
                                    <option value="pagado">Pagado</option>
                                    <option value="programado">Programado</option>
                                  </select>
                                </td>
                                <td style={lightOvTd}>
                                  <input type="date" style={lightMiniInput} value={newPago.fecha} onChange={(e) => setNewPago({ ...newPago, fecha: e.target.value })} />
                                </td>
                                <td style={lightOvTd}>
                                  <MoneyInput style={lightMiniInput} placeholder="$" value={newPago.valor} onChange={(val) => setNewPago({ ...newPago, valor: val })} />
                                </td>
                                <td style={lightOvTd}>
                                  <input style={lightMiniInput} placeholder="Concepto (opcional)" value={newPago.concepto} onChange={(e) => setNewPago({ ...newPago, concepto: e.target.value })} />
                                </td>
                                <td style={lightOvTd}></td>
                                <td style={lightOvTd}>
                                  <button style={lightAddRowBtn} onClick={() => addPago(o.id)}><Plus size={14} /></button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            <tr>
              <td style={lightOvTd}>
                <input style={lightMiniInput} placeholder="N.° de orden" value={newOrden.numero} onChange={(e) => setNewOrden({ ...newOrden, numero: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <input style={lightMiniInput} placeholder="Concepto de la orden" value={newOrden.descripcion} onChange={(e) => setNewOrden({ ...newOrden, descripcion: e.target.value })} />
                <PresupuestoItemSelect
                  groups={presupuestoGrupos}
                  value={newOrden.presupuestoItemId}
                  onChange={(id) => setNewOrden({ ...newOrden, presupuestoItemId: id })}
                  style={{ ...lightMiniInput, marginTop: 4, fontSize: 11 }}
                  emptyLabel="Ítem de presupuesto (opcional)"
                />
              </td>
              <td style={lightOvTd}>
                <input style={lightMiniInput} placeholder="Proveedor" value={newOrden.proveedor} onChange={(e) => setNewOrden({ ...newOrden, proveedor: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <MoneyInput style={lightMiniInput} placeholder="$" value={newOrden.valorTotal} onChange={(val) => setNewOrden({ ...newOrden, valorTotal: val })} />
              </td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}>
                <button style={lightAddRowBtn} onClick={addOrden}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={confirmDelete.kind === "orden" ? "Eliminar orden de servicio" : "Eliminar pago"}
          message={`¿Eliminar ${confirmDelete.kind === "orden" ? "la orden" : "el pago"} "${confirmDelete.label}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={runConfirmedDelete}
        />
      )}
    </div>
  );
}

// Sube el archivo .xlsx lleno y muestra cuántas órdenes/pagos trae antes de aplicar — reemplaza
// TODA la lista de órdenes de este proyecto por lo que traiga el archivo (por eso el aviso).
// Deja elegir un rango de fechas para exportar (imprimir) los pagos con estado "programado" cuya
// fecha caiga dentro de ese rango. Ambas fechas son opcionales por separado (solo "desde", solo
// "hasta", o ambas) para no obligar a acotar por los dos lados.
export function PagosRangeExportModal({ onClose, onExport }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Exportar pagos programados</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>
          Elige el rango de fechas de los pagos programados que quieres exportar. Se abrirá el
          diálogo de impresión — elige "Guardar como PDF".
        </p>
        <label style={styles.modalField}>
          <span>Desde</span>
          <input type="date" style={styles.input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={styles.modalField}>
          <span>Hasta</span>
          <input type="date" style={styles.input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button style={{ ...styles.addProjectBtn, marginTop: 8 }} onClick={() => onExport({ from, to })}>
          Exportar
        </button>
      </div>
    </div>
  );
}

export function PagosTemplateModal({ existingOrdenes = [], canAprobarPagos = false, onClose, onImport }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null); // { ordenes, skipped, totalPagos } | null
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    setFileName(file.name);
    setError("");
    setPreview(null);
    try {
      const buf = await file.arrayBuffer();
      const { ordenes: leidas, skipped } = await parsePagosWorkbook(buf);
      const { ordenes, amarresConservados, aprobacionesConservadas, aprobadosEliminados } = mergeImportedOrdenes(existingOrdenes, leidas);
      const totalPagos = ordenes.reduce((s, o) => s + o.pagos.length, 0);
      setPreview({ ordenes, skipped, totalPagos, amarresConservados, aprobacionesConservadas, aprobadosEliminados });
    } catch (err) {
      console.error("Error leyendo plantilla de pagos:", err);
      setError(`No se pudo leer ese archivo. ¿Es un .xlsx válido? (${err?.message || "error desconocido"})`);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.exportModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h3 style={styles.h3}>Cargar plantilla de pagos</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <p style={styles.exportHint}>
          Sube el archivo .xlsx que descargaste y llenaste. Esto <strong>reemplaza todas las órdenes de servicio</strong> de
          este proyecto por lo que traiga el archivo. Las órdenes con el mismo número conservan sus amarres al
          presupuesto, y los pagos con la misma fecha y valor conservan su aprobación.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <button style={{ ...styles.addProjectBtn, marginTop: 4 }} onClick={() => fileInputRef.current?.click()}>
          {fileName || "Elegir archivo…"}
        </button>
        {error && <div style={styles.importError}>{error}</div>}
        {preview && (
          <>
            <div style={styles.pastePreview}>
              Se detectaron <strong>{preview.ordenes.length}</strong> órdenes con <strong>{preview.totalPagos}</strong> pagos en total.
              {preview.skipped > 0 && <> Se ignoraron {preview.skipped} filas sin número de orden.</>}
              {(preview.amarresConservados > 0 || preview.aprobacionesConservadas > 0) && (
                <> Se conservan los amarres al presupuesto de {preview.amarresConservados} órdenes y {preview.aprobacionesConservadas} aprobaciones de pagos.</>
              )}
            </div>
            {preview.aprobadosEliminados > 0 && (
              <div style={styles.importError}>
                {preview.aprobadosEliminados} {preview.aprobadosEliminados === 1 ? "pago aprobado no está" : "pagos aprobados no están"} en
                el archivo (o cambiaron de fecha o valor) y se {preview.aprobadosEliminados === 1 ? "eliminaría" : "eliminarían"}.
                {canAprobarPagos ? " Revisa antes de reemplazar." : " Solo quien tiene permiso de aprobar pagos puede hacerlo: corrige el archivo o pídeselo a esa persona."}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.confirmCancelBtn} onClick={() => { setPreview(null); setFileName(""); }}>Elegir otro archivo</button>
              <button
                style={{ ...styles.addProjectBtn, opacity: preview.ordenes.length && (canAprobarPagos || !preview.aprobadosEliminados) ? 1 : 0.5 }}
                disabled={!preview.ordenes.length || (!canAprobarPagos && preview.aprobadosEliminados > 0)}
                onClick={() => onImport(preview.ordenes)}
              >
                Reemplazar con {preview.ordenes.length} órdenes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
