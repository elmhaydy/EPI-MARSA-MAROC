import { Download, FileSpreadsheet } from "lucide-react";
import { useReportsData } from "../hooks/useReportsData";
import { useReportFilters } from "../hooks/useReportFilters";
import { ReportsLoadingState } from "../components/reports/ReportsLoadingState";
import { ReportsErrorState } from "../components/reports/ReportsErrorState";
import { ReportsKpiGrid } from "../components/reports/ReportsKpiGrid";
import { ReportsFilterBar } from "../components/reports/ReportsFilterBar";
import { ReportsCharts } from "../components/reports/ReportsCharts";
import { CameraPerformanceTable } from "../components/reports/CameraPerformanceTable";
import { IncidentHistoryTable } from "../components/reports/IncidentHistoryTable";

export default function ReportsPage() {
  const { summary, compliance, violationTypes, violationsByTerminal, cameras, incidents, loading, error, refetch } =
    useReportsData();

  const { draft, setDraft, apply, reset, filteredCameras, filteredIncidents } = useReportFilters(
    cameras,
    incidents
  );

  const terminals = Array.from(new Set(cameras.map((c) => c.terminal)));
  const violationTypeOptions = Array.from(new Set(incidents.map((i) => i.violation)));
  const statusOptions = Array.from(new Set(incidents.map((i) => i.status)));

  return (
    <div className="space-y-5">
      {/* Top section */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-foreground">Reports &amp; Analytics</h1>
        <div className="flex items-center gap-2">
          <button
            disabled
            title="Coming soon"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Download size={13} />
            Export PDF
          </button>
          <button
            disabled
            title="Coming soon"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <FileSpreadsheet size={13} />
            Export Excel
          </button>
        </div>
      </div>

      {loading && <ReportsLoadingState />}

      {!loading && error && <ReportsErrorState message={error} onRetry={refetch} />}

      {!loading && !error && summary && (
        <>
          <ReportsFilterBar
            draft={draft}
            setDraft={setDraft}
            onApply={apply}
            onReset={reset}
            terminals={terminals}
            cameras={cameras}
            violationTypes={violationTypeOptions}
            statuses={statusOptions}
          />

          <ReportsKpiGrid summary={summary} />

          <ReportsCharts
            compliance={compliance}
            violationsByTerminal={violationsByTerminal}
            violationTypes={violationTypes}
          />

          <CameraPerformanceTable cameras={filteredCameras} />

          <IncidentHistoryTable incidents={filteredIncidents} />
        </>
      )}
    </div>
  );
}
