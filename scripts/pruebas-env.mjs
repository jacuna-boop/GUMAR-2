// Escribe .env.pruebas.local con la URL y la llave pública del Supabase LOCAL (el que levanta
// "npm run pruebas:iniciar"), para que "npm run dev:pruebas" apunte ahí y no a producción.
import { execSync } from "node:child_process";
import fs from "node:fs";

const raw = execSync("npx -y supabase@2.98.2 status -o env", { encoding: "utf8" });
const vars = Object.fromEntries(
  raw.split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const url = vars.API_URL;
const key = vars.ANON_KEY || vars.PUBLISHABLE_KEY;
if (!url || !key || !/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  console.error("No se encontró un Supabase local corriendo. ¿Corriste npm run pruebas:iniciar?\n", raw);
  process.exit(1);
}
fs.writeFileSync(".env.pruebas.local", `# Generado por scripts/pruebas-env.mjs — Supabase LOCAL de pruebas\nVITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${key}\n`);
console.log(`Listo: .env.pruebas.local apunta a ${url}`);
console.log(`Panel de la base local (Studio): ${vars.STUDIO_URL || "http://127.0.0.1:54323"}`);
console.log("Ahora: npm run dev:pruebas  → http://localhost:5174");
