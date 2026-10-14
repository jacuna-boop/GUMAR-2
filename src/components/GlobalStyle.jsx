export function GlobalStyle() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body, html, #root { margin:0; padding:0; }
      input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
      ::selection { background: #F5B94255; }
      select option { background:#FFFFFF; color:#22312D; }
      select optgroup { background:#F2F6F4; color:#22312D; font-style:normal; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .readonly-gate input:not(.approve-toggle):not(.ro-ok),
      .readonly-gate select,
      .readonly-gate textarea,
      .readonly-gate button:not(.view-toggle):not(.ro-ok) {
        pointer-events: none;
        opacity: 0.6;
      }
      /* En solo lectura se puede buscar, ver adjuntos y exportar (ro-ok / ro-scope). */
      .readonly-gate .ro-scope input,
      .readonly-gate .ro-scope select,
      .readonly-gate .ro-scope button {
        pointer-events: auto !important;
        opacity: 1 !important;
      }

      /* Aviso que aparece al pasar el mouse por un valor (p. ej. costo real que supera un ítem). */
      .hover-aviso { cursor: help; border-bottom: 1px dotted currentColor; }
      .hover-aviso-box {
        position: fixed; z-index: 1000; width: 260px; padding: 8px 10px; border-radius: 6px;
        background: #2E1520; color: #FFFFFF; font-size: 11.5px; font-weight: 400; line-height: 1.4;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25); white-space: normal; text-align: left; pointer-events: none;
      }

      .print-only { display: none; }
      @media print {
        body { background: #ffffff !important; }
        .no-print { display: none !important; }
        .print-only { display: block !important; }
      }

      @media (max-width: 780px) {
        .app-noprint { flex-direction: column !important; }
        .app-sidebar {
          width: 100% !important; min-width: 100% !important;
          height: auto !important; max-height: 46vh !important;
          position: static !important; border-right: none !important;
          border-bottom: 1px solid #232D33 !important;
        }
        .app-main { min-height: 54vh; }
        .app-tabs { overflow-x: auto !important; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; }
        .app-tabs::-webkit-scrollbar { height: 3px; }
        .app-resumen-grid { grid-template-columns: 1fr !important; }
        .app-stat-row { grid-template-columns: repeat(2, 1fr) !important; }
        .app-main input, .app-main select, .app-main button { min-height: 34px; }
      }
    `}</style>
  );
}
