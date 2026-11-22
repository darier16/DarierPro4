import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  CalendarPlus,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageSquarePlus,
  Send,
  Settings,
  Sparkles,
} from "lucide-react";
import type {
  AiAnalysisReport,
  ChatMessage,
  PlannedWorkoutDay,
} from "../types/intervals";
import {
  PlannedWeekChart,
  ReadinessGauge,
  WorkoutBlocksChart,
} from "./Charts";
import { getStoredGroqKey, hasStoredGroqKey } from "../utils/groq";

interface AiCoachViewProps {
  summaryPayload: Record<string, unknown>;
  source: "api" | "file" | "strava";
  athleteId?: string;
  accessToken?: string;
  currentCtl: number;
  currentAtl: number;
  currentPolarization: {
    lowPercent: number;
    midPercent: number;
    highPercent: number;
  };
  onPlanPushed?: () => void;
  onNavigateToPlan?: () => void;
  onOpenSettings?: () => void;
}

const FOCUS_OPTIONS = [
  { id: "comprehensive", label: "Kompleksowy przegląd formy" },
  { id: "taper", label: "Strategia pod zawody (Taper)" },
  { id: "recovery", label: "Regeneracja i ryzyko przeciążenia" },
  { id: "aerobic", label: "Wydolność tlenowa i polaryzacja" },
] as const;

const SPORT_OPTIONS = [
  { id: "auto", label: "Auto (wg moich danych)" },
  { id: "cycling", label: "Kolarstwo" },
  { id: "running", label: "Bieganie" },
  { id: "triathlon", label: "Triathlon / Multisport" },
] as const;

const STYLE_OPTIONS = [
  { id: "balanced", label: "Zrównoważony" },
  { id: "conservative", label: "Ostrożna regeneracja" },
  { id: "aggressive", label: "Ambitny progres" },
] as const;

const QUICK_PROMPTS = [
  "Czy mogę jutro zrobić mocne interwały?",
  "Jak zmniejszyć mój dryf tętna?",
  "Jak zaplanować tydzień przed startem docelowym?",
  "Oceń równowagę między objętością Z2 a akcentami",
];

function formatWorkoutBlocksForIntervals(day: PlannedWorkoutDay): string {
  const header = `${day.focus}\n${day.coachRationale || ""}`.trim();
  if (!day.blocks || day.blocks.length === 0) {
    return `${header}\nIntensywność: ${day.intensity}\nCzas: ${day.duration}`;
  }
  const lines = day.blocks.map(
    (b) => `- ${b.label} ${b.minutes}m ${b.intensityPct}%`
  );
  return `${header}\n\n${lines.join("\n")}`;
}

export const AiCoachView: React.FC<AiCoachViewProps> = ({
  summaryPayload,
  source,
  athleteId,
  accessToken,
  currentCtl,
  currentAtl,
  currentPolarization,
  onPlanPushed,
  onOpenSettings,
}) => {
  const [focus, setFocus] = useState<string>("comprehensive");
  const [sportPreference, setSportPreference] = useState<string>("auto");
  const [coachStyle, setCoachStyle] = useState<string>("balanced");
  const [weeklyHoursBudget, setWeeklyHoursBudget] = useState<number>(8);
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState<number>(5);
  const [goalContext, setGoalContext] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AiAnalysisReport | null>(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(0);
  const [copiedDayIdx, setCopiedDayIdx] = useState<number | null>(null);

  const [pushingPlan, setPushingPlan] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const groqKey = getStoredGroqKey();
      const res = await fetch("/api/analysis/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(groqKey ? { "x-groq-api-key": groqKey } : {}),
        },
        body: JSON.stringify({
          groqApiKey: groqKey || undefined,
          summary: summaryPayload,
          focus,
          sportPreference,
          coachStyle,
          weeklyHoursBudget,
          trainingDaysPerWeek,
          goalContext: goalContext.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się wygenerować analizy.");
      }
      const nextReport = data.report as AiAnalysisReport;
      setReport(nextReport);
      // Select first non-rest day for immediate block profile display
      const firstActive = nextReport.nextSevenDaysPlan.findIndex(
        (d) => d.workoutType !== "Rest" && (d.blocks?.length || 0) > 0
      );
      setSelectedDayIdx(firstActive >= 0 ? firstActive : 0);
      setPushStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd generowania analizy.");
    } finally {
      setLoading(false);
    }
  };

  const planStats = useMemo(() => {
    if (!report?.nextSevenDaysPlan?.length) return null;
    const plan = report.nextSevenDaysPlan;
    const totalTss = plan.reduce((s, d) => s + (Number(d.estimatedTss) || 0), 0);
    const totalMin = plan.reduce((s, d) => s + (Number(d.durationMin) || 0), 0);

    let zLow = 0;
    let zMid = 0;
    let zHigh = 0;
    for (const d of plan) {
      if (d.blocks && d.blocks.length > 0) {
        for (const b of d.blocks) {
          const m = Math.max(0, Number(b.minutes) || 0);
          if (b.zone === "Z1" || b.zone === "Z2") zLow += m;
          else if (b.zone === "Z3" || b.zone === "Z4") zMid += m;
          else zHigh += m;
        }
      } else {
        const m = Math.max(0, Number(d.durationMin) || 0);
        if (d.zoneBucket === "z1z2") zLow += m;
        else if (d.zoneBucket === "z3z4") zMid += m;
        else if (d.zoneBucket === "z5plus") zHigh += m;
      }
    }
    const zSum = zLow + zMid + zHigh;
    const lowPct = zSum > 0 ? Math.round((zLow / zSum) * 100) : 0;
    const midPct = zSum > 0 ? Math.round((zMid / zSum) * 100) : 0;
    const highPct = zSum > 0 ? Math.max(0, 100 - lowPct - midPct) : 0;

    return {
      totalTss: Math.round(totalTss),
      totalHours: Number((totalMin / 60).toFixed(1)),
      activeDays: plan.filter((d) => d.workoutType !== "Rest" && d.durationMin > 0)
        .length,
      lowPct,
      midPct,
      highPct,
    };
  }, [report]);

  const pushPlanToIntervals = async () => {
    if (!report || pushingPlan || source !== "api") return;
    setPushingPlan(true);
    setPushStatus(null);
    try {
      const today = new Date();
      const workouts = report.nextSevenDaysPlan
        .map((item, idx) => {
          const dt = new Date(today);
          dt.setDate(today.getDate() + idx + 1);
          return {
            date: dt.toISOString().slice(0, 10),
            name: item.focus.slice(0, 80),
            description: formatWorkoutBlocksForIntervals(item),
            type: item.workoutType === "Rest" ? "Note" : item.workoutType || "Ride",
            isRest: item.workoutType === "Rest",
          };
        })
        .filter((w) => !w.isRest);

      if (workouts.length === 0) {
        setPushStatus("Wszystkie dni w planie są oznaczone jako odpoczynek.");
        setPushingPlan(false);
        return;
      }

      const res = await fetch("/api/intervals/push-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          accessToken,
          workouts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd zapisu do kalendarza.");
      }
      setPushStatus(
        `Zapisano ${data.createdCount} ustrukturyzowanych treningów w kalendarzu Intervals.icu (od jutra).`
      );
      onPlanPushed?.();
    } catch (err) {
      setPushStatus(
        err instanceof Error ? `Błąd: ${err.message}` : "Nie udało się zapisać planu."
      );
    } finally {
      setPushingPlan(false);
    }
  };

  const askQuestion = async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || chatLoading) return;

    const updated = [...messages, { role: "user" as const, content: q }];
    setMessages(updated);
    setQuestion("");
    setChatLoading(true);

    try {
      const chatSummary = report
        ? {
            ...summaryPayload,
            currentProposed7DayPlan: report.nextSevenDaysPlan.map((d) => ({
              day: d.day,
              focus: d.focus,
              durationMin: d.durationMin,
              estimatedTss: d.estimatedTss,
              intensity: d.intensity,
            })),
          }
        : summaryPayload;

      const groqKey = getStoredGroqKey();
      const res = await fetch("/api/analysis/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(groqKey ? { "x-groq-api-key": groqKey } : {}),
        },
        body: JSON.stringify({
          groqApiKey: groqKey || undefined,
          summary: chatSummary,
          messages: updated,
          question: q,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd odpowiedzi trenera.");
      }
      setMessages([
        ...updated,
        { role: "assistant", content: data.answer || "Brak odpowiedzi." },
      ]);
    } catch (err) {
      setMessages([
        ...updated,
        {
          role: "assistant",
          content:
            err instanceof Error
              ? `Błąd: ${err.message}`
              : "Nie udało się uzyskać odpowiedzi.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const sendChatQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    await askQuestion(question);
  };

  const handleCopyWorkout = (day: PlannedWorkoutDay, idx: number) => {
    const txt = formatWorkoutBlocksForIntervals(day);
    navigator.clipboard?.writeText(txt).catch(() => {});
    setCopiedDayIdx(idx);
    setTimeout(() => setCopiedDayIdx(null), 1800);
  };

  const statusStyles: Record<
    AiAnalysisReport["readinessStatus"],
    { label: string; textClass: string; bgClass: string }
  > = {
    optimal: {
      label: "Gotowość startowa",
      textClass: "text-emerald-700 dark:text-emerald-400",
      bgClass:
        "bg-emerald-50/90 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900",
    },
    build: {
      label: "Faza budowania",
      textClass: "text-purple-700 dark:text-purple-400",
      bgClass:
        "bg-purple-50/90 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900",
    },
    caution: {
      label: "Uwaga na zmęczenie",
      textClass: "text-amber-700 dark:text-amber-400",
      bgClass:
        "bg-amber-50/90 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
    },
    overload: {
      label: "Ryzyko przeciążenia",
      textClass: "text-rose-700 dark:text-rose-400",
      bgClass:
        "bg-rose-50/90 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900",
    },
  };

  const selectedDay = report?.nextSevenDaysPlan?.[selectedDayIdx] || null;

  return (
    <div className="space-y-6">
      {/* Groq Cloud Engine Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-200/90 bg-gradient-to-r from-purple-50 via-indigo-50/50 to-white dark:border-purple-900/60 dark:from-purple-950/40 dark:via-indigo-950/20 dark:to-slate-900 p-3.5 sm:px-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs shrink-0">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Silnik AI: Groq Cloud (llama-3.3-70b-versatile)
              </span>
              <span className="rounded-full bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                OpenAI Standard (Bearer)
              </span>
              {hasStoredGroqKey() ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  <Check className="h-3 w-3" />
                  Klucz gsk_... zapisany
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  Domyślny serwera / brak klucza
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Błyskawiczne generowanie mikrocyklu, wykresów obciążenia i czatu bezpłatnym modelem Llama 3.3.
            </p>
          </div>
        </div>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Zarządzaj kluczem Groq</span>
          </button>
        )}
      </div>

      {/* Configuration panel */}
      <section className="rounded-xl border border-purple-200/80 bg-white p-5 sm:p-6 dark:border-purple-900/50 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Raport Trenera AI i Planer Mikrocyklu (Intervals.icu)
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Analiza danych CTL/ATL/TSB, stref i regeneracji oraz generowanie interaktywnych wykresów i bloków proponowanych treningów.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={runAnalysis}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>
              {loading
                ? "Generuję analizę i plan..."
                : report
                ? "Odśwież analizę i wykresy"
                : "Generuj analizę i plan"}
            </span>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Kierunek analizy
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {FOCUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFocus(opt.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                      focus === opt.id
                        ? "border-purple-600 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-950/40 dark:text-purple-300"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Dyscyplina planu
                </label>
                <select
                  value={sportPreference}
                  onChange={(e) => setSportPreference(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-purple-600 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  {SPORT_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Strategia obciążenia
                </label>
                <select
                  value={coachStyle}
                  onChange={(e) => setCoachStyle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-purple-600 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  {STYLE_OPTIONS.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-5">
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">
                    Budżet czasu
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-purple-700 dark:text-purple-400">
                    {weeklyHoursBudget} h
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={18}
                  step={1}
                  value={weeklyHoursBudget}
                  onChange={(e) => setWeeklyHoursBudget(Number(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">
                    Dni treningowe
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-purple-700 dark:text-purple-400">
                    {trainingDaysPerWeek} / 7
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={7}
                  step={1}
                  value={trainingDaysPerWeek}
                  onChange={(e) => setTrainingDaysPerWeek(Number(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="goal-context"
                className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Dodatkowy cel lub kontekst (opcjonalnie)
              </label>
              <textarea
                id="goal-context"
                rows={2}
                value={goalContext}
                onChange={(e) => setGoalContext(e.target.value)}
                placeholder="Np. Start docelowy za 4 tygodnie, w weekend chcę dłuższą jazdę w grupie, czuję lekkie zmęczenie..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Loading skeleton */}
      {loading && (
        <section className="rounded-xl border border-purple-200/70 bg-white p-6 dark:border-purple-900/40 dark:bg-slate-900">
          <div className="space-y-4">
            <div className="h-6 w-2/3 animate-pulse rounded-md bg-purple-100 dark:bg-purple-950/50" />
            <div className="h-4 w-full animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-48 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/40" />
          </div>
        </section>
      )}

      {report && !loading && (
        <div className="space-y-6">
          {/* Verdict + Readiness Gauge */}
          <section
            className={`flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${
              (statusStyles[report.readinessStatus] || statusStyles.build).bgClass
            }`}
          >
            <div>
              <div
                className={`text-xs font-semibold ${
                  (statusStyles[report.readinessStatus] || statusStyles.build)
                    .textClass
                }`}
              >
                {(statusStyles[report.readinessStatus] || statusStyles.build).label}
              </div>
              <h3 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
                {report.readinessVerdict}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {report.executiveSummary}
              </p>
            </div>

            <div className="flex flex-col items-center rounded-xl border border-white/60 bg-white/75 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/75">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Indeks gotowości
              </span>
              <ReadinessGauge
                score={report.readinessScore ?? 75}
                status={report.readinessStatus}
              />
            </div>
          </section>

          {/* Visual Charts for Proposed Workouts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* 7-day Planned TSS & Projected TSB Chart */}
            <section className="rounded-xl border border-purple-200/80 bg-white p-5 sm:p-6 lg:col-span-7 dark:border-purple-900/50 dark:bg-slate-900">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Wykres proponowanego tygodnia (TSS i prognoza TSB)
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Kliknij dowolny słupek dnia, aby wyświetlić strukturę interwałów obok
                  </p>
                </div>
                {planStats && (
                  <div className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    Razem:{" "}
                    <span className="font-semibold text-purple-700 dark:text-purple-400">
                      {planStats.totalTss} TSS
                    </span>{" "}
                    · {planStats.totalHours} h · {planStats.activeDays} treningi
                  </div>
                )}
              </div>

              <PlannedWeekChart
                plan={report.nextSevenDaysPlan}
                currentCtl={currentCtl}
                currentAtl={currentAtl}
                selectedIndex={selectedDayIdx}
                onSelectDay={setSelectedDayIdx}
              />
            </section>

            {/* Selected Workout Block Structure Chart */}
            <section className="rounded-xl border border-purple-200/80 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-purple-900/50 dark:bg-slate-900">
              {selectedDay && (
                <div className="flex h-full flex-col justify-between gap-4">
                  <div>
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-xs text-purple-600 dark:text-purple-400">
                          {selectedDay.day} · {selectedDay.duration} ·{" "}
                          {selectedDay.estimatedTss} TSS
                        </div>
                        <h4 className="mt-0.5 font-display text-base font-semibold text-slate-900 dark:text-white">
                          {selectedDay.focus}
                        </h4>
                      </div>
                    </div>

                    <WorkoutBlocksChart
                      blocks={selectedDay.blocks || []}
                      workoutTitle={selectedDay.focus}
                    />

                    {selectedDay.coachRationale && (
                      <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {selectedDay.coachRationale}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleCopyWorkout(selectedDay, selectedDayIdx)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {copiedDayIdx === selectedDayIdx ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Skopiowano format</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Kopiuj bloki Intervals.icu</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        askQuestion(
                          `Przeanalizuj dokładniej trening na ${selectedDay.day} (${selectedDay.focus}, ${selectedDay.duration}, ${selectedDay.estimatedTss} TSS). Jak go zrealizować w praktyce lub czym zastąpić, jeśli będę zmęczony?`
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/40"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      <span>Zapytaj AI o ten dzień</span>
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Planned vs Current Polarization Comparison */}
          {planStats && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Porównanie polaryzacji: Twój obecny trening vs Proponowany mikrocykl
                </h4>
                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-sky-500" />
                    Z1–Z2 Baza
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" />
                    Z3–Z4 Próg/Tempo
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" />
                    Z5+ VO2max
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">
                      Dotychczasowy rozkład
                    </span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {currentPolarization.lowPercent}% / {currentPolarization.midPercent}% /{" "}
                      {currentPolarization.highPercent}%
                    </span>
                  </div>
                  <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      style={{ width: `${currentPolarization.lowPercent}%` }}
                      className="bg-sky-500"
                    />
                    <div
                      style={{ width: `${currentPolarization.midPercent}%` }}
                      className="bg-amber-500"
                    />
                    <div
                      style={{ width: `${currentPolarization.highPercent}%` }}
                      className="bg-rose-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-purple-700 dark:text-purple-300">
                      Proponowany plan 7-dniowy
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-purple-700 dark:text-purple-300">
                      {planStats.lowPct}% / {planStats.midPct}% / {planStats.highPct}%
                    </span>
                  </div>
                  <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      style={{ width: `${planStats.lowPct}%` }}
                      className="bg-sky-500"
                    />
                    <div
                      style={{ width: `${planStats.midPct}%` }}
                      className="bg-amber-500"
                    />
                    <div
                      style={{ width: `${planStats.highPct}%` }}
                      className="bg-rose-500"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 3-column analytical prose */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Obciążenie i regeneracja (CTL / ATL / TSB)
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {report.loadAndRecovery}
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Strefy intensywności i polaryzacja
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {report.zonesAndPolarization}
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Wydolność tlenowa (EF i dryf tętna)
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {report.aerobicEfficiency}
              </p>
            </section>
          </div>

          {/* Strengths & Risk Flags */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Mocne strony bloku treningowego
              </h4>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                {report.strengths.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Czynniki ryzyka i korekty
              </h4>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                {report.riskFlags.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* 7-day Microcycle Table (clickable rows synced with chart) */}
          <section className="rounded-xl border border-purple-200/80 bg-white dark:border-purple-900/50 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h4 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Harmonogram mikrocyklu na 7 dni
              </h4>
              {source === "api" && (
                <button
                  type="button"
                  disabled={pushingPlan}
                  onClick={pushPlanToIntervals}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-60 whitespace-nowrap"
                >
                  <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {pushingPlan
                      ? "Wysyłanie..."
                      : "Wyślij ustrukturyzowany plan do Intervals.icu"}
                  </span>
                </button>
              )}
            </div>
            {pushStatus && (
              <div className="border-b border-slate-200 bg-purple-50/70 px-5 py-2.5 text-xs text-purple-800 dark:border-slate-800 dark:bg-purple-950/40 dark:text-purple-200">
                {pushStatus}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-5 py-2.5">Dzień</th>
                    <th className="px-4 py-2.5">Jednostka / Cel</th>
                    <th className="px-4 py-2.5">Typ</th>
                    <th className="px-4 py-2.5">Intensywność</th>
                    <th className="px-4 py-2.5 text-right">TSS</th>
                    <th className="px-5 py-2.5 text-right">Czas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {report.nextSevenDaysPlan.map((row, idx) => {
                    const isSelected = idx === selectedDayIdx;
                    return (
                      <tr
                        key={idx}
                        onClick={() => setSelectedDayIdx(idx)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-purple-50/80 dark:bg-purple-950/35"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                          {row.day}
                        </td>
                        <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">
                          {row.focus}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {row.workoutType}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {row.intensity}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-purple-700 dark:text-purple-400 whitespace-nowrap">
                          {row.estimatedTss > 0 ? row.estimatedTss : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {row.duration}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Interactive Coach Q&A */}
      <section className="rounded-xl border border-purple-200/80 bg-white p-5 sm:p-6 dark:border-purple-900/50 dark:bg-slate-900">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Zapytaj Trenera AI o swoje treningi
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Wybierz gotowe pytanie lub napisz własne — trener zna Twoje statystyki z Intervals.icu oraz wygenerowany plan 7-dniowy.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp}
              type="button"
              disabled={chatLoading}
              onClick={() => askQuestion(qp)}
              className="rounded-lg border border-purple-200/80 bg-purple-50/60 px-2.5 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300 dark:hover:bg-purple-900/40"
            >
              {qp}
            </button>
          ))}
        </div>

        {messages.length > 0 && (
          <div className="mt-4 space-y-3 border-y border-slate-200 py-4 dark:border-slate-800">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "ml-auto max-w-2xl bg-purple-600 text-white"
                    : "mr-auto max-w-3xl border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Trener analizuje dane...
              </div>
            )}
          </div>
        )}

        <form onSubmit={sendChatQuestion} className="mt-4 flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Wpisz pytanie o formę, strefy lub jutrzejszy trening..."
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={chatLoading || !question.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap shrink-0 dark:bg-purple-600 dark:hover:bg-purple-500"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span>Wyślij</span>
          </button>
        </form>
      </section>
    </div>
  );
};
