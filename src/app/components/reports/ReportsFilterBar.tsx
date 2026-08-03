import type { ReportFilters, CameraPerformance } from "../../types/reports";

interface Props {
  draft: ReportFilters;
  setDraft: (f: ReportFilters) => void;
  onApply: () => void;
  onReset: () => void;
  terminals: string[];
  cameras: CameraPerformance[];
  violationTypes: string[];
  statuses: string[];
}

const selectClass =
  "bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50";

export function ReportsFilterBar({
  draft,
  setDraft,
  onApply,
  onReset,
  terminals,
  cameras,
  violationTypes,
  statuses,
}: Props) {
  const cameraOptions =
    draft.terminal === "All" ? cameras : cameras.filter((c) => c.terminal === draft.terminal);

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">From</label>
        <input
          type="date"
          value={draft.dateFrom ?? ""}
          onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value || null })}
          className={selectClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">To</label>
        <input
          type="date"
          value={draft.dateTo ?? ""}
          onChange={(e) => setDraft({ ...draft, dateTo: e.target.value || null })}
          className={selectClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Terminal</label>
        <select
          value={draft.terminal}
          onChange={(e) => setDraft({ ...draft, terminal: e.target.value, camera: "All" })}
          className={selectClass}
        >
          <option>All</option>
          {terminals.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Camera</label>
        <select
          value={draft.camera}
          onChange={(e) => setDraft({ ...draft, camera: e.target.value })}
          className={selectClass}
        >
          <option>All</option>
          {cameraOptions.map((c) => (
            <option key={c.camera}>{c.camera}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Violation Type</label>
        <select
          value={draft.violationType}
          onChange={(e) => setDraft({ ...draft, violationType: e.target.value })}
          className={selectClass}
        >
          <option>All</option>
          {violationTypes.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Status</label>
        <select
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value })}
          className={selectClass}
        >
          <option>All</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onReset}
          className="px-3 py-2 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-white/5 transition-colors"
        >
          Reset
        </button>
        <button
          onClick={onApply}
          className="px-3 py-2 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "#f97316" }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
