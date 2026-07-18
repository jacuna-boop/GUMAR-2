# Control de Parques Solares — contexto del proyecto

Este archivo es para que Claude (vía Claude Code) tenga contexto completo del proyecto sin que Juan tenga
que volver a explicar toda la historia. Léelo antes de hacer cambios.

## Qué es esto

CRM interno para que el equipo de Juan (empresa de energía solar en Colombia) lleve el seguimiento de
varios proyectos de parques solares en simultáneo, a través de 6 módulos por proyecto:

1. **UPME** — trámite de beneficios tributarios ante la UPME. 12 pasos secuenciales con dos bifurcaciones
   condicionales (ver `UPME_STEPS` en `src/lib/data.js`).
2. **Energización** — 73 actividades reguladas (cartas 9.x, trámites OR/XM) ponderadas por costo real
   (tomado de la Curva S del cliente). Ver `ENERGIZACION_GROUPS`.
3. **Cronograma** — cronograma de obra con línea base vs. seguimiento real (curva S de construcción).
   Soporta pegar filas copiadas desde MS Project (columnas: Id, Nombre, Duración, Comienzo, Fin,
   Predecesoras, % completado). Las filas de "categoría/fase" se detectan porque su duración no es
   "0 días" (heurística, editable a mano con la casilla "Grupo").
4. **Presupuesto** — dos listas paralelas (`base` y `ejecucion`) de ítems con Item/Descripción/Cantidad/
   Unidad/Valor unitario/IVA%. Al crear un ítem en base, se replica automáticamente en ejecución (mismo
   `id`, en $0) — ver `addBaseItem`/`addBaseItems` en `PresupuestoModule`. Los campos de identidad
   (item/categoría/descripción/unidad) se sincronizan si se editan desde base; cantidad/valor quedan
   independientes. Soporta pegar filas desde Excel.
5. **Pagos** — órdenes de servicio con pagos individuales que pueden estar en estado "pagado" o
   "programado" (para alertas de vencimiento próximo).
6. **Resumen** (por proyecto) y **Resumen general** (todos los proyectos) — dashboards con tarjetas
   clicables que navegan a la pestaña correspondiente, y alertas agregadas.

## Stack

- **Vite + React** (JS, no TypeScript) — SPA de una sola página, sin router de URL (la navegación es
  por estado de React: `view` = "overview" | "project", `tab` = "resumen" | "upme" | etc.)
- **Supabase** — Postgres + Auth (email/password) + Realtime. Tablas: `projects`, `project_data`
  (una fila por proyecto, con columnas jsonb: `upme`, `energizacion`, `cronograma`, `presupuesto`, `pagos`),
  `profiles`. Ver `supabase/schema.sql`.
- **Vercel** — hosting. Proyecto real en Vercel se llama **`gumar-2`**, dominio **`gumar-2.vercel.app`**.
  (Existe un proyecto viejo `gumar` en Vercel que ya no se usa — se puede borrar.)
- **Recharts** — gráficas (curva S de cronograma, comparación de presupuesto por actividad).
- **lucide-react** — iconos.

## Estructura de archivos

```
src/
  App.jsx              # TODO el UI vive aquí (un solo archivo grande, a propósito — ver nota abajo)
  main.jsx             # entry point
  index.css            # estilos globales + media queries de impresión/responsive
  lib/
    data.js            # constantes de negocio (UPME_STEPS, ENERGIZACION_GROUPS...) + funciones puras
                        # (cálculos de progreso, parsers de "pegar desde Excel/Project", helpers de fecha)
    supabaseClient.js   # cliente de Supabase (lee VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
  components/
    Login.jsx           # pantalla de login/signup con Supabase Auth
supabase/
  schema.sql             # esquema completo (para instalaciones nuevas) — OJO: no siempre refleja
                          # migraciones incrementales que se corrieron directo en el SQL Editor de
                          # Supabase (ver "Migraciones pendientes de documentar" abajo)
```

**Nota sobre `App.jsx` siendo un solo archivo enorme:** fue deliberado durante el desarrollo iterativo
vía chat (evitar wiring de imports entre muchos archivos pequeños cuando cada cambio se pegaba a mano).
Con Claude Code ya no aplica esa restricción — si tiene sentido dividirlo en componentes/archivos más
chicos para facilidad de mantenimiento, adelante, es una mejora razonable a considerar.

## Convenciones importantes del modelo de datos

- **`ensureFullProjectData(data)`** en `data.js` es crítico: Postgres devuelve `'{}'::jsonb` (objeto vacío,
  truthy) como default de columna, no `null`. Cada campo se valida por su forma interna esperada
  (ej. `Array.isArray(rawPagos.ordenes)`) antes de aceptarlo, si no cae a `emptyXState()`. Si agregas un
  campo nuevo a algún módulo, sigue este mismo patrón o vas a romper proyectos existentes con pantalla en
  negro (ya pasó dos veces).
- **Guardado con debounce**: `updateProjectData` en `Dashboard` no guarda en cada tecla — usa un debounce
  de 700ms por proyecto (`saveTimers`/`pendingData` refs) para no saturar Supabase. Al guardar, se hace
  `.select().maybeSingle()` después del upsert para detectar escrituras "fantasma" (0 filas afectadas por
  RLS) que de otra forma parecen exitosas pero no persisten.
- **Realtime**: hay una suscripción a `postgres_changes` en `projects` y `project_data`, pero se
  **ignora explícitamente** para el proyecto que la persona tiene abierto en ese momento
  (`selectedIdRef`), para evitar que un eco de tu propio guardado sobrescriba una edición en curso.
- **Vinculación Presupuesto base ↔ ejecución**: los ítems comparten el mismo `id` entre ambas listas
  cuando se crean desde "base". Borrar un ítem de base también borra su par en ejecución *solo si* ese
  par sigue en $0 (nadie ha registrado nada real todavía).

## Cómo se despliega

1. Cambios de código → commit + push a la rama `main` del repo de GitHub conectado a Vercel
   (`jacuna-boop/GUMAR-2`).
2. Vercel detecta el push y despliega solo a `gumar-2.vercel.app`.
3. Cambios de **esquema de base de datos** (columnas nuevas, etc.) van aparte, corridos a mano en
   Supabase → SQL Editor. **Esto no se automatiza** — si agregas un campo nuevo al modelo de datos que
   requiere columna nueva, dile a Juan el SQL exacto para correr, o dile explícitamente que no hace falta
   si reutilizas una columna jsonb existente.

## Migraciones pendientes de documentar en schema.sql

Estas se corrieron directo en Supabase durante el desarrollo, y `schema.sql` ya las incluye para
instalaciones nuevas, pero si clonas una base de datos vieja revisa que existan:
```sql
alter table project_data add column if not exists presupuesto jsonb not null default '{}'::jsonb;
alter table project_data add column if not exists pagos jsonb not null default '{}'::jsonb;
```

- **Roles de permisos (`profiles.role`)**: agregado para distinguir admin (puede borrar proyectos) /
  editor (puede editar todo menos borrar proyectos) / lector (solo ver y exportar). Ver el bloque
  completo de columna + políticas RLS en `supabase/schema.sql`. Si clonas una base vieja, corre ese
  bloque a mano y luego promueve al admin real:
  ```sql
  update profiles set role = 'admin' where email = 'j.acuna@gumarp.com.co';
  ```
  El default de la columna es `'editor'`, así que nadie más pierde acceso al correr la migración.
  La UI del cliente lee `profiles.role` al iniciar sesión (`Dashboard` en `App.jsx`) y oculta/
  deshabilita controles según el rol, pero **la restricción real la hacen las políticas RLS** — la UI
  es solo para no confundir a quien no debería editar.

## Historial de decisiones de producto (por si preguntan "por qué está así")

- El proyecto empezó como un artifact de Claude.ai (sandbox), migró a esta web app real por las
  limitaciones del sandbox: sin descargas de archivo reales, sin `window.print()`, sin `window.confirm()`.
  Todo eso ahora funciona normal porque es un sitio web real.
- El módulo UPME se rediseñó por completo una vez: pasó de "3 fases de registro de proyecto" genéricas
  (basadas en investigación propia sobre Resolución UPME 749/2025) a los 12 pasos reales de beneficios
  tributarios que Juan describió, con dos bifurcaciones condicionales. Si Juan menciona "las 3 fases
  viejas de UPME", es ese modelo anterior — ya no existe en el código.
- La exportación a PDF no genera un PDF directamente (no hay librería de PDF en el stack) — usa vistas
  imprimibles con estilos claros (`prCard`) + `window.print()`, y la persona elige "Guardar como PDF" en
  el diálogo de impresión del navegador. Desde el botón "Exportar PDF" de un proyecto se puede elegir
  entre: Resumen del proyecto, la pestaña actual, o el Resumen general.

## Estilo de código / diseño

- Todo el styling es objetos JS inline (`style={styles.algo}`), no Tailwind ni CSS modules — es
  deliberado (se evaluó Tailwind al inicio y se descartó para minimizar piezas móviles). Tema oscuro para
  la app (`#0F1417` de fondo, acentos: azul `#4FA8D8` UPME, amarillo `#F5B942` Energización, verde
  `#7FD08A` Presupuesto, rosa `#E77DA8` Pagos), tema claro para las vistas de impresión (`prCard`).
- Tipografías: Space Grotesk (display/títulos), Inter (cuerpo), JetBrains Mono (números, fechas, dinero).
