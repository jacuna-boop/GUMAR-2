# Control de Parques Solares — Web App

App real (no un artifact de chat) para llevar el seguimiento de:
- Radicación ante la UPME (3 fases, checklist, vigencias)
- Energización (73 actividades ponderadas por costo real, según tu Curva S)
- Cronograma de obra + Curva S de construcción (línea base vs. seguimiento real)
- Resumen general de todos los proyectos
- Login real por persona, datos compartidos por tu equipo, cambios en vivo
- Exportar/Importar JSON (descarga real) y "Exportar PDF" con impresión del navegador

Stack: **Vite + React** (frontend) + **Supabase** (base de datos, autenticación, tiempo real) + **Vercel** (hosting gratuito).

No necesitas saber programar para desplegarla — son formularios y copiar/pegar claves. Toma unos 15-20 minutos la primera vez.

---

## Paso 1 — Crear el proyecto en Supabase (base de datos + login)

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratis (puedes usar tu correo o GitHub).
2. Clic en **New Project**. Ponle un nombre (ej. `parques-solares`), elige una contraseña de base de datos (guárdala) y una región cercana (ej. São Paulo).
3. Espera 1-2 minutos a que el proyecto se cree.
4. En el menú izquierdo, ve a **SQL Editor** → **New query**.
5. Abre el archivo `supabase/schema.sql` de esta carpeta, copia **todo** su contenido, pégalo en el editor y dale **Run**. Esto crea las tablas, la seguridad por usuario y el tiempo real.
6. Ve a **Project Settings** (ícono de engranaje) → **API**. Copia dos valores, los vas a necesitar en el Paso 3:
   - **Project URL**
   - **anon public key**

### Opcional pero recomendado: desactivar registro abierto
Por defecto cualquiera con el link podría crear una cuenta. Si prefieres invitar tú mismo a tu equipo:
- Ve a **Authentication** → **Providers** → **Email**, y desactiva "Allow new users to sign up".
- Luego, en **Authentication** → **Users**, usa **Add user** para crear las cuentas de tu equipo manualmente (con la contraseña que definas).

---

## Paso 2 — Probarlo en tu computador (opcional)

Si tienes Node.js instalado:

```bash
npm install
cp .env.local.example .env.local
# edita .env.local y pega tu Project URL y anon key del Paso 1
npm run dev
```

Abre el link que aparece (normalmente `http://localhost:5173`).

Si prefieres saltar directo a producción, continúa al Paso 3.

---

## Paso 3 — Publicarlo en Vercel (gratis)

1. Ve a [vercel.com](https://vercel.com) y crea una cuenta (puedes usar GitHub, GitLab o correo).
2. Sube esta carpeta a un repositorio en GitHub (la forma más simple: crea un repo nuevo en GitHub, sube estos archivos con "Add file → Upload files" desde el navegador, sin necesidad de usar git en la terminal).
3. En Vercel, clic en **Add New → Project**, elige el repositorio que acabas de subir.
4. En **Environment Variables**, agrega:
   - `VITE_SUPABASE_URL` → tu Project URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` → tu anon public key de Supabase
5. Clic en **Deploy**. En 1-2 minutos tendrás un link público (algo como `parques-solares.vercel.app`).

Ese es el link que compartes con tu equipo.

---

## Paso 4 — Migrar tus datos actuales

Si ya habías registrado avances en la versión anterior (el artifact de Claude):

1. Abre la versión anterior y usa **"Exportar datos"** (te da el JSON para copiar).
2. Copia ese contenido.
3. En la nueva web app, inicia sesión, usa **"Importar pegando texto"** en la barra lateral, pega el contenido y confirma.

Esto crea los proyectos de nuevo con toda tu información (fases UPME, actividades de energización marcadas, cronograma).

---

## Cómo usar la app día a día

- **Crear cuenta / iniciar sesión**: cada persona de tu equipo entra con su propio correo y contraseña.
- **Resumen general**: ve el avance de todos los proyectos de un vistazo.
- **Por proyecto**: pestañas de Radicación UPME, Energización y Cronograma (curva S).
- **Guardado**: automático en cada cambio; el botón "Guardado [hora]" fuerza un guardado inmediato.
- **Exportar PDF**: abre el diálogo de impresión de tu navegador — elige "Guardar como PDF".
- **Exportar datos**: descarga un `.json` de respaldo con todo.
- **Tiempo real**: si dos personas tienen la app abierta, los cambios de una aparecen en la pantalla de la otra sin recargar.

---

## Si algo no funciona

- **"Faltan variables de entorno"** en la consola del navegador → revisa que `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` estén bien copiados (sin espacios de más) en Vercel o en tu `.env.local`.
- **No puedo iniciar sesión** → confirma en Supabase, **Authentication → Users**, que tu usuario existe y está confirmado.
- **No veo los proyectos de un compañero** → confirma que ambos ejecutaron el mismo `schema.sql` (mismo proyecto Supabase) y que iniciaron sesión con cuentas creadas ahí.
- Para cualquier cambio futuro a la app (nuevas columnas, nuevas fases, ajustes visuales), puedes volver a pedírmelo — trabajamos sobre este mismo código.
