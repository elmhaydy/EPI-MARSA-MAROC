import React, { useState, useEffect, useMemo } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  Search,
  RefreshCw,
  Trash2,
  Filter,
  User,
  Clock,
  Activity,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Lock,
} from "lucide-react";

export interface AuditLogItem {
  id: number;
  timestamp: string;
  user_name: string;
  user_email: string;
  user_role: string;
  action: string;
  category: string;
  details: string;
  severity: "info" | "warning" | "critical" | string;
  ip_address: string;
}

interface AuditLogsViewProps {
  apiBaseUrl?: string;
  currentUser?: {
    name: string;
    email: string;
    role: string;
  } | null;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  apiBaseUrl = "http://localhost:5000",
  currentUser,
}) => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Toutes");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("Toutes");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const fetchAuditLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/audit-logs`);
      if (!response.ok) {
        throw new Error(`Erreur lors de la récupération des logs (${response.status})`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setLogs(data);
      } else {
        setLogs([]);
      }
    } catch (err: any) {
      console.error("Erreur fetchAuditLogs:", err);
      setError(err.message || "Impossible de contacter le serveur d'audit.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [apiBaseUrl]);

  // Toast auto-clear
  useEffect(() => {
    if (actionSuccessMessage) {
      const timer = setTimeout(() => setActionSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccessMessage]);

  // Categories list
  const categories = [
    "Toutes",
    "Authentification",
    "Gestion Utilisateurs",
    "Configuration Système",
    "Opérations HSE",
  ];

  // Severities list
  const severities = ["Toutes", "info", "warning", "critical"];

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesCategory =
        selectedCategory === "Toutes" || log.category === selectedCategory;
      const matchesSeverity =
        selectedSeverity === "Toutes" || log.severity === selectedSeverity;
      const matchesSearch =
        searchTerm === "" ||
        log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ip_address.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesCategory && matchesSeverity && matchesSearch;
    });
  }, [logs, selectedCategory, selectedSeverity, searchTerm]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Stats
  const stats = useMemo(() => {
    const total = logs.length;
    const critical = logs.filter((l) => l.severity === "critical").length;
    const warning = logs.filter((l) => l.severity === "warning").length;
    const authEvents = logs.filter(
      (l) => l.category === "Authentification"
    ).length;
    return { total, critical, warning, authEvents };
  }, [logs]);

  const handleExportCSV = () => {
    window.open(`${apiBaseUrl}/api/audit-logs/export`, "_blank");
    setActionSuccessMessage("Exportation du journal d'audit lancée (Format CSV).");
  };

  const handleClearLogs = async () => {
    if (
      !window.confirm(
        "Êtes-vous sûr de vouloir vider l'historique du journal d'audit ? Cette action est irréversible."
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/audit-logs/clear`, {
        method: "DELETE",
      });
      if (response.ok) {
        setActionSuccessMessage("Le journal d'audit a été réinitialisé.");
        fetchAuditLogs();
      } else {
        alert("Erreur lors de la réinitialisation des logs.");
      }
    } catch (e: any) {
      alert("Erreur réseau : " + e.message);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            <ShieldAlert className="w-3.5 h-3.5" />
            Critique
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            Avertissement
          </span>
        );
      case "info":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            Information
          </span>
        );
    }
  };

  const getRoleBadge = (role: string) => {
    if (role.includes("Admin")) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
          {role}
        </span>
      );
    }
    if (role.includes("Superviseur")) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20">
          {role}
        </span>
      );
    }
    if (role.includes("Système")) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20">
          {role}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-500/10 text-gray-600 dark:text-gray-300 border border-gray-500/20">
        {role}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto text-foreground">
      {/* ── En-tête de la page ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-500/10 text-orange-500 rounded-xl border border-orange-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                Journal d'Audit & Sécurité
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  ISO 27001 Compliant
                </span>
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Traçabilité complète des accès, modifications et événements de sécurité du système MARSA EPI
              </p>
            </div>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAuditLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-medium border border-border transition-all duration-200"
            title="Actualiser les données"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-all duration-200 shadow-md"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exporter (CSV)</span>
          </button>

          {currentUser?.role.includes("Admin") && (
            <button
              onClick={handleClearLogs}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 text-sm font-medium transition-all duration-200"
              title="Réinitialiser l'historique"
            >
              <Trash2 className="w-4 h-4" />
              <span>Purger</span>
            </button>
          )}
        </div>
      </div>

      {/* Message de notification temporaire */}
      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Fermer
          </button>
        </div>
      )}

      {/* ── Cartes KPIs ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Events */}
        <div className="bg-card p-5 rounded-2xl border border-border flex items-center justify-between shadow-sm">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
              Total Événements
            </p>
            <h3 className="text-2xl font-bold text-foreground mt-1">{stats.total}</h3>
            <p className="text-xs text-muted-foreground mt-1">Journalisés en BD SQL</p>
          </div>
          <div className="p-3 bg-muted text-foreground rounded-xl border border-border">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Critical Events */}
        <div className="bg-card p-5 rounded-2xl border border-border flex items-center justify-between shadow-sm">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
              Alertes Critiques
            </p>
            <h3 className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
              {stats.critical}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Interventions immédiates</p>
          </div>
          <div className="p-3 bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl border border-red-500/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Warnings */}
        <div className="bg-card p-5 rounded-2xl border border-border flex items-center justify-between shadow-sm">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
              Avertissements
            </p>
            <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {stats.warning}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Échecs connexion & modifications</p>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Auth Events */}
        <div className="bg-card p-5 rounded-2xl border border-border flex items-center justify-between shadow-sm">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
              Authentifications
            </p>
            <h3 className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {stats.authEvents}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Connexions & Sessions</p>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-500/20">
            <Lock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ── Barre de Filtres et Recherche ──────────────────────────────────── */}
      <div className="bg-card p-4 rounded-2xl border border-border flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
        {/* Input Recherche */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher par utilisateur, action, IP, détails..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        {/* Filtres Selects */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Filtre Catégorie */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
              <Filter className="w-3.5 h-3.5" /> Catégorie :
            </span>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-background border border-border text-foreground text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-orange-500"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Filtre Sévérité */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Sévérité :</span>
            <select
              value={selectedSeverity}
              onChange={(e) => {
                setSelectedSeverity(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-background border border-border text-foreground text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-orange-500"
            >
              {severities.map((sev) => (
                <option key={sev} value={sev}>
                  {sev === "Toutes"
                    ? "Toutes les sévérités"
                    : sev === "info"
                    ? "Information"
                    : sev === "warning"
                    ? "Avertissement"
                    : "Critique"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Tableau des Logs ────────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-orange-500" />
            <p className="text-sm">Chargement du journal d'audit...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 bg-red-500/5">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold">{error}</p>
            <button
              onClick={fetchAuditLogs}
              className="mt-4 px-4 py-2 bg-muted text-foreground text-xs rounded-xl hover:bg-muted/80"
            >
              Réessayer
            </button>
          </div>
        ) : paginatedLogs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground space-y-2">
            <Info className="w-8 h-8 mx-auto text-muted-foreground opacity-60" />
            <p className="font-medium text-foreground">Aucun événement d'audit trouvé</p>
            <p className="text-xs text-muted-foreground">
              Essayez de réinitialiser vos filtres de recherche.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/60 border-b border-border text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-16">ID</th>
                  <th className="py-3.5 px-4 w-44">Horodatage</th>
                  <th className="py-3.5 px-4">Utilisateur & Rôle</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Catégorie</th>
                  <th className="py-3.5 px-4 max-w-md">Détails de l'événement</th>
                  <th className="py-3.5 px-4">Sévérité</th>
                  <th className="py-3.5 px-4 w-32">Adresse IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-sm">
                {paginatedLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-muted/40 transition-colors duration-150 group"
                  >
                    {/* ID */}
                    <td className="py-3.5 px-4 text-xs font-mono text-muted-foreground">
                      #{log.id}
                    </td>

                    {/* Date/Heure */}
                    <td className="py-3.5 px-4 text-xs text-foreground whitespace-nowrap font-mono">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        {log.timestamp}
                      </div>
                    </td>

                    {/* Utilisateur & Rôle */}
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="font-medium text-foreground flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          {log.user_name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <span>{log.user_email}</span>
                          {getRoleBadge(log.user_role)}
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                        {log.action}
                      </span>
                    </td>

                    {/* Catégorie */}
                    <td className="py-3.5 px-4 text-xs text-muted-foreground">
                      {log.category}
                    </td>

                    {/* Détails */}
                    <td className="py-3.5 px-4 text-xs text-foreground max-w-md leading-relaxed">
                      {log.details}
                    </td>

                    {/* Sévérité */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getSeverityBadge(log.severity)}
                    </td>

                    {/* IP */}
                    <td className="py-3.5 px-4 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      <span className="bg-muted px-2 py-0.5 rounded border border-border text-foreground">
                        {log.ip_address}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Pagination */}
        <div className="bg-muted/40 px-4 py-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div>
            Affichage de{" "}
            <span className="font-semibold text-foreground">
              {filteredLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </span>{" "}
            à{" "}
            <span className="font-semibold text-foreground">
              {Math.min(currentPage * pageSize, filteredLogs.length)}
            </span>{" "}
            sur <span className="font-semibold text-foreground">{filteredLogs.length}</span>{" "}
            événements
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span>Lignes par page :</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-background border border-border text-foreground rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-card border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium text-foreground">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg bg-card border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-foreground"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
