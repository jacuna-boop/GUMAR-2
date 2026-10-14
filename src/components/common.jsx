import { useEffect, useRef, useState } from "react";
import { CAT_STYLE, parseColombianNumber } from "../lib/data.js";
import { Plus, Sun } from "lucide-react";
import { styles } from "../styles.js";

export function MiniBar({ label, pct, color, displayLabel }) {
  return (
    <div style={styles.miniBarRow}>
      <span style={styles.miniBarLabel}>{label}</span>
      <div style={styles.miniBarTrack}>
        <div style={{ ...styles.miniBarFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={styles.miniBarPct}>{displayLabel ?? `${pct}%`}</span>
    </div>
  );
}

// Formatea un texto de dígitos (con a lo sumo una coma decimal) con puntos de miles, estilo
// colombiano: "1234567" -> "1.234.567", "1234,5" -> "1.234,5".
export function formatMilesDisplay(raw) {
  if (!raw) return "";
  const [intPart, decPart] = raw.split(",");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart !== undefined ? `${intFormatted},${decPart}` : intFormatted;
}

// Input numérico que va mostrando los puntos de miles/millones mientras se escribe, para poder ver
// de un vistazo si el número quedó con la cantidad de ceros correcta. Por dentro sigue guardando un
// número plano (onChange recibe un number) — el formato es solo visual.
export function MoneyInput({ value, onChange, style, placeholder }) {
  const toText = (v) => (v === "" || v === undefined || v === null || Number(v) === 0 ? "" : formatMilesDisplay(String(v).replace(".", ",")));
  const [text, setText] = useState(() => toText(value));
  const inputRef = useRef(null);

  useEffect(() => {
    if (parseColombianNumber(text) !== (Number(value) || 0)) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    const input = e.target;
    const caret = input.selectionStart;
    const digitsBeforeCaret = input.value.slice(0, caret).replace(/[^0-9,]/g, "").length;

    let raw = input.value.replace(/[^0-9,]/g, "");
    const firstComma = raw.indexOf(",");
    if (firstComma !== -1) raw = raw.slice(0, firstComma + 1) + raw.slice(firstComma + 1).replace(/,/g, "");

    const formatted = formatMilesDisplay(raw);
    setText(formatted);
    onChange(parseColombianNumber(raw));

    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      let count = 0, pos = 0;
      for (; pos < formatted.length && count < digitsBeforeCaret; pos++) {
        if (/[0-9,]/.test(formatted[pos])) count++;
      }
      inputRef.current.setSelectionRange(pos, pos);
    });
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      style={style}
      placeholder={placeholder}
      value={text}
      onChange={handleChange}
    />
  );
}

// Selector de ítem de presupuesto con buscador: la lista de ~90 ítems en varias categorías es
// larga para desplazarse a mano en un <select> nativo, así que esto es un combobox — al enfocar
// se abre la lista completa (agrupada por categoría) y al escribir se filtra por código de ítem o
// descripción (sin distinguir mayúsculas/acentos), igual que el buscador de Pagos.
export function PresupuestoItemSelect({ groups, value, onChange, style, emptyLabel = "Sin vincular" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const normalize = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const itemLabel = (it) => (it.item ? `${it.item} · ` : "") + it.descripcion;
  const selected = groups.flatMap((g) => g.items).find((it) => it.id === value);
  const q = normalize(query);
  const filteredGroups = q
    ? groups
        .map((g) => ({ ...g, items: g.items.filter((it) => normalize(itemLabel(it)).includes(q)) }))
        .filter((g) => g.items.length > 0)
    : groups;

  const choose = (id) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        style={style}
        placeholder={emptyLabel}
        value={open ? query : selected ? itemLabel(selected) : ""}
        onFocus={() => setQuery("")}
        onChange={(e) => { setOpen(true); setQuery(e.target.value); }}
        onClick={() => setOpen(true)}
      />
      {open && (
        <div style={styles.presItemSelectMenu}>
          <div className="pres-item-row" style={styles.presItemSelectRow} onMouseDown={() => choose("")}>{emptyLabel}</div>
          {filteredGroups.length === 0 && (
            <div style={{ ...styles.presItemSelectRow, cursor: "default", color: "#8FA39B" }}>Sin resultados</div>
          )}
          {filteredGroups.map((g) => (
            <div key={g.categoria}>
              <div style={styles.presItemSelectGroupLabel}>{g.categoria}</div>
              {g.items.map((it) => (
                <div key={it.id} className="pres-item-row" style={styles.presItemSelectRow} onMouseDown={() => choose(it.id)}>
                  {itemLabel(it)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// markerPct (opcional): pinta una línea vertical fija dentro de la barra en esa posición — se usa,
// por ejemplo, para marcar dónde cae la FPO sin prórroga dentro de la barra de FPO con prórroga.
export function OvBar({ pct, color, label, trackColor, markerPct, markerTitle }) {
  return (
    <div style={styles.ovBarWrap}>
      <div style={{ ...styles.ovBarTrack, ...(trackColor ? { background: trackColor } : {}), position: "relative" }}>
        <div style={{ ...styles.ovBarFill, width: `${pct}%`, background: color }} />
        {markerPct != null && (
          <div title={markerTitle} style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.min(100, Math.max(0, markerPct))}%`, width: 2, background: "#22312D" }} />
        )}
      </div>
      <span style={{ ...styles.ovBarPct, color }}>{label ?? `${pct}%`}</span>
    </div>
  );
}

export function BigPct({ pct, color, label, trackColor, markerPct, markerTitle }) {
  return (
    <div style={styles.bigPctWrap}>
      <div style={{ ...styles.bigPctTrack, ...(trackColor ? { background: trackColor } : {}), position: "relative" }}>
        <div style={{ ...styles.bigPctFill, width: `${pct}%`, background: color }} />
        {markerPct != null && (
          <div title={markerTitle} style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.min(100, Math.max(0, markerPct))}%`, width: 2, background: "#22312D" }} />
        )}
      </div>
      <span style={{ ...styles.bigPctNum, color }}>{label ?? `${pct}%`}</span>
    </div>
  );
}

// Sin "groups" muestra todas las categorías (comportamiento de siempre); con "groups" (ver
// EnergizacionModule) solo muestra las categorías que ese trámite en concreto usa.
export function Legend({ groups }) {
  const cats = groups ? Array.from(new Set(groups.map((g) => g.cat))) : Object.keys(CAT_STYLE);
  return (
    <div style={styles.legend}>
      {cats.map((k) => {
        const v = CAT_STYLE[k];
        if (!v) return null;
        return (
          <span key={k} style={{ ...styles.legendItem, color: v.fg }}>
            ● {v.label}
          </span>
        );
      })}
    </div>
  );
}

export function EmptyState({ onAdd }) {
  return (
    <div style={styles.emptyState}>
      <Sun size={40} color="#FFFFFF" />
      <h2 style={styles.h2}>Aún no tienes proyectos</h2>
      <p style={styles.emptyP}>Crea tu primer parque solar para empezar a llevar el seguimiento de radicación UPME y energización.</p>
      <button style={styles.addProjectBtn} onClick={onAdd}><Plus size={15} /> Nuevo proyecto</button>
    </div>
  );
}

// Aviso que aparece al pasar el mouse por un valor. Se posiciona "fixed" (relativo a la ventana)
// para que no lo corte el scroll de la tabla donde está.
export function HoverAviso({ texto, children }) {
  const [pos, setPos] = useState(null);
  const mostrar = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(window.innerWidth - 268, r.right - 260)), arriba: r.top > 90, top: r.top, bottom: r.bottom });
  };
  return (
    <span className="hover-aviso" onMouseEnter={mostrar} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && (
        <span
          className="hover-aviso-box"
          style={{ left: pos.left, top: pos.arriba ? pos.top - 8 : pos.bottom + 8, transform: pos.arriba ? "translateY(-100%)" : "none" }}
        >
          {texto}
        </span>
      )}
    </span>
  );
}
