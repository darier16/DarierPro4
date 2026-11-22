import React, { useState } from "react";
import type {
  ActivityStreams,
  EfficiencyPoint,
  IntervalsActivity,
  IntervalsWellnessDay,
  PlannedWorkoutDay,
  PmcPoint,
  SportBreakdownItem,
  WeeklyVolumePoint,
  WorkoutBlock,
} from "../types/intervals";
import {
  formatDateFullPl,
  formatDateShortPl,
  formatDurationLong,
  formatPace,
  type DailyHeatmapCell,
  type HealthCorrelationPoint,
  type IntensityScatterPoint,
  type PowerBenchmarkPoint,
  type TaperProjectionPoint,
  type WeeklyZoneStackPoint,
} from "../utils/analytics";

export const SPORT_COLORS: Record<string, string> = {
  cycling: "#2563EB",
  running: "#10B981",
  swimming: "#06B6D4",
  other: "#8B5CF6",
};

interface MiniSparklineProps {
  values: number[];
  color: string;
  id: string;
  height?: number;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  values,
  color,
  id,
  height = 34,
}) => {
  if (values.length < 2) return null;
  const width = 140;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - 4 - ((v - min) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M${pts.join(" L")}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-8 overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${id})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.8} />
    </svg>
  );
};

interface PmcChartProps {
  data: PmcPoint[];
}

export const PmcChart: React.FC<PmcChartProps> = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Brak wystarczającej liczby dni treningowych do wykreślenia krzywej formy (PMC).
      </div>
    );
  }

  const width = 960;
  const height = 310;
  const padL = 44;
  const padR = 44;
  const padT = 18;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const ctlAtlMax = Math.max(40, ...data.map((d) => Math.max(d.ctl, d.atl)));
  const yLoadMax = Math.ceil(ctlAtlMax / 10) * 10 + 10;

  const tsbMinRaw = Math.min(-15, ...data.map((d) => d.tsb));
  const tsbMaxRaw = Math.max(15, ...data.map((d) => d.tsb));
  const tsbAbsMax =
    Math.ceil(Math.max(Math.abs(tsbMinRaw), Math.abs(tsbMaxRaw)) / 10) * 10;

  const tssMax = Math.max(100, ...data.map((d) => d.tss));

  const xAt = (i: number) =>
    padL + (i / Math.max(1, data.length - 1)) * innerW;
  const yLoad = (val: number) =>
    padT + innerH - (Math.max(0, val) / yLoadMax) * innerH;
  const yTsb = (val: number) =>
    padT + innerH / 2 - (val / tsbAbsMax) * (innerH / 2);

  const ctlPath = data
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yLoad(d.ctl).toFixed(1)}`
    )
    .join(" ");
  const ctlAreaPath =
    ctlPath +
    ` L${xAt(data.length - 1).toFixed(1)},${(padT + innerH).toFixed(
      1
    )} L${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  const atlPath = data
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yLoad(d.atl).toFixed(1)}`
    )
    .join(" ");
  const tsbPath = data
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yTsb(d.tsb).toFixed(1)}`
    )
    .join(" ");

  const zeroY = yTsb(0);
  const tsbAreaPath =
    tsbPath +
    ` L${xAt(data.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${xAt(0).toFixed(
      1
    )},${zeroY.toFixed(1)} Z`;

  const xTickCount = Math.min(7, data.length);
  const xTicks = Array.from({ length: xTickCount }, (_, k) => {
    const idx = Math.round(
      (k / Math.max(1, xTickCount - 1)) * (data.length - 1)
    );
    return { idx, label: formatDateShortPl(data[idx].date) };
  });

  const yLoadTicks = [0, 0.25, 0.5, 0.75, 1].map((r) =>
    Math.round(r * yLoadMax)
  );

  const activeIdx = hoverIdx !== null ? hoverIdx : data.length - 1;
  const activePoint = data[activeIdx];
  const barWidth = Math.max(1.5, Math.min(8, innerW / data.length - 1));

  return (
    <div className="relative select-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-5">
          <span className="inline-flex items-center gap-2">
            <span className="h-0.5 w-4 bg-blue-600" />
            <span>CTL (Forma)</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-0.5 w-4 bg-orange-500" />
            <span>ATL (Zmęczenie)</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-xs bg-emerald-500/25 border border-emerald-500/70" />
            <span>TSB (Świeżość)</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2 rounded-xs bg-indigo-400/50" />
            <span>Dzienny TSS</span>
          </span>
        </div>

        {activePoint && (
          <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-xs">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {formatDateFullPl(activePoint.date)}
            </span>
            <span className="text-blue-600 dark:text-blue-400">
              CTL {activePoint.ctl.toFixed(1)}
            </span>
            <span className="text-orange-600 dark:text-orange-400">
              ATL {activePoint.atl.toFixed(1)}
            </span>
            <span
              className={
                activePoint.tsb >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }
            >
              TSB{" "}
              {activePoint.tsb > 0
                ? `+${activePoint.tsb.toFixed(1)}`
                : activePoint.tsb.toFixed(1)}
            </span>
            <span className="text-indigo-600 dark:text-indigo-400">
              TSS {activePoint.tss}
            </span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Wykres formy, zmęczenia i świeżości CTL ATL TSB"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const clamped = Math.max(padL, Math.min(width - padR, relX));
          const idx = Math.round(((clamped - padL) / innerW) * (data.length - 1));
          setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
        }}
      >
        <defs>
          <linearGradient id="ctlAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="tsbGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.26" />
            <stop offset="50%" stopColor="#10B981" stopOpacity="0.03" />
            <stop offset="50%" stopColor="#F43F5E" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {yLoadTicks.map((tick) => {
          const y = yLoad(tick);
          return (
            <g key={tick}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {[tsbAbsMax, 0, -tsbAbsMax].map((val) => {
          const y = yTsb(val);
          return (
            <text
              key={val}
              x={width - padR + 8}
              y={y + 4}
              textAnchor="start"
              className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
            >
              {val > 0 ? `+${val}` : val}
            </text>
          );
        })}

        <line
          x1={padL}
          y1={zeroY}
          x2={width - padR}
          y2={zeroY}
          className="stroke-slate-300 dark:stroke-slate-700"
          strokeWidth={1}
        />

        {data.map((d, i) => {
          if (d.tss <= 0) return null;
          const barH = (d.tss / tssMax) * (innerH * 0.42);
          return (
            <rect
              key={d.date}
              x={xAt(i) - barWidth / 2}
              y={padT + innerH - barH}
              width={barWidth}
              height={barH}
              rx={1}
              className="fill-indigo-400/45 dark:fill-indigo-400/35"
            />
          );
        })}

        <path d={ctlAreaPath} fill="url(#ctlAreaGrad)" />
        <path d={tsbAreaPath} fill="url(#tsbGrad)" />
        <path
          d={tsbPath}
          fill="none"
          stroke="#10B981"
          strokeWidth={1.6}
          strokeOpacity={0.9}
        />
        <path d={atlPath} fill="none" stroke="#F97316" strokeWidth={2} />
        <path d={ctlPath} fill="none" stroke="#2563EB" strokeWidth={2.5} />

        {xTicks.map((t) => (
          <text
            key={t.idx}
            x={xAt(t.idx)}
            y={height - 6}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
          >
            {t.label}
          </text>
        ))}

        {activePoint && (
          <g>
            <line
              x1={xAt(activeIdx)}
              y1={padT}
              x2={xAt(activeIdx)}
              y2={padT + innerH}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeDasharray="2 2"
            />
            <circle
              cx={xAt(activeIdx)}
              cy={yLoad(activePoint.ctl)}
              r={4.5}
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
            <circle
              cx={xAt(activeIdx)}
              cy={yLoad(activePoint.atl)}
              r={4}
              fill="#F97316"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
            <circle
              cx={xAt(activeIdx)}
              cy={yTsb(activePoint.tsb)}
              r={3.5}
              fill={activePoint.tsb >= 0 ? "#10B981" : "#F43F5E"}
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>
    </div>
  );
};

interface WeeklyLoadChartProps {
  weeks: WeeklyVolumePoint[];
}

export const WeeklyLoadChart: React.FC<WeeklyLoadChartProps> = ({ weeks }) => {
  const [metric, setMetric] = useState<"tss" | "durationHours" | "distanceKm">(
    "tss"
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const visibleWeeks = weeks.slice(-14);

  if (visibleWeeks.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Brak danych tygodniowych w wybranym okresie.
      </div>
    );
  }

  const values = visibleWeeks.map((w) => w[metric]);
  const maxVal = Math.max(10, ...values);

  const unit = metric === "tss" ? "TSS" : metric === "durationHours" ? "h" : "km";
  const barColor =
    metric === "tss"
      ? "bg-gradient-to-t from-blue-600 to-sky-400"
      : metric === "durationHours"
      ? "bg-gradient-to-t from-indigo-600 to-violet-400"
      : "bg-gradient-to-t from-emerald-600 to-teal-400";
  const mutedBarColor =
    metric === "tss"
      ? "bg-sky-500/35 hover:bg-sky-500/70 dark:bg-sky-400/30 dark:hover:bg-sky-400/65"
      : metric === "durationHours"
      ? "bg-indigo-500/35 hover:bg-indigo-500/70 dark:bg-indigo-400/30 dark:hover:bg-indigo-400/65"
      : "bg-emerald-500/35 hover:bg-emerald-500/70 dark:bg-emerald-400/30 dark:hover:bg-emerald-400/65";

  const activeWeek =
    hoverIdx !== null
      ? visibleWeeks[hoverIdx]
      : visibleWeeks[visibleWeeks.length - 1];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMetric("tss")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              metric === "tss"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Obciążenie (TSS)
          </button>
          <button
            type="button"
            onClick={() => setMetric("durationHours")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              metric === "durationHours"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Czas (h)
          </button>
          <button
            type="button"
            onClick={() => setMetric("distanceKm")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              metric === "distanceKm"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Dystans (km)
          </button>
        </div>

        {activeWeek && (
          <div className="font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400">
            Tydzień {activeWeek.weekLabel}:{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeWeek[metric]} {unit}
            </span>{" "}
            · {activeWeek.sessions} tren.
          </div>
        )}
      </div>

      <div className="flex h-48 items-end gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        {visibleWeeks.map((w, idx) => {
          const pct = Math.max(4, Math.round((w[metric] / maxVal) * 100));
          const isHighlighted =
            hoverIdx === idx ||
            (hoverIdx === null && idx === visibleWeeks.length - 1);
          return (
            <div
              key={w.weekStart}
              className="group flex flex-1 flex-col items-center justify-end h-full"
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <div className="mb-1 text-[10px] font-mono tabular-nums text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-400">
                {w[metric]}
              </div>
              <div
                style={{ height: `${pct}%` }}
                className={`w-full max-w-[30px] rounded-t-sm transition-all ${
                  isHighlighted ? barColor : mutedBarColor
                }`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {visibleWeeks.map((w, idx) => (
          <div
            key={w.weekStart}
            className="flex-1 text-center font-mono tabular-nums text-[10px] text-slate-400 dark:text-slate-500"
          >
            {idx % 2 === 0 || idx === visibleWeeks.length - 1
              ? w.weekLabel
              : ""}
          </div>
        ))}
      </div>
    </div>
  );
};

interface ActivityHeatmapChartProps {
  cells: DailyHeatmapCell[];
}

export const ActivityHeatmapChart: React.FC<ActivityHeatmapChartProps> = ({
  cells,
}) => {
  const [hovered, setHovered] = useState<DailyHeatmapCell | null>(null);
  const weeksCount = Math.max(1, ...cells.map((c) => c.weekIndex + 1));
  const maxTss = Math.max(120, ...cells.map((c) => c.tss));
  const dayNames = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

  const getCellColor = (tss: number) => {
    if (tss <= 0)
      return "bg-slate-100 dark:bg-slate-800/80";
    const ratio = tss / maxTss;
    if (ratio < 0.25) return "bg-sky-200 dark:bg-sky-900/70";
    if (ratio < 0.5) return "bg-sky-400 dark:bg-sky-600";
    if (ratio < 0.75) return "bg-blue-600 dark:bg-blue-500";
    return "bg-indigo-700 dark:bg-indigo-400";
  };

  const activeDays = cells.filter((c) => c.tss > 0 || c.sessions > 0).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-600 dark:text-slate-400">
          {activeDays} dni aktywnych w ostatnich {weeksCount} tygodniach
        </span>
        <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
          {hovered ? (
            <span>
              {formatDateFullPl(hovered.date)} ·{" "}
              <span className="font-semibold">{hovered.tss} TSS</span> ·{" "}
              {hovered.durationMin} min ({hovered.sessions} tren.)
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">
              Najedź na dzień, aby zobaczyć szczegóły
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-1.5">
          <div className="flex flex-col justify-between py-0.5 pr-1 text-[10px] font-mono text-slate-400 dark:text-slate-500">
            {dayNames.map((d, i) => (
              <span key={d} className={i % 2 === 1 ? "opacity-0" : ""}>
                {d}
              </span>
            ))}
          </div>

          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${weeksCount}, minmax(12px, 1fr))`,
              gridTemplateRows: "repeat(7, minmax(12px, 14px))",
              gridAutoFlow: "column",
            }}
          >
            {Array.from({ length: weeksCount }).map((_, wIdx) =>
              Array.from({ length: 7 }).map((__, dow) => {
                const cell = cells.find(
                  (c) => c.weekIndex === wIdx && c.dayOfWeek === dow
                );
                if (!cell) {
                  return (
                    <div
                      key={`${wIdx}-${dow}`}
                      className="h-3.5 w-3.5 rounded-[3px] opacity-0"
                    />
                  );
                }
                return (
                  <div
                    key={cell.date}
                    onMouseEnter={() => setHovered(cell)}
                    onMouseLeave={() => setHovered(null)}
                    className={`h-3.5 w-3.5 rounded-[3px] transition-transform hover:scale-125 ${getCellColor(
                      cell.tss
                    )}`}
                    title={`${cell.date}: ${cell.tss} TSS`}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        <span>Mniej</span>
        <span className="h-2.5 w-2.5 rounded-[2px] bg-slate-100 dark:bg-slate-800" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-sky-200 dark:bg-sky-900/70" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-sky-400 dark:bg-sky-600" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-blue-600 dark:bg-blue-500" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-indigo-700 dark:bg-indigo-400" />
        <span>Więcej (TSS)</span>
      </div>
    </div>
  );
};

interface SportDonutChartProps {
  items: SportBreakdownItem[];
}

export const SportDonutChart: React.FC<SportDonutChartProps> = ({ items }) => {
  const [hoverCat, setHoverCat] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Brak aktywności do podziału dyscyplin.
      </div>
    );
  }

  const totalHours = items.reduce((s, i) => s + i.durationHours, 0);
  const totalTss = items.reduce((s, i) => s + i.tss, 0);
  const radius = 56;
  const strokeW = 18;
  const circumference = 2 * Math.PI * radius;

  let cumulativePct = 0;
  const hoveredItem = items.find((i) => i.category === hoverCat);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90">
          {items.map((item) => {
            const pct = item.sharePercent / 100;
            const dashLen = Math.max(0, pct * circumference - 2);
            const dashOffset = -(cumulativePct * circumference);
            cumulativePct += pct;
            const color = SPORT_COLORS[item.category] || "#64748B";
            const isHovered = hoverCat === item.category;

            return (
              <circle
                key={item.category}
                cx={75}
                cy={75}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? strokeW + 3 : strokeW}
                strokeDasharray={`${dashLen} ${circumference}`}
                strokeDashoffset={dashOffset}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHoverCat(item.category)}
                onMouseLeave={() => setHoverCat(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-white">
            {hoveredItem
              ? `${hoveredItem.durationHours}h`
              : `${totalHours.toFixed(1)}h`}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {hoveredItem ? hoveredItem.label : `${totalTss} TSS`}
          </div>
        </div>
      </div>

      <div className="w-full flex-1 space-y-2.5">
        {items.map((item) => {
          const color = SPORT_COLORS[item.category] || "#64748B";
          return (
            <div
              key={item.category}
              onMouseEnter={() => setHoverCat(item.category)}
              onMouseLeave={() => setHoverCat(null)}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {item.label}
                </span>
              </div>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {item.durationHours}h · {item.tss} TSS ({item.sharePercent}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface IntensityScatterChartProps {
  points: IntensityScatterPoint[];
}

export const IntensityScatterChart: React.FC<IntensityScatterChartProps> = ({
  points,
}) => {
  const [hoverId, setHoverId] = useState<string | null>(null);

  if (points.length < 2) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Za mało treningów z danymi intensywności (IF%) do wykreślenia mapy sesji.
      </div>
    );
  }

  const width = 700;
  const height = 240;
  const padL = 44;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxDur = Math.max(90, ...points.map((p) => p.durationMin)) * 1.05;
  const minIf = Math.max(30, Math.min(...points.map((p) => p.ifPct)) - 5);
  const maxIf = Math.min(130, Math.max(105, ...points.map((p) => p.ifPct)) + 5);
  const ifSpan = Math.max(20, maxIf - minIf);

  const xAt = (dur: number) => padL + (dur / maxDur) * innerW;
  const yAt = (ifPct: number) =>
    padT + innerH - ((ifPct - minIf) / ifSpan) * innerH;

  const active =
    points.find((p) => p.id === hoverId) || points[0];

  const yTicks = [50, 70, 85, 100].filter((v) => v >= minIf && v <= maxIf);
  const xTicks = [30, 60, 120, 180, 240].filter((v) => v <= maxDur);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
            Kolarstwo
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Bieganie
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
            Pływanie
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
            Inne
          </span>
        </div>

        {active && (
          <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300 truncate max-w-md">
            <span className="font-semibold text-slate-900 dark:text-white">
              {active.name}
            </span>{" "}
            · {active.durationMin}m · IF {active.ifPct}% · {active.tss} TSS
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Mapa intensywności i czasu trwania sesji"
        onMouseLeave={() => setHoverId(null)}
      >
        {/* Reference threshold IF 85% and 100% */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              y1={yAt(t)}
              x2={width - padR}
              y2={yAt(t)}
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeDasharray={t === 100 ? "4 2" : "3 3"}
            />
            <text
              x={padL - 8}
              y={yAt(t) + 4}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
            >
              {t}%
            </text>
          </g>
        ))}

        {xTicks.map((m) => (
          <text
            key={m}
            x={xAt(m)}
            y={height - 6}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
          >
            {m}m
          </text>
        ))}

        {points.map((p) => {
          const r = Math.max(4, Math.min(13, Math.sqrt(Math.max(10, p.tss)) * 0.72));
          const color = SPORT_COLORS[p.category] || "#64748B";
          const isHovered = hoverId === p.id;
          return (
            <circle
              key={p.id}
              cx={xAt(p.durationMin)}
              cy={yAt(p.ifPct)}
              r={isHovered ? r + 2 : r}
              fill={color}
              fillOpacity={isHovered ? 0.92 : 0.65}
              stroke="#FFFFFF"
              strokeWidth={1.2}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoverId(p.id)}
            />
          );
        })}
      </svg>
    </div>
  );
};

interface WellnessTrendChartProps {
  wellness: IntervalsWellnessDay[];
}

export const WellnessTrendChart: React.FC<WellnessTrendChartProps> = ({
  wellness,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const points = wellness
    .filter((w) => w.restingHR || w.hrv || w.sleepSecs)
    .slice(-45);

  if (points.length < 3) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Brak wystarczających wpisów Wellness (HRV / Tętno spoczynkowe / Sen) z ostatnich dni.
      </div>
    );
  }

  const width = 760;
  const height = 210;
  const padL = 40;
  const padR = 40;
  const padT = 18;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const hrVals = points
    .map((p) => p.restingHR)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const hrvVals = points
    .map((p) => p.hrv)
    .filter((v): v is number => typeof v === "number" && v > 0);

  const minHr = hrVals.length ? Math.min(...hrVals) - 3 : 40;
  const maxHr = hrVals.length ? Math.max(...hrVals) + 3 : 80;
  const minHrv = hrvVals.length ? Math.min(...hrvVals) - 8 : 20;
  const maxHrv = hrvVals.length ? Math.max(...hrvVals) + 8 : 120;

  const xAt = (i: number) =>
    padL + (i / Math.max(1, points.length - 1)) * innerW;
  const yHr = (v: number) =>
    padT + innerH - ((v - minHr) / Math.max(5, maxHr - minHr)) * innerH;
  const yHrv = (v: number) =>
    padT + innerH - ((v - minHrv) / Math.max(10, maxHrv - minHrv)) * innerH;

  const hrPath = points
    .map((p, i) =>
      p.restingHR ? `${xAt(i).toFixed(1)},${yHr(p.restingHR).toFixed(1)}` : null
    )
    .filter(Boolean)
    .join(" L");

  const hrvPath = points
    .map((p, i) =>
      p.hrv ? `${xAt(i).toFixed(1)},${yHrv(p.hrv).toFixed(1)}` : null
    )
    .filter(Boolean)
    .join(" L");

  const active =
    hoverIdx !== null ? points[hoverIdx] : points[points.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
          {hrvVals.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-emerald-500" />
              HRV (ms)
            </span>
          )}
          {hrVals.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-rose-500" />
              Tętno spoczynkowe (bpm)
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2 rounded-xs bg-sky-400/40" />
            Sen (h)
          </span>
        </div>

        {active && (
          <div className="flex items-center gap-3 font-mono tabular-nums">
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatDateFullPl(active.id)}
            </span>
            {active.hrv && (
              <span className="text-emerald-600 dark:text-emerald-400">
                HRV {Math.round(active.hrv)} ms
              </span>
            )}
            {active.restingHR && (
              <span className="text-rose-600 dark:text-rose-400">
                RHR {active.restingHR} bpm
              </span>
            )}
            {active.sleepSecs && (
              <span className="text-sky-600 dark:text-sky-400">
                Sen {(active.sleepSecs / 3600).toFixed(1)}h
              </span>
            )}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const clamped = Math.max(padL, Math.min(width - padR, relX));
          const idx = Math.round(
            ((clamped - padL) / innerW) * (points.length - 1)
          );
          setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
        }}
      >
        {/* Sleep subtle bars */}
        {points.map((p, i) => {
          if (!p.sleepSecs) return null;
          const h = Math.min(10, p.sleepSecs / 3600);
          const barH = (h / 10) * (innerH * 0.45);
          return (
            <rect
              key={p.id}
              x={xAt(i) - 4}
              y={padT + innerH - barH}
              width={8}
              height={barH}
              rx={1.5}
              className="fill-sky-400/35 dark:fill-sky-400/25"
            />
          );
        })}

        {hrvPath && (
          <path
            d={`M${hrvPath}`}
            fill="none"
            stroke="#10B981"
            strokeWidth={2.2}
          />
        )}
        {hrPath && (
          <path
            d={`M${hrPath}`}
            fill="none"
            stroke="#F43F5E"
            strokeWidth={2}
          />
        )}

        <text
          x={padL - 6}
          y={padT + 8}
          textAnchor="end"
          className="fill-emerald-600 text-[10px] font-mono tabular-nums dark:fill-emerald-400"
        >
          {Math.round(maxHrv)}
        </text>
        <text
          x={padL - 6}
          y={padT + innerH}
          textAnchor="end"
          className="fill-emerald-600 text-[10px] font-mono tabular-nums dark:fill-emerald-400"
        >
          {Math.round(minHrv)}
        </text>
        <text
          x={width - padR + 6}
          y={padT + 8}
          textAnchor="start"
          className="fill-rose-600 text-[10px] font-mono tabular-nums dark:fill-rose-400"
        >
          {Math.round(maxHr)}
        </text>
        <text
          x={width - padR + 6}
          y={padT + innerH}
          textAnchor="start"
          className="fill-rose-600 text-[10px] font-mono tabular-nums dark:fill-rose-400"
        >
          {Math.round(minHr)}
        </text>
      </svg>
    </div>
  );
};

interface WeeklyZoneStackChartProps {
  weeks: WeeklyZoneStackPoint[];
}

export const WeeklyZoneStackChart: React.FC<WeeklyZoneStackChartProps> = ({
  weeks,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (weeks.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Brak tygodniowych danych strefowych.
      </div>
    );
  }

  const maxH = Math.max(2, ...weeks.map((w) => w.totalHours));
  const active =
    hoverIdx !== null ? weeks[hoverIdx] : weeks[weeks.length - 1];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-sky-500" />
            Z1–Z2 Baza
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" />
            Z3–Z4 Tempo/Próg
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" />
            Z5+ VO2max
          </span>
        </div>

        {active && (
          <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {active.weekLabel}: {active.lowHours}h baza · {active.midHours}h próg ·{" "}
            {active.highHours}h VO2
          </div>
        )}
      </div>

      <div className="flex h-44 items-end gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        {weeks.map((w, idx) => {
          const totalPct = Math.max(4, (w.totalHours / maxH) * 100);
          const lowShare = w.totalHours > 0 ? (w.lowHours / w.totalHours) * 100 : 0;
          const midShare = w.totalHours > 0 ? (w.midHours / w.totalHours) * 100 : 0;
          const highShare =
            w.totalHours > 0 ? (w.highHours / w.totalHours) * 100 : 0;

          return (
            <div
              key={w.weekStart}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="flex flex-1 flex-col items-center justify-end h-full"
            >
              <div
                style={{ height: `${totalPct}%` }}
                className="flex w-full max-w-[28px] flex-col-reverse overflow-hidden rounded-t-sm"
              >
                <div style={{ height: `${lowShare}%` }} className="bg-sky-500" />
                <div style={{ height: `${midShare}%` }} className="bg-amber-500" />
                <div style={{ height: `${highShare}%` }} className="bg-rose-500" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {weeks.map((w, idx) => (
          <div
            key={w.weekStart}
            className="flex-1 text-center font-mono tabular-nums text-[10px] text-slate-400 dark:text-slate-500"
          >
            {idx % 2 === 0 || idx === weeks.length - 1 ? w.weekLabel : ""}
          </div>
        ))}
      </div>
    </div>
  );
};

interface EfficiencyChartProps {
  points: EfficiencyPoint[];
}

export const EfficiencyChart: React.FC<EfficiencyChartProps> = ({ points }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 3) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Potrzebne są co najmniej 3 treningi z danymi mocy/prędkości i tętna (EF), aby wykreślić trend wydajności tlenowej.
      </div>
    );
  }

  const width = 760;
  const height = 240;
  const padL = 44;
  const padR = 20;
  const padT = 18;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const efValues = points.map((p) => p.ef);
  const minEf = Math.floor((Math.min(...efValues) - 0.1) * 10) / 10;
  const maxEf = Math.ceil((Math.max(...efValues) + 0.1) * 10) / 10;
  const span = Math.max(0.2, maxEf - minEf);

  const xAt = (i: number) =>
    padL + (i / Math.max(1, points.length - 1)) * innerW;
  const yAt = (ef: number) =>
    padT + innerH - ((ef - minEf) / span) * innerH;

  const maPath = points
    .map((_, i) => {
      const slice = points.slice(Math.max(0, i - 4), i + 1);
      const avg = slice.reduce((s, p) => s + p.ef, 0) / slice.length;
      return `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(avg).toFixed(1)}`;
    })
    .join(" ");

  const activeIdx = hoverIdx !== null ? hoverIdx : points.length - 1;
  const active = points[activeIdx];
  const yTicks = [minEf, minEf + span * 0.5, maxEf];

  return (
    <div>
      {active && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="truncate max-w-md font-medium text-slate-900 dark:text-slate-100">
            {formatDateFullPl(active.date)} · {active.name}
          </span>
          <div className="flex items-center gap-4 font-mono tabular-nums">
            <span className="text-sky-600 dark:text-sky-400">
              EF {active.ef.toFixed(2)}
            </span>
            {active.decoupling !== null && (
              <span
                className={
                  active.decoupling <= 5
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }
              >
                Dryf {active.decoupling.toFixed(1)}%
              </span>
            )}
            {active.avgHr && <span>{active.avgHr} bpm</span>}
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Trend wydajności tlenowej EF"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              y1={yAt(t)}
              x2={width - padR}
              y2={yAt(t)}
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 8}
              y={yAt(t) + 4}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
            >
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        <path d={maPath} fill="none" stroke="#0EA5E9" strokeWidth={2.2} />

        {points.map((p, i) => {
          const isSelected = i === activeIdx;
          const color =
            p.decoupling !== null && p.decoupling > 5 ? "#F59E0B" : "#10B981";
          return (
            <circle
              key={`${p.date}-${i}`}
              cx={xAt(i)}
              cy={yAt(p.ef)}
              r={isSelected ? 5.5 : 4}
              fill={color}
              stroke="#FFFFFF"
              strokeWidth={1.3}
              className="cursor-pointer transition-transform"
              onMouseEnter={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>
    </div>
  );
};

interface DecouplingChartProps {
  points: EfficiencyPoint[];
}

export const DecouplingChart: React.FC<DecouplingChartProps> = ({
  points,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const samples = points.filter((p) => p.decoupling !== null).slice(-20);

  if (samples.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Za mało pomiarów dryfu tętna (decoupling %) w wybranym okresie.
      </div>
    );
  }

  const maxAbs = Math.max(
    10,
    ...samples.map((s) => Math.abs(s.decoupling || 0))
  );
  const active =
    hoverIdx !== null ? samples[hoverIdx] : samples[samples.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-600 dark:text-slate-400">
          Próg stabilności tlenowej: ≤ 5.0%
        </span>
        {active && (
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {formatDateShortPl(active.date)} ·{" "}
            <span
              className={
                (active.decoupling || 0) <= 5
                  ? "font-semibold text-emerald-600 dark:text-emerald-400"
                  : "font-semibold text-amber-600 dark:text-amber-400"
              }
            >
              {(active.decoupling || 0).toFixed(1)}%
            </span>
          </span>
        )}
      </div>

      <div className="relative flex h-44 items-end gap-1.5 border-b border-slate-200 pb-2 dark:border-slate-800">
        {/* 5% threshold line */}
        <div
          style={{ bottom: `${(5 / maxAbs) * 100}%` }}
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-500/70"
        />

        {samples.map((s, idx) => {
          const val = Math.max(0, s.decoupling || 0);
          const pct = Math.max(4, Math.min(100, (val / maxAbs) * 100));
          const isGood = val <= 5;
          return (
            <div
              key={`${s.date}-${idx}`}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="flex flex-1 flex-col items-center justify-end h-full"
            >
              <div
                style={{ height: `${pct}%` }}
                className={`w-full max-w-[20px] rounded-t-sm transition-opacity ${
                  isGood
                    ? "bg-emerald-500/80 hover:bg-emerald-500"
                    : val <= 8
                    ? "bg-amber-500/80 hover:bg-amber-500"
                    : "bg-rose-500/80 hover:bg-rose-500"
                }`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-400 dark:text-slate-500">
        <span>{formatDateShortPl(samples[0].date)}</span>
        <span>Ostatnie {samples.length} jednostek z pomiarem dryfu</span>
        <span>{formatDateShortPl(samples[samples.length - 1].date)}</span>
      </div>
    </div>
  );
};

interface SleepDetailChartProps {
  wellness: IntervalsWellnessDay[];
}

export const SleepDetailChart: React.FC<SleepDetailChartProps> = ({
  wellness,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const nights = wellness
    .filter((w) => typeof w.sleepSecs === "number" && w.sleepSecs > 0)
    .slice(-30);

  if (nights.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Brak zapisanych danych snu (sleepSecs) z zegarka lub aplikacji w Intervals.icu.
      </div>
    );
  }

  const maxHours = Math.max(
    9.5,
    ...nights.map((n) => (n.sleepSecs || 0) / 3600)
  );
  const active =
    hoverIdx !== null ? nights[hoverIdx] : nights[nights.length - 1];
  const activeHours = active.sleepSecs ? active.sleepSecs / 3600 : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-teal-500" />
            ≥ 7.5h
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-sky-400" />
            6–7.5h
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" />
            &lt; 6h
          </span>
        </div>

        {active && (
          <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {formatDateFullPl(active.id)} ·{" "}
            <span className="font-semibold text-teal-700 dark:text-teal-300">
              {activeHours.toFixed(1)}h
            </span>
            {active.sleepScore ? ` · wynik ${Math.round(active.sleepScore)}/100` : ""}
          </div>
        )}
      </div>

      <div className="relative flex h-44 items-end gap-1 border-b border-slate-200 pb-2 dark:border-slate-800">
        <div
          style={{ bottom: `${(7.5 / maxHours) * 100}%` }}
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-teal-500/70"
        />
        {nights.map((n, idx) => {
          const hrs = (n.sleepSecs || 0) / 3600;
          const pct = Math.max(6, Math.min(100, (hrs / maxHours) * 100));
          const colorClass =
            hrs >= 7.5
              ? "bg-teal-500/85 hover:bg-teal-500"
              : hrs >= 6
              ? "bg-sky-400/85 hover:bg-sky-400"
              : "bg-amber-500/85 hover:bg-amber-500";
          return (
            <div
              key={n.id}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="flex flex-1 flex-col items-center justify-end h-full"
            >
              <div
                style={{ height: `${pct}%` }}
                className={`w-full max-w-[16px] rounded-t-sm transition-opacity ${colorClass}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-400 dark:text-slate-500">
        <span>{formatDateShortPl(nights[0].id)}</span>
        <span>Linia przerywana: cel 7.5 h snu</span>
        <span>{formatDateShortPl(nights[nights.length - 1].id)}</span>
      </div>
    </div>
  );
};

interface HrvRhrBaselineChartProps {
  wellness: IntervalsWellnessDay[];
}

export const HrvRhrBaselineChart: React.FC<HrvRhrBaselineChartProps> = ({
  wellness,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const points = wellness
    .filter(
      (w) =>
        (typeof w.hrv === "number" && w.hrv > 0) ||
        (typeof w.restingHR === "number" && w.restingHR > 0)
    )
    .slice(-45);

  if (points.length < 3) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Potrzebne są co najmniej 3 odczyty HRV lub tętna spoczynkowego z Intervals.icu.
      </div>
    );
  }

  const width = 680;
  const height = 210;
  const padL = 38;
  const padR = 38;
  const padT = 16;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const hrvNums = points
    .map((p) => p.hrv)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const rhrNums = points
    .map((p) => p.restingHR)
    .filter((v): v is number => typeof v === "number" && v > 0);

  const hrvMean = hrvNums.length
    ? hrvNums.reduce((s, v) => s + v, 0) / hrvNums.length
    : 50;
  const hrvStd = hrvNums.length
    ? Math.sqrt(
        hrvNums.reduce((s, v) => s + (v - hrvMean) ** 2, 0) / hrvNums.length
      )
    : 8;

  const minHrv = hrvNums.length ? Math.min(...hrvNums, hrvMean - hrvStd) - 5 : 20;
  const maxHrv = hrvNums.length ? Math.max(...hrvNums, hrvMean + hrvStd) + 5 : 100;
  const minRhr = rhrNums.length ? Math.min(...rhrNums) - 3 : 40;
  const maxRhr = rhrNums.length ? Math.max(...rhrNums) + 3 : 80;

  const xAt = (i: number) =>
    padL + (i / Math.max(1, points.length - 1)) * innerW;
  const yHrv = (v: number) =>
    padT + innerH - ((v - minHrv) / Math.max(8, maxHrv - minHrv)) * innerH;
  const yRhr = (v: number) =>
    padT + innerH - ((v - minRhr) / Math.max(5, maxRhr - minRhr)) * innerH;

  const hrvPts = points
    .map((p, i) =>
      p.hrv ? `${xAt(i).toFixed(1)},${yHrv(p.hrv).toFixed(1)}` : null
    )
    .filter(Boolean);
  const rhrPts = points
    .map((p, i) =>
      p.restingHR
        ? `${xAt(i).toFixed(1)},${yRhr(p.restingHR).toFixed(1)}`
        : null
    )
    .filter(Boolean);

  const active =
    hoverIdx !== null ? points[hoverIdx] : points[points.length - 1];

  const bandTop = yHrv(hrvMean + hrvStd);
  const bandBottom = yHrv(hrvMean - hrvStd);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
          {hrvNums.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-emerald-500" />
              HRV (ms)
            </span>
          )}
          {rhrNums.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-rose-500" />
              RHR (bpm)
            </span>
          )}
        </div>

        {active && (
          <div className="flex items-center gap-3 font-mono tabular-nums">
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatDateFullPl(active.id)}
            </span>
            {active.hrv && (
              <span className="text-emerald-600 dark:text-emerald-400">
                HRV {Math.round(active.hrv)} ms
              </span>
            )}
            {active.restingHR && (
              <span className="text-rose-600 dark:text-rose-400">
                RHR {active.restingHR} bpm
              </span>
            )}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const clamped = Math.max(padL, Math.min(width - padR, relX));
          const idx = Math.round(
            ((clamped - padL) / innerW) * (points.length - 1)
          );
          setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
        }}
      >
        {hrvNums.length > 0 && (
          <rect
            x={padL}
            y={Math.min(bandTop, bandBottom)}
            width={innerW}
            height={Math.abs(bandBottom - bandTop)}
            className="fill-emerald-500/10 dark:fill-emerald-400/10"
          />
        )}

        {hrvPts.length > 1 && (
          <path
            d={`M${hrvPts.join(" L")}`}
            fill="none"
            stroke="#10B981"
            strokeWidth={2.2}
          />
        )}
        {rhrPts.length > 1 && (
          <path
            d={`M${rhrPts.join(" L")}`}
            fill="none"
            stroke="#F43F5E"
            strokeWidth={2}
          />
        )}

        <text
          x={padL - 6}
          y={padT + 8}
          textAnchor="end"
          className="fill-emerald-600 text-[10px] font-mono tabular-nums dark:fill-emerald-400"
        >
          {Math.round(maxHrv)}
        </text>
        <text
          x={padL - 6}
          y={padT + innerH}
          textAnchor="end"
          className="fill-emerald-600 text-[10px] font-mono tabular-nums dark:fill-emerald-400"
        >
          {Math.round(minHrv)}
        </text>
        <text
          x={width - padR + 6}
          y={padT + 8}
          textAnchor="start"
          className="fill-rose-600 text-[10px] font-mono tabular-nums dark:fill-rose-400"
        >
          {Math.round(maxRhr)}
        </text>
        <text
          x={width - padR + 6}
          y={padT + innerH}
          textAnchor="start"
          className="fill-rose-600 text-[10px] font-mono tabular-nums dark:fill-rose-400"
        >
          {Math.round(minRhr)}
        </text>

        <text
          x={padL}
          y={height - 6}
          textAnchor="start"
          className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
        >
          {formatDateShortPl(points[0].id)}
        </text>
        <text
          x={width - padR}
          y={height - 6}
          textAnchor="end"
          className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
        >
          {formatDateShortPl(points[points.length - 1].id)}
        </text>
      </svg>
    </div>
  );
};

interface ActivityHeartRateChartProps {
  activities: IntervalsActivity[];
  lthr: number | null;
}

export const ActivityHeartRateChart: React.FC<ActivityHeartRateChartProps> = ({
  activities,
  lthr,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const sessions = [...activities]
    .filter((a) => typeof a.average_heartrate === "number" && a.average_heartrate > 0)
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))
    .slice(-30);

  if (sessions.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Za mało treningów z zapisem tętna do wykreślenia trendu wysiłkowego.
      </div>
    );
  }

  const width = 760;
  const height = 230;
  const padL = 42;
  const padR = 20;
  const padT = 18;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const allHrs = sessions.flatMap((s) =>
    [s.average_heartrate, s.max_heartrate].filter(
      (v): v is number => typeof v === "number" && v > 0
    )
  );
  if (lthr) allHrs.push(lthr);

  const minHr = Math.max(70, Math.floor((Math.min(...allHrs) - 8) / 10) * 10);
  const maxHr = Math.ceil((Math.max(...allHrs) + 8) / 10) * 10;
  const span = Math.max(30, maxHr - minHr);

  const xAt = (i: number) =>
    padL + (i / Math.max(1, sessions.length - 1)) * innerW;
  const yAt = (hr: number) =>
    padT + innerH - ((hr - minHr) / span) * innerH;

  const avgPath = sessions
    .map(
      (s, i) =>
        `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(
          Number(s.average_heartrate)
        ).toFixed(1)}`
    )
    .join(" ");

  const activeIdx = hoverIdx !== null ? hoverIdx : sessions.length - 1;
  const active = sessions[activeIdx];
  const yTicks = [minHr, Math.round(minHr + span * 0.5), maxHr];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-teal-600" />
            Śr. HR
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-1.5 rounded-xs bg-rose-400/70" />
            Zakres do Maks. HR
          </span>
          {lthr && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t border-dashed border-amber-500" />
              LTHR ({lthr})
            </span>
          )}
        </div>

        {active && (
          <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300 truncate max-w-md">
            <span className="font-semibold text-slate-900 dark:text-white">
              {active.name}
            </span>{" "}
            · śr. {Math.round(Number(active.average_heartrate))} bpm
            {active.max_heartrate
              ? ` · maks. ${Math.round(active.max_heartrate)} bpm`
              : ""}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const clamped = Math.max(padL, Math.min(width - padR, relX));
          const idx = Math.round(
            ((clamped - padL) / innerW) * (sessions.length - 1)
          );
          setHoverIdx(Math.max(0, Math.min(sessions.length - 1, idx)));
        }}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              y1={yAt(t)}
              x2={width - padR}
              y2={yAt(t)}
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 8}
              y={yAt(t) + 4}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
            >
              {t}
            </text>
          </g>
        ))}

        {lthr && (
          <line
            x1={padL}
            y1={yAt(lthr)}
            x2={width - padR}
            y2={yAt(lthr)}
            stroke="#F59E0B"
            strokeWidth={1.3}
            strokeDasharray="5 3"
          />
        )}

        {/* Vertical range stems from Avg HR to Max HR */}
        {sessions.map((s, i) => {
          if (!s.max_heartrate || !s.average_heartrate) return null;
          return (
            <line
              key={s.id}
              x1={xAt(i)}
              y1={yAt(s.average_heartrate)}
              x2={xAt(i)}
              y2={yAt(s.max_heartrate)}
              stroke="#FB7185"
              strokeWidth={2}
              strokeOpacity={0.55}
            />
          );
        })}

        <path d={avgPath} fill="none" stroke="#0D9488" strokeWidth={2.2} />

        {sessions.map((s, i) => (
          <circle
            key={s.id}
            cx={xAt(i)}
            cy={yAt(Number(s.average_heartrate))}
            r={i === activeIdx ? 4.8 : 3.2}
            fill="#0D9488"
            stroke="#FFFFFF"
            strokeWidth={1.2}
          />
        ))}
      </svg>
    </div>
  );
};

interface TaperSimulationChartProps {
  points: TaperProjectionPoint[];
}

export const TaperSimulationChart: React.FC<TaperSimulationChartProps> = ({
  points,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 4) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Za mało danych historycznych do wykonania symulacji formy.
      </div>
    );
  }

  const width = 960;
  const height = 280;
  const padL = 44;
  const padR = 44;
  const padT = 18;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const yLoadMax =
    Math.ceil(Math.max(40, ...points.map((p) => Math.max(p.ctl, p.atl))) / 10) *
      10 +
    10;
  const tsbAbsMax =
    Math.ceil(Math.max(15, ...points.map((p) => Math.abs(p.tsb))) / 10) * 10;

  const xAt = (i: number) =>
    padL + (i / Math.max(1, points.length - 1)) * innerW;
  const yLoad = (v: number) =>
    padT + innerH - (Math.max(0, v) / yLoadMax) * innerH;
  const yTsb = (v: number) =>
    padT + innerH / 2 - (v / tsbAbsMax) * (innerH / 2);

  const splitIdx = points.findIndex((p) => p.isProjection);
  const raceIdx = points.findIndex((p) => p.isRaceDay);

  const histPoints = splitIdx > 0 ? points.slice(0, splitIdx) : points;
  const projPoints =
    splitIdx > 0 ? points.slice(splitIdx - 1) : [];

  const pathFor = (
    arr: TaperProjectionPoint[],
    offset: number,
    yFn: (p: TaperProjectionPoint) => number
  ) =>
    arr
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xAt(offset + i).toFixed(1)},${yFn(
            p
          ).toFixed(1)}`
      )
      .join(" ");

  const activeIdx =
    hoverIdx !== null
      ? hoverIdx
      : raceIdx >= 0
      ? raceIdx
      : points.length - 1;
  const active = points[activeIdx];

  const bandTop = yTsb(15);
  const bandBottom = yTsb(5);

  return (
    <div className="select-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-blue-600" />
            CTL (Forma)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-orange-500" />
            ATL (Zmęczenie)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-emerald-500" />
            TSB (Świeżość)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-xs bg-emerald-500/20 border border-emerald-500/50" />
            Okno startowe (+5..+15)
          </span>
        </div>

        {active && (
          <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatDateFullPl(active.date)}
              {active.isRaceDay ? " (START)" : active.isProjection ? " (Prognoza)" : ""}
            </span>
            <span className="text-blue-600 dark:text-blue-400">
              CTL {active.ctl.toFixed(1)}
            </span>
            <span className="text-orange-600 dark:text-orange-400">
              ATL {active.atl.toFixed(1)}
            </span>
            <span
              className={
                active.tsb >= 5
                  ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                  : active.tsb < -15
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-700 dark:text-slate-300"
              }
            >
              TSB {active.tsb > 0 ? `+${active.tsb.toFixed(1)}` : active.tsb.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const clamped = Math.max(padL, Math.min(width - padR, relX));
          const idx = Math.round(
            ((clamped - padL) / innerW) * (points.length - 1)
          );
          setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
        }}
      >
        {/* Optimal TSB Race Window (+5 to +15) */}
        <rect
          x={padL}
          y={Math.min(bandTop, bandBottom)}
          width={innerW}
          height={Math.abs(bandBottom - bandTop)}
          className="fill-emerald-500/12 dark:fill-emerald-400/10"
        />

        {/* Today divider */}
        {splitIdx > 0 && (
          <line
            x1={xAt(splitIdx)}
            y1={padT}
            x2={xAt(splitIdx)}
            y2={padT + innerH}
            className="stroke-slate-400 dark:stroke-slate-600"
            strokeDasharray="4 3"
          />
        )}

        {/* Race day marker */}
        {raceIdx >= 0 && (
          <g>
            <line
              x1={xAt(raceIdx)}
              y1={padT}
              x2={xAt(raceIdx)}
              y2={padT + innerH}
              stroke="#10B981"
              strokeWidth={1.6}
              strokeDasharray="3 3"
            />
            <text
              x={xAt(raceIdx)}
              y={padT - 4}
              textAnchor="middle"
              className="fill-emerald-600 text-[10px] font-mono font-semibold dark:fill-emerald-400"
            >
              DZIEŃ STARTU
            </text>
          </g>
        )}

        {/* Historical solid lines */}
        <path
          d={pathFor(histPoints, 0, (p) => yLoad(p.ctl))}
          fill="none"
          stroke="#2563EB"
          strokeWidth={2.4}
        />
        <path
          d={pathFor(histPoints, 0, (p) => yLoad(p.atl))}
          fill="none"
          stroke="#F97316"
          strokeWidth={2}
        />
        <path
          d={pathFor(histPoints, 0, (p) => yTsb(p.tsb))}
          fill="none"
          stroke="#10B981"
          strokeWidth={1.8}
        />

        {/* Projected dashed lines */}
        {projPoints.length > 1 && (
          <>
            <path
              d={pathFor(projPoints, splitIdx - 1, (p) => yLoad(p.ctl))}
              fill="none"
              stroke="#2563EB"
              strokeWidth={2.2}
              strokeDasharray="5 4"
            />
            <path
              d={pathFor(projPoints, splitIdx - 1, (p) => yLoad(p.atl))}
              fill="none"
              stroke="#F97316"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
            <path
              d={pathFor(projPoints, splitIdx - 1, (p) => yTsb(p.tsb))}
              fill="none"
              stroke="#10B981"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          </>
        )}

        {active && (
          <g>
            <line
              x1={xAt(activeIdx)}
              y1={padT}
              x2={xAt(activeIdx)}
              y2={padT + innerH}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeDasharray="2 2"
            />
            <circle
              cx={xAt(activeIdx)}
              cy={yLoad(active.ctl)}
              r={4}
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
            <circle
              cx={xAt(activeIdx)}
              cy={yLoad(active.atl)}
              r={4}
              fill="#F97316"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
            <circle
              cx={xAt(activeIdx)}
              cy={yTsb(active.tsb)}
              r={4}
              fill="#10B981"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          </g>
        )}

        <text
          x={padL - 8}
          y={padT + 8}
          textAnchor="end"
          className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
        >
          {yLoadMax}
        </text>
        <text
          x={width - padR + 8}
          y={yTsb(15) + 3}
          textAnchor="start"
          className="fill-emerald-600 text-[10px] font-mono tabular-nums dark:fill-emerald-400"
        >
          +15
        </text>
        <text
          x={width - padR + 8}
          y={yTsb(5) + 3}
          textAnchor="start"
          className="fill-emerald-600 text-[10px] font-mono tabular-nums dark:fill-emerald-400"
        >
          +5
        </text>
      </svg>
    </div>
  );
};

interface PowerCurveChartProps {
  benchmarks: PowerBenchmarkPoint[];
  unitMode: "watts" | "wkg";
}

export const PowerCurveChart: React.FC<PowerCurveChartProps> = ({
  benchmarks,
  unitMode,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const valid = benchmarks.filter((b) =>
    unitMode === "wkg"
      ? b.recentWkg || b.seasonWkg
      : b.recentWatts || b.seasonWatts
  );

  if (valid.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Brak danych krzywej mocy (MMP) z Intervals.icu dla tego konta.
      </div>
    );
  }

  const width = 760;
  const height = 240;
  const padL = 46;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const getVal = (b: PowerBenchmarkPoint, kind: "recent" | "season") =>
    unitMode === "wkg"
      ? kind === "recent"
        ? b.recentWkg
        : b.seasonWkg
      : kind === "recent"
      ? b.recentWatts
      : b.seasonWatts;

  const allVals = valid
    .flatMap((b) => [getVal(b, "recent"), getVal(b, "season")])
    .filter((v): v is number => typeof v === "number" && v > 0);
  const maxVal = Math.max(...allVals) * 1.1;

  const xAt = (i: number) =>
    padL + (i / Math.max(1, valid.length - 1)) * innerW;
  const yAt = (val: number) => padT + innerH - (val / maxVal) * innerH;

  const seasonPts = valid
    .map((b, i) => {
      const v = getVal(b, "season");
      return v ? `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}` : null;
    })
    .filter(Boolean);

  const recentPts = valid
    .map((b, i) => {
      const v = getVal(b, "recent");
      return v ? `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}` : null;
    })
    .filter(Boolean);

  const activeIdx = hoverIdx !== null ? hoverIdx : Math.min(5, valid.length - 1);
  const active = valid[activeIdx];
  const suffix = unitMode === "wkg" ? " W/kg" : " W";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-violet-600" />
            Ostatnie 90 dni
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t border-dashed border-sky-500" />
            Sezon (1 rok)
          </span>
        </div>

        {active && (
          <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">
              {active.label}
            </span>{" "}
            · 90d:{" "}
            <span className="text-violet-600 dark:text-violet-400 font-semibold">
              {getVal(active, "recent") ?? "—"}
              {getVal(active, "recent") ? suffix : ""}
            </span>{" "}
            · Rok:{" "}
            <span className="text-sky-600 dark:text-sky-400">
              {getVal(active, "season") ?? "—"}
              {getVal(active, "season") ? suffix : ""}
            </span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0.25, 0.5, 0.75, 1].map((r) => {
          const val = maxVal * r;
          return (
            <g key={r}>
              <line
                x1={padL}
                y1={yAt(val)}
                x2={width - padR}
                y2={yAt(val)}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 8}
                y={yAt(val) + 4}
                textAnchor="end"
                className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
              >
                {unitMode === "wkg" ? val.toFixed(1) : Math.round(val)}
              </text>
            </g>
          );
        })}

        {seasonPts.length > 1 && (
          <path
            d={`M${seasonPts.join(" L")}`}
            fill="none"
            stroke="#0EA5E9"
            strokeWidth={2}
            strokeDasharray="5 3"
          />
        )}

        {recentPts.length > 1 && (
          <path
            d={`M${recentPts.join(" L")}`}
            fill="none"
            stroke="#7C3AED"
            strokeWidth={2.5}
          />
        )}

        {valid.map((b, i) => {
          const v = getVal(b, "recent") || getVal(b, "season");
          if (!v) return null;
          return (
            <g key={b.secs}>
              <circle
                cx={xAt(i)}
                cy={yAt(v)}
                r={i === activeIdx ? 5.5 : 3.8}
                fill="#7C3AED"
                stroke="#FFFFFF"
                strokeWidth={1.3}
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(i)}
              />
              <text
                x={xAt(i)}
                y={height - 6}
                textAnchor="middle"
                className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

interface HealthLoadCorrelationChartProps {
  points: HealthCorrelationPoint[];
}

export const HealthLoadCorrelationChart: React.FC<
  HealthLoadCorrelationChartProps
> = ({ points }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 4) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Za mało wspólnych dni treningowych i wpisów Wellness do wykreślenia korelacji.
      </div>
    );
  }

  const width = 760;
  const height = 220;
  const padL = 40;
  const padR = 40;
  const padT = 18;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxAtl = Math.max(30, ...points.map((p) => p.atl)) * 1.1;
  const hrvNums = points
    .map((p) => p.hrv)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const minHrv = hrvNums.length ? Math.min(...hrvNums) - 6 : 20;
  const maxHrv = hrvNums.length ? Math.max(...hrvNums) + 6 : 100;

  const xAt = (i: number) =>
    padL + (i / Math.max(1, points.length - 1)) * innerW;
  const yAtl = (v: number) => padT + innerH - (v / maxAtl) * innerH;
  const yHrv = (v: number) =>
    padT + innerH - ((v - minHrv) / Math.max(8, maxHrv - minHrv)) * innerH;

  const atlPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAtl(p.atl).toFixed(1)}`)
    .join(" ");
  const hrvPts = points
    .map((p, i) => (p.hrv ? `${xAt(i).toFixed(1)},${yHrv(p.hrv).toFixed(1)}` : null))
    .filter(Boolean);

  const active =
    hoverIdx !== null ? points[hoverIdx] : points[points.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-orange-500" />
            ATL (Zmęczenie treningowe)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-emerald-500" />
            HRV (Regeneracja)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2 rounded-xs bg-indigo-400/40" />
            Dzienny TSS
          </span>
        </div>

        {active && (
          <div className="flex items-center gap-3 font-mono tabular-nums">
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatDateFullPl(active.date)}
            </span>
            <span className="text-orange-600 dark:text-orange-400">
              ATL {active.atl.toFixed(1)}
            </span>
            {active.hrv && (
              <span className="text-emerald-600 dark:text-emerald-400">
                HRV {Math.round(active.hrv)} ms
              </span>
            )}
            <span className="text-indigo-600 dark:text-indigo-400">
              TSS {active.tss}
            </span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const clamped = Math.max(padL, Math.min(width - padR, relX));
          const idx = Math.round(
            ((clamped - padL) / innerW) * (points.length - 1)
          );
          setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
        }}
      >
        {points.map((p, i) => {
          if (p.tss <= 0) return null;
          const h = Math.min(1, p.tss / 180) * (innerH * 0.45);
          return (
            <rect
              key={p.date}
              x={xAt(i) - 3}
              y={padT + innerH - h}
              width={6}
              height={h}
              rx={1}
              className="fill-indigo-400/40 dark:fill-indigo-400/30"
            />
          );
        })}

        <path d={atlPath} fill="none" stroke="#F97316" strokeWidth={2} />
        {hrvPts.length > 1 && (
          <path
            d={`M${hrvPts.join(" L")}`}
            fill="none"
            stroke="#10B981"
            strokeWidth={2.2}
          />
        )}

        <text
          x={padL - 6}
          y={padT + 8}
          textAnchor="end"
          className="fill-orange-600 text-[10px] font-mono tabular-nums dark:fill-orange-400"
        >
          {Math.round(maxAtl)}
        </text>
        <text
          x={width - padR + 6}
          y={padT + 8}
          textAnchor="start"
          className="fill-emerald-600 text-[10px] font-mono tabular-nums dark:fill-emerald-400"
        >
          {Math.round(maxHrv)}
        </text>
      </svg>
    </div>
  );
};

interface ActivityStreamsChartProps {
  streams: ActivityStreams;
  sportType?: string;
}

export const ActivityStreamsChart: React.FC<ActivityStreamsChartProps> = ({
  streams,
  sportType,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const n = streams.time.length;

  if (n < 5) return null;

  const hasWatts = Boolean(
    streams.watts?.some((v) => typeof v === "number" && v > 0)
  );
  const hasHr = Boolean(
    streams.heartrate?.some((v) => typeof v === "number" && v > 30)
  );
  const hasAlt = Boolean(
    streams.altitude?.some((v) => typeof v === "number")
  );
  const hasSpeed = Boolean(
    streams.velocity_smooth?.some((v) => typeof v === "number" && v > 0.3)
  );

  if (!hasWatts && !hasHr && !hasSpeed) return null;

  const width = 760;
  const height = 220;
  const padL = 38;
  const padR = 38;
  const padT = 16;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const xAt = (i: number) => padL + (i / Math.max(1, n - 1)) * innerW;

  const buildPath = (
    arr: Array<number | null> | undefined,
    minVal: number,
    maxVal: number
  ) => {
    if (!arr) return "";
    const span = Math.max(1, maxVal - minVal);
    let path = "";
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        started = false;
        continue;
      }
      const x = xAt(i).toFixed(1);
      const y = (padT + innerH - ((v - minVal) / span) * innerH).toFixed(1);
      path += `${started ? "L" : "M"}${x},${y} `;
      started = true;
    }
    return path.trim();
  };

  const validWatts = (streams.watts || []).filter(
    (v): v is number => typeof v === "number" && v >= 0
  );
  const maxWatts = validWatts.length
    ? Math.max(120, Math.max(...validWatts) * 1.05)
    : 400;

  const validHr = (streams.heartrate || []).filter(
    (v): v is number => typeof v === "number" && v > 30
  );
  const minHr = validHr.length ? Math.max(50, Math.min(...validHr) - 8) : 60;
  const maxHr = validHr.length ? Math.max(...validHr) + 8 : 190;

  const validSpeed = (streams.velocity_smooth || []).filter(
    (v): v is number => typeof v === "number" && v >= 0
  );
  const maxSpeed = validSpeed.length
    ? Math.max(3, Math.max(...validSpeed) * 1.1)
    : 12;

  const validAlt = (streams.altitude || []).filter(
    (v): v is number => typeof v === "number"
  );
  const minAlt = validAlt.length ? Math.min(...validAlt) : 0;
  const maxAlt = validAlt.length
    ? Math.max(minAlt + 10, Math.max(...validAlt) * 1.05)
    : 100;

  const altAreaPath = (() => {
    if (!hasAlt || !streams.altitude) return "";
    const span = Math.max(10, maxAlt - minAlt);
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const v = streams.altitude[i];
      if (typeof v === "number" && Number.isFinite(v)) {
        const x = xAt(i).toFixed(1);
        const y = (padT + innerH - ((v - minAlt) / span) * (innerH * 0.55)).toFixed(
          1
        );
        pts.push(`${x},${y}`);
      }
    }
    if (pts.length < 2) return "";
    const bottomY = (padT + innerH).toFixed(1);
    return `M${xAt(0).toFixed(1)},${bottomY} L${pts.join(" L")} L${xAt(
      n - 1
    ).toFixed(1)},${bottomY} Z`;
  })();

  const activeIdx = hoverIdx !== null ? hoverIdx : Math.floor(n / 2);
  const tVal = streams.time[activeIdx] || 0;
  const wVal = streams.watts?.[activeIdx] ?? null;
  const hrVal = streams.heartrate?.[activeIdx] ?? null;
  const cadVal = streams.cadence?.[activeIdx] ?? null;
  const altVal = streams.altitude?.[activeIdx] ?? null;
  const spdVal = streams.velocity_smooth?.[activeIdx] ?? null;

  return (
    <div className="select-none">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3.5 text-slate-600 dark:text-slate-400">
          {hasWatts && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 bg-violet-500" />
              Moc (W)
            </span>
          )}
          {hasHr && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 bg-rose-500" />
              Tętno (bpm)
            </span>
          )}
          {hasSpeed && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 bg-emerald-500" />
              Prędkość / Tempo
            </span>
          )}
          {hasAlt && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-3 rounded-xs bg-slate-400/35" />
              Profil wysokości
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 font-mono tabular-nums text-slate-700 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white">
            {formatDurationLong(tVal)}
          </span>
          {typeof wVal === "number" && (
            <span className="text-violet-600 dark:text-violet-400">
              {Math.round(wVal)} W
            </span>
          )}
          {typeof hrVal === "number" && (
            <span className="text-rose-600 dark:text-rose-400">
              {Math.round(hrVal)} bpm
            </span>
          )}
          {typeof spdVal === "number" && spdVal > 0.3 && (
            <span className="text-emerald-600 dark:text-emerald-400">
              {formatPace(spdVal, sportType)}
            </span>
          )}
          {typeof altVal === "number" && <span>{Math.round(altVal)} m</span>}
          {typeof cadVal === "number" && cadVal > 0 && (
            <span>{Math.round(cadVal)} rpm</span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const clamped = Math.max(padL, Math.min(width - padR, relX));
          const idx = Math.round(((clamped - padL) / innerW) * (n - 1));
          setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
        }}
      >
        <line
          x1={padL}
          y1={padT + innerH}
          x2={width - padR}
          y2={padT + innerH}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        {altAreaPath && (
          <path d={altAreaPath} className="fill-slate-400/20 dark:fill-slate-600/25" />
        )}
        {hasSpeed && (
          <path
            d={buildPath(streams.velocity_smooth, 0, maxSpeed)}
            fill="none"
            stroke="#10B981"
            strokeWidth={1.4}
            strokeOpacity={0.75}
          />
        )}
        {hasWatts && (
          <path
            d={buildPath(streams.watts, 0, maxWatts)}
            fill="none"
            stroke="#8B5CF6"
            strokeWidth={1.7}
          />
        )}
        {hasHr && (
          <path
            d={buildPath(streams.heartrate, minHr, maxHr)}
            fill="none"
            stroke="#F43F5E"
            strokeWidth={1.9}
          />
        )}

        <line
          x1={xAt(activeIdx)}
          y1={padT}
          x2={xAt(activeIdx)}
          y2={padT + innerH}
          className="stroke-slate-400 dark:stroke-slate-500"
          strokeDasharray="3 3"
        />

        {hasWatts && (
          <text
            x={padL - 6}
            y={padT + 8}
            textAnchor="end"
            className="fill-violet-600 text-[10px] font-mono tabular-nums dark:fill-violet-400"
          >
            {Math.round(maxWatts)}W
          </text>
        )}
        {hasHr && (
          <text
            x={width - padR + 6}
            y={padT + 8}
            textAnchor="start"
            className="fill-rose-600 text-[10px] font-mono tabular-nums dark:fill-rose-400"
          >
            {Math.round(maxHr)}
          </text>
        )}

        <text
          x={padL}
          y={height - 6}
          textAnchor="start"
          className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
        >
          0:00
        </text>
        <text
          x={width - padR}
          y={height - 6}
          textAnchor="end"
          className="fill-slate-400 text-[10px] font-mono tabular-nums dark:fill-slate-500"
        >
          {formatDurationLong(streams.time[n - 1])}
        </text>
      </svg>
    </div>
  );
};

interface ReadinessGaugeProps {
  score: number;
  status: "optimal" | "build" | "caution" | "overload";
}

export const ReadinessGauge: React.FC<ReadinessGaugeProps> = ({
  score,
  status,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score || 0)));
  const r = 42;
  const cx = 56;
  const cy = 54;
  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - clamped / 100);

  const strokeColor =
    status === "optimal"
      ? "#10B981"
      : status === "build"
      ? "#8B5CF6"
      : status === "caution"
      ? "#F59E0B"
      : "#F43F5E";

  return (
    <div className="flex flex-col items-center shrink-0">
      <svg
        width={112}
        height={66}
        viewBox="0 0 112 66"
        aria-label={`Wskaźnik gotowości ${clamped} na 100`}
      >
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          strokeWidth={9}
          strokeLinecap="round"
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="fill-slate-900 font-mono text-lg font-bold tabular-nums dark:fill-white"
        >
          {clamped}
        </text>
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          className="fill-slate-500 font-mono text-[9px] dark:fill-slate-400"
        >
          / 100
        </text>
      </svg>
    </div>
  );
};

interface PlannedWeekChartProps {
  plan: PlannedWorkoutDay[];
  currentCtl: number;
  currentAtl: number;
  selectedIndex: number;
  onSelectDay: (idx: number) => void;
}

const ZONE_BUCKET_COLORS: Record<PlannedWorkoutDay["zoneBucket"], string> = {
  rest: "#94A3B8",
  z1z2: "#0EA5E9",
  z3z4: "#F59E0B",
  z5plus: "#F43F5E",
};

export const PlannedWeekChart: React.FC<PlannedWeekChartProps> = ({
  plan,
  currentCtl,
  currentAtl,
  selectedIndex,
  onSelectDay,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (plan.length === 0) return null;

  const ctlDecay = Math.exp(-1 / 42);
  const atlDecay = Math.exp(-1 / 7);

  let ctl = currentCtl || 40;
  let atl = currentAtl || 40;

  const projected = plan.map((day, idx) => {
    const tss = Math.max(0, Number(day.estimatedTss) || 0);
    ctl = ctl * ctlDecay + tss * (1 - ctlDecay);
    atl = atl * atlDecay + tss * (1 - atlDecay);
    const tsb = ctl - atl;
    return {
      idx,
      day,
      tss,
      ctl: Number(ctl.toFixed(1)),
      atl: Number(atl.toFixed(1)),
      tsb: Number(tsb.toFixed(1)),
    };
  });

  const maxTss = Math.max(80, ...projected.map((p) => p.tss)) * 1.15;
  const minTsb = Math.min(-15, ...projected.map((p) => p.tsb)) - 4;
  const maxTsb = Math.max(15, ...projected.map((p) => p.tsb)) + 4;
  const tsbSpan = Math.max(10, maxTsb - minTsb);

  const width = 760;
  const height = 225;
  const padL = 40;
  const padR = 40;
  const padT = 20;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const colW = innerW / projected.length;

  const xCenter = (i: number) => padL + colW * (i + 0.5);
  const yTss = (v: number) => padT + innerH - (v / maxTss) * innerH;
  const yTsb = (v: number) => padT + innerH - ((v - minTsb) / tsbSpan) * innerH;

  const tsbPath = projected
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${xCenter(i).toFixed(1)},${yTsb(p.tsb).toFixed(1)}`
    )
    .join(" ");

  const activeIdx = hoverIdx !== null ? hoverIdx : selectedIndex;
  const active = projected[activeIdx] || projected[0];

  return (
    <div className="select-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3.5 text-slate-600 dark:text-slate-400">
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
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-purple-600" />
            Prognoza TSB (Świeżość)
          </span>
        </div>

        {active && (
          <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
            <span className="font-semibold text-slate-900 dark:text-white">
              {active.day.day}
            </span>
            <span className="text-indigo-600 dark:text-indigo-400">
              {active.tss} TSS · {active.day.durationMin} min
            </span>
            <span className="text-purple-600 dark:text-purple-400">
              TSB {active.tsb > 0 ? `+${active.tsb}` : active.tsb}
            </span>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        {/* Zero TSB line */}
        <line
          x1={padL}
          y1={yTsb(0)}
          x2={width - padR}
          y2={yTsb(0)}
          className="stroke-slate-200 dark:stroke-slate-800"
          strokeDasharray="3 3"
        />

        {projected.map((p, i) => {
          const isSelected = i === selectedIndex;
          const barW = Math.min(44, colW * 0.56);
          const barH = p.tss > 0 ? Math.max(6, padT + innerH - yTss(p.tss)) : 4;
          const barY = padT + innerH - barH;
          const color = ZONE_BUCKET_COLORS[p.day.zoneBucket] || "#8B5CF6";

          return (
            <g
              key={`${p.day.day}-${i}`}
              className="cursor-pointer"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => onSelectDay(i)}
            >
              {isSelected && (
                <rect
                  x={padL + i * colW + 4}
                  y={padT}
                  width={colW - 8}
                  height={innerH}
                  rx={6}
                  className="fill-purple-500/10 stroke-purple-500/40 dark:fill-purple-400/10"
                />
              )}
              <rect
                x={xCenter(i) - barW / 2}
                y={barY}
                width={barW}
                height={barH}
                rx={4}
                fill={color}
                fillOpacity={isSelected ? 0.95 : 0.72}
              />
              <text
                x={xCenter(i)}
                y={barY - 5}
                textAnchor="middle"
                className="fill-slate-700 font-mono text-[10px] font-semibold tabular-nums dark:fill-slate-300"
              >
                {p.tss > 0 ? `${p.tss}` : "Rest"}
              </text>
              <text
                x={xCenter(i)}
                y={height - 8}
                textAnchor="middle"
                className={`font-sans text-[11px] ${
                  isSelected
                    ? "fill-purple-700 font-semibold dark:fill-purple-300"
                    : "fill-slate-500 dark:fill-slate-400"
                }`}
              >
                {p.day.day.slice(0, 3)}
              </text>
            </g>
          );
        })}

        {/* Projected TSB overlay curve */}
        <path
          d={tsbPath}
          fill="none"
          stroke="#9333EA"
          strokeWidth={2.2}
          className="pointer-events-none"
        />
        {projected.map((p, i) => (
          <circle
            key={`tsb-${i}`}
            cx={xCenter(i)}
            cy={yTsb(p.tsb)}
            r={i === selectedIndex ? 4.8 : 3.5}
            fill="#9333EA"
            stroke="#FFFFFF"
            strokeWidth={1.4}
            className="pointer-events-none"
          />
        ))}

        <text
          x={padL - 6}
          y={padT + 8}
          textAnchor="end"
          className="fill-slate-400 font-mono text-[10px] tabular-nums dark:fill-slate-500"
        >
          {Math.round(maxTss)} TSS
        </text>
        <text
          x={width - padR + 6}
          y={padT + 8}
          textAnchor="start"
          className="fill-purple-600 font-mono text-[10px] tabular-nums dark:fill-purple-400"
        >
          +{Math.round(maxTsb)}
        </text>
        <text
          x={width - padR + 6}
          y={padT + innerH}
          textAnchor="start"
          className="fill-purple-600 font-mono text-[10px] tabular-nums dark:fill-purple-400"
        >
          {Math.round(minTsb)}
        </text>
      </svg>
    </div>
  );
};

interface WorkoutBlocksChartProps {
  blocks: WorkoutBlock[];
  workoutTitle: string;
}

const BLOCK_ZONE_COLORS: Record<WorkoutBlock["zone"], string> = {
  Z1: "#94A3B8",
  Z2: "#0EA5E9",
  Z3: "#10B981",
  Z4: "#F59E0B",
  Z5: "#F97316",
  Z6: "#F43F5E",
};

export const WorkoutBlocksChart: React.FC<WorkoutBlocksChartProps> = ({
  blocks,
  workoutTitle,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!blocks || blocks.length === 0) {
    return (
      <div className="flex h-44 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center dark:border-slate-800 dark:bg-slate-950/40">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Dzień regeneracyjny (Rest / Aktywny odpoczynek)
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Brak bloków wysiłkowych — priorytetem jest sen, nawodnienie i odbudowa glikogenu.
        </p>
      </div>
    );
  }

  const totalMin = Math.max(
    1,
    blocks.reduce((s, b) => s + Math.max(1, Number(b.minutes) || 0), 0)
  );
  const maxIntensity = Math.max(
    115,
    ...blocks.map((b) => Number(b.intensityPct) || 60)
  );

  const width = 760;
  const height = 185;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const yAt = (pct: number) =>
    padT + innerH - (Math.min(maxIntensity, Math.max(20, pct)) / maxIntensity) * innerH;

  let cursorX = padL;
  const rects = blocks.map((b, idx) => {
    const mins = Math.max(1, Number(b.minutes) || 1);
    const w = (mins / totalMin) * innerW;
    const x = cursorX;
    cursorX += w;
    const pct = Math.max(30, Number(b.intensityPct) || 55);
    const y = yAt(pct);
    const h = padT + innerH - y;
    return { idx, block: b, x, y, w, h, pct, mins };
  });

  const active =
    hoverIdx !== null ? rects[hoverIdx] : rects[Math.min(1, rects.length - 1)] || rects[0];

  return (
    <div className="select-none">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-md">
          Profil struktury: {workoutTitle}
        </span>
        {active && (
          <div className="flex items-center gap-2.5 font-mono tabular-nums text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">
              {active.block.label}
            </span>
            <span className="text-purple-600 dark:text-purple-400">
              {active.mins} min
            </span>
            <span>{active.pct}% progu</span>
            <span
              className="font-semibold"
              style={{ color: BLOCK_ZONE_COLORS[active.block.zone] || "#8B5CF6" }}
            >
              {active.block.zone}
            </span>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        {/* 100% FTP/Threshold reference line */}
        <line
          x1={padL}
          y1={yAt(100)}
          x2={width - padR}
          y2={yAt(100)}
          stroke="#F59E0B"
          strokeWidth={1.2}
          strokeDasharray="4 3"
        />
        <text
          x={padL - 4}
          y={yAt(100) + 3}
          textAnchor="end"
          className="fill-amber-600 font-mono text-[9px] tabular-nums dark:fill-amber-400"
        >
          100%
        </text>
        <text
          x={padL - 4}
          y={yAt(60) + 3}
          textAnchor="end"
          className="fill-slate-400 font-mono text-[9px] tabular-nums dark:fill-slate-500"
        >
          60%
        </text>

        <line
          x1={padL}
          y1={padT + innerH}
          x2={width - padR}
          y2={padT + innerH}
          className="stroke-slate-200 dark:stroke-slate-800"
        />

        {rects.map((r) => {
          const color = BLOCK_ZONE_COLORS[r.block.zone] || "#8B5CF6";
          const isHovered = hoverIdx === r.idx;
          return (
            <g
              key={r.idx}
              onMouseEnter={() => setHoverIdx(r.idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={r.x + 0.75}
                y={r.y}
                width={Math.max(2, r.w - 1.5)}
                height={r.h}
                rx={2.5}
                fill={color}
                fillOpacity={isHovered ? 1 : 0.82}
              />
              {r.w > 34 && (
                <text
                  x={r.x + r.w / 2}
                  y={r.y + 13}
                  textAnchor="middle"
                  className="fill-white font-mono text-[9px] font-semibold pointer-events-none"
                >
                  {r.mins}m
                </text>
              )}
            </g>
          );
        })}

        <text
          x={padL}
          y={height - 6}
          textAnchor="start"
          className="fill-slate-400 font-mono text-[10px] tabular-nums dark:fill-slate-500"
        >
          0 min
        </text>
        <text
          x={width - padR}
          y={height - 6}
          textAnchor="end"
          className="fill-slate-400 font-mono text-[10px] tabular-nums dark:fill-slate-500"
        >
          Łącznie {totalMin} min
        </text>
      </svg>
    </div>
  );
};




