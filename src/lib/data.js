/*
 * Datos y funciones puras compartidas por toda la app.
 * Migrado desde el artifact original de Claude — misma lógica de negocio,
 * ahora reutilizable en un proyecto Vite normal.
 */

const UPME_STEPS = [
  { id: "s1", num: 1, label: "Proyecto creado en la UPME" },
  { id: "s2", num: 2, label: "Consecución de fichas técnicas y certificados" },
  { id: "s3", num: 3, label: "Diligenciamiento de información en la plataforma" },
  { id: "s4", num: 4, label: "Pago de tarifa" },
  { id: "s5", num: 5, label: "Radicado" },
  {
    id: "s6",
    num: 6,
    label: "Revisión por parte de la UPME",
    decision: { question: "¿Cumplió con la primera revisión de la UPME?", ifSiSkipTo: "s9", ifNoGoTo: "s7" },
  },
  { id: "s7", num: 7, label: "Comentarios emitidos por la UPME (primera versión)", skipIf: (u) => u.steps.s6?.decision === "si" },
  { id: "s8", num: 8, label: "Subsanación de comentarios emitidos", skipIf: (u) => u.steps.s6?.decision === "si" },
  {
    id: "s9",
    num: 9,
    label: "Verificación de documentación inicial e inicio de revisión del componente técnico",
    decision: { question: "¿Hay comentarios para subsanar?", ifNoSkipTo: "s12", ifSiGoTo: "s10" },
  },
  { id: "s10", num: 10, label: "Emisión de comentarios por parte de la UPME", skipIf: (u) => u.steps.s9?.decision === "no" },
  { id: "s11", num: 11, label: "Subsanación de comentarios", skipIf: (u) => u.steps.s9?.decision === "no" },
  { id: "s12", num: 12, label: "Emisión de certificado" },
];

/* ---------------------------------------------------------------------
   DATA: Actividades de energización con costo (Curva S — 4_CURVA_S_ENERGIZACION)
   'day' = día calendario desde el inicio del proyecto (día 0 = contratación inicial)
   'cost' = peso de la actividad en la curva S (unidades relativas, total = 655)
--------------------------------------------------------------------- */
const ENERGIZACION_GROUPS = [
  { id: "or", label: "Trámites ante el Operador de Red (OR)", cat: "OR", items: [
    { title: "Aprobación del punto de conexión", day: 0, cost: 10 },
    { title: "Solicitud de prórroga", day: 5, cost: 5 },
    { title: "Respuesta de prórroga", day: 5, cost: 10 },
    { title: "Solicitud de visita a punto de conexión", day: 6, cost: 5 },
    { title: "Visita para viabilidad de línea punto de conexión", day: 15, cost: 5 },
    { title: "Radicación de línea ante el OR", day: 71, cost: 5 },
    { title: "Aprobación de línea por parte del OR", day: 112, cost: 10 },
    { title: "Correo del OR con factura de seguimiento (revisión de materiales)", day: 112, cost: 0 },
    { title: "Envío soporte de pago + factura de materiales + solicitud de visita", day: 112, cost: 0 },
    { title: "Visita revisión de materiales", day: 118, cost: 5 },
    { title: "Correo al OR: solicitud descargo de obras previas", day: 118, cost: 5 },
    { title: "Respuesta con fecha de descargo", day: 125, cost: 10 },
    { title: "Descargo de obras previas", day: 131, cost: 10 },
    { title: "Solicitud de descargo final", day: 132, cost: 5 },
    { title: "Visita recepción de proyecto", day: 154, cost: 10 },
    { title: "Descargo energización del proyecto", day: 167, cost: 30 },
    { title: "Programación de visita de protecciones", day: 154, cost: 5 },
    { title: "Visita revisión de protecciones", day: 167, cost: 30 },
  ]},
  { id: "c91", label: "Carta 9.1 · Registro de proyecto en el MDC", cat: "Carta", items: [
    { title: "Solicitud firma Carta 9.1 al OR", day: 21, cost: 5 },
    { title: "Respuesta Carta 9.1 firmada", day: 41, cost: 10 },
    { title: "Correo a XM (crear proyecto en MDC) + envío Carta 9.1", day: 41, cost: 5 },
    { title: "Respuesta: proyecto registrado en MDC", day: 47, cost: 20 },
  ]},
  { id: "c97", label: "Carta 9.7 · Certificado de conexión", cat: "Carta", items: [
    { title: "Enviar formato certificación de conexión y capacidad para firma", day: 21, cost: 5 },
    { title: "Carta 9.7 firmada por el OR", day: 41, cost: 5 },
    { title: "Carga Carta 9.7 a MDC", day: 47, cost: 5 },
    { title: "Carta 9.7 aprobada", day: 54, cost: 10 },
  ]},
  { id: "c95", label: "Carta 9.5 · Disponibilidad de activos", cat: "Carta", items: [
    { title: "Diligenciar formato indisponibilidades excluidas + enviar al OR", day: 41, cost: 5 },
    { title: "Respuesta: firma Carta 9.5 por el OR", day: 54, cost: 5 },
    { title: "Cargar Carta 9.5 en el MDC", day: 54, cost: 5 },
    { title: "Aprobación Carta 9.5 por XM", day: 63, cost: 10 },
  ]},
  { id: "c92", label: "Carta 9.2 · Representante de frontera (RF)", cat: "Carta", items: [
    { title: "Contratación RF y centro de gestión de medida", day: 0, cost: 5 },
    { title: "Solicitar firma al RF de la Carta 9.2", day: 47, cost: 5 },
    { title: "Carta 9.2 firmada", day: 50, cost: 5 },
    { title: "Cargar Carta 9.2 en el MDC", day: 50, cost: 5 },
    { title: "Aprobación Carta 9.2 por XM", day: 54, cost: 5 },
  ]},
  { id: "c93", label: "Carta 9.3 · Datos de RF y medida", cat: "Carta", items: [
    { title: "Diligenciar formato de parámetros técnicos y cargar en MDC", day: 50, cost: 5 },
    { title: "Aprobación Carta 9.3 por XM", day: 54, cost: 5 },
  ]},
  { id: "c96", label: "Carta 9.6 · Código de frontera", cat: "Carta", items: [
    { title: "Compra de medidores, TC, TP, gabinete y cable de control", day: 116, cost: 10 },
    { title: "Contratación tercero verificador (Negawatt)", day: 0, cost: 5 },
    { title: "Llegada de medidores parametrizados", day: 158, cost: 10 },
    { title: "Enviar información CREG 038 al tercero verificador", day: 160, cost: 10 },
    { title: "Certificado de frontera — respuesta del tercero verificador", day: 166, cost: 10 },
    { title: "Cargar en el MDC certificado de frontera", day: 167, cost: 5 },
    { title: "Aprobación Carta 9.6", day: 170, cost: 10 },
  ]},
  { id: "c94", label: "Carta 9.4 · Cumplimiento de protecciones", cat: "Carta", items: [
    { title: "Emisión de acta del OR", day: 170, cost: 20 },
    { title: "Enviar Carta 9.4 al OR para firma", day: 170, cost: 5 },
    { title: "Carta 9.4 firmada OR (FPO)", day: 184, cost: 30 },
    { title: "Cargar Carta 9.4 en MDC", day: 184, cost: 5 },
    { title: "Aprobación de Carta 9.4", day: 188, cost: 10 },
  ]},
  { id: "c98", label: "Carta 9.8 · Declaración del programa de generación", cat: "Carta", items: [
    { title: "Enviar aprobación de Carta 9.4 al RF", day: 188, cost: 5 },
    { title: "RF envía acta al promotor", day: 189, cost: 5 },
    { title: "Carga de acta (Carta 9.8) en MDC", day: 189, cost: 5 },
    { title: "Aprobación Carta 9.8", day: 195, cost: 5 },
  ]},
  { id: "c99", label: "Carta 9.9 · Cumplimiento de reglamentación vigente", cat: "Carta", items: [
    { title: "Enviar documento Carta 9.9 al OR", day: 195, cost: 5 },
    { title: "Carta 9.9 firmada por el OR", day: 196, cost: 5 },
    { title: "Carga Carta 9.9 a MDC", day: 196, cost: 5 },
    { title: "Aprobación Carta 9.9", day: 200, cost: 5 },
  ]},
  { id: "c910", label: "Carta 9.10 · Declaración entrada en operación", cat: "Carta", items: [
    { title: "RF envía Carta 9.10 al promotor", day: 195, cost: 5 },
    { title: "Cargar Carta 9.10 al MDC", day: 196, cost: 5 },
    { title: "Aprobación Carta 9.10", day: 200, cost: 10 },
  ]},
  { id: "cod", label: "Declaración COD", cat: "COD", items: [
    { title: "Declaración de puesta en operación (COD)", day: 200, cost: 10 },
  ]},
  { id: "parque", label: "Construcción del parque", cat: "Parque", items: [
    { title: "Definición de equipos principales (Panel, Inversor, Trafo)", day: 12, cost: 5 },
    { title: "Desarrollo de ingeniería", day: 15, cost: 20 },
    { title: "Construcción del parque", day: 81, cost: 30 },
    { title: "Pago certificado RETIE", day: 113, cost: 0 },
    { title: "Visita RETIE", day: 130, cost: 10 },
    { title: "Certificado RETIE", day: 134, cost: 20 },
  ]},
  { id: "linea", label: "Construcción de línea", cat: "Linea", items: [
    { title: "Desarrollo de ingeniería de línea", day: 15, cost: 20 },
    { title: "Construcción de línea MT", day: 119, cost: 30 },
    { title: "Pruebas VLF", day: 131, cost: 10 },
    { title: "Instalación de reconectador", day: 119, cost: 10 },
    { title: "Pruebas reconectador", day: 124, cost: 5 },
    { title: "Informe de pruebas reconectador", day: 128, cost: 10 },
  ]},
];

const ENERGIZACION_MILESTONES = ENERGIZACION_GROUPS.flatMap((g) =>
  g.items.map((it) => ({ ...it, cat: g.cat, group: g.label, groupId: g.id }))
);
const ENERGIZACION_TOTAL_COST = ENERGIZACION_MILESTONES.reduce((s, m) => s + m.cost, 0);

/* ---------------------------------------------------------------------
   Plantilla de presupuesto base (de "presupuesto base.pdf"), para que un proyecto nuevo no
   empiece de cero. Item/Categoría/Descripción/Cantidad/Unidad/Valor unitario tal como en el PDF de
   referencia — el IVA no viene desglosado ahí, así que ivaPct siempre queda en 0 para ajustar
   después. Igual con las celdas que en el PDF venían vacías ("-"): quedan en 0.
   Nota: el PDF original repetía el número "4.7" en dos filas (Instalación de vallado perimetral y
   Despeje y desbroce del suelo) — la segunda se renombró a "4.7b" para no chocar con la primera.
--------------------------------------------------------------------- */
const PRESUPUESTO_BASE_TEMPLATE = [
  // 1. EQUIPOS PRINCIPALES
  { item: "1.1", categoria: "EQUIPOS PRINCIPALES", descripcion: "Paneles fotovoltaicos 710w", cantidad: 2230, unidad: "UND", valorUnitario: 261811 },
  { item: "1.2", categoria: "EQUIPOS PRINCIPALES", descripcion: "Inversor 330kW", cantidad: 3, unidad: "UND", valorUnitario: 31390061 },
  { item: "1.3", categoria: "EQUIPOS PRINCIPALES", descripcion: "Smartlogger Box", cantidad: 1, unidad: "UND", valorUnitario: 2500000 },
  { item: "1.4", categoria: "EQUIPOS PRINCIPALES", descripcion: "Transformador 13,2kV -800V 1250kVA tipo Seco", cantidad: 1, unidad: "UND", valorUnitario: 110760000 },
  { item: "1.5", categoria: "EQUIPOS PRINCIPALES", descripcion: "Estructura metálica", cantidad: 1, unidad: "UND", valorUnitario: 322039490 },
  { item: "1.6", categoria: "EQUIPOS PRINCIPALES", descripcion: "Reconectador trifásico ur=17,5 kv, bil 95 kv", cantidad: 1, unidad: "UND", valorUnitario: 53139400 },
  { item: "1.7", categoria: "EQUIPOS PRINCIPALES", descripcion: "Trafo 1f 0,5 kva para reconectador 15 kv", cantidad: 1, unidad: "UND", valorUnitario: 5805000 },
  { item: "1.8", categoria: "EQUIPOS PRINCIPALES", descripcion: "Tablero principal", cantidad: 1, unidad: "UND", valorUnitario: 70543491 },
  { item: "1.9", categoria: "EQUIPOS PRINCIPALES", descripcion: "Celda Principal", cantidad: 1, unidad: "UND", valorUnitario: 8058824 },

  // 2. ACTIVIDADES PROYECTO RTB
  { item: "2.1", categoria: "ACTIVIDADES PROYECTO RTB", descripcion: "RTB e Ingeniería Detallada y Energización", cantidad: 1, unidad: "UND", valorUnitario: 260000000 },

  // 3. LOGISTICA
  { item: "3.1", categoria: "LOGISTICA", descripcion: "Logística y mantenimiento de terreno", cantidad: 1, unidad: "GLB", valorUnitario: 5000000 },
  { item: "3.2", categoria: "LOGISTICA", descripcion: "Logística de muestras de materiales", cantidad: 10, unidad: "UND", valorUnitario: 100000 },
  { item: "3.3", categoria: "LOGISTICA", descripcion: "Logística de Transporte de Postes a obra", cantidad: 1, unidad: "UND", valorUnitario: 2500000 },
  { item: "3.4", categoria: "LOGISTICA", descripcion: "Logística descargue de Transformador", cantidad: 1, unidad: "UND", valorUnitario: 3500000 },

  // 4. OBRA CIVIL
  { item: "4.1", categoria: "OBRA CIVIL", descripcion: "Compra inicial", cantidad: 1, unidad: "GLB", valorUnitario: 16621400 },
  { item: "4.2", categoria: "OBRA CIVIL", descripcion: "Localización trazado y replanteo de Parque", cantidad: 1, unidad: "GLB", valorUnitario: 3500000 },
  { item: "4.3", categoria: "OBRA CIVIL", descripcion: "Localización trazado y replanteo de Línea", cantidad: 1, unidad: "GLB", valorUnitario: 500000 },
  { item: "4.4", categoria: "OBRA CIVIL", descripcion: "Alquiler de baño portátil", cantidad: 5, unidad: "MES", valorUnitario: 2000000 },
  { item: "4.5", categoria: "OBRA CIVIL", descripcion: "Vía de acceso", cantidad: 1, unidad: "GLB", valorUnitario: 10000000 },
  { item: "4.6", categoria: "OBRA CIVIL", descripcion: "Suministro de Vallado perimetral", cantidad: 520, unidad: "ML", valorUnitario: 104000 },
  { item: "4.7", categoria: "OBRA CIVIL", descripcion: "Instalación de Vallado perimetral", cantidad: 520, unidad: "ML", valorUnitario: 31000 },
  { item: "4.8", categoria: "OBRA CIVIL", descripcion: "Despeje y desbroce del suelo", cantidad: 1, unidad: "GLB", valorUnitario: 5000000 },
  { item: "4.9", categoria: "OBRA CIVIL", descripcion: "Zanjas", cantidad: 0, unidad: "ML", valorUnitario: 0 },
  { item: "4.10", categoria: "OBRA CIVIL", descripcion: "Drenaje", cantidad: 1, unidad: "GLB", valorUnitario: 15000000 },
  { item: "4.11", categoria: "OBRA CIVIL", descripcion: "Cimentación Skid", cantidad: 1, unidad: "GLB", valorUnitario: 0 },
  { item: "4.12", categoria: "OBRA CIVIL", descripcion: "Cimentación de postes de iluminación", cantidad: 9, unidad: "UND", valorUnitario: 0 },
  { item: "4.13", categoria: "OBRA CIVIL", descripcion: "Cimentación de postes de Estación Meteorológica", cantidad: 1, unidad: "UND", valorUnitario: 800000 },
  { item: "4.14", categoria: "OBRA CIVIL", descripcion: "Cimentación de Inversores", cantidad: 3, unidad: "UND", valorUnitario: 600000 },
  { item: "4.15", categoria: "OBRA CIVIL", descripcion: "Registros SPT", cantidad: 2, unidad: "UND", valorUnitario: 850000 },
  { item: "4.16", categoria: "OBRA CIVIL", descripcion: "Registros de BT", cantidad: 15, unidad: "UND", valorUnitario: 850000 },
  { item: "4.17", categoria: "OBRA CIVIL", descripcion: "Registros MT", cantidad: 1, unidad: "UND", valorUnitario: 7000000 },
  { item: "4.18", categoria: "OBRA CIVIL", descripcion: "Registros CCTV", cantidad: 9, unidad: "UND", valorUnitario: 850000 },
  { item: "4.19", categoria: "OBRA CIVIL", descripcion: "Tubería DC", cantidad: 1, unidad: "GBL", valorUnitario: 8000000 },
  { item: "4.20", categoria: "OBRA CIVIL", descripcion: "Tubería AC", cantidad: 1, unidad: "GLB", valorUnitario: 6500000 },
  { item: "4.21", categoria: "OBRA CIVIL", descripcion: "Tubería Comunicación", cantidad: 300, unidad: "MTS", valorUnitario: 3500 },
  { item: "4.22", categoria: "OBRA CIVIL", descripcion: "Tubería MT", cantidad: 1, unidad: "GLB", valorUnitario: 500000 },
  { item: "4.23", categoria: "OBRA CIVIL", descripcion: "Tubería CCTV", cantidad: 500, unidad: "MTS", valorUnitario: 3500 },
  { item: "4.24", categoria: "OBRA CIVIL", descripcion: "Tubería Iluminación", cantidad: 500, unidad: "MTS", valorUnitario: 8000 },
  { item: "4.25", categoria: "OBRA CIVIL", descripcion: "Cinta de protección para zanja", cantidad: 1, unidad: "ROLLOS", valorUnitario: 85000 },
  { item: "4.26", categoria: "OBRA CIVIL", descripcion: "Centro de transformación", cantidad: 1, unidad: "GLB", valorUnitario: 40000000 },
  { item: "4.27", categoria: "OBRA CIVIL", descripcion: "Fundida de hincas con Micropilotes", cantidad: 72, unidad: "UND", valorUnitario: 567479 },
  { item: "4.28", categoria: "OBRA CIVIL", descripcion: "Bodega para almacenamiento", cantidad: 0, unidad: "UND", valorUnitario: 0 },
  { item: "4.29", categoria: "OBRA CIVIL", descripcion: "Nivelación de Terreno", cantidad: 1, unidad: "GLB", valorUnitario: 5000000 },

  // 5. Sistema Puesta Tierra
  { item: "5.1", categoria: "Sistema Puesta Tierra", descripcion: "Malla puesta tierra principal", cantidad: 500, unidad: "ML", valorUnitario: 45000 },
  { item: "5.2", categoria: "Sistema Puesta Tierra", descripcion: "Varilla en cobre, soldadura, moldes y terminales", cantidad: 1, unidad: "GLB", valorUnitario: 2256500 },
  { item: "5.3", categoria: "Sistema Puesta Tierra", descripcion: "Derivaciones Cable Copperclad Aislado", cantidad: 90, unidad: "ML", valorUnitario: 22000 },

  // 6. Material Eléctrico baja tensión - PARQUE
  { item: "6.1", categoria: "Material Eléctrico baja tensión - PARQUE", descripcion: "Cableado solar 6mm", cantidad: 11500, unidad: "ML", valorUnitario: 4200 },
  { item: "6.2", categoria: "Material Eléctrico baja tensión - PARQUE", descripcion: "Conectores MC4", cantidad: 250, unidad: "UND", valorUnitario: 4500 },
  { item: "6.3", categoria: "Material Eléctrico baja tensión - PARQUE", descripcion: "Conductor AC - 300 mm2 XLPE para baja tensión 0,6/1kV", cantidad: 400, unidad: "ML", valorUnitario: 28000 },
  { item: "6.4", categoria: "Material Eléctrico baja tensión - PARQUE", descripcion: "Cableado Comunicaciones entre inversores (incluye conectores)", cantidad: 1, unidad: "ROLLO", valorUnitario: 700000 },
  { item: "6.5", categoria: "Material Eléctrico baja tensión - PARQUE", descripcion: "Cableado Iluminación (Acometidas, Salidas y conectores)", cantidad: 500, unidad: "ML", valorUnitario: 20000 },
  { item: "6.6", categoria: "Material Eléctrico baja tensión - PARQUE", descripcion: "Suministro de Poste metálico de 4 m CCTV e Iluminación", cantidad: 10, unidad: "UND", valorUnitario: 555000 },
  { item: "6.7", categoria: "Material Eléctrico baja tensión - PARQUE", descripcion: "Suministro de tablero de protecciones fusibles DC para inversor", cantidad: 0, unidad: "UND", valorUnitario: 3380000 },
  { item: "6.8", categoria: "Material Eléctrico baja tensión - PARQUE", descripcion: "Suministro de Lámpara (Solar / Convencional)", cantidad: 10, unidad: "UND", valorUnitario: 250000 },
  { item: "6.9", categoria: "Material Eléctrico baja tensión - PARQUE", descripcion: "Estructura para inversores", cantidad: 3, unidad: "UND", valorUnitario: 1300000 },

  // 7. MATERIAL ELÉCTRICO CASETA / BODEGA
  { item: "7.1", categoria: "MATERIAL ELÉCTRICO CASETA / BODEGA", descripcion: "Tablero servicios auxiliares", cantidad: 1, unidad: "UND", valorUnitario: 1000000 },
  { item: "7.2", categoria: "MATERIAL ELÉCTRICO CASETA / BODEGA", descripcion: "Cableado Iluminación (Acometidas, Salidas y conectores)", cantidad: 1, unidad: "UND", valorUnitario: 5000000 },
  { item: "7.3", categoria: "MATERIAL ELÉCTRICO CASETA / BODEGA", descripcion: "Tubería, curvas, soportes, chazos", cantidad: 1, unidad: "GLB", valorUnitario: 3000000 },
  { item: "7.4", categoria: "MATERIAL ELÉCTRICO CASETA / BODEGA", descripcion: "Dispositivos (Luminarias, Tomacorrientes, Suiches)", cantidad: 1, unidad: "GLB", valorUnitario: 1000000 },

  // 8. MATERIAL ELÉCTRICO MEDIA TENSIÓN - SUBTERRANEO
  { item: "8.1", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - SUBTERRANEO", descripcion: "Seccionador", cantidad: 3, unidad: "UND", valorUnitario: 550000 },
  { item: "8.2", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - SUBTERRANEO", descripcion: "Cable aislado de Media Tensión XLPE 1/0 AL, 15 kV", cantidad: 150, unidad: "ML", valorUnitario: 35000 },
  { item: "8.3", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - SUBTERRANEO", descripcion: "Suministro de Juego premoldeados 15 kV tipo interior", cantidad: 1, unidad: "UND", valorUnitario: 660000 },
  { item: "8.4", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - SUBTERRANEO", descripcion: "Suministro de bajantes en 4\" IMC (incluye Capacete, Curvas, Afloramiento)", cantidad: 1, unidad: "UND", valorUnitario: 550000 },

  // 9. MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA
  { item: "9.1", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA", descripcion: "Suministro de postes de concreto", cantidad: 13, unidad: "UND", valorUnitario: 2500000 },
  { item: "9.2", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA", descripcion: "Armado de estructura de postes (Línea y Reconectador)", cantidad: 1, unidad: "GLB", valorUnitario: 40000000 },
  { item: "9.3", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA", descripcion: "Suministro malla SPT", cantidad: 13, unidad: "UND", valorUnitario: 270000 },
  { item: "9.4", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA", descripcion: "Suministro e instalación de Juego premoldeados 15 kV tipo exterior", cantidad: 1, unidad: "UND", valorUnitario: 750000 },
  { item: "9.5", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA", descripcion: "Cable de aluminio desnudo no 123,3 kcmil aaac azusa", cantidad: 3600, unidad: "ML", valorUnitario: 7000 },
  { item: "9.6", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA", descripcion: "Transformador de corriente, 50/5a cl 0.5s 5va, 17,5 kv, uso exterior", cantidad: 3, unidad: "UND", valorUnitario: 3000000 },
  { item: "9.7", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA", descripcion: "Transformador de potencial, relación 13200/raíz(3)/120/raíz(3) cl 0.5 10 va, 17,5 kv", cantidad: 3, unidad: "UND", valorUnitario: 3500000 },
  { item: "9.8", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA", descripcion: "Medidor", cantidad: 2, unidad: "UND", valorUnitario: 1800000 },
  { item: "9.9", categoria: "MATERIAL ELÉCTRICO MEDIA TENSIÓN - LINEA", descripcion: "Modems", cantidad: 2, unidad: "UND", valorUnitario: 2500000 },

  // 10. CONTROL Y MONITOREO
  { item: "10.1", categoria: "CONTROL Y MONITOREO", descripcion: "Estación meteorológica (incluye materiales para la instalación)", cantidad: 1, unidad: "UND", valorUnitario: 3000000 },
  { item: "10.2", categoria: "CONTROL Y MONITOREO", descripcion: "Suministro e instalación de CCTV", cantidad: 1, unidad: "GLB", valorUnitario: 20000000 },
  { item: "10.3", categoria: "CONTROL Y MONITOREO", descripcion: "Servicio Internet", cantidad: 5, unidad: "UND", valorUnitario: 150000 },
  { item: "10.4", categoria: "CONTROL Y MONITOREO", descripcion: "Starlink", cantidad: 1, unidad: "UND", valorUnitario: 1600000 },
  { item: "10.5", categoria: "CONTROL Y MONITOREO", descripcion: "Scada", cantidad: 0, unidad: "UND", valorUnitario: 30000000 },

  // 11. MONTAJE MECÁNICO Y ELÉCTRICO
  { item: "11.1", categoria: "MONTAJE MECÁNICO Y ELÉCTRICO", descripcion: "Montaje electromecánico", cantidad: 1, unidad: "GLB", valorUnitario: 190000000 },
  { item: "11.2", categoria: "MONTAJE MECÁNICO Y ELÉCTRICO", descripcion: "Instalación de Línea de interconexión", cantidad: 1, unidad: "GLB", valorUnitario: 40000000 },
  { item: "11.3", categoria: "MONTAJE MECÁNICO Y ELÉCTRICO", descripcion: "Montaje de equipos de medida (TC, TP, Reconectador)", cantidad: 1, unidad: "GLB", valorUnitario: 10000000 },
  { item: "11.4", categoria: "MONTAJE MECÁNICO Y ELÉCTRICO", descripcion: "Montaje de estructuras (vigas y correas)", cantidad: 1, unidad: "GLB", valorUnitario: 60000000 },

  // 12. PRUEBAS, ENSAYOS Y LABORATORIOS
  { item: "12.1", categoria: "PRUEBAS, ENSAYOS Y LABORATORIOS", descripcion: "Diseño de Mezcla", cantidad: 1, unidad: "UND", valorUnitario: 480000 },
  { item: "12.2", categoria: "PRUEBAS, ENSAYOS Y LABORATORIOS", descripcion: "Ensayos de Concretos", cantidad: 100, unidad: "UND", valorUnitario: 10000 },
  { item: "12.3", categoria: "PRUEBAS, ENSAYOS Y LABORATORIOS", descripcion: "Ensayos de Aceros", cantidad: 1, unidad: "UND", valorUnitario: 2500000 },
  { item: "12.4", categoria: "PRUEBAS, ENSAYOS Y LABORATORIOS", descripcion: "Ensayo de suelo", cantidad: 10, unidad: "UND", valorUnitario: 140000 },
  { item: "12.5", categoria: "PRUEBAS, ENSAYOS Y LABORATORIOS", descripcion: "Prueba de Torque", cantidad: 78, unidad: "UND", valorUnitario: 0 },
  { item: "12.6", categoria: "PRUEBAS, ENSAYOS Y LABORATORIOS", descripcion: "Pruebas (VLF, AC-DC, Transformador, Reconectador, Equipos de Medida)", cantidad: 1, unidad: "GLB", valorUnitario: 15000000 },

  // 13. CERTIFICACIONES Y TRÁMITES
  { item: "13.1", categoria: "CERTIFICACIONES Y TRÁMITES", descripcion: "Certificación RETIE", cantidad: 1, unidad: "GLB", valorUnitario: 10900000 },
  { item: "13.2", categoria: "CERTIFICACIONES Y TRÁMITES", descripcion: "Certificado UPME", cantidad: 1, unidad: "GLB", valorUnitario: 8500000 },
  { item: "13.3", categoria: "CERTIFICACIONES Y TRÁMITES", descripcion: "Certificación de frontera", cantidad: 1, unidad: "GLB", valorUnitario: 7000000 },
  { item: "13.4", categoria: "CERTIFICACIONES Y TRÁMITES", descripcion: "Pólizas", cantidad: 1, unidad: "GLB", valorUnitario: 15000000 },

  // 14. ADMINISTRACIÓN DEL PROYECTO
  { item: "14.1", categoria: "ADMINISTRACIÓN DEL PROYECTO", descripcion: "Costo administrativo OBRA", cantidad: 5, unidad: "MES", valorUnitario: 19000000 },
  { item: "14.2", categoria: "ADMINISTRACIÓN DEL PROYECTO", descripcion: "Costo administrativo ADMIN GUMARP", cantidad: 5, unidad: "MES", valorUnitario: 25500000 },
  { item: "14.3", categoria: "ADMINISTRACIÓN DEL PROYECTO", descripcion: "Costo operativo de obra", cantidad: 4, unidad: "MES", valorUnitario: 16250000 },
  { item: "14.4", categoria: "ADMINISTRACIÓN DEL PROYECTO", descripcion: "Oficina y almacén", cantidad: 1, unidad: "GLB", valorUnitario: 10000000 },
  { item: "14.5", categoria: "ADMINISTRACIÓN DEL PROYECTO", descripcion: "Vigilancia", cantidad: 5, unidad: "MES", valorUnitario: 1800000 },
  { item: "14.6", categoria: "ADMINISTRACIÓN DEL PROYECTO", descripcion: "Arriendo de lote respaldo", cantidad: 0, unidad: "MES", valorUnitario: 300000 },
  { item: "14.7", categoria: "ADMINISTRACIÓN DEL PROYECTO", descripcion: "Limpieza de módulos al finalizar la instalación", cantidad: 1, unidad: "GLB", valorUnitario: 5000000 },
  { item: "14.8", categoria: "ADMINISTRACIÓN DEL PROYECTO", descripcion: "Disposición final de residuos", cantidad: 1, unidad: "GLB", valorUnitario: 1000000 },
  { item: "14.9", categoria: "ADMINISTRACIÓN DEL PROYECTO", descripcion: "Imprevistos", cantidad: 0, unidad: "GLB", valorUnitario: 0 },
];

// Construye el presupuesto "base" inicial de un proyecto nuevo a partir de PRESUPUESTO_BASE_TEMPLATE,
// con ids frescos. "Ejecución" arranca con los mismos valores de "base" (no en $0) para que solo
// haga falta corregir lo que cambió en la obra real, en vez de digitar cada ítem dos veces.
function buildPresupuestoBaseFromTemplate() {
  const base = [];
  const ejecucion = [];
  PRESUPUESTO_BASE_TEMPLATE.forEach((t) => {
    const id = uid();
    base.push({ id, item: t.item, categoria: t.categoria, descripcion: t.descripcion, cantidad: t.cantidad, unidad: t.unidad, valorUnitario: t.valorUnitario, ivaPct: 0 });
    ejecucion.push({ id, item: t.item, categoria: t.categoria, descripcion: t.descripcion, cantidad: t.cantidad, unidad: t.unidad, valorUnitario: t.valorUnitario, ivaPct: 0, tocado: false });
  });
  return { base, ejecucion };
}

/* ---------------------------------------------------------------------
   Plantilla de cronograma base (de "260420 - 1. CRONOGRAMA GD GARZA V1.1.pdf"), para que un
   proyecto nuevo no empiece de cero. displayId conserva el Id original de MS Project (con huecos,
   arranca en 2) porque las predecesoras lo referencian por ese número. predecesoras queda como
   texto tal como en el PDF (ej. "116FC+20 días", "91FC-5 días;56FF") — todavía no se usa para
   recalcular fechas automáticamente, ver nota de "amarrar predecesoras" pendiente.
--------------------------------------------------------------------- */
const CRONOGRAMA_BASE_TEMPLATE = [
  { displayId: "2", nombre: "Aprobación de Punto de conexión", duracionTexto: "0 días", fechaInicio: "2025-11-04", fechaFin: "2025-11-04", predecesoras: "", esGrupo: false },
  { displayId: "3", nombre: "PROCURA EQUIPOS PRINCIPALES", duracionTexto: "68 días", fechaInicio: "2026-01-20", fechaFin: "2026-04-21", predecesoras: "", esGrupo: true },
  { displayId: "4", nombre: "Paneles fotovoltaicos (Anticipo 2.5%)", duracionTexto: "0 días", fechaInicio: "2026-01-26", fechaFin: "2026-01-26", predecesoras: "116", esGrupo: false },
  { displayId: "5", nombre: "Paneles fotovoltaicos (Saldo 97.5%)", duracionTexto: "0 días", fechaInicio: "2026-03-25", fechaFin: "2026-03-25", predecesoras: "4FC+43 días", esGrupo: false },
  { displayId: "6", nombre: "Inversor Canadian Solar 330kW (Anticipo 50%)", duracionTexto: "0 días", fechaInicio: "2026-02-23", fechaFin: "2026-02-23", predecesoras: "116FC+20 días", esGrupo: false },
  { displayId: "7", nombre: "Inversor Canadian Solar 330kW (saldo 50%)", duracionTexto: "0 días", fechaInicio: "2026-03-19", fechaFin: "2026-03-19", predecesoras: "6FC+20 días", esGrupo: false },
  { displayId: "8", nombre: "Smartlogger Box", duracionTexto: "0 días", fechaInicio: "2026-02-23", fechaFin: "2026-02-23", predecesoras: "6CC", esGrupo: false },
  { displayId: "9", nombre: "TRAFO 13.2K (Anticipo 50%)", duracionTexto: "0 días", fechaInicio: "2026-02-23", fechaFin: "2026-02-23", predecesoras: "116FC+20 días", esGrupo: false },
  { displayId: "10", nombre: "TRAFO 13.2K (Saldo 50%)", duracionTexto: "0 días", fechaInicio: "2026-04-21", fechaFin: "2026-04-21", predecesoras: "9FC+43 días", esGrupo: false },
  { displayId: "11", nombre: "Estructura metálica (Anticipo 50%)", duracionTexto: "0 días", fechaInicio: "2026-01-20", fechaFin: "2026-01-20", predecesoras: "116FC-5 días", esGrupo: false },
  { displayId: "12", nombre: "Estructura metálica (Saldo 50%)", duracionTexto: "0 días", fechaInicio: "2026-03-13", fechaFin: "2026-03-13", predecesoras: "11FC+40 días", esGrupo: false },
  { displayId: "13", nombre: "Reconectador trifásico ur=17,5 kv, bil 95 kv", duracionTexto: "0 días", fechaInicio: "2026-04-15", fechaFin: "2026-04-15", predecesoras: "116FC+58 días", esGrupo: false },
  { displayId: "14", nombre: "Trafo 1f 0,5 kva para reconectador 15 kv", duracionTexto: "0 días", fechaInicio: "2026-04-15", fechaFin: "2026-04-15", predecesoras: "13FF", esGrupo: false },
  { displayId: "15", nombre: "ACTIVIDADES PARA PROYECTO RTB", duracionTexto: "68 días", fechaInicio: "2026-01-13", fechaFin: "2026-04-15", predecesoras: "", esGrupo: true },
  { displayId: "16", nombre: "RTB e Ingeniería Detallada (anticipo 15%)", duracionTexto: "0 días", fechaInicio: "2026-01-13", fechaFin: "2026-01-13", predecesoras: "2FC+51 días", esGrupo: false },
  { displayId: "17", nombre: "RTB e Ingeniería Detallada (anticipo 15%)", duracionTexto: "0 días", fechaInicio: "2026-02-13", fechaFin: "2026-02-13", predecesoras: "16FC+25 días", esGrupo: false },
  { displayId: "18", nombre: "RTB e Ingeniería Detallada (Saldo 40%)", duracionTexto: "0 días", fechaInicio: "2026-03-13", fechaFin: "2026-03-13", predecesoras: "17FC+20 días", esGrupo: false },
  { displayId: "19", nombre: "RTB e Ingeniería Detallada (Saldo 30%)", duracionTexto: "0 días", fechaInicio: "2026-04-15", fechaFin: "2026-04-15", predecesoras: "18FC+23 días", esGrupo: false },
  { displayId: "20", nombre: "LOGISTICA", duracionTexto: "65 días", fechaInicio: "2026-01-24", fechaFin: "2026-04-22", predecesoras: "", esGrupo: true },
  { displayId: "21", nombre: "Logística de descargue de Transformador", duracionTexto: "0 días", fechaInicio: "2026-04-22", fechaFin: "2026-04-22", predecesoras: "10FF+1 día", esGrupo: false },
  { displayId: "22", nombre: "Logística de Transporte de Postes a obra", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "76", esGrupo: false },
  { displayId: "23", nombre: "Logística de Transporte de paneles a obra", duracionTexto: "0 días", fechaInicio: "2026-04-01", fechaFin: "2026-04-01", predecesoras: "5FC+6 días", esGrupo: false },
  { displayId: "24", nombre: "Logística de descargue de paneles en obra", duracionTexto: "0 días", fechaInicio: "2026-04-06", fechaFin: "2026-04-06", predecesoras: "23FC+2 días", esGrupo: false },
  { displayId: "25", nombre: "Logística y mantenimiento de terreno", duracionTexto: "0 días", fechaInicio: "2026-01-24", fechaFin: "2026-01-24", predecesoras: "2FC+60 días", esGrupo: false },
  { displayId: "26", nombre: "Logística de muestras de materiales", duracionTexto: "0 días", fechaInicio: "2026-02-04", fechaFin: "2026-02-04", predecesoras: "103CC", esGrupo: false },
  { displayId: "27", nombre: "OBRA CIVIL", duracionTexto: "92 días", fechaInicio: "2026-01-23", fechaFin: "2026-05-27", predecesoras: "", esGrupo: true },
  { displayId: "28", nombre: "Compra inicial", duracionTexto: "0 días", fechaInicio: "2026-01-23", fechaFin: "2026-01-23", predecesoras: "116CC-2 días", esGrupo: false },
  { displayId: "29", nombre: "Localización trazado y replanteo de Parque", duracionTexto: "3 días", fechaInicio: "2026-01-23", fechaFin: "2026-01-27", predecesoras: "28", esGrupo: false },
  { displayId: "30", nombre: "Localización trazado y replanteo de Línea", duracionTexto: "1 día", fechaInicio: "2026-01-27", fechaFin: "2026-01-28", predecesoras: "29", esGrupo: false },
  { displayId: "31", nombre: "Alquiler de baños portátiles", duracionTexto: "87 días", fechaInicio: "2026-01-29", fechaFin: "2026-05-27", predecesoras: "28FC+5 días", esGrupo: false },
  { displayId: "32", nombre: "Vía de acceso", duracionTexto: "3 días", fechaInicio: "2026-01-27", fechaFin: "2026-01-30", predecesoras: "29", esGrupo: false },
  { displayId: "33", nombre: "Vallado perimetral", duracionTexto: "25 días", fechaInicio: "2026-02-13", fechaFin: "2026-03-19", predecesoras: "116FC+15 días", esGrupo: false },
  { displayId: "34", nombre: "Despeje y desbroce del suelo", duracionTexto: "1 día", fechaInicio: "2026-01-26", fechaFin: "2026-01-27", predecesoras: "116", esGrupo: false },
  { displayId: "35", nombre: "Zanjas", duracionTexto: "5 días", fechaInicio: "2026-04-15", fechaFin: "2026-04-21", predecesoras: "34FC+57 días", esGrupo: false },
  { displayId: "36", nombre: "Cimentación de postes de iluminación", duracionTexto: "10 días", fechaInicio: "2026-03-07", fechaFin: "2026-03-19", predecesoras: "116FC+30 días", esGrupo: false },
  { displayId: "37", nombre: "Cimentación de postes de Estación Meteorológica", duracionTexto: "1 día", fechaInicio: "2026-03-19", fechaFin: "2026-03-20", predecesoras: "36", esGrupo: false },
  { displayId: "38", nombre: "Cimentación de Inversores", duracionTexto: "3 días", fechaInicio: "2026-03-07", fechaFin: "2026-03-11", predecesoras: "116FC+30 días", esGrupo: false },
  { displayId: "39", nombre: "Registros SPT", duracionTexto: "5 días", fechaInicio: "2026-04-21", fechaFin: "2026-04-27", predecesoras: "35CC+5 días", esGrupo: false },
  { displayId: "40", nombre: "Registros de BT", duracionTexto: "15 días", fechaInicio: "2026-04-21", fechaFin: "2026-05-11", predecesoras: "35CC+5 días", esGrupo: false },
  { displayId: "41", nombre: "Registros MT", duracionTexto: "15 días", fechaInicio: "2026-04-15", fechaFin: "2026-05-05", predecesoras: "35CC", esGrupo: false },
  { displayId: "42", nombre: "Registros CCTV", duracionTexto: "15 días", fechaInicio: "2026-04-15", fechaFin: "2026-05-05", predecesoras: "35CC", esGrupo: false },
  { displayId: "43", nombre: "Tubería DC", duracionTexto: "15 días", fechaInicio: "2026-04-18", fechaFin: "2026-05-08", predecesoras: "35CC+3 días", esGrupo: false },
  { displayId: "44", nombre: "Tubería AC", duracionTexto: "15 días", fechaInicio: "2026-04-18", fechaFin: "2026-05-08", predecesoras: "43CC", esGrupo: false },
  { displayId: "45", nombre: "Tubería Comunicación", duracionTexto: "15 días", fechaInicio: "2026-04-18", fechaFin: "2026-05-08", predecesoras: "43CC", esGrupo: false },
  { displayId: "46", nombre: "Tubería MT", duracionTexto: "15 días", fechaInicio: "2026-04-18", fechaFin: "2026-05-08", predecesoras: "43CC", esGrupo: false },
  { displayId: "47", nombre: "Tubería CCTV", duracionTexto: "15 días", fechaInicio: "2026-04-18", fechaFin: "2026-05-08", predecesoras: "43CC", esGrupo: false },
  { displayId: "48", nombre: "Cinta de protección para zanja", duracionTexto: "15 días", fechaInicio: "2026-04-18", fechaFin: "2026-05-08", predecesoras: "43CC", esGrupo: false },
  { displayId: "49", nombre: "Centro de Transformación", duracionTexto: "50 días", fechaInicio: "2026-02-02", fechaFin: "2026-04-13", predecesoras: "34FC+5 días", esGrupo: false },
  { displayId: "50", nombre: "Fundida de hincas con Micropilotes", duracionTexto: "30 días", fechaInicio: "2026-01-29", fechaFin: "2026-03-11", predecesoras: "116FC+3 días", esGrupo: false },
  { displayId: "51", nombre: "Sistema Puesta Tierra", duracionTexto: "15 días", fechaInicio: "2026-04-21", fechaFin: "2026-05-11", predecesoras: "", esGrupo: true },
  { displayId: "52", nombre: "Malla puesta tierra principal", duracionTexto: "15 días", fechaInicio: "2026-04-21", fechaFin: "2026-05-11", predecesoras: "35CC+5 días", esGrupo: false },
  { displayId: "53", nombre: "Varilla en cobre, soldadura, moldes y terminales", duracionTexto: "15 días", fechaInicio: "2026-04-21", fechaFin: "2026-05-11", predecesoras: "52CC", esGrupo: false },
  { displayId: "54", nombre: "Derivaciones Cable Copperclad Aislado", duracionTexto: "10 días", fechaInicio: "2026-04-21", fechaFin: "2026-05-05", predecesoras: "52CC", esGrupo: false },
  { displayId: "55", nombre: "Material Eléctrico baja tensión - PARQUE", duracionTexto: "54 días", fechaInicio: "2026-03-11", fechaFin: "2026-05-23", predecesoras: "", esGrupo: true },
  { displayId: "56", nombre: "Cableado solar 6mm", duracionTexto: "10 días", fechaInicio: "2026-04-29", fechaFin: "2026-05-12", predecesoras: "40CC+6 días", esGrupo: false },
  { displayId: "57", nombre: "Conectores MC4", duracionTexto: "10 días", fechaInicio: "2026-04-29", fechaFin: "2026-05-12", predecesoras: "56CC", esGrupo: false },
  { displayId: "58", nombre: "Conductor AC - 300 mm2 XLPE para baja tensión 0,6/1kV", duracionTexto: "10 días", fechaInicio: "2026-04-21", fechaFin: "2026-05-05", predecesoras: "35CC+5 días", esGrupo: false },
  { displayId: "59", nombre: "Cableado Comunicaciones entre inversores (incluye conectores)", duracionTexto: "3 días", fechaInicio: "2026-05-20", fechaFin: "2026-05-23", predecesoras: "94", esGrupo: false },
  { displayId: "60", nombre: "Suministro e instalación de Poste metálico de 4 m CCTV e Iluminación", duracionTexto: "15 días", fechaInicio: "2026-03-13", fechaFin: "2026-04-04", predecesoras: "36CC+5 días", esGrupo: false },
  { displayId: "61", nombre: "Suministro e instalación de tablero de protecciones fusibles DC para inversor", duracionTexto: "5 días", fechaInicio: "2026-03-25", fechaFin: "2026-03-31", predecesoras: "63FC+5 días", esGrupo: false },
  { displayId: "62", nombre: "Suministro e instalación de Lámpara (Solar / Convencional)", duracionTexto: "3 días", fechaInicio: "2026-04-04", fechaFin: "2026-04-08", predecesoras: "60", esGrupo: false },
  { displayId: "63", nombre: "Estructura para inversores", duracionTexto: "5 días", fechaInicio: "2026-03-11", fechaFin: "2026-03-17", predecesoras: "38", esGrupo: false },
  { displayId: "64", nombre: "Material Eléctrico Caseta / Bodega", duracionTexto: "8 días", fechaInicio: "2026-04-06", fechaFin: "2026-04-16", predecesoras: "", esGrupo: true },
  { displayId: "65", nombre: "Tableros auxiliares", duracionTexto: "1 día", fechaInicio: "2026-04-06", fechaFin: "2026-04-07", predecesoras: "49FC-5 días", esGrupo: false },
  { displayId: "66", nombre: "Tubería, curvas, soportes, chazos", duracionTexto: "3 días", fechaInicio: "2026-04-06", fechaFin: "2026-04-09", predecesoras: "65CC", esGrupo: false },
  { displayId: "67", nombre: "Cableado Iluminación (Acometidas, Salidas y conectores)", duracionTexto: "3 días", fechaInicio: "2026-04-09", fechaFin: "2026-04-14", predecesoras: "66", esGrupo: false },
  { displayId: "68", nombre: "Dispositivos (Luminarias, Tomacorrientes, Suiches)", duracionTexto: "2 días", fechaInicio: "2026-04-14", fechaFin: "2026-04-16", predecesoras: "67", esGrupo: false },
  { displayId: "69", nombre: "Transformador de SSAA", duracionTexto: "1 día", fechaInicio: "2026-04-07", fechaFin: "2026-04-08", predecesoras: "65", esGrupo: false },
  { displayId: "70", nombre: "Material Eléctrico media tensión - SUBTERRANEO", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "", esGrupo: true },
  { displayId: "71", nombre: "Seccionador", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "116FC+30 días", esGrupo: false },
  { displayId: "72", nombre: "Cable aislado de Media Tensión XLPE 1/0 AL, 15 kV", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "71FF", esGrupo: false },
  { displayId: "73", nombre: "Suministro de Juego premoldeados 15 kV tipo interior", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "71FF", esGrupo: false },
  { displayId: "74", nombre: "Suministro de bajantes en 4\" IMC (incluye Capacete, Curvas, Afloramiento)", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "71FF", esGrupo: false },
  { displayId: "75", nombre: "Material Eléctrico media tensión - LINEA", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "", esGrupo: true },
  { displayId: "76", nombre: "Suministro e instalación de postes de concreto", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "116FC+30 días", esGrupo: false },
  { displayId: "77", nombre: "Armado de estructura de postes (Línea y Reconectador)", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "76FF", esGrupo: false },
  { displayId: "78", nombre: "Suministro malla SPT", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "76FF", esGrupo: false },
  { displayId: "79", nombre: "Suministro e instalación de Juego premoldeados 15 kV tipo exterior", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "76FF", esGrupo: false },
  { displayId: "80", nombre: "Cable de aluminio desnudo no 123,3 kcmil aaac azusa", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "76FF", esGrupo: false },
  { displayId: "81", nombre: "Transformador de corriente, 50/5a cl 0.5s 5va, 17,5 kv, uso exterior", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "76FF", esGrupo: false },
  { displayId: "82", nombre: "Transformador de potencial, relación 13200/raíz(3)/120/raíz(3) cl 0.5 10 va, 17,5 kv", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "76FF", esGrupo: false },
  { displayId: "83", nombre: "Medidor", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "76", esGrupo: false },
  { displayId: "84", nombre: "Modems", duracionTexto: "0 días", fechaInicio: "2026-03-06", fechaFin: "2026-03-06", predecesoras: "76", esGrupo: false },
  { displayId: "85", nombre: "Control y Monitoreo", duracionTexto: "87 días", fechaInicio: "2026-01-26", fechaFin: "2026-05-23", predecesoras: "", esGrupo: true },
  { displayId: "86", nombre: "Estación meteorológica (incluye materiales para la instalación)", duracionTexto: "3 días", fechaInicio: "2026-04-04", fechaFin: "2026-04-08", predecesoras: "60", esGrupo: false },
  { displayId: "87", nombre: "Suministro e instalación de CCTV", duracionTexto: "8 días", fechaInicio: "2026-04-04", fechaFin: "2026-04-15", predecesoras: "60", esGrupo: false },
  { displayId: "88", nombre: "Servicio Internet", duracionTexto: "87 días", fechaInicio: "2026-01-26", fechaFin: "2026-05-23", predecesoras: "116", esGrupo: false },
  { displayId: "89", nombre: "Montaje Mecánico y Eléctrico", duracionTexto: "53 días", fechaInicio: "2026-03-11", fechaFin: "2026-05-22", predecesoras: "", esGrupo: true },
  { displayId: "90", nombre: "Montaje electromecánico", duracionTexto: "53 días", fechaInicio: "2026-03-11", fechaFin: "2026-05-22", predecesoras: "116", esGrupo: false },
  { displayId: "91", nombre: "Montaje mecánico de paneles", duracionTexto: "15 días", fechaInicio: "2026-03-17", fechaFin: "2026-04-08", predecesoras: "99CC+5 días", esGrupo: false },
  { displayId: "92", nombre: "Montaje Mecánico de Inversores", duracionTexto: "3 días", fechaInicio: "2026-03-11", fechaFin: "2026-03-14", predecesoras: "38", esGrupo: false },
  { displayId: "93", nombre: "Conexionado de Paneles", duracionTexto: "10 días", fechaInicio: "2026-04-29", fechaFin: "2026-05-12", predecesoras: "91FC-5 días;56FF", esGrupo: false },
  { displayId: "94", nombre: "Conexionado de Inversores", duracionTexto: "8 días", fechaInicio: "2026-05-08", fechaFin: "2026-05-20", predecesoras: "93FF+5 días", esGrupo: false },
  { displayId: "95", nombre: "Conexionado de STS", duracionTexto: "7 días", fechaInicio: "2026-04-28", fechaFin: "2026-05-07", predecesoras: "10FC+5 días", esGrupo: false },
  { displayId: "96", nombre: "Instalación de Línea de interconexión", duracionTexto: "10 días", fechaInicio: "2026-04-21", fechaFin: "2026-05-05", predecesoras: "52CC", esGrupo: false },
  { displayId: "97", nombre: "Conexionado parque a línea T", duracionTexto: "2 días", fechaInicio: "2026-05-20", fechaFin: "2026-05-22", predecesoras: "95;96;93;94", esGrupo: false },
  { displayId: "98", nombre: "Montaje de equipos de medida (TC, TP, Reconectador)", duracionTexto: "5 días", fechaInicio: "2026-05-05", fechaFin: "2026-05-11", predecesoras: "96", esGrupo: false },
  { displayId: "99", nombre: "Montaje de estructuras (vigas y correas)", duracionTexto: "15 días", fechaInicio: "2026-03-11", fechaFin: "2026-03-31", predecesoras: "50", esGrupo: false },
  { displayId: "100", nombre: "Montaje estructura de Inversores", duracionTexto: "5 días", fechaInicio: "2026-03-25", fechaFin: "2026-03-31", predecesoras: "99FF", esGrupo: false },
  { displayId: "101", nombre: "Pruebas, ensayos y laboratorios", duracionTexto: "80 días", fechaInicio: "2026-02-04", fechaFin: "2026-05-25", predecesoras: "", esGrupo: true },
  { displayId: "102", nombre: "Diseño de Mezcla", duracionTexto: "0 días", fechaInicio: "2026-02-23", fechaFin: "2026-02-23", predecesoras: "116FC+20 días", esGrupo: false },
  { displayId: "103", nombre: "Ensayos de Concretos", duracionTexto: "15 días", fechaInicio: "2026-02-04", fechaFin: "2026-02-26", predecesoras: "50CC+5 días", esGrupo: false },
  { displayId: "104", nombre: "Ensayos de Aceros", duracionTexto: "0 días", fechaInicio: "2026-02-23", fechaFin: "2026-02-23", predecesoras: "116FC+20 días", esGrupo: false },
  { displayId: "105", nombre: "Prueba de Torque", duracionTexto: "15 días", fechaInicio: "2026-03-11", fechaFin: "2026-03-31", predecesoras: "99CC", esGrupo: false },
  { displayId: "106", nombre: "Pruebas (VLF, AC-DC, Transformador, Reconectador, Equipos de Medida)", duracionTexto: "5 días", fechaInicio: "2026-05-19", fechaFin: "2026-05-25", predecesoras: "98FC+5 días;95FF", esGrupo: false },
  { displayId: "107", nombre: "Certificación y trámites", duracionTexto: "179 días", fechaInicio: "2025-11-24", fechaFin: "2026-07-22", predecesoras: "", esGrupo: true },
  { displayId: "108", nombre: "Visita RETIE", duracionTexto: "0 días", fechaInicio: "2026-03-16", fechaFin: "2026-03-16", predecesoras: "116CC+37 días", esGrupo: false },
  { displayId: "109", nombre: "Certificación RETIE", duracionTexto: "0 días", fechaInicio: "2026-05-22", fechaFin: "2026-05-22", predecesoras: "90", esGrupo: false },
  { displayId: "110", nombre: "Certificado UPME", duracionTexto: "5 días", fechaInicio: "2025-11-24", fechaFin: "2025-11-29", predecesoras: "2FC+15 días", esGrupo: false },
  { displayId: "111", nombre: "Certificación de frontera", duracionTexto: "15 días", fechaInicio: "2026-05-22", fechaFin: "2026-06-11", predecesoras: "109", esGrupo: false },
  { displayId: "112", nombre: "Pólizas", duracionTexto: "0 días", fechaInicio: "2026-01-26", fechaFin: "2026-01-26", predecesoras: "116", esGrupo: false },
  { displayId: "113", nombre: "Trámites FPO", duracionTexto: "17 días", fechaInicio: "2026-05-22", fechaFin: "2026-06-13", predecesoras: "109", esGrupo: false },
  { displayId: "114", nombre: "Trámites COD", duracionTexto: "30 días", fechaInicio: "2026-06-13", fechaFin: "2026-07-22", predecesoras: "113", esGrupo: false },
  { displayId: "115", nombre: "Administración del proyecto", duracionTexto: "103 días", fechaInicio: "2026-01-26", fechaFin: "2026-06-13", predecesoras: "", esGrupo: true },
  { displayId: "116", nombre: "Acta de inicio", duracionTexto: "0 días", fechaInicio: "2026-01-26", fechaFin: "2026-01-26", predecesoras: "2FC+61 días", esGrupo: false },
  { displayId: "117", nombre: "Costo administrativo OBRA", duracionTexto: "87 días", fechaInicio: "2026-01-26", fechaFin: "2026-05-23", predecesoras: "116", esGrupo: false },
  { displayId: "118", nombre: "Costo administrativo ADMIN GUMARP", duracionTexto: "87 días", fechaInicio: "2026-01-26", fechaFin: "2026-05-23", predecesoras: "116", esGrupo: false },
  { displayId: "119", nombre: "Costo Operativo de obra", duracionTexto: "0 días", fechaInicio: "2026-01-26", fechaFin: "2026-01-26", predecesoras: "116", esGrupo: false },
  { displayId: "120", nombre: "Oficina y almacén", duracionTexto: "87 días", fechaInicio: "2026-01-26", fechaFin: "2026-05-23", predecesoras: "116", esGrupo: false },
  { displayId: "121", nombre: "Vigilancia", duracionTexto: "80 días", fechaInicio: "2026-01-26", fechaFin: "2026-05-13", predecesoras: "116", esGrupo: false },
  { displayId: "122", nombre: "Arriendo de lote respaldo", duracionTexto: "5 días", fechaInicio: "2026-01-26", fechaFin: "2026-01-31", predecesoras: "116", esGrupo: false },
  { displayId: "123", nombre: "Limpieza de módulos al finalizar la instalación", duracionTexto: "5 días", fechaInicio: "2026-06-05", fechaFin: "2026-06-13", predecesoras: "111FC-3 días", esGrupo: false },
  { displayId: "124", nombre: "Disposición final de residuos", duracionTexto: "1 día", fechaInicio: "2026-06-05", fechaFin: "2026-06-09", predecesoras: "123CC", esGrupo: false },
];

// Construye el cronograma inicial de un proyecto nuevo a partir de CRONOGRAMA_BASE_TEMPLATE, con ids
// frescos y peso repartido igual entre las tareas hoja (mismo criterio que parseCronogramaPaste al
// pegar desde Project). El "seguimiento" arranca vacío — se llena con el avance real del proyecto.
function buildCronogramaBaseFromTemplate() {
  const tasks = CRONOGRAMA_BASE_TEMPLATE.map((t) => ({
    id: uid(),
    displayId: t.displayId,
    nombre: t.nombre,
    duracionTexto: t.duracionTexto,
    fechaInicio: t.fechaInicio,
    fechaFin: t.fechaFin,
    predecesoras: t.predecesoras,
    pctCompletado: 0,
    esGrupo: t.esGrupo,
    peso: 0,
  }));
  const leaf = tasks.filter((t) => !t.esGrupo);
  if (leaf.length) {
    const pesoIgual = Math.round((100 / leaf.length) * 10) / 10;
    leaf.forEach((t) => { t.peso = pesoIgual; });
  }
  return { tasks, seguimiento: [] };
}

const CAT_STYLE = {
  OR: { bg: "#3A2E12", fg: "#F5B942", label: "Trámite OR" },
  Linea: { bg: "#0F2A24", fg: "#4FBF8F", label: "Línea" },
  Parque: { bg: "#16261B", fg: "#7FD08A", label: "Parque" },
  Carta: { bg: "#2E1520", fg: "#E77DA8", label: "Carta 9.x" },
  COD: { bg: "#2E1F0C", fg: "#F2C063", label: "COD" },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (isoStart, isoEnd) => {
  const a = new Date(isoStart + "T00:00:00");
  const b = new Date(isoEnd + "T00:00:00");
  return Math.round((b - a) / 86400000);
};
const addYears = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtTime = (date) =>
  date ? date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDateTime = (date) =>
  date
    ? `${date.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })} · ${fmtTime(date)}`
    : "";

function emptyUpmeState() {
  const steps = {};
  UPME_STEPS.forEach((s) => {
    steps[s.id] = { completado: false, fecha: "", decision: null, notas: "" };
  });
  return { steps };
}

function emptyEnergizacionState() {
  return {
    // Vacío a propósito: si se pusiera hoy por defecto, un proyecto recién creado ya "estaría
    // atrasado" el mismo día que se crea, antes de que nadie haya arrancado nada de verdad. Las
    // alertas de atraso solo empiezan cuando la persona asigna la fecha real de inicio de trámites.
    fechaInicio: "",
    milestones: ENERGIZACION_MILESTONES.map(() => ({ done: false, fecha: "" })),
  };
}

function emptyCronogramaState() {
  return {
    tasks: [], // { id, nombre, fechaInicio, fechaFin, peso }
    seguimiento: [], // { id, fecha, avance } — avance = % acumulado real en esa fecha
  };
}

function emptyPresupuestoState() {
  return {
    // Cada lista tiene items con la misma estructura de columnas que el Excel de referencia:
    // { id, item, categoria, descripcion, cantidad, unidad, valorUnitario (antes de IVA), ivaPct }
    // valorUnitarioConIva, valorTotal e ivaRecuperable se calculan (ver calcPresupuestoItem)
    base: [],
    ejecucion: [],
  };
}

function emptyPagosState() {
  return {
    ordenes: [], // { id, numero, proveedor, valorTotal, pagos: [{ id, fecha, valor, concepto }] }
  };
}

function emptyProjectData() {
  return {
    upme: emptyUpmeState(),
    energizacion: emptyEnergizacionState(),
    cronograma: emptyCronogramaState(),
    presupuesto: emptyPresupuestoState(),
    pagos: emptyPagosState(),
  };
}

// Adds any fields missing from older saved data (e.g. projects created before "presupuesto"/"pagos" existed,
// or before "presupuesto" moved from {items} to {base, ejecucion})
function ensureFullProjectData(data) {
  const rawPresupuesto = data?.presupuesto;
  const presupuesto =
    rawPresupuesto && (rawPresupuesto.base || rawPresupuesto.ejecucion)
      ? { base: rawPresupuesto.base || [], ejecucion: rawPresupuesto.ejecucion || [] }
      : emptyPresupuestoState();

  const rawPagos = data?.pagos;
  const pagos = rawPagos && Array.isArray(rawPagos.ordenes) ? { ordenes: rawPagos.ordenes } : emptyPagosState();

  const rawCronograma = data?.cronograma;
  const cronograma =
    rawCronograma && Array.isArray(rawCronograma.tasks)
      ? { tasks: rawCronograma.tasks, seguimiento: Array.isArray(rawCronograma.seguimiento) ? rawCronograma.seguimiento : [] }
      : emptyCronogramaState();

  const rawUpme = data?.upme;
  const upme = rawUpme && rawUpme.steps ? rawUpme : emptyUpmeState();

  const rawEner = data?.energizacion;
  const energizacion = rawEner && Array.isArray(rawEner.milestones) ? rawEner : emptyEnergizacionState();

  return { upme, energizacion, cronograma, presupuesto, pagos };
}

// Calcula valor unitario con IVA, valor total e IVA recuperable de una línea de presupuesto
function calcPresupuestoItem(it) {
  const cantidad = Number(it.cantidad) || 0;
  const valorUnitario = Number(it.valorUnitario) || 0; // antes de IVA
  const ivaPct = Number(it.ivaPct) || 0;
  const valorUnitarioConIva = valorUnitario * (1 + ivaPct / 100);
  const valorTotal = cantidad * valorUnitarioConIva;
  const ivaRecuperable = valorTotal - cantidad * valorUnitario;
  return { valorUnitarioConIva, valorTotal, ivaRecuperable };
}

function presupuestoListTotal(items) {
  return (items || []).reduce((s, it) => s + calcPresupuestoItem(it).valorTotal, 0);
}

function presupuestoTotals(presupuesto) {
  const base = presupuestoListTotal(presupuesto?.base);
  const ejecutado = presupuestoListTotal(presupuesto?.ejecucion);
  const diferencia = ejecutado - base;
  const pct = base ? Math.round((ejecutado / base) * 100) : 0;
  return { base, ejecutado, diferencia, pct };
}

// Agrupa items de presupuesto por categoría, preservando el orden de primera aparición
function groupPresupuestoItems(items) {
  const order = [];
  const map = {};
  (items || []).forEach((it) => {
    const cat = it.categoria?.trim() || "Sin categoría";
    if (!map[cat]) {
      map[cat] = [];
      order.push(cat);
    }
    map[cat].push(it);
  });
  return order.map((cat) => ({ categoria: cat, items: map[cat] }));
}

// Un pago cuenta como realizado si su estado es "pagado" (o no tiene estado, para compatibilidad
// con registros creados antes de esta función). Los "programados" son pagos futuros planeados
// que todavía no se cuentan como dinero efectivamente pagado.
function ordenPagado(orden) {
  return (orden.pagos || [])
    .filter((p) => (p.estado || "pagado") === "pagado")
    .reduce((s, p) => s + (Number(p.valor) || 0), 0);
}
function ordenProgramado(orden) {
  return (orden.pagos || [])
    .filter((p) => p.estado === "programado")
    .reduce((s, p) => s + (Number(p.valor) || 0), 0);
}
function ordenSaldo(orden) {
  return (Number(orden.valorTotal) || 0) - ordenPagado(orden);
}
function pagosTotals(pagos) {
  const ordenes = pagos?.ordenes || [];
  const totalOrdenes = ordenes.reduce((s, o) => s + (Number(o.valorTotal) || 0), 0);
  const totalPagado = ordenes.reduce((s, o) => s + ordenPagado(o), 0);
  const totalProgramado = ordenes.reduce((s, o) => s + ordenProgramado(o), 0);
  const totalSaldo = totalOrdenes - totalPagado;
  return { totalOrdenes, totalPagado, totalProgramado, totalSaldo };
}

// Alertas de pagos programados: próximos a vencer (dentro de `diasAviso` días) o ya vencidos.
function pagosProximosAlertas(pagos, diasAviso = 7) {
  const hoy = todayISO();
  const alertas = [];
  (pagos?.ordenes || []).forEach((o) => {
    (o.pagos || []).forEach((p) => {
      if (p.estado !== "programado" || !p.fecha) return;
      const dias = daysBetween(hoy, p.fecha);
      const proveedor = o.proveedor ? ` · ${o.proveedor}` : "";
      const concepto = p.concepto ? ` (${p.concepto})` : "";
      if (dias < 0) {
        alertas.push({ tipo: "vencido", texto: `Pago programado vencido: ${o.numero}${proveedor}${concepto} — ${fmtMoney(p.valor)}, previsto para el ${fmtDate(p.fecha)}.` });
      } else if (dias <= diasAviso) {
        const cuando = dias === 0 ? "hoy" : `en ${dias} día${dias === 1 ? "" : "s"}`;
        alertas.push({ tipo: "proximo", texto: `Pago próximo: ${o.numero}${proveedor}${concepto} — ${fmtMoney(p.valor)}, vence ${cuando} (${fmtDate(p.fecha)}).` });
      }
    });
  });
  return alertas;
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

// Parses a number typed/copied in Colombian format (e.g. "338.282" o "338.282,50") into a plain float
function parseColombianNumber(str) {
  if (str === undefined || str === null) return 0;
  let s = String(str).trim();
  if (!s) return 0;
  s = s.replace(/[^0-9.,-]/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/\./g, ""); // "." usado como separador de miles
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parsePercentValue(str) {
  if (!str) return 0;
  const n = parseFloat(String(str).replace("%", "").replace(",", ".").trim());
  return isNaN(n) ? 0 : n;
}

// Parsea filas pegadas desde Excel (separadas por tabulador) al formato de ítems de presupuesto.
// Formato esperado por columna: Ítem | Descripción | Cantidad | Unidad | Valor unitario (antes de IVA) | IVA %
// Una fila donde Cantidad/Unidad/Valor unitario vienen vacías se interpreta como encabezado de categoría
// (p. ej. "1  EQUIPOS PRINCIPALES") y agrupa las filas siguientes bajo esa categoría.
function parsePresupuestoPaste(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);

  const items = [];
  let currentCategoria = "Sin categoría";
  let skipped = 0;

  lines.forEach((line) => {
    const cols = line.split("\t");
    const itemCode = (cols[0] || "").trim();
    const descripcion = (cols[1] || "").trim();
    if (!descripcion) {
      skipped++;
      return;
    }
    if (/^(item|ítem)$/i.test(itemCode) || /^descrip/i.test(descripcion)) return; // fila de encabezados de columnas

    const cantidadRaw = (cols[2] || "").trim();
    const unidadRaw = (cols[3] || "").trim();
    const valorRaw = (cols[4] || "").trim();
    const ivaRaw = (cols[5] || "").trim();

    const isGroupHeader = !cantidadRaw && !unidadRaw && !valorRaw;
    if (isGroupHeader) {
      currentCategoria = descripcion;
      return;
    }

    items.push({
      id: uid(),
      item: itemCode,
      categoria: currentCategoria,
      descripcion,
      cantidad: parseColombianNumber(cantidadRaw),
      unidad: unidadRaw,
      valorUnitario: parseColombianNumber(valorRaw),
      ivaPct: parsePercentValue(ivaRaw),
    });
  });

  return { items, skipped };
}

function fractionElapsed(startISO, endISO, dateISO) {
  const s = new Date(startISO + "T00:00:00").getTime();
  const e = new Date(endISO + "T00:00:00").getTime();
  const d = new Date(dateISO + "T00:00:00").getTime();
  if (e <= s) return d >= s ? 1 : 0;
  return Math.min(1, Math.max(0, (d - s) / (e - s)));
}

function cronogramaPesoTotal(tasks) {
  return tasks.filter((t) => !t.esGrupo).reduce((s, t) => s + (Number(t.peso) || 0), 0);
}

// Builds the merged baseline ("línea base") vs actual ("seguimiento") S-curve series for the chart
function buildCurvaSData(cronograma) {
  const { tasks, seguimiento } = cronograma;
  const leafTasks = tasks.filter((t) => !t.esGrupo);
  const dateSet = new Set();
  leafTasks.forEach((t) => {
    if (t.fechaInicio) dateSet.add(t.fechaInicio);
    if (t.fechaFin) dateSet.add(t.fechaFin);
  });
  seguimiento.forEach((s) => {
    if (s.fecha) dateSet.add(s.fecha);
  });
  if (dateSet.size === 0) return [];
  const sortedDates = Array.from(dateSet).sort();
  const sortedSeg = [...seguimiento].filter((s) => s.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));

  return sortedDates.map((date) => {
    const base = leafTasks.reduce((sum, t) => {
      if (!t.fechaInicio || !t.fechaFin) return sum;
      return sum + (Number(t.peso) || 0) * fractionElapsed(t.fechaInicio, t.fechaFin, date);
    }, 0);
    const lastSeg = [...sortedSeg].filter((s) => s.fecha <= date).pop();
    return {
      date,
      label: fmtDate(date),
      base: Math.round(base * 10) / 10,
      real: lastSeg ? Number(lastSeg.avance) : null,
    };
  });
}

// Convierte una fecha de MS Project como "mar 20/01/26" o "20/01/2026" a formato ISO (aaaa-mm-dd)
function parseProjectDate(str) {
  if (!str) return "";
  const m = String(str).trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  if (!m) return "";
  let [, d, mo, y] = m;
  d = d.padStart(2, "0");
  mo = mo.padStart(2, "0");
  if (y.length === 2) y = "20" + y;
  return `${y}-${mo}-${d}`;
}

// Calcula avance actual ponderado a partir del % completado de cada tarea hoja (para el punto
// más reciente de la curva de seguimiento, cuando se importa/actualiza desde MS Project).
function cronogramaAvanceActual(tasks) {
  const leaf = (tasks || []).filter((t) => !t.esGrupo);
  const pesoTotal = leaf.reduce((s, t) => s + (Number(t.peso) || 0), 0);
  if (!pesoTotal) return 0;
  const avance = leaf.reduce((s, t) => s + (Number(t.peso) || 0) * (Number(t.pctCompletado) || 0) / 100, 0);
  return Math.round((avance / pesoTotal) * pesoTotal * 10) / 10; // = avance ponderado sobre 100
}

// Parsea filas copiadas/pegadas desde MS Project (o Excel con las mismas columnas) para el cronograma.
// Usa la fila de encabezado para ubicar las columnas, así que es tolerante a columnas de más
// (como "Modo de tarea", que no trae texto útil al copiar) o a un orden distinto.
// Heurística de agrupación: una fila cuya "Duración" no es "0 días" se trata como fila de
// resumen/categoría (como "PROCURA EQUIPOS PRINCIPALES"), ya que en cronogramas de este tipo
// las tareas puntuales quedan con 0 días. Se puede corregir manualmente después de importar.
function parseCronogramaPaste(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { tasks: [], skipped: 0 };

  const headerCols = lines[0].split("\t").map((c) => c.trim().toLowerCase());
  const findCol = (...keywords) => headerCols.findIndex((c) => keywords.some((k) => c.includes(k)));
  const idxId = findCol("id");
  const idxNombre = findCol("nombre");
  const idxDuracion = findCol("duraci");
  const idxComienzo = findCol("comienzo", "inicio");
  const idxFin = findCol("fin");
  const idxPred = findCol("predecesor");
  const idxPct = findCol("completado");

  const hasHeader = idxNombre !== -1 && idxComienzo !== -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const tasks = [];
  let skipped = 0;
  dataLines.forEach((line) => {
    const cols = line.split("\t");
    const nombre = (idxNombre !== -1 ? cols[idxNombre] : cols[1] || "").trim();
    if (!nombre) {
      skipped++;
      return;
    }
    const duracionTexto = (idxDuracion !== -1 ? cols[idxDuracion] : "").trim();
    const fechaInicio = parseProjectDate(idxComienzo !== -1 ? cols[idxComienzo] : "");
    const fechaFin = parseProjectDate(idxFin !== -1 ? cols[idxFin] : "");
    const predecesoras = (idxPred !== -1 ? cols[idxPred] : "").trim();
    const pctCompletado = idxPct !== -1 ? parsePercentValue(cols[idxPct]) : 0;
    const displayId = (idxId !== -1 ? cols[idxId] : "").trim();
    const esGrupo = !!duracionTexto && !/^0\s/.test(duracionTexto);
    tasks.push({
      id: uid(), displayId, nombre, duracionTexto, fechaInicio, fechaFin,
      predecesoras, pctCompletado, esGrupo, peso: 0,
    });
  });

  const leaf = tasks.filter((t) => !t.esGrupo);
  if (leaf.length) {
    const pesoIgual = Math.round((100 / leaf.length) * 10) / 10;
    leaf.forEach((t) => { t.peso = pesoIgual; });
  }

  return { tasks, skipped };
}

// Empareja las filas recién pegadas (parseCronogramaPaste) con las tareas que ya existen en el
// cronograma, para re-importar un cronograma actualizado sin duplicar filas. Emparejamiento por
// "Id" de MS Project (displayId) cuando está presente; si no, por nombre exacto (normalizado).
// En las que emparejan, solo se actualizan los campos que vienen del pegado (duración, fechas,
// predecesoras, % completado) — se preservan el peso y la casilla "Grupo", que son ajustes manuales
// que el pegado no conoce. Las que no emparejan se agregan como tareas nuevas con peso 0 (para no
// alterar el peso total en silencio; se ajusta a mano, igual que hoy).
function matchCronogramaTasks(existingTasks, parsedTasks) {
  const usedExistingIds = new Set();
  const byDisplayId = new Map();
  const byNombre = new Map();
  existingTasks.forEach((t) => {
    const did = (t.displayId || "").trim();
    if (did && !byDisplayId.has(did)) byDisplayId.set(did, t);
    const key = (t.nombre || "").trim().toLowerCase();
    if (key && !byNombre.has(key)) byNombre.set(key, t);
  });

  const toUpdate = []; // { existing, parsed }
  const toAdd = [];

  parsedTasks.forEach((p) => {
    const did = (p.displayId || "").trim();
    const nameKey = (p.nombre || "").trim().toLowerCase();
    let match = null;
    if (did && byDisplayId.has(did) && !usedExistingIds.has(byDisplayId.get(did).id)) {
      match = byDisplayId.get(did);
    } else if (nameKey && byNombre.has(nameKey) && !usedExistingIds.has(byNombre.get(nameKey).id)) {
      match = byNombre.get(nameKey);
    }
    if (match) {
      usedExistingIds.add(match.id);
      toUpdate.push({ existing: match, parsed: p });
    } else {
      toAdd.push(p);
    }
  });

  return { toUpdate, toAdd };
}

// Aplica el resultado de matchCronogramaTasks sobre la lista de tareas existente, devolviendo el
// arreglo final: actualizadas en su lugar, nuevas al final.
function applyCronogramaMerge(existingTasks, toUpdate, toAdd) {
  const patchById = new Map(
    toUpdate.map(({ existing, parsed }) => [
      existing.id,
      {
        ...existing,
        displayId: parsed.displayId || existing.displayId,
        duracionTexto: parsed.duracionTexto,
        fechaInicio: parsed.fechaInicio,
        fechaFin: parsed.fechaFin,
        predecesoras: parsed.predecesoras,
        pctCompletado: parsed.pctCompletado,
      },
    ])
  );
  const merged = existingTasks.map((t) => patchById.get(t.id) || t);
  const nuevas = toAdd.map((p) => ({ ...p, peso: 0 }));
  return [...merged, ...nuevas];
}

/* ---------------------------------------------------------------------
   Predecesoras/sucesoras "como Project": una tarea con predecesoras válidas (que resuelvan a otra
   tarea existente por su "Id") calcula su fecha automáticamente en vez de editarse a mano — igual
   que el modo "auto-programado" de MS Project. Calendario laboral: lunes a sábado (domingo no
   cuenta) y festivos de Colombia (tampoco cuentan), igual que el calendario que usaba el Project
   original.
--------------------------------------------------------------------- */

// Extrae el número de días de un texto de duración como "15 días", "1 día", "0 días".
function parseDuracionDias(duracionTexto) {
  const m = String(duracionTexto || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// "116FC+20 días;56FF" -> [{ id: "116", tipo: "FC", lag: 20 }, { id: "56", tipo: "FF", lag: 0 }]
// Sin tipo asume Fin-a-Comienzo (FC), como Project. Tolera "56" (sin tipo ni retraso).
function parsePredecesoras(str) {
  return String(str || "")
    .split(";")
    .map((tok) => tok.trim())
    .filter(Boolean)
    .map((tok) => {
      const m = tok.match(/^(\d+)\s*(FC|CC|FF|CF)?(?:\s*([+-]\d+)\s*d[ií]as?)?/i);
      if (!m) return null;
      return { id: m[1], tipo: (m[2] || "FC").toUpperCase(), lag: m[3] ? parseInt(m[3], 10) : 0 };
    })
    .filter(Boolean);
}

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher — calendario gregoriano).
function computeEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const toISO = (date) => date.toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };

// Ley Emiliani: si la fecha no cae lunes, se traslada al lunes siguiente.
function trasladarALunes(date) {
  const dia = date.getDay(); // 0 = domingo .. 6 = sábado
  return addDays(date, (8 - dia) % 7); // 0 si ya es lunes
}

const colombianHolidaysCache = new Map();

// Festivos de Colombia para un año dado, como Set de fechas ISO. Incluye los fijos, los que la Ley
// Emiliani traslada al lunes siguiente, y los que dependen de la Pascua (Semana Santa, Ascensión,
// Corpus Christi, Sagrado Corazón — con sus traslados correspondientes).
function getColombianHolidays(year) {
  if (colombianHolidaysCache.has(year)) return colombianHolidaysCache.get(year);

  const fechas = new Set();
  // Fijos, no se trasladan
  [[0, 1], [4, 1], [6, 20], [7, 7], [11, 8], [11, 25]].forEach(([mes, dia]) => {
    fechas.add(toISO(new Date(year, mes, dia)));
  });
  // Se trasladan al lunes siguiente (Ley Emiliani)
  [[0, 6], [2, 19], [5, 29], [7, 15], [9, 12], [10, 1], [10, 11]].forEach(([mes, dia]) => {
    fechas.add(toISO(trasladarALunes(new Date(year, mes, dia))));
  });
  // Dependen de la Pascua
  const pascua = computeEasterSunday(year);
  fechas.add(toISO(addDays(pascua, -3))); // Jueves Santo
  fechas.add(toISO(addDays(pascua, -2))); // Viernes Santo
  fechas.add(toISO(trasladarALunes(addDays(pascua, 39)))); // Ascensión del Señor
  fechas.add(toISO(trasladarALunes(addDays(pascua, 60)))); // Corpus Christi
  fechas.add(toISO(trasladarALunes(addDays(pascua, 68)))); // Sagrado Corazón de Jesús

  colombianHolidaysCache.set(year, fechas);
  return fechas;
}

function isWorkingDay(date) {
  if (date.getDay() === 0) return false; // domingo no laboral, sábado sí
  return !getColombianHolidays(date.getFullYear()).has(toISO(date));
}

// Suma (o resta, si n es negativo) n días laborales a una fecha ISO, saltando domingos.
function addWorkingDays(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00");
  let remaining = Math.abs(n);
  const step = n >= 0 ? 1 : -1;
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (isWorkingDay(d)) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

// Recalcula fechaInicio/fechaFin de las tareas cuyas predecesoras resuelven a otra tarea existente
// (por "displayId"), en cascada y respetando FC/CC/FF/CF con adelanto o atraso. Las tareas sin
// predecesoras válidas (o cuyo "displayId" no se encuentra) quedan intactas — son las "ancla" que
// se siguen fijando a mano. Es tolerante a ciclos: si detecta uno, deja esa tarea sin recalcular en
// vez de entrar en bucle infinito.
function computeCronogramaSchedule(tasks) {
  const byDisplayId = new Map();
  tasks.forEach((t) => {
    const did = (t.displayId || "").trim();
    if (did && !byDisplayId.has(did)) byDisplayId.set(did, t);
  });

  const resolved = new Map(); // id (interno) -> { fechaInicio, fechaFin }
  const resolving = new Set(); // detección de ciclos

  const resolveTask = (t) => {
    if (resolved.has(t.id)) return resolved.get(t.id);
    if (t.esGrupo) {
      const r = { fechaInicio: t.fechaInicio, fechaFin: t.fechaFin };
      resolved.set(t.id, r);
      return r;
    }
    const preds = parsePredecesoras(t.predecesoras).filter((p) => byDisplayId.has(p.id));
    if (preds.length === 0 || resolving.has(t.id)) {
      const r = { fechaInicio: t.fechaInicio, fechaFin: t.fechaFin };
      resolved.set(t.id, r);
      return r;
    }
    resolving.add(t.id);
    const duracion = parseDuracionDias(t.duracionTexto);
    let comienzo = null;
    preds.forEach((p) => {
      const predTask = byDisplayId.get(p.id);
      const predDates = resolveTask(predTask);
      let impliedComienzo;
      if (p.tipo === "CC") {
        impliedComienzo = addWorkingDays(predDates.fechaInicio, p.lag);
      } else if (p.tipo === "FF") {
        const impliedFin = addWorkingDays(predDates.fechaFin, p.lag);
        impliedComienzo = addWorkingDays(impliedFin, -duracion);
      } else if (p.tipo === "CF") {
        const impliedFin = addWorkingDays(predDates.fechaInicio, p.lag);
        impliedComienzo = addWorkingDays(impliedFin, -duracion);
      } else {
        // FC (Fin-a-Comienzo), el default de Project
        impliedComienzo = addWorkingDays(predDates.fechaFin, p.lag);
      }
      if (!comienzo || impliedComienzo > comienzo) comienzo = impliedComienzo;
    });
    resolving.delete(t.id);
    const fin = addWorkingDays(comienzo, duracion);
    const r = { fechaInicio: comienzo, fechaFin: fin };
    resolved.set(t.id, r);
    return r;
  };

  const withPredecessors = tasks.map((t) => {
    const r = resolveTask(t);
    return r.fechaInicio === t.fechaInicio && r.fechaFin === t.fechaFin ? t : { ...t, ...r };
  });

  // Las filas "Grupo" (fase/categoría) toman su fecha de inicio/fin del min/max de las tareas que
  // le siguen hasta el próximo grupo — igual que un resumen de Project, que se ajusta solo cuando
  // sus hijas cambian de fecha por la cascada de predecesoras.
  const result = [...withPredecessors];
  for (let i = 0; i < result.length; i++) {
    if (!result[i].esGrupo) continue;
    let minInicio = null;
    let maxFin = null;
    for (let j = i + 1; j < result.length && !result[j].esGrupo; j++) {
      const child = result[j];
      if (child.fechaInicio && (!minInicio || child.fechaInicio < minInicio)) minInicio = child.fechaInicio;
      if (child.fechaFin && (!maxFin || child.fechaFin > maxFin)) maxFin = child.fechaFin;
    }
    if (minInicio && maxFin && (result[i].fechaInicio !== minInicio || result[i].fechaFin !== maxFin)) {
      result[i] = { ...result[i], fechaInicio: minInicio, fechaFin: maxFin };
    }
  }
  return result;
}

// Ruta crítica aproximada: para cada tarea con predecesoras, identifica cuál de ellas fue la que
// realmente definió su fecha de inicio (la que dio el máximo al calcular en computeCronogramaSchedule)
// — esa es su "predecesora crítica". Partiendo de la(s) tarea(s) que terminan más tarde (el fin del
// proyecto), se camina hacia atrás por esas predecesoras críticas: esa cadena es la ruta crítica.
// Como el motor mezcla tareas ancladas a mano con tareas auto-programadas, esto es una aproximación
// razonable (no un CPM completo con holguras) — solo cubre la parte que depende de predecesoras.
function computeCriticalPath(tasks) {
  const byDisplayId = new Map();
  tasks.forEach((t) => {
    const did = (t.displayId || "").trim();
    if (did && !byDisplayId.has(did)) byDisplayId.set(did, t);
  });

  const criticalPred = new Map(); // task.id -> id interno de su predecesora crítica, o null
  tasks.forEach((t) => {
    if (t.esGrupo) return;
    const preds = parsePredecesoras(t.predecesoras).filter((p) => byDisplayId.has(p.id));
    if (preds.length === 0) {
      criticalPred.set(t.id, null);
      return;
    }
    const duracion = parseDuracionDias(t.duracionTexto);
    let best = null;
    let bestComienzo = null;
    preds.forEach((p) => {
      const predTask = byDisplayId.get(p.id);
      let impliedComienzo;
      if (p.tipo === "CC") {
        impliedComienzo = addWorkingDays(predTask.fechaInicio, p.lag);
      } else if (p.tipo === "FF") {
        impliedComienzo = addWorkingDays(addWorkingDays(predTask.fechaFin, p.lag), -duracion);
      } else if (p.tipo === "CF") {
        impliedComienzo = addWorkingDays(addWorkingDays(predTask.fechaInicio, p.lag), -duracion);
      } else {
        impliedComienzo = addWorkingDays(predTask.fechaFin, p.lag);
      }
      if (!bestComienzo || impliedComienzo > bestComienzo) {
        bestComienzo = impliedComienzo;
        best = predTask.id;
      }
    });
    criticalPred.set(t.id, best);
  });

  const leaf = tasks.filter((t) => !t.esGrupo && t.fechaFin);
  if (leaf.length === 0) return new Set();
  const maxFin = leaf.reduce((m, t) => (t.fechaFin > m ? t.fechaFin : m), leaf[0].fechaFin);
  const ends = leaf.filter((t) => t.fechaFin === maxFin);

  const critical = new Set();
  ends.forEach((end) => {
    let cur = end.id;
    while (cur && !critical.has(cur)) {
      critical.add(cur);
      cur = criticalPred.get(cur);
    }
  });
  return critical;
}

const STATUS_LABELS = {
  no_iniciado: "No iniciado",
  radicado: "Radicado",
  incompleto: "Subsanación",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

function buildReportHTML(project, data) {
  const upmePct = upmeProgress(data.upme);
  const enerPct = energizacionProgress(data.energizacion);
  const now = new Date();

  const upmeHTML = upmeActiveSteps(data.upme).map((s) => {
    const st = data.upme.steps[s.id];
    const decisionHTML = s.decision
      ? `<div class="phase-meta">${escapeHTML(s.decision.question)}: <strong>${st.decision ? (st.decision === "si" ? "Sí" : "No") : "Sin definir"}</strong></div>`
      : "";
    return `
      <div class="phase-box">
        <div class="phase-head"><span>${s.num}. ${escapeHTML(s.label)}</span><span>${st.completado ? "Completado" : "Pendiente"}</span></div>
        <div class="phase-meta">Fecha: ${fmtDate(st.fecha)}</div>
        ${decisionHTML}
        ${st.notas ? `<div class="phase-meta" style="margin-top:6px">Notas: ${escapeHTML(st.notas)}</div>` : ""}
      </div>`;
  }).join("");

  let cursor = 0;
  const enerHTML = ENERGIZACION_GROUPS.map((g) => {
    const start = cursor;
    cursor += g.items.length;
    const groupCost = g.items.reduce((s, it) => s + it.cost, 0);
    const doneCost = g.items.reduce((s, it, j) => s + (data.energizacion.milestones[start + j]?.done ? it.cost : 0), 0);
    const groupPct = groupCost ? Math.round((doneCost / groupCost) * 100) : 100;
    const rows = g.items
      .map((it, j) => {
        const state = data.energizacion.milestones[start + j];
        return `<tr>
          <td>${state?.done ? "☑" : "☐"}</td>
          <td>${escapeHTML(it.title)}</td>
          <td>${it.day}</td>
          <td>${it.cost}</td>
          <td>${state?.done ? fmtDate(state.fecha) : "—"}</td>
        </tr>`;
      })
      .join("");
    return `
      <div class="group-box">
        <div class="group-head"><span>${escapeHTML(g.label)}</span><span>${groupPct}% · peso ${groupCost}</span></div>
        <table>
          <thead><tr><th>Estado</th><th>Actividad</th><th>Día</th><th>Peso</th><th>Fecha</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>${escapeHTML(project.name)} — Reporte</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1A1A1A; background:#fff; padding: 24px 30px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .meta { font-size: 11px; color: #555; margin-bottom: 4px; }
  .gen-at { font-size: 10px; color: #888; margin-bottom: 18px; }
  h2 { font-size: 15px; margin: 22px 0 4px; border-bottom: 2px solid #1A1A1A; padding-bottom: 4px; }
  .phase-box { border: 1px solid #ccc; border-radius: 6px; padding: 10px 14px; margin-bottom: 10px; break-inside: avoid; }
  .phase-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 12.5px; margin-bottom: 4px; }
  .phase-meta { font-size: 10.5px; color: #555; margin-bottom: 6px; }
  .check-row { font-size: 11px; padding: 2px 0; }
  .group-box { margin-bottom: 14px; break-inside: avoid; }
  .group-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 12px; background: #f0f0f0; padding: 5px 10px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 4px; }
  th { text-align: left; padding: 3px 8px; border-bottom: 1px solid #ccc; color: #555; font-weight: 600; }
  td { padding: 3px 8px; border-bottom: 1px solid #eee; }
  .hint { margin: 18px 0; padding: 10px 14px; background: #FFF7E0; border: 1px solid #F0D98C; border-radius: 6px; font-size: 11px; }
  @media print { .hint { display: none; } }
</style>
</head>
<body>
  <div class="hint">Para guardar como PDF: usa Ctrl+P (o Cmd+P en Mac) y elige "Guardar como PDF".</div>
  <h1>${escapeHTML(project.name)}</h1>
  <div class="meta">${project.capacity ? `${escapeHTML(project.capacity)} MWp` : ""}${project.location ? `  ·  ${escapeHTML(project.location)}` : ""}</div>
  <div class="gen-at">Reporte generado el ${fmtDateTime(now)}</div>
  <h2>Radicación UPME — ${upmePct}% completado</h2>
  ${upmeHTML}
  <h2>Energización — ${enerPct}% completado (ponderado por costo)</h2>
  ${enerHTML}
</body>
</html>`;
}

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Devuelve solo los pasos que aplican según las decisiones tomadas en los pasos 6 y 9
// (excluye 7-8 si la primera revisión se cumplió, y 10-11 si no hubo comentarios para subsanar)
function upmeActiveSteps(upme) {
  return UPME_STEPS.filter((s) => !(s.skipIf && s.skipIf(upme)));
}
function upmeProgress(upme) {
  const active = upmeActiveSteps(upme);
  const done = active.filter((s) => upme.steps[s.id]?.completado).length;
  return active.length ? Math.round((done / active.length) * 100) : 0;
}
function upmeNextStep(upme) {
  const active = upmeActiveSteps(upme);
  return active.find((s) => !upme.steps[s.id]?.completado) || null;
}
function energizacionProgress(ener) {
  let doneCost = 0;
  ENERGIZACION_MILESTONES.forEach((m, i) => {
    if (ener.milestones[i]?.done) doneCost += m.cost;
  });
  return ENERGIZACION_TOTAL_COST ? Math.round((doneCost / ENERGIZACION_TOTAL_COST) * 100) : 0;
}
function nextEnergizacionMilestone(ener) {
  let best = null;
  ENERGIZACION_MILESTONES.forEach((m, i) => {
    if (!ener.milestones[i]?.done) {
      if (!best || m.day < best.day) best = { ...m, idx: i };
    }
  });
  if (!best) return null;
  // Sin fecha de inicio todavía no hay "atraso" que avisar — apenas se asigne, empieza a contar.
  if (!ener.fechaInicio) return { ...best, delayed: false };
  const elapsed = daysBetween(ener.fechaInicio, todayISO());
  return { ...best, delayed: elapsed > best.day };
}

export {
  UPME_STEPS,
  ENERGIZACION_GROUPS,
  ENERGIZACION_MILESTONES,
  ENERGIZACION_TOTAL_COST,
  PRESUPUESTO_BASE_TEMPLATE,
  buildPresupuestoBaseFromTemplate,
  CRONOGRAMA_BASE_TEMPLATE,
  buildCronogramaBaseFromTemplate,
  CAT_STYLE,
  STATUS_LABELS,
  uid,
  todayISO,
  daysBetween,
  addYears,
  fmtDate,
  fmtTime,
  fmtDateTime,
  emptyUpmeState,
  emptyEnergizacionState,
  emptyCronogramaState,
  emptyPresupuestoState,
  emptyPagosState,
  emptyProjectData,
  ensureFullProjectData,
  fractionElapsed,
  cronogramaPesoTotal,
  buildCurvaSData,
  parseProjectDate,
  cronogramaAvanceActual,
  parseCronogramaPaste,
  matchCronogramaTasks,
  applyCronogramaMerge,
  parseDuracionDias,
  parsePredecesoras,
  addWorkingDays,
  computeCronogramaSchedule,
  computeCriticalPath,
  buildReportHTML,
  escapeHTML,
  upmeProgress,
  upmeActiveSteps,
  upmeNextStep,
  energizacionProgress,
  nextEnergizacionMilestone,
  presupuestoTotals,
  presupuestoListTotal,
  groupPresupuestoItems,
  calcPresupuestoItem,
  parsePresupuestoPaste,
  parseColombianNumber,
  ordenPagado,
  ordenProgramado,
  ordenSaldo,
  pagosTotals,
  pagosProximosAlertas,
  fmtMoney,
};
