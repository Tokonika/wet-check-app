import { useState } from "react";
import AuthProvider, { useAuth } from "./AuthProvider";
import LoginPage from "./LoginPage";
import WetCheckApp from "./WetCheckApp";
import AdminDashboard from "./AdminDashboard";

// Screen shown to pending or suspended company users
function PendingScreen({ status, logout }) {
    const isPending = status === "pending";
    return (
          <div style={{
                  minHeight: "100vh",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(135deg, #1a3a5c, #2d6da8)",
                  color: "#fff",
                  fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  padding: 24,
                  textAlign: "center",
          }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>
                    {isPending ? "⏳" : "🚫"}
                  </div>div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                    {isPending ? "Account Pending Approval" : "Account Suspended"}
                  </div>div>
                  <div style={{ fontSize: 14, opacity: 0.85, maxWidth: 320, lineHeight: 1.6, marginBottom: 32 }}>
                    {isPending
                                ? "Your account is awaiting approval from the administrator. You will gain access once it's activated."
                                : "Your account has been suspended. Please contact the administrator for assistance."}
                  </div>div>
                  <button
                            onClick={logout}
                            style={{
                                        background: "rgba(255,255,255,0.2)",
                                        border: "1px solid rgba(255,255,255,0.4)",
                                        color: "#fff",
                                        fontSize: 14,
                                        padding: "10px 24px",
                                        borderRadius: 12,
                                        cursor: "pointer",
                                        fontWeight: 600,
                            }}
                          >
                          Logout
                  </button>button>
          </div>div>
        );
}

function AppContent() {
    const { user, profile, loading, logout } = useAuth();
    const [adminView, setAdminView] = useState("dashboard");
  
    if (loading) {
          return (
                  <div style={{
                            minHeight: "100vh",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "linear-gradient(135deg, #1a3a5c, #2d6da8)",
                            color: "#fff",
                            fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}>
                          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Wet Check App</div>div>
                          <div style={{ fontSize: 14, opacity: 0.8 }}>Loading...</div>div>
                  </div>div>
                );
    }
  
    if (!user) return <LoginPage />;
  
    // Admin goes to dashboard
    if (profile?.role === "admin" && adminView === "dashboard") {
          return <AdminDashboard onEnterApp={() => setAdminView("app")} />;
    }
  
    // Block pending or suspended company users
    if (profile?.role === "company" && (profile?.status === "pending" || !profile?.status)) {
          return <PendingScreen status="pending" logout={logout} />;
    }
    if (profile?.role === "company" && profile?.status === "suspended") {
          return <PendingScreen status="suspended" logout={logout} />;
    }
  
    return (
          <WetCheckApp
                  onBackToDashboard={profile?.role === "admin" ? () => setAdminView("dashboard") : null}
                />
        );
}

export default function App() {
    return (
          <AuthProvider>
                <AppContent />
          </AuthProvider>AuthProvider>
        );
}</button>
