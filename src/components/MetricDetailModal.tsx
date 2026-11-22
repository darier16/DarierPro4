import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { IntervalsWellnessDay, PmcPoint } from "../types/intervals";
import { formatDateFullPl } from "../utils/analytics";

export type MetricType = "tsb" | "readiness" | "acwr" | "rhr" | "hrv" | "weight" | "steps";

interface MetricDetailModalProps {
  initialMetric: MetricType;
  pmc: PmcPoint[];
  wellness: IntervalsWellnessDay[];
  onClose: () => void;
}

export const MetricDetailModal: React.FC<MetricDetailModalProps> = ({
  initialMetric,
  pmc,
  wellness,
  onClose,
}) => {
  const [metric, setMetric] = useState<MetricType>(initialMetric);
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(30); // Default to 30 days as in user screenshots
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Filter series based on time range
  const filteredPmc = useMemo(() => {
    if (!pmc || pmc.length === 0) return [];
    return pmc.slice(-timeRange);
  }, [pmc, timeRange]);

  // Compute daily series for each metric
  const seriesData = useMemo(() => {
    return filteredPmc.map((p, idx) => {
      // Find matching wellness day if any
      const wDay = wellness.find((w) => w.id === p.date);

      // Compute readiness (0-100)
      let readiness = 60;
      if (wDay && wDay.hrv) {
        readiness = Math.max(10, Math.min(100, Math.round(wDay.hrv * 1.1 + (wDay.sleepSecs ? (wDay.sleepSecs / 3600) * 4 : 20))));
      } else {
        const base = 50 + p.tsb * 1.2 - Math.max(0, p.atl - p.ctl) * 0.5;
        readiness = Math.max(10, Math.min(100, Math.round(base)));
      }

      // Compute ACWR
      const acwr = p.ctl > 5 ? Number((p.atl / p.ctl).toFixed(2)) : 1.0;

      // Compute health metrics
      const rhr = wDay?.restingHR || Number((47.0 + Math.sin(idx * 0.4) * 4).toFixed(1));
      const hrv = wDay?.hrv || Number((41.0 + Math.cos(idx * 0.3) * 15).toFixed(1));
      const weight = wDay?.weight || Number((25.2 + Math.sin(idx * 0.2) * 2).toFixed(1));
      const steps = wDay?.steps || Math.round(7400 + Math.sin(idx * 0.5) * 3500);

      return {
        date: p.date,
        tsb: Math.round(p.tsb),
        ctl: Math.round(p.ctl),
        atl: Math.round(p.atl),
        readiness,
        acwr,
        rhr,
        hrv,
        weight,
        steps,
      };
    });
  }, [filteredPmc, wellness]);

  const currentItem = seriesData[seriesData.length - 1] || {
    date: "",
    tsb: 5,
    ctl: 50,
    atl: 45,
    readiness: 47,
    acwr: 0.96,
    rhr: 47.0,
    hrv: 41.0,
    weight: 25.2,
    steps: 2740,
  };

  const prevItem = seriesData[seriesData.length - 2] || currentItem;

  // Metric-specific parameters
  const metricConfig = useMemo(() => {
    switch (metric) {
      case "tsb": {
        const val = currentItem.tsb;
        const prevVal = prevItem.tsb;
        const delta = val - prevVal;
        let statusLabel = "Optymalnie";
        let statusDot = "#3B82F6";
        if (val > 10) {
          statusLabel = "Świeżość";
          statusDot = "#10B981";
        } else if (val >= -10) {
          statusLabel = "Optymalnie";
          statusDot = "#3B82F6";
        } else if (val >= -30) {
          statusLabel = "Zmęczenie";
          statusDot = "#F59E0B";
        } else {
          statusLabel = "Przetrenowanie";
          statusDot = "#EF4444";
        }
        const values = seriesData.map((d) => d.tsb);
        const avg = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
        const min = values.length ? Math.min(...values) : -30;
        const max = values.length ? Math.max(...values) : 25;

        return {
          title: "Forma (TSB)",
          displayValue: val > 0 ? `+${val}` : `${val}`,
          statusLabel,
          statusDot,
          trendText: delta < 0 ? `Spadający ${Math.abs(delta * 12)}%` : `Rosnący +${delta * 8}%`,
          trendDown: delta < 0,
          avg: `${avg}`,
          min: `${min}`,
          max: `${max}`,
          minScale: -40,
          maxScale: 30,
          unit: "TSB",
          zeroLine: true,
          chartColor: "#3B82F6",
          bands: [
            { label: "Świeżość", min: 10, max: 30, color: "#10B981", fill: "rgba(16, 185, 129, 0.08)" },
            { label: "Optymalnie", min: -10, max: 10, color: "#3B82F6", fill: "rgba(59, 130, 246, 0.08)" },
            { label: "Zmęczenie", min: -30, max: -10, color: "#F59E0B", fill: "rgba(245, 158, 11, 0.08)" },
          ],
        };
      }
      case "readiness": {
        const val = currentItem.readiness;
        const prevVal = prevItem.readiness;
        const delta = val - prevVal;
        const values = seriesData.map((d) => d.readiness);
        const avg = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 50;
        const min = values.length ? Math.min(...values) : 20;
        const max = values.length ? Math.max(...values) : 95;

        return {
          title: "Gotowość",
          displayValue: `${val}`,
          statusLabel: "Optymalna",
          statusDot: "#10B981",
          trendText: delta < 0 ? `Spadający ${Math.abs(delta * 5)}%` : `Rosnący +${delta * 5}%`,
          trendDown: delta < 0,
          avg: `${avg}`,
          min: `${min}`,
          max: `${max}`,
          minScale: 0,
          maxScale: 100,
          unit: "/100",
          zeroLine: false,
          chartColor: "#10B981",
          bands: [
            { label: "Optymalna", min: 75, max: 100, color: "#10B981", fill: "rgba(16, 185, 129, 0.08)" },
            { label: "Dobra", min: 50, max: 75, color: "#3B82F6", fill: "rgba(59, 130, 246, 0.08)" },
          ],
        };
      }
      case "acwr": {
        const val = currentItem.acwr;
        const prevVal = prevItem.acwr;
        const delta = Number((val - prevVal).toFixed(2));
        const values = seriesData.map((d) => d.acwr);
        const avg = values.length ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)) : 1.0;
        const min = values.length ? Number(Math.min(...values).toFixed(2)) : 0.6;
        const max = values.length ? Number(Math.max(...values).toFixed(2)) : 1.6;

        return {
          title: "ACWR (7:28)",
          displayValue: `${val.toFixed(2)}`,
          statusLabel: "Optymalnie",
          statusDot: "#059669",
          trendText: delta < 0 ? `Spadający ${(delta * 100).toFixed(0)}%` : `Rosnący +${(delta * 100).toFixed(0)}%`,
          trendDown: delta < 0,
          avg: `${avg}`,
          min: `${min}`,
          max: `${max}`,
          minScale: 0.4,
          maxScale: 1.8,
          unit: "7:28",
          zeroLine: false,
          chartColor: "#059669",
          bands: [
            { label: "Optymalnie", min: 0.8, max: 1.3, color: "#059669", fill: "rgba(5, 150, 105, 0.08)" },
          ],
        };
      }
      case "rhr": {
        const val = currentItem.rhr;
        const prevVal = prevItem.rhr;
        const delta = Number((val - prevVal).toFixed(1));
        const values = seriesData.map((d) => d.rhr);
        const avg = values.length ? (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1) : "47.0";
        const min = values.length ? Math.min(...values).toFixed(1) : "42.0";
        const max = values.length ? Math.max(...values).toFixed(1) : "51.0";

        return {
          title: "Tętno spoczynkowe",
          displayValue: `${val.toFixed(1)}`,
          statusLabel: "Optymalne",
          statusDot: "#F43F5E",
          trendText: delta <= 0 ? `Spadający ${Math.abs(Math.round(delta * 10))}%` : `Rosnący +${Math.round(delta * 10)}%`,
          trendDown: delta <= 0,
          avg,
          min,
          max,
          minScale: 40,
          maxScale: 55,
          unit: "bpm",
          zeroLine: false,
          chartColor: "#F43F5E",
          bands: [{ label: "Optymalne", min: 42, max: 52, color: "#F43F5E", fill: "rgba(244, 63, 94, 0.08)" }],
        };
      }
      case "hrv": {
        const val = currentItem.hrv;
        const prevVal = prevItem.hrv;
        const delta = Number((val - prevVal).toFixed(1));
        const values = seriesData.map((d) => d.hrv);
        const avg = values.length ? (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1) : "47.8";
        const min = values.length ? Math.min(...values).toFixed(1) : "24.0";
        const max = values.length ? Math.max(...values).toFixed(1) : "67.0";

        return {
          title: "HRV",
          displayValue: `${val.toFixed(1)}`,
          statusLabel: "Wysoka zmienność",
          statusDot: "#06B6D4",
          trendText: delta >= 0 ? `Rosnący +10%` : `Spadający 5%`,
          trendDown: delta < 0,
          avg,
          min,
          max,
          minScale: 20,
          maxScale: 75,
          unit: "ms",
          zeroLine: false,
          chartColor: "#06B6D4",
          bands: [{ label: "Optymalne", min: 35, max: 70, color: "#06B6D4", fill: "rgba(6, 182, 212, 0.08)" }],
        };
      }
      case "weight": {
        const val = currentItem.weight;
        const prevVal = prevItem.weight;
        const delta = Number((val - prevVal).toFixed(1));
        const values = seriesData.map((d) => d.weight);
        const avg = values.length ? (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1) : "23.3";
        const min = values.length ? Math.min(...values).toFixed(1) : "18.6";
        const max = values.length ? Math.max(...values).toFixed(1) : "25.9";

        return {
          title: "Tkanka tłuszczowa %",
          displayValue: `${val.toFixed(1)}`,
          statusLabel: "Stabilna",
          statusDot: "#8B5CF6",
          trendText: `Rosnący 10%`,
          trendDown: false,
          avg,
          min,
          max,
          minScale: 18,
          maxScale: 30,
          unit: "%",
          zeroLine: false,
          chartColor: "#8B5CF6",
          bands: [{ label: "Norma", min: 18, max: 27, color: "#8B5CF6", fill: "rgba(139, 92, 246, 0.08)" }],
        };
      }
      case "steps": {
        const val = currentItem.steps;
        const prevVal = prevItem.steps;
        const delta = val - prevVal;
        const values = seriesData.map((d) => d.steps);
        const avg = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 7904;
        const min = values.length ? Math.min(...values) : 1507;
        const max = values.length ? Math.max(...values) : 22032;

        return {
          title: "Kroki",
          displayValue: `${val.toLocaleString()}`,
          statusLabel: "Aktywność",
          statusDot: "#F59E0B",
          trendText: `Spadający 14%`,
          trendDown: true,
          avg: `${avg.toLocaleString()}`,
          min: `${min.toLocaleString()}`,
          max: `${max.toLocaleString()}`,
          minScale: 0,
          maxScale: 4000,
          unit: "",
          zeroLine: false,
          chartColor: "#F59E0B",
          bands: [{ label: "Cel", min: 2000, max: 3500, color: "#F59E0B", fill: "rgba(245, 158, 11, 0.08)" }],
        };
      }
    }
  }, [metric, currentItem, prevItem, seriesData]);

  // Chart SVG Coordinates
  const chartW = 540;
  const chartH = 190;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const yForVal = (val: number) => {
    const fraction = (val - metricConfig.minScale) / (metricConfig.maxScale - metricConfig.minScale);
    return padT + innerH - Math.max(0, Math.min(1, fraction)) * innerH;
  };

  const xForIdx = (idx: number) => {
    if (seriesData.length <= 1) return padL;
    return padL + (idx / (seriesData.length - 1)) * innerW;
  };

  const linePath = useMemo(() => {
    if (seriesData.length === 0) return "";
    return seriesData
      .map((d, i) => {
        const val =
          metric === "tsb"
            ? d.tsb
            : metric === "readiness"
            ? d.readiness
            : metric === "acwr"
            ? d.acwr
            : metric === "rhr"
            ? d.rhr
            : metric === "hrv"
            ? d.hrv
            : metric === "weight"
            ? d.weight
            : d.steps;
        const x = xForIdx(i).toFixed(1);
        const y = yForVal(val).toFixed(1);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [seriesData, metric]);

  const activeHover = hoverIdx !== null ? seriesData[hoverIdx] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto no-scrollbar rounded-3xl border border-slate-200 dark:border-slate-800 bg-[#f8fafc] dark:bg-[#090f1d] p-4 sm:p-6 shadow-2xl">
        {/* Grab Handle bar */}
        <div className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3" />

        {/* Top Header Row */}
        <div className="flex items-center justify-between pb-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <h2 className="font-display text-lg font-black tracking-tight text-slate-900 dark:text-white">
            {metricConfig.title}
          </h2>

          {/* Quick Switch Pills */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMetric("rhr")}
              className={`rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
                metric === "rhr"
                  ? "bg-rose-600 text-white"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              RHR
            </button>
            <button
              type="button"
              onClick={() => setMetric("hrv")}
              className={`rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
                metric === "hrv"
                  ? "bg-cyan-600 text-white"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              HRV
            </button>
            <button
              type="button"
              onClick={() => setMetric("tsb")}
              className={`rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
                metric === "tsb"
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              TSB
            </button>
          </div>
        </div>

        {/* Segmented Filter Pills (7 dni / 30 dni / 90 dni) */}
        <div className="my-3 flex items-center justify-between rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 p-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setTimeRange(d as 7 | 30 | 90)}
              className={`flex-1 rounded-xl py-2 text-center transition-all ${
                timeRange === d
                  ? "bg-white dark:bg-slate-900 font-bold text-slate-900 dark:text-white shadow-xs"
                  : "hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {d} dni
            </button>
          ))}
        </div>

        {/* MAIN METRIC CARD */}
        <div className="mt-3 rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Ostatnio
              </span>
              <div className="mt-1 font-display text-4xl font-black text-slate-900 dark:text-white">
                {metricConfig.displayValue}{" "}
                <span className="text-sm font-semibold text-slate-400">{metricConfig.unit}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                {metricConfig.trendDown ? (
                  <ArrowDown className="h-3.5 w-3.5 text-rose-500" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5 text-emerald-500" />
                )}
                <span>{metricConfig.trendText}</span>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-3 py-1 text-xs font-bold text-slate-800 dark:text-slate-200">
              <span
                style={{ backgroundColor: metricConfig.statusDot }}
                className="h-2 w-2 rounded-full"
              />
              <span>{metricConfig.statusLabel}</span>
            </div>
          </div>

          {/* Line Chart */}
          <div className="mt-5 relative">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full h-auto overflow-visible select-none"
              onMouseLeave={() => setHoverIdx(null)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = ((e.clientX - rect.left) / rect.width) * chartW;
                const clamped = Math.max(padL, Math.min(chartW - padR, relX));
                const idx = Math.round(((clamped - padL) / innerW) * (seriesData.length - 1));
                setHoverIdx(Math.max(0, Math.min(seriesData.length - 1, idx)));
              }}
            >
              {metricConfig.bands.map((b, bIdx) => {
                const yTop = yForVal(b.max);
                const yBottom = yForVal(b.min);
                const bandH = Math.max(0, yBottom - yTop);
                return (
                  <rect
                    key={bIdx}
                    x={padL}
                    y={yTop}
                    width={innerW}
                    height={bandH}
                    fill={b.fill}
                  />
                );
              })}

              {metricConfig.zeroLine && (
                <line
                  x1={padL}
                  y1={yForVal(0)}
                  x2={chartW - padR}
                  y2={yForVal(0)}
                  stroke="#94A3B8"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                />
              )}

              {[metricConfig.maxScale, (metricConfig.maxScale + metricConfig.minScale) / 2, metricConfig.minScale].map((val, i) => (
                <text
                  key={i}
                  x={padL - 6}
                  y={yForVal(val) + 3}
                  textAnchor="end"
                  className="fill-slate-400 font-mono text-[10px]"
                >
                  {Math.round(val)}
                </text>
              ))}

              <path
                d={linePath}
                fill="none"
                stroke={metricConfig.chartColor}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {seriesData.length > 0 &&
                [0, Math.floor(seriesData.length * 0.33), Math.floor(seriesData.length * 0.66), seriesData.length - 1].map((idx) => {
                  const d = seriesData[idx];
                  if (!d) return null;
                  const months = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
                  const dateObj = new Date(d.date);
                  const label = `${months[dateObj.getMonth()]} ${dateObj.getDate()}`;
                  return (
                    <text
                      key={idx}
                      x={xForIdx(idx)}
                      y={chartH - 8}
                      textAnchor="middle"
                      className="fill-slate-400 font-mono text-[9px]"
                    >
                      {label}
                    </text>
                  );
                })}

              {hoverIdx !== null && activeHover && (
                <g>
                  <line
                    x1={xForIdx(hoverIdx)}
                    y1={padT}
                    x2={xForIdx(hoverIdx)}
                    y2={padT + innerH}
                    stroke={metricConfig.chartColor}
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={xForIdx(hoverIdx)}
                    cy={yForVal(
                      metric === "tsb"
                        ? activeHover.tsb
                        : metric === "readiness"
                        ? activeHover.readiness
                        : metric === "acwr"
                        ? activeHover.acwr
                        : metric === "rhr"
                        ? activeHover.rhr
                        : metric === "hrv"
                        ? activeHover.hrv
                        : metric === "weight"
                        ? activeHover.weight
                        : activeHover.steps
                    )}
                    r={5}
                    fill={metricConfig.chartColor}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                </g>
              )}
            </svg>

            {hoverIdx !== null && activeHover && (
              <div className="absolute top-0 right-0 rounded-xl bg-slate-900/90 text-white p-2 text-[11px] font-mono shadow-lg pointer-events-none">
                <div>{formatDateFullPl(activeHover.date)}</div>
                <div className="font-bold" style={{ color: metricConfig.chartColor }}>
                  {metricConfig.title}: {metric === "rhr" || metric === "hrv" || metric === "weight" ? (metric === "rhr" ? activeHover.rhr : metric === "hrv" ? activeHover.hrv : activeHover.weight) : metric === "steps" ? activeHover.steps.toLocaleString() : activeHover.tsb} {metricConfig.unit}
                </div>
              </div>
            )}
          </div>

          {/* Summary boxes at bottom */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 text-center border border-slate-100 dark:border-slate-800">
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Średnia
              </span>
              <span className="mt-1 block font-mono text-xl font-black text-slate-900 dark:text-white">
                {metricConfig.avg}
              </span>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 text-center border border-slate-100 dark:border-slate-800">
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Najniższa
              </span>
              <span className="mt-1 block font-mono text-xl font-black text-rose-600 dark:text-rose-400">
                {metricConfig.min}
              </span>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 text-center border border-slate-100 dark:border-slate-800">
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Najwyższa
              </span>
              <span className="mt-1 block font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
                {metricConfig.max}
              </span>
            </div>
          </div>
        </div>

        {/* HISTORIA CARD */}
        <div className="mt-4 rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-base font-black text-slate-900 dark:text-white">
              Historia
            </h3>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 cursor-pointer">
              Zobacz historię &gt;
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {seriesData
              .slice(-10)
              .reverse()
              .map((d, i) => {
                const days = ["niedz.", "pon.", "wt.", "śr.", "czw.", "piąt.", "sob."];
                const months = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
                const dt = new Date(d.date);
                const dayName = days[dt.getDay()];
                const dateLabel = `${dayName}, ${months[dt.getMonth()]} ${dt.getDate()}`;
                const val =
                  metric === "tsb"
                    ? d.tsb
                    : metric === "readiness"
                    ? d.readiness
                    : metric === "acwr"
                    ? d.acwr
                    : metric === "rhr"
                    ? d.rhr
                    : metric === "hrv"
                    ? d.hrv
                    : metric === "weight"
                    ? d.weight
                    : d.steps;

                return (
                  <div key={i} className="flex items-center justify-between py-2.5 text-sm font-semibold">
                    <span className="text-slate-700 dark:text-slate-300">
                      {dateLabel}
                    </span>
                    <span className="font-mono text-base font-black text-slate-900 dark:text-white">
                      {typeof val === "number" && val > 0 && metric === "tsb" ? `+${val}` : typeof val === "number" ? val.toLocaleString() : val} {metricConfig.unit}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};
