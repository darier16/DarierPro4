import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  Bot,
  Brain,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  Flame,
  Heart,
  HeartPulse,
  Info,
  Lightbulb,
  Moon,
  RefreshCw,
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type {
  CoachTipsReport,
  EfficiencyPoint,
  IntervalsActivity,
  IntervalsAthlete,
  IntervalsWellnessDay,
  PmcPoint,
  WeeklyVolumePoint,
  ZoneDistributionItem,
} from "../types/intervals";
import { computeRealtimeCoachTips } from "../utils/coachTipsEngine";
import {
  buildAiSummaryPayload,
  computeSeilerPolarization,
  formatDateFullPl,
  formatDuration,
  type WeeklyZoneStackPoint,
} from "../utils/analytics";
import { getStoredOpenRouterKey, hasStoredOpenRouterKey, OPENROUTER_DEFAULT_MODEL } from "../utils/openrouter";
import {
  HealthLoadCorrelationChart,
  HrvRhrBaselineChart,
  ReadinessGauge,
  WeeklyZoneStackChart,
} from "./Charts";
import { AiCoachView } from "./AiCoachView";

export interface CoachTipsViewProps {
  athlete: IntervalsAthlete;
  activities: IntervalsActivity[];
  wellness: IntervalsWellnessDay[];
  pmc: PmcPoint[];
  hrZones: ZoneDistributionItem[];
  powerZones: ZoneDistributionItem[];
  weeklyVolume: WeeklyVolumePoint[];
  weeklyZoneStack?: WeeklyZoneStackPoint[];
  efficiencySeries: EfficiencyPoint[];
  source?: "api" | "file" | "strava";
  athleteId?: string;
  accessToken?: string;
  onPlanPushed?: () => void;
  onOpenSettings?: () => void;
  onNavigateTab?: (tab: string) => void;
  onSelectActivity?: (act: IntervalsActivity) => void;
}

export const CoachTipsView: React.FC<CoachTipsViewProps> = ({
  athlete,
  activities,
  wellness,
  pmc,
  hrZones,
  powerZones,
  weeklyVolume,
  weeklyZoneStack,
  efficiencySeries,
  source,
  athleteId,
  accessToken,
  onPlanPushed,
  onOpenSettings,
  onNavigateTab,
  onSelectActivity,
}) => {
  // Pre-calculate deterministic real-time assessment immediately
  const initialRealtimeReport = useMemo(() => {
    return computeRealtimeCoachTips({
      athlete,
      activities,
      wellness,
      pmc,
      hrZones,
      powerZones,
      weeklyVolume,
      efficiencySeries,
    });
  }, [athlete, activities, wellness, pmc, hrZones, powerZones, weeklyVolume, efficiencySeries]);

  const [report, setReport] = useState<CoachTipsReport>(initialRealtimeReport);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(
    new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
  );
  const [activeSubTab, setActiveSubTab] = useState<
    "all" | "diagnosis" | "tables" | "charts" | "advice" | "chat"
  >("all");

  // Keep report in sync when underlying props change if report was real-time
  useEffect(() => {
    if (report.sourceType === "realtime") {
      setReport(initialRealtimeReport);
    }
  }, [initialRealtimeReport, report.sourceType]);

  // Auto-run AI background evaluation on initial mount or when data changes
  const autoRanRef = React.useRef(false);
  useEffect(() => {
    if (!autoRanRef.current && (activities.length > 0 || wellness.length > 0)) {
      autoRanRef.current = true;
      runAiEvaluation();
    }
  }, [activities.length, wellness.length]);

  // Background AI Refresh function
  const runAiEvaluation = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const openrouterKey = getStoredOpenRouterKey();
      const summaryPayload = buildAiSummaryPayload(
        athlete,
        activities,
        wellness,
        pmc,
        weeklyVolume,
        powerZones,
        hrZones,
        efficiencySeries
      );

      const res = await fetch("/api/analysis/coach-tips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(openrouterKey ? { "x-openrouter-api-key": openrouterKey } : {}),
        },
        body: JSON.stringify({
          openrouterApiKey: openrouterKey || undefined,
          summary: summaryPayload,
          wellness: wellness.slice(-14),
          pmc: pmc.slice(-14),
          recentActivities: activities.slice(0, 10).map((a) => ({
            name: a.name,
            type: a.type,
            date: a.start_date_local,
            distanceKm: Number(((a.distance || 0) / 1000).toFixed(1)),
            movingTimeMin: Math.round((a.moving_time || 0) / 60),
            tss: a.icu_training_load ? Math.round(a.icu_training_load) : null,
            ifPct: a.icu_intensity ? Math.round(a.icu_intensity) : null,
            avgWatts: a.average_watts ? Math.round(a.average_watts) : null,
            avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
            decoupling: a.decoupling ? Number(a.decoupling.toFixed(1)) : null,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się pobrać pogłębionej diagnozy AI.");
      }

      if (data.coachTips) {
        setReport({
          ...data.coachTips,
          sourceType: "ai",
          generatedAt: new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
        });
        setLastRefreshedAt(new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }));
      }
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : "Wystąpił błąd podczas analizy AI. Wyświetlam bieżącą kalkulację fizjologiczną."
      );
    } finally {
      setAiLoading(false);
    }
  };

  const statusBadge = useMemo(() => {
    switch (report.readinessStatus) {
      case "optimal":
        return {
          label: "Optymalna gotowość startowa",
          badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
          bgGradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
          icon: ShieldCheck,
        };
      case "good":
        return {
          label: "Dobra gotowość adaptacyjna",
          badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800",
          bgGradient: "from-blue-500/10 via-blue-500/5 to-transparent",
          icon: CheckCircle2,
        };
      case "caution":
        return {
          label: "Uwaga na zmęczenie (Odpoczynek zalecany)",
          badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800",
          bgGradient: "from-amber-500/10 via-amber-500/5 to-transparent",
          icon: AlertTriangle,
        };
      case "overload":
      default:
        return {
          label: "Ryzyko przeciążenia fizjologicznego",
          badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800",
          bgGradient: "from-rose-500/10 via-rose-500/5 to-transparent",
          icon: ShieldAlert,
        };
    }
  }, [report.readinessStatus]);

  const StatusIcon = statusBadge.icon;
  const latestPmc = pmc[pmc.length - 1];

  const currentPolarization = useMemo(() => {
    const primaryZones = powerZones.reduce((s, z) => s + z.secs, 0) > 0 ? powerZones : hrZones;
    return computeSeilerPolarization(primaryZones);
  }, [powerZones, hrZones]);

  const summaryPayload = useMemo(() => {
    return buildAiSummaryPayload(
      athlete,
      activities,
      wellness,
      pmc,
      weeklyVolume,
      powerZones,
      hrZones,
      efficiencySeries
    );
  }, [athlete, activities, wellness, pmc, weeklyVolume, powerZones, hrZones, efficiencySeries]);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ========================================================================= */}
      {/* 1. TOP HERO BANNER & REAL-TIME CONTROLS */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-purple-50/40 p-6 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-purple-950/20 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-600/10 border border-purple-500/20 px-3 py-1 text-xs font-bold text-purple-700 dark:text-purple-300">
                <Brain className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span>Karta Trener: Diagnoza AI & Fizjologia</span>
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span
                  className={`h-2 w-2 rounded-full ${
                    aiLoading ? "bg-purple-500 animate-ping" : "bg-emerald-500 animate-pulse"
                  }`}
                />
                <span>
                  {aiLoading
                    ? "Sztuczna inteligencja analizuje w tle..."
                    : `Zaktualizowano ${report.sourceType === "ai" ? "przez AI" : "na żywo"} (${lastRefreshedAt})`}
                </span>
              </span>

              <span className="rounded-full bg-purple-100 dark:bg-purple-900/40 px-2.5 py-1 text-[11px] font-mono font-semibold text-purple-800 dark:text-purple-300">
                Model: {OPENROUTER_DEFAULT_MODEL}
              </span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Trener AI: Stan Zdrowia, Forma i Zalecenia
            </h1>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Bieżąca ocena fizjologiczna na podstawie wszystkich danych zdrowotnych (HRV, tętno spoczynkowe, sen,
              DOMS, stres) i sportowych (obciążenia CTL/ATL/TSB, strefy mocy i tętna, wskaźnik ACWR i dryf tętna).
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={aiLoading}
              onClick={runAiEvaluation}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white px-4 py-2.5 text-xs sm:text-sm font-bold shadow-md shadow-purple-600/20 transition-all disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${aiLoading ? "animate-spin" : ""}`} />
              <span>{aiLoading ? "Analizuję w tle..." : "Odśwież analizę AI"}</span>
            </button>

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                title="Konfiguracja klucza OpenRouter API"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
              >
                <Settings className="h-4 w-4 text-slate-500" />
                <span className="hidden sm:inline">Klucz API</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              title="Drukuj lub zapisz raport jako PDF"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="h-4 w-4 text-slate-500" />
              <span className="hidden sm:inline">Drukuj</span>
            </button>
          </div>
        </div>

        {/* Background loading banner */}
        {aiLoading && (
          <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/25 px-4 py-2.5 text-xs text-purple-800 dark:text-purple-300 animate-pulse">
            <RefreshCw className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-400 shrink-0" />
            <div className="flex-1">
              <span className="font-bold">Analiza AI w tle: </span>
              <span>
                Przetwarzanie biometrycznych danych zdrowia i obciążeń treningowych przez OpenRouter ({OPENROUTER_DEFAULT_MODEL}). Dane są już dostępne poniżej.
              </span>
            </div>
          </div>
        )}

        {aiError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30 p-3.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">Informacja: </span>
              <span>{aiError} Wyświetlono aktualne wskaźniki fizjologiczne wyliczone na żywo z Twoich danych.</span>
            </div>
          </div>
        )}

        {/* Quick Nav Sub-Tabs inside Coach Card */}
        <div className="mt-6 flex items-center gap-1 border-t border-slate-200/80 dark:border-slate-800 pt-4 overflow-x-auto no-scrollbar">
          {[
            { id: "all", label: "Pełny Raport (Wszystko)", icon: Sparkles },
            { id: "diagnosis", label: "Diagnoza Zdrowia i Formy", icon: HeartPulse },
            { id: "tables", label: "3 Tabele Fizjologiczne", icon: Activity },
            { id: "charts", label: "Wykresy i Balans Obciążeń", icon: Zap },
            { id: "advice", label: "Porady i 'Na co uważać'", icon: Lightbulb },
            { id: "chat", label: "Czat z Trenerem i Generator", icon: Bot },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Chat & Plan Generator Sub-Tab */}
      {activeSubTab === "chat" && (
        <section className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs">
          <AiCoachView
            summaryPayload={summaryPayload}
            source={source || "api"}
            athleteId={athleteId}
            accessToken={accessToken}
            currentCtl={latestPmc?.ctl ?? 55}
            currentAtl={latestPmc?.atl ?? 50}
            currentPolarization={currentPolarization}
            onPlanPushed={onPlanPushed}
            onNavigateToPlan={() => onNavigateTab?.("plan")}
            onOpenSettings={onOpenSettings}
          />
        </section>
      )}

      {/* ========================================================================= */}
      {/* 2. TOP METRIC GAUGES & HIGH-LEVEL READINESS STATS */}
      {/* ========================================================================= */}
      {(activeSubTab === "all" || activeSubTab === "diagnosis") && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Readiness Score Card */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Wskaźnik Gotowości (Readiness)
            </span>
            <BatteryCharging className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-slate-900 dark:text-white">
              {report.readinessScore}
            </span>
            <span className="text-xs font-bold text-slate-400">/ 100</span>
          </div>
          <div className="mt-2">
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  report.readinessScore >= 80
                    ? "bg-emerald-500"
                    : report.readinessScore >= 65
                    ? "bg-blue-500"
                    : report.readinessScore >= 50
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${report.readinessScore}%` }}
              />
            </div>
            <span className="mt-1.5 inline-block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {statusBadge.label}
            </span>
          </div>
        </div>

        {/* Form vs Fatigue (CTL/ATL/TSB) */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Świeżość (TSB) i Forma (CTL)
            </span>
            <Flame className="h-4 w-4 text-orange-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`font-mono text-3xl font-extrabold ${
                (latestPmc?.tsb || 0) >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : (latestPmc?.tsb || 0) >= -15
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {(latestPmc?.tsb || 0) >= 0 ? `+${Math.round(latestPmc?.tsb || 0)}` : Math.round(latestPmc?.tsb || 0)}
            </span>
            <span className="text-xs font-semibold text-slate-500">TSB (Bilans)</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <span>Forma CTL: <strong className="text-slate-900 dark:text-white">{Math.round(latestPmc?.ctl || 55)}</strong></span>
            <span>Zmęczenie ATL: <strong className="text-slate-900 dark:text-white">{Math.round(latestPmc?.atl || 50)}</strong></span>
          </div>
        </div>

        {/* Autonomic Balance (HRV & Resting HR) */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Układ Wegetatywny (HRV / RHR)
            </span>
            <HeartPulse className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">HRV (rMSSD)</div>
              <div className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
                {report.biomarkersTable[0]?.currentValue || "62 ms"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Tętno spocz.</div>
              <div className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
                {report.biomarkersTable[1]?.currentValue || "48 bpm"}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1.5 truncate">
            {report.biomarkersTable[0]?.impact || "Prawidłowy ton wegetatywny"}
          </div>
        </div>

        {/* Workload Safety (ACWR Ratio) */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Wskaźnik Bezpieczeństwa (ACWR)
            </span>
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
              {report.loadAndFormTable[3]?.value || "1.05"}
            </span>
            <span className="text-xs font-semibold text-slate-500">ATL / CTL</span>
          </div>
          <div className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Strefa Sweet Spot:</span>{" "}
            optymalna adaptacja, niskie ryzyko kontuzji.
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. PEŁNA DIAGNOZA STANU ZDROWIA I FORMY */}
      {/* ========================================================================= */}
      <section className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              <Compass className="h-4 w-4" />
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Szczegółowa Diagnoza Fizjologiczna i Wniosek Trenera
            </h2>
          </div>

          <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusBadge.badgeClass}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            <span>{statusBadge.label}</span>
          </div>
        </div>

        {/* Verdict Callout */}
        <div className="rounded-2xl border border-purple-200/80 bg-purple-50/60 dark:border-purple-900/50 dark:bg-purple-950/20 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white font-bold shadow-xs">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <span className="text-xs uppercase font-extrabold tracking-wide text-purple-700 dark:text-purple-300">
                Główny Wniosek i Rekomendacja na Dzisiaj:
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                {report.summaryDiagnosis.verdict}
              </p>
            </div>
          </div>
        </div>

        {/* 3-column detailed diagnosis */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Health & Autonomic */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <HeartPulse className="h-4 w-4 text-rose-500" />
              <span>1. Stan Zdrowia i Układ Krążenia</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {report.summaryDiagnosis.healthStatus}
            </p>
          </div>

          {/* Athletic Form */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Flame className="h-4 w-4 text-orange-500" />
              <span>2. Forma Sportowa i Świeżość</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {report.summaryDiagnosis.formStatus}
            </p>
          </div>

          {/* Fatigue & Overload Risk */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <ShieldAlert className="h-4 w-4 text-indigo-500" />
              <span>3. Zmęczenie i Bezpieczeństwo ACWR</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {report.summaryDiagnosis.fatigueStatus}
            </p>
          </div>
        </div>
      </section>
        </>
      )}

      {/* ========================================================================= */}
      {/* 4. TABELE FIZJOLOGICZNE I STATYSTYCZNE */}
      {/* ========================================================================= */}
      {(activeSubTab === "all" || activeSubTab === "tables") && (
        <section className="space-y-6">
        {/* TABELA 1: BIOMARKERY ZDROWIA I REGENERACJI */}
        <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-rose-500" />
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Tabela 1: Biomarkery Zdrowia i Regeneracji
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Zmienność rytmu serca (HRV), tętno spoczynkowe, fazy snu oraz wskaźniki uszkodzeń mięśniowych (DOMS).
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                  <th className="py-2.5 px-3">Biomarker / Parametr</th>
                  <th className="py-2.5 px-3">Bieżący wynik</th>
                  <th className="py-2.5 px-3">Norma / Baseline 14-30d</th>
                  <th className="py-2.5 px-3">Ocena</th>
                  <th className="py-2.5 px-3">Wpływ na obciążenie treningowe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {report.biomarkersTable.map((item, idx) => {
                  const statusPill =
                    item.status === "optimal"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : item.status === "warning"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      : item.status === "alert"
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300";

                  const statusLabel =
                    item.status === "optimal"
                      ? "Optymalnie"
                      : item.status === "warning"
                      ? "Uwaga"
                      : item.status === "alert"
                      ? "Przeciążenie"
                      : "W normie";

                  return (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                        {item.param}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-100">
                        {item.currentValue}
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono">
                        {item.normBaseline}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${statusPill}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-sm">
                        {item.impact}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* TABELA 2: WSKAŹNIKI OBCIĄŻEŃ I FORMY SPORTOWEJ */}
        <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Tabela 2: Bilans Obciążeń Treningowych i Dynamiki Formy
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Obciążenia Coggana (CTL, ATL, TSB), stosunek ACWR, tempo przyrostu Ramp Rate oraz dryf tętna.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                  <th className="py-2.5 px-3">Metryka Obciążenia</th>
                  <th className="py-2.5 px-3">Wartość Bieżąca</th>
                  <th className="py-2.5 px-3">Interpretacja Fizjologiczna</th>
                  <th className="py-2.5 px-3">Poziom Ryzyka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {report.loadAndFormTable.map((item, idx) => {
                  const riskPill =
                    item.riskLevel === "low"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : item.riskLevel === "moderate"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300";

                  const riskLabel =
                    item.riskLevel === "low"
                      ? "Niskie / Bezpiecznie"
                      : item.riskLevel === "moderate"
                      ? "Umiarkowane"
                      : "Wysokie";

                  return (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                        {item.metric}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {item.value}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        {item.interpretation}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${riskPill}`}>
                          {riskLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* TABELA 3: HARMONOGRAM I REKOMENDACJE NA 48-72h */}
        <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Tabela 3: Harmonogram i Zalecenia Treningowe na Najbliższe 48–72h
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Dopasowanie bodźców metabolicznych, watów oraz regeneracji do bieżącego poziomu zmęczenia organizmu.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                  <th className="py-2.5 px-3">Okno Czasowe</th>
                  <th className="py-2.5 px-3">Zalecana Jednostka</th>
                  <th className="py-2.5 px-3">Strefa Mocy / Tętna</th>
                  <th className="py-2.5 px-3">Docelowa Moc / Tętno</th>
                  <th className="py-2.5 px-3">Czas Trwania</th>
                  <th className="py-2.5 px-3">Uzasadnienie Fizjologiczne</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {report.actionablePlanTable.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 text-[11px] font-bold text-purple-700 dark:text-purple-300">
                        {item.timeWindow}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      {item.recommendedWorkout}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-mono">
                      {item.intensityZone}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {item.targetWattsOrHr}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                      {item.durationMin} min
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {item.rationale}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      )}

      {/* ========================================================================= */}
      {/* 5. WYKRESY I WIZUALIZACJE POWIĄZANE Z TRENINGIEM I ZDROWIEM */}
      {/* ========================================================================= */}
      {(activeSubTab === "all" || activeSubTab === "charts") && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Readiness and TSB Balance Gauge */}
            <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Wskaźnik Gotowości i Równowagi (Readiness & TSB Balance)
                  </h3>
                  <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                    {report.readinessScore}/100
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Łączna ocena świeżości mięśniowej i autonomicznego układu nerwowego.
                </p>
              </div>

              <div className="my-4 flex items-center justify-center">
                <ReadinessGauge
                  score={report.readinessScore}
                  status={report.readinessStatus === "good" ? "build" : report.readinessStatus}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-center text-[11px]">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2">
                  <div className="text-slate-400">Forma CTL</div>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {Math.round(latestPmc?.ctl || 55)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2">
                  <div className="text-slate-400">Zmęczenie ATL</div>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {Math.round(latestPmc?.atl || 50)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2">
                  <div className="text-slate-400">Świeżość TSB</div>
                  <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {(latestPmc?.tsb || 0) >= 0 ? `+${Math.round(latestPmc?.tsb || 0)}` : Math.round(latestPmc?.tsb || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Health Load Correlation or HRV / RHR Chart */}
            <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Trend HRV i Tętna Spoczynkowego vs Baseline (30 dni)
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Adaptacja sercowo-naczyniowa
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Wizualizacja odpowiedzi układu krążenia na zadawane obciążenie treningowe.
                </p>
              </div>

              <div className="my-2">
                <HrvRhrBaselineChart wellness={wellness} />
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-bold text-slate-900 dark:text-white">Wskazówka kardiologiczna:</span> Stały wzrost HRV przy stabilnym lub lekko spadającym tętnie spoczynkowym świadczy o wzroście objętości wyrzutowej serca (VVS).
              </div>
            </div>
          </div>

          {weeklyZoneStack && weeklyZoneStack.length > 0 && (
            <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      Rozkład Obciążeń Tygodniowych w Strefach (Z1–Z7)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Weryfikacja polaryzacji treningowej i unikania tzw. "czarnej dziury" (Z3 śmieciowe kilometry).
                    </p>
                  </div>
                </div>
              </div>
              <WeeklyZoneStackChart weeks={weeklyZoneStack} />
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 6. KONKRETNE PORADY: CO ROBIĆ I NA CO ZWRACAĆ UWAGĘ */}
      {/* ========================================================================= */}
      {(activeSubTab === "all" || activeSubTab === "advice") && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Card 1: Co robić dzisiaj (Plan działania) */}
        <div className="rounded-3xl border border-emerald-200/90 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50/70 via-white to-white dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Co robić dzisiaj (Plan działania)
              </h3>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                Konkretne wytyczne wykonawcze
              </span>
            </div>
          </div>

          <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
            {report.coachingTips.whatToDoToday.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Card 2: Na co zwracać szczególną uwagę (Czerwone i żółte flagi) */}
        <div className="rounded-3xl border border-amber-200/90 dark:border-amber-900/60 bg-gradient-to-br from-amber-50/70 via-white to-white dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Na co zwracać uwagę (Czerwone flagi)
              </h3>
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                Ostrzeżenia i sygnały zmęczenia
              </span>
            </div>
          </div>

          <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
            {report.coachingTips.whatToWatchOutFor.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold mt-0.5">
                  !
                </span>
                <span className="leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Card 3: Żywienie i regeneracja powysiłkowa */}
        <div className="rounded-3xl border border-indigo-200/90 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/70 via-white to-white dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900 p-6 shadow-xs space-y-4 md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <BatteryCharging className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Żywienie, Sen i Regeneracja
              </h3>
              <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-semibold">
                Wsparcie procesów anabolicznych
              </span>
            </div>
          </div>

          <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
            {report.coachingTips.nutritionAndRecovery.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold mt-0.5">
                  ✓
                </span>
                <span className="leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      )}
    </div>
  );
};
