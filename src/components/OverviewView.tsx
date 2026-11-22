import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  Maximize2,
  Printer,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { MetricDetailModal, type MetricType } from "./MetricDetailModal";
import type {
  AutomatedInsight,
  IntervalsActivity,
  IntervalsWellnessDay,
  PmcPoint,
  SportBreakdownItem,
  TrainingGoals,
  WeeklyVolumePoint,
} from "../types/intervals";
import {
  computeTaperSimulation,
  formatDateFullPl,
  formatDuration,
  formatPace,
  getFormZoneInfo,
  sportLabelPl,
  type DailyHeatmapCell,
  type IntensityScatterPoint,
} from "../utils/analytics";
import {
  ActivityHeatmapChart,
  IntensityScatterChart,
  MiniSparkline,
  PmcChart,
  SportDonutChart,
  TaperSimulationChart,
  WeeklyLoadChart,
  WellnessTrendChart,
} from "./Charts";

const GOALS_STORAGE_KEY = "cadencelab_goals";

const DEFAULT_GOALS: TrainingGoals = {
  weeklyHours: 8,
  weeklyTss: 450,
  weeklyKm: 180,
  targetCtl: 70,
};

interface OverviewViewProps {
  activities: IntervalsActivity[];
  pmc: PmcPoint[];
  weekly: WeeklyVolumePoint[];
  sportBreakdown: SportBreakdownItem[];
  insights: AutomatedInsight[];
  wellness: IntervalsWellnessDay[];
  heatmapCells: DailyHeatmapCell[];
  intensityScatter: IntensityScatterPoint[];
  onSelectActivity: (activity: IntervalsActivity) => void;
  onNavigateTab: (tab: "activities" | "zones" | "ai") => void;
}

interface CircularGaugeItemProps {
  value: string;
  subvalue: string;
  label: string;
  color: string;
  fraction: number;
  hasCenterTick?: boolean;
  onClick: () => void;
}

const CircularGaugeItem: React.FC<CircularGaugeItemProps> = ({
  value,
  subvalue,
  label,
  color,
  fraction,
  hasCenterTick,
  onClick,
}) => {
  const strokeWidth = 8;
  const maxArc = 159.2;
  const clamped = Math.max(0.04, Math.min(0.96, fraction));
  const offset = maxArc * (1 - clamped);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all cursor-pointer group text-center w-full"
    >
      <div className="relative w-28 h-24 sm:w-32 sm:h-28 flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
          {/* Background track (240 deg arc) */}
          <path
            d="M 17.1 69 A 38 38 0 1 1 82.9 69"
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="dark:stroke-slate-800"
          />

          {/* Value progress arc */}
          <path
            d="M 17.1 69 A 38 38 0 1 1 82.9 69"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray="159.2 159.2"
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700 filter drop-shadow(0 2px 6px rgba(0,0,0,0.2))"
          />

          {/* Top center tick mark (as in screenshot) */}
          {hasCenterTick && (
            <line
              x1="50"
              y1="6"
              x2="50"
              y2="14"
              stroke="#64748B"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="dark:stroke-slate-400"
            />
          )}

          {/* Big Bold Number */}
          <text
            x="50"
            y="48"
            textAnchor="middle"
            className="fill-slate-900 dark:fill-white font-sans font-black text-[22px] tracking-tight pointer-events-none"
          >
            {value}
          </text>

          {/* Subtitle below number (/100, TSB, 7:28) */}
          <text
            x="50"
            y="62"
            textAnchor="middle"
            className="fill-slate-500 dark:fill-slate-400 font-sans font-semibold text-[10px] tracking-wider pointer-events-none"
          >
            {subvalue}
          </text>
        </svg>
      </div>

      {/* Label below gauge */}
      <span className="mt-1 font-display text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {label}
      </span>
    </button>
  );
};

function defaultRaceDateISO(): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + 21);
  return dt.toISOString().slice(0, 10);
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  activities,
  pmc,
  weekly,
  sportBreakdown,
  insights,
  wellness,
  heatmapCells,
  intensityScatter,
  onSelectActivity,
  onNavigateTab,
}) => {
  const [pmcMode, setPmcMode] = useState<"history" | "taper">("history");
  const [goals, setGoals] = useState<TrainingGoals>(() => {
    try {
      const raw = localStorage.getItem(GOALS_STORAGE_KEY);
      return raw ? { ...DEFAULT_GOALS, ...JSON.parse(raw) } : DEFAULT_GOALS;
    } catch {
      return DEFAULT_GOALS;
    }
  });
  const [editingGoals, setEditingGoals] = useState(false);
  const [activeDetailMetric, setActiveDetailMetric] = useState<MetricType | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
    } catch {
      // Ignore storage failures
    }
  }, [goals]);

  const avgWeeklyTss = useMemo(() => {
    const last4 = weekly.slice(-4);
    if (last4.length === 0) return 350;
    return Math.max(
      100,
      Math.round(last4.reduce((s, w) => s + w.tss, 0) / last4.length)
    );
  }, [weekly]);

  const [raceDate, setRaceDate] = useState<string>(defaultRaceDateISO);
  const [plannedWeeklyTss, setPlannedWeeklyTss] = useState<number>(avgWeeklyTss);
  const [taperPct, setTaperPct] = useState<number>(50);

  const taperSim = useMemo(
    () =>
      computeTaperSimulation(pmc, raceDate, plannedWeeklyTss, taperPct),
    [pmc, raceDate, plannedWeeklyTss, taperPct]
  );

  const latestPmc = pmc[pmc.length - 1] || {
    ctl: 0,
    atl: 0,
    tsb: 0,
    tss: 0,
    rampRate: 0,
    date: "",
  };

  const formInfo = getFormZoneInfo(latestPmc.tsb);

  const readinessScore = useMemo(() => {
    const latestW = wellness[wellness.length - 1];
    if (latestW?.hrv) {
      return Math.max(15, Math.min(99, Math.round(latestW.hrv * 1.1 + (latestW.sleepSecs ? (latestW.sleepSecs / 3600) * 4 : 20))));
    }
    const score = 50 + latestPmc.tsb * 1.2 - Math.max(0, latestPmc.atl - latestPmc.ctl) * 0.4;
    return Math.max(15, Math.min(98, Math.round(score)));
  }, [wellness, latestPmc]);

  const acwrValue = useMemo(() => {
    return latestPmc.ctl > 5 ? Number((latestPmc.atl / latestPmc.ctl).toFixed(2)) : 0.96;
  }, [latestPmc]);

  const last7DaysCutoff = new Date();
  last7DaysCutoff.setDate(last7DaysCutoff.getDate() - 7);
  const last7Acts = activities.filter(
    (a) => new Date(`${a.start_date_local.slice(0, 10)}T12:00:00`) >= last7DaysCutoff
  );
  const last7Tss = Math.round(
    last7Acts.reduce((s, a) => s + (Number(a.icu_training_load) || 0), 0)
  );
  const last7Secs = last7Acts.reduce((s, a) => s + (Number(a.moving_time) || 0), 0);
  const last7Hours = Number((last7Secs / 3600).toFixed(1));
  const last7Km = Math.round(
    last7Acts.reduce((s, a) => s + (Number(a.distance) || 0) / 1000, 0)
  );

  const pmc30 = pmc.slice(-30);
  const ctlSpark = pmc30.map((p) => p.ctl);
  const atlSpark = pmc30.map((p) => p.atl);
  const tsbSpark = pmc30.map((p) => p.tsb);
  const tssLast7 = pmc.slice(-7);
  const maxDailyTss7 = Math.max(40, ...tssLast7.map((d) => d.tss));

  const hasWellnessTrend =
    wellness.filter((w) => w.restingHR || w.hrv || w.sleepSecs).length >= 3;

  const formToneClass =
    formInfo.tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : formInfo.tone === "blue"
      ? "text-blue-700 dark:text-blue-400"
      : formInfo.tone === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : "text-rose-700 dark:text-rose-400";

  return (
    <div className="space-y-6">
      {/* 3 Circular Arc Gauges Card (MATCHING IMAGE 1: Gotowość / Forma TSB / ACWR 7:28) */}
      <section
        aria-label="Podsumowanie formy i wskaźniki gotowości"
        className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="font-display text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>Wskaźniki Formy i Gotowości</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                Dotknij zegara
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dotknij dowolnego wskaźnika, aby otworzyć szczegółowy wykres ze strefami (świeżość/optymalnie/zmęczenie) oraz historię dni.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 sm:gap-4 divide-x divide-slate-100 dark:divide-slate-800">
          {/* Gotowość */}
          <CircularGaugeItem
            value={`${readinessScore}`}
            subvalue="/100"
            label="Gotowość"
            color="#D97706"
            fraction={readinessScore / 100}
            onClick={() => setActiveDetailMetric("readiness")}
          />

          {/* Forma (TSB) */}
          <CircularGaugeItem
            value={latestPmc.tsb > 0 ? `+${Math.round(latestPmc.tsb)}` : `${Math.round(latestPmc.tsb)}`}
            subvalue="TSB"
            label="Forma (TSB)"
            color="#3B82F6"
            hasCenterTick={true}
            fraction={(latestPmc.tsb + 30) / 60}
            onClick={() => setActiveDetailMetric("tsb")}
          />

          {/* ACWR (7:28) */}
          <CircularGaugeItem
            value={`${acwrValue.toFixed(2)}`}
            subvalue="7:28"
            label="ACWR (7:28)"
            color="#059669"
            hasCenterTick={true}
            fraction={(acwrValue - 0.4) / 1.4}
            onClick={() => setActiveDetailMetric("acwr")}
          />
        </div>
      </section>

      {/* Secondary 3-column KPI strip (CTL, ATL, Ostatnie 7 dni) */}
      <section
        aria-label="Kluczowe wskaźniki obciążenia"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            CTL · Forma (Fitness)
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-3xl font-black tracking-tight text-slate-900 tabular-nums dark:text-white">
              {latestPmc.ctl.toFixed(1)}
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {latestPmc.rampRate >= 0
                ? `+${latestPmc.rampRate.toFixed(1)}`
                : latestPmc.rampRate.toFixed(1)}{" "}
              / tydz.
            </span>
          </div>
          <div className="mt-3">
            <MiniSparkline values={ctlSpark} color="#2563EB" id="ctl" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            ATL · Zmęczenie (Fatigue)
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-3xl font-black tracking-tight text-slate-900 tabular-nums dark:text-white">
              {latestPmc.atl.toFixed(1)}
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-orange-600 dark:text-orange-400">
              ACWR {acwrValue.toFixed(2)}
            </span>
          </div>
          <div className="mt-3">
            <MiniSparkline values={atlSpark} color="#F97316" id="atl" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Ostatnie 7 dni
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-3xl font-black tracking-tight text-slate-900 tabular-nums dark:text-white">
              {last7Tss}{" "}
              <span className="text-base font-normal text-slate-500 dark:text-slate-400">
                TSS
              </span>
            </span>
            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
              {formatDuration(last7Secs)} · {last7Acts.length} tren.
            </span>
          </div>
          <div className="mt-3 flex h-8 items-end gap-1.5">
            {tssLast7.map((d) => {
              const hPct =
                d.tss > 0 ? Math.max(14, (d.tss / maxDailyTss7) * 100) : 8;
              return (
                <div
                  key={d.date}
                  style={{ height: `${hPct}%` }}
                  title={`${formatDateFullPl(d.date)}: ${d.tss} TSS`}
                  className={`flex-1 rounded-t-xs ${
                    d.tss > 0
                      ? "bg-indigo-500 dark:bg-indigo-400"
                      : "bg-slate-200 dark:bg-slate-800"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* Weekly & CTL Goals Tracker + Print PDF Export */}
      <section className="rounded-xl border border-blue-200/70 bg-white p-5 dark:border-blue-900/40 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Cele treningowe (ostatnie 7 dni i cel CTL)
              </h2>
            </div>
          </div>

          <div className="no-print flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditingGoals((e) => !e)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{editingGoals ? "Gotowe" : "Edytuj cele"}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Drukuj / PDF</span>
            </button>
          </div>
        </div>

        {editingGoals && (
          <div className="no-print mb-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-950/50">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Cel godzin / tydz.
              </label>
              <input
                type="number"
                min={1}
                max={40}
                step={0.5}
                value={goals.weeklyHours}
                onChange={(e) =>
                  setGoals((g) => ({
                    ...g,
                    weeklyHours: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Cel TSS / tydz.
              </label>
              <input
                type="number"
                min={50}
                max={2000}
                step={25}
                value={goals.weeklyTss}
                onChange={(e) =>
                  setGoals((g) => ({
                    ...g,
                    weeklyTss: Math.max(50, Number(e.target.value) || 50),
                  }))
                }
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Cel km / tydz.
              </label>
              <input
                type="number"
                min={5}
                max={1000}
                step={10}
                value={goals.weeklyKm}
                onChange={(e) =>
                  setGoals((g) => ({
                    ...g,
                    weeklyKm: Math.max(5, Number(e.target.value) || 5),
                  }))
                }
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Docelowe CTL (Forma)
              </label>
              <input
                type="number"
                min={10}
                max={180}
                step={5}
                value={goals.targetCtl}
                onChange={(e) =>
                  setGoals((g) => ({
                    ...g,
                    targetCtl: Math.max(10, Number(e.target.value) || 10),
                  }))
                }
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Objętość (7 dni)",
              actualStr: `${last7Hours} h`,
              targetStr: `${goals.weeklyHours} h`,
              pct: Math.min(100, Math.round((last7Hours / goals.weeklyHours) * 100)),
              barColor: "bg-sky-500",
              textColor: "text-sky-600 dark:text-sky-400",
            },
            {
              label: "Obciążenie TSS (7 dni)",
              actualStr: `${last7Tss}`,
              targetStr: `${goals.weeklyTss}`,
              pct: Math.min(100, Math.round((last7Tss / goals.weeklyTss) * 100)),
              barColor: "bg-indigo-500",
              textColor: "text-indigo-600 dark:text-indigo-400",
            },
            {
              label: "Dystans (7 dni)",
              actualStr: `${last7Km} km`,
              targetStr: `${goals.weeklyKm} km`,
              pct: Math.min(100, Math.round((last7Km / goals.weeklyKm) * 100)),
              barColor: "bg-emerald-500",
              textColor: "text-emerald-600 dark:text-emerald-400",
            },
            {
              label: "Docelowa forma (CTL)",
              actualStr: `${latestPmc.ctl.toFixed(1)}`,
              targetStr: `${goals.targetCtl}`,
              pct: Math.min(100, Math.round((latestPmc.ctl / goals.targetCtl) * 100)),
              barColor: "bg-amber-500",
              textColor: "text-amber-600 dark:text-amber-400",
            },
          ].map((g) => (
            <div key={g.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {g.label}
                </span>
                <span className={`font-mono font-semibold tabular-nums ${g.textColor}`}>
                  {g.actualStr} / {g.targetStr} ({g.pct}%)
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  style={{ width: `${Math.max(2, g.pct)}%` }}
                  className={`h-full transition-all duration-300 ${g.barColor}`}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Focal Anchor: PMC Chart & Taper Simulator */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {pmcMode === "history"
                ? "Przebieg formy, zmęczenia i świeżości (PMC)"
                : "Symulator formy pod zawody (Taper & Peak Planner)"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {pmcMode === "history"
                ? "Model Banistera na podstawie dziennego obciążenia z Intervals.icu"
                : "Prognoza CTL, ATL i TSB do wybranego dnia startu z tygodniem zejścia z obciążeń"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setPmcMode("history")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  pmcMode === "history"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                Historia PMC
              </button>
              <button
                type="button"
                onClick={() => setPmcMode("taper")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  pmcMode === "taper"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                Symulator startu (Taper)
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab("ai")}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap shrink-0"
            >
              <span>Interpretacja trenera AI</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {pmcMode === "history" ? (
          <PmcChart data={pmc} />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div>
                <label
                  htmlFor="race-date-input"
                  className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Data startu docelowego
                </label>
                <input
                  id="race-date-input"
                  type="date"
                  value={raceDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setRaceDate(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-400">
                    Planowany TSS / tydzień
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {plannedWeeklyTss}
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={1100}
                  step={20}
                  value={plannedWeeklyTss}
                  onChange={(e) => setPlannedWeeklyTss(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-400">
                    Redukcja w tygodniu startu
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    -{taperPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={75}
                  step={5}
                  value={taperPct}
                  onChange={(e) => setTaperPct(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>

              {taperSim.raceDayPoint && (
                <div className="flex flex-col justify-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    Prognoza na dzień startu
                  </span>
                  <div className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    CTL {taperSim.raceDayPoint.ctl.toFixed(1)} ·{" "}
                    <span
                      className={
                        taperSim.raceDayPoint.tsb >= 5 &&
                        taperSim.raceDayPoint.tsb <= 18
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      TSB{" "}
                      {taperSim.raceDayPoint.tsb > 0
                        ? `+${taperSim.raceDayPoint.tsb.toFixed(1)}`
                        : taperSim.raceDayPoint.tsb.toFixed(1)}
                    </span>
                  </div>
                  <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {taperSim.raceDayPoint.tsb >= 5 &&
                    taperSim.raceDayPoint.tsb <= 18
                      ? "W optymalnym oknie startowym (+5..+15)"
                      : taperSim.raceDayPoint.tsb < 5
                      ? "Zwiększ redukcję obciążenia lub zmniejsz TSS przed startem"
                      : "Duża świeżość — rozważ nieco łagodniejszy taper"}
                  </span>
                </div>
              )}
            </div>

            <TaperSimulationChart points={taperSim.points} />
          </div>
        )}
      </section>

      {/* Row 2: Weekly Load + Sport Donut */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Objętość i obciążenie tygodniowe
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Rozkład mikrocykli w ostatnich tygodniach
            </p>
          </div>
          <WeeklyLoadChart weeks={weekly} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Struktura dyscyplin
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Udział czasu i obciążenia w wybranym oknie
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("zones")}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 whitespace-nowrap"
            >
              Strefy i Moc
            </button>
          </div>
          <SportDonutChart items={sportBreakdown} />
        </section>
      </div>

      {/* Row 3: Consistency Heatmap + Wellness or Intensity Scatter */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Mapa regularności treningowej
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Dzienne obciążenie TSS z ostatnich 18 tygodni
            </p>
          </div>
          <ActivityHeatmapChart cells={heatmapCells} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          {hasWellnessTrend ? (
            <>
              <div className="mb-4">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Regeneracja: HRV, tętno spoczynkowe i sen
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Trend z wpisów Wellness w Intervals.icu (ostatnie 45 dni)
                </p>
              </div>
              <WellnessTrendChart wellness={wellness} />
            </>
          ) : (
            <>
              <div className="mb-4">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Mapa intensywności sesji (Czas vs IF%)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Wielkość bąbelka odpowiada wartości TSS treningu
                </p>
              </div>
              <IntensityScatterChart points={intensityScatter} />
            </>
          )}
        </section>
      </div>

      {/* Physiological Observations */}
      {insights.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 font-display text-base font-semibold text-slate-900 dark:text-white">
            Automatyczne obserwacje fizjologiczne
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {insights.map((ins) => {
              const Icon =
                ins.severity === "warning"
                  ? AlertTriangle
                  : ins.severity === "caution"
                  ? Info
                  : CheckCircle2;
              const iconClass =
                ins.severity === "warning"
                  ? "text-rose-600 dark:text-rose-400"
                  : ins.severity === "caution"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400";

              return (
                <div
                  key={ins.id}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-950/40"
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {ins.title}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {ins.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent 6 Activities */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Ostatnie treningi
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab("activities")}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 whitespace-nowrap"
          >
            Wszystkie aktywności ({activities.length})
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-5 py-2.5">Data</th>
                <th className="px-4 py-2.5">Nazwa</th>
                <th className="px-4 py-2.5">Dyscyplina</th>
                <th className="px-4 py-2.5 text-right">Czas</th>
                <th className="px-4 py-2.5 text-right">Dystans</th>
                <th className="px-4 py-2.5 text-right">Tempo / Prędkość</th>
                <th className="px-4 py-2.5 text-right">Śr. Moc</th>
                <th className="px-4 py-2.5 text-right">Śr. HR</th>
                <th className="px-5 py-2.5 text-right">TSS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {activities.slice(0, 6).map((act) => (
                <tr
                  key={act.id}
                  onClick={() => onSelectActivity(act)}
                  className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="px-5 py-2.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatDateFullPl(act.start_date_local)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100 max-w-[260px] truncate">
                    {act.name || sportLabelPl(act.type)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {sportLabelPl(act.type)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {formatDuration(act.moving_time)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {act.distance > 0 ? `${(act.distance / 1000).toFixed(1)} km` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {formatPace(act.average_speed, act.type)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {act.icu_weighted_avg_watts || act.average_watts
                      ? `${Math.round(act.icu_weighted_avg_watts || act.average_watts || 0)} W`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {act.average_heartrate ? `${Math.round(act.average_heartrate)} bpm` : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {act.icu_training_load ? Math.round(act.icu_training_load) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal with detailed metric charts and history matching Image 2 */}
      {activeDetailMetric !== null && (
        <MetricDetailModal
          initialMetric={activeDetailMetric}
          pmc={pmc}
          wellness={wellness}
          onClose={() => setActiveDetailMetric(null)}
        />
      )}
    </div>
  );
};
