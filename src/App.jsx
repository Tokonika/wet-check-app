import { useState } from "react";
import AuthProvider, { useAuth } from "./AuthProvider";
import LoginPage from "./LoginPage";
import WetCheckApp from "./WetCheckApp";
import AdminDashboard from "./AdminDashboard";

function DisabledScreen() {
  const { logout, profile } = useAuth();
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #1a3a5c, #2d6da8)", color: "#fff", padding: 24,
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "36px 28px", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>Account Disabled</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#d32f2f", marginBottom: 12 }}>Access Suspended</div>
        <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 20 }}>
          Your account ({profile?.email}) has been disabled by an administrator. Please contact your administrator to regain access.
        </div>
        <button onClick={logout} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "#1a3a5c", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
        }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [adminView, setAdminView] = useState("dashboard");

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #1a3a5c, #2d6da8)", color: "#fff",
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Wet Check App</div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>Loading...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // Block disabled users (but allow admins through even if somehow flagged)
  if (profile?.disabled && profile?.role !== "admin") {
    return <DisabledScreen />;
  }

  if (profile?.role === "admin" && adminView === "dashboard") {
    return <AdminDashboard onEnterApp={() => setAdminView("app")} />;
  }

  return <WetCheckApp onBackToDashboard={profile?.role === "admin" ? () => setAdminView("dashboard") : null} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
