import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore/lite";
import { db } from "./firebase";
import { useAuth } from "./AuthProvider";

export default function AdminDashboard({ onEnterApp }) {
  const { logout, profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
        setUsers(list);
      } catch (err) {
        console.error("Failed to load users:", err);
      }
      setLoading(false);
    })();
  }, []);

  const S = {
    wrapper: {
      maxWidth: 640, margin: "0 auto", minHeight: "100vh", background: "#fafafa",
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    header: {
      background: "linear-gradient(135deg, #1a3a5c, #2d6da8)", color: "#fff",
      padding: "20px 24px 16px",
    },
    title: { fontSize: 20, fontWeight: 800, letterSpacing: 0.5 },
    subtitle: { fontSize: 12, opacity: 0.85, marginTop: 4 },
    btn: {
      background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
      fontSize: 12, padding: "8px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 600,
    },
    card: {
      background: "#fff", borderRadius: 12, padding: 16, marginBottom: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #eee",
    },
    badge: {
      display: "inline-block", padding: "2px 10px", borderRadius: 12,
      fontSize: 11, fontWeight: 700, color: "#fff",
    },
  };

  return (
    <div style={S.wrapper}>
      <div style={S.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={S.title}>Admin Dashboard</div>
            <div style={S.subtitle}>Manage registered companies</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onEnterApp} style={S.btn}>Open App</button>
            <button onClick={logout} style={S.btn}>Logout</button>
          </div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a3a5c", marginBottom: 12 }}>
          Registered Users ({users.length})
        </div>

        {loading && <div style={{ textAlign: "center", color: "#888", padding: 40 }}>Loading...</div>}

        {!loading && users.length === 0 && (
          <div style={{ textAlign: "center", color: "#888", padding: 40 }}>No users registered yet.</div>
        )}

        {users.map((u) => (
          <div key={u.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>
                {u.company?.name || "No company set"}
              </div>
              <span style={{
                ...S.badge,
                background: u.role === "admin" ? "#1a3a5c" : "#2d6da8",
              }}>
                {u.role}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>{u.email}</div>
            {u.company?.phone && <div style={{ fontSize: 12, color: "#888" }}>Phone: {u.company.phone}</div>}
            {u.company?.website && <div style={{ fontSize: 12, color: "#888" }}>Web: {u.company.website}</div>}
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
              Joined: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Unknown"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
