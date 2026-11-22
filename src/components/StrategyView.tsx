import React, { useMemo, useState } from "react";
import {
  Bike,
  Calculator,
  Calendar,
  CheckCircle2,
  Compass,
  Droplets,
  Footprints,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";
import type { IntervalsActivity, IntervalsAthlete } from "../types/intervals";
import type { RunningSummary, CriticalPowerModel } from "../utils/analytics";

interface StrategyViewProps {
  athlete: IntervalsAthlete;
  activities: IntervalsActivity[];
  allActivities?: IntervalsActivity[];
  runningSummary: RunningSummary;
  cpModel: CriticalPowerModel;
}

type SportMatchMode = "all_bikes" | "road" | "gravel" | "mtb" | "trainer" | "run";

interface GearComponentItem {
  name: string;
  km: number; // manual base offset before reset or trackingSince
  maxKm: number; // km limit or days limit if kind === 'sealant_days'
  lastResetDate?: string; // YYYY-MM-DD
  kind?: "distance" | "sealant_days";
}

interface GearItem {
  id: string;
  name: string;
  type: "bike" | "shoes";
  sportMatch: SportMatchMode;
  trackingSince?: string; // YYYY-MM-DD
  totalKm: number; // manual base offset
  maxKm: number;
  components: GearComponentItem[];
  active: boolean;
}

const SPORT_MATCH_LABELS: Record<SportMatchMode, string> = {
  all_bikes: "Wszystkie rowery",
  road: "Szosa",
  gravel: "Gravel",
  mtb: "MTB / XC",
  trainer: "Trenażer / Indoor",
  run: "Bieganie",
};

function localTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDefaultTrackingStartIso(): string {
  const now = new Date();
  now.setDate(now.getDate() - 90);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysElapsedSince(fromIso: string, toIso: string): number {
  const start = new Date(`${fromIso}T00:00:00`).getTime();
  const end = new Date(`${toIso}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function matchesGearSport(act: IntervalsActivity, mode: SportMatchMode): boolean {
  const t = (act.type || "").toLowerCase();
  const name = (act.name || "").toLowerCase();
  const isRun = t.includes("run") || t.includes("walk") || t.includes("hike");
  const isBike =
    t.includes("ride") ||
    t.includes("cycling") ||
    t.includes("virtualride") ||
    t.includes("gravel") ||
    t.includes("mountainbike") ||
    t.includes("mtb");

  if (mode === "run") return isRun;
  if (!isBike) return false;
  if (mode === "all_bikes") return true;
  if (mode === "trainer") {
    return Boolean(act.trainer) || t.includes("virtual");
  }
  if (mode === "gravel") {
    return t.includes("gravel") || name.includes("gravel") || name.includes("szutr");
  }
  if (mode === "mtb") {
    return (
      t.includes("mountain") ||
      t.includes("mtb") ||
      name.includes("mtb") ||
      name.includes("xc") ||
      name.includes("trail")
    );
  }
  // mode === "road"
  const isGravelOrMtb =
    t.includes("gravel") ||
    t.includes("mountain") ||
    t.includes("mtb") ||
    name.includes("gravel") ||
    name.includes("mtb");
  return !isGravelOrMtb;
}

function computeSyncedGearKm(
  activitiesList: IntervalsActivity[],
  mode: SportMatchMode,
  sinceDate?: string
): { km: number; count: number } {
  const threshold = sinceDate || "1970-01-01";
  let meters = 0;
  let count = 0;
  for (const act of activitiesList) {
    if (!matchesGearSport(act, mode)) continue;
    const actDay = (act.start_date_local || "").slice(0, 10);
    if (actDay && actDay < threshold) continue;
    meters += Math.max(0, act.distance || 0);
    count += 1;
  }
  return {
    km: Math.round(meters / 1000),
    count,
  };
}

const DEFAULT_SINCE = getDefaultTrackingStartIso();

const DEFAULT_GEAR: GearItem[] = [
  {
    id: "g1",
    name: "Canyon Aeroad CFR (Szosowy)",
    type: "bike",
    sportMatch: "road",
    trackingSince: DEFAULT_SINCE,
    totalKm: 3420,
    maxKm: 12000,
    components: [
      { name: "Łańcuch Shimano Dura-Ace", km: 1250, maxKm: 3000, lastResetDate: DEFAULT_SINCE },
      { name: "Opony Continental GP 5000 S TR", km: 1250, maxKm: 4500, lastResetDate: DEFAULT_SINCE },
      { name: "Klocki hamulcowe SwissStop", km: 3420, maxKm: 6000, lastResetDate: DEFAULT_SINCE },
      { name: "Mleko uszczelniające Tubeless", km: 0, maxKm: 90, lastResetDate: DEFAULT_SINCE, kind: "sealant_days" },
    ],
    active: true,
  },
  {
    id: "g2",
    name: "Trek Supercaliber (MTB / XC)",
    type: "bike",
    sportMatch: "mtb",
    trackingSince: DEFAULT_SINCE,
    totalKm: 1850,
    maxKm: 10000,
    components: [
      { name: "Łańcuch SRAM XX1 Eagle", km: 1850, maxKm: 2500, lastResetDate: DEFAULT_SINCE },
      { name: "Opony Maxxis Aspen", km: 1850, maxKm: 3500, lastResetDate: DEFAULT_SINCE },
      { name: "Uszczelnienie amortyzatora", km: 1850, maxKm: 2000, lastResetDate: DEFAULT_SINCE },
      { name: "Mleko Tubeless (XC)", km: 0, maxKm: 90, lastResetDate: DEFAULT_SINCE, kind: "sealant_days" },
    ],
    active: true,
  },
  {
    id: "g3",
    name: "Nike Vaporfly 3 (Startowe)",
    type: "shoes",
    sportMatch: "run",
    trackingSince: DEFAULT_SINCE,
    totalKm: 310,
    maxKm: 600,
    components: [],
    active: true,
  },
];

const GEAR_STORAGE_V2 = "darierpro_gear_v2";
const GEAR_STORAGE_V1 = "darierpro_gear_v1";

function loadInitialGear(): GearItem[] {
  try {
    const v2 = localStorage.getItem(GEAR_STORAGE_V2);
    if (v2) {
      const parsed = JSON.parse(v2) as GearItem[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    const v1 = localStorage.getItem(GEAR_STORAGE_V1);
    if (v1) {
      const legacy = JSON.parse(v1) as Array<Partial<GearItem>>;
      if (Array.isArray(legacy) && legacy.length > 0) {
        return legacy.map((item) => ({
          id: item.id || `g_${Date.now()}`,
          name: item.name || "Sprzęt",
          type: item.type === "shoes" ? "shoes" : "bike",
          sportMatch:
            item.type === "shoes"
              ? "run"
              : (item.name || "").toLowerCase().includes("mtb")
                ? "mtb"
                : (item.name || "").toLowerCase().includes("gravel")
                  ? "gravel"
                  : "road",
          trackingSince: item.trackingSince || DEFAULT_SINCE,
          totalKm: item.totalKm ?? 0,
          maxKm: item.maxKm ?? 8000,
          components: Array.isArray(item.components) ? item.components : [],
          active: item.active ?? true,
        }));
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_GEAR;
}

const RACK_DISTANCES = [
  { label: "Jazda Ind. na Czas TT", sub: "40 km", km: 40, type: "bike" as const },
  { label: "Gran Fondo / Szosa", sub: "160 km", km: 160, type: "bike" as const },
  { label: "Kryterium Szosowe", sub: "60 km", km: 60, type: "bike" as const },
  { label: "Półmaraton", sub: "21.1 km", km: 21.097, type: "run" as const },
  { label: "Maraton", sub: "42.2 km", km: 42.195, type: "run" as const },
  { label: "Bieg 10 km", sub: "10 km", km: 10, type: "run" as const },
];

export const StrategyView: React.FC<StrategyViewProps> = ({
  activities,
  allActivities,
  runningSummary,
  cpModel,
}) => {
  const sourceActivities = useMemo(
    () => (allActivities && allActivities.length > 0 ? allActivities : activities),
    [allActivities, activities]
  );
  const todayIso = useMemo(() => localTodayIso(), []);

  const [selectedRaceKm, setSelectedRaceKm] = useState<number>(40);
  const [targetStrategy, setTargetStrategy] = useState<"steady" | "negative" | "positive">("negative");

  const [gearList, setGearList] = useState<GearItem[]>(() => loadInitialGear());

  const [newGearName, setNewGearName] = useState("");
  const [newGearType, setNewGearType] = useState<"bike" | "shoes">("bike");
  const [newGearSportMatch, setNewGearSportMatch] = useState<SportMatchMode>("road");
  const [newGearMaxKm, setNewGearMaxKm] = useState(8000);

  const saveGear = (updated: GearItem[]) => {
    setGearList(updated);
    try {
      localStorage.setItem(GEAR_STORAGE_V2, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleAddGear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGearName.trim()) return;
    const today = localTodayIso();
    const item: GearItem = {
      id: "g_" + Date.now(),
      name: newGearName.trim(),
      type: newGearType,
      sportMatch: newGearType === "shoes" ? "run" : newGearSportMatch,
      trackingSince: today,
      totalKm: 0,
      maxKm: newGearMaxKm,
      components:
        newGearType === "bike"
          ? [
              { name: "Łańcuch napędowy", km: 0, maxKm: 3000, lastResetDate: today },
              { name: "Opony", km: 0, maxKm: 4500, lastResetDate: today },
              { name: "Klocki hamulcowe", km: 0, maxKm: 5000, lastResetDate: today },
              { name: "Mleko Tubeless", km: 0, maxKm: 90, lastResetDate: today, kind: "sealant_days" },
            ]
          : [],
      active: true,
    };
    saveGear([...gearList, item]);
    setNewGearName("");
  };

  const handleDeleteGear = (id: string) => {
    saveGear(gearList.filter((g) => g.id !== id));
  };

  const handleResetComponent = (gearId: string, compIdx: number) => {
    const today = localTodayIso();
    const updated = gearList.map((item) => {
      if (item.id !== gearId) return item;
      return {
        ...item,
        components: item.components.map((c, idx) =>
          idx === compIdx ? { ...c, km: 0, lastResetDate: today } : c
        ),
      };
    });
    saveGear(updated);
  };

  const currentDistObj = RACK_DISTANCES.find((d) => d.km === selectedRaceKm) || RACK_DISTANCES[0];
  const isBike = currentDistObj.type === "bike";

  // Compute prediction for selected race distance
  const predictedTimeSecs = React.useMemo(() => {
    if (isBike) {
      // Estimate based on Critical Power / FTP
      const cp = cpModel.cpWatts || 200;
      // Flat TT speed model approximation: Speed (km/h) ~ 1.8 * (Power^0.35) for aero road/TT position
      const estimatedSpeedKmh = Math.max(26, Math.min(48, 1.95 * Math.pow(cp, 0.345)));
      // Adjust slightly for distance fatigue
      const fatigueFactor = selectedRaceKm > 100 ? 0.90 : selectedRaceKm > 50 ? 0.95 : 1.0;
      const finalSpeedKmh = estimatedSpeedKmh * fatigueFactor;
      return (selectedRaceKm / finalSpeedKmh) * 3600;
    }

    // Running distance Riegel prediction
    const base = runningSummary.racePredictions.find(
      (p) => Math.abs(p.distanceKm - selectedRaceKm) < 0.5
    );
    if (base) return base.predictedSecs;

    const ref =
      runningSummary.racePredictions.find((p) => p.distanceKm === 10) ||
      runningSummary.racePredictions[0];
    if (!ref) return selectedRaceKm * 300; // default 5 min/km

    return ref.predictedSecs * Math.pow(selectedRaceKm / ref.distanceKm, 1.06);
  }, [selectedRaceKm, isBike, cpModel.cpWatts, runningSummary.racePredictions]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.round(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
    }
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Generate split schedule
  const splits = React.useMemo(() => {
    const stepKm = selectedRaceKm > 80 ? 10 : selectedRaceKm > 30 ? 5 : 1;
    const totalSteps = Math.ceil(selectedRaceKm / stepKm);
    const result: {
      stepLabel: string;
      speedOrPace: string;
      cumulativeTime: string;
      watts: string;
      nutrition: string;
    }[] = [];

    const totalHours = predictedTimeSecs / 3600;
    const avgKmh = selectedRaceKm / totalHours;
    const avgSecsPerKm = predictedTimeSecs / selectedRaceKm;
    const cp = cpModel.cpWatts || 200;

    for (let i = 1; i <= totalSteps; i++) {
      const currentKm = Math.min(i * stepKm, Math.round(selectedRaceKm));
      let multiplier = 1;

      if (targetStrategy === "negative") {
        const progress = i / totalSteps;
        multiplier = 1.03 - progress * 0.06; // starts 3% conservative, finishes 3% faster
      } else if (targetStrategy === "positive") {
        const progress = i / totalSteps;
        multiplier = 0.97 + progress * 0.06;
      }

      let speedOrPace = "";
      let targetWatts = "";
      if (isBike) {
        const segSpeed = avgKmh / multiplier;
        speedOrPace = `${segSpeed.toFixed(1)} km/h`;
        const segWatts = Math.round((cp * 0.92) / multiplier);
        targetWatts = `${segWatts} W`;
      } else {
        const kmSecs = avgSecsPerKm * multiplier;
        const m = Math.floor(kmSecs / 60);
        const s = Math.round(kmSecs % 60);
        speedOrPace = `${m}:${s < 10 ? "0" : ""}${s} /km`;
        targetWatts = "—";
      }

      const cumulativeSecs = (currentKm / selectedRaceKm) * predictedTimeSecs;

      let nutrition = "";
      if (isBike) {
        if (currentKm % 20 === 0) nutrition = "60-80g węglowodanów + 500ml bidon";
        else if (currentKm % 40 === 0) nutrition = "Żel kofeinowy + elektrolity";
      } else {
        if (selectedRaceKm >= 21 && currentKm % 5 === 0) nutrition = "Żel energetyczny + woda";
        else if (selectedRaceKm >= 10 && currentKm === 5) nutrition = "Elektrolity";
      }

      result.push({
        stepLabel: `${currentKm} km`,
        speedOrPace,
        cumulativeTime: formatTime(cumulativeSecs),
        watts: targetWatts,
        nutrition: nutrition || "Nawadnianie regularne",
      });
    }

    return result;
  }, [selectedRaceKm, predictedTimeSecs, targetStrategy, isBike, cpModel.cpWatts]);

  const avgSpeedKmh = (selectedRaceKm / (predictedTimeSecs / 3600)).toFixed(1);
  const avgPaceMinKm = formatTime(predictedTimeSecs / selectedRaceKm);

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Aerodynamic Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-[#1f0b18] to-slate-900 p-6 sm:p-8 text-white shadow-2xl border border-rose-500/20">
        <div className="absolute -right-16 -top-16 h-80 w-80 rounded-full bg-rose-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-80 w-80 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-rose-300 backdrop-blur-md border border-rose-500/30">
              <Compass className="h-3.5 w-3.5 text-rose-400" />
              <span>Pro Cycling Pacing & Gear Management</span>
            </div>
            <h1 className="mt-3 font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
              Kalkulator Startowy & Zarządzanie Sprzętem
            </h1>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Wylicz optymalny pacing oparty na Twoim <strong>Critical Power ({cpModel.cpWatts ? `${Math.round(cpModel.cpWatts)}W` : "FTP"})</strong> i profilu aerodynamicznym. Kontroluj zużycie łańcucha, opon i klocków w swoich rowerach.
            </p>
          </div>

          {/* Quick HUD Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/[0.07] backdrop-blur-xl p-4 border border-white/10 shadow-lg text-center">
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-rose-300 uppercase tracking-wider">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span>CP / FTP</span>
              </div>
              <div className="mt-1 font-mono text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums">
                {cpModel.cpWatts ? `${Math.round(cpModel.cpWatts)} W` : "202 W"}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Próg wydolności</div>
            </div>

            <div className="rounded-2xl bg-white/[0.07] backdrop-blur-xl p-4 border border-white/10 shadow-lg text-center">
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-rose-300 uppercase tracking-wider">
                <Bike className="h-3.5 w-3.5 text-sky-400" />
                <span>Sprzęt</span>
              </div>
              <div className="mt-1 font-mono text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums">
                {gearList.filter((g) => g.active).length} szt.
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Aktywny resurs</div>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-2xl bg-white/[0.07] backdrop-blur-xl p-4 border border-white/10 shadow-lg text-center">
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-rose-300 uppercase tracking-wider">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                <span>Taktyka</span>
              </div>
              <div className="mt-1 font-mono text-xl sm:text-2xl font-bold text-white tracking-tight">
                {targetStrategy === "negative"
                  ? "Negative"
                  : targetStrategy === "steady"
                  ? "Steady"
                  : "Positive"}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Strategia tempa</div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Race Predictor & Pacing Strategy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800/80 dark:bg-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calculator className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                <span>Symulator Zawodów & Strategia Międzyczasów</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Wybierz docelowy dystans kolarski lub biegowy i dobierz optymalne tempo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Strategia tempa"
                value={targetStrategy}
                onChange={(e) =>
                  setTargetStrategy(e.target.value as "steady" | "negative" | "positive")
                }
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="negative">Negative Split (Mocny finisz)</option>
                <option value="steady">Steady Pace (Równe waty)</option>
                <option value="positive">Positive Split (Mocny start)</option>
              </select>
            </div>
          </div>

          {/* Distance buttons */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {RACK_DISTANCES.map((d) => (
              <button
                key={d.km}
                type="button"
                onClick={() => setSelectedRaceKm(d.km)}
                className={`flex items-start justify-between rounded-xl border p-3.5 text-left transition-all ${
                  selectedRaceKm === d.km
                    ? "border-rose-600 bg-rose-50/70 shadow-xs ring-1 ring-rose-500/30 dark:border-rose-500 dark:bg-rose-950/40"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {d.type === "bike" ? (
                      <Bike className="h-3.5 w-3.5 text-rose-500" />
                    ) : (
                      <Footprints className="h-3.5 w-3.5 text-indigo-500" />
                    )}
                    <span>{d.type === "bike" ? "Kolarstwo" : "Bieg"}</span>
                  </div>
                  <div className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
                    {d.label}
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  {d.sub}
                </span>
              </button>
            ))}
          </div>

          {/* Prediction Card */}
          <div className="mt-6 rounded-2xl bg-gradient-to-r from-rose-500/10 via-pink-500/5 to-transparent p-6 border border-rose-500/20 dark:from-rose-950/40 dark:via-pink-950/20 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                <Sparkles className="h-4 w-4" />
                <span>Prognozowany Czas Mety ({selectedRaceKm} km)</span>
              </div>
              <div className="mt-1 font-mono text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                {formatTime(predictedTimeSecs)}
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                {isBike ? (
                  <>
                    <span>Średnia prędkość: <strong className="font-mono text-slate-900 dark:text-white">{avgSpeedKmh} km/h</strong></span>
                    <span>Średnia moc: <strong className="font-mono text-slate-900 dark:text-white">{Math.round((cpModel.cpWatts || 200) * 0.92)} W</strong></span>
                  </>
                ) : (
                  <span>Średnie tempo: <strong className="font-mono text-slate-900 dark:text-white">{avgPaceMinKm} /km</strong></span>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-white/80 dark:bg-slate-800/80 p-4 border border-slate-200/60 dark:border-slate-700/60 sm:max-w-xs shadow-xs">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                <span>Zalecenie taktyczne trenera</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {targetStrategy === "negative"
                  ? "Rozpocznij z rezerwą (ok. 95% FTP). Po minięciu połowy trasy zwiększ moc do 102% progu. Pozwoli to uniknąć zakwaszenia i zyskać najwięcej czasu."
                  : "Trzymaj stałe waty. Pilnuj kadencji 85-95 rpm na płaskim i unikaj gwałtownych zrywów powyżej strefy Z5."}
              </p>
            </div>
          </div>

          {/* Splits Table */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Tabela Międzyczasów & Plan Odżywiania
              </h3>
              <span className="text-[11px] text-slate-400">
                {isBike ? "Odcinki co 5-10 km" : "Odcinki co 1 km"}
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 no-scrollbar">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3 font-semibold">Dystans</th>
                    <th className="p-3 font-semibold">{isBike ? "Prędkość" : "Tempo"}</th>
                    {isBike && <th className="p-3 font-semibold">Moc docelowa</th>}
                    <th className="p-3 font-semibold">Czas łączny</th>
                    <th className="p-3 font-semibold">Żywienie / Bidon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {splits.map((s, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        {s.stepLabel}
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">
                        {s.speedOrPace}
                      </td>
                      {isBike && (
                        <td className="p-3 text-amber-600 dark:text-amber-400 font-semibold">
                          {s.watts}
                        </td>
                      )}
                      <td className="p-3 text-slate-700 dark:text-slate-300">
                        {s.cumulativeTime}
                      </td>
                      <td className="p-3 text-rose-600 dark:text-rose-400 font-sans font-medium">
                        {s.nutrition}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Macrocycle & Periodization */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800/80 dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                <span>Makrocykl i Faza</span>
              </h2>
              <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-500/20">
                Faza: Budowanie (Build)
              </span>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Tydzień 3 z 4 (Cykl Progresywny)</span>
                  <span className="text-rose-600 dark:text-rose-400">Obciążenie wysokie</span>
                </div>
                <div className="mt-2 h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-rose-500 to-pink-600 rounded-full" style={{ width: "75%" }} />
                </div>
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Trwa kluczowy blok adaptacji podwyższonej mocy progowej (Sweet Spot & Threshold). W przyszłym tygodniu zaplanowano lżejszy tydzień regeneracyjny (Recovery).
                </p>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Priorytety Sezonu Kolarskiego
                </div>
                {[
                  { name: "Wyścig Szosowy / Gran Fondo", date: "Czerwiec 2026", status: "Docelowy A" },
                  { name: "Półmaraton Kontrolny", date: "Kwiecień 2026", status: "Start B" },
                ].map((g, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3.5 dark:border-slate-800 bg-white dark:bg-slate-900"
                  >
                    <div>
                      <div className="font-display text-xs font-bold text-slate-900 dark:text-white">{g.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{g.date}</div>
                    </div>
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                      {g.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-rose-500 shrink-0" />
            <span>Regularne testy 20-min lub Ramp Test co 6 tygodni zapewniają precyzyjne strefy mocy.</span>
          </div>
        </div>
      </div>

      {/* Gear & Component Wear Tracker */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-xs dark:border-slate-800/80 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 dark:border-slate-800">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              <span>Zarządzanie Flotą Rowerową & Resursem Części (Gear Tracker)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Automatyczne zliczanie przebiegu z Intervals.icu według dyscypliny + ręczny reset po wymianie części i licznik dni mleka Tubeless.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Auto-sync z {sourceActivities.length} aktywności Intervals.icu</span>
          </div>
        </div>

        {/* Add Gear Form */}
        <form onSubmit={handleAddGear} className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nazwa sprzętu</label>
            <input
              type="text"
              placeholder="np. Gravel / Rower Szosowy"
              value={newGearName}
              onChange={(e) => setNewGearName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Typ</label>
            <select
              value={newGearType}
              onChange={(e) => {
                const nextType = e.target.value as "bike" | "shoes";
                setNewGearType(nextType);
                if (nextType === "shoes") setNewGearSportMatch("run");
                else if (newGearSportMatch === "run") setNewGearSportMatch("road");
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
            >
              <option value="bike">Rower</option>
              <option value="shoes">Buty</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Auto-sync Intervals.icu</label>
            <select
              value={newGearType === "shoes" ? "run" : newGearSportMatch}
              disabled={newGearType === "shoes"}
              onChange={(e) => setNewGearSportMatch(e.target.value as SportMatchMode)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-rose-500 disabled:opacity-60"
            >
              <option value="road">Szosa</option>
              <option value="gravel">Gravel</option>
              <option value="mtb">MTB / XC</option>
              <option value="trainer">Trenażer / Indoor</option>
              <option value="all_bikes">Wszystkie rowery</option>
              <option value="run">Bieganie</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Resurs całkowity (km)</label>
            <input
              type="number"
              value={newGearMaxKm}
              onChange={(e) => setNewGearMaxKm(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-2 text-xs font-semibold text-white hover:from-rose-500 hover:to-pink-500 shadow-sm transition-all active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span>Dodaj sprzęt</span>
            </button>
          </div>
        </form>

        {/* Gear Items List */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gearList.map((item) => {
            const gearSync = computeSyncedGearKm(
              sourceActivities,
              item.sportMatch,
              item.trackingSince
            );
            const liveTotalKm = item.totalKm + gearSync.km;
            const wearPct = Math.min(100, Math.round((liveTotalKm / Math.max(1, item.maxKm)) * 100));
            const hasCriticalComp = item.components.some((c) => {
              if (c.kind === "sealant_days") {
                const days = daysElapsedSince(c.lastResetDate || item.trackingSince || todayIso, todayIso);
                return days >= c.maxKm * 0.85;
              }
              const cs = computeSyncedGearKm(
                sourceActivities,
                item.sportMatch,
                c.lastResetDate || item.trackingSince
              );
              return (c.km + cs.km) / Math.max(1, c.maxKm) >= 0.85;
            });
            const isWarning = wearPct >= 80 || hasCriticalComp;

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800/80 dark:bg-slate-900 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`rounded-xl p-2.5 ${item.type === "bike" ? "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" : "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"}`}>
                        {item.type === "bike" ? <Bike className="h-5 w-5" /> : <Footprints className="h-5 w-5" />}
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">{item.name}</h3>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {SPORT_MATCH_LABELS[item.sportMatch]}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteGear(item.id)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Auto-sync badge */}
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-2.5 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>+{gearSync.km.toLocaleString()} km z Intervals.icu</span>
                    </span>
                    <span className="font-mono font-bold tabular-nums">{gearSync.count} akt.</span>
                  </div>

                  {/* Total distance & progress */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Przebieg całkowity</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        {liveTotalKm.toLocaleString()} / {item.maxKm.toLocaleString()} km
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${wearPct >= 80 ? "bg-amber-500" : "bg-gradient-to-r from-rose-500 to-pink-600"}`}
                        style={{ width: `${wearPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Components sublist */}
                  {item.components.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Komponenty napędu i serwis
                      </div>
                      {item.components.map((c, idx) => {
                        const isSealant = c.kind === "sealant_days";
                        const sealantDays = isSealant
                          ? daysElapsedSince(c.lastResetDate || item.trackingSince || todayIso, todayIso)
                          : 0;
                        const compSync = !isSealant
                          ? computeSyncedGearKm(
                              sourceActivities,
                              item.sportMatch,
                              c.lastResetDate || item.trackingSince
                            )
                          : { km: 0, count: 0 };
                        const currentVal = isSealant ? sealantDays : c.km + compSync.km;
                        const compPct = Math.min(100, Math.round((currentVal / Math.max(1, c.maxKm)) * 100));
                        const unitLabel = isSealant ? `dni / ${c.maxKm} d` : `km`;

                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1 truncate">
                                {isSealant && <Droplets className="h-3 w-3 text-cyan-500 shrink-0" />}
                                <span className="truncate">{c.name}</span>
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`font-mono text-[11px] font-semibold tabular-nums ${compPct >= 80 ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"}`}>
                                  {currentVal} {unitLabel} ({compPct}%)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleResetComponent(item.id, idx)}
                                  title="Resetuj licznik po wymianie / dolaniu"
                                  className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />
                                  <span>Resetuj</span>
                                </button>
                              </div>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  compPct >= 80
                                    ? "bg-amber-500"
                                    : isSealant
                                      ? "bg-cyan-500"
                                      : "bg-rose-500"
                                }`}
                                style={{ width: `${compPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {isWarning && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300 border border-amber-500/20">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Zalecana kontrola zużycia części lub dolanie mleka Tubeless!</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
