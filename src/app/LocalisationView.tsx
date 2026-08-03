import { useEffect, useState } from "react";
import { AlertTriangle, MapPin, Navigation, X } from "lucide-react";
import image from "./image.png";

const API_BASE = "http://localhost:5000";

// ── Types ──────────────────────────────────────────────────────────────────
export type ViolationType = "no-vest" | "no-helmet" | "no-vest + no-helmet";
export type CameraStatus = "online" | "offline" | "warning";
export type NavItem = "dashboard" | "cameras" | "localisation" | "alertes" | "historique";

export interface Violation {
  id: string;
  camera: string;
  zone: string;
  type: ViolationType;
  date: string;
  time: string;
  confidence: number;
  imageUrl?: string;
  acknowledged: boolean;
}

export interface CameraFeed {
  id: string;
  name: string;
  zone: string;
  status: CameraStatus;
  compliant: number;
  violations: number;
  lastActivity: string;
  previewUrl: string;
  mapX: number;
  mapY: number;
}

// ── Données des caméras réelles ──────────────────────────────────────────
// Coordonnées mapX/mapY (%) basées sur le plan du site
export const CAMERAS: CameraFeed[] = [
  {
    id: "POSTE-14",
    name: "Poste 14 - Recfers Pleins",
    zone: "Zone Recfers Pleins",
    status: "online",
    compliant: 15,
    violations: 4,
    lastActivity: "il y a 2 min",
    previewUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=260&fit=crop&auto=format",
    mapX: 49,
    mapY: 76,
  },
  {
    id: "POSTE-RORO",
    name: "Poste RORO - Recfers Pleins",
    zone: "Zone Recfers Pleins",
    status: "online",
    compliant: 12,
    violations: 6,
    lastActivity: "il y a 30 sec",
    previewUrl: "https://images.unsplash.com/photo-1565793979665-e4a40b817161?w=400&h=260&fit=crop&auto=format",
    mapX: 34,
    mapY: 76,
  },
  {
    id: "POSTE-12",
    name: "Poste 12 - Dry Pleins",
    zone: "Zone Dry Pleins",
    status: "online",
    compliant: 20,
    violations: 2,
    lastActivity: "il y a 1 min",
    previewUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=400&h=260&fit=crop&auto=format",
    mapX: 76,
    mapY: 76,
  },
  {
    id: "POSTE-13",
    name: "Poste 13 - ZONE DRY PLEINS",
    zone: "Zone Dry Pleins",
    status: "warning",
    compliant: 8,
    violations: 9,
    lastActivity: "il y a 3 min",
    previewUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&h=260&fit=crop&auto=format",
    mapX: 64,
    mapY: 76,
  },
  {
    id: "DISPATCHER",
    name: "Dispatcher - ZONE REEFERS VIDES",
    zone: "Zone Recfers Vides",
    status: "online",
    compliant: 28,
    violations: 1,
    lastActivity: "il y a 5 min",
    previewUrl: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=400&h=260&fit=crop&auto=format",
    mapX: 60,
    mapY: 60,
  },
  {
    id: "FRIGO",
    name: "Frigo - Entrepôt Frigorifique",
    zone: "Entrepôt Frigorifique",
    status: "online",
    compliant: 22,
    violations: 3,
    lastActivity: "il y a 4 min",
    previewUrl: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=400&h=260&fit=crop&auto=format",
    mapX: 34,
    mapY: 60,
  },
  {
    id: "MAG-C",
    name: "Magasin C",
    zone: "Magasin C",
    status: "warning",
    compliant: 10,
    violations: 7,
    lastActivity: "il y a 2 min",
    previewUrl: "https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=260&fit=crop&auto=format",
    mapX: 47,
    mapY: 60,
  },
];

// ── ViolationBadge ───────────────────────────────────────────────────────
export function ViolationBadge({ type }: { type: ViolationType }) {
  const map: Record<ViolationType, { label: string; cls: string }> = {
    "no-vest": { label: "Pas de gilet", cls: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
    "no-helmet": { label: "Pas de casque", cls: "bg-red-500/15 text-red-400 border border-red-500/30" },
    "no-vest + no-helmet": { label: "Gilet + Casque", cls: "bg-purple-500/15 text-purple-400 border border-purple-500/30" },
  };
  const { label, cls } = map[type];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${cls}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {label}
    </span>
  );
}

// ── Localisation View ──────────────────────────────────────────────────────
export function LocalisationView({ onNav }: { onNav?: (v: NavItem) => void }) {
  const [selectedCam, setSelectedCam] = useState<CameraFeed | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchViolations() {
      try {
        const res = await fetch(`${API_BASE}/api/violations?limit=100`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Violation[] = await res.json();
        if (!cancelled) setViolations(data);
      } catch (err) {
        console.error("Erreur récupération violations:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchViolations();
    const interval = setInterval(fetchViolations, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const activeViolations = showAll ? violations : violations.filter(v => !v.acknowledged);

  const violationsForCamera = (camId: string) =>
    activeViolations.filter(v => v.camera === camId);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Localisation des infractions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Caméra associée à sa zone sur le plan du site
          </p>
        </div>
        <button
          onClick={() => setShowAll(v => !v)}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${showAll ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
          {showAll ? "Toutes les infractions" : "Non acquittées uniquement"}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Plan */}
        <div className="xl:col-span-2 bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Plan du site</span>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-400/80 inline-block" />Caméra active</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400/80 inline-block" />Alerte</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Infraction</span>
            </div>
          </div>

          <div className="relative w-full" style={{ background: "#0f1219" }}>
            {/* Image réelle du plan */}
            <img
              src={image}
              alt="Plan du site"
              className="w-full h-auto block select-none"
              draggable={false}
            />

            {/* Marqueurs caméra superposés en position absolue (%) */}
            {CAMERAS.map(cam => {
              const camViolations = violationsForCamera(cam.id);
              const hasAlert = camViolations.length > 0;
              const color = cam.status === "offline" ? "#6b7280" : cam.status === "warning" ? "#f59e0b" : "#22c55e";
              const isSel = selectedCam?.id === cam.id;

              return (
                <button
                  key={cam.id}
                  onClick={() => setSelectedCam(isSel ? null : cam)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: `${cam.mapX}%`, top: `${cam.mapY}%` }}
                >
                  {hasAlert && (
                    <span
                      className="absolute inset-0 rounded-full bg-red-500/30 animate-ping"
                      style={{ width: 28, height: 28, left: -6, top: -6 }}
                    />
                  )}
                  <span
                    className="relative flex items-center justify-center rounded-full border-2 shadow-lg"
                    style={{
                      width: 16, height: 16,
                      background: "#131720",
                      borderColor: hasAlert ? "#ef4444" : color,
                    }}
                  >
                    {hasAlert ? (
                      <AlertTriangle size={9} color="#ef4444" />
                    ) : (
                      <span className="rounded-full" style={{ width: 6, height: 6, background: color }} />
                    )}
                  </span>

                  {/* Tooltip / label */}
                  <span
                    className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap text-[9px] font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      background: "#131720",
                      color: hasAlert ? "#ef4444" : "#9ca3af",
                      border: `1px solid ${hasAlert ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`,
                    }}
                  >
                    {cam.id}{hasAlert ? ` · ${camViolations.length}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-3">
          <div className="bg-card border border-border rounded-lg overflow-hidden flex-1">
            <div className="px-4 py-3 border-b border-border">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {activeViolations.length} infraction{activeViolations.length !== 1 ? "s" : ""} en cours
              </div>
            </div>
            <div className="overflow-y-auto max-h-[420px] [scrollbar-width:thin]">
              {loading && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Connexion aux caméras...
                </div>
              )}
              {!loading && activeViolations.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Aucune infraction {showAll ? "" : "non acquittée"} — la détection est en cours
                </div>
              )}
              {activeViolations.map(v => {
                const cam = CAMERAS.find(c => c.id === v.camera);
                return (
                  <div key={v.id} className="px-4 py-3 border-b border-border">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <ViolationBadge type={v.type} />
                      {!v.acknowledged && (
                        <span className="text-[9px] text-accent font-bold uppercase">NEW</span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-foreground mb-1">
                      {v.camera} · {v.zone}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2">
                      <MapPin size={9} />
                      {v.date} {v.time}
                    </div>

                    {/* Bouton itinéraire */}
                    <button
                      type="button"
                      onClick={() => onNav?.("alertes")}
                      className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
                    >
                      <Navigation size={11} />
                      Voir l'alerte
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Détail caméra sélectionnée */}
          {selectedCam && (
            <div className="bg-card border border-accent/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground">{selectedCam.id} · {selectedCam.name}</span>
                <button onClick={() => setSelectedCam(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              </div>
              <img src={selectedCam.previewUrl} alt={selectedCam.name}
                className="w-full h-28 object-cover rounded bg-muted mb-3" />
              <div className="flex justify-between items-center text-[10px] mb-1">
                <span className="text-muted-foreground">Zone</span>
                <span className="text-foreground font-semibold">{selectedCam.zone}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] mb-3">
                <span className="text-muted-foreground">Statut</span>
                <span className="text-foreground font-semibold capitalize">{selectedCam.status}</span>
              </div>

              {violationsForCamera(selectedCam.id).length > 0 ? (
                <button
                  type="button"
                  onClick={() => onNav?.("alertes")}
                  className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 bg-primary text-primary-foreground rounded font-semibold hover:opacity-90 transition-opacity"
                >
                  <Navigation size={12} />
                  Voir les alertes de cette zone
                </button>
              ) : (
                <div className="text-[10px] text-muted-foreground text-center">Aucune alerte active sur cette caméra</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}