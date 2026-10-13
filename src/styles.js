import { BRAND_DARK, BRAND_LIGHT, FONT_BODY, FONT_BRAND_BODY, FONT_BRAND_DISPLAY, FONT_DISPLAY, FONT_MONO, OFF_WHITE, OVERVIEW_LIGHT } from "./theme.js";

/* ---------------------------------------------------------------------
   Printable report (used for "Exportar PDF" via window.print)
--------------------------------------------------------------------- */
export const prCard = {
  page: { display: "none" },
  wrap: { background: "#F7F8F9", color: "#1A1A1A", fontFamily: "Arial, Helvetica, sans-serif", padding: "26px 30px" },
  headerRow: { marginBottom: 20 },
  h1: { fontSize: 22, margin: "0 0 2px", fontWeight: 700, color: "#111" },
  meta: { fontSize: 12, color: "#555", marginBottom: 2 },
  genAt: { fontSize: 10.5, color: "#999" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 },
  card: { background: "#fff", border: "1px solid #E2E5E8", borderRadius: 10, padding: "16px 18px", breakInside: "avoid" },
  cardHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: "#333", marginBottom: 10 },
  bigPctRow: { display: "flex", alignItems: "center", gap: 10 },
  bigPctTrack: { flex: 1, height: 7, background: "#E9ECEF", borderRadius: 6, overflow: "hidden" },
  bigPctFill: { height: "100%", borderRadius: 6 },
  bigPctNum: { fontSize: 17, fontWeight: 700, minWidth: 44, textAlign: "right" },
  cardSub: { fontSize: 11, color: "#666", marginTop: 8 },
  statCard: { background: "#fff", border: "1px solid #E2E5E8", borderRadius: 10, padding: "12px 14px", textAlign: "center" },
  statNum: { fontSize: 19, fontWeight: 700, color: "#111" },
  statLabel: { fontSize: 10, color: "#777", marginTop: 3 },
  alertsCard: { background: "#fff", border: "1px solid #E2E5E8", borderRadius: 10, padding: "16px 18px", marginTop: 4, breakInside: "avoid" },
  alertItem: { fontSize: 11.5, color: "#8A5A00", marginBottom: 5 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 6 },
  th: { textAlign: "left", padding: "6px 10px", borderBottom: "2px solid #ddd", color: "#555", fontWeight: 700, fontSize: 10 },
  td: { padding: "6px 10px", borderBottom: "1px solid #eee" },
  tdBarTrack: { display: "inline-block", width: 70, height: 6, background: "#E9ECEF", borderRadius: 4, overflow: "hidden", verticalAlign: "middle", marginRight: 6 },
  tdBarFill: { display: "block", height: "100%", borderRadius: 4 },
  groupHead: {
    display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12,
    background: "#F0F0F0", padding: "6px 10px", borderRadius: 4, marginTop: 14,
  },
  section: { marginBottom: 4, breakInside: "avoid" },
};

export const styles = {
  app: {
    display: "flex",
    minHeight: "100vh",
    background: BRAND_DARK,
    color: "#FFFFFF",
    fontFamily: FONT_BRAND_BODY,
  },
  loadingScreen: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    width: "100%",
    background: BRAND_DARK,
  },
  sidebar: {
    width: 260,
    minWidth: 260,
    background: BRAND_DARK,
    borderRight: "1px solid #232D33",
    padding: "18px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    height: "100vh",
    position: "sticky",
    top: 0,
    overflowY: "auto",
  },
  brand: {
    display: "flex", alignItems: "center", gap: 12, padding: "4px 4px 10px",
    background: "none", border: "none", outline: "none", cursor: "pointer", textAlign: "left", width: "100%",
  },
  brandLogo: { width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 },
  brandSub: { fontSize: 11, color: "#7A8A93", marginTop: 1, fontFamily: FONT_BRAND_BODY },
  // "GUMAR" / "PROYECTOS" apiladas en 2 líneas, mismo tamaño y alineación para que se vean
  // simétricas entre sí.
  brandWordmark: { lineHeight: 1.15 },
  brandWordmarkLine: { fontFamily: FONT_BRAND_DISPLAY, fontWeight: 700, fontSize: 15, letterSpacing: 0.5, color: "#FFFFFF" },
  addProjectBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    background: BRAND_LIGHT, color: "#1F332C", border: "none", borderRadius: 8,
    padding: "9px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer",
    fontFamily: FONT_BRAND_BODY,
  },
  projectList: { display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" },
  noProjects: { color: "#5A6870", fontSize: 12.5, padding: "10px 4px", fontFamily: FONT_BRAND_BODY },
  sidebarFooter: { marginTop: "auto", paddingTop: 14, borderTop: "1px solid #232D33", display: "flex", flexDirection: "column", gap: 8 },
  sharedNote: { fontSize: 10.5, color: "#DCEAE4", lineHeight: 1.4, padding: "0 2px", fontFamily: FONT_BRAND_BODY },
  footerBtnRow: { display: "flex", gap: 6 },
  footerBtn: {
    flex: 1, background: BRAND_LIGHT, border: "1px solid #8FBBAC", color: "#1F332C", borderRadius: 8,
    padding: "8px 6px", fontSize: 11, cursor: "pointer", fontFamily: FONT_BRAND_BODY,
  },
  projectItem: {
    background: OFF_WHITE, border: "1px solid #8FBBAC", borderRadius: 10,
    padding: "10px 12px", cursor: "pointer",
  },
  projectItemActive: { borderColor: BRAND_DARK, background: "#D9F5E6" },
  projectItemTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  projectName: { fontSize: 13.5, fontWeight: 600, fontFamily: FONT_BRAND_DISPLAY, color: "#1F332C" },
  deleteBtn: { background: "none", border: "none", color: "#3E5850", cursor: "pointer", padding: 2 },
  projectMeta: { fontSize: 11, color: "#3E5850", marginBottom: 8, fontFamily: FONT_BRAND_BODY },
  miniBarRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 },
  miniBarLabel: { fontSize: 9.5, color: "#3E5850", width: 62, flexShrink: 0, fontFamily: FONT_BRAND_BODY },
  miniBarTrack: { flex: 1, height: 4, background: "#E3E9E6", borderRadius: 4, overflow: "hidden" },
  miniBarFill: { height: "100%", borderRadius: 4 },
  miniBarPct: { fontSize: 9.5, color: "#1F332C", width: 28, textAlign: "right", fontFamily: FONT_BRAND_BODY },

  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  noPrintWrap: { display: "flex", flex: 1, minWidth: 0 },
  header: {
    padding: "22px 32px 18px", display: "flex", justifyContent: "space-between",
    alignItems: "flex-end", flexWrap: "wrap", gap: 16, background: BRAND_DARK,
  },
  headerEyebrow: { fontFamily: FONT_BRAND_BODY, fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "#DCEAE4" },
  h1: { fontFamily: FONT_BRAND_DISPLAY, fontSize: 24, margin: 0, fontWeight: 600, letterSpacing: 0.2, color: "#FFFFFF" },
  headerMeta: { color: "#DCEAE4", fontSize: 12.5, marginTop: 4, fontFamily: FONT_MONO },
  headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 },
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  saveBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #8FBBAC",
    color: "#FFFFFF", padding: "6px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11.5,
    fontFamily: FONT_MONO,
  },
  pdfBtn: {
    display: "flex", alignItems: "center", gap: 6, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`,
    color: OVERVIEW_LIGHT.textPrimary, padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12,
    fontFamily: FONT_BRAND_BODY, fontWeight: 500,
  },
  tabs: { display: "flex", gap: 4, paddingBottom: 14 },
  tabBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #FFFFFF66",
    color: "#FFFFFF", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
    fontFamily: FONT_BRAND_BODY, fontWeight: 500,
  },
  // La pestaña activa solo cambia el relleno a blanco — mismo tamaño/borde/radio que las demás,
  // para que todas queden simétricas entre sí.
  tabBtnActive: { background: OVERVIEW_LIGHT.card, border: "1px solid " + OVERVIEW_LIGHT.card, color: OVERVIEW_LIGHT.textPrimary, fontWeight: 700 },
  content: { padding: "26px 32px 60px", overflowY: "auto" },

  resumenGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  card: { background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 12, padding: 20 },
  cardClickable: { cursor: "pointer", transition: "border-color 120ms, background 120ms" },
  cardHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: OVERVIEW_LIGHT.textPrimary, marginBottom: 14, fontWeight: 600, fontFamily: FONT_BRAND_DISPLAY },
  cardSub: { color: OVERVIEW_LIGHT.textSecondary, fontSize: 12.5, marginTop: 10, fontFamily: FONT_BRAND_BODY },
  bigPctWrap: { display: "flex", alignItems: "center", gap: 14 },
  bigPctTrack: { flex: 1, height: 8, background: "#E3E9E6", borderRadius: 6, overflow: "hidden" },
  bigPctFill: { height: "100%", borderRadius: 6 },
  bigPctNum: { fontFamily: FONT_MONO, fontSize: 20, fontWeight: 700, minWidth: 52, textAlign: "right" },
  alertList: { margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8 },
  alertItem: { fontSize: 13, color: "#E8A33D" },
  alertsByProjectList: { display: "flex", flexDirection: "column", gap: 16 },
  alertsByProjectGroup: {},
  alertsByProjectName: {
    fontSize: 13, fontWeight: 700, color: "#E8EDEF", marginBottom: 6, cursor: "pointer", width: "fit-content",
  },
  alertModuloTagRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  alertModuloTag: {
    fontSize: 11, fontWeight: 600, color: "#E8A33D", background: "#2A2013",
    border: "1px solid #4A3820", borderRadius: 20, padding: "3px 10px",
  },

  timelineStrip: { display: "flex", alignItems: "center", overflowX: "auto", padding: "6px 2px 18px" },
  phaseNode: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", minWidth: 140, opacity: 0.75 },
  phaseNodeActive: { opacity: 1 },
  phaseNodeCircle: (pct, color) => ({
    width: 44, height: 44, borderRadius: "50%", border: `2px solid ${color}`,
    display: "flex", alignItems: "center", justifyContent: "center", color,
    fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
  }),
  phaseNodeLabel: { fontSize: 12.5, textAlign: "center", fontWeight: 600, fontFamily: FONT_DISPLAY },
  timelineConnector: { flex: 1, height: 2, background: "#232D33", minWidth: 30 },

  phaseDetail: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, padding: 22, marginTop: 6 },
  phaseDetailHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  h3: { fontFamily: FONT_BRAND_DISPLAY, fontSize: 16, margin: 0, fontWeight: 600, color: OVERVIEW_LIGHT.textPrimary },
  h2: { fontFamily: FONT_BRAND_DISPLAY, fontSize: 19, margin: "14px 0 6px", fontWeight: 600, color: "#FFFFFF" },
  select: {
    background: "#1C242A", color: "#E8EDEF", border: "1px solid #2A3339", borderRadius: 8,
    padding: "7px 10px", fontSize: 12.5, fontFamily: FONT_BODY,
  },
  dateRow: { display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18 },
  dateField: { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, color: "#7A8A93" },
  input: {
    background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 8,
    padding: "8px 10px", fontSize: 13, fontFamily: FONT_MONO,
  },
  staticValue: { fontFamily: FONT_MONO, fontSize: 13, color: OVERVIEW_LIGHT.textPrimary, padding: "8px 0" },
  checklist: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  checkItem: { display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" },
  checkText: { fontSize: 13, color: "#C7D0D4" },
  checkTextDone: { fontSize: 13, color: "#5A6870", textDecoration: "line-through" },
  textarea: {
    width: "100%", minHeight: 60, background: "#1C242A", color: "#E8EDEF",
    border: "1px solid #2A3339", borderRadius: 8, padding: 10, fontSize: 12.5,
    fontFamily: FONT_BODY, resize: "vertical",
  },
  pill: { fontSize: 10, border: "1px solid", borderRadius: 20, padding: "2px 8px", fontFamily: FONT_MONO },

  enerHeadRow: { display: "flex", alignItems: "flex-end", gap: 24, flexWrap: "wrap" },
  dayCounter: { fontFamily: FONT_MONO, fontSize: 13, color: "#FFFFFF", paddingBottom: 4 },
  legend: { display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, marginLeft: "auto", paddingBottom: 6 },
  legendItem: { fontFamily: FONT_BRAND_BODY },
  wbsGroup: { marginTop: 22, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 12, padding: "16px 18px" },
  wbsGroupHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 },
  wbsGroupTitle: { display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_BRAND_DISPLAY, fontSize: 13.5, fontWeight: 600, color: OVERVIEW_LIGHT.textPrimary },
  wbsDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  wbsGroupMeta: { display: "flex", alignItems: "center", gap: 10 },
  wbsCost: { fontFamily: FONT_MONO, fontSize: 11, color: OVERVIEW_LIGHT.textSecondary },
  wbsPct: { fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700 },
  wbsBarTrack: { height: 4, background: "#E3E9E6", borderRadius: 4, overflow: "hidden", marginBottom: 12 },
  wbsBarFill: { height: "100%", borderRadius: 4 },
  wbsItems: { display: "flex", flexDirection: "column", gap: 2 },
  wbsItemRow: {
    display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
    borderLeft: "2.5px solid", borderRadius: 4,
  },
  wbsCheck: { background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" },
  wbsItemTitle: { flex: 1, fontSize: 12.5, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY },
  wbsItemTitleDone: { flex: 1, fontSize: 12.5, color: "#8FA39B", textDecoration: "line-through", fontFamily: FONT_BRAND_BODY },
  wbsItemDay: { fontFamily: FONT_MONO, fontSize: 10.5, color: OVERVIEW_LIGHT.textSecondary, width: 52, textAlign: "right" },
  wbsItemCost: { fontFamily: FONT_MONO, fontSize: 10.5, color: OVERVIEW_LIGHT.textSecondary, width: 26, textAlign: "right" },
  wbsItemDate: { fontFamily: FONT_MONO, fontSize: 10.5, color: "#5FBF8F", width: 74, textAlign: "right" },
  wbsItemDatePlaceholder: { fontFamily: FONT_MONO, fontSize: 10.5, color: "#B8C4BF", width: 74, textAlign: "right" },


  modalOverlay: {
    position: "fixed", inset: 0, background: "#00000090", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 50,
  },
  modal: { background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 14, padding: 24, width: "min(360px, calc(100vw - 32px))" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  iconBtn: { background: "none", border: "none", color: OVERVIEW_LIGHT.textSecondary, cursor: "pointer" },
  modalField: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: OVERVIEW_LIGHT.textSecondary, marginBottom: 14, fontFamily: FONT_BRAND_BODY },
  confirmMsg: { fontSize: 13, color: OVERVIEW_LIGHT.textPrimary, lineHeight: 1.5, margin: "0 0 18px", fontFamily: FONT_BRAND_BODY },
  confirmBtnRow: { display: "flex", gap: 8, justifyContent: "flex-end" },
  confirmCancelBtn: {
    background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary, borderRadius: 8,
    padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: FONT_BRAND_BODY,
  },
  confirmDangerBtn: {
    background: "#E2604F", border: "none", color: "#fff", borderRadius: 8,
    padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: FONT_BRAND_BODY, fontWeight: 600,
  },
  exportOptionList: { display: "flex", flexDirection: "column", gap: 8 },
  exportOptionBtn: {
    background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary, borderRadius: 8,
    padding: "12px 14px", fontSize: 13, cursor: "pointer", fontFamily: FONT_BRAND_BODY, fontWeight: 500,
    textAlign: "left",
  },

  emptyState: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    height: "100%", textAlign: "center", padding: 40, gap: 4, background: BRAND_DARK,
  },
  emptyP: { color: "#DCEAE4", fontSize: 13.5, maxWidth: 320, margin: "0 0 14px", fontFamily: FONT_BRAND_BODY },

  saveError: {
    position: "fixed", bottom: 20, right: 20, background: "#2E1520", border: "1px solid #E2604F",
    color: "#E8EDEF", padding: "10px 14px", borderRadius: 8, fontSize: 12.5, display: "flex",
    alignItems: "center", gap: 10, maxWidth: 320,
  },
  saveErrorClose: { background: "none", border: "none", color: "#E8EDEF", cursor: "pointer" },

  // Sidebar overview nav
  overviewNavBtn: {
    display: "flex", alignItems: "center", gap: 8, background: BRAND_LIGHT, border: "1px solid #8FBBAC",
    color: "#1F332C", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, cursor: "pointer",
    fontFamily: FONT_BRAND_BODY, fontWeight: 500,
  },
  overviewNavBtnActive: { borderColor: OVERVIEW_LIGHT.card, background: OVERVIEW_LIGHT.card, color: OVERVIEW_LIGHT.textPrimary, fontWeight: 700 },
  footerBtnFull: {
    width: "100%", background: BRAND_LIGHT, border: "1px solid #8FBBAC", color: "#1F332C", borderRadius: 8,
    padding: "8px 6px", fontSize: 11, cursor: "pointer", fontFamily: FONT_BRAND_BODY,
  },
  footerToggleBtn: {
    width: "100%", display: "flex", alignItems: "center", gap: 6, background: "none",
    border: "1px solid #8FBBAC", color: "#DCEAE4", borderRadius: 8,
    padding: "8px 10px", fontSize: 11.5, cursor: "pointer", fontFamily: FONT_BRAND_BODY, fontWeight: 500,
  },
  footerToggleBtnActive: { background: OVERVIEW_LIGHT.card, borderColor: OVERVIEW_LIGHT.card, color: OVERVIEW_LIGHT.textPrimary, fontWeight: 700 },

  // Overview / Resumen general screen
  overviewHeader: {
    padding: "22px 32px 14px", borderBottom: "1px solid #1E282E",
    display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12,
  },
  overviewStatRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 },
  overviewStat: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, padding: "16px 18px" },
  overviewStatNum: { fontFamily: FONT_MONO, fontSize: 26, fontWeight: 700, color: "#E8EDEF" },
  overviewStatLabel: { fontSize: 11.5, color: "#7A8A93", marginTop: 4 },
  overviewTableWrap: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, overflow: "hidden" },
  overviewTable: { width: "100%", borderCollapse: "collapse" },
  ovTh: {
    textAlign: "left", padding: "10px 16px", fontSize: 11, color: "#7A8A93", fontWeight: 600,
    borderBottom: "1px solid #232D33", textTransform: "uppercase", letterSpacing: 0.3,
  },
  ovTd: { padding: "10px 16px", fontSize: 12.5, color: "#C7D0D4", borderBottom: "1px solid #1E282E", verticalAlign: "middle" },
  ovTdName: { padding: "10px 16px", borderBottom: "1px solid #1E282E", verticalAlign: "middle" },
  ovTdMeta: { fontSize: 10.5, color: "#7A8A93", fontFamily: FONT_MONO, marginTop: 2 },
  ovRow: { cursor: "pointer" },
  ovBarWrap: { display: "flex", alignItems: "center", gap: 8, minWidth: 140 },
  ovBarTrack: { flex: 1, height: 5, background: "#232D33", borderRadius: 4, overflow: "hidden" },
  ovBarFill: { height: "100%", borderRadius: 4 },
  ovBarPct: { fontFamily: FONT_MONO, fontSize: 11, width: 34, textAlign: "right" },

  // Export / import-text modals
  exportModal: {
    background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 14, padding: 24,
    width: 560, maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column",
  },
  exportHint: { fontSize: 12.5, color: OVERVIEW_LIGHT.textSecondary, lineHeight: 1.5, margin: "0 0 14px", fontFamily: FONT_BRAND_BODY },
  copyBtn: {
    display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start", background: OVERVIEW_LIGHT.card,
    border: `1px solid ${OVERVIEW_LIGHT.border}`, color: OVERVIEW_LIGHT.textPrimary, borderRadius: 8, padding: "8px 14px",
    fontSize: 12.5, cursor: "pointer", fontFamily: FONT_BRAND_BODY, fontWeight: 500, marginBottom: 12,
  },
  exportTextarea: {
    width: "100%", flex: 1, minHeight: 260, background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary,
    border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 8, padding: 12, fontSize: 11, fontFamily: FONT_MONO,
    resize: "vertical",
  },
  importError: { color: "#E2604F", fontSize: 12, marginTop: 8 },

  // Cronograma module
  cronoHead: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 10px", flexWrap: "wrap", gap: 8 },
  pesoTotalTag: { fontFamily: FONT_MONO, fontSize: 11.5, color: "#7A8A93" },
  cronoTableWrap: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, overflow: "auto", marginBottom: 8 },
  cronoComputedDate: {
    fontFamily: FONT_MONO, fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary, padding: "0 6px", display: "inline-block", cursor: "default",
  },
  miniInput: {
    width: "100%", background: "#FFFFFF", color: OVERVIEW_LIGHT.textPrimary, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 6,
    padding: "5px 8px", fontSize: 11.5, fontFamily: FONT_BRAND_BODY,
  },
  addRowBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_DARK, color: "#FFFFFF",
    border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer",
  },
  rowDeleteBtn: { background: "none", border: "none", color: "#8FA39B", cursor: "pointer", padding: 4 },
  chartBox: { background: "#171E23", border: "1px solid #232D33", borderRadius: 12, padding: "16px 8px 4px", marginBottom: 18 },
  attachBtn: {
    display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: `1px solid ${OVERVIEW_LIGHT.border}`,
    borderRadius: 6, color: OVERVIEW_LIGHT.textSecondary, cursor: "pointer", padding: "3px 6px", fontSize: 10.5, fontFamily: FONT_MONO,
  },
  attachPopover: {
    position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, background: "#FFFFFF",
    border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 10, padding: 10, width: 260, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  },
  attachRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "5px 2px",
    borderBottom: `1px solid ${OVERVIEW_LIGHT.border}`, fontSize: 11.5, color: OVERVIEW_LIGHT.textPrimary,
  },

  // Selector de ítem de presupuesto con buscador (PresupuestoItemSelect)
  presItemSelectMenu: {
    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40,
    background: "#FFFFFF", border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 8,
    maxHeight: 280, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  },
  presItemSelectGroupLabel: {
    padding: "6px 10px", fontSize: 10.5, fontWeight: 700, color: OVERVIEW_LIGHT.textSecondary,
    background: "#F2F6F4", textTransform: "uppercase", letterSpacing: 0.3, fontFamily: FONT_BRAND_BODY,
  },
  presItemSelectRow: {
    padding: "7px 12px", fontSize: 12, color: OVERVIEW_LIGHT.textPrimary, cursor: "pointer",
    fontFamily: FONT_BRAND_BODY,
  },

  // Presupuesto module
  presSubTabs: { display: "flex", gap: 4, marginBottom: 0 },
  presSubTabBtn: {
    background: "#171E23", border: "1px solid #232D33", color: "#7A8A93", borderRadius: 8,
    padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 500,
  },
  presSubTabBtnActive: { borderColor: "#F5B942", background: "#1C1A14", color: "#E8EDEF" },
  presGroupRow: {
    padding: "8px 16px", fontSize: 11.5, fontWeight: 700, color: "#1F332C", background: BRAND_LIGHT,
    borderBottom: `1px solid ${OVERVIEW_LIGHT.border}`, textTransform: "uppercase", letterSpacing: 0.3,
  },
  presExcedidoTag: { color: "#E2604F", fontSize: 10, fontWeight: 700, textTransform: "none", letterSpacing: 0 },
  presReadonlyText: {
    display: "inline-block", padding: "5px 8px", fontSize: 11.5, fontFamily: FONT_BODY, color: "#C7D1D6",
  },
  pasteBtnRow: { display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 },
  pasteBtn: {
    display: "flex", alignItems: "center", gap: 6, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`,
    color: OVERVIEW_LIGHT.textPrimary, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer",
    fontFamily: FONT_BRAND_BODY, fontWeight: 500,
  },
  pastePreview: {
    fontSize: 12.5, color: OVERVIEW_LIGHT.textPrimary, lineHeight: 1.5, background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`,
    borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontFamily: FONT_BRAND_BODY,
  },

  // UPME step timeline
  upmeStepList: { display: "flex", flexDirection: "column", gap: 10 },
  upmeStepCard: { background: OVERVIEW_LIGHT.card, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 12, padding: "14px 16px" },
  upmeStepCardSkipped: { opacity: 0.7 },
  upmeStepHead: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  upmeStepNum: {
    width: 30, height: 30, borderRadius: "50%", border: "1.5px solid", display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: FONT_MONO, flexShrink: 0,
  },
  upmeStepLabel: { fontSize: 13.5, color: OVERVIEW_LIGHT.textPrimary, fontWeight: 500, fontFamily: FONT_BRAND_BODY },
  upmeSkippedTag: { fontSize: 10.5, color: "#8FA39B", marginTop: 2, fontFamily: FONT_BRAND_BODY },
  upmeCheckToggle: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: OVERVIEW_LIGHT.textSecondary, cursor: "pointer", fontFamily: FONT_BRAND_BODY },
  upmeStepBody: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12, paddingLeft: 42 },
  upmeDecisionBox: {
    display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: OVERVIEW_LIGHT.textPrimary, fontFamily: FONT_BRAND_BODY,
    background: BRAND_LIGHT, border: `1px solid ${OVERVIEW_LIGHT.border}`, borderRadius: 8, padding: "8px 12px",
  },
  pagosAlertBox: {
    background: "#171E23", border: "1px solid #E8A33D55", borderRadius: 12, padding: "14px 18px", marginBottom: 18,
  },
  readonlyBanner: {
    display: "flex", alignItems: "center", gap: 8, margin: "0 32px", padding: "8px 14px",
    background: "#1C242A", border: "1px solid #2A3339", borderRadius: 8, color: "#7A8A93", fontSize: 12,
  },
};
