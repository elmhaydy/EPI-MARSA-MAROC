import { Eye, ImageOff } from "lucide-react";
import type { Incident } from "../../types/reports";

interface Props {
  incidents: Incident[];
  onView?: (incident: Incident) => void;
}

function StatusBadge({ status }: { status: Incident["status"] }) {
  const map: Record<Incident["status"], { bg: string; text: string; dot: string }> = {
    Active: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
    Acknowledged: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
    Resolved: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-400" },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

export function IncidentHistoryTable({ incidents, onView }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-auto">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Incident History</span>
      </div>
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="border-b border-border bg-white/[0.02]">
            {["Date", "Time", "Camera", "Terminal", "Violation", "Confidence", "Status", "Snapshot", "Actions"].map((h) => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {incidents.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-xs text-muted-foreground">
                No incidents match the current filters.
              </td>
            </tr>
          ) : (
            incidents.map((i) => (
              <tr key={i.id} className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{i.date}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{i.time}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-foreground">{i.camera}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{i.terminal}</td>
                <td className="px-4 py-2.5 text-xs text-foreground">{i.violation}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-foreground">{i.confidence}%</td>
                <td className="px-4 py-2.5"><StatusBadge status={i.status} /></td>
                <td className="px-4 py-2.5">
                  {i.snapshot ? (
                    <img src={i.snapshot} alt={i.id} className="w-10 h-7 rounded object-cover bg-muted" />
                  ) : (
                    <div className="w-10 h-7 rounded bg-muted flex items-center justify-center">
                      <ImageOff size={11} className="text-muted-foreground" />
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => onView?.(i)}
                    className="p-1.5 rounded hover:bg-white/10 text-blue-400 hover:text-blue-300 transition-colors"
                    title="View"
                  >
                    <Eye size={13} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
