import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { CompliancePoint, TerminalViolations, ViolationTypeSlice } from "../../types/reports";

const tooltipStyle = {
  background: "#081428",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2eaf4",
};

const pieColors: Record<string, string> = {
  "No Helmet": "#ef4444",
  "No Vest": "#f97316",
  "Both Missing": "#a855f7",
  Conform: "#22c55e",
};

interface Props {
  compliance: CompliancePoint[];
  violationsByTerminal: TerminalViolations[];
  violationTypes: ViolationTypeSlice[];
}

export function ReportsCharts({ compliance, violationsByTerminal, violationTypes }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
        <div className="text-sm font-semibold text-foreground mb-4">Compliance Trend</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={compliance}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="compliance"
              name="Compliance %"
              stroke="#22c55e"
              strokeWidth={2.5}
              dot={{ fill: "#22c55e", r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-sm font-semibold text-foreground mb-4">Violations by Terminal</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={violationsByTerminal} barSize={16} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="terminal" tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a7a96", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="helmet" name="No Helmet" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="vest" name="No Vest" fill="#f97316" radius={[3, 3, 0, 0]} />
            <Bar dataKey="both" name="Both Missing" fill="#a855f7" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-sm font-semibold text-foreground mb-4">Violation Types</div>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={violationTypes}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {violationTypes.map((slice) => (
                <Cell key={slice.name} fill={pieColors[slice.name] ?? "#6b7280"} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
