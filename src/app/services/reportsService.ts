import axios from "axios";
import type {
  ReportSummary,
  CompliancePoint,
  ViolationTypeSlice,
  TerminalViolations,
  CameraPerformance,
  Incident,
} from "../types/reports";

// Reuse the same base URL convention as the rest of the app
// (matches API_BASE_URL used in Live Monitoring).
const API_BASE_URL = "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

// Every function here maps 1:1 to a Flask route. Nothing else in the app
// should call axios/fetch directly for reports data — always go through
// this file so there's a single place to update if the API changes.
export const reportsService = {
  getSummary: async (): Promise<ReportSummary> => {
    const { data } = await api.get<ReportSummary>("/api/reports/summary");
    return data;
  },

  getComplianceTrend: async (): Promise<CompliancePoint[]> => {
    const { data } = await api.get<CompliancePoint[]>("/api/reports/compliance");
    return data;
  },

  getViolationTypes: async (): Promise<ViolationTypeSlice[]> => {
    const { data } = await api.get<ViolationTypeSlice[]>("/api/reports/violations/types");
    return data;
  },

  getViolationsByTerminal: async (): Promise<TerminalViolations[]> => {
    const { data } = await api.get<TerminalViolations[]>("/api/reports/violations/terminals");
    return data;
  },

  getCameraPerformance: async (): Promise<CameraPerformance[]> => {
    const { data } = await api.get<CameraPerformance[]>("/api/reports/cameras");
    return data;
  },

  getIncidentHistory: async (): Promise<Incident[]> => {
    const { data } = await api.get<Incident[]>("/api/reports/incidents");
    return data;
  },
};
