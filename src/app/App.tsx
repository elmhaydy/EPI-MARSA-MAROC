import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, Monitor, Camera, Bell, History, FileText, Settings,
  Shield, AlertTriangle, CheckCircle, WifiOff, Search, Download, Eye,
  Check, User, Cpu, MapPin, TrendingUp, TrendingDown, Sun, Moon,
  Maximize, ChevronLeft, ChevronRight, Plus, Edit, Trash2, Radio, Zap,
  Activity,
} from "lucide-react";

// ─── Static Data ─────────────────────────────────────────────────────────────

const cameras = [
  { id: "CAM-001", name: "TC1-Quay-North",    terminal: "Terminal 1", zone: "Quay Zone",       status: "online",  fps: 24, workers: 3,  violations: 1, ip: "192.168.1.101", uptime: "18h 42m" },
  { id: "CAM-002", name: "TC1-Quay-South",    terminal: "Terminal 1", zone: "Quay Zone",       status: "online",  fps: 24, workers: 5,  violations: 0, ip: "192.168.1.102", uptime: "18h 42m" },
  { id: "CAM-003", name: "TC1-Storage-A",     terminal: "Terminal 1", zone: "Storage Zone",    status: "online",  fps: 20, workers: 2,  violations: 0, ip: "192.168.1.103", uptime: "17h 15m" },
  { id: "CAM-004", name: "TC1-Storage-B",     terminal: "Terminal 1", zone: "Storage Zone",    status: "offline", fps: 0,  workers: 0,  violations: 0, ip: "192.168.1.104", uptime: "—" },
  { id: "CAM-005", name: "TC1-Gate-Entry",    terminal: "Terminal 1", zone: "Gate Area",       status: "online",  fps: 25, workers: 8,  violations: 2, ip: "192.168.1.105", uptime: "18h 42m" },
  { id: "CAM-006", name: "TC2-Quay-East",     terminal: "Terminal 2", zone: "Quay Zone",       status: "online",  fps: 24, workers: 4,  violations: 1, ip: "192.168.1.201", uptime: "18h 40m" },
  { id: "CAM-007", name: "TC2-Quay-West",     terminal: "Terminal 2", zone: "Quay Zone",       status: "online",  fps: 22, workers: 6,  violations: 0, ip: "192.168.1.202", uptime: "18h 38m" },
  { id: "CAM-008", name: "TC2-Container-Yrd", terminal: "Terminal 2", zone: "Container Yard",  status: "online",  fps: 24, workers: 7,  violations: 3, ip: "192.168.1.203", uptime: "18h 42m" },
  { id: "CAM-009", name: "TC2-Workshop",      terminal: "Terminal 2", zone: "Workshop",        status: "online",  fps: 20, workers: 3,  violations: 0, ip: "192.168.1.204", uptime: "16h 55m" },
  { id: "CAM-010", name: "TC2-Storage-Main",  terminal: "Terminal 2", zone: "Storage Zone",    status: "offline", fps: 0,  workers: 0,  violations: 0, ip: "192.168.1.205", uptime: "—" },
  { id: "CAM-011", name: "TC3-Gate-Main",     terminal: "Terminal 3", zone: "Gate Area",       status: "online",  fps: 25, workers: 12, violations: 1, ip: "192.168.1.301", uptime: "18h 42m" },
  { id: "CAM-012", name: "TC3-Quay-A",        terminal: "Terminal 3", zone: "Quay Zone",       status: "online",  fps: 24, workers: 9,  violations: 2, ip: "192.168.1.302", uptime: "18h 42m" },
  { id: "CAM-013", name: "TC3-Quay-B",        terminal: "Terminal 3", zone: "Quay Zone",       status: "online",  fps: 23, workers: 5,  violations: 0, ip: "192.168.1.303", uptime: "18h 10m" },
  { id: "CAM-014", name: "TC3-Container-A",   terminal: "Terminal 3", zone: "Container Yard",  status: "online",  fps: 24, workers: 11, violations: 4, ip: "192.168.1.304", uptime: "18h 42m" },
  { id: "CAM-015", name: "TC3-Container-B",   terminal: "Terminal 3", zone: "Container Yard",  status: "online",  fps: 21, workers: 6,  violations: 1, ip: "192.168.1.305", uptime: "17h 30m" },
  { id: "CAM-016", name: "TC3-Workshop-Main", terminal: "Terminal 3", zone: "Workshop",        status: "online",  fps: 20, workers: 4,  violations: 0, ip: "192.168.1.306", uptime: "18h 00m" },
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

const detectionBoxes = [
  { x: 7,  y: 18, w: 12, h: 30, label: "Person ✓", conf: 98.4, kind: "ok" },
  { x: 34, y: 28, w: 11, h: 28, label: "No Helmet", conf: 94.2, kind: "violation" },
  { x: 57, y: 20, w: 13, h: 32, label: "Person ✓", conf: 97.1, kind: "ok" },
  { x: 74, y: 26, w: 10, h: 27, label: "No Vest",   conf: 91.7, kind: "no-vest" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Page = "dashboard" | "monitoring" | "cameras" | "alerts" | "incidents" | "reports" | "settings";

const navItems: { id: Page; label: string; icon: React.ElementType; badge?: number }[] = [
  { id: "dashboard",  label: "Dashboard",        icon: LayoutDashboard },
  { id: "monitoring", label: "Live Monitoring",  icon: Monitor },
  { id: "cameras",    label: "Cameras",          icon: Camera },
  { id: "alerts",     label: "Active Alerts",    icon: Bell, badge: 2 },
  { id: "incidents",  label: "Incident History", icon: History },
  { id: "reports",    label: "Reports",          icon: FileText },
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

function Sidebar({ page, setPage, collapsed, setCollapsed }: {
  page: Page; setPage: (p: Page) => void; collapsed: boolean; setCollapsed: (v: boolean) => void;
}) {
  return (
    <aside
      className="flex flex-col h-full border-r border-sidebar-border transition-all duration-300 flex-shrink-0"
      style={{ width: collapsed ? 60 : 232, background: "var(--sidebar)" }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#f97316" }}>
          <Shield size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white tracking-wider leading-none">MARSA MAROC</div>
            <div className="text-xs mt-0.5 truncate" style={{ color: "var(--sidebar-foreground)", fontSize: "10px" }}>PPE Detection System</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded transition-colors flex-shrink-0"
          style={{ color: "var(--sidebar-foreground)" }}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navItems.map((item) => {
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              title={collapsed ? item.label : undefined}
              className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm transition-all duration-150 relative"
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
        <div
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-green-500/10 ${collapsed ? "justify-center" : ""}`}
          title={collapsed ? "YOLOv8s Active" : undefined}
        >
          <Cpu size={12} className="text-green-400 flex-shrink-0" />
          {!collapsed && (
            <div>
              <div className="text-xs font-medium text-green-400 leading-none">YOLOv8s Active</div>
              <div className="text-xs text-green-500/60 mt-0.5">AI Engine Running</div>
            </div>
          )}
        </div>
        <div
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-blue-500/10 ${collapsed ? "justify-center" : ""}`}
          title={collapsed ? "System Online" : undefined}
        >
          <Radio size={12} className="text-blue-400 flex-shrink-0" />
          {!collapsed && (
            <div>
              <div className="text-xs font-medium text-blue-400 leading-none">System Online</div>
              <div className="text-xs text-blue-500/60 mt-0.5">All Services Active</div>
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
  alerts:     "Active Alerts",
  incidents:  "Incident History",
  reports:    "Reports & Analytics",
  settings:   "System Settings",
};

function TopBar({ page, darkMode, setDarkMode }: { page: Page; darkMode: boolean; setDarkMode: (v: boolean) => void }) {
  const dt = useDateTime();
  const date = dt.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const time = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <header className="h-13 flex items-center px-5 border-b border-border bg-card/60 backdrop-blur-sm gap-4 flex-shrink-0" style={{ height: 52 }}>
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
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-xs font-medium text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          YOLOv8s
        </div>
        <div className="h-4 w-px bg-border" />
        <button className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <Bell size={15} />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: "#f97316" }}>
            KA
          </div>
          <div className="hidden md:block text-xs">
            <div className="font-semibold text-foreground leading-none">K. Amrani</div>
            <div className="text-muted-foreground mt-0.5">Safety Officer</div>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

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

function LiveMonitoringPage() {
  const [selectedId, setSelectedId] = useState("CAM-005");
  const [fps, setFps]         = useState(24);
  const [inf, setInf]         = useState(13);
  const dt = useDateTime();
  const time = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const cam = cameras.find(c => c.id === selectedId) ?? cameras[0];

  useEffect(() => {
    const id = setInterval(() => {
      setFps(22 + Math.floor(Math.random() * 5));
      setInf(10 + Math.floor(Math.random() * 7));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const kindColor: Record<string, string> = {
    ok: "#22c55e", violation: "#ef4444", "no-vest": "#f97316",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        {/* Feed */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold text-red-400 tracking-widest">LIVE</span>
              </div>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
              >
                {cameras.filter(c => c.status === "online").map(c => (
                  <option key={c.id} value={c.id}>{c.id} — {c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span>{time}</span>
              <button className="p-1.5 rounded hover:bg-white/10 transition-colors"><Maximize size={13} /></button>
            </div>
          </div>

          {/* Simulated CCTV Feed */}
          <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
            {/* Scanlines */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{
              backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,1) 2px, rgba(0,0,0,1) 4px)",
            }} />
            {/* Grid */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.07]" style={{
              backgroundImage: "linear-gradient(rgba(0,200,50,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,50,0.3) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }} />
            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
            {/* Ground suggestion */}
            <div className="absolute bottom-0 left-0 right-0 h-2/5 pointer-events-none opacity-15" style={{ background: "linear-gradient(to top, #0a200a, transparent)" }} />

            {/* Detection boxes */}
            {detectionBoxes.map((d, i) => {
              const col = kindColor[d.kind];
              return (
                <div key={i} className="absolute" style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%`, border: `2px solid ${col}`, boxShadow: `0 0 12px ${col}50` }}>
                  <div className="absolute top-0 left-0 text-white px-1 leading-tight" style={{ background: col, fontSize: 9, fontFamily: "monospace", fontWeight: "bold", color: d.kind === "ok" ? "#000" : "#fff" }}>
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
            <div className="absolute top-3 left-3 space-y-1">
              <div className="text-xs font-mono text-white/80 bg-black/60 px-2 py-0.5 rounded">{cam.id}</div>
              <div className="text-xs font-mono text-white/55 bg-black/60 px-2 py-0.5 rounded">{cam.terminal} · {cam.zone}</div>
            </div>
            <div className="absolute top-3 right-3 font-mono text-white/60 bg-black/60 px-2 py-0.5 rounded" style={{ fontSize: 10 }}>
              {fps} FPS · {inf}ms
            </div>
            <div className="absolute bottom-3 right-3 font-mono text-white/40 bg-black/60 px-2 py-0.5 rounded" style={{ fontSize: 10 }}>
              {time}
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-mono font-bold text-red-400">REC</span>
            </div>
          </div>
        </div>

        {/* Detection stats */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Person",    value: cam.workers,                           color: "#3b82f6" },
            { label: "Helmet ✓",  value: cam.workers - cam.violations,          color: "#22c55e" },
            { label: "Vest ✓",    value: cam.workers - Math.max(0, cam.violations - 1), color: "#22c55e" },
            { label: "No Helmet", value: Math.ceil(cam.violations * 0.6),       color: "#ef4444" },
            { label: "No Vest",   value: Math.floor(cam.violations * 0.5),      color: "#f97316" },
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
              { k: "Camera ID",   v: cam.id },
              { k: "Name",        v: cam.name },
              { k: "Terminal",    v: cam.terminal },
              { k: "Zone",        v: cam.zone },
              { k: "IP Address",  v: cam.ip },
              { k: "Uptime",      v: cam.uptime },
            ].map(i => (
              <div key={i.k} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{i.k}</span>
                <span className="font-mono text-foreground text-right">{i.v}</span>
              </div>
            ))}
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={cam.status} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold text-foreground mb-3">Performance</div>
          <div className="space-y-3">
            {[
              { label: "Frame Rate",     value: fps, max: 30, unit: " fps", color: "#22c55e" },
              { label: "Inference Time", value: inf, max: 50, unit: "ms",   color: "#3b82f6" },
              { label: "Confidence Thr", value: 85,  max: 100, unit: "%",   color: "#f97316" },
            ].map(m => (
              <div key={m.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-mono font-semibold" style={{ color: m.color }}>{m.value}{m.unit}</span>
                </div>
                <div className="h-1 rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(m.value / m.max) * 100}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-foreground">Current Violations</div>
            {cam.violations > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">{cam.violations}</span>
            )}
          </div>
          {cam.violations > 0 ? (
            <div className="space-y-2">
              {detectionBoxes.filter(d => d.kind !== "ok").map((d, i) => (
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

// ─── Cameras Page ─────────────────────────────────────────────────────────────

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
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(rgba(0,200,50,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,50,0.2) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
              {cam.status === "offline" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <WifiOff size={18} className="text-red-400/60" />
                  <span className="text-xs text-red-400/60 font-mono">NO SIGNAL</span>
                </div>
              ) : (
                <>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera size={24} className="text-white/5" />
                  </div>
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

// ─── Alerts Page ──────────────────────────────────────────────────────────────

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

// ─── Incident History Page ────────────────────────────────────────────────────

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

// ─── Reports Page ─────────────────────────────────────────────────────────────

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

// ─── Settings Page ────────────────────────────────────────────────────────────

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
  const [page, setPage]         = useState<Page>("dashboard");
  const [darkMode, setDarkMode] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen overflow-hidden bg-background font-sans">
        <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar page={page} darkMode={darkMode} setDarkMode={setDarkMode} />
          <main className="flex-1 overflow-auto p-5">
            {page === "dashboard"  && <DashboardPage />}
            {page === "monitoring" && <LiveMonitoringPage />}
            {page === "cameras"    && <CamerasPage />}
            {page === "alerts"     && <AlertsPage />}
            {page === "incidents"  && <IncidentHistoryPage />}
            {page === "reports"    && <ReportsPage />}
            {page === "settings"   && <SettingsPage darkMode={darkMode} setDarkMode={setDarkMode} />}
          </main>
        </div>
      </div>
    </div>
  );
}
