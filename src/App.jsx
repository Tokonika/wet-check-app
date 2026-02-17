import AuthProvider, { useAuth } from "./AuthProvider";
import LoginPage from "./LoginPage";
import WetCheckApp from "./WetCheckApp";

function AppContent() {
  const { user, loading } = useAuth();

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

  return user ? <WetCheckApp /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
