import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import generatePDF from "./utils/generatePDF";
import { useAuth } from "./AuthProvider";
import { db } from "./firebase";
import { collection, doc, setDoc, getDocs, query, where, orderBy, deleteDoc } from "firebase/firestore/lite";

// ─── CONSTANTS ───

const ZONE_TYPES = ["Rotors", "Sprays", "Drip", "Bubblers", "MP Rotator", "Mixed"];
const HEAD_TYPES = ["Hunter", "Rain Bird", "Toro", "Irritrol", "K-Rain", "Weathermatic", "Other"];
const BACKFLOW_TYPES = ["PVB", "RPZ", "DCV", "None"];
const CONTROLLER_TYPES = ["Conventional", "Smart/WiFi", "2-Wire Decoder", "Battery", "Central Control"];
const PROPERTY_SUBTYPES = [
  "HOA / Condo", "Office Building", "Retail / Shopping Center", "Restaurant",
  "Municipal / Park", "School / Campus", "Sports Field", "Industrial", "Other",
];
const MAINLINE_SIZES = ['1"', '1.5"', '2"', '3"', '4"', '6"'];
const MAINLINE_MATERIALS = ["PVC", "Copper", "Poly", "Galvanized"];
const WATER_SOURCES = ["City Water", "Well", "Reclaim/Recycled", "Canal", "Lake/Pond", "River", "Rainwater Harvest", "Mixed", "Other"];
const MAX_ZONES = 120;

// ─── IRRIGATION PARTS / FITTINGS ───
const PARTS_CATEGORIES = {
  "Spray Heads": [
    "4\" Pop-up Spray Head", "6\" Pop-up Spray Head", "12\" Pop-up Spray Head",
    "Adjustable Spray Nozzle", "Fixed Spray Nozzle", "Strip Nozzle",
    "Side Strip Nozzle", "Center Strip Nozzle", "Spray Body Only",
  ],
  "Rotors": [
    "4\" Pop-up Rotor", "6\" Pop-up Rotor", "12\" Pop-up Rotor",
    "Rotor Nozzle Set", "Gear Drive Rotor", "Impact Rotor",
  ],
  "MP Rotators": [
    "MP Rotator 1000 (8-15ft)", "MP Rotator 2000 (13-21ft)", "MP Rotator 3000 (22-30ft)",
    "MP Rotator 3500 (31-35ft)", "MP Rotator Left Corner", "MP Rotator Right Corner",
    "MP Rotator Side Strip", "MP Rotator Center Strip",
  ],
  "Drip / Micro": [
    "Drip Emitter (1 GPH)", "Drip Emitter (2 GPH)", "Drip Emitter (4 GPH)",
    "Drip Tubing 1/2\"", "Drip Tubing 1/4\"", "Micro Spray",
    "Micro Bubbler", "Drip Line (per ft)", "Emitter Tubing (per ft)",
    "Pressure Compensating Emitter", "Transfer Barb", "Drip Stake",
  ],
  "Valves": [
    "Electric Valve 3/4\"", "Electric Valve 1\"", "Electric Valve 1.5\"", "Electric Valve 2\"",
    "Ball Valve 3/4\"", "Ball Valve 1\"", "Ball Valve 1.5\"", "Ball Valve 2\"",
    "Gate Valve", "Anti-Siphon Valve", "Master Valve",
    "Valve Solenoid", "Valve Diaphragm", "Valve Box Std", "Valve Box Jumbo",
  ],
  "PVC Fittings": [
    "PVC Elbow 90° 3/4\"", "PVC Elbow 90° 1\"", "PVC Elbow 90° 1.5\"", "PVC Elbow 90° 2\"",
    "PVC Tee 3/4\"", "PVC Tee 1\"", "PVC Tee 1.5\"", "PVC Tee 2\"",
    "PVC Coupling 3/4\"", "PVC Coupling 1\"", "PVC Coupling 1.5\"", "PVC Coupling 2\"",
    "PVC Reducer", "PVC Cap", "PVC Male Adapter", "PVC Female Adapter",
    "PVC Cross", "PVC Union", "Slip Fix Coupling",
  ],
  "Pipe": [
    "PVC Pipe 3/4\" (per ft)", "PVC Pipe 1\" (per ft)", "PVC Pipe 1.5\" (per ft)", "PVC Pipe 2\" (per ft)",
    "Funny Pipe / Swing Pipe (per ft)", "Poly Pipe 3/4\" (per ft)", "Poly Pipe 1\" (per ft)",
  ],
  "Swing Assemblies": [
    "Swing Joint Assembly", "Swing Pipe Elbow", "Cutoff Riser 1/2\"",
    "Cutoff Riser 3/4\"", "Marlex Elbow", "Street Elbow",
  ],
  "Wire & Electrical": [
    "Irrigation Wire (per ft)", "Waterproof Wire Connector (DBY)",
    "Waterproof Wire Connector (DBR)", "Wire Splice Kit",
    "Solenoid 24V AC", "Rain Sensor", "Flow Sensor",
  ],
  "Backflow / Misc": [
    "PVB Backflow Preventer", "RPZ Backflow Preventer", "DCV Backflow Preventer",
    "PVC Cement / Glue", "Teflon Tape", "Pipe Clamp", "Hose Clamp",
    "Pressure Regulator", "Filter / Strainer", "Quick Coupler Valve",
    "Quick Coupler Key", "Drain Valve", "Air Relief Valve",
  ],
};

const makeZone = (id) => ({
  id, type: "", headType: "", heads: "", psi: "", ok: false,
  leak: false, broken: false, clogged: false, misaligned: false,
  notes: "", area: "", controllerId: 1,
  beforeImgs: [], afterImgs: [],
  lat: null, lng: null, locationImg: null,
  materials: [], // [{ part: "4\" Pop-up Spray Head", qty: 3 }, ...]
});
const makeController = (id) => ({ id, make: "", type: "", location: "", zoneFrom: "", zoneTo: "", lat: null, lng: null, locationImg: null });
const makeBackflow = (id) => ({ id, type: "", condition: "" });

const BASE_OBS = [
  ["mainLineLeak", "Main Line Leak"], ["lateralLeak", "Lateral Leak"],
  ["valveBoxFlooded", "Valve Box Flooded"], ["overspray", "Overspray"],
  ["drySpots", "Dry Spots"], ["coverageIssues", "Coverage Issues"],
];
const COMMERCIAL_OBS = [
  ["erosion", "Erosion"], ["drainageIssues", "Drainage Issues"],
  ["codeViolations", "Code Violations"], ["timerIssues", "Timer Programming"],
  ["waterWaste", "Water Waste"], ["rootDamage", "Root Damage"],
];

// ─── FIRESTORE HELPERS ───

function stripImagesFromState(data) {
  // Deep clone and remove base64 image fields to stay under Firestore doc size limits
  const clone = JSON.parse(JSON.stringify(data));
  // Strip client location image
  if (clone.client) clone.client.locationImg = null;
  // Strip system pump location image
  if (clone.system) clone.system.pumpLocationImg = null;
  // Strip zone images
  if (clone.zones) {
    clone.zones = clone.zones.map((z) => ({
      ...z,
      beforeImgs: [],
      afterImgs: [],
      locationImg: null,
    }));
  }
  // Strip controller location images
  if (clone.controllers) {
    clone.controllers = clone.controllers.map((c) => ({
      ...c,
      locationImg: null,
    }));
  }
  return clone;
}

// ─── STYLES (moved outside component) ───

const S = {
  container: {
    maxWidth: 540, margin: "0 auto", minHeight: "100vh", background: "#fafafa",
    fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "flex", flexDirection: "column",
  },
  header: { background: "linear-gradient(135deg, #1a3a5c, #2d6da8)", color: "#fff", padding: "16px 20px 12px" },
  stepBar: { display: "flex", justifyContent: "center", gap: 12, padding: "12px 20px 4px", background: "#fff", borderBottom: "1px solid #eee" },
  stepDot: { width: 32, height: 32, borderRadius: "50%", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  statsBar: { display: "flex", justifyContent: "space-around", padding: "10px 20px", background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10 },
  stat: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  content: { flex: 1, padding: "16px 16px 100px" },
  stepTitle: { fontSize: 20, fontWeight: 800, color: "#1a3a5c", marginBottom: 16, marginTop: 0 },
  subTitle: { fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 10, marginTop: 4 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", marginBottom: 4 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #ddd", fontSize: 15, background: "#fff", boxSizing: "border-box", outline: "none", WebkitAppearance: "none" },
  smallInput: { padding: "8px 10px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 14, background: "#fff", boxSizing: "border-box", outline: "none", WebkitAppearance: "none" },
  textarea: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #ddd", fontSize: 15, background: "#fff", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical", outline: "none" },
  toggle: { padding: "8px 16px", borderRadius: 20, border: "1.5px solid #ddd", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 },
  card: { background: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #eee" },
  zoneCard: { background: "#fff", borderRadius: 12, padding: "10px 14px", marginBottom: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", cursor: "pointer" },
  zoneHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  zoneBadge: { background: "#1a3a5c", color: "#fff", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700 },
  okBtn: { padding: "4px 14px", borderRadius: 16, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  zoneGrid: { display: "grid", gridTemplateColumns: "1fr", gap: 0 },
  addBtn: { width: "100%", padding: 14, borderRadius: 12, border: "2px dashed #ccc", background: "transparent", fontSize: 14, fontWeight: 600, color: "#888", cursor: "pointer", marginTop: 8 },
  removeBtn: { background: "none", border: "none", color: "#d32f2f", fontSize: 16, cursor: "pointer", padding: "4px 8px", fontWeight: 700 },
  navBar: { position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", padding: "12px 16px", paddingBottom: 28, background: "#fff", borderTop: "1px solid #eee", maxWidth: 540, margin: "0 auto", boxSizing: "border-box" },
  navBtn: { padding: "14px 28px", borderRadius: 12, border: "none", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  divider: { height: 1, background: "#eee", margin: "18px 0" },
  reportPre: { background: "#1a2332", color: "#e8f0f8", padding: 16, borderRadius: 12, fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", overflow: "auto", maxHeight: 500, fontFamily: "'SF Mono', 'Courier New', monospace" },
  typeCard: { display: "flex", alignItems: "center", gap: 16, padding: "20px 24px", borderRadius: 16, border: "2px solid #eee", background: "#fff", cursor: "pointer", textAlign: "left", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", transition: "border-color 0.2s, box-shadow 0.2s" },
};

// ─── REUSABLE COMPONENTS (stable identity — defined outside WetCheckApp) ───

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} style={S.input} />
    </div>
  );
}

function Dropdown({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={S.input}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <button onClick={onChange} style={{
      ...S.toggle,
      background: checked ? "#1a3a5c" : "#f5f5f5",
      color: checked ? "#fff" : "#555",
      borderColor: checked ? "#1a3a5c" : "#ddd",
    }}>
      {checked ? "✓ " : ""}{label}
    </button>
  );
}

function PhotoUpload({ label, src, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Resize before storing to keep state small
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        onUpload(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4 }}>{label}</div>
      {src ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <img src={src} alt={label} style={{ width: "100%", maxWidth: 140, borderRadius: 8, border: "1.5px solid #ddd" }} />
          <button onClick={onRemove} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#d32f2f", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", lineHeight: "22px", padding: 0 }}>✕</button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} style={{ width: "100%", maxWidth: 140, height: 80, borderRadius: 8, border: "2px dashed #ccc", background: "#fafafa", cursor: "pointer", color: "#aaa", fontSize: 22 }}>
          📷
          <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>Tap to add</div>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

function MultiPhotoUpload({ label, imgs, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        onAdd(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6, textAlign: "center" }}>
        {label} {imgs.length > 0 ? `(${imgs.length})` : ""}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
        {imgs.map((src, i) => (
          <div key={i} style={{ position: "relative", display: "inline-block" }}>
            <img src={src} alt={`${label} ${i + 1}`} style={{ width: 80, height: 64, objectFit: "cover", borderRadius: 8, border: "1.5px solid #ddd" }} />
            <button onClick={() => onRemove(i)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#d32f2f", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", lineHeight: "20px", padding: 0 }}>✕</button>
          </div>
        ))}
        <button onClick={() => inputRef.current?.click()} style={{ width: 80, height: 64, borderRadius: 8, border: "2px dashed #ccc", background: "#fafafa", cursor: "pointer", color: "#aaa", fontSize: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          📷
          <div style={{ fontSize: 9, color: "#aaa", marginTop: 2 }}>Add</div>
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

function LocationBtn({ lat, lng, onLocate, locating, locationImg, onPhotoUpload, onPhotoRemove }) {
  const photoRef = useRef(null);
  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        onPhotoUpload(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={onLocate} disabled={locating} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #1a3a5c", background: locating ? "#eee" : "#e8f0f8", color: "#1a3a5c", fontSize: 13, fontWeight: 600, cursor: locating ? "wait" : "pointer" }}>
          {locating ? "Locating..." : "📍 Get Location"}
        </button>
        {lat && (
          <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#1a3a5c" }}>
            View Map
          </a>
        )}
        {lat && onPhotoUpload && (
          <button onClick={() => photoRef.current?.click()} style={{ padding: "4px 8px", borderRadius: 6, border: "1.5px solid #1a3a5c", background: "#e8f0f8", color: "#1a3a5c", fontSize: 12, cursor: "pointer" }}>
            📷
          </button>
        )}
      </div>
      {lat && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Lat: {lat.toFixed(6)}, Lng: {lng.toFixed(6)}</div>}
      {locationImg && (
        <div style={{ position: "relative", display: "inline-block", marginTop: 6 }}>
          <img src={locationImg} alt="Location" style={{ width: "100%", maxWidth: 160, borderRadius: 8, border: "1.5px solid #ddd" }} />
          <button onClick={onPhotoRemove} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#d32f2f", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", lineHeight: "22px", padding: 0 }}>✕</button>
        </div>
      )}
      {onPhotoUpload && <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />}
    </div>
  );
}

function SectionHead({ title, collapsible, open, onToggle }) {
  return (
    <div onClick={collapsible ? onToggle : undefined} style={{
      ...S.sectionHeader, cursor: collapsible ? "pointer" : "default",
    }}>
      <h3 style={S.subTitle}>{title}</h3>
      {collapsible && <span style={{ fontSize: 14, color: "#888" }}>{open ? "▲" : "▼"}</span>}
    </div>
  );
}

// ─── MAIN APP ───

export default function WetCheckApp({ onBackToDashboard }) {
  const { user, logout, profile, updateProfile } = useAuth();
  const [propertyType, setPropertyType] = useState(null);
  const [step, setStep] = useState(0);
  const topRef = useRef(null);
  const logoInputRef = useRef(null);

  // Company branding (from Firestore profile)
  const company = profile?.company || null;
  const [showCompanySetup, setShowCompanySetup] = useState(false);
  const [companyDraft, setCompanyDraft] = useState({ name: "", phone: "", website: "", logo: null });
  const saveCompany = async () => {
    await updateProfile({ company: companyDraft });
    setShowCompanySetup(false);
  };

  const [client, setClient] = useState({
    name: "", address: "", city: "", phone: "", email: "", manager: "",
    date: new Date().toISOString().slice(0, 10), workOrder: "",
    propertySubType: "", buildingName: "", numBuildings: "", irrigatedAcreage: "",
    lat: null, lng: null, locationImg: null,
  });
  const [locating, setLocating] = useState(null); // null or string key like "client", "pump", "zone-3"

  const [system, setSystem] = useState({
    totalZones: "", activeZones: "",
    waterSource: "", meterSize: "", staticPSI: "", workingPSI: "", flowRate: "",
    rainSensor: "", pumpStation: "",
    mainlineSize: "", mainlineMaterial: "", masterValve: "", flowSensor: "", poc: "",
    pumpLat: null, pumpLng: null, pumpLocationImg: null,
  });

  const [controllers, setControllers] = useState([makeController(1)]);
  const [backflows, setBackflows] = useState([makeBackflow(1)]);
  const [zones, setZones] = useState(Array.from({ length: 6 }, (_, i) => makeZone(i + 1)));
  const [activeZoneCount, setActiveZoneCount] = useState(6);
  const [expandedZones, setExpandedZones] = useState(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [groupBy, setGroupBy] = useState("none");
  const [observations, setObservations] = useState({
    mainLineLeak: false, lateralLeak: false, valveBoxFlooded: false,
    overspray: false, drySpots: false, coverageIssues: false,
    erosion: false, drainageIssues: false, codeViolations: false,
    timerIssues: false, waterWaste: false, rootDamage: false,
  });
  const [recommendations, setRecommendations] = useState("");
  const [priority, setPriority] = useState("");
  const [estCost, setEstCost] = useState("");
  const [estTime, setEstTime] = useState("");
  const [techName, setTechName] = useState("");
  const [slideDir, setSlideDir] = useState("none");
  const [waterOpen, setWaterOpen] = useState(true);
  const [bfOpen, setBfOpen] = useState(true);
  const [sensorOpen, setSensorOpen] = useState(true);
  const [commOpen, setCommOpen] = useState(true);
  const [expandedCtrls, setExpandedCtrls] = useState(new Set([1]));

  // ─── SAVED INSPECTIONS STATE ───
  const [showInspectionList, setShowInspectionList] = useState(true); // Start on list screen
  const [savedInspections, setSavedInspections] = useState([]);
  const [loadingInspections, setLoadingInspections] = useState(false);
  const [savingInspection, setSavingInspection] = useState(false);
  const [currentInspectionId, setCurrentInspectionId] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const autoSavedRef = useRef(false); // Track if auto-save already fired for current summary view

  // ─── LOAD SAVED INSPECTIONS LIST ───
  const loadInspectionsList = useCallback(async () => {
    if (!user?.uid) return;
    setLoadingInspections(true);
    try {
      const q = query(
        collection(db, "inspections"),
        where("userId", "==", user.uid),
        orderBy("savedAt", "desc")
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSavedInspections(list);
    } catch (err) {
      console.error("Error loading inspections:", err);
      // Fallback: try without orderBy in case index is missing
      try {
        const q2 = query(
          collection(db, "inspections"),
          where("userId", "==", user.uid)
        );
        const snap2 = await getDocs(q2);
        const list2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
        list2.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
        setSavedInspections(list2);
      } catch (err2) {
        console.error("Fallback inspection load error:", err2);
      }
    } finally {
      setLoadingInspections(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (showInspectionList) loadInspectionsList();
  }, [showInspectionList, loadInspectionsList]);

  // ─── SAVE CURRENT INSPECTION TO FIRESTORE ───
  const saveInspection = useCallback(async (silent = false) => {
    if (!user?.uid) return;
    setSavingInspection(true);
    setSaveMessage(null);
    try {
      const inspectionData = {
        propertyType,
        client,
        system,
        controllers,
        backflows,
        zones: zones.slice(0, activeZoneCount),
        activeZoneCount,
        observations,
        recommendations,
        priority,
        estCost,
        estTime,
        techName,
      };
      const strippedData = stripImagesFromState(inspectionData);
      const docId = currentInspectionId || doc(collection(db, "inspections")).id;
      await setDoc(doc(db, "inspections", docId), {
        userId: user.uid,
        customerName: client.name || "Unnamed",
        address: [client.address, client.city].filter(Boolean).join(", ") || "No address",
        propertyType: propertyType || "residential",
        savedAt: new Date().toISOString(),
        step,
        data: strippedData,
      });
      setCurrentInspectionId(docId);
      if (!silent) {
        setSaveMessage("Inspection saved successfully");
        setTimeout(() => setSaveMessage(null), 2500);
      }
    } catch (err) {
      console.error("Save error:", err);
      if (!silent) {
        setSaveMessage("Error saving: " + err.message);
        setTimeout(() => setSaveMessage(null), 4000);
      }
    } finally {
      setSavingInspection(false);
    }
  }, [user?.uid, propertyType, client, system, controllers, backflows, zones, activeZoneCount, observations, recommendations, priority, estCost, estTime, techName, step, currentInspectionId]);

  // ─── AUTO-SAVE ON SUMMARY STEP ───
  useEffect(() => {
    if (step === 4 && !autoSavedRef.current && user?.uid && propertyType) {
      autoSavedRef.current = true;
      saveInspection(true);
    }
    if (step !== 4) {
      autoSavedRef.current = false;
    }
  }, [step, user?.uid, propertyType, saveInspection]);

  // ─── LOAD A SAVED INSPECTION INTO STATE ───
  const loadInspection = (inspection) => {
    const d = inspection.data;
    if (!d) return;
    setPropertyType(d.propertyType || inspection.propertyType || "residential");
    setClient((prev) => ({ ...prev, ...d.client }));
    setSystem((prev) => ({ ...prev, ...d.system }));
    if (d.controllers?.length) setControllers(d.controllers.map((c, i) => ({ ...makeController(i + 1), ...c, id: i + 1 })));
    if (d.backflows?.length) setBackflows(d.backflows.map((b, i) => ({ ...makeBackflow(i + 1), ...b, id: i + 1 })));
    if (d.zones?.length) {
      const loadedZones = d.zones.map((z, i) => ({ ...makeZone(i + 1), ...z, id: i + 1 }));
      // Ensure we have at least as many zones as activeZoneCount
      const needed = Math.max(d.activeZoneCount || loadedZones.length, loadedZones.length);
      const fullZones = loadedZones.length >= needed
        ? loadedZones
        : [...loadedZones, ...Array.from({ length: needed - loadedZones.length }, (_, i) => makeZone(loadedZones.length + i + 1))];
      setZones(fullZones);
      setActiveZoneCount(d.activeZoneCount || fullZones.length);
    }
    if (d.observations) setObservations((prev) => ({ ...prev, ...d.observations }));
    if (d.recommendations !== undefined) setRecommendations(d.recommendations);
    if (d.priority !== undefined) setPriority(d.priority);
    if (d.estCost !== undefined) setEstCost(d.estCost);
    if (d.estTime !== undefined) setEstTime(d.estTime);
    if (d.techName !== undefined) setTechName(d.techName);
    setCurrentInspectionId(inspection.id);
    setStep(inspection.step || 0);
    setShowInspectionList(false);
  };

  // ─── DELETE A SAVED INSPECTION ───
  const deleteInspection = async (inspectionId) => {
    if (!window.confirm("Delete this saved inspection? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "inspections", inspectionId));
      setSavedInspections((prev) => prev.filter((i) => i.id !== inspectionId));
      if (currentInspectionId === inspectionId) setCurrentInspectionId(null);
    } catch (err) {
      alert("Error deleting: " + err.message);
    }
  };

  // ─── START NEW INSPECTION ───
  const startNewInspection = () => {
    setPropertyType(null);
    setStep(0);
    setClient({
      name: "", address: "", city: "", phone: "", email: "", manager: "",
      date: new Date().toISOString().slice(0, 10), workOrder: "",
      propertySubType: "", buildingName: "", numBuildings: "", irrigatedAcreage: "",
      lat: null, lng: null, locationImg: null,
    });
    setSystem({
      totalZones: "", activeZones: "",
      waterSource: "", meterSize: "", staticPSI: "", workingPSI: "", flowRate: "",
      rainSensor: "", pumpStation: "",
      mainlineSize: "", mainlineMaterial: "", masterValve: "", flowSensor: "", poc: "",
      pumpLat: null, pumpLng: null, pumpLocationImg: null,
    });
    setControllers([makeController(1)]);
    setBackflows([makeBackflow(1)]);
    setZones(Array.from({ length: 6 }, (_, i) => makeZone(i + 1)));
    setActiveZoneCount(6);
    setObservations({
      mainLineLeak: false, lateralLeak: false, valveBoxFlooded: false,
      overspray: false, drySpots: false, coverageIssues: false,
      erosion: false, drainageIssues: false, codeViolations: false,
      timerIssues: false, waterWaste: false, rootDamage: false,
    });
    setRecommendations("");
    setPriority("");
    setEstCost("");
    setEstTime("");
    setTechName("");
    setCurrentInspectionId(null);
    setExpandedZones(new Set());
    setAllExpanded(false);
    setGroupBy("none");
    setShowInspectionList(false);
  };

  const isCommercial = propertyType === "commercial";
  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth" });

  // ─── UPDATERS ───

  const updateClient = (k, v) => setClient((p) => ({ ...p, [k]: v }));
  const updateSystem = (k, v) => setSystem((p) => ({ ...p, [k]: v }));
  const updateObs = (k) => setObservations((p) => ({ ...p, [k]: !p[k] }));
  const updateZone = (idx, k, v) => setZones((prev) => prev.map((z, i) => (i === idx ? { ...z, [k]: v } : z)));
  const updateController = (idx, k, v) => setControllers((prev) => prev.map((c, i) => (i === idx ? { ...c, [k]: v } : c)));
  const updateBackflow = (idx, k, v) => setBackflows((prev) => prev.map((b, i) => (i === idx ? { ...b, [k]: v } : b)));

  const getGPS = (key, onSuccess) => {
    if (!navigator.geolocation) { alert("Geolocation not supported"); return; }
    setLocating(key);
    navigator.geolocation.getCurrentPosition(
      (pos) => { onSuccess(pos.coords.latitude, pos.coords.longitude); setLocating(null); },
      (err) => { alert("Location error: " + err.message); setLocating(null); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const fetchClientLocation = () => {
    getGPS("client", async (lat, lng) => {
      setClient((p) => ({ ...p, lat, lng }));
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        if (data.address) {
          const a = data.address;
          const street = [a.house_number, a.road].filter(Boolean).join(" ");
          const city = [a.city || a.town || a.village, a.state, a.postcode].filter(Boolean).join(", ");
          setClient((p) => ({ ...p, address: street || p.address, city: city || p.city }));
        }
      } catch (_) { /* still have coords */ }
    });
  };

  const fetchPumpLocation = () => {
    getGPS("pump", (lat, lng) => setSystem((p) => ({ ...p, pumpLat: lat, pumpLng: lng })));
  };
  const setPumpLocationImg = (img) => setSystem((p) => ({ ...p, pumpLocationImg: img }));

  const fetchZoneLocation = (idx, zoneId) => {
    getGPS(`zone-${zoneId}`, (lat, lng) => {
      setZones((prev) => prev.map((z, i) => (i === idx ? { ...z, lat, lng } : z)));
    });
  };

  const fetchControllerLocation = (idx, ctrlId) => {
    getGPS(`ctrl-${ctrlId}`, (lat, lng) => {
      setControllers((prev) => prev.map((c, i) => (i === idx ? { ...c, lat, lng } : c)));
    });
  };

  const addController = () => { if (controllers.length < 10) setControllers((p) => [...p, makeController(p.length + 1)]); };
  const removeController = (idx) => { if (controllers.length > 1) setControllers((p) => p.filter((_, i) => i !== idx).map((c, i) => ({ ...c, id: i + 1 }))); };
  const addBackflow = () => { if (backflows.length < 6) setBackflows((p) => [...p, makeBackflow(p.length + 1)]); };
  const removeBackflow = (idx) => { if (backflows.length > 1) setBackflows((p) => p.filter((_, i) => i !== idx).map((b, i) => ({ ...b, id: i + 1 }))); };

  const ensureZones = (count) => {
    setActiveZoneCount(count);
    setZones((prev) => {
      if (prev.length >= count) return prev;
      return [...prev, ...Array.from({ length: count - prev.length }, (_, i) => makeZone(prev.length + i + 1))];
    });
  };
  const addMoreZones = () => ensureZones(Math.min(activeZoneCount + 4, MAX_ZONES));

  const toggleZoneExpand = (id) => setExpandedZones((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllExpanded = () => {
    if (allExpanded) { setExpandedZones(new Set()); setAllExpanded(false); }
    else { setExpandedZones(new Set(zones.slice(0, activeZoneCount).map((z) => z.id))); setAllExpanded(true); }
  };
  const toggleCtrlExpand = (id) => setExpandedCtrls((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const goStep = (dir) => {
    const next = step + dir;
    if (next < 0 || next > 4) return;
    setSlideDir(dir > 0 ? "left" : "right");
    setTimeout(() => { setStep(next); setSlideDir("none"); scrollTop(); }, 150);
  };

  // ─── COMPUTED ───

  const activeZonesSlice = zones.slice(0, activeZoneCount);
  const okCount = activeZonesSlice.filter((z) => z.ok).length;
  const issueCount = activeZonesSlice.filter((z) => z.leak || z.broken || z.clogged || z.misaligned).length;
  const pendingCount = activeZoneCount - okCount - issueCount;
  const progressPct = activeZoneCount > 0 ? Math.round(((okCount + issueCount) / activeZoneCount) * 100) : 0;
  const steps = ["Client", "System", "Zones", "Review", "Summary"];

  const groupedZones = useMemo(() => {
    const active = zones.slice(0, activeZoneCount);
    if (groupBy === "none") return [{ label: null, zones: active }];
    const key = groupBy === "area" ? (z) => z.area || "Unassigned" : (z) => `Controller ${z.controllerId || 1}`;
    const map = {};
    active.forEach((z, idx) => { const k = key(z); if (!map[k]) map[k] = []; map[k].push({ zone: z, idx }); });
    return Object.entries(map).map(([label, items]) => ({ label, zones: items.map((i) => i.zone), indices: items.map((i) => i.idx) }));
  }, [zones, activeZoneCount, groupBy]);

  // ─── TEXT REPORT ───

  const generateReport = () => {
    const typeLabel = isCommercial ? "COMMERCIAL" : "RESIDENTIAL";
    const zoneLines = zones.slice(0, activeZoneCount).map((z) => {
      const issues = []; if (z.leak) issues.push("LEAK"); if (z.broken) issues.push("BROKEN"); if (z.clogged) issues.push("CLOGGED"); if (z.misaligned) issues.push("MISALIGNED");
      const status = z.ok ? "✅ OK" : issues.length ? "⚠️ " + issues.join(", ") : "—";
      const areaStr = z.area ? ` [${z.area}]` : ""; const ctrlStr = isCommercial ? ` (Ctrl ${z.controllerId})` : "";
      const locStr = z.lat ? ` | 📍 https://maps.google.com/?q=${z.lat},${z.lng}` : "";
      return `Zone ${z.id}${areaStr}${ctrlStr}: ${z.type || "N/A"} | ${z.headType || "N/A"} | ${z.heads || "—"} heads | ${z.psi || "—"} PSI | ${status}${z.notes ? " | " + z.notes : ""}${locStr}`;
    }).join("\n");
    const ctrlLines = controllers.map((c) => { const loc = c.lat ? ` | 📍 https://maps.google.com/?q=${c.lat},${c.lng}` : ""; return `  Controller ${c.id}: ${c.make || "N/A"} (${c.type || "N/A"}) — ${c.location || "N/A"} — Zones ${c.zoneFrom || "?"}-${c.zoneTo || "?"}${loc}`; }).join("\n");
    const bfLines = backflows.map((b) => `  Backflow ${b.id}: ${b.type || "N/A"} — ${b.condition || "N/A"}`).join("\n");
    const obsEntries = [...BASE_OBS, ...(isCommercial ? COMMERCIAL_OBS : [])];
    const obsLines = obsEntries.filter(([k]) => observations[k]).map(([, l]) => `• ${l}`);

    let report = `═══════════════════════\n${companyName}\n  ${typeLabel} WET CHECK REPORT\n═══════════════════════\n\n📋 CLIENT INFO\nClient: ${client.name}\nAddress: ${client.address}, ${client.city}${client.lat ? `\nLocation: ${client.lat.toFixed(6)}, ${client.lng.toFixed(6)} | https://maps.google.com/?q=${client.lat},${client.lng}` : ""}\nPhone: ${client.phone}\nDate: ${client.date}\nWork Order: ${client.workOrder}`;
    if (isCommercial) report += `\nProperty Type: ${client.propertySubType}\nBuilding/Complex: ${client.buildingName}\nBuildings/Areas: ${client.numBuildings}\nIrrigated Acreage: ${client.irrigatedAcreage}`;
    report += `\n\n⚙️ SYSTEM OVERVIEW\nControllers:\n${ctrlLines}\nWater Source: ${system.waterSource}\nStatic PSI: ${system.staticPSI} | Working PSI: ${system.workingPSI}\nFlow: ${system.flowRate} GPM\nBackflow Devices:\n${bfLines}\nRain Sensor: ${system.rainSensor}\nPump: ${system.pumpStation}`;
    if (isCommercial) report += `\nMainline: ${system.mainlineSize} ${system.mainlineMaterial}\nMaster Valve: ${system.masterValve}\nFlow Sensor: ${system.flowSensor}\nPoints of Connection: ${system.poc}`;
    // Aggregate materials across all zones
    const allMaterials = {};
    zones.slice(0, activeZoneCount).forEach((z) => { z.materials.filter((m) => m.part).forEach((m) => { allMaterials[m.part] = (allMaterials[m.part] || 0) + (Number(m.qty) || 1); }); });
    const matLines = Object.entries(allMaterials).map(([part, qty]) => `  ${qty}x ${part}`);
    report += `\n\n💧 ZONE-BY-ZONE CHECK\n${zoneLines}`;
    if (matLines.length > 0) report += `\n\n🔧 MATERIALS NEEDED (TOTAL)\n${matLines.join("\n")}`;
    report += `\n\n🔍 OBSERVATIONS\n${obsLines.length ? obsLines.join("\n") : "No issues noted"}\n\n📝 RECOMMENDATIONS\n${recommendations || "None"}\n\n⚡ PRIORITY: ${priority || "N/A"}\n💰 Est. Cost: ${estCost || "N/A"}\n⏱️ Est. Time: ${estTime || "N/A"}\n\nTechnician: ${techName}\n\n═══════════════════════\n${companyWebsite}${companyPhone ? " | " + companyPhone : ""}\nHablamos Español\n═══════════════════════`;
    return report;
  };

  const shareWhatsApp = async () => {
    try {
      const data = { propertyType, client, system, controllers, backflows, zones, activeZoneCount, observations, recommendations, priority, estCost, estTime, techName, isCommercial, company, returnBlob: true };
      const { blob, fileName } = generatePDF(data);
      const file = new File([blob], fileName, { type: "application/pdf" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName, text: `Wet Check Report – ${client.name || "Inspection"}` });
      } else {
        // Fallback: download the PDF and open WhatsApp with a message
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
        setTimeout(() => {
          window.location.href = `https://wa.me/?text=${encodeURIComponent(`Wet Check Report for ${client.name || "Client"} – ${client.date}\nPDF file downloaded: ${fileName}`)}`;
        }, 500);
      }
    } catch (err) { if (err.name !== "AbortError") alert("Share error: " + err.message); }
  };
  const copyReport = () => {
    try { navigator.clipboard.writeText(generateReport()).then(() => alert("Copied to clipboard!")); }
    catch (err) { alert("Copy error: " + err.message); }
  };
  const downloadPDF = () => {
    try { generatePDF({ propertyType, client, system, controllers, backflows, zones, activeZoneCount, observations, recommendations, priority, estCost, estTime, techName, isCommercial, company }); }
    catch (err) { alert("PDF error: " + err.message); }
  };

  // ─── PROPERTY TYPE SELECTOR ───

  const companyName = company?.name || "Wet Check App";
  const companyWebsite = company?.website || "";
  const companyPhone = company?.phone || "";

  // ─── COMPANY SETUP SCREEN ───
  if (showCompanySetup) {
    const handleLogo = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (ev) => {
        img.onload = () => {
          const MAX = 400;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          setCompanyDraft((p) => ({ ...p, logo: canvas.toDataURL("image/png", 0.9) }));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    };
    return (
      <div style={S.container} ref={topRef}>
        <div style={S.header}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.5 }}>Company Setup</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>Your branding on all reports</div>
        </div>
        <div style={{ padding: 20, flex: 1 }}>
          <Field label="Company Name" value={companyDraft.name} onChange={(v) => setCompanyDraft((p) => ({ ...p, name: v }))} placeholder="Your Company Name" />
          <Field label="Phone Number" value={companyDraft.phone} onChange={(v) => setCompanyDraft((p) => ({ ...p, phone: v }))} placeholder="(555) 123-4567" />
          <Field label="Website" value={companyDraft.website} onChange={(v) => setCompanyDraft((p) => ({ ...p, website: v }))} placeholder="www.yourcompany.com" />
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Company Logo</label>
            {companyDraft.logo ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <img src={companyDraft.logo} alt="Logo" style={{ maxWidth: 200, maxHeight: 80, borderRadius: 8, border: "1.5px solid #ddd" }} />
                <button onClick={() => setCompanyDraft((p) => ({ ...p, logo: null }))} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#d32f2f", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", lineHeight: "22px", padding: 0 }}>✕</button>
              </div>
            ) : (
              <button onClick={() => logoInputRef.current?.click()} style={{ width: "100%", padding: 16, borderRadius: 8, border: "2px dashed #ccc", background: "#fafafa", cursor: "pointer", color: "#888", fontSize: 14 }}>
                📷 Tap to upload logo
              </button>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: "none" }} />
          </div>
          <button onClick={saveCompany} style={{ ...S.navBtn, background: "#1a3a5c", width: "100%", textAlign: "center", marginTop: 10 }}>Save Company Info</button>
          <button onClick={() => setShowCompanySetup(false)} style={{ ...S.navBtn, background: "#666", width: "100%", textAlign: "center", marginTop: 8 }}>Cancel</button>
        </div>
      </div>
    );
  }

  // ─── INSPECTIONS LIST SCREEN ───
  if (showInspectionList) {
    return (
      <div style={S.container} ref={topRef}>
        <div style={S.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.5 }}>{companyName}</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>Wet Check Inspection App</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {onBackToDashboard && <button onClick={onBackToDashboard} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>Dashboard</button>}
              <button onClick={() => { setCompanyDraft(company || { name: "", phone: "", website: "", logo: null }); setShowCompanySetup(true); }} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>
                Setup
              </button>
              <button onClick={logout} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>
                Logout
              </button>
            </div>
          </div>
        </div>
        <div style={{ padding: 20, flex: 1 }}>
          {company?.logo && <div style={{ textAlign: "center", marginBottom: 12 }}><img src={company.logo} alt="Logo" style={{ maxWidth: 180, maxHeight: 70 }} /></div>}

          {/* Company Info Setup Prompt */}
          {!company?.name && (
            <div onClick={() => { setCompanyDraft({ name: "", phone: "", website: "", logo: null }); setShowCompanySetup(true); }} style={{
              background: "#fff8e1", borderRadius: 12, padding: "14px 16px", marginBottom: 20,
              cursor: "pointer", border: "2px dashed #ffa000",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ fontSize: 28 }}>🏢</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e65100" }}>Set Up Company Information</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Add your company name, logo & contact info to appear on reports</div>
              </div>
              <div style={{ fontSize: 20, color: "#ffa000" }}>›</div>
            </div>
          )}

          {/* New Inspection Button */}
          <button onClick={startNewInspection} style={{
            width: "100%", padding: "18px 20px", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg, #1a3a5c, #2d6da8)", color: "#fff",
            fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 24,
            boxShadow: "0 4px 16px rgba(26,58,92,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
            + New Inspection
          </button>

          {/* Saved Inspections */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#333", margin: 0 }}>Saved Inspections</h3>
            <button onClick={loadInspectionsList} disabled={loadingInspections} style={{
              background: "none", border: "1.5px solid #1a3a5c", color: "#1a3a5c",
              fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 8, cursor: "pointer",
            }}>
              {loadingInspections ? "Loading..." : "Refresh"}
            </button>
          </div>

          {loadingInspections && savedInspections.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
              <div style={{ fontSize: 14 }}>Loading inspections...</div>
            </div>
          )}

          {!loadingInspections && savedInspections.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>--</div>
              <div style={{ fontSize: 14 }}>No saved inspections yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Start a new inspection to get started</div>
            </div>
          )}

          {savedInspections.map((insp) => {
            const date = insp.savedAt ? new Date(insp.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Unknown date";
            const typeLabel = insp.propertyType === "commercial" ? "Commercial" : "Residential";
            const stepNames = ["Client", "System", "Zones", "Review", "Summary"];
            const lastStep = stepNames[insp.step] || "Client";
            return (
              <div key={insp.id} style={{
                ...S.card, padding: "14px 16px", cursor: "pointer",
                borderLeft: `4px solid ${insp.propertyType === "commercial" ? "#2d6da8" : "#1a3a5c"}`,
                transition: "box-shadow 0.15s",
              }} onClick={() => loadInspection(insp)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a3a5c", marginBottom: 3 }}>
                      {insp.customerName || "Unnamed Customer"}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>{insp.address || "No address"}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: insp.propertyType === "commercial" ? "#2d6da8" : "#1a3a5c", padding: "2px 8px", borderRadius: 10 }}>{typeLabel}</span>
                      <span style={{ fontSize: 11, color: "#888" }}>{date}</span>
                      <span style={{ fontSize: 11, color: "#aaa", fontStyle: "italic" }}>Last: {lastStep}</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteInspection(insp.id); }} style={{
                    background: "none", border: "none", color: "#d32f2f", fontSize: 18,
                    cursor: "pointer", padding: "4px 8px", fontWeight: 700, flexShrink: 0,
                  }} title="Delete inspection">
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!propertyType) {
    return (
      <div style={S.container} ref={topRef}>
        <div style={S.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.5 }}>{companyName}</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>Wet Check Inspection App</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setShowInspectionList(true)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>Inspections</button>
              {onBackToDashboard && <button onClick={onBackToDashboard} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>Dashboard</button>}
              <button onClick={() => { setCompanyDraft(company || { name: "", phone: "", website: "", logo: null }); setShowCompanySetup(true); }} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>
                Setup
              </button>
              <button onClick={logout} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>
                Logout
              </button>
            </div>
          </div>
        </div>
        <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
          {company?.logo && <div style={{ textAlign: "center", marginBottom: 8 }}><img src={company.logo} alt="Logo" style={{ maxWidth: 180, maxHeight: 70 }} /></div>}
          <p style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: "#333", marginBottom: 8 }}>Select Property Type</p>
          {[
            { key: "residential", icon: "🏠", label: "Residential", desc: "Single-family homes, townhomes" },
            { key: "commercial", icon: "🏢", label: "Commercial", desc: "HOA, office, retail, municipal, schools & more" },
          ].map((opt) => (
            <button key={opt.key} onClick={() => { setPropertyType(opt.key); setShowInspectionList(false); }} style={S.typeCard}>
              <span style={{ fontSize: 36 }}>{opt.icon}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1a3a5c" }}>{opt.label}</div>
                <div style={{ fontSize: 13, color: "#777", marginTop: 2 }}>{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── RENDER STEPS (inline JSX, not component definitions) ───

  const renderStep = () => {
    // STEP 0: CLIENT
    if (step === 0) return (
      <div>
        <h2 style={S.stepTitle}>📋 Client Information</h2>
        {isCommercial && <>
          <Dropdown label="Property Sub-Type" value={client.propertySubType} onChange={(v) => updateClient("propertySubType", v)} options={PROPERTY_SUBTYPES} />
          <Field label="Complex / Building Name" value={client.buildingName} onChange={(v) => updateClient("buildingName", v)} placeholder="Sunset Plaza Shopping Center" />
        </>}
        <Field label="Client Name" value={client.name} onChange={(v) => updateClient("name", v)} placeholder="John Smith" />
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Property Address</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={client.address} onChange={(e) => updateClient("address", e.target.value)} placeholder="123 Main St" style={{ ...S.input, flex: 1 }} />
            <button onClick={fetchClientLocation} disabled={locating === "client"} style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid #1a3a5c", background: locating === "client" ? "#eee" : "#e8f0f8", color: "#1a3a5c", fontSize: 18, cursor: locating === "client" ? "wait" : "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              {locating === "client" ? "..." : "📍"}
            </button>
          </div>
          {client.lat && <div style={{ marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a href={`https://www.google.com/maps?q=${client.lat},${client.lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#1a3a5c" }}>View on Google Maps</a>
              <button onClick={() => { const ref = document.getElementById("clientLocPhoto"); ref?.click(); }} style={{ padding: "3px 8px", borderRadius: 6, border: "1.5px solid #1a3a5c", background: "#e8f0f8", color: "#1a3a5c", fontSize: 11, cursor: "pointer" }}>📷 Photo</button>
            </div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Lat: {client.lat.toFixed(6)}, Lng: {client.lng.toFixed(6)}</div>
            {client.locationImg && (
              <div style={{ position: "relative", display: "inline-block", marginTop: 6 }}>
                <img src={client.locationImg} alt="Location" style={{ width: "100%", maxWidth: 160, borderRadius: 8, border: "1.5px solid #ddd" }} />
                <button onClick={() => updateClient("locationImg", null)} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#d32f2f", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", lineHeight: "22px", padding: 0 }}>✕</button>
              </div>
            )}
            <input id="clientLocPhoto" type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { const img = new Image(); img.onload = () => { const MAX = 800; let w = img.width, h = img.height; if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } } const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h); updateClient("locationImg", c.toDataURL("image/jpeg", 0.7)); }; img.src = ev.target.result; }; reader.readAsDataURL(file); e.target.value = ""; }} style={{ display: "none" }} />
          </div>}
        </div>
        <Field label="City / Zip" value={client.city} onChange={(v) => updateClient("city", v)} placeholder="Fort Lauderdale, 33301" />
        <div style={S.grid2}>
          <Field label="Phone" value={client.phone} onChange={(v) => updateClient("phone", v)} type="tel" />
          <Field label="Work Order #" value={client.workOrder} onChange={(v) => updateClient("workOrder", v)} />
        </div>
        <Field label="Email" value={client.email} onChange={(v) => updateClient("email", v)} type="email" />
        <Field label={isCommercial ? "Management Company" : "Property Manager"} value={client.manager} onChange={(v) => updateClient("manager", v)} />
        <Field label="Date" value={client.date} onChange={(v) => updateClient("date", v)} type="date" />
        {isCommercial && <div style={S.grid2}>
          <Field label="# Buildings / Areas" value={client.numBuildings} onChange={(v) => updateClient("numBuildings", v)} type="number" />
          <Field label="Irrigated Acreage" value={client.irrigatedAcreage} onChange={(v) => updateClient("irrigatedAcreage", v)} placeholder="2.5" />
        </div>}
      </div>
    );

    // STEP 1: SYSTEM
    if (step === 1) return (
      <div>
        <h2 style={S.stepTitle}>⚙️ System Overview</h2>
        {controllers.map((ctrl, idx) => {
          const open = expandedCtrls.has(ctrl.id);
          return (
            <div key={ctrl.id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <SectionHead title={`Controller ${ctrl.id}`} collapsible open={open} onToggle={() => toggleCtrlExpand(ctrl.id)} />
                {controllers.length > 1 && <button onClick={() => removeController(idx)} style={S.removeBtn}>✕</button>}
              </div>
              {open && <div style={{ marginTop: 8 }}>
                <Field label="Make / Model" value={ctrl.make} onChange={(v) => updateController(idx, "make", v)} placeholder="Hunter Pro-C" />
                <Dropdown label="Type" value={ctrl.type} onChange={(v) => updateController(idx, "type", v)} options={CONTROLLER_TYPES} />
                <Field label="Location" value={ctrl.location} onChange={(v) => updateController(idx, "location", v)} placeholder="Garage, Utility room..." />
                <div style={S.grid2}>
                  <Field label="Zone From" value={ctrl.zoneFrom} onChange={(v) => updateController(idx, "zoneFrom", v)} type="number" placeholder="1" />
                  <Field label="Zone To" value={ctrl.zoneTo} onChange={(v) => updateController(idx, "zoneTo", v)} type="number" placeholder="12" />
                </div>
                <LocationBtn lat={ctrl.lat} lng={ctrl.lng} locating={locating === `ctrl-${ctrl.id}`} onLocate={() => fetchControllerLocation(idx, ctrl.id)} locationImg={ctrl.locationImg} onPhotoUpload={(img) => updateController(idx, "locationImg", img)} onPhotoRemove={() => updateController(idx, "locationImg", null)} />
              </div>}
            </div>
          );
        })}
        {(isCommercial || controllers.length === 0) && controllers.length < 10 && (
          <button onClick={addController} style={S.addBtn}>+ Add Controller</button>
        )}
        <div style={{ ...S.card, marginTop: 12 }}>
          <div style={S.grid2}>
            <Field label="Total Zones" value={system.totalZones} onChange={(v) => { updateSystem("totalZones", v); const n = Number(v); if (n > 0) ensureZones(Math.min(n, MAX_ZONES)); }} type="number" />
            <Field label="Active Zones" value={system.activeZones} onChange={(v) => { updateSystem("activeZones", v); const n = Number(v); if (n > 0) ensureZones(Math.min(n, MAX_ZONES)); }} type="number" />
          </div>
        </div>
        <div style={{ ...S.divider, margin: "14px 0" }} />
        <SectionHead title="💧 Water Supply" collapsible open={waterOpen} onToggle={() => setWaterOpen(!waterOpen)} />
        {waterOpen && <>
          <Dropdown label="Water Source" value={system.waterSource} onChange={(v) => updateSystem("waterSource", v)} options={WATER_SOURCES} />
          <div style={S.grid2}>
            <Field label="Meter Size" value={system.meterSize} onChange={(v) => updateSystem("meterSize", v)} placeholder='3/4", 1"...' />
            <Field label="Flow Rate (GPM)" value={system.flowRate} onChange={(v) => updateSystem("flowRate", v)} type="number" />
          </div>
          <div style={S.grid2}>
            <Field label="Static PSI" value={system.staticPSI} onChange={(v) => updateSystem("staticPSI", v)} type="number" />
            <Field label="Working PSI" value={system.workingPSI} onChange={(v) => updateSystem("workingPSI", v)} type="number" />
          </div>
        </>}
        <div style={{ ...S.divider, margin: "14px 0" }} />
        <SectionHead title="🔒 Backflow Devices" collapsible open={bfOpen} onToggle={() => setBfOpen(!bfOpen)} />
        {bfOpen && <>
          {backflows.map((bf, idx) => (
            <div key={bf.id} style={{ ...S.card, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>Backflow {bf.id}</span>
                {backflows.length > 1 && <button onClick={() => removeBackflow(idx)} style={S.removeBtn}>✕</button>}
              </div>
              <div style={S.grid2}>
                <Dropdown label="Type" value={bf.type} onChange={(v) => updateBackflow(idx, "type", v)} options={BACKFLOW_TYPES} />
                <Dropdown label="Condition" value={bf.condition} onChange={(v) => updateBackflow(idx, "condition", v)} options={["Good", "Needs Service", "Needs Replacement"]} />
              </div>
            </div>
          ))}
          {isCommercial && backflows.length < 6 && <button onClick={addBackflow} style={{ ...S.addBtn, marginTop: 6 }}>+ Add Backflow Device</button>}
        </>}
        <div style={{ ...S.divider, margin: "14px 0" }} />
        <SectionHead title="📡 Sensors & Pump" collapsible open={sensorOpen} onToggle={() => setSensorOpen(!sensorOpen)} />
        {sensorOpen && <>
          <Dropdown label="Rain Sensor" value={system.rainSensor} onChange={(v) => updateSystem("rainSensor", v)} options={["Working", "Not Working", "None Installed"]} />
          <Dropdown label="Pump Station" value={system.pumpStation} onChange={(v) => updateSystem("pumpStation", v)} options={["Yes", "No"]} />
          {system.pumpStation === "Yes" && (
            <LocationBtn lat={system.pumpLat} lng={system.pumpLng} locating={locating === "pump"} onLocate={fetchPumpLocation} locationImg={system.pumpLocationImg} onPhotoUpload={setPumpLocationImg} onPhotoRemove={() => setPumpLocationImg(null)} />
          )}
        </>}
        {isCommercial && <>
          <div style={{ ...S.divider, margin: "14px 0" }} />
          <SectionHead title="🏗️ Commercial Infrastructure" collapsible open={commOpen} onToggle={() => setCommOpen(!commOpen)} />
          {commOpen && <>
            <div style={S.grid2}>
              <Dropdown label="Mainline Size" value={system.mainlineSize} onChange={(v) => updateSystem("mainlineSize", v)} options={MAINLINE_SIZES} />
              <Dropdown label="Mainline Material" value={system.mainlineMaterial} onChange={(v) => updateSystem("mainlineMaterial", v)} options={MAINLINE_MATERIALS} />
            </div>
            <div style={S.grid2}>
              <Dropdown label="Master Valve" value={system.masterValve} onChange={(v) => updateSystem("masterValve", v)} options={["Yes", "No"]} />
              <Field label="Flow Sensor" value={system.flowSensor} onChange={(v) => updateSystem("flowSensor", v)} placeholder="Yes / Brand..." />
            </div>
            <Field label="Points of Connection (POC)" value={system.poc} onChange={(v) => updateSystem("poc", v)} type="number" />
          </>}
        </>}
      </div>
    );

    // STEP 2: ZONES
    if (step === 2) return (
      <div>
        <h2 style={S.stepTitle}>💧 Zone-by-Zone Check</h2>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <button onClick={toggleAllExpanded} style={{ ...S.toggle, fontSize: 11, padding: "5px 12px" }}>{allExpanded ? "Collapse All" : "Expand All"}</button>
          {isCommercial && <div style={{ display: "flex", gap: 4 }}>
            {[["none", "All"], ["area", "By Area"], ["controller", "By Ctrl"]].map(([val, label]) => (
              <button key={val} onClick={() => setGroupBy(val)} style={{ ...S.toggle, fontSize: 11, padding: "5px 10px", background: groupBy === val ? "#1a3a5c" : "#f5f5f5", color: groupBy === val ? "#fff" : "#555", borderColor: groupBy === val ? "#1a3a5c" : "#ddd" }}>{label}</button>
            ))}
          </div>}
        </div>
        <div style={{ background: "#eee", borderRadius: 6, height: 6, marginBottom: 14, overflow: "hidden" }}>
          <div style={{ width: `${progressPct}%`, height: "100%", background: "linear-gradient(90deg, #2d6da8, #1a3a5c)", borderRadius: 6, transition: "width 0.3s" }} />
        </div>
        {groupedZones.map((group, gi) => (
          <div key={gi}>
            {group.label && <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a5c", padding: "10px 0 6px", borderBottom: "1px solid #eee", marginBottom: 8 }}>{group.label} ({group.zones.length})</div>}
            {group.zones.map((zone, zi) => {
              const idx = group.indices ? group.indices[zi] : zones.indexOf(zone);
              const hasIssue = zone.leak || zone.broken || zone.clogged || zone.misaligned;
              const borderColor = zone.ok ? "#2d6da8" : hasIssue ? "#d32f2f" : "#ddd";
              const expanded = expandedZones.has(zone.id);
              const statusLabel = zone.ok ? "OK" : hasIssue ? "Issues" : "Pending";
              const statusColor = zone.ok ? "#2d6da8" : hasIssue ? "#d32f2f" : "#aaa";
              return (
                <div key={zone.id} style={{ ...S.zoneCard, borderLeft: `4px solid ${borderColor}` }}>
                  <div style={S.zoneHeader} onClick={() => toggleZoneExpand(zone.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={S.zoneBadge}>Z{zone.id}</span>
                      <span style={{ fontSize: 12, color: "#888" }}>{zone.type || ""}</span>
                      {zone.area ? <span style={{ fontSize: 11, color: "#aaa" }}>• {zone.area}</span> : null}
                      {zone.lat && <span style={{ fontSize: 11, color: "#1a3a5c" }}>📍</span>}
                      {zone.materials.length > 0 && <span style={{ fontSize: 11, color: "#1a3a5c" }}>🔧{zone.materials.length}</span>}
                      {((zone.beforeImgs?.length || 0) + (zone.afterImgs?.length || 0) > 0) && <span style={{ fontSize: 11, color: "#1a3a5c" }}>📷{(zone.beforeImgs?.length || 0) + (zone.afterImgs?.length || 0)}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, background: statusColor + "18", padding: "2px 10px", borderRadius: 12 }}>{statusLabel}</span>
                      <button onClick={(e) => { e.stopPropagation(); updateZone(idx, "ok", !zone.ok); }} style={{ ...S.okBtn, background: zone.ok ? "#2d6da8" : "#e8e8e8", color: zone.ok ? "#fff" : "#888" }}>{zone.ok ? "✓" : "OK"}</button>
                      <span style={{ fontSize: 12, color: "#bbb" }}>{expanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {expanded && <div style={{ marginTop: 10 }}>
                    <div style={S.grid2}>
                      <select value={zone.type} onChange={(e) => updateZone(idx, "type", e.target.value)} style={S.smallInput}>
                        <option value="">Zone Type</option>
                        {ZONE_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <select value={zone.headType} onChange={(e) => updateZone(idx, "headType", e.target.value)} style={S.smallInput}>
                        <option value="">Head Brand</option>
                        {HEAD_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={S.grid2}>
                      <input type="number" placeholder="# Heads" value={zone.heads} onChange={(e) => updateZone(idx, "heads", e.target.value)} style={S.smallInput} />
                      <input type="number" placeholder="PSI" value={zone.psi} onChange={(e) => updateZone(idx, "psi", e.target.value)} style={S.smallInput} />
                    </div>
                    <LocationBtn lat={zone.lat} lng={zone.lng} locating={locating === `zone-${zone.id}`} onLocate={() => fetchZoneLocation(idx, zone.id)} locationImg={zone.locationImg} onPhotoUpload={(img) => updateZone(idx, "locationImg", img)} onPhotoRemove={() => updateZone(idx, "locationImg", null)} />
                    {isCommercial && <div style={S.grid2}>
                      <input placeholder="Area / Location" value={zone.area} onChange={(e) => updateZone(idx, "area", e.target.value)} style={S.smallInput} />
                      <select value={zone.controllerId} onChange={(e) => updateZone(idx, "controllerId", Number(e.target.value))} style={S.smallInput}>
                        {controllers.map((c) => <option key={c.id} value={c.id}>Controller {c.id}</option>)}
                      </select>
                    </div>}
                    {!zone.ok && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {[["leak", "💧", "Leak"], ["broken", "💥", "Broken"], ["clogged", "🔧", "Clogged"], ["misaligned", "↗️", "Misaligned"]].map(([key, icon, label]) => (
                        <button key={key} onClick={() => updateZone(idx, key, !zone[key])} style={{ padding: "6px 12px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 600, background: zone[key] ? "#d32f2f" : "#f0f0f0", color: zone[key] ? "#fff" : "#666", cursor: "pointer" }}>{icon} {label}</button>
                      ))}
                    </div>}
                    {(hasIssue || zone.notes) && <input placeholder="Notes on issues..." value={zone.notes} onChange={(e) => updateZone(idx, "notes", e.target.value)} style={{ ...S.smallInput, width: "100%", marginTop: 8 }} />}

                    {/* Materials / Parts */}
                    <div style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>🔧 Materials Needed</span>
                        <span style={{ fontSize: 10, color: "#888" }}>{zone.materials.length} item{zone.materials.length !== 1 ? "s" : ""}</span>
                      </div>
                      {zone.materials.map((mat, mi) => (
                        <div key={mi} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                          <select value={mat.part} onChange={(e) => { const mats = [...zone.materials]; mats[mi] = { ...mats[mi], part: e.target.value }; updateZone(idx, "materials", mats); }} style={{ ...S.smallInput, flex: 1, fontSize: 12 }}>
                            <option value="">— Select Part —</option>
                            {Object.entries(PARTS_CATEGORIES).map(([cat, items]) => (
                              <optgroup key={cat} label={cat}>
                                {items.map((item) => <option key={item} value={item}>{item}</option>)}
                              </optgroup>
                            ))}
                          </select>
                          <input type="number" min="1" value={mat.qty} onChange={(e) => { const mats = [...zone.materials]; mats[mi] = { ...mats[mi], qty: e.target.value }; updateZone(idx, "materials", mats); }} placeholder="Qty" style={{ ...S.smallInput, width: 52, textAlign: "center", fontSize: 12 }} />
                          <button onClick={() => { const mats = zone.materials.filter((_, i) => i !== mi); updateZone(idx, "materials", mats); }} style={{ ...S.removeBtn, padding: "2px 6px", fontSize: 14 }}>✕</button>
                        </div>
                      ))}
                      <button onClick={() => updateZone(idx, "materials", [...zone.materials, { part: "", qty: 1 }])} style={{ ...S.addBtn, padding: 8, fontSize: 12, marginTop: 4 }}>+ Add Part</button>
                    </div>

                    <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                      <MultiPhotoUpload
                        label="Before"
                        imgs={zone.beforeImgs || []}
                        onAdd={(data) => updateZone(idx, "beforeImgs", [...(zone.beforeImgs || []), data])}
                        onRemove={(i) => updateZone(idx, "beforeImgs", (zone.beforeImgs || []).filter((_, j) => j !== i))}
                      />
                      <MultiPhotoUpload
                        label="After"
                        imgs={zone.afterImgs || []}
                        onAdd={(data) => updateZone(idx, "afterImgs", [...(zone.afterImgs || []), data])}
                        onRemove={(i) => updateZone(idx, "afterImgs", (zone.afterImgs || []).filter((_, j) => j !== i))}
                      />
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>
        ))}
        {activeZoneCount < MAX_ZONES && <button onClick={addMoreZones} style={S.addBtn}>+ Add More Zones</button>}
      </div>
    );

    // STEP 3: REVIEW
    if (step === 3) return (
      <div>
        <h2 style={S.stepTitle}>🔍 Review & Recommendations</h2>
        <h3 style={S.subTitle}>General Observations</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {BASE_OBS.map(([k, label]) => <Toggle key={k} label={label} checked={observations[k]} onChange={() => updateObs(k)} />)}
        </div>
        {isCommercial && <>
          <h3 style={S.subTitle}>Commercial Observations</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {COMMERCIAL_OBS.map(([k, label]) => <Toggle key={k} label={label} checked={observations[k]} onChange={() => updateObs(k)} />)}
          </div>
        </>}
        <div style={S.divider} />
        <h3 style={S.subTitle}>Recommendations</h3>
        <textarea value={recommendations} onChange={(e) => setRecommendations(e.target.value)} placeholder="List recommended repairs, upgrades, or maintenance items..." style={S.textarea} rows={5} />
        <div style={S.divider} />
        <h3 style={S.subTitle}>Priority Level</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {["Immediate / Safety", "High Priority", "Routine", "Upgrade"].map((p) => (
            <button key={p} onClick={() => setPriority(p)} style={{ ...S.toggle, background: priority === p ? "#1a3a5c" : "#f5f5f5", color: priority === p ? "#fff" : "#555", borderColor: priority === p ? "#1a3a5c" : "#ddd" }}>{p}</button>
          ))}
        </div>
        <div style={S.grid2}>
          <Field label="Est. Cost" value={estCost} onChange={setEstCost} placeholder="$500" />
          <Field label="Est. Time" value={estTime} onChange={setEstTime} placeholder="2 hours" />
        </div>
        <div style={S.divider} />
        <Field label="Technician Name" value={techName} onChange={setTechName} />
      </div>
    );

    // STEP 4: SUMMARY
    const rS = { section: { marginBottom: 16 }, heading: { fontSize: 14, fontWeight: 800, color: "#1a3a5c", borderBottom: "2px solid #1a3a5c", paddingBottom: 4, marginBottom: 10 }, row: { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }, lbl: { fontSize: 12, color: "#888", fontWeight: 600 }, val: { fontSize: 12, color: "#222", fontWeight: 500, textAlign: "right" } };
    const RRow = ({ label, value }) => value ? <div style={rS.row}><span style={rS.lbl}>{label}</span><span style={rS.val}>{value}</span></div> : null;

    const activeZonesData = zones.slice(0, activeZoneCount);
    const zonesOk = activeZonesData.filter((z) => z.ok);
    const zonesIssue = activeZonesData.filter((z) => z.leak || z.broken || z.clogged || z.misaligned);
    const obsEntries = [...BASE_OBS, ...(isCommercial ? COMMERCIAL_OBS : [])].filter(([k]) => observations[k]);

    return (
      <div>
        <h2 style={S.stepTitle}>Report Summary</h2>

        {/* Document-style preview */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "24px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", border: "1px solid #e0e0e0", marginBottom: 16 }}>
          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: "3px solid #1a3a5c", paddingBottom: 12, marginBottom: 16 }}>
            {company?.logo && <img src={company.logo} alt="Logo" style={{ maxWidth: 150, maxHeight: 60, marginBottom: 6 }} />}
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1a3a5c", letterSpacing: 1 }}>{companyName}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginTop: 4 }}>{isCommercial ? "Commercial" : "Residential"} Wet Check Inspection Report</div>
            {isCommercial && client.propertySubType && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{client.propertySubType}</div>}
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{client.date}</div>
          </div>

          {/* Client Info */}
          <div style={rS.section}>
            <div style={rS.heading}>Client Information</div>
            <RRow label="Client" value={client.name} />
            <RRow label="Address" value={[client.address, client.city].filter(Boolean).join(", ")} />
            {client.lat && <div style={rS.row}><span style={rS.lbl}>Location ({client.lat.toFixed(6)}, {client.lng.toFixed(6)})</span><a href={`https://www.google.com/maps?q=${client.lat},${client.lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#1a3a5c" }}>View on Google Maps</a></div>}
            <RRow label="Phone" value={client.phone} />
            <RRow label="Email" value={client.email} />
            <RRow label={isCommercial ? "Management Co." : "Property Manager"} value={client.manager} />
            <RRow label="Work Order" value={client.workOrder} />
            {isCommercial && <>
              <RRow label="Complex/Building" value={client.buildingName} />
              <RRow label="Buildings/Areas" value={client.numBuildings} />
              <RRow label="Irrigated Acreage" value={client.irrigatedAcreage} />
            </>}
          </div>

          {/* System */}
          <div style={rS.section}>
            <div style={rS.heading}>System Overview</div>
            {controllers.map((c) => (
              <div key={c.id}>
                <RRow label={`Controller ${c.id}`} value={[c.make, c.type, c.location].filter(Boolean).join(" — ") || "—"} />
                {c.lat && <div style={rS.row}><span style={rS.lbl}>  Location ({c.lat.toFixed(6)}, {c.lng.toFixed(6)})</span><a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#1a3a5c" }}>View on Maps</a></div>}
              </div>
            ))}
            <RRow label="Water Source" value={system.waterSource} />
            <RRow label="Meter Size" value={system.meterSize} />
            <RRow label="Flow Rate" value={system.flowRate ? `${system.flowRate} GPM` : ""} />
            <RRow label="Static / Working PSI" value={[system.staticPSI, system.workingPSI].filter(Boolean).join(" / ")} />
            {backflows.map((b) => <RRow key={b.id} label={`Backflow ${b.id}`} value={[b.type, b.condition].filter(Boolean).join(" — ") || "—"} />)}
            <RRow label="Rain Sensor" value={system.rainSensor} />
            <RRow label="Pump Station" value={system.pumpStation} />
            {system.pumpLat && <div style={rS.row}><span style={rS.lbl}>Pump Location ({system.pumpLat.toFixed(6)}, {system.pumpLng.toFixed(6)})</span><a href={`https://www.google.com/maps?q=${system.pumpLat},${system.pumpLng}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#1a3a5c" }}>View on Maps</a></div>}
            {isCommercial && <>
              <RRow label="Mainline" value={[system.mainlineSize, system.mainlineMaterial].filter(Boolean).join(" ")} />
              <RRow label="Master Valve" value={system.masterValve} />
              <RRow label="Flow Sensor" value={system.flowSensor} />
              <RRow label="Points of Connection" value={system.poc} />
            </>}
          </div>

          {/* Zone Summary */}
          <div style={rS.section}>
            <div style={rS.heading}>Zone Inspection Summary</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ background: "#e8f0f8", padding: "8px 16px", borderRadius: 8, textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#1a3a5c" }}>{zonesOk.length}</div>
                <div style={{ fontSize: 10, color: "#666" }}>OK</div>
              </div>
              <div style={{ background: "#ffebee", padding: "8px 16px", borderRadius: 8, textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#d32f2f" }}>{zonesIssue.length}</div>
                <div style={{ fontSize: 10, color: "#666" }}>Issues</div>
              </div>
              <div style={{ background: "#f5f5f5", padding: "8px 16px", borderRadius: 8, textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#555" }}>{activeZoneCount}</div>
                <div style={{ fontSize: 10, color: "#666" }}>Total</div>
              </div>
            </div>

            {/* Zone table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#1a3a5c", color: "#fff" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Zone</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Type</th>
                    <th style={{ padding: "6px 8px", textAlign: "center" }}>Heads</th>
                    <th style={{ padding: "6px 8px", textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeZonesData.map((z) => {
                    const issues = []; if (z.leak) issues.push("Leak"); if (z.broken) issues.push("Broken"); if (z.clogged) issues.push("Clogged"); if (z.misaligned) issues.push("Misaligned");
                    const st = z.ok ? "OK" : issues.length ? issues.join(", ") : "—";
                    const stColor = z.ok ? "#1a3a5c" : issues.length ? "#d32f2f" : "#999";
                    return (
                      <tr key={z.id} style={{ borderBottom: "1px solid #eee", background: z.id % 2 === 0 ? "#fafafa" : "#fff" }}>
                        <td style={{ padding: "5px 8px", fontWeight: 600 }}>Z{z.id}{z.area ? ` — ${z.area}` : ""}</td>
                        <td style={{ padding: "5px 8px" }}>{z.type || "—"}</td>
                        <td style={{ padding: "5px 8px", textAlign: "center" }}>{z.heads || "—"}</td>
                        <td style={{ padding: "5px 8px", textAlign: "center", color: stColor, fontWeight: 600 }}>{st}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Materials Summary */}
          {(() => {
            const matMap = {};
            activeZonesData.forEach((z) => { z.materials.filter((m) => m.part).forEach((m) => { matMap[m.part] = (matMap[m.part] || 0) + (Number(m.qty) || 1); }); });
            const matEntries = Object.entries(matMap);
            if (matEntries.length === 0) return null;
            return (
              <div style={rS.section}>
                <div style={rS.heading}>Materials Needed</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#1a3a5c", color: "#fff" }}>
                      <th style={{ padding: "5px 8px", textAlign: "left" }}>Part / Fitting</th>
                      <th style={{ padding: "5px 8px", textAlign: "center", width: 50 }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matEntries.map(([part, qty]) => (
                      <tr key={part} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "4px 8px" }}>{part}</td>
                        <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700 }}>{qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Observations */}
          {obsEntries.length > 0 && (
            <div style={rS.section}>
              <div style={rS.heading}>Observations</div>
              {obsEntries.map(([, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d32f2f", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#333" }}>{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {recommendations && (
            <div style={rS.section}>
              <div style={rS.heading}>Recommendations</div>
              <p style={{ fontSize: 12, color: "#333", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{recommendations}</p>
            </div>
          )}

          {/* Priority / Cost / Time */}
          <div style={rS.section}>
            <div style={rS.heading}>Estimate</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[["Priority", priority], ["Est. Cost", estCost], ["Est. Time", estTime]].map(([l, v]) => (
                <div key={l} style={{ flex: 1, background: "#f5faf7", border: "1px solid #dde8df", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#888", fontWeight: 600 }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a5c", marginTop: 4 }}>{v || "—"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Technician */}
          <div style={{ borderTop: "1px solid #ddd", paddingTop: 12 }}>
            <RRow label="Technician" value={techName} />
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: 16, paddingTop: 10, borderTop: "2px solid #1a3a5c" }}>
            <div style={{ fontSize: 10, color: "#888" }}>{companyWebsite}{companyPhone ? ` | ${companyPhone}` : ""} | Hablamos Espanol</div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={downloadPDF} style={{ ...S.navBtn, background: "#c62828", width: "100%", textAlign: "center" }}>Download PDF Report</button>
          <button onClick={shareWhatsApp} style={{ ...S.navBtn, background: "#25D366", width: "100%", textAlign: "center" }}>Share via WhatsApp</button>
          <button onClick={copyReport} style={{ ...S.navBtn, background: "#1a3a5c", width: "100%", textAlign: "center" }}>Copy to Clipboard</button>
          <button onClick={() => { const blob = new Blob([generateReport()], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `WetCheck_${client.name.replace(/\s/g, "_") || "report"}_${client.date}.txt`; a.click(); }} style={{ ...S.navBtn, background: "#1565C0", width: "100%", textAlign: "center" }}>Download as Text</button>
        </div>
      </div>
    );
  };

  // ─── MAIN RENDER ───

  const slideTransform = slideDir === "left" ? "translateX(-20px)" : slideDir === "right" ? "translateX(20px)" : "translateX(0)";
  const slideOpacity = slideDir === "none" ? 1 : 0.3;

  return (
    <div style={S.container} ref={topRef}>
      <div style={S.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {company?.logo && <img src={company.logo} alt="Logo" style={{ maxHeight: 30, maxWidth: 50, borderRadius: 4 }} />}
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5 }}>{companyName}</div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{isCommercial ? "Commercial" : "Residential"} Wet Check</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => saveInspection(false)} disabled={savingInspection} style={{ background: savingInspection ? "rgba(255,255,255,0.1)" : "rgba(76,175,80,0.85)", border: "none", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: savingInspection ? "wait" : "pointer", fontWeight: 600 }}>{savingInspection ? "Saving..." : "Save"}</button>
            <button onClick={() => setShowInspectionList(true)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>Inspections</button>
            {onBackToDashboard && <button onClick={onBackToDashboard} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>Dashboard</button>}
            <button onClick={() => { setPropertyType(null); setStep(0); }} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>Change</button>
            <button onClick={logout} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 600 }}>Logout</button>
          </div>
        </div>
        {/* Save message toast */}
        {saveMessage && (
          <div style={{
            marginTop: 6, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, textAlign: "center",
            background: saveMessage.startsWith("Error") ? "rgba(211,47,47,0.2)" : "rgba(76,175,80,0.2)",
            color: saveMessage.startsWith("Error") ? "#ffcdd2" : "#c8e6c9",
          }}>
            {saveMessage}
          </div>
        )}
      </div>
      <div style={S.stepBar}>
        {steps.map((s, i) => (
          <button key={s} onClick={() => { setStep(i); scrollTop(); }} style={{ ...S.stepDot, background: i === step ? "#1a3a5c" : i < step ? "#2d6da8" : "#ddd", color: i <= step ? "#fff" : "#999" }}>
            {i < step ? "✓" : i + 1}
          </button>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: "#888", marginBottom: 10 }}>{steps[step]}</div>
      {step === 2 && (
        <div style={S.statsBar}>
          <div style={S.stat}><span style={{ fontSize: 20, fontWeight: 800, color: "#1a3a5c" }}>{okCount}</span><span style={{ fontSize: 10, color: "#888" }}>OK</span></div>
          <div style={S.stat}><span style={{ fontSize: 20, fontWeight: 800, color: "#d32f2f" }}>{issueCount}</span><span style={{ fontSize: 10, color: "#888" }}>Issues</span></div>
          <div style={S.stat}><span style={{ fontSize: 20, fontWeight: 800, color: "#666" }}>{pendingCount}</span><span style={{ fontSize: 10, color: "#888" }}>Pending</span></div>
          <div style={S.stat}><span style={{ fontSize: 20, fontWeight: 800, color: "#1565C0" }}>{progressPct}%</span><span style={{ fontSize: 10, color: "#888" }}>Done</span></div>
        </div>
      )}
      <div style={{ ...S.content, transform: slideTransform, opacity: slideOpacity, transition: "transform 0.15s, opacity 0.15s" }}>
        {renderStep()}
      </div>
      <div style={S.navBar}>
        {step > 0 && <button onClick={() => goStep(-1)} style={{ ...S.navBtn, background: "#666" }}>← Back</button>}
        {step < 4 && <button onClick={() => goStep(1)} style={{ ...S.navBtn, background: "#1a3a5c", marginLeft: "auto" }}>{step === 3 ? "Generate Report →" : "Next →"}</button>}
      </div>
    </div>
  );
}
