export const TAB_LABELS = {
  resumen: "Resumen", upme: "UPME", energizacion: "Energización",
  cronograma: "Cronograma", presupuesto: "Presupuesto", pagos: "Pagos", balance: "Balance financiero",
};

// Qué casilla de "cargos" controla la edición de cada pestaña (resumen no tiene, es solo dashboard).
export const TAB_PERM_KEY = {
  upme: "puede_editar_upme",
  energizacion: "puede_editar_energizacion",
  cronograma: "puede_editar_cronograma",
  presupuesto: "puede_editar_presupuesto",
  pagos: "puede_editar_pagos",
  balance: "puede_editar_balance",
};

export const CARGO_PERMISOS = [
  { key: "puede_editar_upme", label: "Editar UPME" },
  { key: "puede_editar_energizacion", label: "Editar Energización" },
  { key: "puede_editar_cronograma", label: "Editar Cronograma" },
  { key: "puede_editar_presupuesto", label: "Editar Presupuesto" },
  { key: "puede_editar_pagos", label: "Editar Pagos" },
  { key: "puede_aprobar_pagos", label: "Aprobar pagos" },
  { key: "puede_editar_balance", label: "Editar Balance financiero" },
  { key: "puede_eliminar_proyectos", label: "Eliminar proyectos" },
  { key: "puede_gestionar_usuarios", label: "Gestionar cargos y usuarios" },
];

// Agrupa los permisos por tema (en vez de un solo bloque de 9 casillas) para que un cargo
// expandido se pueda leer de un vistazo en vez de sentirse como un muro de checkboxes.
export const CARGO_PERMISO_GROUPS = [
  { title: "Módulos", keys: ["puede_editar_upme", "puede_editar_energizacion", "puede_editar_cronograma", "puede_editar_presupuesto"] },
  { title: "Pagos", keys: ["puede_editar_pagos", "puede_aprobar_pagos"] },
  { title: "Administración", keys: ["puede_editar_balance", "puede_eliminar_proyectos", "puede_gestionar_usuarios"] },
];
