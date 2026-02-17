import { useState } from "react";
import AuthProvider, { useAuth } from "./AuthProvider";
import LoginPage from "./LoginPage";
import WetCheckApp from "./WetCheckApp";
import AdminDashboard from "./AdminDashboard";

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
