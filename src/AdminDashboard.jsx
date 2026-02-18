import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore/lite";
import { db } from "./firebase";
import { useAuth } from "./AuthProvider";

const STATUS_COLORS = {
      active: "#16a34a",
      trial: "#d97706",
      pending: "#6b7280",
      suspended: "#dc2626",
};

export default function AdminDashboard({ onEnterApp }) {
      const { logout } = useAuth();
      const [users, setUsers] = useState([]);
      const [loading, setLoading] = useState(true);
      const [updating, setUpdating] = useState(null);

  const loadUsers = async () => {
          try {
                    const snap = await getDocs(collection(db, "users"));
                    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                    list.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
                    setUsers(list);
          } catch (err) {
                    console.error("Failed to load users:", err);
          }
          setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const setStatus = async (userId, status) => {
          setUpdating(userId + status);
          try {
                    await updateDoc(doc(db, "users", userId), { status });
                    setUsers((prev) =>
                                prev.map((u) => (u.id === userId ? { ...u, status } : u))
                                   );
          } catch (err) {
                    console.error("Status update error:", err);
          }
          setUpdating(null);
  };

  const S = {
          wrapper: {
                    maxWidth: 640,
                    margin: "0 auto",
                    minHeight: "100vh",
                    background: "#fafafa",
                    fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          },
          header: {
                    background: "linear-gradient(135deg, #1a3a5c, #2d6da8)",
                    color: "#fff",
                    padding: "20px 24px 16px",
          },
          title: { fontSize: 20, fontWeight: 800, letterSpacing: 0.5 },
          subtitle: { fontSize: 12, opacity: 0.85, marginTop: 4 },
          btn: {
                    background: "rgba(255,255,255,0.2)",
                    border: "none",
                    color: "#fff",
                    fontSize: 12,
                    padding: "8px 14px",
                    borderRadius: 12,
                    cursor: "pointer",
                    fontWeight: 600,
          },
          card: {
                    background: "#fff",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 10,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    border: "1px solid #eee",
          },
          badge: {
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                    textTransform: "uppercase",
          },
          actionBtn: (color) => ({
                    background: color,
                    border: "none",
                    color: "#fff",
                    fontSize: 11,
                    padding: "5px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
          }),
  };

  const companyUsers = users.filter((u) => u.role !== "admin");
      const adminUsers = users.filter((u) => u.role === "admin");

  return (
          <div style={S.wrapper}>
                    <div style={S.header}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                              <div>
                                                          <div style={S.title}>Admin Dashboard</div>div>
                                                          <div style={S.subtitle}>Manage companies & memberships</div>div>
                                              </div>div>
                                          <div style={{ display: "flex", gap: 6 }}>
                                                      <button onClick={onEnterApp} style={S.btn}>Open App</button>button>
                                                      <button onClick={logout} style={S.btn}>Logout</button>button>
                                          </div>div>
                                </div>div>
                    </div>div>
          
                <div style={{ padding: 16 }}>
                    {/* Summary stats */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                            {[
              { label: "Total", count: companyUsers.length, color: "#1a3a5c" },
              { label: "Active", count: companyUsers.filter(u => u.status === "active").length, color: "#16a34a" },
              { label: "Trial", count: companyUsers.filter(u => u.status === "trial").length, color: "#d97706" },
              { label: "Pending", count: companyUsers.filter(u => u.status === "pending" || !u.status).length, color: "#6b7280" },
                        ].map((s) => (
                                        <div key={s.label} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "1px solid #eee" }}>
                                                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.count}</div>div>
                                                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{s.label}</div>div>
                                        </div>div>
                                      ))}
                        </div>div>
                
                    {/* Company users */}
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a3a5c", marginBottom: 10 }}>
                                  Companies ({companyUsers.length})
                        </div>div>
                
                    {loading && <div style={{ textAlign: "center", color: "#888", padding: 40 }}>Loading...</div>div>}
                    {!loading && companyUsers.length === 0 && (
                        <div style={{ textAlign: "center", color: "#888", padding: 40, background: "#fff", borderRadius: 12, border: "1px solid #eee" }}>
                                    No companies registered yet.
                        </div>div>
                        )}
                
                    {companyUsers.map((u) => {
                        const status = u.status || "pending";
                        return (
                                        <div key={u.id} style={S.card}>
                                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                                                      <div>
                                                                                        <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>
                                                                                            {u.company?.name || "No company set"}
                                                                                            </div>div>
                                                                                        <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>{u.email}</div>div>
                                                                      </div>div>
                                                                      <span style={{ ...S.badge, background: STATUS_COLORS[status] || "#6b7280" }}>
                                                                          {status}
                                                                      </span>span>
                                                      </div>div>
                                        
                                            {u.company?.phone && <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>📞 {u.company.phone}</div>div>}
                                            {u.company?.website && <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>🌐 {u.company.website}</div>div>}
                                                      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 10 }}>
                                                                      Joined: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Unknown"}
                                                      </div>div>
                                        
                                            {/* Action buttons */}
                                                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                                          {status !== "active" && (
                                                              <button style={S.actionBtn("#16a34a")} disabled={updating === u.id + "active"} onClick={() => setStatus(u.id, "active")}>
                                                                                  ✓ Activate
                                                              </button>button>
                                                                      )}
                                                          {status !== "trial" && (
                                                              <button style={S.actionBtn("#d97706")} disabled={updating === u.id + "trial"} onClick={() => setStatus(u.id, "trial")}>
                                                                                  ⏱ Trial
                                                              </button>button>
                                                                      )}
                                                          {status !== "suspended" && (
                                                              <button style={S.actionBtn("#dc2626")} disabled={updating === u.id + "suspended"} onClick={() => setStatus(u.id, "suspended")}>
                                                                                  ✗ Suspend
                                                              </button>button>
                                                                      )}
                                                          {status !== "pending" && (
                                                              <button style={S.actionBtn("#6b7280")} disabled={updating === u.id + "pending"} onClick={() => setStatus(u.id, "pending")}>
                                                                                  ↩ Set Pending
                                                              </button>button>
                                                                      )}
                                                      </div>div>
                                        </div>div>
                                      );
          })}
                
                    {/* Admin accounts (read only) */}
                    {adminUsers.length > 0 && (
                        <>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a3a5c", margin: "20px 0 10px" }}>
                                                  Admin Accounts ({adminUsers.length})
                                    </div>div>
                            {adminUsers.map((u) => (
                                          <div key={u.id} style={{ ...S.card, borderColor: "#2d6da8" }}>
                                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                                            <div>
                                                                                                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a3a5c" }}>{u.email}</div>div>
                                                                                                <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                                                                                                                      Joined: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Unknown"}
                                                                                                    </div>div>
                                                                            </div>div>
                                                                            <span style={{ ...S.badge, background: "#1a3a5c" }}>admin</span>span>
                                                          </div>div>
                                          </div>div>
                                        ))}
                        </>>
                      )}
                </div>div>
          </div>div>
        );
}</></div>
