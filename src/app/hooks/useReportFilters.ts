import { useMemo, useState } from "react";
import { DEFAULT_FILTERS } from "../types/reports";
import type { ReportFilters, CameraPerformance, Incident } from "../types/reports";

/**
 * Owns filter state and applies it client-side to cameras/incidents.
 * Filtering stays frontend-only for now, as specified — when the backend
 * later supports query params (?terminal=&camera=&from=&to=...), only
 * the `apply` function below needs to change to call the API instead.
 */
export function useReportFilters(cameras: CameraPerformance[], incidents: Incident[]) {
  const [draft, setDraft] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<ReportFilters>(DEFAULT_FILTERS);

  const apply = () => setApplied(draft);
  const reset = () => {
    setDraft(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
  };

  const filteredCameras = useMemo(() => {
    return cameras.filter((c) => {
      if (applied.terminal !== "All" && c.terminal !== applied.terminal) return false;
      if (applied.camera !== "All" && c.camera !== applied.camera) return false;
      return true;
    });
  }, [cameras, applied]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((i) => {
      if (applied.terminal !== "All" && i.terminal !== applied.terminal) return false;
      if (applied.camera !== "All" && i.camera !== applied.camera) return false;
      if (applied.violationType !== "All" && i.violation !== applied.violationType) return false;
      if (applied.status !== "All" && i.status !== applied.status) return false;
      if (applied.dateFrom && i.date < applied.dateFrom) return false;
      if (applied.dateTo && i.date > applied.dateTo) return false;
      return true;
    });
  }, [incidents, applied]);

  return { draft, setDraft, apply, reset, filteredCameras, filteredIncidents };
}
