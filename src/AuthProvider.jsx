import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, getDocs, collection, query, where } from "firebase/firestore/lite";
import { auth, db } from "./firebase";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (u) => {
    try {
      console.log("Loading profile for", u.email);
      const ref = doc(db, "users", u.uid);
      const snap = await getDoc(ref);
      console.log("Profile doc exists:", snap.exists());
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
        return data;
      }
      // New user — check if any admin exists
      console.log("New user, checking for admin...");
      const adminQuery = query(collection(db, "users"), where("role", "==", "admin"));
      const adminSnap = await getDocs(adminQuery);
      const role = adminSnap.empty ? "admin" : "company";
      console.log("Assigning role:", role);
      const newProfile = {
        email: u.email,
        role,
        company: null,
        createdAt: new Date().toISOString(),
      };
      await setDoc(ref, newProfile);
      console.log("Profile saved to Firestore");
      setProfile(newProfile);
      return newProfile;
    } catch (err) {
      console.error("Profile error:", err);
      const fallback = { email: u.email, role: "company", company: null };
      setProfile(fallback);
      return fallback;
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await loadProfile(u);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const logout = () => signOut(auth);

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  const updateProfile = async (data) => {
    if (!user) return;
    try {
      const ref = doc(db, "users", user.uid);
      await setDoc(ref, data, { merge: true });
      setProfile((prev) => ({ ...prev, ...data }));
    } catch (err) {
      console.error("Profile update error:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, updateProfile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
