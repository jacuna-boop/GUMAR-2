import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
