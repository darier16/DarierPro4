import React, { useState } from "react";
import type {
  EfficiencyPoint,
  ZoneDistributionItem,
} from "../types/intervals";
import {
  computeSeilerPolarization,
  formatDateFullPl,
  formatDuration,
  formatDurationLong,
  type CriticalPowerModel,
  type IntensityScatterPoint,
  type PowerBenchmarkPoint,
  type RunningSummary,
  type WeeklyZoneStackPoint,
} from "../utils/analytics";
import {
  DecouplingChart,
  EfficiencyChart,
  IntensityScatterChart,
  PowerCurveChart,
  WeeklyZoneStackChart,
} from "./Charts";

interface ZonesViewProps {
  powerZones: ZoneDistributionItem[];
  hrZones: ZoneDistributionItem[];
  efficiency: EfficiencyPoint[];
  weeklyZoneStack: WeeklyZoneStackPoint[];
  intensityScatter: IntensityScatterPoint[];
  powerSummary: {
    benchmarks: PowerBenchmarkPoint[];
    eFtp: number | null;
    riderProfile: string;
    hasData: boolean;
  };
  cpModel: CriticalPowerModel;
  runningSummary: RunningSummary;
}

export const ZonesView: React.FC<ZonesViewProps> = ({
  powerZones,
  hrZones,
  efficiency,
  weeklyZoneStack,
  intensityScatter,
  powerSummary,
  cpModel,
  runningSummary,
}) => {
  const hasPower = powerZones.reduce((s, z) => s + z.secs, 0) > 0;
  const hasHr = hrZones.reduce((s, z) => s + z.secs, 0) > 0;

  const [zoneType, setZoneType] = useState<"power" | "hr">(
    hasPower ? "power" : "hr"
  );
  const [mmpUnit, setMmpUnit] = useState<"watts" | "wkg">("watts");
  const [targetPowerWatts, setTargetPowerWatts] = useState<number>(
    cpModel.cpWatts ? Math.round(cpModel.cpWatts * 1.15) : 320
  );

  const activeZones = zoneType === "power" && hasPower ? powerZones : hrZones;
  const totalZoneSecs = activeZones.reduce((s, z) => s + z.secs, 0);
  const polarization = computeSeilerPolarization(activeZones);

  const decouplingSamples = efficiency.filter((e) => e.decoupling !== null);
  const avgDecoupling =
    decouplingSamples.length > 0
      ? decouplingSamples.reduce((s, e) => s + (e.decoupling || 0), 0) /
        decouplingSamples.length
      : null;

  const keyDurations = powerSummary.benchmarks.filter((b) =>
    [5, 60, 300, 1200].includes(b.secs)
  );

  return (
    <div className="space-y-6">
      {/* Power Curve & Rider Profile */}
      {powerSummary.hasData && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Krzywa mocy (MMP) i profil wydolnościowy
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Profil: <span className="font-medium text-slate-800 dark:text-slate-200">{powerSummary.riderProfile}</span>
                {powerSummary.eFtp ? ` · Szacowane eFTP: ${powerSummary.eFtp} W` : ""}
              </p>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setMmpUnit("watts")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  mmpUnit === "watts"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                Waty (W)
              </button>
              <button
                type="button"
                onClick={() => setMmpUnit("wkg")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  mmpUnit === "wkg"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                W/kg
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <PowerCurveChart
                benchmarks={powerSummary.benchmarks}
                unitMode={mmpUnit}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:col-span-4 lg:content-start">
              {keyDurations.map((b) => (
                <div
                  key={b.secs}
                  className="rounded-lg border border-amber-200/70 bg-amber-50/35 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/15"
                >
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Rekord {b.label}
                  </div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {mmpUnit === "wkg"
                      ? b.recentWkg
                        ? `${b.recentWkg} W/kg`
                        : "—"
                      : b.recentWatts
                      ? `${b.recentWatts} W`
                      : "—"}
                  </div>
                  <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    Rok:{" "}
                    {mmpUnit === "wkg"
                      ? b.seasonWkg
                        ? `${b.seasonWkg} W/kg`
                        : "—"
                      : b.seasonWatts
                      ? `${b.seasonWatts} W`
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Critical Power (CP) & W' Interactive Calculator */}
          {cpModel.hasCp && cpModel.cpWatts && cpModel.wPrimeJ && (
            <div className="mt-5 grid grid-cols-1 gap-4 rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 md:grid-cols-12 dark:border-amber-900/50 dark:bg-amber-950/20">
              <div className="md:col-span-5">
                <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  Model Mocy Krytycznej (Critical Power i W&apos;)
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-6">
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Moc Krytyczna (CP)
                    </span>
                    <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {cpModel.cpWatts} W
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Pojemność beztlenowa (W&apos;)
                    </span>
                    <div className="font-mono text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      {cpModel.wPrimeKj} kJ
                    </div>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Wyliczono metodą regresji liniowej 2-parametrowej (3–20 min MMP).
                </p>
              </div>

              <div className="flex flex-col justify-center md:col-span-7">
                {(() => {
                  const cp = cpModel.cpWatts || 250;
                  const minW = cp + 10;
                  const maxW = Math.round(cp * 2.1);
                  const clampedW = Math.max(minW, Math.min(maxW, targetPowerWatts));
                  const tteSecs = Math.round(
                    (cpModel.wPrimeJ || 15000) / Math.max(1, clampedW - cp)
                  );
                  return (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          Kalkulator czasu do wyczerpania przy zadanej mocy
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                          {clampedW} W ({Math.round((clampedW / cp) * 100)}% CP)
                        </span>
                      </div>
                      <input
                        type="range"
                        min={minW}
                        max={maxW}
                        step={5}
                        value={clampedW}
                        onChange={(e) => setTargetPowerWatts(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                      <div className="mt-1.5 flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          Przewidywany maksymalny czas utrzymania wysiłku:
                        </span>
                        <span className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                          {formatDurationLong(tteSecs)} ({tteSecs} s)
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Running Analytics & Race Predictions */}
      {runningSummary.hasRunning && (
        <section className="rounded-xl border border-emerald-200/80 bg-white p-5 sm:p-6 dark:border-emerald-900/50 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Analityka biegowa i prognoza wyników startowych
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {runningSummary.runsCount} biegów ({runningSummary.totalRunKm} km)
                {runningSummary.thresholdPaceStr
                  ? ` · Szacowane tempo progowe: ${runningSummary.thresholdPaceStr}`
                  : ""}
                {runningSummary.referenceBasis
                  ? ` · ${runningSummary.referenceBasis}`
                  : ""}
              </p>
            </div>
          </div>

          {runningSummary.racePredictions.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {runningSummary.racePredictions.map((pred) => (
                <div
                  key={pred.label}
                  className="rounded-lg border border-emerald-200/70 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/15"
                >
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Prognoza {pred.label}
                  </div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {pred.predictedTimeStr}
                  </div>
                  <div className="mt-1 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    Śr. tempo: {pred.paceStr}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Wykonaj co najmniej jeden bieg ≥ 2.5 km, aby obliczyć prognozy czasowe na 5 km, 10 km, półmaraton i maraton (wzór Riegela).
            </p>
          )}

          {runningSummary.paceBenchmarks.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
              <span className="font-medium text-slate-500 dark:text-slate-400">
                Rekordy tempa z krzywej (90 dni):
              </span>
              {runningSummary.paceBenchmarks.map((pb) => (
                <span key={pb.label} className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                  <span className="text-slate-500 dark:text-slate-400">{pb.label}: </span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {pb.paceStr}
                  </span>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Zone Distribution */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Czas w strefach intensywności
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Łączny sklasyfikowany czas: {formatDuration(totalZoneSecs)}
              </p>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                disabled={!hasPower}
                onClick={() => setZoneType("power")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-40 ${
                  zoneType === "power" && hasPower
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                Strefy mocy
              </button>
              <button
                type="button"
                disabled={!hasHr}
                onClick={() => setZoneType("hr")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-40 ${
                  zoneType === "hr" || !hasPower
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                Strefy tętna
              </button>
            </div>
          </div>

          {totalZoneSecs === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Brak danych czasów strefowych (icu_zone_times / icu_hr_zone_times) w pobranych aktywnościach.
            </div>
          ) : (
            <div className="space-y-3.5">
              {activeZones.map((z) => (
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
                      className="h-full transition-all duration-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Seiler 3-Zone Polarization Model */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Polaryzacja treningowa (model 3-strefowy)
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Klasyfikacja rozkładu względem modelu Seilera (80/20)
          </p>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Wykryty profil obciążenia
            </div>
            <div className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
              {polarization.modelLabel}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                style={{ width: `${polarization.lowPercent}%` }}
                className="bg-sky-500"
                title={`Niska intensywność (Z1-Z2): ${polarization.lowPercent}%`}
              />
              <div
                style={{ width: `${polarization.midPercent}%` }}
                className="bg-amber-500"
                title={`Średnia intensywność (Z3-Z4): ${polarization.midPercent}%`}
              />
              <div
                style={{ width: `${polarization.highPercent}%` }}
                className="bg-rose-500"
                title={`Wysoka intensywność (Z5+): ${polarization.highPercent}%`}
              />
            </div>

            <div className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-slate-700 dark:text-slate-300">
                  Niska intensywność (Z1–Z2 · baza tlenowa)
                </span>
                <span className="font-mono font-semibold tabular-nums text-sky-600 dark:text-sky-400">
                  {polarization.lowPercent}%
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-slate-700 dark:text-slate-300">
                  Średnia intensywność (Z3–Z4 · tempo / próg)
                </span>
                <span className="font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {polarization.midPercent}%
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-slate-700 dark:text-slate-300">
                  Wysoka intensywność (Z5+ · VO2max / beztlen)
                </span>
                <span className="font-mono font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {polarization.highPercent}%
                </span>
              </div>
            </div>
          </div>

          {avgDecoupling !== null && (
            <div className="mt-4 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Średni dryf tętna (Aerobic Decoupling)
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    avgDecoupling <= 5
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {avgDecoupling.toFixed(1)}%
                </span>
              </div>
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                {avgDecoupling <= 5
                  ? "Poniżej 5% — bardzo dobra stabilność tlenowa przy dłuższym wysiłku."
                  : "Powyżej 5% — rozważ więcej spokojnych jednostek w Z2 przed wydłużaniem dystansu."}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Row 2: Weekly Zone Stack + Session Intensity Scatter */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Tygodniowa piramida stref (godziny)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Zmiana proporcji bazy (Z1–Z2), progu (Z3–Z4) i VO2max (Z5+) w czasie
            </p>
          </div>
          <WeeklyZoneStackChart weeks={weeklyZoneStack} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Mapa intensywności sesji (Czas vs IF%)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Rozmiar punktu = obciążenie TSS · Kolor = dyscyplina
            </p>
          </div>
          <IntensityScatterChart points={intensityScatter} />
        </section>
      </div>

      {/* Row 3: Efficiency Factor + Aerobic Decoupling */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Wydajność tlenowa (Efficiency Factor)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Stosunek mocy/prędkości do tętna (NP/HR) dla jednostek ≥ 20 min
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {efficiency.length} pomiarów
            </span>
          </div>
          <EfficiencyChart points={efficiency} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Dryf tętna (Aerobic Decoupling %)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Wartości ≤ 5% świadczą o dobrej wytrzymałości tlenowej
            </p>
          </div>
          <DecouplingChart points={efficiency} />
        </section>
      </div>

      {/* Efficiency Benchmark Table */}
      {efficiency.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-4 font-display text-base font-semibold text-slate-900 dark:text-white">
            Ostatnie pomiary wydajności tlenowej (EF i Dryf)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Trening</th>
                  <th className="py-2 pr-4 text-right">Czas</th>
                  <th className="py-2 pr-4 text-right">Moc / NP</th>
                  <th className="py-2 pr-4 text-right">Śr. HR</th>
                  <th className="py-2 pr-4 text-right">EF</th>
                  <th className="py-2 text-right">Dryf %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {[...efficiency]
                  .reverse()
                  .slice(0, 8)
                  .map((p, idx) => (
                    <tr key={`${p.date}-${idx}`}>
                      <td className="py-2 pr-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateFullPl(p.date)}
                      </td>
                      <td className="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100 max-w-[240px] truncate">
                        {p.name}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {p.durationMin} min
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {p.npOrWatts ? `${p.npOrWatts} W` : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {p.avgHr ? `${p.avgHr} bpm` : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono font-semibold tabular-nums text-sky-600 dark:text-sky-400">
                        {p.ef.toFixed(2)}
                      </td>
                      <td
                        className={`py-2 text-right font-mono tabular-nums ${
                          p.decoupling === null
                            ? "text-slate-400"
                            : p.decoupling <= 5
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {p.decoupling !== null ? `${p.decoupling.toFixed(1)}%` : "—"}
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
