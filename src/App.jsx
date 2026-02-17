import { useState } from "react";
import AuthProvider, { useAuth } from "./AuthProvider";
import LoginPage from "./LoginPage";
import WetCheckApp from "./WetCheckApp";
import AdminDashboard from "./AdminDashboard";

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [adminView, setAdminView] = useState("dashboard"); // "dashboard" | "app"

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #1a3a5c, #2d6da8)", color: "#fff",
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 18, fontWeight: 600,
      }}>
        Loading...
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
