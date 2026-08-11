import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import gumarLogo from "../assets/gumar-logo.jpg";

const BRAND_DARK = "#6B8E89";
const BRAND_LIGHT = "#A9D3C4";

// Solo el equipo de Gumar puede registrarse solo — esto es una primera valla en el navegador,
// pero la de verdad está en el trigger handle_new_user() de la base de datos (ver schema.sql),
// que rechaza el registro aunque alguien se salte esta pantalla y llame a la API directo.
const ALLOWED_EMAIL_DOMAIN = "@gumarp.com.co";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (mode === "signup" && !email.trim().toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
      setError(`El registro solo está disponible para correos ${ALLOWED_EMAIL_DOMAIN}.`);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setInfo("Cuenta creada. Si tu proyecto de Supabase pide confirmación por correo, revisa tu bandeja; si no, ya puedes iniciar sesión.");
        setMode("signin");
      }
    } catch (err) {
      setError(err.message || "Ocurrió un error. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <img src={gumarLogo} alt="Gumar Proyectos" style={styles.brandLogo} />
          <div style={styles.title}>Control de Parques Solares</div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === "signup" && (
            <label style={styles.field}>
              <span>Nombre</span>
              <input style={styles.input} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
          )}
          <label style={styles.field}>
            <span>Correo</span>
            <input type="email" style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label style={styles.field}>
            <span>Contraseña</span>
            <input
              type="password"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </label>

          {error && <div style={styles.error}>{error}</div>}
          {info && <div style={styles.info}>{info}</div>}

          <button type="submit" style={styles.submitBtn} disabled={loading}>
            {loading ? "Un momento…" : mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
          </button>
        </form>

        <button
          style={styles.toggleBtn}
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
            setInfo("");
          }}
        >
          {mode === "signin" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Iniciar sesión"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: BRAND_DARK, padding: 20,
  },
  card: {
    width: 360, maxWidth: "100%", background: "#F2F6F4", border: "1px solid #8FBBAC",
    borderRadius: 14, padding: 28,
  },
  brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 },
  brandLogo: { width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 },
  title: { fontFamily: "'Montserrat', sans-serif", fontSize: 17, fontWeight: 600, color: "#22312D" },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#3E5850", fontFamily: "'Lato', sans-serif" },
  input: {
    background: "#FFFFFF", color: "#22312D", border: "1px solid #8FBBAC", borderRadius: 8,
    padding: "9px 11px", fontSize: 13, fontFamily: "'Lato', sans-serif",
  },
  error: { fontSize: 12, color: "#B3261E", background: "#FBE4E1", border: "1px solid #E2604F", borderRadius: 8, padding: "8px 10px" },
  info: { fontSize: 12, color: "#1F5C43", background: "#D9F5E6", border: "1px solid #6B8E89", borderRadius: 8, padding: "8px 10px" },
  submitBtn: {
    background: BRAND_DARK, color: "#FFFFFF", border: "none", borderRadius: 8, padding: "10px 12px",
    fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Lato', sans-serif", marginTop: 4,
  },
  toggleBtn: {
    background: "none", border: "none", color: "#3E5850", fontSize: 12, cursor: "pointer",
    marginTop: 16, width: "100%", textAlign: "center", textDecoration: "underline", fontFamily: "'Lato', sans-serif",
  },
};
