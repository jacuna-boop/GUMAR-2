// Piloto de tema claro (identidad corporativa GUMAR) para "Resumen general" — ver
// C:\Users\disen\.claude\plans\sparkling-kindling-book.md para el porqué de este alcance.
// Los hex de marca (BRAND_DARK/BRAND_LIGHT) vienen del manual de identidad corporativa; el resto
// de OVERVIEW_LIGHT son tonos neutros derivados razonables. Deliberadamente NO se toca el objeto
// `styles` compartido — estos overrides solo aplican dentro de esta vista, spreadeados encima de
// styles.card/etc. en los sitios donde se usan, así ninguna otra pestaña se ve afectada.
export const BRAND_DARK = "#6B8E89";

export const BRAND_LIGHT = "#A9D3C4";

export const OFF_WHITE = "#F2F6F4"; // blanco suave (no puro #FFFFFF), con un toque del verde de marca
export const OVERVIEW_LIGHT = {
  page: BRAND_DARK,  // fondo general: verde oscuro
  card: OFF_WHITE,   // tarjetas/superficies: blanco suave (antes verde claro)
  border: "#8FBBAC",
  barTrack: "#E3E9E6", // fondo de las barras de progreso (gris neutro, no verde saturado)
  textPrimary: "#22312D",   // texto sobre tarjetas (verde claro)
  textSecondary: "#3E5850", // texto secundario sobre tarjetas (verde claro)
  pageTextPrimary: "#FFFFFF",   // texto directo sobre el fondo (verde oscuro)
  pageTextSecondary: "#DCEAE4", // texto secundario directo sobre el fondo (verde oscuro)
};

export const FONT_BRAND_DISPLAY = "'Montserrat', 'Segoe UI', sans-serif";

export const FONT_BRAND_BODY = "'Lato', 'Segoe UI', sans-serif";

/* ---------------------------------------------------------------------
   Styles
--------------------------------------------------------------------- */
export const FONT_DISPLAY = "'Space Grotesk', 'Segoe UI', sans-serif";

export const FONT_BODY = "'Inter', 'Segoe UI', sans-serif";

export const FONT_MONO = "'JetBrains Mono', 'SFMono-Regular', monospace";
