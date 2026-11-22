import React, { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Footprints,
  HeartPulse,
  Moon,
  PlusCircle,
  Scale,
  Wind,
} from "lucide-react";
import type {
  IntervalsActivity,
  IntervalsAthlete,
  IntervalsWellnessDay,
  PmcPoint,
  ZoneDistributionItem,
} from "../types/intervals";
import {
  computeHealthLoadCorrelation,
  formatDateFullPl,
  formatDuration,
} from "../utils/analytics";
import {
  ActivityHeartRateChart,
  HealthLoadCorrelationChart,
  HrvRhrBaselineChart,
  MiniSparkline,
  SleepDetailChart,
} from "./Charts";

interface HealthViewProps {
  athlete: IntervalsAthlete;
  wellness: IntervalsWellnessDay[];
  activities: IntervalsActivity[];
  pmc: PmcPoint[];
  hrZones: ZoneDistributionItem[];
  daysWindow: number;
  source: "api" | "file" | "strava";
  athleteId?: string;
  accessToken?: string;
  onWellnessSaved?: () => void;
  onOpenMetricModal?: (metric: "rhr" | "hrv" | "weight" | "steps") => void;
}

function avgNums(nums: Array<number | null | undefined>): number | null {
  const valid = nums.filter((v): v is number => typeof v === "number" && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

export const HealthView: React.FC<HealthViewProps> = ({
  athlete,
  wellness,
  activities,
  pmc,
  hrZones,
  daysWindow,
  source,
  athleteId,
  accessToken,
  onWellnessSaved,
  onOpenMetricModal,
}) => {
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryDate, setEntryDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [entryWeight, setEntryWeight] = useState("");
  const [entryRhr, setEntryRhr] = useState("");
  const [entryHrv, setEntryHrv] = useState("");
  const [entrySleepH, setEntrySleepH] = useState("");
  const [entryStress, setEntryStress] = useState("");
  const [entryFatigue, setEntryFatigue] = useState("");
  const [entrySoreness, setEntrySoreness] = useState("");
  const [savingWellness, setSavingWellness] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleSaveWellness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingWellness || source !== "api") return;

    const wellnessData: Record<string, number> = {};
    if (entryWeight.trim()) wellnessData.weight = Number(entryWeight);
    if (entryRhr.trim()) wellnessData.restingHR = Math.round(Number(entryRhr));
    if (entryHrv.trim()) wellnessData.hrv = Math.round(Number(entryHrv));
    if (entrySleepH.trim())
      wellnessData.sleepSecs = Math.round(Number(entrySleepH) * 3600);
    if (entryStress.trim()) wellnessData.stress = Number(entryStress);
    if (entryFatigue.trim()) wellnessData.fatigue = Number(entryFatigue);
    if (entrySoreness.trim()) wellnessData.soreness = Number(entrySoreness);

    if (Object.keys(wellnessData).length === 0) {
      setSaveMessage("Wpisz przynajmniej jedną wartość przed zapisem.");
      return;
    }

    setSavingWellness(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/intervals/wellness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          accessToken,
          date: entryDate,
          wellnessData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się zapisać wpisu Wellness.");
      }
      setSaveMessage(`Zapisano wpis Wellness dla dnia ${formatDateFullPl(entryDate)} w Intervals.icu.`);
      onWellnessSaved?.();
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? `Błąd: ${err.message}` : "Błąd zapisu Wellness."
      );
    } finally {
      setSavingWellness(false);
    }
  };

  const correlation = computeHealthLoadCorrelation(pmc, wellness);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - daysWindow);

  const windowWellness = wellness
    .filter((w) => new Date(`${w.id.slice(0, 10)}T12:00:00`) >= cutoff)
    .sort((a, b) => a.id.localeCompare(b.id));

  const recent7 = windowWellness.slice(-7);
  const lastEntry = [...windowWellness]
    .reverse()
    .find(
      (w) =>
        w.restingHR ||
        w.hrv ||
        w.sleepSecs ||
        w.weight ||
        w.steps ||
        w.spO2 ||
        w.respiration
    );

  const rhrSeries = windowWellness
    .map((w) => w.restingHR)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const hrvSeries = windowWellness
    .map((w) => w.hrv)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const sleepSeries = windowWellness
    .map((w) => (w.sleepSecs ? w.sleepSecs / 3600 : null))
    .filter((v): v is number => typeof v === "number" && v > 0);

  const latestRhr =
    [...windowWellness].reverse().find((w) => w.restingHR)?.restingHR ??
    athlete.icu_resting_hr ??
    null;
  const avgRhr7 = avgNums(recent7.map((w) => w.restingHR));
  const avgRhrWindow = avgNums(windowWellness.map((w) => w.restingHR));

  const latestHrv = [...windowWellness].reverse().find((w) => w.hrv)?.hrv ?? null;
  const avgHrv7 = avgNums(recent7.map((w) => w.hrv));
  const avgHrvWindow = avgNums(windowWellness.map((w) => w.hrv));

  const latestSleepRow = [...windowWellness].reverse().find((w) => w.sleepSecs);
  const avgSleep7 = avgNums(
    recent7.map((w) => (w.sleepSecs ? w.sleepSecs / 3600 : null))
  );

  const latestWeight =
    [...windowWellness].reverse().find((w) => w.weight)?.weight ??
    athlete.weight ??
    null;
  const latestSleepingHr =
    [...windowWellness].reverse().find((w) => w.avgSleepingHR)?.avgSleepingHR ??
    null;
  const latestSpO2 =
    [...windowWellness].reverse().find((w) => w.spO2)?.spO2 ?? null;
  const latestResp =
    [...windowWellness].reverse().find((w) => w.respiration)?.respiration ?? null;
  const latestSteps =
    [...windowWellness].reverse().find((w) => w.steps)?.steps ?? null;
  const avgSteps7 = avgNums(recent7.map((w) => w.steps));
  const latestVo2 =
    [...windowWellness].reverse().find((w) => w.vo2max)?.vo2max ?? null;

  const cyclingOrRunSettings = athlete.sportSettings?.find((s) => s.lthr || s.max_hr);
  const lthr = cyclingOrRunSettings?.lthr ?? null;
  const maxHrSetting = cyclingOrRunSettings?.max_hr ?? null;

  const hrActivities = activities.filter(
    (a) => typeof a.average_heartrate === "number" && a.average_heartrate > 0
  );
  const avgWorkoutHr = avgNums(hrActivities.map((a) => a.average_heartrate));
  const peakWorkoutHr = hrActivities.reduce(
    (max, a) => Math.max(max, Number(a.max_heartrate) || 0),
    0
  );

  const totalHrZoneSecs = hrZones.reduce((s, z) => s + z.secs, 0);

  const rhrDelta =
    avgRhr7 !== null && avgRhrWindow !== null ? avgRhr7 - avgRhrWindow : null;
  const hrvDeltaPct =
    avgHrv7 !== null && avgHrvWindow !== null && avgHrvWindow > 0
      ? ((avgHrv7 - avgHrvWindow) / avgHrvWindow) * 100
      : null;

  const recentJournal = [...windowWellness]
    .reverse()
    .filter(
      (w) =>
        w.restingHR ||
        w.hrv ||
        w.sleepSecs ||
        w.weight ||
        w.steps ||
        w.avgSleepingHR ||
        w.spO2
    )
    .slice(0, 14);

  const hasAnyWellnessData = windowWellness.some(
    (w) => w.restingHR || w.hrv || w.sleepSecs || w.weight || w.steps
  );

  return (
    <div className="space-y-6">
      {/* Intro Banner specific to Health & Recovery */}
      <section className="rounded-xl border border-teal-200/80 bg-white/90 p-5 sm:p-6 dark:border-teal-900/60 dark:bg-teal-950/25">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-teal-50">
              Zdrowie, Tętno i Regeneracja
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-teal-200/70">
              Parametry układu krążenia, zmienność rytmu zatokowego (HRV), sen i biometria z Intervals.icu
              {lastEntry ? ` · Ostatni zapis: ${formatDateFullPl(lastEntry.id)}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 font-mono text-xs tabular-nums text-slate-700 dark:text-teal-100">
            {lthr && (
              <div>
                <span className="text-slate-500 dark:text-teal-300/70">LTHR </span>
                <span className="font-semibold">{lthr} bpm</span>
              </div>
            )}
            {maxHrSetting && (
              <div>
                <span className="text-slate-500 dark:text-teal-300/70">HR Max </span>
                <span className="font-semibold">{maxHrSetting} bpm</span>
              </div>
            )}
            {latestVo2 && (
              <div>
                <span className="text-slate-500 dark:text-teal-300/70">VO2max </span>
                <span className="font-semibold text-teal-700 dark:text-teal-300">
                  {Math.round(latestVo2)}
                </span>
              </div>
            )}
            {source === "api" && (
              <button
                type="button"
                onClick={() => setShowEntryForm((v) => !v)}
                className="no-print inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-teal-700 whitespace-nowrap"
              >
                <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{showEntryForm ? "Ukryj formularz" : "Szybki wpis Wellness"}</span>
              </button>
            )}
          </div>
        </div>

        {showEntryForm && source === "api" && (
          <form
            onSubmit={handleSaveWellness}
            className="no-print mt-4 border-t border-teal-200/70 pt-4 dark:border-teal-900/50"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-teal-200/80">
                  Data
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full rounded-md border border-teal-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:border-teal-900 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-teal-200/80">
                  Waga (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="np. 72.4"
                  value={entryWeight}
                  onChange={(e) => setEntryWeight(e.target.value)}
                  className="w-full rounded-md border border-teal-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:border-teal-900 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-teal-200/80">
                  RHR (bpm)
                </label>
                <input
                  type="number"
                  placeholder="np. 48"
                  value={entryRhr}
                  onChange={(e) => setEntryRhr(e.target.value)}
                  className="w-full rounded-md border border-teal-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:border-teal-900 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-teal-200/80">
                  HRV (ms)
                </label>
                <input
                  type="number"
                  placeholder="np. 68"
                  value={entryHrv}
                  onChange={(e) => setEntryHrv(e.target.value)}
                  className="w-full rounded-md border border-teal-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:border-teal-900 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-teal-200/80">
                  Sen (godz.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="np. 7.5"
                  value={entrySleepH}
                  onChange={(e) => setEntrySleepH(e.target.value)}
                  className="w-full rounded-md border border-teal-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:border-teal-900 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-teal-200/80">
                  Stres (1–4)
                </label>
                <select
                  value={entryStress}
                  onChange={(e) => setEntryStress(e.target.value)}
                  className="w-full rounded-md border border-teal-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:border-teal-900 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">—</option>
                  <option value="1">1 Niski</option>
                  <option value="2">2 Średni</option>
                  <option value="3">3 Podwyższ.</option>
                  <option value="4">4 Wysoki</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-teal-200/80">
                  Zmęczenie (1–4)
                </label>
                <select
                  value={entryFatigue}
                  onChange={(e) => setEntryFatigue(e.target.value)}
                  className="w-full rounded-md border border-teal-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:border-teal-900 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">—</option>
                  <option value="1">1 Świeży</option>
                  <option value="2">2 Lekkie</option>
                  <option value="3">3 Duże</option>
                  <option value="4">4 Wyczerp.</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-teal-200/80">
                  Bolesność (1–4)
                </label>
                <select
                  value={entrySoreness}
                  onChange={(e) => setEntrySoreness(e.target.value)}
                  className="w-full rounded-md border border-teal-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:border-teal-900 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">—</option>
                  <option value="1">1 Brak</option>
                  <option value="2">2 Lekka</option>
                  <option value="3">3 Wyraźna</option>
                  <option value="4">4 Silna</option>
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-teal-700 dark:text-teal-300">
                {saveMessage && (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {saveMessage}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={savingWellness}
                className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
              >
                {savingWellness ? "Zapisywanie..." : "Zapisz w Intervals.icu"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 4 Health KPI Cards */}
      <section
        aria-label="Kluczowe parametry zdrowia"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <div
          onClick={() => onOpenMetricModal?.("rhr")}
          className="rounded-xl border border-teal-200/80 bg-white/95 p-5 dark:border-teal-900/60 dark:bg-slate-900/90 cursor-pointer hover:border-teal-400 dark:hover:border-teal-700 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Tętno spoczynkowe (RHR)</span>
            <HeartPulse className="h-4 w-4 text-rose-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-3xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">
              {latestRhr ? `${Math.round(latestRhr)}` : "—"}
              {latestRhr && (
                <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">
                  bpm
                </span>
              )}
            </span>
            {rhrDelta !== null && (
              <span
                className={`font-mono text-xs tabular-nums ${
                  rhrDelta <= 1.5
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {rhrDelta >= 0 ? `+${rhrDelta.toFixed(1)}` : rhrDelta.toFixed(1)} vs baza
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {avgRhr7 !== null
              ? `Śr. 7 dni: ${avgRhr7.toFixed(1)} bpm`
              : "Brak nocnych odczytów RHR"}
            {latestSleepingHr ? ` · W śnie: ${Math.round(latestSleepingHr)} bpm` : ""}
          </div>
          <div className="mt-3">
            <MiniSparkline values={rhrSeries.slice(-30)} color="#F43F5E" id="rhr" />
          </div>
        </div>

        <div
          onClick={() => onOpenMetricModal?.("hrv")}
          className="rounded-xl border border-teal-200/80 bg-white/95 p-5 dark:border-teal-900/60 dark:bg-slate-900/90 cursor-pointer hover:border-teal-400 dark:hover:border-teal-700 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Zmienność rytmu (HRV)</span>
            <Activity className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-3xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">
              {latestHrv ? `${Math.round(latestHrv)}` : "—"}
              {latestHrv && (
                <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">
                  ms
                </span>
              )}
            </span>
            {hrvDeltaPct !== null && (
              <span
                className={`font-mono text-xs tabular-nums ${
                  hrvDeltaPct >= -5
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {hrvDeltaPct >= 0
                  ? `+${hrvDeltaPct.toFixed(1)}%`
                  : `${hrvDeltaPct.toFixed(1)}%`}{" "}
                vs baza
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {avgHrv7 !== null
              ? `Śr. 7 dni: ${Math.round(avgHrv7)} ms`
              : "Brak odczytów HRV rMSSD"}
          </div>
          <div className="mt-3">
            <MiniSparkline values={hrvSeries.slice(-30)} color="#10B981" id="hrv" />
          </div>
        </div>

        <div className="rounded-xl border border-teal-200/80 bg-white/95 p-5 dark:border-teal-900/60 dark:bg-slate-900/90">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Sen i regeneracja nocna</span>
            <Moon className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-3xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">
              {latestSleepRow?.sleepSecs
                ? formatDuration(latestSleepRow.sleepSecs)
                : "—"}
            </span>
            {latestSleepRow?.sleepScore && (
              <span className="font-mono text-xs tabular-nums text-teal-700 dark:text-teal-400">
                Wynik {Math.round(latestSleepRow.sleepScore)}/100
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {avgSleep7 !== null
              ? `Śr. 7 nocy: ${avgSleep7.toFixed(1)} h (cel ≥ 7.5 h)`
              : "Brak zapisanego czasu snu"}
          </div>
          <div className="mt-3">
            <MiniSparkline values={sleepSeries.slice(-30)} color="#0D9488" id="sleep" />
          </div>
        </div>

        <div
          onClick={() => onOpenMetricModal?.("weight")}
          className="rounded-xl border border-teal-200/80 bg-white/95 p-5 dark:border-teal-900/60 dark:bg-slate-900/90 cursor-pointer hover:border-teal-400 dark:hover:border-teal-700 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Tętno wysiłkowe i masa</span>
            <Scale className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-3xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">
              {avgWorkoutHr ? `${Math.round(avgWorkoutHr)}` : "—"}
              {avgWorkoutHr && (
                <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">
                  bpm śr.
                </span>
              )}
            </span>
            {peakWorkoutHr > 0 && (
              <span className="font-mono text-xs tabular-nums text-rose-600 dark:text-rose-400">
                Maks. {Math.round(peakWorkoutHr)} bpm
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {latestWeight ? `Waga: ${latestWeight.toFixed(1)} kg` : "Brak wagi"}
            {avgSteps7 ? ` · Śr. kroki: ${Math.round(avgSteps7)}` : ""}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
            {latestSpO2 && <span>SpO2 {latestSpO2.toFixed(0)}%</span>}
            {latestResp && <span>Oddech {latestResp.toFixed(1)}/min</span>}
            {latestSteps && (
              <span className="inline-flex items-center gap-1">
                <Footprints className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                {latestSteps}
              </span>
            )}
          </div>
        </div>
      </section>

      {!hasAnyWellnessData && (
        <section className="rounded-xl border border-teal-200/80 bg-white/95 p-5 text-sm text-slate-700 dark:border-teal-900/60 dark:bg-slate-900/90 dark:text-slate-300">
          W Intervals.icu nie wykryto jeszcze dziennych wpisów Wellness (HRV, RHR, sen). Poniżej prezentujemy pełną analizę tętna z Twoich aktywności treningowych; aby zobaczyć wykresy snu i HRV, połącz zegarek (Garmin / Apple Health / Oura / Whoop / Polar) z kontem Intervals.icu lub uzupełnij zakładkę Wellness.
        </section>
      )}

      {/* Charts Row 1: Sleep Detail + HRV/RHR Baseline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-teal-200/80 bg-white/95 p-5 sm:p-6 lg:col-span-6 dark:border-teal-900/60 dark:bg-slate-900/90">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Analiza snu (czas trwania i jakość)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Porównanie do progu regeneracyjnego 7.5 h · Ostatnie 30 nocy
            </p>
          </div>
          <SleepDetailChart wellness={windowWellness} />
        </section>

        <section className="rounded-xl border border-teal-200/80 bg-white/95 p-5 sm:p-6 lg:col-span-6 dark:border-teal-900/60 dark:bg-slate-900/90">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              HRV i tętno spoczynkowe względem normy
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Cieniowane pasmo oznacza zakres normy indywidualnej (±1 SD)
            </p>
          </div>
          <HrvRhrBaselineChart wellness={windowWellness} />
        </section>
      </div>

      {/* Charts Row 2: Activity Heart Rate Trend + HR Zones Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-teal-200/80 bg-white/95 p-5 sm:p-6 lg:col-span-7 dark:border-teal-900/60 dark:bg-slate-900/90">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Tętno treningowe (Śr. HR vs Maks. HR na sesjach)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Przebieg obciążenia sercowo-naczyniowego w wybranym okresie
              {lthr ? ` · Próg LTHR: ${lthr} bpm` : ""}
            </p>
          </div>
          <ActivityHeartRateChart activities={activities} lthr={lthr} />
        </section>

        <section className="rounded-xl border border-teal-200/80 bg-white/95 p-5 sm:p-6 lg:col-span-5 dark:border-teal-900/60 dark:bg-slate-900/90">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Rozkład tętna w strefach wysiłkowych
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Czas pracy układu krążenia w strefach HR Z1–Z5
            </p>
          </div>

          {totalHrZoneSecs === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Brak danych stref tętna dla aktywności w tym okresie.
            </div>
          ) : (
            <div className="space-y-3.5">
              {hrZones.map((z) => (
                <div key={z.zone}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {z.label}
                    </span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatDuration(z.secs)} ·{" "}
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {z.percent.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      style={{
                        width: `${Math.max(z.secs > 0 ? 1.5 : 0, z.percent)}%`,
                        backgroundColor: z.color,
                      }}
                      className="h-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {(latestSpO2 || latestResp || lastEntry?.stress || lastEntry?.fatigue) && (
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
              {latestSpO2 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Saturacja SpO2</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {latestSpO2.toFixed(1)}%
                  </span>
                </div>
              )}
              {latestResp && (
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <Wind className="h-3.5 w-3.5" aria-hidden="true" />
                    Oddech
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {latestResp.toFixed(1)} /min
                  </span>
                </div>
              )}
              {lastEntry?.stress && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Stres</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {lastEntry.stress}/4
                  </span>
                </div>
              )}
              {lastEntry?.fatigue && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Zmęczenie</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {lastEntry.fatigue}/4
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Health vs Training Load Correlation */}
      {correlation.points.length >= 4 && (
        <section className="rounded-xl border border-teal-200/80 bg-white/95 p-5 sm:p-6 dark:border-teal-900/60 dark:bg-slate-900/90">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Korelacja obciążenia treningowego i regeneracji (ATL vs HRV)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Analiza wpływu zmęczenia (ATL) na układ nerwowy (HRV) i sen w ostatnich 45 dniach
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
              {correlation.corrAtlHrv !== null && (
                <span className="text-slate-700 dark:text-slate-300">
                  Korelacja ATL↔HRV:{" "}
                  <span className="font-semibold text-teal-700 dark:text-teal-300">
                    r = {correlation.corrAtlHrv}
                  </span>
                </span>
              )}
              {correlation.lowLoadAvgHrv !== null &&
                correlation.highLoadAvgHrv !== null && (
                  <span className="text-slate-600 dark:text-slate-400">
                    HRV (niskie vs wysokie ATL):{" "}
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {correlation.lowLoadAvgHrv} ms
                    </span>{" "}
                    vs{" "}
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {correlation.highLoadAvgHrv} ms
                    </span>
                  </span>
                )}
            </div>
          </div>

          <HealthLoadCorrelationChart points={correlation.points} />
        </section>
      )}

      {/* Wellness Journal Table */}
      {recentJournal.length > 0 && (
        <section className="rounded-xl border border-teal-200/80 bg-white/95 dark:border-teal-900/60 dark:bg-slate-900/90">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Dziennik regeneracji i biometrii (ostatnie 14 wpisów)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-2.5">Data</th>
                  <th className="px-4 py-2.5 text-right">RHR</th>
                  <th className="px-4 py-2.5 text-right">Tętno w śnie</th>
                  <th className="px-4 py-2.5 text-right">HRV</th>
                  <th className="px-4 py-2.5 text-right">Czas snu</th>
                  <th className="px-4 py-2.5 text-right">Jakość snu</th>
                  <th className="px-4 py-2.5 text-right">Waga</th>
                  <th className="px-4 py-2.5 text-right">Kroki</th>
                  <th className="px-5 py-2.5 text-right">SpO2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentJournal.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-teal-50/50 dark:hover:bg-teal-950/30"
                  >
                    <td className="px-5 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatDateFullPl(row.id)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                      {row.restingHR ? `${row.restingHR} bpm` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {row.avgSleepingHR ? `${Math.round(row.avgSleepingHR)} bpm` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {row.hrv ? `${Math.round(row.hrv)} ms` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-teal-700 dark:text-teal-300">
                      {row.sleepSecs ? formatDuration(row.sleepSecs) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {row.sleepScore ? `${Math.round(row.sleepScore)}/100` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {row.weight ? `${row.weight.toFixed(1)} kg` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {row.steps ? row.steps.toLocaleString("pl-PL") : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {row.spO2 ? `${row.spO2.toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
