import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Las pruebas de SQL (supabase/tests) levantan cada una un Postgres en memoria (PGlite); con
    // muchos en paralelo los procesos de prueba se caían ("Worker exited unexpectedly").
    maxWorkers: 2,
  },
  build: {
    rollupOptions: {
      output: {
        // Librerías en archivos aparte: cambian poco, así el navegador las reutiliza de caché
        // entre despliegues y solo vuelve a descargar el código de la app.
        manualChunks: {
          supabase: ["@supabase/supabase-js"],
          charts: ["recharts"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});
