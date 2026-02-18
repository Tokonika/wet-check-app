import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore/lite";
import { db } from "./firebase";
import { useAuth } from "./AuthProvider";

const ROLES = ["admin", "company"];

export default function AdminDashboard({ onEnterApp }) {
  const { logout, profile, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmAction, setConfirmAction] = useState(null); // { type, userId, label }
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState("users"); // "users" | "activity"

  // Load all users from Firestore
  const loadUsers = async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setUsers(list);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Filter and search
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && u.disabled) return false;
      if (statusFilter === "disabled" && !u.disabled) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchEmail = (u.email || "").toLowerCase().includes(q);
        const matchCompany = (u.company?.name || "").toLowerCase().includes(q);
        if (!matchEmail && !matchCompany) return false;
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, search]);

  // Stats
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === "admin").length;
    const companies = users.filter((u) => u.role === "company").length;
    const active = users.filter((u) => !u.disabled).length;
    const disabled = users.filter((u) => u.disabled).length;
    return { total, admins, companies, active, disabled };
  }, [users]);

  // ---- Actions ----

  const changeRole = async (userId, newRole) => {
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "users", userId), { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (err) {
      alert("Failed to update role: " + err.message);
    }
    setActionLoading(false);
    setConfirmAction(null);
  };

  const toggleDisabled = async (userId, currentlyDisabled) => {
    setActionLoading(true);
    try {
      const newVal = !currentlyDisabled;
      await updateDoc(doc(db, "users", userId), { disabled: newVal });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, disabled: newVal } : u)));
    } catch (err) {
      alert("Failed to update status: " + err.message);
    }
    setActionLoading(false);
    setConfirmAction(null);
  };

  const deleteUser = async (userId) => {
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, "users", userId));
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      alert("Failed to delete user: " + err.message);
    }
    setActionLoading(false);
    setConfirmAction(null);
  };

  // ---- Styles ----

  const S = {
    wrapper: {
      maxWidth: 720, margin: "0 auto", minHeight: "100vh", background: "#f5f7fa",
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    header: {
      background: "linear-gradient(135deg, #1a3a5c, #2d6da8)", color: "#fff",
      padding: "20px 24px 16px",
    },
    title: { fontSize: 22, fontWeight: 800, letterSpacing: 0.5 },
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
      display: "inline-block", padding: "3px 12px", borderRadius: 12,
      fontSize: 11, fontWeight: 700, color: "#fff",
    },
    statCard: {
      background: "#fff", borderRadius: 12, padding: "14px 10px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #eee",
      textAlign: "center", flex: 1,
    },
    input: {
      width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #ddd",
      fontSize: 14, background: "#fff", boxSizing: "border-box", outline: "none",
    },
    filterBtn: {
      padding: "6px 14px", borderRadius: 20, border: "1.5px solid #ddd",
      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
    },
    actionBtn: {
      padding: "5px 12px", borderRadius: 8, border: "none",
      fontSize: 11, fontWeight: 600, cursor: "pointer",
    },
    overlay: {
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    },
    modal: {
      background: "#fff", borderRadius: 16, padding: "28px 24px",
      maxWidth: 380, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    },
    tabBar: {
      display: "flex", background: "#fff", borderBottom: "1px solid #eee",
    },
    tab: {
      flex: 1, padding: "12px 0", textAlign: "center", fontSize: 14, fontWeight: 700,
      cursor: "pointer", border: "none", background: "transparent",
      transition: "all 0.15s",
    },
  };

  // ---- Confirmation Modal ----

  const renderConfirmModal = () => {
    if (!confirmAction) return null;
    const { type, userId, label, newRole } = confirmAction;
    const messages = {
      role: `Change role for "${label}" to "${newRole}"?`,
      disable: `Disable access for "${label}"? They will not be able to use the app until re-enabled.`,
      enable: `Re-enable access for "${label}"?`,
      delete: `Permanently delete the user profile for "${label}"? This action cannot be undone. Note: This removes their Firestore profile but does not delete their Firebase Auth account.`,
    };
    return (
      <div style={S.overlay} onClick={() => !actionLoading && setConfirmAction(null)}>
        <div style={S.modal} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 18, fontWeight: 800, color: type === "delete" ? "#d32f2f" : "#1a3a5c", marginBottom: 12 }}>
            {type === "delete" ? "Delete User" : type === "disable" ? "Disable User" : type === "enable" ? "Enable User" : "Change Role"}
          </div>
          <div style={{ fontSize: 14, color: "#555", lineHeight: 1.5, marginBottom: 20 }}>
            {messages[type]}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setConfirmAction(null)}
              disabled={actionLoading}
              style={{ ...S.actionBtn, flex: 1, padding: 12, background: "#eee", color: "#555", fontSize: 14, borderRadius: 10 }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (type === "role") changeRole(userId, newRole);
                else if (type === "disable") toggleDisabled(userId, false);
                else if (type === "enable") toggleDisabled(userId, true);
                else if (type === "delete") deleteUser(userId);
              }}
              disabled={actionLoading}
              style={{
                ...S.actionBtn, flex: 1, padding: 12, fontSize: 14, borderRadius: 10,
                background: type === "delete" ? "#d32f2f" : type === "disable" ? "#f57c00" : "#1a3a5c",
                color: "#fff", opacity: actionLoading ? 0.6 : 1,
              }}
            >
              {actionLoading ? "Processing..." : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ---- User Card ----

  const renderUserCard = (u) => {
    const isSelf = u.id === user?.uid;
    const isAdmin = u.role === "admin";
    const roleBg = isAdmin ? "#1a3a5c" : "#2d6da8";
    const statusBg = u.disabled ? "#f57c00" : "#4caf50";
    const statusLabel = u.disabled ? "Disabled" : "Active";

    return (
      <div key={u.id} style={{ ...S.card, borderLeft: `4px solid ${u.disabled ? "#f57c00" : isAdmin ? "#1a3a5c" : "#2d6da8"}`, opacity: u.disabled ? 0.75 : 1 }}>
        {/* Top row: company name + badges */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#333", flex: 1 }}>
            {u.company?.name || "No company set"}
            {isSelf && <span style={{ fontSize: 11, color: "#888", fontWeight: 400, marginLeft: 8 }}>(You)</span>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ ...S.badge, background: roleBg }}>{u.role}</span>
            <span style={{ ...S.badge, background: statusBg }}>{statusLabel}</span>
          </div>
        </div>

        {/* User details */}
        <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>{u.email}</div>
        {u.company?.phone && <div style={{ fontSize: 12, color: "#888" }}>Phone: {u.company.phone}</div>}
        {u.company?.website && <div style={{ fontSize: 12, color: "#888" }}>Web: {u.company.website}</div>}
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
          Joined: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Unknown"}
          {u.lastLogin && <span> | Last login: {new Date(u.lastLogin).toLocaleDateString()}</span>}
        </div>

        {/* Action buttons */}
        {!isSelf && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {/* Role toggle */}
            <select
              value={u.role}
              onChange={(e) => {
                const newRole = e.target.value;
                if (newRole !== u.role) {
                  setConfirmAction({ type: "role", userId: u.id, label: u.email, newRole });
                }
              }}
              style={{ ...S.actionBtn, padding: "6px 10px", background: "#e8f0f8", color: "#1a3a5c", border: "1.5px solid #c8d8e8", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>

            {/* Enable / Disable toggle */}
            <button
              onClick={() => setConfirmAction({
                type: u.disabled ? "enable" : "disable",
                userId: u.id,
                label: u.email,
              })}
              style={{
                ...S.actionBtn,
                background: u.disabled ? "#e8f5e9" : "#fff3e0",
                color: u.disabled ? "#2e7d32" : "#e65100",
                border: `1.5px solid ${u.disabled ? "#c8e6c9" : "#ffe0b2"}`,
              }}
            >
              {u.disabled ? "Enable" : "Disable"}
            </button>

            {/* Delete */}
            <button
              onClick={() => setConfirmAction({ type: "delete", userId: u.id, label: u.email })}
              style={{
                ...S.actionBtn,
                background: "#ffebee",
                color: "#c62828",
                border: "1.5px solid #ffcdd2",
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  // ---- Main Render ----

  return (
    <div style={S.wrapper}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={S.title}>Admin Dashboard</div>
            <div style={S.subtitle}>
              Signed in as {profile?.email}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onEnterApp} style={S.btn}>Open App</button>
            <button onClick={logout} style={S.btn}>Logout</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {[["users", "Users"], ["activity", "Activity Log"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              ...S.tab,
              color: tab === key ? "#1a3a5c" : "#999",
              borderBottom: tab === key ? "3px solid #1a3a5c" : "3px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div style={{ padding: 16 }}>
          {/* Stats Row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "Total Users", value: stats.total, color: "#1a3a5c" },
              { label: "Admins", value: stats.admins, color: "#7b1fa2" },
              { label: "Companies", value: stats.companies, color: "#2d6da8" },
              { label: "Active", value: stats.active, color: "#4caf50" },
              { label: "Disabled", value: stats.disabled, color: "#f57c00" },
            ].map((s) => (
              <div key={s.label} style={S.statCard}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#888", fontWeight: 600, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search by email or company name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...S.input, marginBottom: 12 }}
          />

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#888", lineHeight: "30px" }}>Role:</span>
            {["all", "admin", "company"].map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                style={{
                  ...S.filterBtn,
                  background: roleFilter === r ? "#1a3a5c" : "#fff",
                  color: roleFilter === r ? "#fff" : "#555",
                  borderColor: roleFilter === r ? "#1a3a5c" : "#ddd",
                }}
              >
                {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
            <span style={{ fontSize: 12, fontWeight: 700, color: "#888", lineHeight: "30px", marginLeft: 8 }}>Status:</span>
            {["all", "active", "disabled"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  ...S.filterBtn,
                  background: statusFilter === s ? "#1a3a5c" : "#fff",
                  color: statusFilter === s ? "#fff" : "#555",
                  borderColor: statusFilter === s ? "#1a3a5c" : "#ddd",
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* User Count */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a5c", marginBottom: 10 }}>
            {filteredUsers.length === users.length
              ? `All Users (${users.length})`
              : `Filtered: ${filteredUsers.length} of ${users.length}`}
          </div>

          {/* Loading */}
          {loading && <div style={{ textAlign: "center", color: "#888", padding: 40 }}>Loading users...</div>}

          {/* Empty */}
          {!loading && filteredUsers.length === 0 && (
            <div style={{ textAlign: "center", color: "#888", padding: 40 }}>
              {users.length === 0 ? "No users registered yet." : "No users match the current filters."}
            </div>
          )}

          {/* User List */}
          {filteredUsers.map(renderUserCard)}

          {/* Refresh Button */}
          <button
            onClick={() => { setLoading(true); loadUsers(); }}
            style={{
              width: "100%", padding: 12, borderRadius: 12, border: "2px dashed #ccc",
              background: "transparent", fontSize: 13, fontWeight: 600, color: "#888",
              cursor: "pointer", marginTop: 8,
            }}
          >
            Refresh User List
          </button>
        </div>
      )}

      {tab === "activity" && (
        <div style={{ padding: 16 }}>
          <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>Coming Soon</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a3a5c", marginBottom: 8 }}>Activity Log</div>
            <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>
              This feature will track user logins, report generation, and other app activity.
              To enable it, set up a Firestore "activity" collection and log events from the app.
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {renderConfirmModal()}
    </div>
  );
}
