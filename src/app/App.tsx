import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, Monitor, Camera, Bell, History, FileText, Settings,
  Shield, AlertTriangle, CheckCircle, WifiOff, Search, Download, Eye,
  Check, User, Cpu, MapPin, TrendingUp, TrendingDown, Sun, Moon,
  Maximize, ChevronLeft, ChevronRight, ChevronDown, Plus, Edit, Trash2, Radio, Zap, Star,
  Activity, Play, Pause, Upload, PlugZap, Plug, LogOut, LogIn, UserPlus, Users,
} from "lucide-react";
import { AuthPage } from "./AuthPage";
import { UsersPage } from "./UsersPage";
import { AuditLogsView } from "./AuditLogsView";
import { NotificationCenter } from "./NotificationCenter";
import marsaLogo from "../../asset/img/MARSA_LOGO.png";

// ─── Backend Configuration ─────────────────────────────────────────────────
//
// Point this at your Flask server. The Live Monitoring page polls
//   GET  {API_BASE_URL}/api/detections/{cameraId}
// and expects JSON shaped like:
//   {
//     "workers": 5,
//     "compliant": 4,
//     "boxes": [
//       { "x": 12.4, "y": 20.1, "w": 11.2, "h": 30.5, "label": "No Helmet", "conf": 94.2, "kind": "violation" }
//     ]
//   }
// x/y/w/h are percentages (0-100) relative to the video frame so boxes stay
// aligned regardless of the rendered video size. "kind" is one of
// "ok" | "violation" | "no-vest".
//
// When you later swap in a real RTSP camera, nothing here changes — only
// what the Flask endpoint does behind the scenes (OpenCV VideoCapture on a
// file today, on an rtsp:// URL later).
const API_BASE_URL = "http://localhost:5000";
const DETECTION_POLL_MS = 1000;


// ─── Static Data ─────────────────────────────────────────────────────────────

const cameras = [
  { id: "CAM-001", name: "TC1-Quay-North",    terminal: "Terminal 1", zone: "Quay Zone",       status: "online",  fps: 24, workers: 3,  violations: 1, ip: "192.168.1.101", uptime: "18h 42m", videoSrc: "/videos/CAM-001.mp4" },
  { id: "CAM-002", name: "TC1-Quay-South",    terminal: "Terminal 1", zone: "Quay Zone",       status: "online",  fps: 24, workers: 5,  violations: 0, ip: "192.168.1.102", uptime: "18h 42m", videoSrc: "/videos/CAM-002.mp4" },
  { id: "CAM-003", name: "TC1-Storage-A",     terminal: "Terminal 1", zone: "Storage Zone",    status: "online",  fps: 20, workers: 2,  violations: 0, ip: "192.168.1.103", uptime: "17h 15m", videoSrc: "/videos/CAM-003.mp4" },
  { id: "CAM-004", name: "TC1-Storage-B",     terminal: "Terminal 1", zone: "Storage Zone",    status: "offline", fps: 0,  workers: 0,  violations: 0, ip: "192.168.1.104", uptime: "—", videoSrc: "" },
  { id: "CAM-005", name: "TC1-Gate-Entry",    terminal: "Terminal 1", zone: "Gate Area",       status: "online",  fps: 25, workers: 8,  violations: 2, ip: "192.168.1.105", uptime: "18h 42m", videoSrc: "/videos/CAM-005.mp4" },
  { id: "CAM-006", name: "TC2-Quay-East",     terminal: "Terminal 2", zone: "Quay Zone",       status: "online",  fps: 24, workers: 4,  violations: 1, ip: "192.168.1.201", uptime: "18h 40m", videoSrc: "/videos/CAM-006.mp4" },
  { id: "CAM-007", name: "TC2-Quay-West",     terminal: "Terminal 2", zone: "Quay Zone",       status: "online",  fps: 22, workers: 6,  violations: 0, ip: "192.168.1.202", uptime: "18h 38m", videoSrc: "/videos/CAM-007.mp4" },
  { id: "CAM-008", name: "TC2-Container-Yrd", terminal: "Terminal 2", zone: "Container Yard",  status: "online",  fps: 24, workers: 7,  violations: 3, ip: "192.168.1.203", uptime: "18h 42m", videoSrc: "/videos/CAM-008.mp4" },
  { id: "CAM-009", name: "TC2-Workshop",      terminal: "Terminal 2", zone: "Workshop",        status: "online",  fps: 20, workers: 3,  violations: 0, ip: "192.168.1.204", uptime: "16h 55m", videoSrc: "/videos/CAM-009.mp4" },
  { id: "CAM-010", name: "TC2-Storage-Main",  terminal: "Terminal 2", zone: "Storage Zone",    status: "offline", fps: 0,  workers: 0,  violations: 0, ip: "192.168.1.205", uptime: "—", videoSrc: "" },
  { id: "CAM-011", name: "TC3-Gate-Main",     terminal: "Terminal 3", zone: "Gate Area",       status: "online",  fps: 25, workers: 12, violations: 1, ip: "192.168.1.301", uptime: "18h 42m", videoSrc: "/videos/CAM-011.mp4" },
  { id: "CAM-012", name: "TC3-Quay-A",        terminal: "Terminal 3", zone: "Quay Zone",       status: "online",  fps: 24, workers: 9,  violations: 2, ip: "192.168.1.302", uptime: "18h 42m", videoSrc: "/videos/CAM-012.mp4" },
  { id: "CAM-013", name: "TC3-Quay-B",        terminal: "Terminal 3", zone: "Quay Zone",       status: "online",  fps: 23, workers: 5,  violations: 0, ip: "192.168.1.303", uptime: "18h 10m", videoSrc: "/videos/CAM-013.mp4" },
  { id: "CAM-014", name: "TC3-Container-A",   terminal: "Terminal 3", zone: "Container Yard",  status: "online",  fps: 24, workers: 11, violations: 4, ip: "192.168.1.304", uptime: "18h 42m", videoSrc: "/videos/CAM-014.mp4" },
  { id: "CAM-015", name: "TC3-Container-B",   terminal: "Terminal 3", zone: "Container Yard",  status: "online",  fps: 21, workers: 6,  violations: 1, ip: "192.168.1.305", uptime: "17h 30m", videoSrc: "/videos/CAM-015.mp4" },
  { id: "CAM-016", name: "TC3-Workshop-Main", terminal: "Terminal 3", zone: "Workshop",        status: "online",  fps: 20, workers: 4,  violations: 0, ip: "192.168.1.306", uptime: "18h 00m", videoSrc: "/videos/CAM-016.mp4" },
];

const initialAlerts = [
  { id: "ALT-2847", worker: "Worker #A12", type: "No Helmet",           confidence: 94.2, camera: "CAM-005", terminal: "Terminal 1", zone: "Gate Area",      time: "14:32:08", status: "New" },
  { id: "ALT-2846", worker: "Worker #B07", type: "No Vest",             confidence: 91.7, camera: "CAM-008", terminal: "Terminal 2", zone: "Container Yard", time: "14:28:45", status: "New" },
  { id: "ALT-2845", worker: "Worker #C03", type: "No Helmet & No Vest", confidence: 97.1, camera: "CAM-014", terminal: "Terminal 3", zone: "Container Yard", time: "14:25:12", status: "Acknowledged" },
  { id: "ALT-2844", worker: "Worker #A08", type: "No Helmet",           confidence: 88.9, camera: "CAM-001", terminal: "Terminal 1", zone: "Quay Zone",      time: "14:20:33", status: "Acknowledged" },
  { id: "ALT-2843", worker: "Worker #D15", type: "No Vest",             confidence: 93.4, camera: "CAM-006", terminal: "Terminal 2", zone: "Quay Zone",      time: "14:15:07", status: "Resolved" },
  { id: "ALT-2842", worker: "Worker #B22", type: "No Helmet",           confidence: 96.8, camera: "CAM-012", terminal: "Terminal 3", zone: "Quay Zone",      time: "14:10:54", status: "Resolved" },
  { id: "ALT-2841", worker: "Worker #C11", type: "No Helmet & No Vest", confidence: 95.3, camera: "CAM-015", terminal: "Terminal 3", zone: "Container Yard", time: "14:05:22", status: "Resolved" },
  { id: "ALT-2840", worker: "Worker #A20", type: "No Vest",             confidence: 89.6, camera: "CAM-005", terminal: "Terminal 1", zone: "Gate Area",      time: "13:58:41", status: "Resolved" },
];

const incidents = [
  { id: "INC-2847", worker: "Worker #A12", type: "No Helmet",           confidence: 94.2, camera: "CAM-005", terminal: "Terminal 1", zone: "Gate Area",      date: "2026-07-14", time: "14:32:08", duration: "3m 12s",  status: "Active" },
  { id: "INC-2846", worker: "Worker #B07", type: "No Vest",             confidence: 91.7, camera: "CAM-008", terminal: "Terminal 2", zone: "Container Yard", date: "2026-07-14", time: "14:28:45", duration: "1m 45s",  status: "Active" },
  { id: "INC-2845", worker: "Worker #C03", type: "No Helmet & No Vest", confidence: 97.1, camera: "CAM-014", terminal: "Terminal 3", zone: "Container Yard", date: "2026-07-14", time: "14:25:12", duration: "7m 30s",  status: "Acknowledged" },
  { id: "INC-2841", worker: "Worker #C11", type: "No Helmet & No Vest", confidence: 95.3, camera: "CAM-015", terminal: "Terminal 3", zone: "Container Yard", date: "2026-07-14", time: "14:05:22", duration: "12m 08s", status: "Resolved" },
  { id: "INC-2835", worker: "Worker #D08", type: "No Helmet",           confidence: 92.1, camera: "CAM-011", terminal: "Terminal 3", zone: "Gate Area",      date: "2026-07-14", time: "13:45:11", duration: "5m 22s",  status: "Resolved" },
  { id: "INC-2821", worker: "Worker #A05", type: "No Vest",             confidence: 87.4, camera: "CAM-002", terminal: "Terminal 1", zone: "Quay Zone",      date: "2026-07-14", time: "12:30:00", duration: "2m 55s",  status: "Resolved" },
  { id: "INC-2810", worker: "Worker #B14", type: "No Helmet",           confidence: 93.8, camera: "CAM-007", terminal: "Terminal 2", zone: "Quay Zone",      date: "2026-07-13", time: "16:15:33", duration: "4m 10s",  status: "Resolved" },
  { id: "INC-2798", worker: "Worker #C19", type: "No Vest",             confidence: 90.2, camera: "CAM-012", terminal: "Terminal 3", zone: "Quay Zone",      date: "2026-07-13", time: "14:52:17", duration: "8m 45s",  status: "Resolved" },
  { id: "INC-2785", worker: "Worker #D02", type: "No Helmet & No Vest", confidence: 96.5, camera: "CAM-014", terminal: "Terminal 3", zone: "Container Yard", date: "2026-07-13", time: "11:28:44", duration: "15m 20s", status: "Resolved" },
  { id: "INC-2770", worker: "Worker #A17", type: "No Helmet",           confidence: 91.0, camera: "CAM-001", terminal: "Terminal 1", zone: "Quay Zone",      date: "2026-07-12", time: "09:14:22", duration: "6m 05s",  status: "Resolved" },
];

const complianceTrend = [
  { time: "08:00", compliance: 82, violations: 6 },
  { time: "09:00", compliance: 87, violations: 4 },
  { time: "10:00", compliance: 91, violations: 3 },
  { time: "11:00", compliance: 88, violations: 5 },
  { time: "12:00", compliance: 85, violations: 6 },
  { time: "13:00", compliance: 79, violations: 8 },
  { time: "14:00", compliance: 84, violations: 5 },
  { time: "Now",   compliance: 87, violations: 4 },
];

const violationsByTerminal = [
  { terminal: "TC1", helmet: 8,  vest: 5,  both: 3 },
  { terminal: "TC2", helmet: 12, vest: 9,  both: 5 },
  { terminal: "TC3", helmet: 15, vest: 11, both: 7 },
];

const weeklyCompliance = [
  { day: "Mon", compliance: 88, violations: 18 },
  { day: "Tue", compliance: 85, violations: 22 },
  { day: "Wed", compliance: 91, violations: 13 },
  { day: "Thu", compliance: 87, violations: 19 },
  { day: "Fri", compliance: 83, violations: 25 },
  { day: "Sat", compliance: 79, violations: 30 },
  { day: "Sun", compliance: 86, violations: 20 },
];

const monthlyCompliance = [
  { week: "W1", compliance: 85, violations: 95 },
  { week: "W2", compliance: 88, violations: 78 },
  { week: "W3", compliance: 82, violations: 112 },
  { week: "W4", compliance: 87, violations: 84 },
];

const violationTypePie = [
  { name: "No Helmet",    value: 35,  color: "#ef4444" },
  { name: "No Vest",      value: 28,  color: "#f97316" },
  { name: "Both Missing", value: 15,  color: "#a855f7" },
  { name: "Compliant",    value: 134, color: "#22c55e" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Page = "dashboard" | "monitoring" | "cameras" | "alerts" | "incidents" | "reports" | "settings" | "localisation" | "users" | "audit-logs" | "login";

type DetectionBox = {
  x: number; y: number; w: number; h: number;
  label: string; conf: number; kind: "ok" | "violation";
  missing: string[];   // ["Helmet"], ["Vest"], ["Helmet","Vest"] ou []
  status: "CONFORM" | "NON-CONFORM";
  text: string;
};

type DetectionPayload = {
  workers: number;
  compliant: number;
  boxes: DetectionBox[];
};

const navItems: { id: Page; label: string; icon: React.ElementType; badge?: number }[] = [
  { id: "dashboard",  label: "Dashboard",        icon: LayoutDashboard },
  { id: "monitoring", label: "Live Monitoring",  icon: Monitor },
  { id: "cameras",    label: "Cameras",          icon: Camera },
  { id: "localisation", label: "Localisation",   icon: MapPin },
  { id: "alerts",     label: "Active Alerts",    icon: Bell, badge: 2 },
  { id: "incidents",  label: "Incident History", icon: History },
  { id: "reports",    label: "Reports",          icon: FileText },
  { id: "users",      label: "Utilisateurs",     icon: Users },
  { id: "audit-logs", label: "Journal d'Audit",  icon: Shield },
  { id: "settings",   label: "Settings",         icon: Settings },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useDateTime() {
  const [dt, setDt] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setDt(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return dt;
}

// Polls the Flask backend for the latest detections on a given camera.
// Falls back to a static demo overlay if the backend isn't reachable yet,
// so the frontend keeps working while the API is being built.
function useDetections(cameraId: string, enabled: boolean) {
  const [data, setData] = useState<DetectionPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setChecking(true);

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/detections/${cameraId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DetectionPayload;
        if (!cancelled) {
          setData(json);
          setConnected(true);
        }
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    poll();
    const id = setInterval(poll, DETECTION_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [cameraId, enabled]);

  return { data, connected, checking };
}

function useBackendHealth() {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/health`, { cache: "no-store" });
        if (!cancelled) {
          setIsOnline(res.ok);
        }
      } catch {
        if (!cancelled) {
          setIsOnline(false);
        }
      }
    };

    checkHealth();
    const id = setInterval(checkHealth, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return isOnline;
}

function MarsaStarLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* White / Light Facet */}
      <path
        d="M50 5 L60.6 35.4 L92.8 36.1 L67.1 55.6 L76.5 86.4 L50 68 Z"
        fill="#ffffff"
      />
      {/* Bright Cyan Blue Facet */}
      <path
        d="M50 5 L50 68 L23.5 86.4 L32.9 55.6 L7.2 36.1 L39.4 35.4 Z"
        fill="#0082c8"
      />
    </svg>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

const tooltipStyle = {
  background: "#081428",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2eaf4",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    online:       { bg: "bg-green-500/10",  text: "text-green-400",  dot: "bg-green-400" },
    offline:      { bg: "bg-red-500/10",    text: "text-red-400",    dot: "bg-red-400" },
    New:          { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-400" },
    Acknowledged: { bg: "bg-blue-500/10",   text: "text-blue-400",   dot: "bg-blue-400" },
    Resolved:     { bg: "bg-green-500/10",  text: "text-green-400",  dot: "bg-green-400" },
    Active:       { bg: "bg-red-500/10",    text: "text-red-400",    dot: "bg-red-400" },
  };
  const s = map[status] ?? { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function ViolationBadge({ type }: { type: string }) {
  if (type.includes("&")) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400 whitespace-nowrap">{type}</span>;
  if (type === "No Helmet") return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">{type}</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-500/20 text-orange-400">{type}</span>;
}

function KPICard({ label, value, sub, icon: Icon, trend, color = "orange" }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; trend?: string; color?: string;
}) {
  const palette: Record<string, string> = { orange: "#f97316", green: "#22c55e", red: "#ef4444", blue: "#3b82f6" };
  const c = palette[color] ?? "#f97316";
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{label}</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${c}20` }}>
          <Icon size={18} style={{ color: c }} />
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold font-mono text-foreground">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </div>
      {trend && (
        <div className="text-xs flex items-center gap-1" style={{ color: trend.startsWith("+") ? "#22c55e" : "#ef4444" }}>
          {trend.startsWith("+") ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend} vs yesterday
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-foreground tracking-wide">{title}</h2>
      {action}
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-10 h-5 rounded-full transition-colors relative flex-shrink-0"
      style={{ background: on ? "#f97316" : "rgba(255,255,255,0.12)" }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200"
        style={{ left: on ? "calc(100% - 18px)" : "2px" }}
      />
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ page, setPage, collapsed, setCollapsed, currentUser }: {
  page: Page; setPage: (p: Page) => void; collapsed: boolean; setCollapsed: (v: boolean) => void;
  currentUser: { name: string; email: string; role: string; terminal: string } | null;
}) {
  const isAdmin = !!(currentUser?.role && (currentUser.role.toLowerCase().includes("admin") || currentUser.role.toLowerCase().includes("administrateur")));
  const isOnline = useBackendHealth();

  const visibleNavItems = navItems.filter(item => {
    if (item.id === "users" && !isAdmin) return false;
    return true;
  });

  return (
    <aside
      className="flex flex-col h-full border-r border-sidebar-border transition-all duration-300 flex-shrink-0"
      style={{ width: collapsed ? 60 : 232, background: "var(--sidebar)" }}
    >
      {/* Brand Header */}
      <div className={`flex items-center border-b border-sidebar-border py-3 px-3.5 transition-all ${collapsed ? "flex-col justify-center gap-3" : "justify-between gap-2"}`}>
        {collapsed ? (
          <>
            <div
              className="flex items-center justify-center p-1 cursor-pointer hover:scale-110 transition-transform"
              title="Marsa Maroc — EPI"
              onClick={() => setCollapsed(false)}
            >
              <MarsaStarLogo className="w-8 h-8 drop-shadow" />
            </div>
            <button
              onClick={() => setCollapsed(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              style={{ color: "var(--sidebar-foreground)" }}
              title="Agrandir le menu"
            >
              <ChevronRight size={14} />
            </button>
          </>
        ) : (
          <>
            <div className="flex-1 flex items-center justify-start min-w-0 px-1">
              <img
                src={marsaLogo}
                alt="Marsa Maroc Logo"
                className="h-10 w-auto max-w-full object-contain filter brightness-0 invert opacity-95 hover:opacity-100 transition-opacity"
                style={{ mixBlendMode: "screen" }}
              />
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              style={{ color: "var(--sidebar-foreground)" }}
              title="Réduire le menu"
            >
              <ChevronLeft size={14} />
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {visibleNavItems.map((item) => {
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm transition-all duration-150 relative ${collapsed ? "justify-center" : ""}`}
              style={active
                ? { background: "#f97316", color: "#fff" }
                : { color: "var(--sidebar-foreground)" }
              }
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = ""; }}
            >
              <item.icon size={16} className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="font-medium truncate flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold leading-none">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && item.badge && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer status */}
      <div className="border-t border-sidebar-border p-2 space-y-1.5">
        {/* AI Engine Status */}
        <div
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all ${
            isOnline === true
              ? "bg-green-500/10 border border-green-500/20"
              : isOnline === false
              ? "bg-amber-500/10 border border-amber-500/20"
              : "bg-blue-500/10 border border-blue-500/20"
          } ${collapsed ? "justify-center" : ""}`}
          title={
            collapsed
              ? isOnline === true
                ? "YOLOv8s Actif (Connecté)"
                : isOnline === false
                ? "IA Mode Démo (Injoignable)"
                : "Vérification..."
              : undefined
          }
        >
          {isOnline === true ? (
            <Cpu size={12} className="text-green-400 flex-shrink-0 animate-pulse" />
          ) : isOnline === false ? (
            <Cpu size={12} className="text-amber-400 flex-shrink-0 opacity-70" />
          ) : (
            <Activity size={12} className="text-blue-400 flex-shrink-0 animate-spin" />
          )}

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div
                className={`text-xs font-medium leading-none truncate ${
                  isOnline === true
                    ? "text-green-400"
                    : isOnline === false
                    ? "text-amber-400"
                    : "text-blue-400"
                }`}
              >
                {isOnline === true
                  ? "YOLOv8s Actif"
                  : isOnline === false
                  ? "IA Mode Démo"
                  : "Vérification..."}
              </div>
              <div
                className={`text-xs mt-0.5 truncate ${
                  isOnline === true
                    ? "text-green-500/70"
                    : isOnline === false
                    ? "text-amber-500/70"
                    : "text-blue-500/70"
                }`}
              >
                {isOnline === true
                  ? "Moteur IA en cours"
                  : isOnline === false
                  ? "Backend non détecté"
                  : "Test de connexion..."}
              </div>
            </div>
          )}
        </div>

        {/* Backend Connectivity Status */}
        <div
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all ${
            isOnline === true
              ? "bg-blue-500/10 border border-blue-500/20"
              : isOnline === false
              ? "bg-red-500/10 border border-red-500/20"
              : "bg-gray-500/10 border border-gray-500/20"
          } ${collapsed ? "justify-center" : ""}`}
          title={
            collapsed
              ? isOnline === true
                ? "Serveur Backend En Ligne (Port 5000)"
                : isOnline === false
                ? "Serveur Backend Hors Ligne"
                : "Connexion..."
              : undefined
          }
        >
          {isOnline === true ? (
            <Radio size={12} className="text-blue-400 flex-shrink-0" />
          ) : isOnline === false ? (
            <WifiOff size={12} className="text-red-400 flex-shrink-0 animate-pulse" />
          ) : (
            <Radio size={12} className="text-gray-400 flex-shrink-0" />
          )}

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div
                className={`text-xs font-medium leading-none truncate ${
                  isOnline === true
                    ? "text-blue-400"
                    : isOnline === false
                    ? "text-red-400"
                    : "text-gray-400"
                }`}
              >
                {isOnline === true
                  ? "Backend En Ligne"
                  : isOnline === false
                  ? "Backend Hors Ligne"
                  : "Connexion..."}
              </div>
              <div
                className={`text-xs mt-0.5 truncate ${
                  isOnline === true
                    ? "text-blue-500/70"
                    : isOnline === false
                    ? "text-red-500/70"
                    : "text-gray-500/70"
                }`}
              >
                {isOnline === true
                  ? "API Flask (Port 5000)"
                  : isOnline === false
                  ? "Simulation Frontend"
                  : "Vérification..."}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

const pageLabels: Record<Page, string> = {
  dashboard:  "Dashboard Overview",
  monitoring: "Live Monitoring",
  cameras:    "Camera Management",
  localisation: "Localisation des infractions",
  alerts:     "Active Alerts",
  incidents:  "Incident History",
  reports:    "Reports & Analytics",
  users:      "Gestion des Utilisateurs",
  "audit-logs": "Journal d'Audit & Sécurité",
  settings:   "System Settings",
  login:      "Espace Connexion",
};

function TopBar({
  page,
  darkMode,
  setDarkMode,
  currentUser,
  onLogout,
  setPage,
}: {
  page: Page;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  currentUser: { name: string; email: string; role: string; terminal: string } | null;
  onLogout: () => void;
  setPage: (p: Page) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dt = useDateTime();
  const date = dt.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const time = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const getInitials = (name?: string) => {
    if (!name) return "KA";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="relative z-50 flex items-center px-5 border-b border-border bg-card/60 backdrop-blur-sm gap-4 flex-shrink-0" style={{ height: 52 }}>
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">{pageLabels[page]}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span>{date}</span>
          <span className="text-foreground font-semibold">{time}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <NotificationCenter apiBaseUrl={API_BASE_URL} onNavigate={(p) => setPage(p as Page)} />
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          title={darkMode ? "Mode Clair" : "Mode Sombre"}
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <div className="h-4 w-px bg-border" />

        {currentUser ? (
          <div className="relative" ref={menuRef}>
            {/* User Profile Button Trigger */}
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2.5 px-2.5 py-1 rounded-xl hover:bg-muted/50 transition-all border border-transparent hover:border-border/60"
            >
              <div className="relative">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md flex-shrink-0" style={{ background: "#f97316" }}>
                  {getInitials(currentUser.name)}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-card" />
              </div>
              <div className="hidden md:block text-left text-xs">
                <div className="font-semibold text-foreground leading-none">{currentUser.name}</div>
                <div className="text-muted-foreground mt-0.5 text-[11px]">{currentUser.role}</div>
              </div>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${dropdownOpen ? "rotate-180 text-primary" : ""}`} />
            </button>

            {/* Dropdown Menu Popup */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-card border border-border/80 shadow-2xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-xl">
                {/* User Header Info Card */}
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/40 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md flex-shrink-0" style={{ background: "#f97316" }}>
                    {getInitials(currentUser.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-foreground truncate">{currentUser.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{currentUser.email}</div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-medium border border-primary/20">
                        {currentUser.role}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  {currentUser?.role && (currentUser.role.toLowerCase().includes("admin") || currentUser.role.toLowerCase().includes("administrateur")) && (
                    <button
                      onClick={() => { setPage("users"); setDropdownOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-foreground hover:bg-primary/10 hover:text-primary transition-colors text-left font-medium"
                    >
                      <Users size={15} className="text-primary" />
                      <span>Gestion des Utilisateurs</span>
                    </button>
                  )}

                  <button
                    onClick={() => { setPage("audit-logs"); setDropdownOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-foreground hover:bg-primary/10 hover:text-primary transition-colors text-left font-medium"
                  >
                    <Shield size={15} className="text-primary" />
                    <span>Journal d'Audit & Sécurité</span>
                  </button>

                  <button
                    onClick={() => { setPage("settings"); setDropdownOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-foreground hover:bg-primary/10 hover:text-primary transition-colors text-left font-medium"
                  >
                    <Settings size={15} className="text-muted-foreground" />
                    <span>Paramètres du Système</span>
                  </button>

                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-foreground hover:bg-muted/50 transition-colors text-left font-medium"
                  >
                    <div className="flex items-center gap-2.5">
                      {darkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-indigo-400" />}
                      <span>Mode d'Affichage</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-primary/10 text-primary border border-primary/20">
                      {darkMode ? "Sombre" : "Clair"}
                    </span>
                  </button>
                </div>

                <div className="my-2.5 h-px bg-border/60" />

                <button
                  onClick={() => { setDropdownOpen(false); onLogout(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-500 hover:bg-red-500/10 transition-colors font-medium text-xs"
                >
                  <LogOut size={15} />
                  <span>Se Déconnecter</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage("login")}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-primary text-white hover:opacity-90 transition-opacity"
            >
              Connexion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ============================================================
//  LOCALISATION VIEW (imported from your localisation.tsx)
// ============================================================
import { useState as useStateLocal, useRef as useRefLocal } from "react";
import { Clock as ClockIcon, X as XIcon, MapPin as MapPinIcon, Navigation as NavigationIcon } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type ViolationType = "no-vest" | "no-helmet" | "no-vest + no-helmet";
type CameraStatus = "online" | "offline" | "warning";
type NavItem = "dashboard" | "cameras" | "localisation" | "alertes" | "historique";

// Position in camera frame: bx/by = normalized bounding-box center (0–1)
// mapX/mapY = position on facility floor plan (0–100 %)
interface PersonPosition {
  bx: number;       // horiz. center in camera frame  (0=left, 1=right)
  by: number;       // vert.  center in camera frame  (0=top,  1=bottom)
  distanceM: number;// estimated distance from camera in metres
  angleRel: number; // angle relative to camera optical axis, degrees (neg=left, pos=right)
  mapX: number;     // % x on facility map
  mapY: number;     // % y on facility map
}

interface Violation {
  id: string;
  camera: string;
  zone: string;
  type: ViolationType;
  date: string;
  time: string;
  confidence: number;
  imageUrl: string;
  acknowledged: boolean;
  position: PersonPosition;
}

interface CameraFeed {
  id: string;
  name: string;
  zone: string;
  status: CameraStatus;
  compliant: number;
  violations: number;
  lastActivity: string;
  previewUrl: string;
  // facility map placement
  mapX: number;   // % on plan
  mapY: number;
  fovAngle: number;     // full FOV in degrees
  fovDirection: number; // pointing direction in degrees (0=right, 90=down, 180=left, 270=up)
  fovRange: number;     // range in % of map
}

// ── Mock Data ──────────────────────────────────────────────────────────────
const CAMERAS: CameraFeed[] = [
  {
    id: "CAM-001", name: "Entrée principale", zone: "Zone A",
    status: "online", compliant: 24, violations: 3, lastActivity: "il y a 2 min",
    previewUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=260&fit=crop&auto=format",
    mapX: 8, mapY: 30, fovAngle: 70, fovDirection: 0, fovRange: 28,
  },
  {
    id: "CAM-002", name: "Atelier assemblage", zone: "Zone B",
    status: "online", compliant: 18, violations: 7, lastActivity: "il y a 30 sec",
    previewUrl: "https://images.unsplash.com/photo-1565793979665-e4a40b817161?w=400&h=260&fit=crop&auto=format",
    mapX: 30, mapY: 52, fovAngle: 80, fovDirection: 355, fovRange: 30,
  },
  {
    id: "CAM-003", name: "Quai de chargement", zone: "Zone C",
    status: "warning", compliant: 9, violations: 12, lastActivity: "il y a 1 min",
    previewUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=400&h=260&fit=crop&auto=format",
    mapX: 88, mapY: 78, fovAngle: 90, fovDirection: 180, fovRange: 32,
  },
  {
    id: "CAM-004", name: "Salle de contrôle", zone: "Zone D",
    status: "online", compliant: 31, violations: 1, lastActivity: "il y a 5 min",
    previewUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&h=260&fit=crop&auto=format",
    mapX: 72, mapY: 12, fovAngle: 60, fovDirection: 90, fovRange: 25,
  },
  {
    id: "CAM-005", name: "Stockage matériaux", zone: "Zone E",
    status: "offline", compliant: 0, violations: 0, lastActivity: "hors ligne",
    previewUrl: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=400&h=260&fit=crop&auto=format",
    mapX: 18, mapY: 82, fovAngle: 70, fovDirection: 10, fovRange: 27,
  },
  {
    id: "CAM-006", name: "Sortie de secours", zone: "Zone F",
    status: "online", compliant: 6, violations: 2, lastActivity: "il y a 8 min",
    previewUrl: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=400&h=260&fit=crop&auto=format",
    mapX: 52, mapY: 90, fovAngle: 65, fovDirection: 270, fovRange: 26,
  },
];

const VIOLATIONS: Violation[] = [
  {
    id: "VIO-2026-0891", camera: "CAM-003", zone: "Zone C – Quai de chargement",
    type: "no-vest", date: "15/07/2026", time: "09:47:22", confidence: 97.3,
    imageUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=200&h=140&fit=crop&auto=format",
    acknowledged: false,
    position: { bx: 0.42, by: 0.61, distanceM: 6.2, angleRel: -8, mapX: 67, mapY: 74 },
  },
  {
    id: "VIO-2026-0890", camera: "CAM-002", zone: "Zone B – Atelier assemblage",
    type: "no-helmet", date: "15/07/2026", time: "09:31:05", confidence: 94.1,
    imageUrl: "https://images.unsplash.com/photo-1565793979665-e4a40b817161?w=200&h=140&fit=crop&auto=format",
    acknowledged: false,
    position: { bx: 0.58, by: 0.55, distanceM: 4.8, angleRel: 12, mapX: 45, mapY: 49 },
  },
  {
    id: "VIO-2026-0889", camera: "CAM-003", zone: "Zone C – Quai de chargement",
    type: "no-vest + no-helmet", date: "15/07/2026", time: "09:14:58", confidence: 99.0,
    imageUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.71, by: 0.48, distanceM: 9.1, angleRel: 22, mapX: 61, mapY: 71 },
  },
  {
    id: "VIO-2026-0888", camera: "CAM-001", zone: "Zone A – Entrée principale",
    type: "no-vest", date: "15/07/2026", time: "08:52:44", confidence: 91.6,
    imageUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.34, by: 0.67, distanceM: 7.4, angleRel: -15, mapX: 22, mapY: 34 },
  },
  {
    id: "VIO-2026-0887", camera: "CAM-006", zone: "Zone F – Sortie de secours",
    type: "no-helmet", date: "15/07/2026", time: "08:33:17", confidence: 88.9,
    imageUrl: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.50, by: 0.42, distanceM: 5.3, angleRel: 3, mapX: 54, mapY: 72 },
  },
  {
    id: "VIO-2026-0886", camera: "CAM-002", zone: "Zone B – Atelier assemblage",
    type: "no-vest", date: "14/07/2026", time: "16:58:03", confidence: 95.7,
    imageUrl: "https://images.unsplash.com/photo-1565793979665-e4a40b817161?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.28, by: 0.70, distanceM: 3.9, angleRel: -20, mapX: 38, mapY: 55 },
  },
  {
    id: "VIO-2026-0885", camera: "CAM-003", zone: "Zone C – Quai de chargement",
    type: "no-vest + no-helmet", date: "14/07/2026", time: "15:22:41", confidence: 98.2,
    imageUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.63, by: 0.57, distanceM: 11.5, angleRel: 18, mapX: 59, mapY: 68 },
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
/** Build SVG path for camera FOV cone */
function fovPath(cx: number, cy: number, angleDeg: number, dirDeg: number, rangeR: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const half = angleDeg / 2;
  const left  = dirDeg - half;
  const right = dirDeg + half;
  const x1 = cx + rangeR * Math.cos(toRad(left));
  const y1 = cy + rangeR * Math.sin(toRad(left));
  const x2 = cx + rangeR * Math.cos(toRad(right));
  const y2 = cy + rangeR * Math.sin(toRad(right));
  return `M ${cx} ${cy} L ${x1} ${y1} A ${rangeR} ${rangeR} 0 0 1 ${x2} ${y2} Z`;
}

// ── ViolationBadge (dépendance du composant) ─────────────────────────────
function ViolationBadgeLocal({ type }: { type: ViolationType }) {
  const map: Record<ViolationType, { label: string; cls: string }> = {
    "no-vest":             { label: "Pas de gilet",   cls: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
    "no-helmet":           { label: "Pas de casque",  cls: "bg-red-500/15 text-red-400 border border-red-500/30" },
    "no-vest + no-helmet": { label: "Gilet + Casque", cls: "bg-purple-500/15 text-purple-400 border border-purple-500/30" },
  };
  const { label, cls } = map[type];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${cls}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {label}
    </span>
  );
}

// ── Localisation View ──────────────────────────────────────────────────────
function LocalisationView({ violations, onNav }: { violations: Violation[]; onNav: (v: NavItem) => void }) {
  const mapRef = useRefLocal<SVGSVGElement>(null);
  const [selected, setSelected] = useStateLocal<Violation | null>(null);
  const [hoveredCam, setHoveredCam] = useStateLocal<string | null>(null);
  const [showAll, setShowAll] = useStateLocal(false);

  const activeViolations = showAll ? violations : violations.filter(v => !v.acknowledged);

  // SVG viewport size
  const W = 800, H = 520;
  const px = (pct: number) => (pct / 100) * W;
  const py = (pct: number) => (pct / 100) * H;

  // Zones overlay data
  const zones = [
    { label: "Zone A\nEntrée", x: 0,   y: 0,   w: 22, h: 50, fill: "rgba(59,130,246,0.06)"  },
    { label: "Zone B\nAtelier", x: 22, y: 35,  w: 35, h: 40, fill: "rgba(168,85,247,0.06)" },
    { label: "Zone C\nQuai",    x: 57, y: 55,  w: 43, h: 45, fill: "rgba(239,68,68,0.06)"   },
    { label: "Zone D\nContrôle",x: 55, y: 0,   w: 45, h: 40, fill: "rgba(34,197,94,0.06)"   },
    { label: "Zone E\nStockage",x: 0,  y: 60,  w: 30, h: 40, fill: "rgba(234,179,8,0.06)"   },
    { label: "Zone F\nSortie",  x: 40, y: 80,  w: 20, h: 20, fill: "rgba(20,184,166,0.06)"  },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Localisation des infractions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Position estimée par rapport à la caméra de référence (YOLOv8 bbox)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll(v => !v)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${showAll ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {showAll ? "Toutes les infractions" : "Non acquittées uniquement"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Map */}
        <div className="xl:col-span-2 bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Plan du site — Vue de dessus</span>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-400/80 inline-block" />Caméra active</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400/80 inline-block" />Alerte</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Infraction</span>
            </div>
          </div>

          <svg
            ref={mapRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ background: "#0f1219" }}
          >
            {/* Grid */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              </pattern>
              {CAMERAS.map(cam => (
                <radialGradient key={`grad-${cam.id}`} id={`fov-${cam.id}`} cx="0%" cy="0%" r="100%">
                  <stop offset="0%" stopColor={
                    cam.status === "offline" ? "#6b7280" :
                    cam.status === "warning"  ? "#f59e0b" : "#22c55e"
                  } stopOpacity="0.18" />
                  <stop offset="100%" stopColor={
                    cam.status === "offline" ? "#6b7280" :
                    cam.status === "warning"  ? "#f59e0b" : "#22c55e"
                  } stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            <rect width={W} height={H} fill="url(#grid)" />

            {/* Facility outer wall */}
            <rect x="10" y="10" width={W - 20} height={H - 20}
              fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" rx="4" />

            {/* Zone overlays */}
            {zones.map((z, i) => (
              <g key={i}>
                <rect
                  x={px(z.x) + 10} y={py(z.y) + 10}
                  width={px(z.w) - (z.x === 0 ? 5 : 0)} height={py(z.h) - (z.y === 0 ? 5 : 0)}
                  fill={z.fill} stroke="rgba(255,255,255,0.06)" strokeWidth="1" rx="2"
                />
                {z.label.split("\n").map((line, li) => (
                  <text key={li}
                    x={px(z.x + z.w / 2)} y={py(z.y) + 26 + li * 12}
                    textAnchor="middle" fill="rgba(255,255,255,0.25)"
                    fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="600"
                    letterSpacing="0.08em"
                  >{line}</text>
                ))}
              </g>
            ))}

            {/* Camera FOV cones */}
            {CAMERAS.map(cam => {
              const cx = px(cam.mapX), cy = py(cam.mapY);
              const rangeR = (cam.fovRange / 100) * W;
              const path = fovPath(cx, cy, cam.fovAngle, cam.fovDirection, rangeR);
              const isHovered = hoveredCam === cam.id;
              const color = cam.status === "offline" ? "#6b7280" : cam.status === "warning" ? "#f59e0b" : "#22c55e";
              return (
                <g key={cam.id}>
                  <path d={path} fill={`url(#fov-${cam.id})`}
                    stroke={color} strokeWidth={isHovered ? 1.5 : 0.8}
                    strokeOpacity={isHovered ? 0.7 : 0.35}
                    opacity={cam.status === "offline" ? 0.3 : 1}
                  />
                </g>
              );
            })}

            {/* Line from camera to violation */}
            {activeViolations.map(v => {
              const cam = CAMERAS.find(c => c.id === v.camera);
              if (!cam) return null;
              return (
                <line key={`line-${v.id}`}
                  x1={px(cam.mapX)} y1={py(cam.mapY)}
                  x2={px(v.position.mapX)} y2={py(v.position.mapY)}
                  stroke={v.acknowledged ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.6)"}
                  strokeWidth={v.acknowledged ? 0.8 : 1.2}
                  strokeDasharray="4 3"
                />
              );
            })}

            {/* Violation markers */}
            {activeViolations.map(v => {
              const vx = px(v.position.mapX), vy = py(v.position.mapY);
              const isSel = selected?.id === v.id;
              const isNew = !v.acknowledged;
              return (
                <g key={v.id} onClick={() => setSelected(isSel ? null : v)} style={{ cursor: "pointer" }}>
                  {isNew && (
                    <circle cx={vx} cy={vy} r={14} fill="rgba(239,68,68,0.15)">
                      <animate attributeName="r" values="10;16;10" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={vx} cy={vy} r={isSel ? 9 : 7}
                    fill={isNew ? "#ef4444" : "rgba(239,68,68,0.6)"}
                    stroke={isSel ? "#ffffff" : "rgba(239,68,68,0.8)"}
                    strokeWidth={isSel ? 2 : 1}
                  />
                  <text x={vx} y={vy + 1} textAnchor="middle" dominantBaseline="middle"
                    fill="white" fontSize="8" fontWeight="700">!</text>
                  {isSel && (
                    <g>
                      <rect x={vx + 12} y={vy - 20} width={120} height={38} rx="3"
                        fill="#131720" stroke="rgba(239,68,68,0.5)" strokeWidth="1" />
                      <text x={vx + 17} y={vy - 8} fill="#e8eaf0" fontSize="9" fontWeight="600">{v.id}</text>
                      <text x={vx + 17} y={vy + 4} fill="#ef4444" fontSize="8">{v.type.toUpperCase()}</text>
                      <text x={vx + 17} y={vy + 14} fill="#6b7280" fontSize="8">{v.position.distanceM}m · {v.position.angleRel > 0 ? "+" : ""}{v.position.angleRel}°</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Camera markers */}
            {CAMERAS.map(cam => {
              const cx = px(cam.mapX), cy = py(cam.mapY);
              const color = cam.status === "offline" ? "#6b7280" : cam.status === "warning" ? "#f59e0b" : "#22c55e";
              const isHov = hoveredCam === cam.id;
              return (
                <g key={cam.id}
                  onMouseEnter={() => setHoveredCam(cam.id)}
                  onMouseLeave={() => setHoveredCam(null)}
                  style={{ cursor: "default" }}>
                  <circle cx={cx} cy={cy} r={isHov ? 11 : 9}
                    fill="#131720" stroke={color} strokeWidth={isHov ? 2 : 1.5} />
                  {/* camera icon — simple rectangle */}
                  <rect x={cx - 5} y={cy - 3} width={8} height={6} rx="1" fill={color} />
                  <polygon points={`${cx + 3},${cy - 2} ${cx + 7},${cy - 4} ${cx + 7},${cy + 4} ${cx + 3},${cy + 2}`} fill={color} />
                  {cam.status === "offline" && (
                    <line x1={cx - 7} y1={cy - 7} x2={cx + 7} y2={cy + 7}
                      stroke="#6b7280" strokeWidth="1.5" />
                  )}
                  {isHov && (
                    <g>
                      <rect x={cx + 14} y={cy - 18} width={108} height={32} rx="3"
                        fill="#131720" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                      <text x={cx + 19} y={cy - 6} fill="#e8eaf0" fontSize="9" fontWeight="600">{cam.id}</text>
                      <text x={cx + 19} y={cy + 6} fill="#6b7280" fontSize="8">{cam.name}</text>
                    </g>
                  )}
                  <text x={cx} y={cy + 20} textAnchor="middle"
                    fill={color} fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="600" opacity="0.8">
                    {cam.id}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Sidebar panel */}
        <div className="flex flex-col gap-3">
          {/* Legend */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Méthode de localisation
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>Le modèle YOLOv8 retourne la <span className="text-foreground">boîte englobante</span> (bx, by, bw, bh) de chaque personne dans le repère image de la caméra.</p>
              <p>La <span className="text-foreground">distance</span> est estimée via la hauteur de boîte (perspective inverse), et <span className="text-foreground">l'angle</span> via la position horizontale par rapport à l'axe optique.</p>
              <p>La position 2D sur le plan est calculée par <span className="text-foreground">homographie</span> caméra → sol.</p>
            </div>
          </div>

          {/* Violation list */}
          <div className="bg-card border border-border rounded-lg overflow-hidden flex-1">
            <div className="px-4 py-3 border-b border-border">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {activeViolations.length} infraction{activeViolations.length !== 1 ? "s" : ""} localisée{activeViolations.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="overflow-y-auto max-h-80 [scrollbar-width:thin]">
              {activeViolations.map(v => {
                const isSel = selected?.id === v.id;
                return (
                  <button key={v.id} onClick={() => setSelected(isSel ? null : v)}
                    className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${isSel ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-muted/20"}`}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <ViolationBadgeLocal type={v.type} />
                      {!v.acknowledged && (
                        <span className="text-[9px] text-accent font-bold uppercase">NEW</span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-foreground mb-1">{v.camera} · {v.zone.split("–")[1]?.trim()}</div>

                    {/* Position info */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2">
                      <div className="flex items-center gap-1.5">
                        <NavigationIcon size={9} className="text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground">
                          <span className="text-foreground font-medium">{v.position.distanceM} m</span> de la caméra
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPinIcon size={9} className="text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground">
                          Angle <span className="text-foreground font-medium">{v.position.angleRel > 0 ? "+" : ""}{v.position.angleRel}°</span>
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          Frame : <span className="text-foreground font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            bx={v.position.bx.toFixed(2)} by={v.position.by.toFixed(2)}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      <ClockIcon size={9} />
                      {v.date} {v.time}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected detail */}
          {selected && (
            <div className="bg-card border border-accent/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground">{selected.id}</span>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <XIcon size={13} />
                </button>
              </div>
              <img src={selected.imageUrl} alt={selected.id}
                className="w-full h-28 object-cover rounded bg-muted mb-3" />

              {/* Camera-relative position details */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Position relative à {selected.camera}
                </div>
                {[
                  { label: "Distance estimée", value: `${selected.position.distanceM} m` },
                  { label: "Angle horizontal",  value: `${selected.position.angleRel > 0 ? "+" : ""}${selected.position.angleRel}° (${selected.position.angleRel < 0 ? "gauche" : "droite"})` },
                  { label: "Pos. frame horiz.", value: `${(selected.position.bx * 100).toFixed(0)}% (bx=${selected.position.bx.toFixed(2)})` },
                  { label: "Pos. frame vert.",  value: `${(selected.position.by * 100).toFixed(0)}% (by=${selected.position.by.toFixed(2)})` },
                  { label: "Coordonnées plan", value: `X=${selected.position.mapX}%, Y=${selected.position.mapY}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                    <span className="text-[10px] text-foreground font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => onNav("alertes")} className="mt-3 w-full text-xs py-1.5 bg-primary text-primary-foreground rounded font-semibold hover:opacity-90 transition-opacity">
                Voir l'alerte
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  PAGE COMPONENTS (Dashboard, Monitoring, Cameras, Alerts, Incidents, Reports, Settings)
// ============================================================

function DashboardPage() {
  const onlineCount = cameras.filter(c => c.status === "online").length;
  const totalWorkers = cameras.reduce((s, c) => s + c.workers, 0);
  const totalViolations = cameras.reduce((s, c) => s + c.violations, 0);
  const compliancePct = Math.round(((totalWorkers - totalViolations) / totalWorkers) * 100);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Workers"    value={totalWorkers}           sub="Across all terminals"  icon={User}          trend="+5"   color="blue" />
        <KPICard label="PPE Compliance"   value={`${compliancePct}%`}    sub="Today's average"       icon={Shield}        trend="+2%"  color="green" />
        <KPICard label="Active Alerts"    value={2}                      sub="Requires attention"    icon={AlertTriangle} trend="-3"   color="red" />
        <KPICard label="Cameras Online"   value={`${onlineCount}/${cameras.length}`} sub="2 offline" icon={Camera}                     color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <SectionTitle title="PPE Compliance Trend — Today" action={<span className="text-xs text-muted-foreground font-mono">Hourly</span>} />
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={complianceTrend}>
              <defs>
                <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gViol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time"        tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis                       tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#e2eaf4" }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area type="monotone" dataKey="compliance"  name="Compliance %"  stroke="#22c55e" strokeWidth={2} fill="url(#gComp)" />
              <Area type="monotone" dataKey="violations"  name="Violations"    stroke="#ef4444" strokeWidth={2} fill="url(#gViol)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <SectionTitle title="Violation Distribution" />
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={violationTypePie} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3} dataKey="value">
                {violationTypePie.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-3">
            {violationTypePie.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
                <span className="font-mono font-medium text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <SectionTitle title="Recent Alerts" action={<span className="text-xs text-primary cursor-pointer hover:underline">View all →</span>} />
          <div className="space-y-1.5">
            {initialAlerts.slice(0, 5).map(alert => (
              <div key={alert.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-white/[0.025] hover:bg-white/[0.05] transition-colors">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-500/10">
                  <AlertTriangle size={13} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{alert.worker}</span>
                    <ViolationBadge type={alert.type} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                    {alert.camera} · {alert.terminal} · {alert.zone} · {alert.time}
                  </div>
                </div>
                <StatusBadge status={alert.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <SectionTitle title="System Health" />
          <div className="space-y-3.5">
            {[
              { label: "GPU Utilization", value: 73, color: "#f97316" },
              { label: "CPU Usage",       value: 42, color: "#3b82f6" },
              { label: "RAM Usage",       value: 68, color: "#a855f7" },
              { label: "Storage",         value: 31, color: "#22c55e" },
            ].map(m => (
              <div key={m.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-mono font-semibold text-foreground">{m.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${m.value}%`, background: m.color }} />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-border space-y-2">
              {[
                { label: "Inference Speed", value: "14 ms avg", icon: Zap },
                { label: "Active Cameras",  value: `${onlineCount} / ${cameras.length}`, icon: Camera },
                { label: "AI Model",        value: "YOLOv8s",   icon: Cpu },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground"><s.icon size={11} />{s.label}</div>
                  <span className="font-mono text-foreground">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <SectionTitle title="Violations by Terminal" action={<span className="text-xs text-muted-foreground font-mono">Today</span>} />
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={violationsByTerminal} barSize={18} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="terminal" tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis                    tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="helmet" name="No Helmet"    fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="vest"   name="No Vest"      fill="#f97316" radius={[3, 3, 0, 0]} />
            <Bar dataKey="both"   name="Both Missing" fill="#a855f7" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


// ─── Live Monitoring Page ─────────────────────────────────────────────────────
//
// This page now plays the recorded CCTV clip for the selected camera in a
// real <video> element (instead of a simulated feed), and overlays live
// detection boxes polled from the Flask backend. If the backend isn't
// reachable yet, it automatically falls back to a static demo overlay so the
// page still renders something meaningful while you're building the API.
//
// Swapping to a real IP camera later only means the Flask endpoint switches
// from `cv2.VideoCapture("clip.mp4")` to `cv2.VideoCapture(rtsp_url)` — this
// component doesn't change.


function LiveMonitoringPage() {
  const [selectedId, setSelectedId] = useState(cameras.find(c => c.videoSrc)?.id ?? cameras[0].id);

  // Custom uploads: the video plays from a local blob URL, but detections
  // for it come from a real backend camera_id returned by POST /api/upload
  // once the file has been saved server-side and a worker thread starts
  // running your model on it.
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [customVideoName, setCustomVideoName] = useState<string | null>(null);
  const [uploadCameraId, setUploadCameraId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dt = useDateTime();
  const time = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const cam = cameras.find(c => c.id === selectedId) ?? cameras[0];
  const activeVideoSrc = customVideoUrl ?? cam.videoSrc;

  // Which camera_id we poll the Flask backend for: the built-in camera, or
  // the id it handed back after accepting an uploaded clip.
  const pollCameraId = customVideoUrl ? uploadCameraId : selectedId;
  const { data: detections, connected, checking } = useDetections(pollCameraId ?? "", !!pollCameraId);

  // No fallback/demo data — boxes only ever come from your model via Flask.
  const boxes = detections?.boxes ?? [];
  const workerCount = detections?.workers ?? 0;
  const compliantCount = detections?.compliant ?? 0;
  const violationCount = Math.max(0, workerCount - compliantCount);
  const noHelmetCount = boxes.filter(b => b.missing?.includes("Helmet")).length;
  const noVestCount = boxes.filter(b => b.missing?.includes("Vest")).length;
  const helmetOk = boxes.length - noHelmetCount;
  const vestOk = boxes.length - noVestCount;

  // Reset playback state whenever the selected camera/video changes.
  useEffect(() => {
    setIsPlaying(true);
  }, [selectedId, customVideoUrl]);

  useEffect(() => {
    return () => {
      if (customVideoUrl) URL.revokeObjectURL(customVideoUrl);
    };
  }, [customVideoUrl]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (customVideoUrl) URL.revokeObjectURL(customVideoUrl);
    setCustomVideoUrl(URL.createObjectURL(file));
    setCustomVideoName(file.name);
    setUploadCameraId(null);
    setUploadState("uploading");
    setUploadError(null);

    // Send the actual file to Flask so your model can run on the real
    // frames, not just preview them client-side.
    try {
      const form = new FormData();
      form.append("video", file);
      const res = await fetch(`${API_BASE_URL}/api/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { camera_id: string };
      setUploadCameraId(json.camera_id);
      setUploadState("idle");
    } catch (err) {
      setUploadState("error");
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const clearUpload = () => {
    if (customVideoUrl) URL.revokeObjectURL(customVideoUrl);
    setCustomVideoUrl(null);
    setCustomVideoName(null);
    setUploadCameraId(null);
    setUploadState("idle");
    setUploadError(null);
  };

  const kindColor: Record<string, string> = {
    ok: "#22c55e", violation: "#ef4444", "no-vest": "#f97316",
  };

  const modelIsRunning = connected && !!detections;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        {/* Feed */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-red-500 animate-pulse" : "bg-muted-foreground"}`} />
                <span className={`text-xs font-bold tracking-widest ${isPlaying ? "text-red-400" : "text-muted-foreground"}`}>
                  {isPlaying ? "LIVE" : "PAUSED"}
                </span>
              </div>
              <select
                value={customVideoUrl ? "__custom__" : selectedId}
                onChange={e => {
                  if (e.target.value === "__custom__") return;
                  clearUpload();
                  setSelectedId(e.target.value);
                }}
                className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
              >
                {cameras.map(c => (
                  <option key={c.id} value={c.id} disabled={!c.videoSrc}>
                    {c.id} — {c.name}{!c.videoSrc ? " (no clip)" : ""}
                  </option>
                ))}
                {customVideoUrl && <option value="__custom__">Uploaded clip — {customVideoName}</option>}
              </select>

              <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-white/5 transition-colors"
              >
                <Upload size={12} />Run model on my clip
              </button>
              {customVideoUrl && (
                <button onClick={clearUpload} className="text-xs text-muted-foreground hover:text-foreground underline">
                  clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span
                className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full ${modelIsRunning ? "bg-green-500/10 text-green-400" : "bg-orange-500/10 text-orange-400"}`}
                title={modelIsRunning ? `Receiving live detections from ${API_BASE_URL}` : `No response from ${API_BASE_URL}`}
              >
                {modelIsRunning ? <PlugZap size={11} /> : <Plug size={11} />}
                {checking && !connected ? "Connecting…" : modelIsRunning ? "Model running" : "Backend offline"}
              </span>
              <span>{time}</span>
              <button onClick={togglePlay} className="p-1.5 rounded hover:bg-white/10 transition-colors">
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button className="p-1.5 rounded hover:bg-white/10 transition-colors"><Maximize size={13} /></button>
            </div>
          </div>

          {/* Real CCTV clip with live detection overlay from your model */}
          <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
            {activeVideoSrc ? (
              <video
                key={activeVideoSrc}
                ref={videoRef}
                src={activeVideoSrc}
                className="absolute inset-0 w-full h-full object-contain"
                autoPlay
                loop
                muted
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => setIsPlaying(false)}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <WifiOff size={20} className="text-white/30" />
                <span className="text-xs text-white/40 font-mono">No clip assigned to this camera yet</span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: "#f97316" }}
                >
                  <Upload size={12} />Upload a clip
                </button>
              </div>
            )}

            {/* Subtle vignette so overlays stay legible over real footage */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 65%, rgba(0,0,0,0.35) 100%)" }} />

            {/* Detection boxes — real model output only, nothing synthetic */}
            {activeVideoSrc && modelIsRunning && boxes.map((d, i) => {
              const col = kindColor[d.kind];
              return (
                <div key={i} className="absolute" style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%`, border: `2px solid ${col}`, boxShadow: `0 0 12px ${col}50` }}>
                  {/* Label AU-DESSUS de la boîte, largeur libre (whitespace-nowrap) : ne wrap
                      plus jamais sur plusieurs lignes même quand la boîte personne est étroite
                      et le texte de statut long ("NON-CONFORM - Helmet & Vest Missing"). */}
                  <div
                    className="absolute text-white px-1.5 py-0.5 leading-tight whitespace-nowrap"
                    style={{
                      bottom: "100%", left: 0, marginBottom: 2,
                      background: col, fontSize: 10, fontFamily: "monospace", fontWeight: "bold",
                      color: d.kind === "ok" ? "#000" : "#fff", zIndex: 10,
                    }}
                  >
                    {d.label} {d.conf}%
                  </div>
                  <div className="absolute -top-px -left-px w-3 h-3" style={{ borderTop: `2px solid ${col}`, borderLeft: `2px solid ${col}` }} />
                  <div className="absolute -top-px -right-px w-3 h-3" style={{ borderTop: `2px solid ${col}`, borderRight: `2px solid ${col}` }} />
                  <div className="absolute -bottom-px -left-px w-3 h-3" style={{ borderBottom: `2px solid ${col}`, borderLeft: `2px solid ${col}` }} />
                  <div className="absolute -bottom-px -right-px w-3 h-3" style={{ borderBottom: `2px solid ${col}`, borderRight: `2px solid ${col}` }} />
                </div>
              );
            })}

            {/* Overlays */}
            {activeVideoSrc && (
              <>
                <div className="absolute top-3 left-3 space-y-1">
                  <div className="text-xs font-mono text-white/80 bg-black/60 px-2 py-0.5 rounded">
                    {customVideoUrl ? customVideoName : cam.id}
                  </div>
                  {!customVideoUrl && (
                    <div className="text-xs font-mono text-white/55 bg-black/60 px-2 py-0.5 rounded">{cam.terminal} · {cam.zone}</div>
                  )}
                </div>
                <div className="absolute top-3 right-3 font-mono text-white/60 bg-black/60 px-2 py-0.5 rounded" style={{ fontSize: 10 }}>
                  {modelIsRunning ? "YOLOv8 · live" : "no detections"}
                </div>
                <div className="absolute bottom-3 right-3 font-mono text-white/40 bg-black/60 px-2 py-0.5 rounded" style={{ fontSize: 10 }}>
                  {time}
                </div>
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 px-2 py-0.5 rounded">
                  <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? "bg-red-500 animate-pulse" : "bg-white/30"}`} />
                  <span className={`text-xs font-mono font-bold ${isPlaying ? "text-red-400" : "text-white/40"}`}>
                    {isPlaying ? "REC" : "PAUSED"}
                  </span>
                </div>
              </>
            )}
          </div>

          {uploadState === "uploading" && (
            <div className="mt-3 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2">
              <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin flex-shrink-0" />
              <span>Uploading clip to {API_BASE_URL} and starting the model on it…</span>
            </div>
          )}
          {uploadState === "error" && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span>Couldn't upload to the backend ({uploadError}). Video preview still works, but detections need /api/upload to succeed.</span>
            </div>
          )}
          {activeVideoSrc && uploadState !== "uploading" && !modelIsRunning && (
            <div className="mt-3 flex items-start gap-2 text-xs text-orange-400 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                {pollCameraId
                  ? <>Couldn't reach <span className="font-mono">{API_BASE_URL}/api/detections/{pollCameraId}</span> — no boxes are drawn until your Flask model responds.</>
                  : "Waiting for the backend to accept the upload before detections can start."}
              </span>
            </div>
          )}
        </div>

        {/* Detection stats — all derived from real model output */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Person",    value: workerCount,      color: "#3b82f6" },
            { label: "Helmet ✓",  value: helmetOk,          color: "#22c55e" },
            { label: "Vest ✓",    value: vestOk,            color: "#22c55e" },
            { label: "No Helmet", value: noHelmetCount,     color: "#ef4444" },
            { label: "No Vest",   value: noVestCount,       color: "#f97316" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-3 text-center">
              <div className="text-2xl font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold text-foreground mb-3">Camera Info</div>
          <div className="space-y-2 text-xs">
            {[
              { k: "Camera ID",   v: customVideoUrl ? (uploadCameraId ?? "—") : cam.id },
              { k: "Name",        v: customVideoUrl ? customVideoName ?? "" : cam.name },
              { k: "Terminal",    v: customVideoUrl ? "—" : cam.terminal },
              { k: "Zone",        v: customVideoUrl ? "—" : cam.zone },
              { k: "Source",      v: customVideoUrl ? "Uploaded clip (server-side inference)" : cam.videoSrc || "Not assigned" },
              { k: "IP Address",  v: customVideoUrl ? "—" : cam.ip },
            ].map(i => (
              <div key={i.k} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{i.k}</span>
                <span className="font-mono text-foreground text-right truncate max-w-[60%]">{i.v}</span>
              </div>
            ))}
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={customVideoUrl ? (modelIsRunning ? "online" : "offline") : cam.status} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold text-foreground mb-3">Backend Connection</div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">API base URL</span>
              <span className="font-mono text-foreground">{API_BASE_URL}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Poll interval</span>
              <span className="font-mono text-foreground">{DETECTION_POLL_MS} ms</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">Status</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium ${modelIsRunning ? "bg-green-500/10 text-green-400" : "bg-orange-500/10 text-orange-400"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${modelIsRunning ? "bg-green-400" : "bg-orange-400"}`} />
                {modelIsRunning ? "Connected" : "Not connected"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-foreground">Current Violations</div>
            {(noHelmetCount + noVestCount) > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">{noHelmetCount + noVestCount}</span>
            )}
          </div>
          {!modelIsRunning ? (
            <div className="text-center py-5">
              <Plug size={22} className="text-muted-foreground mx-auto mb-2" />
              <div className="text-xs text-muted-foreground">No model connected — nothing to report yet</div>
            </div>
          ) : (noHelmetCount + noVestCount) > 0 ? (
            <div className="space-y-2">
              {boxes.filter(d => d.kind !== "ok").map((d, i) => (
                <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                  <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-red-400">{d.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">Confidence: {d.conf}%</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-5">
              <CheckCircle size={24} className="text-green-400 mx-auto mb-2" />
              <div className="text-xs text-green-400 font-medium">All Workers Compliant</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CamerasPage() {
  const [search, setSearch]           = useState("");
  const [termFilter, setTermFilter]   = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = cameras.filter(c => {
    const q = search.toLowerCase();
    return (
      (c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.zone.toLowerCase().includes(q)) &&
      (termFilter === "All" || c.terminal === termFilter) &&
      (statusFilter === "All" || c.status === statusFilter)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cameras..." className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
        </div>
        <select value={termFilter} onChange={e => setTermFilter(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none">
          <option>All</option><option>Terminal 1</option><option>Terminal 2</option><option>Terminal 3</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none">
          <option>All</option><option>online</option><option>offline</option>
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length}/{cameras.length} cameras</span>
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white ml-auto" style={{ background: "#f97316" }}>
          <Plus size={13} />Add Camera
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(cam => (
          <div key={cam.id} className={`rounded-xl border bg-card overflow-hidden transition-all hover:border-primary/40 cursor-pointer ${cam.status === "offline" ? "border-red-500/20 opacity-60" : "border-border"}`}>
            <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
              {cam.status === "offline" || !cam.videoSrc ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <WifiOff size={18} className="text-red-400/60" />
                  <span className="text-xs text-red-400/60 font-mono">NO SIGNAL</span>
                </div>
              ) : (
                <>
                  <video src={cam.videoSrc} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />
                  {cam.violations > 0 && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-500 text-white px-1.5 py-0.5 rounded text-xs font-bold">
                      <AlertTriangle size={9} />{cam.violations}
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-mono font-bold text-red-400">LIVE</span>
                  </div>
                  <div className="absolute bottom-2 right-2 font-mono text-white/40 bg-black/70 px-1.5 py-0.5 rounded" style={{ fontSize: 10 }}>{cam.fps} fps</div>
                </>
              )}
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold font-mono text-muted-foreground">{cam.id}</span>
                <StatusBadge status={cam.status} />
              </div>
              <div className="text-sm font-semibold text-foreground truncate">{cam.name}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <MapPin size={10} />{cam.terminal} · {cam.zone}
              </div>
              {cam.status === "online" && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-xs">
                  <span className="text-muted-foreground">{cam.workers} workers</span>
                  <span style={{ color: cam.violations > 0 ? "#ef4444" : "#22c55e" }}>
                    {cam.violations > 0 ? `${cam.violations} violation${cam.violations > 1 ? "s" : ""}` : "All compliant"}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsPage() {
  const [alerts, setAlerts]           = useState(initialAlerts);
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter]   = useState("All");

  const filtered = alerts.filter(a =>
    (statusFilter === "All" || a.status === statusFilter) &&
    (typeFilter === "All" || a.type === typeFilter)
  );

  const resolve = (id: string) => setAlerts(p => p.map(a => a.id === id ? { ...a, status: "Resolved" } : a));
  const ack     = (id: string) => setAlerts(p => p.map(a => a.id === id && a.status === "New" ? { ...a, status: "Acknowledged" } : a));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "New",          count: alerts.filter(a => a.status === "New").length,          color: "#f97316" },
          { label: "Acknowledged", count: alerts.filter(a => a.status === "Acknowledged").length, color: "#3b82f6" },
          { label: "Resolved",     count: alerts.filter(a => a.status === "Resolved").length,     color: "#22c55e" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="text-3xl font-bold font-mono" style={{ color: s.color }}>{s.count}</div>
            <div className="text-sm text-muted-foreground">{s.label} Alerts</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none">
          <option>All</option><option>New</option><option>Acknowledged</option><option>Resolved</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none">
          <option>All</option><option>No Helmet</option><option>No Vest</option><option>No Helmet & No Vest</option>
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} alerts</span>
        <button className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-white/5 transition-colors">
          <Download size={13} />Export
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-border bg-white/[0.02]">
              {["Alert ID", "Worker", "Violation", "Confidence", "Camera", "Location", "Time", "Status", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(alert => (
              <tr key={alert.id} className={`border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors ${alert.status === "New" ? "bg-orange-500/[0.025]" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {alert.status === "New" && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />}
                    <span className="font-mono text-xs text-muted-foreground">{alert.id}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <User size={11} className="text-muted-foreground" />
                    </div>
                    <span className="font-medium text-foreground whitespace-nowrap">{alert.worker}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><ViolationBadge type={alert.type} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-14 h-1.5 rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-orange-400" style={{ width: `${alert.confidence}%` }} />
                    </div>
                    <span className="text-xs font-mono text-foreground">{alert.confidence}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{alert.camera}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{alert.terminal} · {alert.zone}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{alert.time}</td>
                <td className="px-4 py-3"><StatusBadge status={alert.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 rounded hover:bg-white/10 text-blue-400 hover:text-blue-300 transition-colors" title="View"><Eye size={13} /></button>
                    {alert.status === "New" && <button onClick={() => ack(alert.id)} className="p-1.5 rounded hover:bg-white/10 text-orange-400 hover:text-orange-300 transition-colors" title="Acknowledge"><Check size={13} /></button>}
                    {alert.status !== "Resolved" && <button onClick={() => resolve(alert.id)} className="p-1.5 rounded hover:bg-white/10 text-green-400 hover:text-green-300 transition-colors" title="Resolve"><CheckCircle size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IncidentHistoryPage() {
  const [search, setSearch]         = useState("");
  const [termFilter, setTermFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");

  const filtered = incidents.filter(inc => {
    const q = search.toLowerCase();
    return (
      (inc.id.toLowerCase().includes(q) || inc.worker.toLowerCase().includes(q)) &&
      (termFilter === "All" || inc.terminal === termFilter) &&
      (typeFilter === "All" || inc.type === typeFilter) &&
      (dateFilter === "All" || (dateFilter === "Today" && inc.date === "2026-07-14") || (dateFilter === "Yesterday" && inc.date === "2026-07-13"))
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search incidents..." className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
        </div>
        <select value={termFilter} onChange={e => setTermFilter(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none">
          <option>All</option><option>Terminal 1</option><option>Terminal 2</option><option>Terminal 3</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none">
          <option>All</option><option>No Helmet</option><option>No Vest</option><option>No Helmet & No Vest</option>
        </select>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none">
          <option>All</option><option>Today</option><option>Yesterday</option>
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} incidents</span>
        <button className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-white/5 transition-colors">
          <Download size={13} />Export
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-white/[0.02]">
              {["Incident ID", "Worker", "Violation", "Confidence", "Camera", "Terminal", "Zone", "Date", "Time", "Duration", "Status"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(inc => (
              <tr key={inc.id} className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inc.id}</td>
                <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{inc.worker}</td>
                <td className="px-4 py-3"><ViolationBadge type={inc.type} /></td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{inc.confidence}%</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inc.camera}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{inc.terminal}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{inc.zone}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inc.date}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inc.time}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{inc.duration}</td>
                <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsPage() {
  const [reportType, setReportType] = useState<"Daily" | "Weekly" | "Monthly">("Weekly");
  const chartData = reportType === "Daily" ? complianceTrend : reportType === "Weekly" ? weeklyCompliance : monthlyCompliance;
  const xKey = reportType === "Daily" ? "time" : reportType === "Weekly" ? "day" : "week";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["Daily", "Weekly", "Monthly"] as const).map(t => (
            <button key={t} onClick={() => setReportType(t)} className="px-4 py-2 text-sm font-medium transition-all" style={reportType === t ? { background: "#f97316", color: "#fff" } : { color: "var(--muted-foreground)" }}>
              {t}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-white/5 transition-colors"><Download size={13} />PDF</button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-white/5 transition-colors"><Download size={13} />Excel</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Avg Compliance" value="86.4%"  sub={`This ${reportType.toLowerCase()}`} icon={Shield}        trend="+1.2%" color="green" />
        <KPICard label="Total Violations" value={reportType === "Daily" ? "37" : reportType === "Weekly" ? "147" : "588"} sub="PPE violations" icon={AlertTriangle} trend="-8" color="red" />
        <KPICard label="Workers Monitored" value={reportType === "Daily" ? "98" : reportType === "Weekly" ? "341" : "1,240"} sub="Unique events" icon={User} color="blue" />
        <KPICard label="Detection Accuracy" value="94.8%" sub="Model conf. avg." icon={Cpu} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-border bg-card p-5">
          <SectionTitle title={`${reportType} Compliance Trend`} />
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey={xKey} tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[70, 100]} tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="compliance" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: "#22c55e", r: 3 }} name="Compliance %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <SectionTitle title="Violations by Terminal" />
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={violationsByTerminal} barSize={16} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="terminal" tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="helmet" name="No Helmet"    fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Bar dataKey="vest"   name="No Vest"      fill="#f97316" radius={[3, 3, 0, 0]} />
              <Bar dataKey="both"   name="Both Missing" fill="#a855f7" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <SectionTitle title={`${reportType} Violations`} />
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="violations" fill="#ef4444" radius={[3, 3, 0, 0]} name="Violations" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <SectionTitle title="Violation Type Breakdown" />
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="45%" height={180}>
              <PieChart>
                <Pie data={violationTypePie.slice(0, 3)} cx="50%" cy="50%" innerRadius={42} outerRadius={72} paddingAngle={4} dataKey="value">
                  {violationTypePie.slice(0, 3).map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              {violationTypePie.slice(0, 3).map(item => (
                <div key={item.name}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                      <span className="text-muted-foreground">{item.name}</span>
                    </span>
                    <span className="font-mono text-foreground">{item.value}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/5">
                    <div className="h-full rounded-full" style={{ width: `${(item.value / 78) * 100}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const alertRulesList = [
  { key: "noHelmet",     label: "Alert on No Helmet" },
  { key: "noVest",       label: "Alert on No Vest" },
  { key: "bothMissing",  label: "Alert on Both Missing" },
  { key: "autoResolve",  label: "Auto-resolve after 30 min" },
  { key: "snapshots",    label: "Send alert snapshots" },
  { key: "grouping",     label: "Multi-person violation grouping" },
];

type AlertRules = { noHelmet: boolean; noVest: boolean; bothMissing: boolean; autoResolve: boolean; snapshots: boolean; grouping: boolean };
type Appearance = { pulse: boolean; autoRefresh: boolean; thumbnails: boolean };

function SettingsPage({ darkMode, setDarkMode }: { darkMode: boolean; setDarkMode: (v: boolean) => void }) {
  const [tab, setTab]               = useState("ai");
  const [threshold, setThreshold]   = useState(85);
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif]     = useState(false);
  const [inApp, setInApp]           = useState(true);
  const [rules, setRules]           = useState<AlertRules>({ noHelmet: true, noVest: true, bothMissing: true, autoResolve: false, snapshots: true, grouping: false });
  const [appear, setAppear]         = useState<Appearance>({ pulse: true, autoRefresh: true, thumbnails: true });

  const toggleRule   = (k: string) => setRules(p => ({ ...p, [k]: !p[k as keyof AlertRules] }));
  const toggleAppear = (k: string) => setAppear(p => ({ ...p, [k]: !p[k as keyof Appearance] }));

  const tabs = [
    { id: "ai",           label: "AI Configuration" },
    { id: "cameras",      label: "Cameras" },
    { id: "notifications",label: "Notifications" },
    { id: "profile",      label: "User Profile" },
    { id: "appearance",   label: "Appearance" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap" style={tab === t.id ? { borderColor: "#f97316", color: "#f97316" } : { borderColor: "transparent", color: "var(--muted-foreground)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ai" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-5">
            <div className="text-sm font-semibold text-foreground">YOLOv8s Model Configuration</div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-muted-foreground">Detection Confidence Threshold</label>
                <span className="font-mono font-bold text-primary">{threshold}%</span>
              </div>
              <input type="range" min={50} max={99} value={threshold} onChange={e => setThreshold(+e.target.value)} className="w-full accent-orange-500 cursor-pointer" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                <span>50% Sensitive</span><span>99% Strict</span>
              </div>
            </div>
            <div className="space-y-1 pt-1">
              {[
                { k: "Model",             v: "YOLOv8s" },
                { k: "Input Resolution",  v: "640 × 640 px" },
                { k: "Device",            v: "NVIDIA RTX 3080" },
                { k: "Avg. Inference",    v: "14 ms" },
                { k: "Batch Size",        v: "1" },
                { k: "Detected Classes",  v: "Person, Helmet, Vest" },
              ].map(item => (
                <div key={item.k} className="flex justify-between text-sm py-2 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{item.k}</span>
                  <span className="font-mono text-foreground">{item.v}</span>
                </div>
              ))}
            </div>
            <button className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90" style={{ background: "#f97316" }}>
              Save Configuration
            </button>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-1">
            <div className="text-sm font-semibold text-foreground mb-3">Alert Rules</div>
            {alertRulesList.map(rule => (
              <div key={rule.key} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                <span className="text-sm text-foreground">{rule.label}</span>
                <Toggle on={rules[rule.key as keyof AlertRules]} onToggle={() => toggleRule(rule.key)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "cameras" && (
        <div className="rounded-xl border border-border bg-card overflow-auto">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="text-sm font-semibold text-foreground">Registered Cameras ({cameras.length})</div>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: "#f97316" }}>
              <Plus size={13} />Add Camera
            </button>
          </div>
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-white/[0.02]">
                {["ID", "Name", "Terminal", "Zone", "IP Address", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cameras.map(cam => (
                <tr key={cam.id} className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{cam.id}</td>
                  <td className="px-4 py-2.5 text-foreground">{cam.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{cam.terminal}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{cam.zone}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{cam.ip}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={cam.status} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button className="p-1.5 rounded hover:bg-white/10 text-blue-400 transition-colors"><Edit size={12} /></button>
                      <button className="p-1.5 rounded hover:bg-white/10 text-red-400 transition-colors"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "notifications" && (
        <div className="max-w-xl space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-1">
            <div className="text-sm font-semibold text-foreground mb-3">Notification Channels</div>
            {[
              { label: "Email Notifications",   sub: "k.amrani@marsamaroc.co.ma", on: emailNotif, setOn: setEmailNotif },
              { label: "SMS Notifications",     sub: "+212 6XX XXX XXX",          on: smsNotif,   setOn: setSmsNotif },
              { label: "In-App Notifications",  sub: "Browser alerts when logged in", on: inApp,  setOn: setInApp },
            ].map(n => (
              <div key={n.label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div>
                  <div className="text-sm font-medium text-foreground">{n.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{n.sub}</div>
                </div>
                <Toggle on={n.on} onToggle={() => n.setOn(!n.on)} />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-sm font-semibold text-foreground mb-3">Alert Severity Thresholds</div>
            {[
              { label: "Critical — Immediate alert", value: "≥ 90% confidence" },
              { label: "High — Alert within 1 min",  value: "75–89% confidence" },
              { label: "Medium — Alert within 5 min", value: "60–74% confidence" },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-mono text-foreground text-xs">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "profile" && (
        <div className="max-w-lg">
          <div className="rounded-xl border border-border bg-card p-5 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold text-white flex-shrink-0" style={{ background: "#f97316" }}>KA</div>
              <div>
                <div className="text-base font-semibold text-foreground">Khalid Amrani</div>
                <div className="text-sm text-muted-foreground">Safety Officer · HSE Department</div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">k.amrani@marsamaroc.co.ma</div>
              </div>
            </div>
            <div className="space-y-3 pt-1 border-t border-border">
              {[
                { label: "Full Name",    value: "Khalid Amrani" },
                { label: "Role",         value: "Safety Officer" },
                { label: "Department",   value: "HSE — Health, Safety & Environment" },
                { label: "Access Level", value: "All Terminals" },
                { label: "Employee ID",  value: "EMP-MM-2847" },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <input defaultValue={f.value} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 mt-1" />
                </div>
              ))}
            </div>
            <button className="w-full py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#f97316" }}>
              Update Profile
            </button>
          </div>
        </div>
      )}

      {tab === "appearance" && (
        <div className="max-w-lg">
          <div className="rounded-xl border border-border bg-card p-5 space-y-1">
            <div className="text-sm font-semibold text-foreground mb-3">Display Settings</div>
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <div className="text-sm font-medium text-foreground">Dark Mode</div>
                <div className="text-xs text-muted-foreground mt-0.5">Industrial dark theme (recommended)</div>
              </div>
              <Toggle on={darkMode} onToggle={() => setDarkMode(!darkMode)} />
            </div>
            {[
              { key: "pulse",       label: "Violation Pulse Animations", sub: "Animate alert indicators in real-time" },
              { key: "autoRefresh", label: "Auto-refresh Live Feed",     sub: "Refresh detection data every 5 seconds" },
              { key: "thumbnails",  label: "Camera Live Thumbnails",     sub: "Display live previews in camera grid" },
            ].map(s => (
              <div key={s.key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div>
                  <div className="text-sm font-medium text-foreground">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
                <Toggle on={appear[s.key as keyof Appearance]} onToggle={() => toggleAppear(s.key)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>(() => {
    const saved = localStorage.getItem("marsa_page");
    return (saved as Page) || "dashboard";
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("marsa_theme");
    return saved !== null ? saved === "dark" : false; // Default to Light Mode (false)
  });
  const [collapsed, setCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; role: string; terminal: string } | null>(() => {
    const saved = localStorage.getItem("marsa_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      name: "Khalid Amrani",
      email: "k.amrani@marsamaroc.co.ma",
      role: "Administrateur HSE",
      terminal: "Tous les Terminals",
    };
  });

  useEffect(() => {
    localStorage.setItem("marsa_page", page);
  }, [page]);

  useEffect(() => {
    localStorage.setItem("marsa_theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("marsa_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("marsa_user");
    }
  }, [currentUser]);

  // Convert VIOLATIONS to a format compatible with the localisation view
  const localisationViolations = VIOLATIONS.map(v => ({
    ...v,
  }));

  const isAdmin = !!(currentUser?.role && (currentUser.role.toLowerCase().includes("admin") || currentUser.role.toLowerCase().includes("administrateur")));

  if (page === "login") {
    return (
      <div className={darkMode ? "dark" : ""}>
        <AuthPage
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setPage("dashboard");
          }}
        />
      </div>
    );
  }

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen overflow-hidden bg-background font-sans">
        <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} currentUser={currentUser} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar
            page={page}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            currentUser={currentUser}
            onLogout={() => {
              setCurrentUser(null);
              localStorage.removeItem("marsa_user");
              localStorage.setItem("marsa_page", "login");
              setPage("login");
            }}
            setPage={setPage}
          />
          <main className="flex-1 overflow-auto p-5">
            {page === "dashboard"  && <DashboardPage />}
            {page === "monitoring" && <LiveMonitoringPage />}
            {page === "cameras"    && <CamerasPage />}
            {page === "localisation" && <LocalisationView violations={localisationViolations} onNav={(v) => setPage(v === "alertes" ? "alerts" : "dashboard")} />}
            {page === "alerts"     && <AlertsPage />}
            {page === "incidents"  && <IncidentHistoryPage />}
            {page === "reports"    && <ReportsPage />}
            {page === "users"      && (
              isAdmin ? <UsersPage /> : (
                <div className="flex flex-col items-center justify-center h-[70vh] text-center p-8 bg-card rounded-2xl border border-border/80 shadow-xl max-w-lg mx-auto my-auto">
                  <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-4">
                    <Shield size={32} />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">Accès Réservé aux Administrateurs HSE</h2>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    Le module de <strong className="text-foreground">Gestion des Utilisateurs</strong> est strictement restreint aux Administrateurs HSE de Marsa Maroc.
                  </p>
                  <button
                    onClick={() => setPage("dashboard")}
                    className="mt-6 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-md"
                  >
                    Retour au Tableau de Bord
                  </button>
                </div>
              )
            )}
            {page === "audit-logs" && <AuditLogsView apiBaseUrl={API_BASE_URL} currentUser={currentUser} />}
            {page === "settings"   && <SettingsPage darkMode={darkMode} setDarkMode={setDarkMode} />}
          </main>
        </div>
      </div>
    </div>
  );
}