import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// Helper: race a promise against a timeout
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const ref = doc(db, "users", u.uid);
          const snap = await withTimeout(getDoc(ref), 8000);
          if (snap.exists()) {
            setProfile(snap.data());
          } else {
            // New user — check if any admin exists
            const adminQuery = query(collection(db, "users"), where("role", "==", "admin"));
            const adminSnap = await withTimeout(getDocs(adminQuery), 8000);
            const role = adminSnap.empty ? "admin" : "company";
            const newProfile = {
              email: u.email,
              role,
              company: null,
              createdAt: new Date().toISOString(),
            };
            await withTimeout(setDoc(ref, newProfile), 8000);
            setProfile(newProfile);
          }
        } catch (err) {
          console.error("Profile fetch error:", err);
          // Fallback: let user in as company if Firestore is unreachable
          setProfile({ email: u.email, role: "company", company: null });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const logout = () => signOut(auth);

  const updateProfile = async (data) => {
    if (!user) return;
    try {
      const ref = doc(db, "users", user.uid);
      await withTimeout(setDoc(ref, data, { merge: true }), 8000);
      setProfile((prev) => ({ ...prev, ...data }));
    } catch (err) {
      console.error("Profile update error:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
