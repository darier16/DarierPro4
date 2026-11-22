export type BikeType = "road" | "tt" | "gravel" | "mtb";

export interface BikePreset {
  id: BikeType;
  label: string;
  shortLabel: string;
  defaultSpeedKmh: number;
  minSpeedKmh: number;
  maxSpeedKmh: number;
  windSensitivity: string;
  tirePressure: string;
  aeroFactorNote: string;
  cda: number;
  crr: number;
  bikeWeightKg: number;
  intensityFactor: number;
}

export const BIKE_PRESETS: Record<BikeType, BikePreset> = {
  road: {
    id: "road",
    label: "Rower Szosowy",
    shortLabel: "Szosowy",
    defaultSpeedKmh: 31,
    minSpeedKmh: 18,
    maxSpeedKmh: 48,
    windSensitivity: "Średnia · pozycja na klamkach/dolnym chwycie",
    tirePressure: "5.8–6.6 bar (28–30 mm)",
    aeroFactorNote:
      "Przy wietrze czołowym >18 km/h utrzymuj równą moc w dolnym chwycie i jedź na zmiany.",
    cda: 0.31,
    crr: 0.0042,
    bikeWeightKg: 7.8,
    intensityFactor: 1.0,
  },
  tt: {
    id: "tt",
    label: "Rower Czasowy / TT",
    shortLabel: "Czasówka / TT",
    defaultSpeedKmh: 37,
    minSpeedKmh: 24,
    maxSpeedKmh: 55,
    windSensitivity: "Wysoka na podmuchy boczne (stożki/dysk)",
    tirePressure: "6.4–7.2 bar (25–28 mm)",
    aeroFactorNote:
      "Wiatr boczny >20 km/h wymaga pewnego trzymania lemondki i ostrożności przy wysokich stożkach.",
    cda: 0.23,
    crr: 0.0038,
    bikeWeightKg: 8.8,
    intensityFactor: 1.12,
  },
  gravel: {
    id: "gravel",
    label: "Rower Gravel",
    shortLabel: "Gravel",
    defaultSpeedKmh: 24,
    minSpeedKmh: 14,
    maxSpeedKmh: 38,
    windSensitivity: "Umiarkowana · stabilna geometria na szutrze",
    tirePressure: "2.3–3.1 bar (40–45 mm)",
    aeroFactorNote:
      "Po opadach deszczu obniż ciśnienie o 0.2–0.3 bar dla lepszej trakcji na miękkich drogach.",
    cda: 0.37,
    crr: 0.0065,
    bikeWeightKg: 9.6,
    intensityFactor: 1.03,
  },
  mtb: {
    id: "mtb",
    label: "Rower MTB / XC",
    shortLabel: "MTB / XC",
    defaultSpeedKmh: 19,
    minSpeedKmh: 10,
    maxSpeedKmh: 34,
    windSensitivity: "Niska · las i teren osłaniają przed podmuchami",
    tirePressure: "1.5–1.9 bar (2.25–2.4\")",
    aeroFactorNote:
      "W terenie większy wpływ ma mokra nawierzchnia i błoto niż sam opór powietrza.",
    cda: 0.44,
    crr: 0.0088,
    bikeWeightKg: 10.8,
    intensityFactor: 1.08,
  },
};

export interface RouteFolder {
  slug: string;
  name: string;
  isBuiltin?: boolean;
}

export const DEFAULT_ROUTE_FOLDERS: RouteFolder[] = [
  { slug: "szosa", name: "Szosa", isBuiltin: true },
  { slug: "gravel-mtb", name: "Gravel & MTB", isBuiltin: true },
  { slug: "wyscigi", name: "Wyścigi", isBuiltin: true },
  { slug: "strava", name: "Trasy Strava", isBuiltin: true },
  { slug: "moje-trasy", name: "Moje trasy", isBuiltin: true },
];

export function slugifyFolderName(name: string): string {
  const normalized = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `folder-${Date.now()}`;
}

export interface TrackPoint {
  lat: number;
  lng: number;
  ele: number | null;
  km: number;
  bearingDeg: number;
  slopePct: number;
}

export interface GpxBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type SurfaceType = "asfalt" | "szuter" | "mtb" | "mix";

export interface GpxRoute {
  id: string;
  name: string;
  fileName: string;
  folder: string;
  totalDistanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  minEleM: number | null;
  maxEleM: number | null;
  rawPointsCount: number;
  points: TrackPoint[];
  bounds: GpxBounds;
  savedAt?: string;
  bikeType?: BikeType;
  avgSpeedKmh?: number;
  surface?: SurfaceType;
  notes?: string;
  favorite?: boolean;
  isBuiltinSample?: boolean;
  isReversed?: boolean;
  rawXml?: string;
}

export interface RouteCheckpointInput {
  index: number;
  label: string;
  lat: number;
  lng: number;
  ele: number | null;
  km: number;
  etaIso: string; // Local YYYY-MM-DDTHH:MM
  etaTimeLabel: string; // HH:MM
  bearingDeg: number;
  slopePct: number;
}

export type WindImpactType = "headwind" | "tailwind" | "crosswind";

export interface WeatherCheckpoint extends RouteCheckpointInput {
  tempC: number;
  apparentTempC: number;
  humidityPct: number;
  precipProbPct: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  windGustsKmh: number;
  surfacePressureHpa: number;
  uvIndex: number;
  weatherCode: number;
  conditionLabel: string;
  conditionEmoji: string;
  conditionCategory:
    | "clear"
    | "partly_cloudy"
    | "cloudy"
    | "fog"
    | "rain"
    | "storm"
    | "snow";
  windImpact: WindImpactType;
  windImpactLabel: string;
  headwindComponentKmh: number;
  windCardinal: string;
}

export interface DepartureCompareOption {
  departureTime: string;
  finishTime: string;
  avgTempC: number;
  maxGustKmh: number;
  avgWindKmh: number;
  maxRainProbPct: number;
  totalRainMm: number;
  tailwindPct: number;
  headwindPct: number;
  score: number;
  verdict: string;
  isBest: boolean;
}

export interface DaylightInfo {
  sunrise: string; // HH:MM
  sunset: string; // HH:MM
  uvIndexMax: number;
}

export interface GeoSearchResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  elevation?: number;
}

export interface LocationHourlySlot {
  timeIso: string;
  hourLabel: string;
  dateLabel: string;
  tempC: number;
  apparentTempC: number;
  precipProbPct: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windGustsKmh: number;
  windCardinal: string;
  windDirectionDeg: number;
  humidityPct: number;
  uvIndex: number;
  conditionLabel: string;
  conditionEmoji: string;
  comfortScore: number;
}

export interface DailyForecastItem {
  date: string; // YYYY-MM-DD
  dayShort: string; // e.g. "Wt 17.11"
  conditionEmoji: string;
  conditionLabel: string;
  tempMinC: number;
  tempMaxC: number;
  windMaxKmh: number;
  gustMaxKmh: number;
  windCardinal: string;
  windDirectionDeg: number;
  precipProbMaxPct: number;
  precipSumMm: number;
  uvIndexMax: number;
  sunrise: string;
  sunset: string;
  comfortScore: number;
  verdict: string;
}

export interface LocationForecastResponse {
  locationName: string;
  lat: number;
  lng: number;
  daylight: DaylightInfo;
  bestWindows: Array<{
    startHour: string;
    endHour: string;
    dateLabel: string;
    avgTempC: number;
    avgWindKmh: number;
    maxRainProbPct: number;
    score: number;
    conditionEmoji: string;
  }>;
  hourly: LocationHourlySlot[];
  dailyForecast: DailyForecastItem[];
}

export type PoiCategory = "water" | "shop" | "gas" | "cafe" | "repair";

export interface RoutePoi {
  id: string;
  category: PoiCategory;
  name: string;
  lat: number;
  lng: number;
  kmOnRoute: number;
  distFromRouteM: number;
  openingHours?: string;
}

export interface RouteClimb {
  id: string;
  index: number;
  name: string;
  category: "HC" | "1" | "2" | "3" | "4";
  startKm: number;
  endKm: number;
  lengthKm: number;
  elevationGainM: number;
  avgSlopePct: number;
  maxSlopePct: number;
  summitEleM: number;
  summitLat: number;
  summitLng: number;
  score: number;
}

export interface SimulatedRideResult {
  nominalSpeedKmh: number;
  realisticSpeedKmh: number;
  totalMinutes: number;
  checkpoints: RouteCheckpointInput[];
}

export interface RideCursorState {
  fraction: number;
  km: number;
  lat: number;
  lng: number;
  ele: number | null;
  slopePct: number;
  etaTimeLabel: string;
  tempC?: number;
  windSpeedKmh?: number;
  windCardinal?: string;
  windImpact?: WindImpactType;
  windDeltaWatts?: number;
  conditionEmoji?: string;
}

export const WEATHER_HOME_STORAGE_KEY = "darierpro_weather_home_v1";

const STORAGE_KEY = "darierpro_saved_gpx_v1";
const FOLDERS_STORAGE_KEY = "darierpro_gpx_folders_v1";

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeBearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function degreesToCardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export function analyzeRelativeWind(
  windFromDeg: number,
  rideBearingDeg: number,
  windSpeedKmh: number
): {
  impact: WindImpactType;
  label: string;
  headwindComponentKmh: number;
} {
  const diff = Math.abs(
    (((windFromDeg - rideBearingDeg) % 360) + 540) % 360 - 180
  );
  const factor = Math.cos(toRad(diff));
  const headwindComponentKmh = Math.round(windSpeedKmh * factor);

  if (factor >= 0.42) {
    return { impact: "headwind", label: "Wiatr w twarz", headwindComponentKmh };
  }
  if (factor <= -0.42) {
    return { impact: "tailwind", label: "Wiatr w plecy", headwindComponentKmh };
  }
  return { impact: "crosswind", label: "Wiatr boczny", headwindComponentKmh };
}

export function estimateWindWattImpact(
  speedKmh: number,
  headwindComponentKmh: number,
  slopePct: number,
  bikeType: BikeType,
  riderWeightKg = 74
): {
  windDeltaWatts: number;
  calmTotalWatts: number;
  windTotalWatts: number;
  realisticSpeedKmh: number;
} {
  const preset = BIKE_PRESETS[bikeType];
  const v = Math.max(2, speedKmh / 3.6);
  const vWind = headwindComponentKmh / 3.6;
  const rho = 1.225;
  const totalMassKg = Math.max(50, riderWeightKg) + preset.bikeWeightKg;
  const g = 9.81;
  const slopeRad = Math.atan(Math.max(-15, Math.min(20, slopePct)) / 100);

  const aeroCalm = 0.5 * rho * preset.cda * v * v * v;
  const vApparent = v + vWind;
  const aeroWind = 0.5 * rho * preset.cda * vApparent * Math.abs(vApparent) * v;

  const rolling = preset.crr * totalMassKg * g * Math.cos(slopeRad) * v;
  const gravity = totalMassKg * g * Math.sin(slopeRad) * v;

  const windDeltaWatts = Math.round(aeroWind - aeroCalm);
  const calmTotalWatts = Math.max(30, Math.round(aeroCalm + rolling + gravity));
  const windTotalWatts = Math.max(30, Math.round(aeroWind + rolling + gravity));

  // Estimate speed delta if rider holds calm steady effort (approx 3% speed change per 10% aero power delta)
  const powerRatio = calmTotalWatts / Math.max(40, windTotalWatts);
  const speedMultiplier = Math.max(0.72, Math.min(1.22, Math.pow(powerRatio, 0.36)));
  const realisticSpeedKmh = Number((speedKmh * speedMultiplier).toFixed(1));

  return {
    windDeltaWatts,
    calmTotalWatts,
    windTotalWatts,
    realisticSpeedKmh,
  };
}

export function computeHydrationAndFueling(opts: {
  avgTempC: number;
  avgHumidityPct: number;
  durationMin: number;
  bikeType: BikeType;
}): {
  fluidMlPerHour: number;
  totalFluidLiters: number;
  bottles750: number;
  carbsGramsPerHour: number;
  totalCarbsGrams: number;
  sodiumMgPerHour: number;
  note: string;
} {
  const preset = BIKE_PRESETS[opts.bikeType];
  const tempFactor =
    opts.avgTempC >= 28
      ? 900
      : opts.avgTempC >= 22
        ? 760
        : opts.avgTempC >= 15
          ? 620
          : opts.avgTempC >= 8
            ? 500
            : 420;
  const humidityBonus = opts.avgHumidityPct >= 75 ? 90 : opts.avgHumidityPct >= 60 ? 40 : 0;
  const fluidMlPerHour = Math.round((tempFactor + humidityBonus) * preset.intensityFactor);
  const hours = Math.max(0.5, opts.durationMin / 60);
  const totalFluidLiters = Number(((fluidMlPerHour * hours) / 1000).toFixed(2));
  const bottles750 = Math.max(1, Math.ceil((fluidMlPerHour * hours) / 750));

  const carbsGramsPerHour =
    hours >= 3.5 ? 80 : hours >= 2 ? 65 : hours >= 1.2 ? 45 : 30;
  const totalCarbsGrams = Math.round(carbsGramsPerHour * hours);
  const sodiumMgPerHour = opts.avgTempC >= 22 ? 750 : opts.avgTempC >= 14 ? 550 : 400;

  let note = `Pij co 15 min (~${Math.round(fluidMlPerHour / 4)} ml). `;
  if (hours >= 2.5) {
    note += `Przy jeździe >2.5h celuj w ${carbsGramsPerHour} g węglowodanów/h (bidon izotonik + żel/baton co 40 min).`;
  } else {
    note += `Na trasę ${hours.toFixed(1)}h wystarczy ${bottles750} ${bottles750 === 1 ? "bidon 750 ml" : "bidony 750 ml"} z elektrolitami.`;
  }

  return {
    fluidMlPerHour,
    totalFluidLiters,
    bottles750,
    carbsGramsPerHour,
    totalCarbsGrams,
    sodiumMgPerHour,
    note,
  };
}

function buildRouteStatsAndSample(
  rawPoints: Array<{ lat: number; lng: number; ele: number | null }>,
  name: string,
  fileName: string,
  folder = "szosa",
  idPrefix = "gpx",
  rawXml?: string
): GpxRoute {
  if (rawPoints.length < 2) {
    throw new Error(
      "Plik GPX zawiera za mało punktów śladu (wymagane minimum 2 punkty)."
    );
  }

  let totalKm = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let minEleM: number | null = null;
  let maxEleM: number | null = null;

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  let lastAcceptedEle: number | null = rawPoints[0].ele;
  const fullPoints: TrackPoint[] = [];

  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lng > east) east = p.lng;
    if (p.lng < west) west = p.lng;

    if (p.ele !== null && Number.isFinite(p.ele)) {
      if (minEleM === null || p.ele < minEleM) minEleM = Math.round(p.ele);
      if (maxEleM === null || p.ele > maxEleM) maxEleM = Math.round(p.ele);

      if (lastAcceptedEle === null) {
        lastAcceptedEle = p.ele;
      } else {
        const diff = p.ele - lastAcceptedEle;
        if (Math.abs(diff) >= 2.5) {
          if (diff > 0) elevationGainM += diff;
          else elevationLossM += Math.abs(diff);
          lastAcceptedEle = p.ele;
        }
      }
    }

    let stepKm = 0;
    if (i > 0) {
      stepKm = haversineKm(
        rawPoints[i - 1].lat,
        rawPoints[i - 1].lng,
        p.lat,
        p.lng
      );
      totalKm += stepKm;
    }

    const nextIdx = Math.min(rawPoints.length - 1, i + 1);
    const prevIdx = Math.max(0, i - 1);
    const bearingDeg = computeBearingDeg(
      rawPoints[prevIdx].lat,
      rawPoints[prevIdx].lng,
      rawPoints[nextIdx].lat,
      rawPoints[nextIdx].lng
    );

    const prevEle = rawPoints[prevIdx].ele;
    const nextEle = rawPoints[nextIdx].ele;
    const windowDistM =
      haversineKm(
        rawPoints[prevIdx].lat,
        rawPoints[prevIdx].lng,
        rawPoints[nextIdx].lat,
        rawPoints[nextIdx].lng
      ) * 1000;
    const slopePct =
      prevEle !== null && nextEle !== null && windowDistM > 15
        ? Number((((nextEle - prevEle) / windowDistM) * 100).toFixed(1))
        : 0;

    fullPoints.push({
      lat: Number(p.lat.toFixed(6)),
      lng: Number(p.lng.toFixed(6)),
      ele: p.ele !== null && Number.isFinite(p.ele) ? Math.round(p.ele) : null,
      km: Number(totalKm.toFixed(2)),
      bearingDeg: Math.round(bearingDeg),
      slopePct: Math.max(-25, Math.min(25, slopePct)),
    });
  }

  const maxStored = 320;
  let sampledPoints = fullPoints;
  if (fullPoints.length > maxStored) {
    sampledPoints = [];
    const step = (fullPoints.length - 1) / (maxStored - 1);
    for (let i = 0; i < maxStored; i++) {
      const idx = Math.min(fullPoints.length - 1, Math.round(i * step));
      sampledPoints.push(fullPoints[idx]);
    }
  }

  // Recompute smooth segment slopes on sampled points
  for (let i = 0; i < sampledPoints.length; i++) {
    const prev = sampledPoints[Math.max(0, i - 1)];
    const next = sampledPoints[Math.min(sampledPoints.length - 1, i + 1)];
    const distM = (next.km - prev.km) * 1000;
    if (prev.ele !== null && next.ele !== null && distM > 20) {
      sampledPoints[i].slopePct = Number(
        Math.max(-22, Math.min(22, ((next.ele - prev.ele) / distM) * 100)).toFixed(1)
      );
    }
  }

  return {
    id: `${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || fileName.replace(/\.gpx$/i, ""),
    fileName,
    folder,
    totalDistanceKm: Number(totalKm.toFixed(1)),
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
    minEleM,
    maxEleM,
    rawPointsCount: rawPoints.length,
    points: sampledPoints,
    bounds: { north, south, east, west },
    rawXml,
  };
}

export function reverseGpxRoute(route: GpxRoute): GpxRoute {
  const reversed = [...route.points].reverse();
  let cumKm = 0;
  const newPoints: TrackPoint[] = reversed.map((pt, idx) => {
    if (idx > 0) {
      cumKm += haversineKm(
        reversed[idx - 1].lat,
        reversed[idx - 1].lng,
        pt.lat,
        pt.lng
      );
    }
    const prev = reversed[Math.max(0, idx - 1)];
    const next = reversed[Math.min(reversed.length - 1, idx + 1)];
    const bearingDeg = computeBearingDeg(prev.lat, prev.lng, next.lat, next.lng);
    const distM =
      haversineKm(prev.lat, prev.lng, next.lat, next.lng) * 1000;
    const slopePct =
      prev.ele !== null && next.ele !== null && distM > 20
        ? Number(
            Math.max(-22, Math.min(22, ((next.ele - prev.ele) / distM) * 100)).toFixed(1)
          )
        : 0;

    return {
      ...pt,
      km: Number(cumKm.toFixed(2)),
      bearingDeg: Math.round(bearingDeg),
      slopePct,
    };
  });

  const nextReversed = !route.isReversed;
  const cleanName = route.name.replace(/\s*\(Odwrócona\)$/, "");
  return {
    ...route,
    name: nextReversed ? `${cleanName} (Odwrócona)` : cleanName,
    elevationGainM: route.elevationLossM,
    elevationLossM: route.elevationGainM,
    points: newPoints,
    isReversed: nextReversed,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const POI_SYM_MAP: Record<PoiCategory, string> = {
  water: "Drinking Water",
  shop: "Convenience Store",
  gas: "Gas Station",
  cafe: "Restaurant",
  repair: "Bike Trail",
};

export function buildGpxXmlFromRoute(route: GpxRoute, waypoints?: RoutePoi[]): string {
  const wptBlock = (waypoints || [])
    .map((w) => {
      const desc = `km ${w.kmOnRoute.toFixed(1)} (${w.distFromRouteM}m od trasy)${w.openingHours ? ` · ${w.openingHours}` : ""}`;
      return `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lng.toFixed(6)}">\n    <name>${escapeXml(w.name)}</name>\n    <sym>${escapeXml(POI_SYM_MAP[w.category] || "Waypoint")}</sym>\n    <desc>${escapeXml(desc)}</desc>\n  </wpt>`;
    })
    .join("\n");

  // If unreversed and rawXml exists, preserve original high-res XML and inject waypoints if requested
  if (!route.isReversed && route.rawXml && route.rawXml.includes("<gpx")) {
    if (!wptBlock) return route.rawXml;
    const trkIdx = route.rawXml.indexOf("<trk");
    if (trkIdx >= 0) {
      return `${route.rawXml.slice(0, trkIdx)}${wptBlock}\n  ${route.rawXml.slice(trkIdx)}`;
    }
    const closeIdx = route.rawXml.lastIndexOf("</gpx>");
    if (closeIdx >= 0) {
      return `${route.rawXml.slice(0, closeIdx)}${wptBlock}\n</gpx>`;
    }
    return route.rawXml;
  }

  const trkpts = route.points
    .map((p) => {
      const eleTag = p.ele !== null ? `<ele>${p.ele}</ele>` : "";
      return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${eleTag}</trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DarierPro" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.name)}</name>
  </metadata>
${wptBlock ? `${wptBlock}\n` : ""}  <trk>
    <name>${escapeXml(route.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

export function parseGpxXml(
  xmlText: string,
  fileName: string,
  folder = "moje-trasy"
): GpxRoute {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Nieprawidłowy format pliku XML/GPX.");
  }

  const nameEl =
    doc.querySelector("trk > name") ||
    doc.querySelector("metadata > name") ||
    doc.querySelector("rte > name");
  const routeName =
    nameEl?.textContent?.trim() || fileName.replace(/\.gpx$/i, "");

  let ptEls = Array.from(doc.querySelectorAll("trkpt"));
  if (ptEls.length < 2) {
    ptEls = Array.from(doc.querySelectorAll("rtept"));
  }
  if (ptEls.length < 2) {
    ptEls = Array.from(doc.querySelectorAll("wpt"));
  }

  const rawPoints: Array<{ lat: number; lng: number; ele: number | null }> = [];
  for (const el of ptEls) {
    const lat = Number(el.getAttribute("lat"));
    const lng = Number(el.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const eleText = el.querySelector("ele")?.textContent?.trim();
    const ele = eleText ? Number(eleText) : null;
    rawPoints.push({
      lat,
      lng,
      ele: ele !== null && Number.isFinite(ele) ? ele : null,
    });
  }

  return buildRouteStatsAndSample(
    rawPoints,
    routeName,
    fileName,
    folder,
    "gpx",
    xmlText.length <= 450000 ? xmlText : undefined
  );
}

export function sampleCheckpoints(
  route: GpxRoute,
  dateStr: string,
  startTimeStr: string,
  speedKmh: number
): RouteCheckpointInput[] {
  const points = route.points;
  if (points.length < 2) return [];

  const totalKm = Math.max(0.1, route.totalDistanceKm);
  const targetCount = totalKm < 35 ? 6 : totalKm <= 110 ? 8 : 10;

  const [hoursStr, minsStr] = startTimeStr.split(":");
  const startHours = Number(hoursStr) || 9;
  const startMins = Number(minsStr) || 0;
  const safeSpeed = Math.max(8, speedKmh);

  const [year, month, day] = dateStr.split("-").map(Number);
  const startDate = new Date(
    year,
    (month || 1) - 1,
    day || 1,
    startHours,
    startMins,
    0
  );

  const checkpoints: RouteCheckpointInput[] = [];

  for (let i = 0; i < targetCount; i++) {
    const fraction = i / (targetCount - 1);
    const targetKm = fraction * totalKm;

    let closest = points[0];
    let bestDiff = Infinity;
    for (const pt of points) {
      const diff = Math.abs(pt.km - targetKm);
      if (diff < bestDiff) {
        bestDiff = diff;
        closest = pt;
      }
    }

    const elapsedMinutes = Math.round((closest.km / safeSpeed) * 60);
    const etaDate = new Date(startDate.getTime() + elapsedMinutes * 60000);

    const yyyy = etaDate.getFullYear();
    const mm = String(etaDate.getMonth() + 1).padStart(2, "0");
    const dd = String(etaDate.getDate()).padStart(2, "0");
    const hh = String(etaDate.getHours()).padStart(2, "0");
    const min = String(etaDate.getMinutes()).padStart(2, "0");

    const label =
      i === 0
        ? "Start"
        : i === targetCount - 1
          ? "Meta"
          : `${Math.round(closest.km)} km`;

    checkpoints.push({
      index: i,
      label,
      lat: closest.lat,
      lng: closest.lng,
      ele: closest.ele,
      km: Number(closest.km.toFixed(1)),
      etaIso: `${yyyy}-${mm}-${dd}T${hh}:${min}`,
      etaTimeLabel: `${hh}:${min}`,
      bearingDeg: closest.bearingDeg,
      slopePct: closest.slopePct,
    });
  }

  return checkpoints;
}

export function createSampleRoutes(): GpxRoute[] {
  const lubinLoopCoords: Array<{ lat: number; lng: number; ele: number }> = [
    { lat: 51.4005, lng: 16.2015, ele: 132 },
    { lat: 51.4182, lng: 16.1781, ele: 141 },
    { lat: 51.4465, lng: 16.1322, ele: 158 },
    { lat: 51.481, lng: 16.0715, ele: 175 },
    { lat: 51.4982, lng: 16.0124, ele: 162 },
    { lat: 51.4641, lng: 15.963, ele: 148 },
    { lat: 51.4188, lng: 15.9844, ele: 155 },
    { lat: 51.3752, lng: 16.0385, ele: 184 },
    { lat: 51.351, lng: 16.105, ele: 196 },
    { lat: 51.3622, lng: 16.1588, ele: 165 },
    { lat: 51.3845, lng: 16.192, ele: 142 },
    { lat: 51.4005, lng: 16.2015, ele: 132 },
  ];

  const mazowszeLoopCoords: Array<{ lat: number; lng: number; ele: number }> = [
    { lat: 52.1422, lng: 21.0525, ele: 98 },
    { lat: 52.089, lng: 21.112, ele: 92 },
    { lat: 52.0215, lng: 21.184, ele: 88 },
    { lat: 51.976, lng: 21.219, ele: 95 },
    { lat: 51.951, lng: 21.228, ele: 112 },
    { lat: 51.894, lng: 21.182, ele: 108 },
    { lat: 51.882, lng: 21.095, ele: 118 },
    { lat: 51.931, lng: 21.018, ele: 124 },
    { lat: 52.008, lng: 20.992, ele: 115 },
    { lat: 52.085, lng: 21.021, ele: 104 },
    { lat: 52.1422, lng: 21.0525, ele: 98 },
  ];

  const r1 = buildRouteStatsAndSample(
    lubinLoopCoords,
    "Pętla Dolnośląska · Lubin – Chocianów",
    "Budowniczych_LGOM_Lubin_Petla.gpx",
    "szosa",
    "sample_lubin"
  );
  r1.isBuiltinSample = true;
  r1.bikeType = "road";
  r1.avgSpeedKmh = 31;

  const r2 = buildRouteStatsAndSample(
    mazowszeLoopCoords,
    "Pętla Szosowa · Wilanów – Góra Kalwaria – Czersk",
    "Mazowsze_Gora_Kalwaria_Classic.gpx",
    "szosa",
    "sample_mazowsze"
  );
  r2.isBuiltinSample = true;
  r2.bikeType = "road";
  r2.avgSpeedKmh = 32;

  return [r1, r2];
}

export function loadSavedRoutes(): GpxRoute[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GpxRoute[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((r) => ({
          ...r,
          folder: r.folder || "szosa",
        }));
      }
    }
  } catch {
    // fallback
  }
  const samples = createSampleRoutes();
  saveRoutesToStorage(samples);
  return samples;
}

export function saveRoutesToStorage(routes: GpxRoute[]): void {
  try {
    // Strip heavy rawXml before storing in localStorage (rawXml goes to server subfolder!)
    const compact = routes.map((r) => {
      const copy = { ...r };
      delete copy.rawXml;
      return copy;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
  } catch {
    // ignore
  }
}

export function loadSavedFolders(): RouteFolder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RouteFolder[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  saveFoldersToStorage(DEFAULT_ROUTE_FOLDERS);
  return DEFAULT_ROUTE_FOLDERS;
}

export function saveFoldersToStorage(folders: RouteFolder[]): void {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  } catch {
    // ignore
  }
}

export function upsertSavedRoute(route: GpxRoute): GpxRoute[] {
  const current = loadSavedRoutes();
  const nextRoute: GpxRoute = {
    ...route,
    folder: route.folder || "moje-trasy",
    savedAt: new Date().toISOString(),
    isBuiltinSample: false,
  };
  const idx = current.findIndex((r) => r.id === route.id);
  const updated =
    idx >= 0
      ? current.map((r, i) => (i === idx ? nextRoute : r))
      : [nextRoute, ...current];
  saveRoutesToStorage(updated);
  return updated;
}

export function deleteSavedRoute(id: string): GpxRoute[] {
  const current = loadSavedRoutes();
  const filtered = current.filter((r) => r.id !== id);
  const result = filtered.length > 0 ? filtered : createSampleRoutes();
  saveRoutesToStorage(result);
  return result;
}

export function solveCyclingSpeedForPower(
  powerWatts: number,
  slopePct: number,
  headwindKmh: number,
  bikeType: BikeType,
  riderWeightKg = 74
): number {
  const preset = BIKE_PRESETS[bikeType];
  const massKg = Math.max(45, riderWeightKg) + preset.bikeWeightKg;
  const g = 9.81;
  const rho = 1.225;
  const eta = 0.97;
  const clampedSlope = Math.max(-18, Math.min(22, slopePct));
  const gradeRad = Math.atan(clampedSlope / 100);
  const vWind = headwindKmh / 3.6;

  const powerAtSpeed = (vMs: number) => {
    const grav = massKg * g * Math.sin(gradeRad);
    const roll = preset.crr * massKg * g * Math.cos(gradeRad);
    const vRel = vMs + vWind;
    const aero = 0.5 * rho * preset.cda * vRel * Math.abs(vRel);
    return ((grav + roll + aero) * vMs) / eta;
  };

  let lo = 1.5; // ~5.4 km/h
  let hi = 23.0; // ~82.8 km/h
  const target = Math.max(40, Math.min(800, powerWatts));

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (powerAtSpeed(mid) < target) lo = mid;
    else hi = mid;
  }

  const kmh = ((lo + hi) / 2) * 3.6;
  return Number(Math.max(6, Math.min(72, kmh)).toFixed(1));
}

function classifyClimbCategory(score: number): RouteClimb["category"] {
  if (score >= 850) return "HC";
  if (score >= 500) return "1";
  if (score >= 280) return "2";
  if (score >= 140) return "3";
  return "4";
}

export function detectClimbs(route: GpxRoute): RouteClimb[] {
  const pts = route.points;
  if (pts.length < 4) return [];

  const climbs: RouteClimb[] = [];
  let inClimb = false;
  let startIdx = 0;
  let lastHighIdx = 0;
  let flatDistM = 0;

  const finalizeSegment = (sIdx: number, eIdx: number) => {
    const pStart = pts[sIdx];
    const pEnd = pts[eIdx];
    if (!pStart || !pEnd || pStart.ele === null || pEnd.ele === null) return;
    const lengthKm = Number((pEnd.km - pStart.km).toFixed(2));
    const gain = Math.round(pEnd.ele - pStart.ele);
    if (lengthKm < 0.35 || gain < 22) return;
    const avgSlope = Number(((gain / (lengthKm * 1000)) * 100).toFixed(1));
    if (avgSlope < 2.2) return;

    let maxSlope = avgSlope;
    for (let k = sIdx; k <= eIdx; k++) {
      if (pts[k].slopePct > maxSlope) maxSlope = pts[k].slopePct;
    }

    const score = Math.round(gain * avgSlope + (gain * gain) / (lengthKm * 10));
    climbs.push({
      id: `${route.id}_climb_${climbs.length + 1}`,
      index: climbs.length + 1,
      name: `Podjazd #${climbs.length + 1} (${Math.round(pEnd.km)} km)`,
      category: classifyClimbCategory(score),
      startKm: Number(pStart.km.toFixed(1)),
      endKm: Number(pEnd.km.toFixed(1)),
      lengthKm,
      elevationGainM: gain,
      avgSlopePct: avgSlope,
      maxSlopePct: Number(Math.min(25, maxSlope).toFixed(1)),
      summitEleM: Math.round(pEnd.ele),
      summitLat: pEnd.lat,
      summitLng: pEnd.lng,
      score,
    });
  };

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    if (prev.ele === null || curr.ele === null) continue;
    const dKm = Math.max(0.001, curr.km - prev.km);
    const dEle = curr.ele - prev.ele;
    const segSlope = (dEle / (dKm * 1000)) * 100;

    if (!inClimb) {
      if (segSlope >= 2.0 && dEle > 0) {
        inClimb = true;
        startIdx = i - 1;
        lastHighIdx = i;
        flatDistM = 0;
      }
    } else {
      if (curr.ele >= (pts[lastHighIdx].ele ?? curr.ele)) {
        lastHighIdx = i;
        flatDistM = 0;
      } else {
        flatDistM += dKm * 1000;
      }

      const dropFromPeak = (pts[lastHighIdx].ele ?? curr.ele) - curr.ele;
      if (flatDistM > 280 || dropFromPeak > 14) {
        finalizeSegment(startIdx, lastHighIdx);
        inClimb = false;
        flatDistM = 0;
      }
    }
  }

  if (inClimb) {
    finalizeSegment(startIdx, lastHighIdx);
  }

  return climbs
    .sort((a, b) => a.startKm - b.startKm)
    .map((c, idx) => ({
      ...c,
      index: idx + 1,
      name: `Podjazd #${idx + 1} (${c.endKm.toFixed(1)} km)`,
    }));
}

export function simulateRideFromPower(
  route: GpxRoute,
  dateStr: string,
  startTimeStr: string,
  targetWatts: number,
  bikeType: BikeType,
  riderWeightKg = 74,
  weatherCheckpoints: WeatherCheckpoint[] = []
): SimulatedRideResult {
  const points = route.points;
  const totalKm = Math.max(0.1, route.totalDistanceKm);
  const flatSpeed = solveCyclingSpeedForPower(
    targetWatts,
    0,
    0,
    bikeType,
    riderWeightKg
  );

  if (points.length < 2) {
    return {
      nominalSpeedKmh: flatSpeed,
      realisticSpeedKmh: flatSpeed,
      totalMinutes: Math.round((totalKm / flatSpeed) * 60),
      checkpoints: sampleCheckpoints(route, dateStr, startTimeStr, flatSpeed),
    };
  }

  const getNearestHeadwind = (km: number): number => {
    if (weatherCheckpoints.length === 0) return 0;
    let best = weatherCheckpoints[0];
    let bestDiff = Math.abs(best.km - km);
    for (const cp of weatherCheckpoints) {
      const diff = Math.abs(cp.km - km);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = cp;
      }
    }
    return best.headwindComponentKmh || 0;
  };

  // Cumulative simulated minutes at each point
  const cumMinutes: number[] = [0];
  let elapsedMin = 0;
  for (let i = 1; i < points.length; i++) {
    const segKm = Math.max(0, points[i].km - points[i - 1].km);
    const midKm = (points[i].km + points[i - 1].km) / 2;
    const slope = points[i].slopePct ?? 0;
    const headwind = getNearestHeadwind(midKm);
    const segSpeed = solveCyclingSpeedForPower(
      targetWatts,
      slope,
      headwind,
      bikeType,
      riderWeightKg
    );
    elapsedMin += (segKm / Math.max(6, segSpeed)) * 60;
    cumMinutes.push(elapsedMin);
  }

  const totalMinutes = Math.max(1, Math.round(elapsedMin));
  const realisticSpeedKmh = Number(
    Math.max(8, Math.min(60, (totalKm / totalMinutes) * 60)).toFixed(1)
  );

  const targetCount = totalKm < 35 ? 6 : totalKm <= 110 ? 8 : 10;
  const [hoursStr, minsStr] = startTimeStr.split(":");
  const startHours = Number(hoursStr) || 9;
  const startMins = Number(minsStr) || 0;
  const [year, month, day] = dateStr.split("-").map(Number);
  const startDate = new Date(
    year,
    (month || 1) - 1,
    day || 1,
    startHours,
    startMins,
    0
  );

  const checkpoints: RouteCheckpointInput[] = [];
  for (let i = 0; i < targetCount; i++) {
    const fraction = i / (targetCount - 1);
    const targetKm = fraction * totalKm;

    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let pIdx = 0; pIdx < points.length; pIdx++) {
      const diff = Math.abs(points[pIdx].km - targetKm);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = pIdx;
      }
    }
    const closest = points[bestIdx];
    const minsAtPoint = Math.round(cumMinutes[bestIdx] || 0);
    const etaDate = new Date(startDate.getTime() + minsAtPoint * 60000);

    const yyyy = etaDate.getFullYear();
    const mm = String(etaDate.getMonth() + 1).padStart(2, "0");
    const dd = String(etaDate.getDate()).padStart(2, "0");
    const hh = String(etaDate.getHours()).padStart(2, "0");
    const min = String(etaDate.getMinutes()).padStart(2, "0");

    checkpoints.push({
      index: i,
      label:
        i === 0
          ? "Start"
          : i === targetCount - 1
            ? "Meta"
            : `${Math.round(closest.km)} km`,
      lat: closest.lat,
      lng: closest.lng,
      ele: closest.ele,
      km: Number(closest.km.toFixed(1)),
      etaIso: `${yyyy}-${mm}-${dd}T${hh}:${min}`,
      etaTimeLabel: `${hh}:${min}`,
      bearingDeg: closest.bearingDeg,
      slopePct: closest.slopePct,
    });
  }

  return {
    nominalSpeedKmh: flatSpeed,
    realisticSpeedKmh,
    totalMinutes,
    checkpoints,
  };
}

export function interpolateRideAtFraction(
  route: GpxRoute,
  fraction: number,
  totalDurationMins: number,
  startTimeStr: string,
  weatherCheckpoints: WeatherCheckpoint[] = [],
  wattDeltas: number[] = []
): RideCursorState | null {
  const pts = route.points;
  if (pts.length === 0) return null;

  const clampedFrac = Math.max(0, Math.min(1, fraction));
  const targetKm = clampedFrac * Math.max(0.1, route.totalDistanceKm);

  let segIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].km >= targetKm) {
      segIdx = i - 1;
      break;
    }
    segIdx = Math.max(0, pts.length - 2);
  }

  const p1 = pts[segIdx];
  const p2 = pts[Math.min(pts.length - 1, segIdx + 1)];
  const spanKm = Math.max(0.0001, p2.km - p1.km);
  const t = Math.max(0, Math.min(1, (targetKm - p1.km) / spanKm));

  const lat = p1.lat + (p2.lat - p1.lat) * t;
  const lng = p1.lng + (p2.lng - p1.lng) * t;
  const ele =
    p1.ele !== null && p2.ele !== null
      ? Math.round(p1.ele + (p2.ele - p1.ele) * t)
      : p1.ele ?? p2.ele;
  const slopePct = Number((p1.slopePct + (p2.slopePct - p1.slopePct) * t).toFixed(1));

  const [hoursStr, minsStr] = startTimeStr.split(":");
  const startTotalMins =
    (Number(hoursStr) || 9) * 60 + (Number(minsStr) || 0) + Math.round(clampedFrac * totalDurationMins);
  const wrappedMins = ((startTotalMins % 1440) + 1440) % 1440;
  const hh = String(Math.floor(wrappedMins / 60)).padStart(2, "0");
  const mm = String(wrappedMins % 60).padStart(2, "0");

  let nearestCpIdx = -1;
  let nearestCpDiff = Infinity;
  for (let i = 0; i < weatherCheckpoints.length; i++) {
    const diff = Math.abs(weatherCheckpoints[i].km - targetKm);
    if (diff < nearestCpDiff) {
      nearestCpDiff = diff;
      nearestCpIdx = i;
    }
  }
  const cp = nearestCpIdx >= 0 ? weatherCheckpoints[nearestCpIdx] : undefined;

  return {
    fraction: clampedFrac,
    km: Number(targetKm.toFixed(1)),
    lat,
    lng,
    ele,
    slopePct,
    etaTimeLabel: `${hh}:${mm}`,
    tempC: cp?.tempC,
    windSpeedKmh: cp?.windSpeedKmh,
    windCardinal: cp?.windCardinal,
    windImpact: cp?.windImpact,
    windDeltaWatts: nearestCpIdx >= 0 ? wattDeltas[nearestCpIdx] : undefined,
    conditionEmoji: cp?.conditionEmoji,
  };
}
