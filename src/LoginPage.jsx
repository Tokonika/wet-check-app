import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "./firebase";

export default function LoginPage() {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const friendlyError = (code) => {
    const map = {
      "auth/invalid-email": "Invalid email address.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Please try again later.",
    };
    return map[code] || "Something went wrong. Please try again.";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (mode === "reset") {
      if (!email) { setError("Please enter your email."); return; }
      setLoading(true);
      try {
        await sendPasswordResetEmail(auth, email);
        setMessage("Password reset email sent! Check your inbox.");
      } catch (err) {
        setError(friendlyError(err.code));
      }
      setLoading(false);
      return;
    }

    if (!email || !password) { setError("Please fill in all fields."); return; }
    if (mode === "signup" && password !== confirm) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(friendlyError(err.code));
    }
    setLoading(false);
  };

  const S = {
    wrapper: {
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #1a3a5c, #2d6da8)", fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: 20,
    },
    card: {
      background: "#fff", borderRadius: 16, padding: "36px 28px", width: "100%", maxWidth: 380,
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    },
    title: { fontSize: 24, fontWeight: 800, color: "#1a3a5c", textAlign: "center", marginBottom: 4 },
    subtitle: { fontSize: 13, color: "#888", textAlign: "center", marginBottom: 24 },
    label: { display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 },
    input: {
      width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #ddd",
      fontSize: 15, background: "#fff", boxSizing: "border-box", outline: "none", marginBottom: 14,
    },
    btn: {
      width: "100%", padding: 14, borderRadius: 12, border: "none", background: "#1a3a5c",
      color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 4,
    },
    link: { background: "none", border: "none", color: "#2d6da8", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 },
    error: { background: "#fef2f2", color: "#d32f2f", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14 },
    success: { background: "#e8f0f8", color: "#1a3a5c", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14 },
    footer: { display: "flex", justifyContent: "center", gap: 4, marginTop: 18, fontSize: 13, color: "#888" },
  };

  return (
    <div style={S.wrapper}>
      <div style={S.card}>
        <div style={S.title}>
          {mode === "login" ? "Welcome Back" : mode === "signup" ? "Create Account" : "Reset Password"}
        </div>
        <div style={S.subtitle}>
          {mode === "login" ? "Sign in to Wet Check App" : mode === "signup" ? "Sign up to get started" : "Enter your email to reset"}
        </div>

        {error && <div style={S.error}>{error}</div>}
        {message && <div style={S.success}>{message}</div>}

        <form onSubmit={handleSubmit}>
          <label style={S.label}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" style={S.input} autoComplete="email" />

          {mode !== "reset" && (
            <>
              <label style={S.label}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" style={S.input} autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </>
          )}

          {mode === "signup" && (
            <>
              <label style={S.label}>Confirm Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••" style={S.input} autoComplete="new-password" />
            </>
          )}

          <button type="submit" disabled={loading} style={{ ...S.btn, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : mode === "signup" ? "Sign Up" : "Send Reset Email"}
          </button>
        </form>

        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button onClick={() => { setMode("reset"); setError(""); setMessage(""); }} style={S.link}>Forgot password?</button>
          </div>
        )}

        <div style={S.footer}>
          {mode === "login" ? (
            <>
              <span>Don't have an account?</span>
              <button onClick={() => { setMode("signup"); setError(""); setMessage(""); }} style={S.link}>Sign Up</button>
            </>
          ) : (
            <>
              <span>Already have an account?</span>
              <button onClick={() => { setMode("login"); setError(""); setMessage(""); }} style={S.link}>Sign In</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
