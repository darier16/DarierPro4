export type ShiftCode = "1" | "2" | "3" | "w";

export interface ShiftWorkConfig {
  enabled: boolean;
  pattern: string; // e.g. "3333ww2222w1111w"
  anchorDate: string; // YYYY-MM-DD
  anchorShiftIndex: number; // 0 to pattern.length - 1
  systemName: string;
}

export interface ShiftInfo {
  code: ShiftCode;
  name: string;
  shortLabel: string;
  hours: string;
  dayInBlock: number;
  totalInBlock: number;
  patternIndex: number;
  dateStr: string;
  badgeBg: string;
  textColor: string;
  borderColor: string;
  iconType: "night" | "afternoon" | "morning" | "off";
  bestTrainingWindow: string;
  recommendedIntensity: string;
  physiologicalAdvice: string;
  isHighFatigueShift: boolean;
}

export const SHIFT_WORK_STORAGE_KEY = "darierpro_shift_work_config_v1";

// Default 4-brigade pattern requested by user: 4 nights, 2 off, 4 afternoons, 1 off, 4 mornings, 1 off
export const DEFAULT_SHIFT_WORK_PATTERN = "3333ww2222w1111w";

export const DEFAULT_SHIFT_WORK_CONFIG: ShiftWorkConfig = {
  enabled: true,
  pattern: DEFAULT_SHIFT_WORK_PATTERN,
  anchorDate: "2026-11-18",
  anchorShiftIndex: 0, // Starts at 1st night shift by default
  systemName: "System czterobrygadowy (3333ww2222w1111w)",
};

export const SHIFT_METADATA: Record<
  ShiftCode,
  {
    name: string;
    shortLabel: string;
    hours: string;
    badgeBg: string;
    textColor: string;
    borderColor: string;
    iconType: "night" | "afternoon" | "morning" | "off";
    bestTrainingWindow: string;
    recommendedIntensity: string;
    physiologicalAdvice: string;
    isHighFatigueShift: boolean;
  }
> = {
  "3": {
    name: "III Zmiana (Noc)",
    shortLabel: "Noc",
    hours: "22:00 – 06:00",
    badgeBg: "bg-purple-100 dark:bg-purple-950/60",
    textColor: "text-purple-700 dark:text-purple-300",
    borderColor: "border-purple-300 dark:border-purple-800",
    iconType: "night",
    bestTrainingWindow: "Przed nocką (16:00–18:30) – wyłącznie lekki rozjazd Z1/Z2 lub odpoczynek",
    recommendedIntensity: "Niska (Strefa Z1/Z2). Unikaj interwałów beztlenowych / VO2max!",
    physiologicalAdvice:
      "Wysoki wyrzut kortyzolu, zaburzony rytm dobowy i spadek HRV. Po nocnej zmianie organizm potrzebuje snu w zaciemnionym pokoju. Trening powyżej progu FTP grozi przeciążeniem układu nerwowego.",
    isHighFatigueShift: true,
  },
  "2": {
    name: "II Zmiana (Popołudnie)",
    shortLabel: "Popołudnie",
    hours: "14:00 – 22:00",
    badgeBg: "bg-sky-100 dark:bg-sky-950/60",
    textColor: "text-sky-700 dark:text-sky-300",
    borderColor: "border-sky-300 dark:border-sky-800",
    iconType: "afternoon",
    bestTrainingWindow: "Rano 08:30 – 12:00 (optymalne okno na mocny trening przed pracą!)",
    recommendedIntensity: "Pełna swoboda (Z1 – Z5). Idealny dzień na Sweet Spot lub interwały.",
    physiologicalAdvice:
      "Bardzo dobre okno anaboliczne. Po przespanej nocy i porannym posiłku masz wysokie zasoby glikogenu. Trening przed pracą pozwala na optymalne bodźcowanie.",
    isHighFatigueShift: false,
  },
  "1": {
    name: "I Zmiana (Rano)",
    shortLabel: "Rano",
    hours: "06:00 – 14:00",
    badgeBg: "bg-amber-100 dark:bg-amber-950/60",
    textColor: "text-amber-700 dark:text-amber-300",
    borderColor: "border-amber-300 dark:border-amber-800",
    iconType: "morning",
    bestTrainingWindow: "Popołudnie 16:00 – 19:00 (po odpoczynku i posiłku po pracy)",
    recommendedIntensity: "Umiarkowana (Z1 – Z4). Baza tlenowa, kadencja, lekki Sweet Spot.",
    physiologicalAdvice:
      "Pobudka wczesnym rankiem (ok. 04:30) powoduje popołudniowy spadek czujności. Zrób 20-30 min drzemki po pracy przed wyjściem na rower.",
    isHighFatigueShift: false,
  },
  "w": {
    name: "Dzień wolny (Wolne)",
    shortLabel: "Wolne",
    hours: "Cały dzień",
    badgeBg: "bg-emerald-100 dark:bg-emerald-950/60",
    textColor: "text-emerald-700 dark:text-emerald-300",
    borderColor: "border-emerald-300 dark:border-emerald-800",
    iconType: "off",
    bestTrainingWindow: "Dowolna pora – idealny dzień na Long Ride (3–5h) lub kluczowy akcent",
    recommendedIntensity: "Dowolna (Z1 – Z7). Pełny potencjał regeneracyjny i adaptacyjny.",
    physiologicalAdvice:
      "Czas na superkompensację. Jeśli to 1. dzień po nockach – poświęć go na regenerację. Drugi dzień wolny to idealny moment na najdłuższy trening w bloku.",
    isHighFatigueShift: false,
  },
};

export function getStoredShiftWorkConfig(): ShiftWorkConfig {
  try {
    const raw = localStorage.getItem(SHIFT_WORK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ShiftWorkConfig>;
      if (typeof parsed.pattern === "string" && parsed.pattern.length > 0) {
        return {
          enabled: parsed.enabled ?? true,
          pattern: parsed.pattern.toLowerCase(),
          anchorDate: parsed.anchorDate || DEFAULT_SHIFT_WORK_CONFIG.anchorDate,
          anchorShiftIndex: Number(parsed.anchorShiftIndex ?? 0),
          systemName: parsed.systemName || DEFAULT_SHIFT_WORK_CONFIG.systemName,
        };
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_SHIFT_WORK_CONFIG;
}

export function setStoredShiftWorkConfig(config: ShiftWorkConfig): void {
  try {
    localStorage.setItem(SHIFT_WORK_STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(
      new CustomEvent("darierpro-shift-work-changed", { detail: config })
    );
  } catch {
    // ignore
  }
}

/**
 * Calculates days difference between two ISO dates (YYYY-MM-DD)
 */
function diffDays(dateStrA: string, dateStrB: string): number {
  const [y1, m1, d1] = dateStrA.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = dateStrB.slice(0, 10).split("-").map(Number);
  const utcA = Date.UTC(y1, m1 - 1, d1);
  const utcB = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utcA - utcB) / (1000 * 60 * 60 * 24));
}

/**
 * Computes shift information for any given date
 */
export function getShiftForDate(
  dateStr: string,
  config: ShiftWorkConfig = getStoredShiftWorkConfig()
): ShiftInfo {
  const cleanDate = dateStr.slice(0, 10);
  const pattern = (config.pattern || DEFAULT_SHIFT_WORK_PATTERN).toLowerCase();
  const patternLen = pattern.length;

  const delta = diffDays(cleanDate, config.anchorDate);
  const rawIdx = (config.anchorShiftIndex + delta) % patternLen;
  const patternIndex = (rawIdx + patternLen) % patternLen;

  const rawChar = pattern[patternIndex] || "w";
  const code: ShiftCode =
    rawChar === "1" ? "1" : rawChar === "2" ? "2" : rawChar === "3" ? "3" : "w";

  // Calculate day in block (e.g. 2nd of 4 nights)
  let dayInBlock = 1;
  let totalInBlock = 1;

  // Count backwards
  let prevIdx = (patternIndex - 1 + patternLen) % patternLen;
  while (pattern[prevIdx] === rawChar && dayInBlock < patternLen) {
    dayInBlock++;
    prevIdx = (prevIdx - 1 + patternLen) % patternLen;
  }

  // Count forwards
  let nextIdx = (patternIndex + 1) % patternLen;
  let forwardCount = 0;
  while (pattern[nextIdx] === rawChar && forwardCount < patternLen) {
    forwardCount++;
    nextIdx = (nextIdx + 1) % patternLen;
  }
  totalInBlock = dayInBlock + forwardCount;

  const meta = SHIFT_METADATA[code];

  return {
    code,
    name: `${meta.name} (${dayInBlock}/${totalInBlock})`,
    shortLabel: `${meta.shortLabel} ${dayInBlock}/${totalInBlock}`,
    hours: meta.hours,
    dayInBlock,
    totalInBlock,
    patternIndex,
    dateStr: cleanDate,
    badgeBg: meta.badgeBg,
    textColor: meta.textColor,
    borderColor: meta.borderColor,
    iconType: meta.iconType,
    bestTrainingWindow: meta.bestTrainingWindow,
    recommendedIntensity: meta.recommendedIntensity,
    physiologicalAdvice: meta.physiologicalAdvice,
    isHighFatigueShift: meta.isHighFatigueShift,
  };
}

/**
 * Generates an array of ShiftInfo for consecutive days starting from startDate
 */
export function generateShiftCalendar(
  startDateStr: string,
  daysCount: number = 30,
  config: ShiftWorkConfig = getStoredShiftWorkConfig()
): ShiftInfo[] {
  const result: ShiftInfo[] = [];
  const [y, m, d] = startDateStr.slice(0, 10).split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));

  for (let i = 0; i < daysCount; i++) {
    const iso = cur.toISOString().slice(0, 10);
    result.push(getShiftForDate(iso, config));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return result;
}

/**
 * Generates structured context object for AI prompts
 */
export function getShiftWorkAiContext(
  targetDate: string = new Date().toISOString().slice(0, 10),
  config: ShiftWorkConfig = getStoredShiftWorkConfig()
) {
  if (!config.enabled) {
    return { isShiftWorker: false };
  }

  const todayShift = getShiftForDate(targetDate, config);
  const next3Days = [0, 1, 2, 3].map((offset) => {
    const d = new Date(targetDate);
    d.setDate(d.getDate() + offset);
    const iso = d.toISOString().slice(0, 10);
    return getShiftForDate(iso, config);
  });

  return {
    isShiftWorker: true,
    systemName: config.systemName,
    pattern: config.pattern,
    todayShift: {
      code: todayShift.code,
      name: todayShift.name,
      hours: todayShift.hours,
      dayInBlock: `${todayShift.dayInBlock} z ${todayShift.totalInBlock}`,
      bestTrainingWindow: todayShift.bestTrainingWindow,
      recommendedIntensity: todayShift.recommendedIntensity,
      physiologicalRisk: todayShift.isHighFatigueShift
        ? "Wysokie ryzyko zmęczenia ośrodkowego (blok nocek)"
        : "Standardowe obciążenie",
    },
    upcomingSchedule: next3Days.map((s) => ({
      date: s.dateStr,
      shift: s.name,
      hours: s.hours,
      recommendedTraining: s.bestTrainingWindow,
    })),
    coachingRules: [
      "W dniach III zmiany (nocki): bezwzględnie zakazane ostre interwały beztlenowe/VO2max. Sugeruj rozjazd Z1/Z2 przed pracą (16-19) lub dzień wolny.",
      "Spadki HRV podczas bloku nocek wynikają z desynchronizacji dobowej i długu sennego, nie z przetrenowania sportowego.",
      "W dniach II zmiany (popołudniówki 14-22): optymalne okno na kluczowe jednostki z wysokim TSS to poranek (08:30-12:00).",
      "W dniach wolnych (w): zalecaj najdłuższe jazdy objętościowe (Long Ride Z2) lub kluczowe akcenty.",
    ],
  };
}
