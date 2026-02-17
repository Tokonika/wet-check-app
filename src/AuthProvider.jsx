import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
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
          const snap = await getDoc(ref);
          if (snap.exists()) {
            setProfile(snap.data());
          } else {
            // New user — check if any admin exists
            const adminQuery = query(collection(db, "users"), where("role", "==", "admin"));
            const adminSnap = await getDocs(adminQuery);
            const role = adminSnap.empty ? "admin" : "company";
            const newProfile = {
              email: u.email,
              role,
              company: null,
              createdAt: new Date().toISOString(),
            };
            await setDoc(ref, newProfile);
            setProfile(newProfile);
          }
        } catch (err) {
          console.error("Profile fetch error:", err);
          setProfile(null);
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
    const ref = doc(db, "users", user.uid);
    await setDoc(ref, data, { merge: true });
    setProfile((prev) => ({ ...prev, ...data }));
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
