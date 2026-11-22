import type {
  AutomatedInsight,
  EfficiencyPoint,
  IntervalsActivity,
  IntervalsAthlete,
  IntervalsEvent,
  IntervalsWellnessDay,
  PaceCurveSet,
  PmcPoint,
  PowerCurveSet,
  SportBreakdownItem,
  WeeklyVolumePoint,
  ZoneDistributionItem,
  ZoneTimeEntry,
} from "../types/intervals";

export type SportFilter = "all" | "cycling" | "running" | "swimming" | "other";

export function normalizeSportCategory(type?: string): Exclude<SportFilter, "all"> {
  const t = (type || "").toLowerCase();
  if (
    t.includes("ride") ||
    t.includes("cycling") ||
    t.includes("bike") ||
    t.includes("velomobile")
  ) {
    return "cycling";
  }
  if (t.includes("run") || t.includes("jog")) {
    return "running";
  }
  if (t.includes("swim")) {
    return "swimming";
  }
  return "other";
}

export function sportLabelPl(type?: string): string {
  const t = (type || "").toLowerCase();
  if (t === "virtualride") return "Trenażer";
  if (t === "gravelride") return "Gravel";
  if (t === "mountainbikeride") return "MTB";
  if (t.includes("ride")) return "Kolarstwo";
  if (t === "trailrun") return "Bieg górski";
  if (t.includes("run")) return "Bieganie";
  if (t.includes("swim")) return "Pływanie";
  if (t.includes("weight") || t.includes("strength")) return "Siłownia";
  if (t.includes("walk") || t.includes("hike")) return "Marsz / Trekking";
  if (t.includes("row")) return "Wioślarstwo";
  if (t.includes("ski")) return "Narciarstwo";
  return type || "Trening";
}

export function categoryLabelPl(cat: Exclude<SportFilter, "all">): string {
  switch (cat) {
    case "cycling":
      return "Kolarstwo";
    case "running":
      return "Bieganie";
    case "swimming":
      return "Pływanie";
    case "other":
      return "Inne aktywności";
  }
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function formatDurationLong(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatPace(speedMs?: number | null, sportType?: string): string {
  if (!speedMs || speedMs <= 0) return "—";
  const cat = normalizeSportCategory(sportType);
  if (cat === "running") {
    const secPerKm = 1000 / speedMs;
    const min = Math.floor(secPerKm / 60);
    const sec = Math.round(secPerKm % 60);
    if (sec === 60) return `${min + 1}:00 /km`;
    return `${min}:${String(sec).padStart(2, "0")} /km`;
  }
  if (cat === "swimming") {
    const secPer100m = 100 / speedMs;
    const min = Math.floor(secPer100m / 60);
    const sec = Math.round(secPer100m % 60);
    return `${min}:${String(sec).padStart(2, "0")} /100m`;
  }
  return `${(speedMs * 3.6).toFixed(1)} km/h`;
}

export function formatDateShortPl(isoDate: string): string {
  const datePart = isoDate.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
}

export function formatDateFullPl(isoDate: string): string {
  const datePart = isoDate.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

export function getFormZoneInfo(tsb: number): {
  label: string;
  description: string;
  tone: "emerald" | "blue" | "amber" | "crimson";
} {
  if (tsb > 15) {
    return {
      label: "Pełna świeżość / Taper",
      description: "Wysoki zapas regeneracji, gotowość startowa lub roztrenowanie",
      tone: "emerald",
    };
  }
  if (tsb >= 5) {
    return {
      label: "Optymalna dyspozycja",
      description: "Idealne okno na zawody lub mocne jednostki jakościowe",
      tone: "emerald",
    };
  }
  if (tsb >= -10) {
    return {
      label: "Strefa równowagi",
      description: "Stabilne obciążenie podtrzymujące aktualną wydolność",
      tone: "blue",
    };
  }
  if (tsb >= -30) {
    return {
      label: "Produktywne przeciążenie",
      description: "Aktywna budowa formy — monitoruj sen i tętno spoczynkowe",
      tone: "amber",
    };
  }
  return {
    label: "Wysokie zmęczenie",
    description: "Głęboki deficyt regeneracyjny — zalecany tydzień odciążenia",
    tone: "crimson",
  };
}

export function filterActivitiesByRangeAndSport(
  activities: IntervalsActivity[],
  days: number,
  sport: SportFilter
): IntervalsActivity[] {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);

  return activities
    .filter((act) => {
      const dateStr = (act.start_date_local || "").slice(0, 10);
      if (!dateStr) return false;
      const actDate = new Date(`${dateStr}T12:00:00`);
      if (actDate < cutoff) return false;
      if (sport !== "all" && normalizeSportCategory(act.type) !== sport) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (b.start_date_local || "").localeCompare(a.start_date_local || ""));
}

export function computePmcSeries(
  allActivities: IntervalsActivity[],
  wellness: IntervalsWellnessDay[],
  days: number
): PmcPoint[] {
  const wellnessMap = new Map<string, IntervalsWellnessDay>();
  for (const w of wellness) {
    if (w.id) wellnessMap.set(w.id.slice(0, 10), w);
  }

  const dailyTssMap = new Map<string, number>();
  for (const act of allActivities) {
    const d = (act.start_date_local || "").slice(0, 10);
    if (!d) continue;
    const load = Number(act.icu_training_load) || 0;
    dailyTssMap.set(d, (dailyTssMap.get(d) || 0) + load);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build from earliest of (today - Math.max(days, 120)) to properly warm up EMA if wellness is missing
  const totalSimDays = Math.max(days + 60, 180);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - totalSimDays);

  let ctl = 0;
  let atl = 0;

  // Seed from earliest available wellness/activity CTL if available
  const sortedDates: string[] = [];
  for (let i = 0; i <= totalSimDays; i++) {
    const dt = new Date(startDate);
    dt.setDate(startDate.getDate() + i);
    sortedDates.push(dt.toISOString().slice(0, 10));
  }

  for (const d of sortedDates) {
    const w = wellnessMap.get(d);
    if (w && typeof w.ctl === "number" && typeof w.atl === "number") {
      ctl = w.ctl;
      atl = w.atl;
      break;
    }
  }

  const ctlDecay = Math.exp(-1 / 42);
  const atlDecay = Math.exp(-1 / 7);

  const fullSeries: PmcPoint[] = [];
  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const tss = dailyTssMap.get(date) || 0;
    const w = wellnessMap.get(date);

    if (w && typeof w.ctl === "number" && typeof w.atl === "number") {
      ctl = w.ctl;
      atl = w.atl;
    } else {
      ctl = ctl * ctlDecay + tss * (1 - ctlDecay);
      atl = atl * atlDecay + tss * (1 - atlDecay);
    }

    const tsb = ctl - atl;
    const prevCtl = i >= 7 ? fullSeries[i - 7].ctl : ctl;
    const rampRate =
      w && typeof w.rampRate === "number"
        ? w.rampRate
        : Number((ctl - prevCtl).toFixed(1));

    fullSeries.push({
      date,
      ctl: Number(ctl.toFixed(1)),
      atl: Number(atl.toFixed(1)),
      tsb: Number(tsb.toFixed(1)),
      tss: Math.round(tss),
      rampRate: Number(rampRate.toFixed(1)),
    });
  }

  return fullSeries.slice(-days);
}

export interface PlannedWorkoutSimEntry {
  dateStr: string;
  focus: string;
  workoutType: string;
  durationMin: number;
  estimatedTss: number;
}

export interface SimulatedPmcPoint {
  date: string;
  dayLabel: string;
  dayShort: string;
  ctl: number;
  atl: number;
  tsb: number;
  tss: number;
  baselineCtl?: number;
  baselineAtl?: number;
  baselineTsb?: number;
  baselineTss?: number;
  workoutName?: string;
  workoutType?: string;
  durationMin?: number;
  isProjected: boolean;
  statusZone: "fresh" | "neutral" | "optimal" | "overload";
}

export interface FitnessImpactSummary {
  startCtl: number;
  endCtl: number;
  deltaCtl: number;
  peakCtl: number;
  peakAtl: number;
  minTsb: number;
  endTsb: number;
  maxRampRate: number;
  consecutiveHardDays: number;
  overloadWarning: boolean;
  overloadDates: string[];
  verdict: string;
  physiologicalAdvice: string;
  comparisonVsBaseline?: {
    endCtlDiff: number;
    minTsbDiff: number;
    peakAtlDiff: number;
    summary: string;
  };
}

export function simulateFitnessPlanImpact(
  historicalActivities: IntervalsActivity[],
  wellness: IntervalsWellnessDay[],
  plannedWorkouts: PlannedWorkoutSimEntry[],
  baselineWorkouts?: PlannedWorkoutSimEntry[],
  simulationDays = 28,
  anchorDateStr?: string
): {
  series: SimulatedPmcPoint[];
  summary: FitnessImpactSummary;
} {
  const now = new Date();
  const todayStr = anchorDateStr || now.toISOString().slice(0, 10);

  const historySeries = computePmcSeries(historicalActivities, wellness, 120);
  const anchorPoint = historySeries.length > 0 ? historySeries[historySeries.length - 1] : null;

  let currentCtl = anchorPoint ? anchorPoint.ctl : 42;
  let currentAtl = anchorPoint ? anchorPoint.atl : 38;

  let baselineCurrentCtl = currentCtl;
  let baselineCurrentAtl = currentAtl;

  const ctlDecay = Math.exp(-1 / 42);
  const atlDecay = Math.exp(-1 / 7);

  const plannedMap = new Map<string, PlannedWorkoutSimEntry>();
  for (const pw of plannedWorkouts) {
    plannedMap.set(pw.dateStr, pw);
  }

  const baselineMap = new Map<string, PlannedWorkoutSimEntry>();
  if (baselineWorkouts) {
    for (const bw of baselineWorkouts) {
      baselineMap.set(bw.dateStr, bw);
    }
  }

  const series: SimulatedPmcPoint[] = [];
  const daysShortPl = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
  const overloadDates: string[] = [];
  let peakCtl = currentCtl;
  let peakAtl = currentAtl;
  let minTsb = currentCtl - currentAtl;
  let maxRampRate = 0;
  let consecutiveHardDays = 0;
  let maxConsecutiveHardDays = 0;

  // Include recent historical days for visual context
  const recentHistory = historySeries.slice(-4, -1);
  for (const hp of recentHistory) {
    const dt = new Date(`${hp.date}T12:00:00`);
    const dayShort = daysShortPl[dt.getDay()];
    series.push({
      date: hp.date,
      dayLabel: formatDateShortPl(hp.date),
      dayShort,
      ctl: hp.ctl,
      atl: hp.atl,
      tsb: hp.tsb,
      tss: hp.tss,
      baselineCtl: hp.ctl,
      baselineAtl: hp.atl,
      baselineTsb: hp.tsb,
      baselineTss: hp.tss,
      isProjected: false,
      statusZone: hp.tsb > 5 ? "fresh" : hp.tsb >= -10 ? "neutral" : hp.tsb >= -30 ? "optimal" : "overload",
    });
  }

  const [anchorY, anchorM, anchorD] = todayStr.split("-").map(Number);
  const anchorDateObj = new Date(anchorY, anchorM - 1, anchorD);

  const startCtl = currentCtl;

  for (let i = 0; i < simulationDays; i++) {
    const dObj = new Date(anchorDateObj);
    dObj.setDate(anchorDateObj.getDate() + i);
    const dateStr = dObj.toISOString().slice(0, 10);
    const dayShort = daysShortPl[dObj.getDay()];

    const workout = plannedMap.get(dateStr);
    const tss = workout ? workout.estimatedTss : 0;

    if (tss >= 65) {
      consecutiveHardDays += 1;
      if (consecutiveHardDays > maxConsecutiveHardDays) {
        maxConsecutiveHardDays = consecutiveHardDays;
      }
    } else {
      consecutiveHardDays = 0;
    }

    currentCtl = Number((currentCtl * ctlDecay + tss * (1 - ctlDecay)).toFixed(1));
    currentAtl = Number((currentAtl * atlDecay + tss * (1 - atlDecay)).toFixed(1));
    const currentTsb = Number((currentCtl - currentAtl).toFixed(1));

    if (currentCtl > peakCtl) peakCtl = currentCtl;
    if (currentAtl > peakAtl) peakAtl = currentAtl;
    if (currentTsb < minTsb) minTsb = currentTsb;

    const prev7Point = i >= 7 ? series[series.length - 7] : null;
    if (prev7Point) {
      const rr = Number((currentCtl - prev7Point.ctl).toFixed(1));
      if (rr > maxRampRate) maxRampRate = rr;
    }

    if (currentTsb < -30) {
      overloadDates.push(dateStr);
    }

    let bCtl: number | undefined;
    let bAtl: number | undefined;
    let bTsb: number | undefined;
    let bTss: number | undefined;

    if (baselineWorkouts) {
      const bWorkout = baselineMap.get(dateStr);
      const bDayTss = bWorkout ? bWorkout.estimatedTss : 0;
      baselineCurrentCtl = Number((baselineCurrentCtl * ctlDecay + bDayTss * (1 - ctlDecay)).toFixed(1));
      baselineCurrentAtl = Number((baselineCurrentAtl * atlDecay + bDayTss * (1 - atlDecay)).toFixed(1));
      bCtl = baselineCurrentCtl;
      bAtl = baselineCurrentAtl;
      bTsb = Number((baselineCurrentCtl - baselineCurrentAtl).toFixed(1));
      bTss = bDayTss;
    }

    const statusZone =
      currentTsb > 5 ? "fresh" : currentTsb >= -10 ? "neutral" : currentTsb >= -30 ? "optimal" : "overload";

    series.push({
      date: dateStr,
      dayLabel: formatDateShortPl(dateStr),
      dayShort,
      ctl: currentCtl,
      atl: currentAtl,
      tsb: currentTsb,
      tss,
      baselineCtl: bCtl,
      baselineAtl: bAtl,
      baselineTsb: bTsb,
      baselineTss: bTss,
      workoutName: workout?.focus,
      workoutType: workout?.workoutType,
      durationMin: workout?.durationMin,
      isProjected: true,
      statusZone,
    });
  }

  const endCtl = currentCtl;
  const endTsb = Number((currentCtl - currentAtl).toFixed(1));
  const deltaCtl = Number((endCtl - startCtl).toFixed(1));
  const overloadWarning = overloadDates.length > 0 || maxConsecutiveHardDays >= 3;

  let verdict = "Zrównoważony bodziec i stabilna adaptacja formy.";
  let physiologicalAdvice = "";

  if (overloadDates.length > 0) {
    verdict = `Ryzyko przeciążenia: TSB spada do ${minTsb} pkt (${overloadDates.length} dni w strefie przeciążenia).`;
    physiologicalAdvice = `Zbyt gęsty blok intensywności obniża świeżość poniżej -30 TSB. Rozważ rozdzielenie ciężkich jednostek dniem aktywnej regeneracji Z1 lub odpoczynku (Rest Day), aby uchronić organizm przed przetrenowaniem.`;
  } else if (maxConsecutiveHardDays >= 3) {
    verdict = `Kumulacja bodźca: ${maxConsecutiveHardDays} dni o wysokiej intensywności z rzędu bez przerwy.`;
    physiologicalAdvice = `Trzy lub więcej mocnych treningów pod rząd mocno windowuje zmęczenie ostre ATL (${peakAtl} pkt). Trzecia jednostka może być realizowana przy obniżonej sprawności glikogenu.`;
  } else if (deltaCtl >= 6) {
    verdict = `Intensywna rozbudowa bazy: wzrost CTL o +${deltaCtl} pkt w horyzoncie ${simulationDays} dni.`;
    physiologicalAdvice = `Wysokie tempo progresji wytrenowania. Monitoruj HRV i tętno spoczynkowe w kolejnych tygodniach, by potwierdzić pełną adaptację układu krążenia.`;
  } else if (deltaCtl > 1) {
    verdict = `Optymalny progres wytrenowania (+${deltaCtl} CTL) przy zachowaniu bezpiecznej świeżości.`;
    physiologicalAdvice = `Świetny balans bodźca i regeneracji. TSB utrzymuje się w przedziale optymalnej adaptacji (-10 do -25), a następnie płynnie odbudowuje się przed kluczowymi jednostkami.`;
  } else if (deltaCtl < -2) {
    verdict = `Spadek wytrenowania (CTL ${deltaCtl} pkt) — faza odciążenia / taper.`;
    physiologicalAdvice = `Objętość treningowa jest niższa niż bieżące obciążenie, co podnosi bilans świeżości TSB (+${endTsb} pkt) i przygotowuje organizm do startu docelowego.`;
  } else {
    verdict = `Utrzymanie wytrenowania (CTL zmiana: ${deltaCtl >= 0 ? "+" : ""}${deltaCtl} pkt).`;
    physiologicalAdvice = `Równowaga obciążenia z regeneracją — stały poziom bazy aerobowej bez kumulacji przewlekłego zmęczenia.`;
  }

  let comparisonVsBaseline: FitnessImpactSummary["comparisonVsBaseline"] | undefined;
  if (baselineWorkouts) {
    const endCtlDiff = Number((endCtl - baselineCurrentCtl).toFixed(1));
    const minTsbDiff = Number((minTsb - baselineCurrentAtl).toFixed(1));
    const peakAtlDiff = Number((peakAtl - baselineCurrentAtl).toFixed(1));

    let diffText = "Harmonogram zachowuje zbliżony profil do planu pierwotnego.";
    if (Math.abs(endCtlDiff) >= 0.5) {
      diffText = endCtlDiff > 0
        ? `Zmiany zwiększają prognozowane CTL o +${endCtlDiff} pkt względem planu bazowego.`
        : `Zmiany dają o ${Math.abs(endCtlDiff)} pkt niższe CTL (większy nacisk na regenerację i świeżość).`;
    } else if (peakAtlDiff < -3) {
      diffText = `Rozsunięcie treningów zmniejszyło szczytowe zmęczenie o ${Math.abs(peakAtlDiff)} pkt ATL — mniejszy stres fizjologiczny.`;
    } else if (peakAtlDiff > 3) {
      diffText = `Skupienie treningów podniosło szczytowe zmęczenie o +${peakAtlDiff} pkt ATL — wyższy impuls adaptacyjny.`;
    }

    comparisonVsBaseline = {
      endCtlDiff,
      minTsbDiff,
      peakAtlDiff,
      summary: diffText,
    };
  }

  return {
    series,
    summary: {
      startCtl,
      endCtl,
      deltaCtl,
      peakCtl,
      peakAtl,
      minTsb,
      endTsb,
      maxRampRate,
      consecutiveHardDays: maxConsecutiveHardDays,
      overloadWarning,
      overloadDates,
      verdict,
      physiologicalAdvice,
      comparisonVsBaseline,
    },
  };
}

function getIsoWeekStart(dateStr: string): string {
  const dt = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export function computeWeeklyVolume(
  activities: IntervalsActivity[]
): WeeklyVolumePoint[] {
  const weekMap = new Map<string, WeeklyVolumePoint>();

  for (const act of activities) {
    const dateStr = (act.start_date_local || "").slice(0, 10);
    if (!dateStr) continue;
    const weekStart = getIsoWeekStart(dateStr);
    const existing = weekMap.get(weekStart) || {
      weekStart,
      weekLabel: formatDateShortPl(weekStart),
      durationHours: 0,
      distanceKm: 0,
      elevationM: 0,
      tss: 0,
      sessions: 0,
    };

    existing.durationHours += (Number(act.moving_time) || 0) / 3600;
    existing.distanceKm += (Number(act.distance) || 0) / 1000;
    existing.elevationM += Number(act.total_elevation_gain) || 0;
    existing.tss += Number(act.icu_training_load) || 0;
    existing.sessions += 1;

    weekMap.set(weekStart, existing);
  }

  return Array.from(weekMap.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({
      ...w,
      durationHours: Number(w.durationHours.toFixed(1)),
      distanceKm: Number(w.distanceKm.toFixed(1)),
      elevationM: Math.round(w.elevationM),
      tss: Math.round(w.tss),
    }));
}

const POWER_ZONE_META: Array<{ label: string; color: string }> = [
  { label: "Z1 Regeneracja", color: "#94A3B8" },
  { label: "Z2 Wytrzymałość", color: "#2563EB" },
  { label: "Z3 Tempo", color: "#16A34A" },
  { label: "Z4 Próg (FTP)", color: "#D97706" },
  { label: "Z5 VO2max", color: "#EA580C" },
  { label: "Z6 Beztlenowa", color: "#DC2626" },
  { label: "Z7 Nerwowo-mięśn.", color: "#9333EA" },
];

const HR_ZONE_META: Array<{ label: string; color: string }> = [
  { label: "Z1 Regeneracja", color: "#94A3B8" },
  { label: "Z2 Tlenowa baza", color: "#2563EB" },
  { label: "Z3 Tempo tlenowe", color: "#16A34A" },
  { label: "Z4 Próg mleczanowy", color: "#D97706" },
  { label: "Z5 Maksymalna", color: "#DC2626" },
];

function extractZoneSeconds(
  raw: Array<ZoneTimeEntry | number> | null | undefined,
  maxZones: number
): number[] {
  const totals = new Array<number>(maxZones).fill(0);
  if (!Array.isArray(raw)) return totals;

  raw.forEach((entry, idx) => {
    if (typeof entry === "number") {
      if (idx < maxZones) totals[idx] += Math.max(0, entry);
    } else if (entry && typeof entry === "object") {
      const secs = Number(entry.secs) || 0;
      const match = String(entry.id || "").match(/(\d+)/);
      const zIdx = match ? Number(match[1]) - 1 : idx;
      if (zIdx >= 0 && zIdx < maxZones) {
        totals[zIdx] += Math.max(0, secs);
      }
    }
  });
  return totals;
}

export function computeZoneDistribution(
  activities: IntervalsActivity[],
  mode: "power" | "hr"
): ZoneDistributionItem[] {
  const meta = mode === "power" ? POWER_ZONE_META : HR_ZONE_META;
  const totals = new Array<number>(meta.length).fill(0);

  for (const act of activities) {
    const raw = mode === "power" ? act.icu_zone_times : act.icu_hr_zone_times;
    const extracted = extractZoneSeconds(raw, meta.length);
    for (let i = 0; i < meta.length; i++) {
      totals[i] += extracted[i];
    }
  }

  const grandTotal = totals.reduce((acc, v) => acc + v, 0);
  return meta.map((m, idx) => ({
    zone: `Z${idx + 1}`,
    label: m.label,
    secs: Math.round(totals[idx]),
    percent: grandTotal > 0 ? Number(((totals[idx] / grandTotal) * 100).toFixed(1)) : 0,
    color: m.color,
  }));
}

export function computeSeilerPolarization(zones: ZoneDistributionItem[]): {
  lowPercent: number;
  midPercent: number;
  highPercent: number;
  modelLabel: string;
} {
  const total = zones.reduce((s, z) => s + z.secs, 0);
  if (total === 0) {
    return {
      lowPercent: 0,
      midPercent: 0,
      highPercent: 0,
      modelLabel: "Brak danych strefowych",
    };
  }
  const lowSecs = (zones[0]?.secs || 0) + (zones[1]?.secs || 0);
  const midSecs = (zones[2]?.secs || 0) + (zones[3]?.secs || 0);
  const highSecs = zones.slice(4).reduce((s, z) => s + z.secs, 0);

  const lowPercent = Number(((lowSecs / total) * 100).toFixed(1));
  const midPercent = Number(((midSecs / total) * 100).toFixed(1));
  const highPercent = Number(((highSecs / total) * 100).toFixed(1));

  let modelLabel = "Zrównoważony / Mieszany";
  if (lowPercent >= 75 && highPercent > midPercent) {
    modelLabel = "Spolaryzowany (80/20)";
  } else if (lowPercent >= 65 && midPercent >= highPercent) {
    modelLabel = "Piramidalny";
  } else if (midPercent > 35) {
    modelLabel = "Skoncentrowany na progu / tempie";
  } else if (lowPercent >= 85) {
    modelLabel = "Budowa bazy tlenowej";
  }

  return { lowPercent, midPercent, highPercent, modelLabel };
}

export function computeEfficiencySeries(
  activities: IntervalsActivity[]
): EfficiencyPoint[] {
  return activities
    .filter((a) => {
      const ef = Number(a.icu_efficiency_factor);
      return ef > 0.4 && ef < 4.5 && (Number(a.moving_time) || 0) >= 1200;
    })
    .map((a) => ({
      date: (a.start_date_local || "").slice(0, 10),
      name: a.name || sportLabelPl(a.type),
      type: sportLabelPl(a.type),
      ef: Number(Number(a.icu_efficiency_factor).toFixed(2)),
      decoupling:
        typeof a.decoupling === "number"
          ? Number(a.decoupling.toFixed(1))
          : null,
      durationMin: Math.round((Number(a.moving_time) || 0) / 60),
      avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
      npOrWatts: a.icu_weighted_avg_watts
        ? Math.round(a.icu_weighted_avg_watts)
        : a.average_watts
        ? Math.round(a.average_watts)
        : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function computeSportBreakdown(
  activities: IntervalsActivity[]
): SportBreakdownItem[] {
  const map = new Map<
    Exclude<SportFilter, "all">,
    { sessions: number; secs: number; meters: number; tss: number }
  >();

  let totalSecs = 0;
  for (const act of activities) {
    const cat = normalizeSportCategory(act.type);
    const cur = map.get(cat) || { sessions: 0, secs: 0, meters: 0, tss: 0 };
    const secs = Number(act.moving_time) || 0;
    cur.sessions += 1;
    cur.secs += secs;
    cur.meters += Number(act.distance) || 0;
    cur.tss += Number(act.icu_training_load) || 0;
    totalSecs += secs;
    map.set(cat, cur);
  }

  return Array.from(map.entries())
    .map(([category, v]) => ({
      category,
      label: categoryLabelPl(category),
      sessions: v.sessions,
      durationHours: Number((v.secs / 3600).toFixed(1)),
      distanceKm: Number((v.meters / 1000).toFixed(1)),
      tss: Math.round(v.tss),
      sharePercent:
        totalSecs > 0 ? Number(((v.secs / totalSecs) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.durationHours - a.durationHours);
}

export function generateDeterministicInsights(
  pmc: PmcPoint[],
  weekly: WeeklyVolumePoint[],
  powerZones: ZoneDistributionItem[],
  hrZones: ZoneDistributionItem[],
  efficiency: EfficiencyPoint[]
): AutomatedInsight[] {
  const insights: AutomatedInsight[] = [];
  const latest = pmc[pmc.length - 1];

  if (latest) {
    const acwr = latest.ctl > 5 ? latest.atl / latest.ctl : 1;
    if (latest.rampRate > 7) {
      insights.push({
        id: "ramp-high",
        severity: "warning",
        title: `Wysokie tempo narastania obciążenia (+${latest.rampRate.toFixed(1)} CTL/tydz.)`,
        detail:
          "Wzrost formy powyżej 7 pkt CTL/tydzień podnosi ryzyko przeciążenia. Zaplanuj 2-3 dni lżejszej objętości.",
      });
    } else if (latest.rampRate >= 2 && latest.rampRate <= 6.5) {
      insights.push({
        id: "ramp-optimal",
        severity: "nominal",
        title: `Bezpieczna progresja obciążenia (+${latest.rampRate.toFixed(1)} CTL/tydz.)`,
        detail:
          "Tempo budowania formy mieści się w optymalnym przedziale adaptacyjnym 2–6.5 CTL/tydzień.",
      });
    }

    if (acwr > 1.35) {
      insights.push({
        id: "acwr-high",
        severity: "caution",
        title: `Wskaźnik ACWR (ATL/CTL) wynosi ${acwr.toFixed(2)}`,
        detail:
          "Ostre zmęczenie wyraźnie przewyższa przewlekłą bazę treningową (>1.35). Kontroluj jakość regeneracji.",
      });
    }
  }

  const activeZones =
    powerZones.reduce((s, z) => s + z.secs, 0) > 0 ? powerZones : hrZones;
  const pol = computeSeilerPolarization(activeZones);
  if (pol.lowPercent > 0) {
    if (pol.lowPercent < 65) {
      insights.push({
        id: "pol-mid-heavy",
        severity: "caution",
        title: `Duży udział stref umiarkowanych i progowych (${pol.midPercent}%)`,
        detail: `Strefy niskie (Z1–Z2) stanowią ${pol.lowPercent}% czasu. Zwiększenie udziału spokojnego tlenu poprawi regenerację przed akcentami.`,
      });
    } else {
      insights.push({
        id: "pol-good",
        severity: "nominal",
        title: `Model treningowy: ${pol.modelLabel}`,
        detail: `Rozkład intensywności to ${pol.lowPercent}% Z1–Z2, ${pol.midPercent}% Z3–Z4 oraz ${pol.highPercent}% Z5+.`,
      });
    }
  }

  if (efficiency.length >= 6) {
    const half = Math.floor(efficiency.length / 2);
    const firstAvg =
      efficiency.slice(0, half).reduce((s, e) => s + e.ef, 0) / half;
    const secondAvg =
      efficiency.slice(half).reduce((s, e) => s + e.ef, 0) /
      (efficiency.length - half);
    const deltaPct = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (deltaPct >= 2) {
      insights.push({
        id: "ef-up",
        severity: "nominal",
        title: `Wzrost wydajności tlenowej (EF) o +${deltaPct.toFixed(1)}%`,
        detail: `Średnie EF wzrosło z ${firstAvg.toFixed(2)} do ${secondAvg.toFixed(2)} — generujesz wyższą moc lub prędkość przy tym samym tętnie.`,
      });
    } else if (deltaPct <= -3) {
      insights.push({
        id: "ef-down",
        severity: "caution",
        title: `Spadek Efficiency Factor (EF) o ${deltaPct.toFixed(1)}%`,
        detail: `Średnie EF obniżyło się z ${firstAvg.toFixed(2)} do ${secondAvg.toFixed(2)}, co może wskazywać na nawarstwione zmęczenie lub wyższą temperaturę.`,
      });
    }
  }

  if (weekly.length >= 2) {
    const cur = weekly[weekly.length - 1];
    const prev = weekly[weekly.length - 2];
    if (prev.tss > 0) {
      const diffPct = ((cur.tss - prev.tss) / prev.tss) * 100;
      if (diffPct > 30) {
        insights.push({
          id: "week-spike",
          severity: "caution",
          title: `Skok obciążenia w bieżącym tygodniu (+${Math.round(diffPct)}%)`,
          detail: `Tygodniowy TSS wzrósł z ${prev.tss} do ${cur.tss}. Zadbaj o sen i nawodnienie w kolejnych dniach.`,
        });
      }
    }
  }

  return insights.slice(0, 4);
}

export function buildAiSummaryPayload(
  athlete: IntervalsAthlete,
  activities: IntervalsActivity[],
  wellness: IntervalsWellnessDay[],
  pmc: PmcPoint[],
  weekly: WeeklyVolumePoint[],
  powerZones: ZoneDistributionItem[],
  hrZones: ZoneDistributionItem[],
  efficiency: EfficiencyPoint[]
): Record<string, unknown> {
  const latestPmc = pmc[pmc.length - 1];
  const primaryZones =
    powerZones.reduce((s, z) => s + z.secs, 0) > 0 ? powerZones : hrZones;
  const pol = computeSeilerPolarization(primaryZones);

  const recentWellness = wellness
    .filter((w) => w.hrv || w.restingHR || w.sleepSecs)
    .slice(-14)
    .map((w) => ({
      date: w.id,
      rhr: w.restingHR ?? null,
      hrv: w.hrv ?? null,
      sleepH: w.sleepSecs ? Number((w.sleepSecs / 3600).toFixed(1)) : null,
      weight: w.weight ?? null,
    }));

  const recentActivities = activities.slice(0, 18).map((a) => ({
    date: (a.start_date_local || "").slice(0, 10),
    type: a.type,
    name: a.name,
    min: Math.round((Number(a.moving_time) || 0) / 60),
    km: Number(((Number(a.distance) || 0) / 1000).toFixed(1)),
    elevM: Math.round(Number(a.total_elevation_gain) || 0),
    tss: Math.round(Number(a.icu_training_load) || 0),
    ifPct: a.icu_intensity ? Math.round(a.icu_intensity) : null,
    npW: a.icu_weighted_avg_watts ? Math.round(a.icu_weighted_avg_watts) : null,
    avgW: a.average_watts ? Math.round(a.average_watts) : null,
    avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    ef: a.icu_efficiency_factor
      ? Number(a.icu_efficiency_factor.toFixed(2))
      : null,
    decouplingPct:
      typeof a.decoupling === "number" ? Number(a.decoupling.toFixed(1)) : null,
    rpe: a.icu_rpe ?? null,
  }));

  const cyclingSettings = athlete.sportSettings?.find((s) =>
    s.types?.some((t) => t.toLowerCase().includes("ride"))
  );

  return {
    athleteProfile: {
      name: athlete.name || athlete.firstname || "Sportowiec",
      weightKg: athlete.weight ?? null,
      restingHr: athlete.icu_resting_hr ?? null,
      ftpWatts: cyclingSettings?.ftp ?? null,
      lthrBpm: cyclingSettings?.lthr ?? null,
    },
    currentForm: latestPmc || null,
    totalActivitiesInWindow: activities.length,
    totalHoursInWindow: Number(
      (
        activities.reduce((s, a) => s + (Number(a.moving_time) || 0), 0) / 3600
      ).toFixed(1)
    ),
    totalTssInWindow: Math.round(
      activities.reduce((s, a) => s + (Number(a.icu_training_load) || 0), 0)
    ),
    weeklyTrendLast8Weeks: weekly.slice(-8),
    polarizationSummary: pol,
    zoneDistribution: primaryZones.map((z) => ({
      zone: z.zone,
      label: z.label,
      hours: Number((z.secs / 3600).toFixed(1)),
      percent: z.percent,
    })),
    efficiencyPointsCount: efficiency.length,
    efficiencySample: efficiency.slice(-10),
    recentWellness,
    recentActivities,
  };
}

export interface DailyHeatmapCell {
  date: string;
  tss: number;
  durationMin: number;
  sessions: number;
  dayOfWeek: number; // 0 = Mon .. 6 = Sun
  weekIndex: number;
}

export function computeDailyHeatmap(
  activities: IntervalsActivity[],
  weeksCount = 18
): DailyHeatmapCell[] {
  const byDate = new Map<
    string,
    { tss: number; secs: number; sessions: number }
  >();
  for (const act of activities) {
    const d = (act.start_date_local || "").slice(0, 10);
    if (!d) continue;
    const prev = byDate.get(d) || { tss: 0, secs: 0, sessions: 0 };
    prev.tss += Number(act.icu_training_load) || 0;
    prev.secs += Number(act.moving_time) || 0;
    prev.sessions += 1;
    byDate.set(d, prev);
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const jsDay = today.getDay(); // 0 Sun..6 Sat
  const mondayOffset = jsDay === 0 ? 6 : jsDay - 1;
  const currentWeekMonday = new Date(today);
  currentWeekMonday.setDate(today.getDate() - mondayOffset);

  const startMonday = new Date(currentWeekMonday);
  startMonday.setDate(currentWeekMonday.getDate() - (weeksCount - 1) * 7);

  const cells: DailyHeatmapCell[] = [];
  for (let w = 0; w < weeksCount; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const dt = new Date(startMonday);
      dt.setDate(startMonday.getDate() + w * 7 + dow);
      if (dt > today) continue;
      const iso = dt.toISOString().slice(0, 10);
      const entry = byDate.get(iso);
      cells.push({
        date: iso,
        tss: entry ? Math.round(entry.tss) : 0,
        durationMin: entry ? Math.round(entry.secs / 60) : 0,
        sessions: entry ? entry.sessions : 0,
        dayOfWeek: dow,
        weekIndex: w,
      });
    }
  }
  return cells;
}

export interface WeeklyZoneStackPoint {
  weekStart: string;
  weekLabel: string;
  lowHours: number;
  midHours: number;
  highHours: number;
  totalHours: number;
}

export function computeWeeklyZoneStack(
  activities: IntervalsActivity[]
): WeeklyZoneStackPoint[] {
  const map = new Map<
    string,
    { lowSecs: number; midSecs: number; highSecs: number }
  >();

  for (const act of activities) {
    const dateStr = (act.start_date_local || "").slice(0, 10);
    if (!dateStr) continue;
    const rawPower = extractZoneSeconds(act.icu_zone_times, 7);
    const hasPower = rawPower.some((s) => s > 0);
    const rawHr = extractZoneSeconds(act.icu_hr_zone_times, 5);
    const hasHr = rawHr.some((s) => s > 0);

    if (!hasPower && !hasHr) continue;

    const zones = hasPower ? rawPower : rawHr;
    const lowSecs = (zones[0] || 0) + (zones[1] || 0);
    const midSecs = (zones[2] || 0) + (zones[3] || 0);
    const highSecs = zones.slice(4).reduce((s, v) => s + v, 0);

    const weekStart = getIsoWeekStart(dateStr);
    const cur = map.get(weekStart) || { lowSecs: 0, midSecs: 0, highSecs: 0 };
    cur.lowSecs += lowSecs;
    cur.midSecs += midSecs;
    cur.highSecs += highSecs;
    map.set(weekStart, cur);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([weekStart, v]) => {
      const lowHours = Number((v.lowSecs / 3600).toFixed(2));
      const midHours = Number((v.midSecs / 3600).toFixed(2));
      const highHours = Number((v.highSecs / 3600).toFixed(2));
      return {
        weekStart,
        weekLabel: formatDateShortPl(weekStart),
        lowHours,
        midHours,
        highHours,
        totalHours: Number((lowHours + midHours + highHours).toFixed(2)),
      };
    });
}

export interface IntensityScatterPoint {
  id: string;
  date: string;
  name: string;
  category: Exclude<SportFilter, "all">;
  sportLabel: string;
  durationMin: number;
  ifPct: number;
  tss: number;
}

export function computeIntensityScatter(
  activities: IntervalsActivity[]
): IntensityScatterPoint[] {
  return activities
    .filter(
      (a) =>
        (Number(a.moving_time) || 0) >= 600 &&
        (Number(a.icu_intensity) || 0) > 20
    )
    .slice(0, 80)
    .map((a) => ({
      id: a.id,
      date: (a.start_date_local || "").slice(0, 10),
      name: a.name || sportLabelPl(a.type),
      category: normalizeSportCategory(a.type),
      sportLabel: sportLabelPl(a.type),
      durationMin: Math.round((Number(a.moving_time) || 0) / 60),
      ifPct: Math.round(Number(a.icu_intensity) || 0),
      tss: Math.round(Number(a.icu_training_load) || 0),
    }));
}

export interface TaperProjectionPoint extends PmcPoint {
  isProjection: boolean;
  isRaceDay: boolean;
}

export function computeTaperSimulation(
  pmc: PmcPoint[],
  raceDateISO: string,
  weeklyPlannedTss: number,
  taperReductionPct: number
): {
  points: TaperProjectionPoint[];
  raceDayPoint: TaperProjectionPoint | null;
} {
  if (pmc.length === 0) return { points: [], raceDayPoint: null };

  const history: TaperProjectionPoint[] = pmc.slice(-45).map((p) => ({
    ...p,
    isProjection: false,
    isRaceDay: false,
  }));

  const last = history[history.length - 1];
  const today = new Date(`${last.date}T12:00:00`);
  const raceDate = new Date(`${raceDateISO}T12:00:00`);
  const diffDays = Math.round(
    (raceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  const horizonDays = Math.max(3, Math.min(90, diffDays > 0 ? diffDays + 2 : 21));
  const dailyBaseTss = Math.max(0, weeklyPlannedTss / 7);
  const taperFactor = Math.max(0.15, Math.min(0.85, 1 - taperReductionPct / 100));

  let ctl = last.ctl;
  let atl = last.atl;
  const ctlDecay = Math.exp(-1 / 42);
  const atlDecay = Math.exp(-1 / 7);

  const projected: TaperProjectionPoint[] = [];
  for (let d = 1; d <= horizonDays; d++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + d);
    const iso = dt.toISOString().slice(0, 10);
    const daysToRace = diffDays - d;

    let tss = dailyBaseTss;
    if (daysToRace === 0) {
      tss = dailyBaseTss * 1.6;
    } else if (daysToRace > 0 && daysToRace <= 7) {
      // Progressive taper over final 7 days
      tss = dailyBaseTss * taperFactor;
    } else if (daysToRace < 0) {
      tss = dailyBaseTss * 0.3;
    }

    ctl = ctl * ctlDecay + tss * (1 - ctlDecay);
    atl = atl * atlDecay + tss * (1 - atlDecay);
    const tsb = ctl - atl;

    projected.push({
      date: iso,
      ctl: Number(ctl.toFixed(1)),
      atl: Number(atl.toFixed(1)),
      tsb: Number(tsb.toFixed(1)),
      tss: Math.round(tss),
      rampRate: 0,
      isProjection: true,
      isRaceDay: iso === raceDateISO,
    });
  }

  const allPoints = [...history, ...projected];
  const raceDayPoint =
    projected.find((p) => p.isRaceDay) || projected[projected.length - 1] || null;

  return { points: allPoints, raceDayPoint };
}

export interface PowerBenchmarkPoint {
  secs: number;
  label: string;
  recentWatts: number | null;
  seasonWatts: number | null;
  recentWkg: number | null;
  seasonWkg: number | null;
}

const MMP_BENCHMARKS: Array<{ secs: number; label: string }> = [
  { secs: 5, label: "5 s" },
  { secs: 15, label: "15 s" },
  { secs: 30, label: "30 s" },
  { secs: 60, label: "1 min" },
  { secs: 180, label: "3 min" },
  { secs: 300, label: "5 min" },
  { secs: 600, label: "10 min" },
  { secs: 1200, label: "20 min" },
  { secs: 2400, label: "40 min" },
  { secs: 3600, label: "60 min" },
];

function lookupWattsAtSec(curve: PowerCurveSet | undefined, targetSec: number): number | null {
  if (!curve || !Array.isArray(curve.secs) || !Array.isArray(curve.watts)) {
    return null;
  }
  let bestIdx = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < curve.secs.length; i++) {
    const diff = Math.abs(curve.secs[i] - targetSec);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  if (bestIdx === -1 || bestDiff > Math.max(5, targetSec * 0.2)) return null;
  const val = Number(curve.watts[bestIdx]);
  return Number.isFinite(val) && val > 0 ? Math.round(val) : null;
}

export function computePowerCurveSummary(
  powerCurves: PowerCurveSet[] | undefined,
  weightKg: number | null | undefined
): {
  benchmarks: PowerBenchmarkPoint[];
  eFtp: number | null;
  riderProfile: string;
  hasData: boolean;
} {
  const curves = powerCurves || [];
  const recentCurve =
    curves.find((c) => c.id?.includes("90")) || curves[0];
  const seasonCurve =
    curves.find((c) => c.id?.includes("1y") || c.id?.includes("365")) ||
    curves[1] ||
    recentCurve;

  const w = weightKg && weightKg > 35 ? weightKg : null;

  const benchmarks: PowerBenchmarkPoint[] = MMP_BENCHMARKS.map((b) => {
    const rw = lookupWattsAtSec(recentCurve, b.secs);
    const sw = lookupWattsAtSec(seasonCurve, b.secs);
    return {
      secs: b.secs,
      label: b.label,
      recentWatts: rw,
      seasonWatts: sw,
      recentWkg: rw && w ? Number((rw / w).toFixed(2)) : null,
      seasonWkg: sw && w ? Number((sw / w).toFixed(2)) : null,
    };
  });

  const hasData = benchmarks.some((b) => b.recentWatts || b.seasonWatts);

  const w20 =
    benchmarks.find((b) => b.secs === 1200)?.recentWatts ||
    benchmarks.find((b) => b.secs === 1200)?.seasonWatts;
  const w5 =
    benchmarks.find((b) => b.secs === 300)?.recentWatts ||
    benchmarks.find((b) => b.secs === 300)?.seasonWatts;
  const w1 =
    benchmarks.find((b) => b.secs === 60)?.recentWatts ||
    benchmarks.find((b) => b.secs === 60)?.seasonWatts;
  const w5s =
    benchmarks.find((b) => b.secs === 5)?.recentWatts ||
    benchmarks.find((b) => b.secs === 5)?.seasonWatts;

  const eFtp = w20 ? Math.round(w20 * 0.95) : null;

  let riderProfile = "Brak danych MMP do klasyfikacji profilu";
  if (w5s && w1 && w5 && w20) {
    const sprintRatio = w5s / w20;
    const vo2Ratio = w5 / w20;
    if (sprintRatio >= 3.4) {
      riderProfile = "Sprinter (bardzo wysoka moc szczytowa 5 s)";
    } else if (w1 / w20 >= 1.95 && vo2Ratio >= 1.22) {
      riderProfile = "Puncher (dynamiczne ataki 1–5 min)";
    } else if (vo2Ratio <= 1.16) {
      riderProfile = "Czasowiec / Diesel (wysoka wytrzymałość progowa)";
    } else {
      riderProfile = "Wszechstronny (zrównoważony profil mocy)";
    }
  }

  return { benchmarks, eFtp, riderProfile, hasData };
}

export interface PlanVsActualRow {
  date: string;
  plannedName: string;
  category: string;
  plannedMin: number;
  plannedTss: number;
  actualMin: number;
  actualTss: number;
  actualCount: number;
  status: "completed" | "partial" | "missed" | "upcoming";
}

export function computePlanVsActual(
  events: IntervalsEvent[] | undefined,
  activities: IntervalsActivity[]
): {
  pastRows: PlanVsActualRow[];
  upcomingRows: IntervalsEvent[];
  adherencePct: number | null;
} {
  const allEvents = events || [];
  const todayIso = new Date().toISOString().slice(0, 10);

  const actByDate = new Map<
    string,
    { mins: number; tss: number; count: number }
  >();
  for (const act of activities) {
    const d = (act.start_date_local || "").slice(0, 10);
    if (!d) continue;
    const cur = actByDate.get(d) || { mins: 0, tss: 0, count: 0 };
    cur.mins += Math.round((Number(act.moving_time) || 0) / 60);
    cur.tss += Math.round(Number(act.icu_training_load) || 0);
    cur.count += 1;
    actByDate.set(d, cur);
  }

  const workoutEvents = allEvents.filter((e) => {
    const cat = (e.category || "WORKOUT").toUpperCase();
    return cat === "WORKOUT" || cat.startsWith("RACE");
  });

  const pastRows: PlanVsActualRow[] = [];
  const upcomingRows: IntervalsEvent[] = [];

  for (const ev of workoutEvents) {
    const d = (ev.start_date_local || "").slice(0, 10);
    if (!d) continue;
    if (d > todayIso) {
      upcomingRows.push(ev);
      continue;
    }

    const actual = actByDate.get(d) || { mins: 0, tss: 0, count: 0 };
    const plannedMin = Math.round((Number(ev.moving_time) || 0) / 60);
    const plannedTss = Math.round(Number(ev.icu_training_load) || 0);

    let status: PlanVsActualRow["status"] = "missed";
    if (actual.count > 0) {
      if (plannedTss > 0) {
        status = actual.tss >= plannedTss * 0.75 ? "completed" : "partial";
      } else if (plannedMin > 0) {
        status = actual.mins >= plannedMin * 0.75 ? "completed" : "partial";
      } else {
        status = "completed";
      }
    }

    pastRows.push({
      date: d,
      plannedName: ev.name || "Zaplanowany trening",
      category: ev.category || "WORKOUT",
      plannedMin,
      plannedTss,
      actualMin: actual.mins,
      actualTss: actual.tss,
      actualCount: actual.count,
      status,
    });
  }

  pastRows.sort((a, b) => b.date.localeCompare(a.date));
  upcomingRows.sort((a, b) =>
    (a.start_date_local || "").localeCompare(b.start_date_local || "")
  );

  const completedCount = pastRows.filter((r) => r.status === "completed").length;
  const partialCount = pastRows.filter((r) => r.status === "partial").length;
  const adherencePct =
    pastRows.length > 0
      ? Math.round(((completedCount + partialCount * 0.5) / pastRows.length) * 100)
      : null;

  return { pastRows, upcomingRows, adherencePct };
}

export interface HealthCorrelationPoint {
  date: string;
  tss: number;
  atl: number;
  hrv: number | null;
  restingHR: number | null;
  sleepHours: number | null;
}

function pearsonCorr(xs: number[], ys: number[]): number | null {
  if (xs.length < 5 || xs.length !== ys.length) return null;
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const ax = xs[i] - mx;
    const ay = ys[i] - my;
    num += ax * ay;
    dx += ax * ax;
    dy += ay * ay;
  }
  const den = Math.sqrt(dx * dy);
  if (den === 0) return null;
  return Number((num / den).toFixed(2));
}

export function computeHealthLoadCorrelation(
  pmc: PmcPoint[],
  wellness: IntervalsWellnessDay[]
): {
  points: HealthCorrelationPoint[];
  corrAtlHrv: number | null;
  corrAtlRhr: number | null;
  highLoadAvgHrv: number | null;
  lowLoadAvgHrv: number | null;
  highLoadAvgSleep: number | null;
  lowLoadAvgSleep: number | null;
} {
  const pmcMap = new Map<string, PmcPoint>();
  for (const p of pmc) pmcMap.set(p.date, p);

  const points: HealthCorrelationPoint[] = [];
  const sortedW = [...wellness].sort((a, b) => a.id.localeCompare(b.id));

  for (const w of sortedW) {
    const d = w.id.slice(0, 10);
    const p = pmcMap.get(d);
    if (!p) continue;
    if (!w.hrv && !w.restingHR && !w.sleepSecs) continue;
    points.push({
      date: d,
      tss: p.tss,
      atl: p.atl,
      hrv: w.hrv ?? null,
      restingHR: w.restingHR ?? null,
      sleepHours: w.sleepSecs ? Number((w.sleepSecs / 3600).toFixed(2)) : null,
    });
  }

  const recent = points.slice(-45);

  const hrvPairs = recent.filter((p) => p.hrv !== null);
  const rhrPairs = recent.filter((p) => p.restingHR !== null);

  const corrAtlHrv = pearsonCorr(
    hrvPairs.map((p) => p.atl),
    hrvPairs.map((p) => p.hrv as number)
  );
  const corrAtlRhr = pearsonCorr(
    rhrPairs.map((p) => p.atl),
    rhrPairs.map((p) => p.restingHR as number)
  );

  const medianAtl =
    recent.length > 0
      ? [...recent].sort((a, b) => a.atl - b.atl)[Math.floor(recent.length / 2)].atl
      : 0;

  const highDays = recent.filter((p) => p.atl >= medianAtl);
  const lowDays = recent.filter((p) => p.atl < medianAtl);

  const avgOf = (arr: number[]) =>
    arr.length > 0
      ? Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1))
      : null;

  return {
    points: recent,
    corrAtlHrv,
    corrAtlRhr,
    highLoadAvgHrv: avgOf(
      highDays.map((p) => p.hrv).filter((v): v is number => v !== null)
    ),
    lowLoadAvgHrv: avgOf(
      lowDays.map((p) => p.hrv).filter((v): v is number => v !== null)
    ),
    highLoadAvgSleep: avgOf(
      highDays.map((p) => p.sleepHours).filter((v): v is number => v !== null)
    ),
    lowLoadAvgSleep: avgOf(
      lowDays.map((p) => p.sleepHours).filter((v): v is number => v !== null)
    ),
  };
}

export interface CriticalPowerModel {
  hasCp: boolean;
  cpWatts: number | null;
  wPrimeKj: number | null;
  wPrimeJ: number | null;
  pointsUsed: number;
}

export function computeCriticalPower(
  benchmarks: PowerBenchmarkPoint[]
): CriticalPowerModel {
  const targetSecs = [180, 300, 600, 1200];
  const pairs: Array<{ t: number; workJ: number }> = [];

  for (const sec of targetSecs) {
    const b = benchmarks.find((item) => item.secs === sec);
    const watts = b?.recentWatts || b?.seasonWatts;
    if (watts && watts > 40) {
      pairs.push({ t: sec, workJ: watts * sec });
    }
  }

  if (pairs.length < 2) {
    return {
      hasCp: false,
      cpWatts: null,
      wPrimeKj: null,
      wPrimeJ: null,
      pointsUsed: pairs.length,
    };
  }

  const n = pairs.length;
  const meanT = pairs.reduce((s, p) => s + p.t, 0) / n;
  const meanW = pairs.reduce((s, p) => s + p.workJ, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of pairs) {
    num += (p.t - meanT) * (p.workJ - meanW);
    den += (p.t - meanT) ** 2;
  }

  if (den <= 0) {
    return {
      hasCp: false,
      cpWatts: null,
      wPrimeKj: null,
      wPrimeJ: null,
      pointsUsed: n,
    };
  }

  const cp = num / den;
  const wPrimeJ = meanW - cp * meanT;

  if (!Number.isFinite(cp) || cp <= 50 || !Number.isFinite(wPrimeJ) || wPrimeJ <= 500) {
    return {
      hasCp: false,
      cpWatts: null,
      wPrimeKj: null,
      wPrimeJ: null,
      pointsUsed: n,
    };
  }

  return {
    hasCp: true,
    cpWatts: Math.round(cp),
    wPrimeKj: Number((wPrimeJ / 1000).toFixed(1)),
    wPrimeJ: Math.round(wPrimeJ),
    pointsUsed: n,
  };
}

export interface RacePrediction {
  label: string;
  distanceKm: number;
  predictedSecs: number;
  predictedTimeStr: string;
  paceStr: string;
}

export interface RunningPaceBenchmark {
  label: string;
  distanceM: number;
  paceStr: string;
  speedMs: number;
}

export interface RunningSummary {
  hasRunning: boolean;
  runsCount: number;
  totalRunKm: number;
  thresholdPaceStr: string | null;
  referenceBasis: string | null;
  paceBenchmarks: RunningPaceBenchmark[];
  racePredictions: RacePrediction[];
}

function formatSecsPerKm(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  if (s === 60) return `${m + 1}:00 /km`;
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function computeRunningSummary(
  paceCurves: PaceCurveSet[] | undefined,
  activities: IntervalsActivity[],
  thresholdPaceFromSettings?: number | null
): RunningSummary {
  const runs = activities.filter(
    (a) => normalizeSportCategory(a.type) === "running"
  );
  const totalRunKm = Number(
    runs.reduce((s, r) => s + (Number(r.distance) || 0) / 1000, 0).toFixed(1)
  );

  // Try extracting pace curve benchmarks
  const curve =
    paceCurves?.find((c) => c.id?.includes("90")) || paceCurves?.[0];
  const paceBenchmarks: RunningPaceBenchmark[] = [];

  if (curve && Array.isArray(curve.distance) && Array.isArray(curve.secs)) {
    const targets = [
      { d: 400, label: "400 m" },
      { d: 1000, label: "1 km" },
      { d: 3000, label: "3 km" },
      { d: 5000, label: "5 km" },
      { d: 10000, label: "10 km" },
    ];
    for (const t of targets) {
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < curve.distance.length; i++) {
        const diff = Math.abs((curve.distance[i] || 0) - t.d);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestDiff <= t.d * 0.15) {
        const dist = curve.distance[bestIdx];
        const sec = curve.secs[bestIdx];
        if (dist > 0 && sec > 0) {
          const speed = dist / sec;
          const secPerKm = 1000 / speed;
          paceBenchmarks.push({
            label: t.label,
            distanceM: t.d,
            paceStr: formatSecsPerKm(secPerKm),
            speedMs: speed,
          });
        }
      }
    }
  }

  // Pick best reference run >= 2.5 km (or from pace curve 5km/3km/10km) for Riegel race predictions
  let refDistM = 0;
  let refSecs = 0;
  let referenceBasis: string | null = null;

  const curveRef =
    paceBenchmarks.find((b) => b.distanceM === 5000) ||
    paceBenchmarks.find((b) => b.distanceM === 10000) ||
    paceBenchmarks.find((b) => b.distanceM === 3000);

  if (curveRef) {
    refDistM = curveRef.distanceM;
    refSecs = curveRef.distanceM / curveRef.speedMs;
    referenceBasis = `Na podstawie rekordu ${curveRef.label} z krzywej tempa (${curveRef.paceStr})`;
  } else {
    const eligibleRuns = runs.filter(
      (r) =>
        (Number(r.distance) || 0) >= 2500 &&
        (Number(r.moving_time) || 0) >= 600 &&
        (Number(r.average_speed) || 0) > 1.3
    );
    if (eligibleRuns.length > 0) {
      // Choose highest VDOT-like score (fastest normalized to 5k)
      let bestScore = -1;
      let bestRun = eligibleRuns[0];
      for (const r of eligibleRuns) {
        const d = Number(r.distance);
        const t = Number(r.moving_time);
        const est5k = t * Math.pow(5000 / d, 1.06);
        const score = 5000 / est5k;
        if (score > bestScore) {
          bestScore = score;
          bestRun = r;
        }
      }
      refDistM = Number(bestRun.distance);
      refSecs = Number(bestRun.moving_time);
      const km = (refDistM / 1000).toFixed(1);
      referenceBasis = `Na podstawie biegu ${km} km (${formatDateFullPl(bestRun.start_date_local)})`;
    }
  }

  const raceTargets = [
    { label: "5 km", distanceKm: 5 },
    { label: "10 km", distanceKm: 10 },
    { label: "Półmaraton (21.1 km)", distanceKm: 21.0975 },
    { label: "Maraton (42.2 km)", distanceKm: 42.195 },
  ];

  const racePredictions: RacePrediction[] =
    refDistM > 0 && refSecs > 0
      ? raceTargets.map((target) => {
          const targetM = target.distanceKm * 1000;
          const predictedSecs = Math.round(
            refSecs * Math.pow(targetM / refDistM, 1.06)
          );
          const secPerKm = predictedSecs / target.distanceKm;
          return {
            label: target.label,
            distanceKm: target.distanceKm,
            predictedSecs,
            predictedTimeStr: formatDurationLong(predictedSecs),
            paceStr: formatSecsPerKm(secPerKm),
          };
        })
      : [];

  let thresholdPaceStr: string | null = null;
  if (thresholdPaceFromSettings && thresholdPaceFromSettings > 0) {
    thresholdPaceStr = formatSecsPerKm(1000 / thresholdPaceFromSettings);
  } else if (racePredictions.length > 1) {
    // 10k-15k Riegel pace approximates LT2 threshold pace for well-trained runners
    const pred10 = racePredictions[1];
    const secPerKm10 = pred10.predictedSecs / 10;
    thresholdPaceStr = formatSecsPerKm(secPerKm10 * 1.03);
  }

  return {
    hasRunning: runs.length > 0 || paceBenchmarks.length > 0,
    runsCount: runs.length,
    totalRunKm,
    thresholdPaceStr,
    referenceBasis,
    paceBenchmarks,
    racePredictions,
  };
}



