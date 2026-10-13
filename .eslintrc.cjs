// Revisión de código (npm run lint). Se enfoca en errores reales, no en estilo:
// - variables o componentes usados sin importar (al mover código entre archivos el build NO lo
//   detecta: revienta recién al abrir la pestaña en el navegador);
// - hooks de React llamados en un orden que cambia entre renders.
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["react", "react-hooks"],
  settings: { react: { version: "18.3" } },
  ignorePatterns: ["dist/", "node_modules/"],
  rules: {
    "no-undef": "error",
    "react/jsx-no-undef": "error",
    "react/jsx-uses-vars": "error",
    "react/jsx-uses-react": "error",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "off",
    "no-unused-vars": ["warn", { vars: "all", args: "none", varsIgnorePattern: "^_" }],
  },
  overrides: [
    { files: ["**/*.test.js", "supabase/tests/**"], env: { node: true } },
  ],
};
