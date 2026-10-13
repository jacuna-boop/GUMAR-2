import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Shows a clear error in the browser console instead of a silent failure
  console.error(
    "Faltan variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "Revisa tu archivo .env.local (desarrollo) o la configuración de variables en Vercel (producción)."
  );
}

// "npm run dev:pruebas" (modo "pruebas") tiene que apuntar al Supabase LOCAL. Si falta
// .env.pruebas.local, Vite caería en .env.local (producción) sin avisar: mejor detenerse.
if (import.meta.env.MODE === "pruebas" && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url || "")) {
  throw new Error("Modo pruebas sin Supabase local: corre npm run pruebas:iniciar (crea .env.pruebas.local). No se conecta a producción.");
}

export const supabase = createClient(url, anonKey);
