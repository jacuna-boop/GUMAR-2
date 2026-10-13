import { useState } from "react";
import { balanceFlujoCaja, balanceHitosAlertas, balanceMargenTotals, balanceTotals, fmtMoney, todayISO, uid } from "../lib/data.js";
import { AlertTriangle, Landmark, Plus, Trash2, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend as RLegend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { styles } from "../styles.js";
import { BRAND_DARK, BRAND_LIGHT, FONT_BRAND_DISPLAY, FONT_MONO, OVERVIEW_LIGHT } from "../theme.js";
import { MoneyInput } from "../components/common.jsx";
import { ConfirmModal } from "../modals/dialogs.jsx";

// Balance financiero: hitos de pago del cliente (con fecha y valor esperado). Al marcar un hito
// como pagado se registra la fecha/valor real — de ahí sale el total de "ingresos" (no hay una
// lista de ingresos aparte). "Plata que sale" viene del módulo de Pagos (lo ya pagado a proveedores).
export function BalanceModule({ data, onChange, pagos, presupuesto }) {
  const [newHito, setNewHito] = useState({ nombre: "", fechaProgramada: "", valorEsperado: "" });
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, label } | null
  const totals = balanceTotals(data, pagos);
  const margen = balanceMargenTotals(data, presupuesto);
  const alertas = balanceHitosAlertas(data);
  const flujoData = balanceFlujoCaja(data, pagos);
  // Barra tipo "bullet": la ejecución real es la barra gruesa, el presupuesto base es una marca de
  // referencia (el plan) y el valor de venta es la meta — así se ve de un vistazo cuánto margen queda.
  const margenMaxRef = Math.max(margen.valorVenta, margen.presupuestoBase, margen.presupuestoEjecucion, 1) * 1.05;
  const margenPct = (v) => Math.min(100, (v / margenMaxRef) * 100);
  const ejecucionSobreVenta = margen.presupuestoEjecucion > margen.valorVenta;

  const addHito = () => {
    if (!newHito.nombre.trim()) return;
    const hito = {
      id: uid(),
      nombre: newHito.nombre.trim(),
      fechaProgramada: newHito.fechaProgramada,
      valorEsperado: Number(newHito.valorEsperado) || 0,
      pagado: false,
      fechaPago: "",
      valorPagado: 0,
    };
    onChange({ ...data, hitos: [...data.hitos, hito] });
    setNewHito({ nombre: "", fechaProgramada: "", valorEsperado: "" });
  };

  const updateHito = (id, patch) => {
    onChange({ ...data, hitos: data.hitos.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  };

  const togglePagado = (h, checked) => {
    updateHito(h.id, checked
      ? { pagado: true, fechaPago: h.fechaPago || todayISO(), valorPagado: h.valorPagado || h.valorEsperado }
      : { pagado: false });
  };

  const deleteHito = (id) => onChange({ ...data, hitos: data.hitos.filter((h) => h.id !== id) });

  // Piloto de tema claro extendido a Balance financiero. El gráfico "Pagos del cliente vs. pagos de
  // la empresa" y sus 2 tarjetas de Ingresos/Pagos realizados quedan con sus colores actuales
  // (verde/rosa) por ahora, en espera del tono exacto del manual de marca para "pagos de la empresa".
  const lightChartBox = { ...styles.chartBox, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightCardHead = { ...styles.cardHead, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_DISPLAY };
  const lightStat = { ...styles.overviewStat, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightStatLabel = { ...styles.overviewStatLabel, color: OVERVIEW_LIGHT.textSecondary };
  const lightInput = { ...styles.miniInput, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightAlertBox = { ...styles.pagosAlertBox, background: OVERVIEW_LIGHT.card, border: "1px solid #E8A33D88" };
  const lightTableWrap = { ...styles.cronoTableWrap, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTh = { ...styles.ovTh, color: OVERVIEW_LIGHT.textSecondary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightOvTd = { ...styles.ovTd, color: OVERVIEW_LIGHT.textPrimary, borderBottom: `1px solid ${OVERVIEW_LIGHT.border}` };
  const lightReadonlyText = { ...styles.presReadonlyText, color: OVERVIEW_LIGHT.textSecondary };
  const lightRowDeleteBtn = { ...styles.rowDeleteBtn, color: "#8FA39B" };
  const lightAddRowBtn = { ...styles.addRowBtn, background: BRAND_DARK, color: "#FFFFFF" };

  return (
    <div style={{ background: OVERVIEW_LIGHT.page, margin: "-26px -32px -60px", padding: "26px 32px 60px", minHeight: "100vh" }}>
      <div style={lightChartBox}>
        <div style={lightCardHead}><Landmark size={16} color={BRAND_DARK} /><span>Valor del proyecto</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 14px" }}>
          <span style={{ fontSize: 12, color: OVERVIEW_LIGHT.textSecondary }}>Valor de venta al cliente (contrato):</span>
          <MoneyInput
            style={{ ...lightInput, width: 160 }}
            value={data.valorVentaCliente}
            onChange={(val) => onChange({ ...data, valorVentaCliente: val })}
          />
        </div>
        <div style={styles.overviewStatRow} className="app-stat-row">
          <div style={lightStat}>
            <div style={{ ...styles.overviewStatNum, fontSize: 18, color: BRAND_DARK }}>{fmtMoney(margen.valorVenta)}</div>
            <div style={lightStatLabel}>Valor de venta (cliente)</div>
          </div>
          <div style={lightStat}>
            <div style={{ ...styles.overviewStatNum, fontSize: 18, color: OVERVIEW_LIGHT.textSecondary }}>{fmtMoney(margen.presupuestoBase)}</div>
            <div style={lightStatLabel}>Valor base (presupuesto base)</div>
          </div>
          <div style={lightStat}>
            <div style={{ ...styles.overviewStatNum, fontSize: 18, color: BRAND_DARK }}>{fmtMoney(margen.presupuestoEjecucion)}</div>
            <div style={lightStatLabel}>Valor del proyecto (ejecución)</div>
          </div>
          <div style={lightStat}>
            <div style={{ ...styles.overviewStatNum, fontSize: 18, color: margen.utilidadReal >= 0 ? BRAND_DARK : "#E2604F" }}>{fmtMoney(margen.utilidadReal)}</div>
            <div style={lightStatLabel}>Utilidad real (venta − ejecución)</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 4px 8px" }}>
          {[
            { label: "Valor de venta (meta)", value: margen.valorVenta, color: BRAND_DARK },
            { label: "Presupuesto base (plan)", value: margen.presupuestoBase, color: BRAND_LIGHT },
            { label: "Presupuesto ejecución (real)", value: margen.presupuestoEjecucion, color: ejecucionSobreVenta ? "#E2604F" : BRAND_DARK },
          ].map((row) => (
            <div key={row.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary, marginBottom: 4 }}>
                <span>{row.label}</span>
                <span style={{ fontFamily: FONT_MONO, color: OVERVIEW_LIGHT.textPrimary }}>{fmtMoney(row.value)}</span>
              </div>
              <div style={{ height: 16, background: "#E3E9E6", borderRadius: 5 }}>
                <div style={{ height: "100%", width: `${margenPct(row.value)}%`, background: row.color, borderRadius: 5, transition: "width 0.2s" }} />
              </div>
            </div>
          ))}
          {ejecucionSobreVenta && (
            <div style={styles.presExcedidoTag}>
              La ejecución ya supera el valor de venta en {fmtMoney(margen.presupuestoEjecucion - margen.valorVenta)}
            </div>
          )}
        </div>
      </div>

      <div style={styles.overviewStatRow} className="app-stat-row">
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: BRAND_DARK }}>{fmtMoney(totals.totalIngresos)}</div>
          <div style={lightStatLabel}>Ingresos (consignado por el cliente)</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: "#B5790F" }}>{fmtMoney(totals.totalPagos)}</div>
          <div style={lightStatLabel}>Pagos realizados a proveedores</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: totals.saldo >= 0 ? BRAND_DARK : "#E2604F" }}>{fmtMoney(totals.saldo)}</div>
          <div style={lightStatLabel}>Queda</div>
        </div>
        <div style={lightStat}>
          <div style={{ ...styles.overviewStatNum, fontSize: 18, color: OVERVIEW_LIGHT.textSecondary }}>{fmtMoney(totals.totalEsperado)}</div>
          <div style={lightStatLabel}>Total esperado (todos los hitos)</div>
        </div>
      </div>

      <div style={lightChartBox}>
        <div style={lightCardHead}><Wallet size={16} color={BRAND_DARK} /><span>Pagos del cliente vs. pagos de la empresa (acumulado)</span></div>
        {flujoData.length === 0 ? (
          <div style={{ color: OVERVIEW_LIGHT.textSecondary, fontSize: 13, padding: "10px 0 4px" }}>
            Marca hitos como pagados y registra pagos a proveedores para ver esta gráfica.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={flujoData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="balFlujoIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_DARK} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={BRAND_DARK} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="balFlujoPagos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F5B942" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#F5B942" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={OVERVIEW_LIGHT.border} />
              <XAxis dataKey="label" tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} />
              <YAxis tick={{ fill: OVERVIEW_LIGHT.textSecondary, fontSize: 10 }} tickFormatter={(v) => fmtMoney(v)} width={90} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ background: "#FFFFFF", border: `1px solid ${OVERVIEW_LIGHT.border}`, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary }} />
              <RLegend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="ingresos" name="Pagos del cliente" stroke={BRAND_DARK} strokeWidth={2} fill="url(#balFlujoIngresos)" />
              <Area type="monotone" dataKey="pagos" name="Pagos de la empresa" stroke="#F5B942" strokeWidth={2} fill="url(#balFlujoPagos)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {alertas.length > 0 && (
        <div style={lightAlertBox}>
          <div style={lightCardHead}><AlertTriangle size={16} color="#E8A33D" /><span>Hitos de pago del cliente</span></div>
          <ul style={styles.alertList}>
            {alertas.map((a, i) => (
              <li key={i} style={{ ...styles.alertItem, color: a.tipo === "vencido" ? "#E2604F" : "#B5790F" }}>{a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={lightTableWrap}>
        <table style={styles.overviewTable}>
          <thead>
            <tr>
              <th style={lightOvTh}>Hito de pago</th>
              <th style={lightOvTh}>Fecha programada</th>
              <th style={lightOvTh}>Valor esperado</th>
              <th style={lightOvTh}>¿Pagado?</th>
              <th style={lightOvTh}>Fecha de pago</th>
              <th style={lightOvTh}>Valor pagado</th>
              <th style={lightOvTh}></th>
            </tr>
          </thead>
          <tbody>
            {data.hitos.map((h) => (
              <tr key={h.id}>
                <td style={lightOvTd}>
                  <input style={lightInput} value={h.nombre} onChange={(e) => updateHito(h.id, { nombre: e.target.value })} />
                </td>
                <td style={lightOvTd}>
                  <input type="date" style={lightInput} value={h.fechaProgramada || ""} onChange={(e) => updateHito(h.id, { fechaProgramada: e.target.value })} />
                </td>
                <td style={lightOvTd}>
                  <MoneyInput style={lightInput} value={h.valorEsperado} onChange={(val) => updateHito(h.id, { valorEsperado: val })} />
                </td>
                <td style={lightOvTd}>
                  <input type="checkbox" checked={!!h.pagado} onChange={(e) => togglePagado(h, e.target.checked)} />
                </td>
                <td style={lightOvTd}>
                  {h.pagado ? (
                    <input type="date" style={lightInput} value={h.fechaPago || ""} onChange={(e) => updateHito(h.id, { fechaPago: e.target.value })} />
                  ) : (
                    <span style={lightReadonlyText}>—</span>
                  )}
                </td>
                <td style={lightOvTd}>
                  {h.pagado ? (
                    <MoneyInput style={lightInput} value={h.valorPagado} onChange={(val) => updateHito(h.id, { valorPagado: val })} />
                  ) : (
                    <span style={lightReadonlyText}>—</span>
                  )}
                </td>
                <td style={lightOvTd}>
                  <button style={lightRowDeleteBtn} onClick={() => setConfirmDelete({ id: h.id, label: h.nombre || "este hito" })}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={lightOvTd}>
                <input style={lightInput} placeholder="Ej. Anticipo, Entrega 1..." value={newHito.nombre} onChange={(e) => setNewHito({ ...newHito, nombre: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <input type="date" style={lightInput} value={newHito.fechaProgramada} onChange={(e) => setNewHito({ ...newHito, fechaProgramada: e.target.value })} />
              </td>
              <td style={lightOvTd}>
                <MoneyInput style={lightInput} placeholder="$" value={newHito.valorEsperado} onChange={(val) => setNewHito({ ...newHito, valorEsperado: val })} />
              </td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}></td>
              <td style={lightOvTd}>
                <button style={lightAddRowBtn} onClick={addHito}><Plus size={14} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Eliminar hito de pago"
          message={`¿Eliminar el hito "${confirmDelete.label}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { deleteHito(confirmDelete.id); setConfirmDelete(null); }}
        />
      )}
    </div>
  );
}
