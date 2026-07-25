import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  AlertTriangle,
  Camera,
  Shield,
  Info,
  X,
  ExternalLink,
  Filter,
} from "lucide-react";

export interface NotificationItem {
  id: number;
  timestamp: string;
  title: string;
  message: string;
  type: "violation" | "camera" | "system" | "security" | string;
  severity: "critical" | "warning" | "info" | string;
  camera_id?: string | null;
  is_read: boolean;
  created_at: number;
}

interface NotificationCenterProps {
  apiBaseUrl?: string;
  onNavigate?: (page: string, params?: any) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  apiBaseUrl = "http://localhost:5000",
  onNavigate,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "critical">("all");
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const lastKnownIds = useRef<Set<number>>(new Set());

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/notifications`);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data)) {
        // Detect new critical notification for Toast
        data.forEach((n: NotificationItem) => {
          if (!lastKnownIds.current.has(n.id) && !n.is_read && n.severity === "critical") {
            setToast(n);
          }
          lastKnownIds.current.add(n.id);
        });
        setNotifications(data);
      }
    } catch (err) {
      console.warn("Notifications fetch warning:", err);
    }
  };

  // Poll for notifications every 3 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 3000);
    return () => clearInterval(interval);
  }, [apiBaseUrl]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Toast auto-clear after 6s
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case "unread":
        return notifications.filter((n) => !n.is_read);
      case "critical":
        return notifications.filter((n) => n.severity === "critical");
      case "all":
      default:
        return notifications;
    }
  }, [notifications, activeTab]);

  const handleMarkAsRead = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetch(`${apiBaseUrl}/api/notifications/${id}/read`, {
        method: "POST",
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await fetch(`${apiBaseUrl}/api/notifications/read-all`, {
        method: "POST",
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNotification = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetch(`${apiBaseUrl}/api/notifications/${id}`, {
        method: "DELETE",
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Effacer toutes les notifications ?")) return;
    try {
      await fetch(`${apiBaseUrl}/api/notifications/clear`, {
        method: "DELETE",
      });
      setNotifications([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleItemClick = (notif: NotificationItem) => {
    if (!notif.is_read) {
      handleMarkAsRead(notif.id);
    }
    setOpen(false);
    if (onNavigate) {
      if (notif.type === "violation" || notif.camera_id) {
        onNavigate("monitoring");
      } else {
        onNavigate("alerts");
      }
    }
  };

  const getNotifIcon = (type: string, severity: string) => {
    switch (type) {
      case "violation":
        return <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />;
      case "camera":
        return <Camera className="w-4 h-4 text-amber-500 flex-shrink-0" />;
      case "security":
        return <Shield className="w-4 h-4 text-purple-500 flex-shrink-0" />;
      case "system":
      default:
        return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    return timestamp;
  };

  return (
    <>
      {/* ── Bell Icon Button Trigger ────────────────────────────────────────── */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setOpen(!open)}
          className={`relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 ${
            open ? "bg-muted/80 text-foreground" : ""
          }`}
          title="Notifications Temps Réel"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-white text-[10px] font-bold items-center justify-center shadow-md">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </span>
          )}
        </button>

        {/* ── Popover Drawer ──────────────────────────────────────────────── */}
        {open && (
          <div className="absolute right-0 mt-2 w-96 rounded-2xl bg-card border border-border/80 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-xl">
            {/* Header */}
            <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-orange-500" />
                <h3 className="font-bold text-sm text-foreground">
                  Notifications Temps Réel
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                    {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                  title="Tout marquer comme lu"
                >
                  <CheckCheck size={14} />
                  <span>Tout lire</span>
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-2 bg-muted/20 border-b border-border/40 text-xs font-medium">
              <button
                onClick={() => setActiveTab("all")}
                className={`flex-1 py-1.5 rounded-lg transition-colors text-center ${
                  activeTab === "all"
                    ? "bg-card text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Toutes ({notifications.length})
              </button>
              <button
                onClick={() => setActiveTab("unread")}
                className={`flex-1 py-1.5 rounded-lg transition-colors text-center ${
                  activeTab === "unread"
                    ? "bg-card text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Non lues ({unreadCount})
              </button>
              <button
                onClick={() => setActiveTab("critical")}
                className={`flex-1 py-1.5 rounded-lg transition-colors text-center ${
                  activeTab === "critical"
                    ? "bg-card text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Critiques
              </button>
            </div>

            {/* Notification Items List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
              {filteredNotifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs space-y-1">
                  <Info className="w-6 h-6 mx-auto opacity-50 mb-1" />
                  <p className="font-medium text-foreground">Aucune notification</p>
                  <p className="text-[11px]">
                    {activeTab === "unread"
                      ? "Vous avez lu toutes vos notifications !"
                      : "Le système n'a détecté aucune nouvelle alerte."}
                  </p>
                </div>
              ) : (
                filteredNotifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`p-3.5 flex items-start gap-3 hover:bg-muted/40 transition-colors cursor-pointer group relative ${
                      !n.is_read ? "bg-primary/5" : ""
                    }`}
                  >
                    {/* Unread indicator */}
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0 animate-pulse" />
                    )}

                    {/* Icon Box */}
                    <div className="p-2 rounded-xl bg-muted border border-border/50 mt-0.5">
                      {getNotifIcon(n.type, n.severity)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4
                          className={`text-xs font-semibold text-foreground truncate ${
                            !n.is_read ? "font-bold text-primary" : ""
                          }`}
                        >
                          {n.title}
                        </h4>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap font-mono">
                          {formatTimeAgo(n.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>

                      {n.camera_id && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary font-medium">
                          <ExternalLink size={10} />
                          <span>Voir la caméra {n.camera_id}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions on Hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-card/80 rounded-lg p-1 border border-border">
                      {!n.is_read && (
                        <button
                          onClick={(e) => handleMarkAsRead(n.id, e)}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                          title="Marquer comme lu"
                        >
                          <Check size={12} />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDeleteNotification(n.id, e)}
                        className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded"
                        title="Supprimer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-2.5 bg-muted/30 border-t border-border/60 flex items-center justify-between text-xs">
                <button
                  onClick={handleClearAll}
                  className="text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1 text-[11px]"
                >
                  <Trash2 size={12} />
                  <span>Effacer l'historique</span>
                </button>
                <span className="text-[11px] text-muted-foreground">
                  {notifications.length} événements enregistrés
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Live Toast Notification Floating Banner ────────────────────────────── */}
      {toast && (
        <div className="fixed top-16 right-5 z-50 w-80 p-4 rounded-2xl bg-card border border-red-500/30 shadow-2xl animate-in slide-in-from-right duration-300 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 flex-shrink-0 animate-bounce">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">
                  ALERTE TEMPS RÉEL
                </span>
                <button
                  onClick={() => setToast(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
              <h4 className="text-xs font-bold text-foreground mt-0.5 truncate">
                {toast.title}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {toast.message}
              </p>
              {toast.camera_id && (
                <button
                  onClick={() => {
                    setToast(null);
                    if (onNavigate) onNavigate("monitoring");
                  }}
                  className="mt-2 text-xs text-red-500 font-semibold hover:underline flex items-center gap-1"
                >
                  <span>Consulter le flux vidéo</span>
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
