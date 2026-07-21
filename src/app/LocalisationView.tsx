import { useState, useRef } from "react";
import { Clock, X, MapPin, Navigation } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
export type ViolationType = "no-vest" | "no-helmet" | "no-vest + no-helmet";
export type CameraStatus = "online" | "offline" | "warning";
export type NavItem = "dashboard" | "cameras" | "localisation" | "alertes" | "historique";

// Position in camera frame: bx/by = normalized bounding-box center (0–1)
// mapX/mapY = position on facility floor plan (0–100 %)
export interface PersonPosition {
  bx: number;       // horiz. center in camera frame  (0=left, 1=right)
  by: number;       // vert.  center in camera frame  (0=top,  1=bottom)
  distanceM: number;// estimated distance from camera in metres
  angleRel: number; // angle relative to camera optical axis, degrees (neg=left, pos=right)
  mapX: number;     // % x on facility map
  mapY: number;     // % y on facility map
}

export interface Violation {
  id: string;
  camera: string;
  zone: string;
  type: ViolationType;
  date: string;
  time: string;
  confidence: number;
  imageUrl: string;
  acknowledged: boolean;
  position: PersonPosition;
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
  // facility map placement
  mapX: number;   // % on plan
  mapY: number;
  fovAngle: number;     // full FOV in degrees
  fovDirection: number; // pointing direction in degrees (0=right, 90=down, 180=left, 270=up)
  fovRange: number;     // range in % of map
}

// ── Mock Data ──────────────────────────────────────────────────────────────
export const CAMERAS: CameraFeed[] = [
  {
    id: "CAM-001", name: "Entrée principale", zone: "Zone A",
    status: "online", compliant: 24, violations: 3, lastActivity: "il y a 2 min",
    previewUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=260&fit=crop&auto=format",
    mapX: 8, mapY: 30, fovAngle: 70, fovDirection: 0, fovRange: 28,
  },
  {
    id: "CAM-002", name: "Atelier assemblage", zone: "Zone B",
    status: "online", compliant: 18, violations: 7, lastActivity: "il y a 30 sec",
    previewUrl: "https://images.unsplash.com/photo-1565793979665-e4a40b817161?w=400&h=260&fit=crop&auto=format",
    mapX: 30, mapY: 52, fovAngle: 80, fovDirection: 355, fovRange: 30,
  },
  {
    id: "CAM-003", name: "Quai de chargement", zone: "Zone C",
    status: "warning", compliant: 9, violations: 12, lastActivity: "il y a 1 min",
    previewUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=400&h=260&fit=crop&auto=format",
    mapX: 88, mapY: 78, fovAngle: 90, fovDirection: 180, fovRange: 32,
  },
  {
    id: "CAM-004", name: "Salle de contrôle", zone: "Zone D",
    status: "online", compliant: 31, violations: 1, lastActivity: "il y a 5 min",
    previewUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&h=260&fit=crop&auto=format",
    mapX: 72, mapY: 12, fovAngle: 60, fovDirection: 90, fovRange: 25,
  },
  {
    id: "CAM-005", name: "Stockage matériaux", zone: "Zone E",
    status: "offline", compliant: 0, violations: 0, lastActivity: "hors ligne",
    previewUrl: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=400&h=260&fit=crop&auto=format",
    mapX: 18, mapY: 82, fovAngle: 70, fovDirection: 10, fovRange: 27,
  },
  {
    id: "CAM-006", name: "Sortie de secours", zone: "Zone F",
    status: "online", compliant: 6, violations: 2, lastActivity: "il y a 8 min",
    previewUrl: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=400&h=260&fit=crop&auto=format",
    mapX: 52, mapY: 90, fovAngle: 65, fovDirection: 270, fovRange: 26,
  },
];

export const VIOLATIONS: Violation[] = [
  {
    id: "VIO-2026-0891", camera: "CAM-003", zone: "Zone C – Quai de chargement",
    type: "no-vest", date: "15/07/2026", time: "09:47:22", confidence: 97.3,
    imageUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=200&h=140&fit=crop&auto=format",
    acknowledged: false,
    position: { bx: 0.42, by: 0.61, distanceM: 6.2, angleRel: -8, mapX: 67, mapY: 74 },
  },
  {
    id: "VIO-2026-0890", camera: "CAM-002", zone: "Zone B – Atelier assemblage",
    type: "no-helmet", date: "15/07/2026", time: "09:31:05", confidence: 94.1,
    imageUrl: "https://images.unsplash.com/photo-1565793979665-e4a40b817161?w=200&h=140&fit=crop&auto=format",
    acknowledged: false,
    position: { bx: 0.58, by: 0.55, distanceM: 4.8, angleRel: 12, mapX: 45, mapY: 49 },
  },
  {
    id: "VIO-2026-0889", camera: "CAM-003", zone: "Zone C – Quai de chargement",
    type: "no-vest + no-helmet", date: "15/07/2026", time: "09:14:58", confidence: 99.0,
    imageUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.71, by: 0.48, distanceM: 9.1, angleRel: 22, mapX: 61, mapY: 71 },
  },
  {
    id: "VIO-2026-0888", camera: "CAM-001", zone: "Zone A – Entrée principale",
    type: "no-vest", date: "15/07/2026", time: "08:52:44", confidence: 91.6,
    imageUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.34, by: 0.67, distanceM: 7.4, angleRel: -15, mapX: 22, mapY: 34 },
  },
  {
    id: "VIO-2026-0887", camera: "CAM-006", zone: "Zone F – Sortie de secours",
    type: "no-helmet", date: "15/07/2026", time: "08:33:17", confidence: 88.9,
    imageUrl: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.50, by: 0.42, distanceM: 5.3, angleRel: 3, mapX: 54, mapY: 72 },
  },
  {
    id: "VIO-2026-0886", camera: "CAM-002", zone: "Zone B – Atelier assemblage",
    type: "no-vest", date: "14/07/2026", time: "16:58:03", confidence: 95.7,
    imageUrl: "https://images.unsplash.com/photo-1565793979665-e4a40b817161?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.28, by: 0.70, distanceM: 3.9, angleRel: -20, mapX: 38, mapY: 55 },
  },
  {
    id: "VIO-2026-0885", camera: "CAM-003", zone: "Zone C – Quai de chargement",
    type: "no-vest + no-helmet", date: "14/07/2026", time: "15:22:41", confidence: 98.2,
    imageUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=200&h=140&fit=crop&auto=format",
    acknowledged: true,
    position: { bx: 0.63, by: 0.57, distanceM: 11.5, angleRel: 18, mapX: 59, mapY: 68 },
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
/** Build SVG path for camera FOV cone */
export function fovPath(cx: number, cy: number, angleDeg: number, dirDeg: number, rangeR: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const half = angleDeg / 2;
  const left  = dirDeg - half;
  const right = dirDeg + half;
  const x1 = cx + rangeR * Math.cos(toRad(left));
  const y1 = cy + rangeR * Math.sin(toRad(left));
  const x2 = cx + rangeR * Math.cos(toRad(right));
  const y2 = cy + rangeR * Math.sin(toRad(right));
  return `M ${cx} ${cy} L ${x1} ${y1} A ${rangeR} ${rangeR} 0 0 1 ${x2} ${y2} Z`;
}

// ── ViolationBadge (dépendance du composant) ─────────────────────────────
export function ViolationBadge({ type }: { type: ViolationType }) {
  const map: Record<ViolationType, { label: string; cls: string }> = {
    "no-vest":             { label: "Pas de gilet",   cls: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
    "no-helmet":           { label: "Pas de casque",  cls: "bg-red-500/15 text-red-400 border border-red-500/30" },
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
export function LocalisationView({ violations, onNav }: { violations: Violation[]; onNav: (v: NavItem) => void }) {
  const mapRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<Violation | null>(null);
  const [hoveredCam, setHoveredCam] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const activeViolations = showAll ? violations : violations.filter(v => !v.acknowledged);

  // SVG viewport size
  const W = 800, H = 520;
  const px = (pct: number) => (pct / 100) * W;
  const py = (pct: number) => (pct / 100) * H;

  // Zones overlay data
  const zones = [
    { label: "Zone A\nEntrée", x: 0,   y: 0,   w: 22, h: 50, fill: "rgba(59,130,246,0.06)"  },
    { label: "Zone B\nAtelier", x: 22, y: 35,  w: 35, h: 40, fill: "rgba(168,85,247,0.06)" },
    { label: "Zone C\nQuai",    x: 57, y: 55,  w: 43, h: 45, fill: "rgba(239,68,68,0.06)"   },
    { label: "Zone D\nContrôle",x: 55, y: 0,   w: 45, h: 40, fill: "rgba(34,197,94,0.06)"   },
    { label: "Zone E\nStockage",x: 0,  y: 60,  w: 30, h: 40, fill: "rgba(234,179,8,0.06)"   },
    { label: "Zone F\nSortie",  x: 40, y: 80,  w: 20, h: 20, fill: "rgba(20,184,166,0.06)"  },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Localisation des infractions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Position estimée par rapport à la caméra de référence (YOLOv8 bbox)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll(v => !v)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${showAll ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {showAll ? "Toutes les infractions" : "Non acquittées uniquement"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Map */}
        <div className="xl:col-span-2 bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Plan du site — Vue de dessus</span>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-400/80 inline-block" />Caméra active</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400/80 inline-block" />Alerte</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Infraction</span>
            </div>
          </div>

          <svg
            ref={mapRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ background: "#0f1219" }}
          >
            {/* Grid */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              </pattern>
              {CAMERAS.map(cam => (
                <radialGradient key={`grad-${cam.id}`} id={`fov-${cam.id}`} cx="0%" cy="0%" r="100%">
                  <stop offset="0%" stopColor={
                    cam.status === "offline" ? "#6b7280" :
                    cam.status === "warning"  ? "#f59e0b" : "#22c55e"
                  } stopOpacity="0.18" />
                  <stop offset="100%" stopColor={
                    cam.status === "offline" ? "#6b7280" :
                    cam.status === "warning"  ? "#f59e0b" : "#22c55e"
                  } stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            <rect width={W} height={H} fill="url(#grid)" />

            {/* Facility outer wall */}
            <rect x="10" y="10" width={W - 20} height={H - 20}
              fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" rx="4" />

            {/* Zone overlays */}
            {zones.map((z, i) => (
              <g key={i}>
                <rect
                  x={px(z.x) + 10} y={py(z.y) + 10}
                  width={px(z.w) - (z.x === 0 ? 5 : 0)} height={py(z.h) - (z.y === 0 ? 5 : 0)}
                  fill={z.fill} stroke="rgba(255,255,255,0.06)" strokeWidth="1" rx="2"
                />
                {z.label.split("\n").map((line, li) => (
                  <text key={li}
                    x={px(z.x + z.w / 2)} y={py(z.y) + 26 + li * 12}
                    textAnchor="middle" fill="rgba(255,255,255,0.25)"
                    fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="600"
                    letterSpacing="0.08em"
                  >{line}</text>
                ))}
              </g>
            ))}

            {/* Camera FOV cones */}
            {CAMERAS.map(cam => {
              const cx = px(cam.mapX), cy = py(cam.mapY);
              const rangeR = (cam.fovRange / 100) * W;
              const path = fovPath(cx, cy, cam.fovAngle, cam.fovDirection, rangeR);
              const isHovered = hoveredCam === cam.id;
              const color = cam.status === "offline" ? "#6b7280" : cam.status === "warning" ? "#f59e0b" : "#22c55e";
              return (
                <g key={cam.id}>
                  <path d={path} fill={`url(#fov-${cam.id})`}
                    stroke={color} strokeWidth={isHovered ? 1.5 : 0.8}
                    strokeOpacity={isHovered ? 0.7 : 0.35}
                    opacity={cam.status === "offline" ? 0.3 : 1}
                  />
                </g>
              );
            })}

            {/* Line from camera to violation */}
            {activeViolations.map(v => {
              const cam = CAMERAS.find(c => c.id === v.camera);
              if (!cam) return null;
              return (
                <line key={`line-${v.id}`}
                  x1={px(cam.mapX)} y1={py(cam.mapY)}
                  x2={px(v.position.mapX)} y2={py(v.position.mapY)}
                  stroke={v.acknowledged ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.6)"}
                  strokeWidth={v.acknowledged ? 0.8 : 1.2}
                  strokeDasharray="4 3"
                />
              );
            })}

            {/* Violation markers */}
            {activeViolations.map(v => {
              const vx = px(v.position.mapX), vy = py(v.position.mapY);
              const isSel = selected?.id === v.id;
              const isNew = !v.acknowledged;
              return (
                <g key={v.id} onClick={() => setSelected(isSel ? null : v)} style={{ cursor: "pointer" }}>
                  {isNew && (
                    <circle cx={vx} cy={vy} r={14} fill="rgba(239,68,68,0.15)">
                      <animate attributeName="r" values="10;16;10" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={vx} cy={vy} r={isSel ? 9 : 7}
                    fill={isNew ? "#ef4444" : "rgba(239,68,68,0.6)"}
                    stroke={isSel ? "#ffffff" : "rgba(239,68,68,0.8)"}
                    strokeWidth={isSel ? 2 : 1}
                  />
                  <text x={vx} y={vy + 1} textAnchor="middle" dominantBaseline="middle"
                    fill="white" fontSize="8" fontWeight="700">!</text>
                  {isSel && (
                    <g>
                      <rect x={vx + 12} y={vy - 20} width={120} height={38} rx="3"
                        fill="#131720" stroke="rgba(239,68,68,0.5)" strokeWidth="1" />
                      <text x={vx + 17} y={vy - 8} fill="#e8eaf0" fontSize="9" fontWeight="600">{v.id}</text>
                      <text x={vx + 17} y={vy + 4} fill="#ef4444" fontSize="8">{v.type.toUpperCase()}</text>
                      <text x={vx + 17} y={vy + 14} fill="#6b7280" fontSize="8">{v.position.distanceM}m · {v.position.angleRel > 0 ? "+" : ""}{v.position.angleRel}°</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Camera markers */}
            {CAMERAS.map(cam => {
              const cx = px(cam.mapX), cy = py(cam.mapY);
              const color = cam.status === "offline" ? "#6b7280" : cam.status === "warning" ? "#f59e0b" : "#22c55e";
              const isHov = hoveredCam === cam.id;
              return (
                <g key={cam.id}
                  onMouseEnter={() => setHoveredCam(cam.id)}
                  onMouseLeave={() => setHoveredCam(null)}
                  style={{ cursor: "default" }}>
                  <circle cx={cx} cy={cy} r={isHov ? 11 : 9}
                    fill="#131720" stroke={color} strokeWidth={isHov ? 2 : 1.5} />
                  {/* camera icon — simple rectangle */}
                  <rect x={cx - 5} y={cy - 3} width={8} height={6} rx="1" fill={color} />
                  <polygon points={`${cx + 3},${cy - 2} ${cx + 7},${cy - 4} ${cx + 7},${cy + 4} ${cx + 3},${cy + 2}`} fill={color} />
                  {cam.status === "offline" && (
                    <line x1={cx - 7} y1={cy - 7} x2={cx + 7} y2={cy + 7}
                      stroke="#6b7280" strokeWidth="1.5" />
                  )}
                  {isHov && (
                    <g>
                      <rect x={cx + 14} y={cy - 18} width={108} height={32} rx="3"
                        fill="#131720" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                      <text x={cx + 19} y={cy - 6} fill="#e8eaf0" fontSize="9" fontWeight="600">{cam.id}</text>
                      <text x={cx + 19} y={cy + 6} fill="#6b7280" fontSize="8">{cam.name}</text>
                    </g>
                  )}
                  <text x={cx} y={cy + 20} textAnchor="middle"
                    fill={color} fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="600" opacity="0.8">
                    {cam.id}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Sidebar panel */}
        <div className="flex flex-col gap-3">
          {/* Legend */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Méthode de localisation
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>Le modèle YOLOv8 retourne la <span className="text-foreground">boîte englobante</span> (bx, by, bw, bh) de chaque personne dans le repère image de la caméra.</p>
              <p>La <span className="text-foreground">distance</span> est estimée via la hauteur de boîte (perspective inverse), et <span className="text-foreground">l'angle</span> via la position horizontale par rapport à l'axe optique.</p>
              <p>La position 2D sur le plan est calculée par <span className="text-foreground">homographie</span> caméra → sol.</p>
            </div>
          </div>

          {/* Violation list */}
          <div className="bg-card border border-border rounded-lg overflow-hidden flex-1">
            <div className="px-4 py-3 border-b border-border">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {activeViolations.length} infraction{activeViolations.length !== 1 ? "s" : ""} localisée{activeViolations.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="overflow-y-auto max-h-80 [scrollbar-width:thin]">
              {activeViolations.map(v => {
                const isSel = selected?.id === v.id;
                return (
                  <button key={v.id} onClick={() => setSelected(isSel ? null : v)}
                    className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${isSel ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-muted/20"}`}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <ViolationBadge type={v.type} />
                      {!v.acknowledged && (
                        <span className="text-[9px] text-accent font-bold uppercase">NEW</span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-foreground mb-1">{v.camera} · {v.zone.split("–")[1]?.trim()}</div>

                    {/* Position info */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2">
                      <div className="flex items-center gap-1.5">
                        <Navigation size={9} className="text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground">
                          <span className="text-foreground font-medium">{v.position.distanceM} m</span> de la caméra
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin size={9} className="text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground">
                          Angle <span className="text-foreground font-medium">{v.position.angleRel > 0 ? "+" : ""}{v.position.angleRel}°</span>
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          Frame : <span className="text-foreground font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            bx={v.position.bx.toFixed(2)} by={v.position.by.toFixed(2)}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      <Clock size={9} />
                      {v.date} {v.time}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected detail */}
          {selected && (
            <div className="bg-card border border-accent/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground">{selected.id}</span>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              </div>
              <img src={selected.imageUrl} alt={selected.id}
                className="w-full h-28 object-cover rounded bg-muted mb-3" />

              {/* Camera-relative position details */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Position relative à {selected.camera}
                </div>
                {[
                  { label: "Distance estimée", value: `${selected.position.distanceM} m` },
                  { label: "Angle horizontal",  value: `${selected.position.angleRel > 0 ? "+" : ""}${selected.position.angleRel}° (${selected.position.angleRel < 0 ? "gauche" : "droite"})` },
                  { label: "Pos. frame horiz.", value: `${(selected.position.bx * 100).toFixed(0)}% (bx=${selected.position.bx.toFixed(2)})` },
                  { label: "Pos. frame vert.",  value: `${(selected.position.by * 100).toFixed(0)}% (by=${selected.position.by.toFixed(2)})` },
                  { label: "Coordonnées plan", value: `X=${selected.position.mapX}%, Y=${selected.position.mapY}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                    <span className="text-[10px] text-foreground font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => onNav("alertes")} className="mt-3 w-full text-xs py-1.5 bg-primary text-primary-foreground rounded font-semibold hover:opacity-90 transition-opacity">
                Voir l'alerte
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LocalisationView;
