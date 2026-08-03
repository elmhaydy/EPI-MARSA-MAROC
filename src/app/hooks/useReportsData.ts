import { useCallback, useEffect, useState } from "react";
import { reportsService } from "../services/reportsService";
import type {
  ReportSummary,
  CompliancePoint,
  ViolationTypeSlice,
  TerminalViolations,
  CameraPerformance,
  Incident,
} from "../types/reports";

interface ReportsData {
  summary: ReportSummary | null;
  compliance: CompliancePoint[];
  violationTypes: ViolationTypeSlice[];
  violationsByTerminal: TerminalViolations[];
  cameras: CameraPerformance[];
  incidents: Incident[];
}

const EMPTY_DATA: ReportsData = {
  summary: null,
  compliance: [],
  violationTypes: [],
  violationsByTerminal: [],
  cameras: [],
  incidents: [],
};

/**
 * Loads every Reports endpoint in parallel and exposes a single
 * loading / error / data surface for the page to consume.
 *
 * The Reports page itself should never call reportsService or axios
 * directly — it only uses this hook (or the more granular ones below).
 */
export function useReportsData() {
  const [data, setData] = useState<ReportsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, compliance, violationTypes, violationsByTerminal, cameras, incidents] =
        await Promise.all([
          reportsService.getSummary(),
          reportsService.getComplianceTrend(),
          reportsService.getViolationTypes(),
          reportsService.getViolationsByTerminal(),
          reportsService.getCameraPerformance(),
          reportsService.getIncidentHistory(),
        ]);
      setData({ summary, compliance, violationTypes, violationsByTerminal, cameras, incidents });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the reports API. Is the Flask backend running?"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, loading, error, refetch: load };
}
