import React, { useEffect, useState } from "react";
import { Check, FolderDown, Sparkles, X } from "lucide-react";
import type {
  ActivityStreams,
  IntervalsActivity,
  IntervalsActivityDetail,
} from "../types/intervals";
import {
  formatDateFullPl,
  formatDuration,
  formatDurationLong,
  formatPace,
  sportLabelPl,
} from "../utils/analytics";
import {
  loadSavedFolders,
  parseGpxXml,
  upsertSavedRoute,
  type GpxRoute,
} from "../utils/gpx";
import { getStoredOpenRouterKey } from "../utils/openrouter";
import { ActivityStreamsChart } from "./Charts";

interface SingleActivityAiResult {
  verdict: string;
  executionSummary: string;
  highlights: string[];
  nextStepTip: string;
}

interface ActivityDetailModalProps {
  activity: IntervalsActivity | null;
  accessToken?: string;
  source: "api" | "file" | "strava";
  onClose: () => void;
  onOpenRouteInWeather?: (routeId: string) => void;
}

export const ActivityDetailModal: React.FC<ActivityDetailModalProps> = ({
  activity,
  accessToken,
  source,
  onClose,
  onOpenRouteInWeather,
}) => {
  const [detail, setDetail] = useState<IntervalsActivityDetail | null>(null);
  const [streams, setStreams] = useState<ActivityStreams | null>(null);
  const [loadingIntervals, setLoadingIntervals] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<SingleActivityAiResult | null>(null);

  const [gpxFolders] = useState(() => loadSavedFolders());
  const [targetFolder, setTargetFolder] = useState<string>("szosa");
  const [savingGpx, setSavingGpx] = useState(false);
  const [savedGpxInfo, setSavedGpxInfo] = useState<{ routeId: string; folder: string } | null>(null);
  const [gpxSaveError, setGpxSaveError] = useState<string | null>(null);

  useEffect(() => {
    setAiResult(null);
    setAiError(null);
    setStreams(null);
    setSavedGpxInfo(null);
    setGpxSaveError(null);

    if (!activity) {
      setDetail(null);
      return;
    }
    if (source !== "api") {
      setDetail(activity);
      return;
    }

    let cancelled = false;
    setLoadingIntervals(true);
    setDetail(activity);

    fetch("/api/intervals/activity-detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activityId: activity.id,
        accessToken: accessToken || undefined,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.activity) {
          setDetail(data.activity as IntervalsActivityDetail);
        }
        if (data.streams) {
          setStreams(data.streams as ActivityStreams);
        }
      })
      .catch(() => {
        // Keep base activity metrics if interval fetch fails
      })
      .finally(() => {
        if (!cancelled) setLoadingIntervals(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activity, accessToken, source]);

  if (!activity) return null;

  const act: IntervalsActivityDetail = detail || activity;
  const intervals = (act.icu_intervals || []).filter(
    (iv) => (iv.moving_time || iv.elapsed_time || 0) > 0
  );

  const handleAnalyzeWorkout = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const openrouterKey = getStoredOpenRouterKey();
      const res = await fetch("/api/analysis/activity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(openrouterKey ? { "x-openrouter-api-key": openrouterKey } : {}),
        },
        body: JSON.stringify({
          openrouterApiKey: openrouterKey || undefined,
          activity: {
            name: act.name,
            type: act.type,
            date: act.start_date_local,
            movingTimeMin: Math.round((act.moving_time || 0) / 60),
            distanceKm: Number(((act.distance || 0) / 1000).toFixed(2)),
            elevationM: Math.round(act.total_elevation_gain || 0),
            avgWatts: act.average_watts ? Math.round(act.average_watts) : null,
            npWatts: act.icu_weighted_avg_watts
              ? Math.round(act.icu_weighted_avg_watts)
              : null,
            avgHr: act.average_heartrate ? Math.round(act.average_heartrate) : null,
            maxHr: act.max_heartrate ? Math.round(act.max_heartrate) : null,
            tss: act.icu_training_load ? Math.round(act.icu_training_load) : null,
            ifPct: act.icu_intensity ? Math.round(act.icu_intensity) : null,
            ef: act.icu_efficiency_factor
              ? Number(act.icu_efficiency_factor.toFixed(2))
              : null,
            decouplingPct:
              typeof act.decoupling === "number"
                ? Number(act.decoupling.toFixed(1))
                : null,
            rpe: act.icu_rpe ?? null,
          },
          intervals: intervals.slice(0, 20).map((iv) => ({
            label: iv.label || iv.type,
            secs: iv.moving_time || iv.elapsed_time,
            avgWatts: iv.average_watts ? Math.round(iv.average_watts) : null,
            avgHr: iv.average_heartrate ? Math.round(iv.average_heartrate) : null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się przeanalizować treningu.");
      }
      setAiResult(data.analysis as SingleActivityAiResult);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "Błąd analizy treningu przez AI."
      );
    } finally {
      setAiLoading(false);
    }
  };

  const feelLabels: Record<number, string> = {
    1: "Bardzo mocny (1/5)",
    2: "Dobry (2/5)",
    3: "Normalny (3/5)",
    4: "Słabszy (4/5)",
    5: "Wyczerpany (5/5)",
  };

  const handleSaveActivityToGpxFolder = async () => {
    setSavingGpx(true);
    setGpxSaveError(null);
    try {
      if (source === "strava") {
        const res = await fetch("/api/strava/activity-to-gpx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityId: act.id,
            activityName: act.name || sportLabelPl(act.type),
            accessToken: accessToken || undefined,
            folderSlug: targetFolder,
          }),
        });
        const data = (await res.json()) as { route?: GpxRoute; error?: string };
        if (!res.ok || !data.route) {
          throw new Error(data.error || "Nie udało się pobrać śladu GPS ze Strava.");
        }
        upsertSavedRoute(data.route);
        setSavedGpxInfo({ routeId: data.route.id, folder: targetFolder });
        return;
      }

      const res = await fetch("/api/intervals/activity-gpx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: act.id,
          activityName: act.name || sportLabelPl(act.type),
          accessToken: accessToken || undefined,
        }),
      });
      const data = (await res.json()) as { gpxXml?: string; fileName?: string; error?: string };
      if (!res.ok || !data.gpxXml) {
        throw new Error(data.error || "Nie udało się pobrać śladu GPX.");
      }

      const parsed = parseGpxXml(data.gpxXml, data.fileName || `${act.id}.gpx`, targetFolder);
      const isGravel = (act.type || "").toLowerCase().includes("gravel");
      const isMtb = (act.type || "").toLowerCase().includes("mountain");
      const bikeType = isMtb ? "mtb" : isGravel ? "gravel" : "road";
      const avgSpeedKmh =
        act.average_speed && act.average_speed > 1
          ? Number((act.average_speed * 3.6).toFixed(1))
          : 30;

      const routeToSave = {
        ...parsed,
        id: `icu_${act.id}`,
        name: act.name || parsed.name,
        folder: targetFolder,
        bikeType: bikeType as "road" | "gravel" | "mtb",
        avgSpeedKmh,
        surface: (isMtb ? "mtb" : isGravel ? "szuter" : "asfalt") as "asfalt" | "szuter" | "mtb",
        notes: `Zapisano z aktywności Intervals.icu (${formatDateFullPl(act.start_date_local)})`,
      };

      upsertSavedRoute(routeToSave);

      await fetch("/api/gpx/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route: routeToSave,
          rawXml: data.gpxXml,
        }),
      });

      setSavedGpxInfo({ routeId: routeToSave.id, folder: targetFolder });
    } catch (err) {
      setGpxSaveError(
        err instanceof Error ? err.message : "Błąd zapisu GPX do podfolderu."
      );
    } finally {
      setSavingGpx(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {formatDateFullPl(act.start_date_local)} · {sportLabelPl(act.type)}
              {act.source ? ` · ${act.source}` : ""}
            </div>
            <h2
              id="activity-modal-title"
              className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white"
            >
              {act.name || sportLabelPl(act.type)}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {(source === "api" || source === "strava") && !act.trainer && (act.distance || 0) > 500 && (
              <div className="inline-flex items-center gap-1 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 px-2 py-1">
                <select
                  value={targetFolder}
                  onChange={(e) => setTargetFolder(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
                  title="Docelowy podfolder w saved_routes"
                >
                  {gpxFolders.map((f) => (
                    <option key={f.slug} value={f.slug}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {savedGpxInfo ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenRouteInWeather) {
                        onOpenRouteInWeather(savedGpxInfo.routeId);
                        onClose();
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 whitespace-nowrap"
                  >
                    <Check className="h-3 w-3" />
                    <span>Otwórz w Pogodzie</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={savingGpx}
                    onClick={() => void handleSaveActivityToGpxFolder()}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-sky-500 disabled:opacity-60 whitespace-nowrap"
                  >
                    <FolderDown className="h-3 w-3" />
                    <span>{savingGpx ? "Zapisuję..." : "Zapisz do folderu"}</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={aiLoading}
              onClick={handleAnalyzeWorkout}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {aiLoading ? "Analizuję..." : "Przeanalizuj ten trening przez AI"}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Zamknij szczegóły aktywności"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {gpxSaveError && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            {gpxSaveError}
          </div>
        )}

        {/* AI Single Workout Result */}
        {aiError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {aiError}
          </div>
        )}
        {aiResult && (
          <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50/70 p-4 dark:border-purple-900/60 dark:bg-purple-950/25">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                Ocena Trenera AI
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                <Sparkles className="h-2.5 w-2.5" />
                OpenRouter · Llama 3.3 70B (Free)
              </span>
            </div>
            <div className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
              {aiResult.verdict}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {aiResult.executionSummary}
            </p>
            {aiResult.highlights.length > 0 && (
              <ul className="mt-2.5 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                {aiResult.highlights.map((h, i) => (
                  <li key={i}>• {h}</li>
                ))}
              </ul>
            )}
            <div className="mt-2.5 border-t border-purple-200/80 pt-2 text-xs font-medium text-purple-800 dark:border-purple-900/50 dark:text-purple-300">
              Kolejny krok: {aiResult.nextStepTip}
            </div>
          </div>
        )}

        {/* Core metrics grid */}
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Czas ruchu</div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {formatDuration(act.moving_time)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Dystans</div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {act.distance > 0 ? `${(act.distance / 1000).toFixed(2)} km` : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Obciążenie (TSS)</div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
              {act.icu_training_load ? Math.round(act.icu_training_load) : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Intensywność (IF)</div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {act.icu_intensity ? `${Math.round(act.icu_intensity)}%` : "—"}
            </div>
          </div>
        </div>

        {/* Telemetry Streams Chart */}
        {streams && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Przebieg telemetrii (Moc, Tętno, Prędkość, Wysokość)
              </h3>
            </div>
            <ActivityStreamsChart streams={streams} sportType={act.type} />
          </div>
        )}

        {/* Secondary physiology metrics */}
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 border-y border-slate-200 py-4 text-xs sm:grid-cols-4 dark:border-slate-800">
          <div className="flex justify-between sm:block">
            <span className="text-slate-500 dark:text-slate-400">Śr. / NP Moc</span>
            <div className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {act.average_watts ? `${Math.round(act.average_watts)} W` : "—"}
              {act.icu_weighted_avg_watts
                ? ` / ${Math.round(act.icu_weighted_avg_watts)} W`
                : ""}
            </div>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-500 dark:text-slate-400">Śr. / Maks. Tętno</span>
            <div className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {act.average_heartrate ? `${Math.round(act.average_heartrate)}` : "—"}
              {act.max_heartrate ? ` / ${Math.round(act.max_heartrate)} bpm` : ""}
            </div>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-500 dark:text-slate-400">Tempo / Prędkość</span>
            <div className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {formatPace(act.average_speed, act.type)}
            </div>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-500 dark:text-slate-400">Przewyższenie</span>
            <div className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {act.total_elevation_gain
                ? `${Math.round(act.total_elevation_gain)} m`
                : "—"}
            </div>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-500 dark:text-slate-400">EF (Wydajność)</span>
            <div className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {act.icu_efficiency_factor
                ? act.icu_efficiency_factor.toFixed(2)
                : "—"}
            </div>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-500 dark:text-slate-400">Dryf tętna</span>
            <div className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {typeof act.decoupling === "number"
                ? `${act.decoupling.toFixed(1)}%`
                : "—"}
            </div>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-500 dark:text-slate-400">Kadencja</span>
            <div className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {act.average_cadence ? `${Math.round(act.average_cadence)} rpm` : "—"}
            </div>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-500 dark:text-slate-400">RPE / Samopoczucie</span>
            <div className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {act.icu_rpe ? `RPE ${act.icu_rpe}/10` : "—"}
              {act.feel && feelLabels[act.feel] ? ` · ${feelLabels[act.feel]}` : ""}
            </div>
          </div>
        </div>

        {act.description && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            {act.description}
          </div>
        )}

        {/* Intervals table */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Wykryte interwały i odcinki
            </h3>
            {loadingIntervals && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Pobieranie telemetrii i interwałów z Intervals.icu...
              </span>
            )}
          </div>

          {intervals.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {loadingIntervals
                ? "Ładowanie struktury treningu..."
                : "Brak szczegółowych odcinków interwałowych dla tej aktywności."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Typ</th>
                    <th className="px-3 py-2 text-right">Czas</th>
                    <th className="px-3 py-2 text-right">Dystans</th>
                    <th className="px-3 py-2 text-right">Śr. Moc</th>
                    <th className="px-3 py-2 text-right">Śr. Tętno</th>
                    <th className="px-3 py-2 text-right">Tempo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {intervals.slice(0, 30).map((iv, idx) => (
                    <tr key={iv.id || idx}>
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                        {iv.label ||
                          (iv.type === "WORK"
                            ? "Praca"
                            : iv.type === "RECOVERY"
                            ? "Odpoczynek"
                            : iv.type || "Odcinek")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatDurationLong(iv.moving_time || iv.elapsed_time)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {iv.distance && iv.distance > 0
                          ? `${(iv.distance / 1000).toFixed(2)} km`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                        {iv.average_watts
                          ? `${Math.round(iv.average_watts)} W`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {iv.average_heartrate
                          ? `${Math.round(iv.average_heartrate)} bpm`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {formatPace(iv.average_speed, act.type)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

