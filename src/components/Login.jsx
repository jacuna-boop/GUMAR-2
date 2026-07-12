import { useState } from "react";
import { Sun } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

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
          <Sun size={24} color="#F5B942" />
          <div>
            <div style={styles.title}>Control de Parques</div>
            <div style={styles.sub}>UPME · Energización · Cronograma</div>
          </div>
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
              minLength={6}
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
    background: "#0F1417", padding: 20,
  },
  card: {
    width: 360, maxWidth: "100%", background: "#171E23", border: "1px solid #232D33",
    borderRadius: 14, padding: 28,
  },
  brand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 600, color: "#E8EDEF" },
  sub: { fontSize: 11.5, color: "#7A8A93", marginTop: 2 },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#7A8A93" },
  input: {
    background: "#1C242A", color: "#E8EDEF", border: "1px solid #2A3339", borderRadius: 8,
    padding: "9px 11px", fontSize: 13, fontFamily: "'Inter', sans-serif",
  },
  error: { fontSize: 12, color: "#E2604F", background: "#2E1520", border: "1px solid #4A2430", borderRadius: 8, padding: "8px 10px" },
  info: { fontSize: 12, color: "#5FBF8F", background: "#12241C", border: "1px solid #244A34", borderRadius: 8, padding: "8px 10px" },
  submitBtn: {
    background: "#F5B942", color: "#161311", border: "none", borderRadius: 8, padding: "10px 12px",
    fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif", marginTop: 4,
  },
  toggleBtn: {
    background: "none", border: "none", color: "#7A8A93", fontSize: 12, cursor: "pointer",
    marginTop: 16, width: "100%", textAlign: "center", textDecoration: "underline",
  },
};
