// Types mirror the Flask API contract exactly. If the backend response
// shape ever changes, update it here first — every hook/component below
// consumes these types, so TypeScript will flag every place that breaks.

export interface ReportSummary {
  total_workers: number;
  total_violations: number;
  compliance_rate: number;
  active_cameras: number;
  active_alerts: number;
  average_daily_compliance: number;
}

export interface CompliancePoint {
  day: string;
  compliance: number;
}

export interface ViolationTypeSlice {
  name: string;
  value: number;
}

export interface TerminalViolations {
  terminal: string;
  helmet: number;
  vest: number;
  both: number;
}

export interface CameraPerformance {
  camera: string;
  terminal: string;
  workers: number;
  violations: number;
  compliance: number;
}

export type IncidentStatus = "Active" | "Acknowledged" | "Resolved";

export interface Incident {
  id: string;
  date: string;
  time: string;
  camera: string;
  terminal: string;
  violation: string;
  status: IncidentStatus;
  confidence: number;
  snapshot: string;
}

// ---- Frontend-only filter state (client-side filtering on mock data) ----
export interface ReportFilters {
  dateFrom: string | null;
  dateTo: string | null;
  terminal: string; // "All" | "Terminal A" | ...
  camera: string;   // "All" | "CAM001" | ...
  violationType: string; // "All" | "No Helmet" | ...
  status: string; // "All" | IncidentStatus
}

export const DEFAULT_FILTERS: ReportFilters = {
  dateFrom: null,
  dateTo: null,
  terminal: "All",
  camera: "All",
  violationType: "All",
  status: "All",
};
