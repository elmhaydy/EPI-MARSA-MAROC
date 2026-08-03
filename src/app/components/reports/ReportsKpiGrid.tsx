import { User, AlertTriangle, Shield, Camera, Bell, TrendingUp } from "lucide-react";
import type { ReportSummary } from "../../types/reports";

interface Props {
  summary: ReportSummary;
}

const palette: Record<string, string> = {
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#22c55e",
  orange: "#f97316",
};

function Kpi({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: keyof typeof palette;
}) {
  const c = palette[color];
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${c}20` }}>
          <Icon size={15} style={{ color: c }} />
        </div>
      </div>
      <div className="text-2xl font-bold font-mono text-foreground">{value}</div>
    </div>
  );
}

export function ReportsKpiGrid({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <Kpi label="Total Workers" value={summary.total_workers} icon={User} color="blue" />
      <Kpi label="Total Violations" value={summary.total_violations} icon={AlertTriangle} color="red" />
      <Kpi label="Compliance Rate" value={`${summary.compliance_rate}%`} icon={Shield} color="green" />
      <Kpi label="Active Cameras" value={summary.active_cameras} icon={Camera} color="orange" />
      <Kpi label="Active Alerts" value={summary.active_alerts} icon={Bell} color="red" />
      <Kpi
        label="Avg Daily Compliance"
        value={`${summary.average_daily_compliance}%`}
        icon={TrendingUp}
        color="green"
      />
    </div>
  );
}
