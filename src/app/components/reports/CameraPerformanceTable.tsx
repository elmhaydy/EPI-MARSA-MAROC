import type { CameraPerformance } from "../../types/reports";

interface Props {
  cameras: CameraPerformance[];
}

export function CameraPerformanceTable({ cameras }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-auto">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Camera Performance</span>
      </div>
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-border bg-white/[0.02]">
            {["Camera", "Terminal", "Workers", "Violations", "Compliance %"].map((h) => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cameras.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                No cameras match the current filters.
              </td>
            </tr>
          ) : (
            cameras.map((c) => (
              <tr key={c.camera} className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.camera}</td>
                <td className="px-4 py-2.5 text-xs text-foreground">{c.terminal}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-foreground">{c.workers}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-foreground">{c.violations}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${c.compliance}%`, background: c.compliance >= 90 ? "#22c55e" : c.compliance >= 75 ? "#f97316" : "#ef4444" }}
                      />
                    </div>
                    <span className="text-xs font-mono text-foreground">{c.compliance}%</span>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
