import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  ColorScheme,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Bike,
  Calendar,
  CalendarDays,
  Check,
  Clock,
  CloudRain,
  CloudSun,
  Crosshair,
  Download,
  Droplets,
  Folder,
  FolderInput,
  FolderPlus,
  Gauge,
  MapPin,
  Mountain,
  Navigation,
  Pencil,
  Pause,
  Play,
  Flag,
  Flame,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Trash2,
  Upload,
  Wind,
  X,
  Zap,
} from "lucide-react";
import {
  BIKE_PRESETS,
  DEFAULT_ROUTE_FOLDERS,
  WEATHER_HOME_STORAGE_KEY,
  type BikeType,
  type DailyForecastItem,
  type DaylightInfo,
  type DepartureCompareOption,
  type GeoSearchResult,
  type GpxRoute,
  type LocationForecastResponse,
  type PoiCategory,
  type RideCursorState,
  type RouteClimb,
  type RouteFolder,
  type RoutePoi,
  type SurfaceType,
  type TrackPoint,
  type WeatherCheckpoint,
  type WindImpactType,
  buildGpxXmlFromRoute,
  computeHydrationAndFueling,
  createSampleRoutes,
  deleteSavedRoute,
  detectClimbs,
  estimateWindWattImpact,
  interpolateRideAtFraction,
  loadSavedFolders,
  loadSavedRoutes,
  parseGpxXml,
  reverseGpxRoute,
  sampleCheckpoints,
  saveFoldersToStorage,
  saveRoutesToStorage,
  simulateRideFromPower,
  upsertSavedRoute,
} from "../utils/gpx";

interface WeatherViewProps {
  darkMode: boolean;
  athleteWeightKg?: number;
  athleteFtp?: number;
  pendingRouteId?: string | null;
  onClearPendingRoute?: () => void;
}

type MapColorMode = "wind" | "slope" | "temp";
type WeatherMode = "gpx" | "location";
type RouteSortMode = "newest" | "favorites" | "distance" | "elevation" | "name";

const WIND_COLORS: Record<WindImpactType, string> = {
  tailwind: "#10b981", // Emerald
  crosswind: "#f59e0b", // Amber
  headwind: "#ef4444", // Rose
};

const SURFACE_LABELS: Record<SurfaceType, string> = {
  asfalt: "Asfalt",
  szuter: "Szuter / Gravel",
  mtb: "Teren / MTB",
  mix: "Mieszana",
};

function colorForSlope(slopePct: number): string {
  if (slopePct >= 7) return "#ef4444";
  if (slopePct >= 4) return "#f59e0b";
  if (slopePct >= 1) return "#10b981";
  return "#0ea5e9";
}

function colorForTemp(tempC: number): string {
  if (tempC >= 22) return "#f97316";
  if (tempC >= 15) return "#10b981";
  if (tempC >= 8) return "#0ea5e9";
  return "#3b82f6";
}

function formatLocalToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(baseIso: string, offsetDays: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + offsetDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}

function formatDurationMinutes(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = Math.round(totalMins % 60);
  if (h <= 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function timeStringToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Helper component inside <GoogleMap> to draw the GPX route polyline & handle fitBounds / pan
const RouteMapLayers: React.FC<{
  mode: WeatherMode;
  route: GpxRoute;
  checkpoints: WeatherCheckpoint[];
  mapColorMode: MapColorMode;
  locationTarget: { lat: number; lng: number } | null;
  fitTrigger: number;
}> = ({ mode, route, checkpoints, mapColorMode, locationTarget, fitTrigger }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary("maps");

  useEffect(() => {
    if (!map) return;
    if (mode === "location" && locationTarget) {
      map.setCenter(locationTarget);
      map.setZoom(11);
      return;
    }
    if (mode === "gpx" && route.bounds) {
      const { north, south, east, west } = route.bounds;
      if (
        Number.isFinite(north) &&
        Number.isFinite(south) &&
        Number.isFinite(east) &&
        Number.isFinite(west)
      ) {
        map.fitBounds(
          { north, south, east, west },
          { top: 48, right: 40, bottom: 48, left: 40 }
        );
      }
    }
  }, [map, mode, route.id, route.bounds, locationTarget, fitTrigger]);

  useEffect(() => {
    if (!map || !mapsLib || mode !== "gpx" || route.points.length < 2) return;

    const fullPath = route.points.map((p) => ({ lat: p.lat, lng: p.lng }));

    const casingLine = new mapsLib.Polyline({
      path: fullPath,
      strokeColor: "#0f172a",
      strokeOpacity: 0.72,
      strokeWeight: 7,
      geodesic: true,
      zIndex: 1,
      map,
    });

    const segmentLines: Array<InstanceType<typeof mapsLib.Polyline>> = [];

    const getPointColor = (pt: TrackPoint): string => {
      if (mapColorMode === "slope") {
        return colorForSlope(pt.slopePct ?? 0);
      }
      if (checkpoints.length === 0) return "#0ea5e9";

      let nearestCp = checkpoints[0];
      let bestKmDiff = Infinity;
      for (const cp of checkpoints) {
        const diff = Math.abs(pt.km - cp.km);
        if (diff < bestKmDiff) {
          bestKmDiff = diff;
          nearestCp = cp;
        }
      }
      if (mapColorMode === "temp") {
        return colorForTemp(nearestCp.tempC);
      }
      return WIND_COLORS[nearestCp.windImpact];
    };

    const segmentBuckets: Array<{
      points: TrackPoint[];
      color: string;
    }> = [];

    let currentColor = getPointColor(route.points[0]);
    let currentPts: TrackPoint[] = [];

    for (let i = 0; i < route.points.length; i++) {
      const pt = route.points[i];
      const nextColor = getPointColor(pt);
      if (nextColor !== currentColor && currentPts.length > 0) {
        currentPts.push(pt);
        segmentBuckets.push({ points: currentPts, color: currentColor });
        currentColor = nextColor;
        currentPts = [pt];
      } else {
        currentPts.push(pt);
      }
    }
    if (currentPts.length >= 2) {
      segmentBuckets.push({ points: currentPts, color: currentColor });
    }

    for (const seg of segmentBuckets) {
      if (seg.points.length < 2) continue;
      const poly = new mapsLib.Polyline({
        path: seg.points.map((p) => ({ lat: p.lat, lng: p.lng })),
        strokeColor: seg.color,
        strokeOpacity: 0.95,
        strokeWeight: 4.5,
        geodesic: true,
        zIndex: 2,
        map,
      });
      segmentLines.push(poly);
    }

    return () => {
      casingLine.setMap(null);
      for (const l of segmentLines) {
        l.setMap(null);
      }
    };
  }, [map, mapsLib, mode, route.points, checkpoints, mapColorMode]);

  return null;
};

const CheckpointMarker: React.FC<{
  checkpoint: WeatherCheckpoint;
  wattDelta: number;
  isSelected: boolean;
  onSelect: (index: number | null) => void;
}> = ({ checkpoint, wattDelta, isSelected, onSelect }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isStart = checkpoint.index === 0;
  const isFinish = checkpoint.label === "Meta";
  const accent = WIND_COLORS[checkpoint.windImpact];

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: checkpoint.lat, lng: checkpoint.lng }}
        onClick={() => onSelect(isSelected ? null : checkpoint.index)}
        zIndex={isSelected ? 50 : isStart || isFinish ? 30 : 15}
        title={`${checkpoint.label} · ${checkpoint.etaTimeLabel} · ${checkpoint.tempC}°C`}
      >
        <div
          className={`flex items-center gap-1.5 rounded-xl border px-2 py-1 text-[11px] font-bold shadow-md transition-transform cursor-pointer select-none ${
            isSelected
              ? "scale-110 bg-slate-900 text-white border-sky-400 ring-2 ring-sky-400/50"
              : "bg-white/95 text-slate-900 border-slate-300 hover:scale-105"
          }`}
        >
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: accent }}
          />
          <span>{checkpoint.conditionEmoji}</span>
          <span className="font-mono tabular-nums">{Math.round(checkpoint.tempC)}°</span>
          <span
            className={`text-[10px] font-semibold ${
              isSelected ? "text-sky-300" : "text-slate-500"
            }`}
          >
            {checkpoint.label}
          </span>
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow
          anchor={marker}
          maxWidth={285}
          onCloseClick={() => onSelect(null)}
        >
          <div className="p-1 text-slate-900 font-sans min-w-[225px]">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
              <div>
                <div className="text-xs font-black text-slate-900">
                  {checkpoint.label}{" "}
                  <span className="font-mono text-slate-500 font-semibold">
                    ({checkpoint.km} km)
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  ETA {checkpoint.etaTimeLabel}
                  {checkpoint.ele !== null ? ` · ${checkpoint.ele} m n.p.m.` : ""}
                  {checkpoint.slopePct !== 0 ? ` · ${checkpoint.slopePct > 0 ? "+" : ""}${checkpoint.slopePct}%` : ""}
                </div>
              </div>
              <div className="text-xl leading-none">{checkpoint.conditionEmoji}</div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block">Temperatura</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {checkpoint.tempC}°C{" "}
                  <span className="text-[10px] font-normal text-slate-500">
                    (odcz. {checkpoint.apparentTempC}°C)
                  </span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Wiatr</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {checkpoint.windCardinal} {checkpoint.windSpeedKmh} km/h
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Kierunek i Moc</span>
                <span
                  className="font-bold text-[11px]"
                  style={{ color: WIND_COLORS[checkpoint.windImpact] }}
                >
                  {checkpoint.windImpactLabel} ({wattDelta >= 0 ? `+${wattDelta}` : wattDelta} W)
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Opady / UV</span>
                <span className="font-mono font-semibold text-slate-800 tabular-nums">
                  {checkpoint.precipProbPct}% ({checkpoint.precipitationMm} mm) · UV {checkpoint.uvIndex}
                </span>
              </div>
            </div>
            <div className="mt-1.5 pt-1 border-t border-slate-100 text-[10px] text-slate-600">
              {checkpoint.conditionLabel} · Porywy {checkpoint.windGustsKmh} km/h · Wilg. {checkpoint.humidityPct}%
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const LocalityPinMarker: React.FC<{
  forecast: LocationForecastResponse;
}> = ({ forecast }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(true);
  const firstHour = forecast.hourly[0];

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: forecast.lat, lng: forecast.lng }}
        onClick={() => setOpen((o) => !o)}
        zIndex={40}
      >
        <div className="flex items-center gap-1.5 rounded-xl border border-sky-500 bg-slate-900 px-2.5 py-1 text-xs font-bold text-white shadow-lg cursor-pointer">
          <span>{firstHour?.conditionEmoji || "📍"}</span>
          <span>{forecast.locationName}</span>
          {firstHour && (
            <span className="font-mono text-sky-300 tabular-nums">
              {Math.round(firstHour.tempC)}°C
            </span>
          )}
        </div>
      </AdvancedMarker>
      {open && marker && firstHour && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={() => setOpen(false)}>
          <div className="p-1 text-slate-900 font-sans">
            <div className="text-xs font-black">{forecast.locationName}</div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              {firstHour.conditionEmoji} {firstHour.conditionLabel} · {firstHour.tempC}°C
            </div>
            <div className="text-[11px] font-mono text-slate-700 mt-1">
              Wiatr {firstHour.windCardinal} {firstHour.windSpeedKmh} km/h (porywy {firstHour.windGustsKmh})
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Wschód {forecast.daylight.sunrise} · Zachód {forecast.daylight.sunset}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const POI_META: Record<
  PoiCategory,
  { emoji: string; label: string; bg: string }
> = {
  water: { emoji: "💧", label: "Woda pitna", bg: "#0284c7" },
  shop: { emoji: "🛒", label: "Sklepy", bg: "#16a34a" },
  gas: { emoji: "⛽", label: "Stacje", bg: "#dc2626" },
  cafe: { emoji: "☕", label: "Kawiarnie", bg: "#9333ea" },
  repair: { emoji: "🔧", label: "Serwis", bg: "#ea580c" },
};

const CLIMB_CAT_COLORS: Record<RouteClimb["category"], string> = {
  HC: "#b91c1c",
  "1": "#dc2626",
  "2": "#ea580c",
  "3": "#d97706",
  "4": "#0284c7",
};

const SummitMarker: React.FC<{
  climb: RouteClimb;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
  targetWatts: number;
  riderWeightKg: number;
  onJumpTimeline: (km: number) => void;
}> = ({ climb, isSelected, onSelect, targetWatts, riderWeightKg, onJumpTimeline }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const catColor = CLIMB_CAT_COLORS[climb.category];
  const wKg = (targetWatts / Math.max(45, riderWeightKg)).toFixed(2);
  const estClimbMin = Math.max(
    1,
    Math.round((climb.lengthKm / Math.max(8, 22 - climb.avgSlopePct * 1.4)) * 60)
  );

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: climb.summitLat, lng: climb.summitLng }}
        onClick={() => onSelect(isSelected ? null : climb.id)}
        zIndex={isSelected ? 65 : 22}
      >
        <div
          className={`flex items-center gap-0.5 rounded-md border border-white px-1.5 py-0.5 text-[10px] font-black text-white shadow-md cursor-pointer transition-transform ${
            isSelected ? "scale-125 ring-2 ring-amber-400" : "hover:scale-110"
          }`}
          style={{ backgroundColor: catColor }}
          title={climb.name}
        >
          <span>⛰️</span>
          <span>{climb.category === "HC" ? "HC" : `K${climb.category}`}</span>
        </div>
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={250} onCloseClick={() => onSelect(null)}>
          <div className="p-1 text-slate-900 font-sans">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black">{climb.name}</span>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-black text-white"
                style={{ backgroundColor: catColor }}
              >
                Kat. {climb.category}
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] font-bold text-slate-700">
              {climb.lengthKm} km · +{climb.elevationGainM} m · śr. {climb.avgSlopePct}% (maks.{" "}
              {climb.maxSlopePct}%)
            </div>
            <div className="mt-0.5 text-[11px] text-slate-600">
              Szczyt na {climb.summitEleM} m n.p.m. · Odcinek {climb.startKm}–{climb.endKm} km
            </div>
            <div className="mt-1.5 rounded bg-slate-100 px-2 py-1 font-mono text-[10px] font-semibold text-slate-800">
              Pacing: {targetWatts} W ({wKg} W/kg) · ~{estClimbMin} min
            </div>
            <button
              type="button"
              onClick={() => onJumpTimeline(climb.startKm)}
              className="mt-1.5 w-full rounded bg-sky-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-sky-500"
            >
              Przejdź na symulacji trasy
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const PoiMarker: React.FC<{
  poi: RoutePoi;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
}> = ({ poi, isSelected, onSelect }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const meta = POI_META[poi.category];

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: poi.lat, lng: poi.lng }}
        onClick={() => onSelect(isSelected ? null : poi.id)}
        zIndex={isSelected ? 60 : 18}
      >
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full border border-white text-xs shadow-md cursor-pointer transition-transform ${
            isSelected ? "scale-125 ring-2 ring-sky-400" : "hover:scale-110"
          }`}
          style={{ backgroundColor: meta.bg }}
          title={`${meta.label}: ${poi.name}`}
        >
          {meta.emoji}
        </div>
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={240} onCloseClick={() => onSelect(null)}>
          <div className="p-1 text-slate-900 font-sans">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {meta.emoji} {meta.label}
            </div>
            <div className="text-xs font-black mt-0.5">{poi.name}</div>
            <div className="mt-1 font-mono text-[11px] text-slate-700">
              {poi.kmOnRoute.toFixed(1)} km trasy · {poi.distFromRouteM} m od śladu
            </div>
            {poi.openingHours && (
              <div className="mt-0.5 text-[10px] text-slate-500">
                Godziny: {poi.openingHours}
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const RiderCursorMarker: React.FC<{
  cursor: RideCursorState;
}> = ({ cursor }) => {
  return (
    <AdvancedMarker position={{ lat: cursor.lat, lng: cursor.lng }} zIndex={80}>
      <div className="flex flex-col items-center">
        <div className="rounded-md bg-slate-900/95 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-md border border-sky-400 whitespace-nowrap mb-0.5">
          {cursor.km} km · {cursor.etaTimeLabel}
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-sky-600 text-sm shadow-lg ring-2 ring-sky-400/70">
          🚴
        </div>
      </div>
    </AdvancedMarker>
  );
};

const MapCanvasWrapper: React.FC<{
  mode: WeatherMode;
  route: GpxRoute;
  checkpoints: WeatherCheckpoint[];
  wattDeltas: number[];
  mapColorMode: MapColorMode;
  locationForecast: LocationForecastResponse | null;
  selectedCheckpointIdx: number | null;
  onSelectCheckpoint: (idx: number | null) => void;
  climbs: RouteClimb[];
  selectedClimbId: string | null;
  onSelectClimb: (id: string | null) => void;
  pois: RoutePoi[];
  selectedPoiId: string | null;
  onSelectPoi: (id: string | null) => void;
  riderCursor: RideCursorState | null;
  targetWatts: number;
  riderWeightKg: number;
  onJumpTimelineKm: (km: number) => void;
  darkMode: boolean;
  fitTrigger: number;
}> = ({
  mode,
  route,
  checkpoints,
  wattDeltas,
  mapColorMode,
  locationForecast,
  selectedCheckpointIdx,
  onSelectCheckpoint,
  climbs,
  selectedClimbId,
  onSelectClimb,
  pois,
  selectedPoiId,
  onSelectPoi,
  riderCursor,
  targetWatts,
  riderWeightKg,
  onJumpTimelineKm,
  darkMode,
  fitTrigger,
}) => {
  const status = useApiLoadingStatus();
  const initialCenter = useMemo(() => {
    if (mode === "location" && locationForecast) {
      return { lat: locationForecast.lat, lng: locationForecast.lng };
    }
    if (route.points.length > 0) {
      const mid = route.points[Math.floor(route.points.length / 2)];
      return { lat: mid.lat, lng: mid.lng };
    }
    return { lat: 51.4, lng: 16.2 };
  }, [mode, locationForecast, route]);

  const locationTarget = useMemo(
    () =>
      locationForecast
        ? { lat: locationForecast.lat, lng: locationForecast.lng }
        : null,
    [locationForecast]
  );

  if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
    return (
      <div className="flex h-[430px] sm:h-[520px] w-full flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/70 p-6 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
        <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400 mb-2" />
        <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
          Nie udało się załadować warstwy Google Maps
        </p>
        <p className="mt-1 max-w-md text-xs text-slate-600 dark:text-slate-300">
          Sprawdź konfigurację klucza API Google Maps Platform lub limit dzienny projektu. Prognoza poniżej działa niezależnie.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[430px] sm:h-[520px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
      <GoogleMap
        defaultCenter={initialCenter}
        defaultZoom={10}
        mapId="DEMO_MAP_ID"
        colorScheme={darkMode ? ColorScheme.DARK : ColorScheme.LIGHT}
        gestureHandling="greedy"
        streetViewControl={false}
        fullscreenControl={true}
        mapTypeControl={true}
        internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
        style={{ width: "100%", height: "100%" }}
      >
        <RouteMapLayers
          mode={mode}
          route={route}
          checkpoints={checkpoints}
          mapColorMode={mapColorMode}
          locationTarget={locationTarget}
          fitTrigger={fitTrigger}
        />

        {mode === "gpx" &&
          checkpoints.map((cp, idx) => (
            <CheckpointMarker
              key={`${route.id}_cp_${cp.index}`}
              checkpoint={cp}
              wattDelta={wattDeltas[idx] ?? 0}
              isSelected={selectedCheckpointIdx === cp.index}
              onSelect={onSelectCheckpoint}
            />
          ))}

        {mode === "gpx" &&
          climbs.map((climb) => (
            <SummitMarker
              key={climb.id}
              climb={climb}
              isSelected={selectedClimbId === climb.id}
              onSelect={onSelectClimb}
              targetWatts={targetWatts}
              riderWeightKg={riderWeightKg}
              onJumpTimeline={onJumpTimelineKm}
            />
          ))}

        {mode === "gpx" &&
          pois.map((poi) => (
            <PoiMarker
              key={poi.id}
              poi={poi}
              isSelected={selectedPoiId === poi.id}
              onSelect={onSelectPoi}
            />
          ))}

        {mode === "gpx" && riderCursor && <RiderCursorMarker cursor={riderCursor} />}

        {mode === "location" && locationForecast && (
          <LocalityPinMarker forecast={locationForecast} />
        )}
      </GoogleMap>
    </div>
  );
};

export const WeatherView: React.FC<WeatherViewProps> = ({
  darkMode,
  athleteWeightKg = 74,
  athleteFtp = 220,
  pendingRouteId,
  onClearPendingRoute,
}) => {
  // Subfolders & GPX Library
  const [folders, setFolders] = useState<RouteFolder[]>(() => loadSavedFolders());
  const [activeFolderSlug, setActiveFolderSlug] = useState<string>("all");
  const [savedRoutes, setSavedRoutes] = useState<GpxRoute[]>(() => loadSavedRoutes());
  const [activeRoute, setActiveRoute] = useState<GpxRoute>(() => {
    const list = loadSavedRoutes();
    return list[0];
  });
  const [routeNameDraft, setRouteNameDraft] = useState<string>(() => {
    const list = loadSavedRoutes();
    return list[0]?.name || "";
  });
  const [saveFolderDraft, setSaveFolderDraft] = useState<string>(
    () => activeRoute?.folder || "szosa"
  );
  const [surfaceDraft, setSurfaceDraft] = useState<SurfaceType>(
    () => activeRoute?.surface || "asfalt"
  );
  const [notesDraft, setNotesDraft] = useState<string>(
    () => activeRoute?.notes || ""
  );

  // Folder search, sort, rename & bundle states
  const [folderSearchQuery, setFolderSearchQuery] = useState("");
  const [folderSortMode, setFolderSortMode] = useState<RouteSortMode>("newest");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderSlug, setRenamingFolderSlug] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");

  // Mode: GPX route vs Locality search
  const [weatherMode, setWeatherMode] = useState<WeatherMode>("gpx");
  const [mapColorMode, setMapColorMode] = useState<MapColorMode>("wind");

  // Locality search state
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoSearchResult[]>([]);
  const [geoSearching, setGeoSearching] = useState(false);
  const [locationForecast, setLocationForecast] =
    useState<LocationForecastResponse | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // Ride planning params
  const [rideDate, setRideDate] = useState<string>(() => formatLocalToday());
  const [departureTime, setDepartureTime] = useState<string>("09:00");
  const [bikeType, setBikeType] = useState<BikeType>(
    () => activeRoute?.bikeType || "road"
  );
  const [speedKmh, setSpeedKmh] = useState<number>(
    () =>
      activeRoute?.avgSpeedKmh ||
      BIKE_PRESETS[activeRoute?.bikeType || "road"].defaultSpeedKmh
  );
  const [pacingMode, setPacingMode] = useState<"speed" | "power">("speed");
  const [targetWatts, setTargetWatts] = useState<number>(() =>
    Math.max(120, Math.round(athleteFtp * 0.78))
  );

  // Google Maps Key
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || ""
  );
  const [mapsKeyChecked, setMapsKeyChecked] = useState<boolean>(
    () => Boolean((import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim())
  );

  // GPX Route Weather Data + 10-day forecast
  const [weatherCheckpoints, setWeatherCheckpoints] = useState<WeatherCheckpoint[]>([]);
  const [daylight, setDaylight] = useState<DaylightInfo | null>(null);
  const [departureCompare, setDepartureCompare] = useState<DepartureCompareOption[]>([]);
  const [routeDailyForecast, setRouteDailyForecast] = useState<DailyForecastItem[]>([]);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [selectedCheckpointIdx, setSelectedCheckpointIdx] = useState<number | null>(null);
  const [fitTrigger, setFitTrigger] = useState<number>(0);

  // ClimbFinder, POIs & Ride Timeline Simulation states
  const [selectedClimbId, setSelectedClimbId] = useState<string | null>(null);
  const [routePois, setRoutePois] = useState<RoutePoi[]>([]);
  const [showPois, setShowPois] = useState<boolean>(false);
  const [poiLoading, setPoiLoading] = useState<boolean>(false);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [activePoiCategories, setActivePoiCategories] = useState<Record<PoiCategory, boolean>>({
    water: true,
    shop: true,
    gas: true,
    cafe: true,
    repair: true,
  });
  const [rideProgressPct, setRideProgressPct] = useState<number>(0);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(false);

  // Strava Routes Import Modal State
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [stravaRoutesList, setStravaRoutesList] = useState<
    Array<{
      id: string;
      name: string;
      description: string | null;
      distanceKm: number;
      elevationGainM: number;
      surface: "asfalt" | "szuter" | "mtb" | "mix";
      hasPolyline: boolean;
    }>
  >([]);
  const [loadingStravaRoutes, setLoadingStravaRoutes] = useState(false);
  const [stravaModalError, setStravaModalError] = useState<string | null>(null);
  const [stravaManualToken, setStravaManualToken] = useState("");
  const [importingStravaRouteId, setImportingStravaRouteId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bundleInputRef = useRef<HTMLInputElement | null>(null);

  const reloadServerLibrary = useCallback(async () => {
    try {
      const r = await fetch("/api/gpx/library");
      const data = (await r.json()) as {
        folders?: RouteFolder[];
        routes?: GpxRoute[];
      };
      if (Array.isArray(data.folders) && data.folders.length > 0) {
        setFolders(data.folders);
        saveFoldersToStorage(data.folders);
      }
      if (Array.isArray(data.routes) && data.routes.length > 0) {
        const localList = loadSavedRoutes().filter((x) => !x.isBuiltinSample);
        const mergedIds: Record<string, boolean> = {};
        const combined: GpxRoute[] = [];
        for (const sr of data.routes) {
          mergedIds[sr.id] = true;
          combined.push({ ...sr, folder: sr.folder || "szosa" });
        }
        for (const lr of localList) {
          if (!mergedIds[lr.id]) combined.push(lr);
        }
        setSavedRoutes(combined);
        saveRoutesToStorage(combined);
        return combined;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const fetchStravaRoutes = async (tokenOverride?: string) => {
    setLoadingStravaRoutes(true);
    setStravaModalError(null);
    try {
      let token = tokenOverride?.trim();
      if (!token) {
        try {
          const raw =
            localStorage.getItem("darierpro_strava_session") ||
            sessionStorage.getItem("darierpro_strava_session");
          if (raw) {
            const parsed = JSON.parse(raw) as { accessToken?: string };
            if (parsed.accessToken) token = parsed.accessToken;
          }
        } catch {
          // ignore
        }
      }

      if (!token) {
        setStravaModalError(
          "Nie wykryto aktywnej sesji Strava. Wklej poniżej swój Access Token ze Strava."
        );
        setLoadingStravaRoutes(false);
        return;
      }

      const res = await fetch(
        `/api/strava/routes?accessToken=${encodeURIComponent(token)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się pobrać tras ze Strava.");
      }
      setStravaRoutesList(data.routes || []);
    } catch (err) {
      setStravaModalError(
        err instanceof Error
          ? err.message
          : "Błąd pobierania tras ze Strava."
      );
    } finally {
      setLoadingStravaRoutes(false);
    }
  };

  const handleOpenStravaRoutesModal = () => {
    setShowStravaModal(true);
    void fetchStravaRoutes();
  };

  const handleImportStravaRoute = async (routeId: string) => {
    setImportingStravaRouteId(routeId);
    setStravaModalError(null);
    try {
      let token = stravaManualToken.trim();
      if (!token) {
        try {
          const raw =
            localStorage.getItem("darierpro_strava_session") ||
            sessionStorage.getItem("darierpro_strava_session");
          if (raw) {
            const parsed = JSON.parse(raw) as { accessToken?: string };
            if (parsed.accessToken) token = parsed.accessToken;
          }
        } catch {
          // ignore
        }
      }

      if (!token) {
        throw new Error(
          "Wprowadź token dostępu Strava, aby pobrać trasę."
        );
      }

      const res = await fetch("/api/strava/routes/import-to-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId,
          accessToken: token,
          folderSlug: "strava",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.route) {
        throw new Error(data.error || "Nie udało się zaimportować trasy.");
      }

      const importedRoute = data.route as GpxRoute;
      upsertSavedRoute(importedRoute);
      setSavedRoutes((prev) => {
        const filtered = prev.filter((r) => r.id !== importedRoute.id);
        return [importedRoute, ...filtered];
      });
      setActiveRoute(importedRoute);
      setRouteNameDraft(importedRoute.name);
      setSaveFolderDraft(importedRoute.folder || "strava");
      setActiveFolderSlug("strava");
      setShowStravaModal(false);
      setFitTrigger((n) => n + 1);
      await reloadServerLibrary();
    } catch (err) {
      setStravaModalError(
        err instanceof Error
          ? err.message
          : "Błąd importu trasy ze Strava."
      );
    } finally {
      setImportingStravaRouteId(null);
    }
  };

  // Load persisted subfolder library from ./saved_routes/ on mount
  useEffect(() => {
    void reloadServerLibrary();
  }, [reloadServerLibrary]);

  // If jumped here from ActivityDetailModal with pendingRouteId
  useEffect(() => {
    if (!pendingRouteId) return;
    const localMatch = loadSavedRoutes().find((r) => r.id === pendingRouteId);
    if (localMatch) {
      setSavedRoutes(loadSavedRoutes());
      setActiveRoute(localMatch);
      setRouteNameDraft(localMatch.name);
      setSaveFolderDraft(localMatch.folder || "szosa");
      setSurfaceDraft(localMatch.surface || "asfalt");
      setNotesDraft(localMatch.notes || "");
      if (localMatch.bikeType) setBikeType(localMatch.bikeType);
      if (localMatch.avgSpeedKmh) setSpeedKmh(localMatch.avgSpeedKmh);
      setActiveFolderSlug(localMatch.folder || "all");
      setWeatherMode("gpx");
      setFitTrigger((n) => n + 1);
      onClearPendingRoute?.();
    } else {
      void reloadServerLibrary().then((list) => {
        const found = list?.find((r) => r.id === pendingRouteId);
        if (found) {
          setActiveRoute(found);
          setRouteNameDraft(found.name);
          setSaveFolderDraft(found.folder || "szosa");
          setSurfaceDraft(found.surface || "asfalt");
          setNotesDraft(found.notes || "");
          setActiveFolderSlug(found.folder || "all");
          setWeatherMode("gpx");
          setFitTrigger((n) => n + 1);
        }
        onClearPendingRoute?.();
      });
    }
  }, [pendingRouteId, onClearPendingRoute, reloadServerLibrary]);

  // Fallback check to /api/maps/config
  useEffect(() => {
    if (mapsApiKey) return;
    let cancelled = false;
    fetch("/api/maps/config")
      .then((r) => r.json())
      .then((data: { apiKey?: string }) => {
        if (!cancelled && data.apiKey) {
          setMapsApiKey(data.apiKey);
        }
      })
      .catch(() => {
        // ignore
      })
      .finally(() => {
        if (!cancelled) setMapsKeyChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mapsApiKey]);

  const minDate = useMemo(() => addDaysIso(formatLocalToday(), -5), []);
  const maxDate = useMemo(() => addDaysIso(formatLocalToday(), 14), []);

  // Sync Home Coordinates for Training Plan Calendar weather integration
  useEffect(() => {
    try {
      if (weatherMode === "location" && locationForecast) {
        localStorage.setItem(
          WEATHER_HOME_STORAGE_KEY,
          JSON.stringify({
            lat: locationForecast.lat,
            lng: locationForecast.lng,
            name: locationForecast.locationName,
          })
        );
      } else if (activeRoute.points.length > 0) {
        const p0 = activeRoute.points[0];
        localStorage.setItem(
          WEATHER_HOME_STORAGE_KEY,
          JSON.stringify({
            lat: p0.lat,
            lng: p0.lng,
            name: activeRoute.name.split("·")[1]?.trim() || "Trasa GPX",
          })
        );
      }
    } catch {
      // ignore storage errors
    }
  }, [weatherMode, locationForecast, activeRoute.id, activeRoute.name, activeRoute.points]);

  // Reset route-specific POI & timeline states when switching GPX route
  useEffect(() => {
    setRoutePois([]);
    setShowPois(false);
    setPoiError(null);
    setSelectedPoiId(null);
    setSelectedClimbId(null);
    setIsPlayingTimeline(false);
    setRideProgressPct(0);
  }, [activeRoute.id]);

  // Timeline animation interval
  useEffect(() => {
    if (!isPlayingTimeline) return;
    const timer = window.setInterval(() => {
      setRideProgressPct((prev) => {
        if (prev >= 100) {
          setIsPlayingTimeline(false);
          return 100;
        }
        const next = prev + 1.25;
        if (next >= 100) {
          setIsPlayingTimeline(false);
          return 100;
        }
        return Number(next.toFixed(2));
      });
    }, 140);
    return () => window.clearInterval(timer);
  }, [isPlayingTimeline]);

  const routeClimbs = useMemo(() => detectClimbs(activeRoute), [activeRoute]);

  const powerSimResult = useMemo(
    () =>
      simulateRideFromPower(
        activeRoute,
        rideDate,
        departureTime,
        targetWatts,
        bikeType,
        athleteWeightKg,
        weatherCheckpoints
      ),
    [
      activeRoute,
      rideDate,
      departureTime,
      targetWatts,
      bikeType,
      athleteWeightKg,
      weatherCheckpoints,
    ]
  );

  const effectiveSpeedKmh =
    pacingMode === "power" ? powerSimResult.realisticSpeedKmh : speedKmh;

  const plannedCheckpoints = useMemo(
    () =>
      pacingMode === "power"
        ? powerSimResult.checkpoints
        : sampleCheckpoints(activeRoute, rideDate, departureTime, speedKmh),
    [pacingMode, powerSimResult.checkpoints, activeRoute, rideDate, departureTime, speedKmh]
  );

  const fetchRouteWeather = useCallback(async () => {
    if (plannedCheckpoints.length === 0) return;
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await fetch("/api/weather/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waypoints: plannedCheckpoints,
          speedKmh: effectiveSpeedKmh,
          dateStr: rideDate,
        }),
      });
      const data = (await res.json()) as {
        checkpoints?: WeatherCheckpoint[];
        daylight?: DaylightInfo;
        departureCompare?: DepartureCompareOption[];
        dailyForecast?: DailyForecastItem[];
        error?: string;
        quotaExceeded?: boolean;
      };
      if (res.status === 429 || data.quotaExceeded) {
        window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
      }
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się pobrać prognozy pogody.");
      }
      setWeatherCheckpoints(data.checkpoints || []);
      setDaylight(data.daylight || null);
      setDepartureCompare(data.departureCompare || []);
      if (Array.isArray(data.dailyForecast)) {
        setRouteDailyForecast(data.dailyForecast);
      }
    } catch (err) {
      setWeatherError(
        err instanceof Error ? err.message : "Błąd pobierania prognozy pogody."
      );
    } finally {
      setWeatherLoading(false);
    }
  }, [plannedCheckpoints, effectiveSpeedKmh, rideDate]);

  useEffect(() => {
    if (weatherMode !== "gpx") return;
    const timer = window.setTimeout(() => {
      void fetchRouteWeather();
    }, 260);
    return () => window.clearTimeout(timer);
  }, [fetchRouteWeather, weatherMode]);

  const handleGeocodeSearch = async (queryText: string) => {
    const q = queryText.trim();
    setGeoQuery(queryText);
    if (q.length < 2) {
      setGeoResults([]);
      return;
    }
    setGeoSearching(true);
    try {
      const res = await fetch(`/api/weather/geocode?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: GeoSearchResult[] };
      setGeoResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setGeoResults([]);
    } finally {
      setGeoSearching(false);
    }
  };

  const handleSelectLocality = async (item: GeoSearchResult) => {
    setGeoResults([]);
    setGeoQuery(item.name);
    setLocationLoading(true);
    setWeatherError(null);
    setWeatherMode("location");
    try {
      const displayName = [item.name, item.admin1, item.country]
        .filter(Boolean)
        .slice(0, 2)
        .join(", ");
      const res = await fetch("/api/weather/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: item.latitude,
          lng: item.longitude,
          name: displayName,
          date: rideDate,
        }),
      });
      const data = (await res.json()) as LocationForecastResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się pobrać prognozy dla miejscowości.");
      }
      setLocationForecast(data);
      setFitTrigger((n) => n + 1);
    } catch (err) {
      setWeatherError(
        err instanceof Error ? err.message : "Błąd prognozy miejscowości."
      );
    } finally {
      setLocationLoading(false);
    }
  };

  useEffect(() => {
    if (weatherMode !== "location" || !locationForecast) return;
    let cancelled = false;
    setLocationLoading(true);
    fetch("/api/weather/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: locationForecast.lat,
        lng: locationForecast.lng,
        name: locationForecast.locationName,
        date: rideDate,
      }),
    })
      .then((r) => r.json())
      .then((data: LocationForecastResponse & { error?: string }) => {
        if (!cancelled && data.hourly) {
          setLocationForecast(data);
        }
      })
      .catch(() => {
        // ignore
      })
      .finally(() => {
        if (!cancelled) setLocationLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideDate, weatherMode]);

  const handleSelectBikeType = (nextType: BikeType) => {
    setBikeType(nextType);
    setSpeedKmh(BIKE_PRESETS[nextType].defaultSpeedKmh);
  };

  const handleUploadGpx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGpxError(null);
    try {
      const text = await file.text();
      const targetFolder =
        activeFolderSlug !== "all" ? activeFolderSlug : saveFolderDraft || "moje-trasy";
      const parsed = parseGpxXml(text, file.name, targetFolder);
      const withPrefs: GpxRoute = {
        ...parsed,
        bikeType,
        avgSpeedKmh: speedKmh,
        surface: surfaceDraft,
        notes: "",
        favorite: false,
      };
      setActiveRoute(withPrefs);
      setRouteNameDraft(withPrefs.name);
      setSaveFolderDraft(targetFolder);
      setNotesDraft("");
      setSelectedCheckpointIdx(null);
      setWeatherMode("gpx");
      setFitTrigger((n) => n + 1);
    } catch (err) {
      setGpxError(
        err instanceof Error ? err.message : "Nie udało się wczytać pliku .gpx."
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReverseRoute = () => {
    const reversed = reverseGpxRoute(activeRoute);
    setActiveRoute(reversed);
    setRouteNameDraft(reversed.name);
    setSelectedCheckpointIdx(null);
    setWeatherMode("gpx");
    setFitTrigger((n) => n + 1);
  };

  const filteredPois = useMemo(() => {
    if (!showPois) return [];
    return routePois.filter((p) => activePoiCategories[p.category]);
  }, [showPois, routePois, activePoiCategories]);

  const handleTogglePois = async () => {
    if (showPois && routePois.length > 0) {
      setShowPois(false);
      return;
    }
    if (routePois.length > 0) {
      setShowPois(true);
      return;
    }
    setPoiLoading(true);
    setPoiError(null);
    try {
      const res = await fetch("/api/gpx/pois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: activeRoute.points.map((p) => ({
            lat: p.lat,
            lng: p.lng,
            km: p.km,
          })),
        }),
      });
      const data = (await res.json()) as { pois?: RoutePoi[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się wyszukać POI wzdłuż trasy.");
      }
      setRoutePois(data.pois || []);
      setShowPois(true);
    } catch (err) {
      setPoiError(
        err instanceof Error ? err.message : "Błąd pobierania punktów POI."
      );
    } finally {
      setPoiLoading(false);
    }
  };

  const handleJumpTimelineKm = useCallback(
    (km: number) => {
      const pct = Math.max(
        0,
        Math.min(100, (km / Math.max(0.1, activeRoute.totalDistanceKm)) * 100)
      );
      setIsPlayingTimeline(false);
      setRideProgressPct(Number(pct.toFixed(1)));
    },
    [activeRoute.totalDistanceKm]
  );

  const handleDownloadRouteGpx = (route: GpxRoute) => {
    const waypointsToEmbed =
      route.id === activeRoute.id && filteredPois.length > 0 ? filteredPois : undefined;
    const xml = buildGpxXmlFromRoute(route, waypointsToEmbed);
    const blob = new Blob([xml], { type: "application/gpx+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const baseName = (route.fileName || `${route.name}.gpx`).replace(/\.gpx$/i, "");
    a.href = url;
    a.download = route.isReversed
      ? `${baseName}_odwrocona.gpx`
      : waypointsToEmbed
        ? `${baseName}_z_POI.gpx`
        : `${baseName}.gpx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSaveCurrentRoute = async () => {
    const folderSlug = saveFolderDraft || "moje-trasy";
    const routeToSave: GpxRoute = {
      ...activeRoute,
      name: routeNameDraft.trim() || activeRoute.name,
      folder: folderSlug,
      bikeType,
      avgSpeedKmh: speedKmh,
      surface: surfaceDraft,
      notes: notesDraft.trim(),
    };

    const updatedList = upsertSavedRoute(routeToSave);
    setSavedRoutes(updatedList);
    const savedObj =
      updatedList.find((r) => r.id === routeToSave.id) || updatedList[0];
    setActiveRoute(savedObj);

    try {
      const res = await fetch("/api/gpx/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route: routeToSave,
          rawXml: buildGpxXmlFromRoute(routeToSave),
        }),
      });
      if (res.ok) {
        const folderName =
          folders.find((f) => f.slug === folderSlug)?.name || folderSlug;
        setSaveFeedback(`Zapisano w: ${folderName}`);
      } else {
        setSaveFeedback("Zapisano lokalnie");
      }
    } catch {
      setSaveFeedback("Zapisano lokalnie");
    }
    window.setTimeout(() => setSaveFeedback(null), 2800);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, route: GpxRoute) => {
    e.stopPropagation();
    const updatedRoute: GpxRoute = { ...route, favorite: !route.favorite };
    const nextList = savedRoutes.map((r) => (r.id === route.id ? updatedRoute : r));
    setSavedRoutes(nextList);
    saveRoutesToStorage(nextList);
    if (activeRoute.id === route.id) {
      setActiveRoute(updatedRoute);
    }
    try {
      await fetch("/api/gpx/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route: updatedRoute }),
      });
    } catch {
      // ignore
    }
  };

  const handleMoveActiveRoute = async (targetFolderSlug: string) => {
    const oldFolder = activeRoute.folder || "szosa";
    setSaveFolderDraft(targetFolderSlug);
    if (oldFolder === targetFolderSlug) return;

    const movedRoute: GpxRoute = { ...activeRoute, folder: targetFolderSlug };
    setActiveRoute(movedRoute);
    const nextList = savedRoutes.map((r) =>
      r.id === activeRoute.id ? movedRoute : r
    );
    setSavedRoutes(nextList);
    saveRoutesToStorage(nextList);

    try {
      await fetch("/api/gpx/routes/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId: activeRoute.id,
          fromFolder: oldFolder,
          toFolder: targetFolderSlug,
        }),
      });
      const folderLabel =
        folders.find((f) => f.slug === targetFolderSlug)?.name || targetFolderSlug;
      setSaveFeedback(`Przeniesiono do: ${folderLabel}`);
      window.setTimeout(() => setSaveFeedback(null), 2400);
    } catch {
      // ignore
    }
  };

  const handleCreateFolder = async () => {
    const clean = newFolderName.trim();
    if (!clean) return;
    try {
      const res = await fetch("/api/gpx/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      const data = (await res.json()) as { folder?: RouteFolder };
      if (res.ok && data.folder) {
        const nextFolders = folders.some((f) => f.slug === data.folder!.slug)
          ? folders
          : [...folders, data.folder];
        setFolders(nextFolders);
        saveFoldersToStorage(nextFolders);
        setActiveFolderSlug(data.folder.slug);
        setSaveFolderDraft(data.folder.slug);
        setNewFolderName("");
        setShowNewFolderInput(false);
      }
    } catch {
      // ignore
    }
  };

  const handleRenameFolder = async (slug: string) => {
    const clean = renameFolderValue.trim();
    if (!clean) {
      setRenamingFolderSlug(null);
      return;
    }
    try {
      const res = await fetch(`/api/gpx/folders/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      const data = (await res.json()) as { folder?: RouteFolder };
      if (res.ok && data.folder) {
        const nextFolders = folders.map((f) =>
          f.slug === slug ? { ...f, name: data.folder!.name } : f
        );
        setFolders(nextFolders);
        saveFoldersToStorage(nextFolders);
      }
    } catch {
      // ignore
    } finally {
      setRenamingFolderSlug(null);
    }
  };

  const handleDeleteFolder = async (e: React.MouseEvent, slug: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/gpx/folders/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const nextFolders = folders.filter((f) => f.slug !== slug);
        setFolders(nextFolders.length > 0 ? nextFolders : DEFAULT_ROUTE_FOLDERS);
        saveFoldersToStorage(nextFolders);
        const remaining = savedRoutes.filter((r) => r.folder !== slug);
        const finalRoutes = remaining.length > 0 ? remaining : createSampleRoutes();
        setSavedRoutes(finalRoutes);
        saveRoutesToStorage(finalRoutes);
        if (activeFolderSlug === slug) setActiveFolderSlug("all");
        if (saveFolderDraft === slug) setSaveFolderDraft("moje-trasy");
      }
    } catch {
      // ignore
    }
  };

  const handleExportFolderBundle = () => {
    const routesToExport =
      activeFolderSlug === "all"
        ? savedRoutes
        : savedRoutes.filter((r) => (r.folder || "szosa") === activeFolderSlug);
    const bundle = {
      exportedAt: new Date().toISOString(),
      folderSlug: activeFolderSlug,
      routes: routesToExport.map((r) => {
        const copy = { ...r };
        delete copy.rawXml;
        return copy;
      }),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `darierpro_trasy_${activeFolderSlug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFolderBundle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGpxError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { routes?: GpxRoute[] } | GpxRoute[];
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.routes)
          ? parsed.routes
          : [];
      if (list.length === 0) {
        throw new Error("Wybrany plik nie zawiera tras do zaimportowania.");
      }

      const targetFolder =
        activeFolderSlug !== "all" ? activeFolderSlug : saveFolderDraft || "moje-trasy";
      let updated = savedRoutes;
      for (const r of list) {
        if (!r.id || !Array.isArray(r.points) || r.points.length < 2) continue;
        const normalized: GpxRoute = {
          ...r,
          folder: targetFolder,
          savedAt: new Date().toISOString(),
        };
        updated = upsertSavedRoute(normalized);
        await fetch("/api/gpx/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            route: normalized,
            rawXml: buildGpxXmlFromRoute(normalized),
          }),
        }).catch(() => {});
      }
      setSavedRoutes(updated);
      setSaveFeedback(`Zaimportowano ${list.length} tras`);
      window.setTimeout(() => setSaveFeedback(null), 2600);
    } catch (err) {
      setGpxError(
        err instanceof Error ? err.message : "Nie udało się zaimportować paczki tras."
      );
    } finally {
      if (bundleInputRef.current) bundleInputRef.current.value = "";
    }
  };

  const handleSelectSavedRoute = (route: GpxRoute) => {
    setActiveRoute(route);
    setRouteNameDraft(route.name);
    setSaveFolderDraft(route.folder || "szosa");
    setSurfaceDraft(route.surface || "asfalt");
    setNotesDraft(route.notes || "");
    if (route.bikeType) setBikeType(route.bikeType);
    if (route.avgSpeedKmh) setSpeedKmh(route.avgSpeedKmh);
    setSelectedCheckpointIdx(null);
    setGpxError(null);
    setWeatherMode("gpx");
    setFitTrigger((n) => n + 1);
  };

  const handleDeleteSavedRoute = async (e: React.MouseEvent, route: GpxRoute) => {
    e.stopPropagation();
    const updated = deleteSavedRoute(route.id);
    setSavedRoutes(updated);
    if (activeRoute.id === route.id && updated.length > 0) {
      handleSelectSavedRoute(updated[0]);
    }
    try {
      await fetch(
        `/api/gpx/routes/${encodeURIComponent(route.folder || "moje-trasy")}/${encodeURIComponent(route.id)}`,
        { method: "DELETE" }
      );
    } catch {
      // ignore
    }
  };

  const filteredSavedRoutes = useMemo(() => {
    const q = folderSearchQuery.trim().toLowerCase();
    const byFolder =
      activeFolderSlug === "all"
        ? savedRoutes
        : savedRoutes.filter((r) => (r.folder || "szosa") === activeFolderSlug);

    const bySearch = q
      ? byFolder.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.notes || "").toLowerCase().includes(q) ||
            (r.surface || "").toLowerCase().includes(q)
        )
      : byFolder;

    return [...bySearch].sort((a, b) => {
      if (folderSortMode === "favorites") {
        if (Boolean(b.favorite) !== Boolean(a.favorite)) {
          return b.favorite ? 1 : -1;
        }
      } else if (folderSortMode === "distance") {
        return b.totalDistanceKm - a.totalDistanceKm;
      } else if (folderSortMode === "elevation") {
        return b.elevationGainM - a.elevationGainM;
      } else if (folderSortMode === "name") {
        return a.name.localeCompare(b.name, "pl");
      }
      return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
    });
  }, [savedRoutes, activeFolderSlug, folderSearchQuery, folderSortMode]);

  // Wind Watt Impact per checkpoint
  const checkpointWattImpacts = useMemo(() => {
    return weatherCheckpoints.map((cp) =>
      estimateWindWattImpact(
        effectiveSpeedKmh,
        cp.headwindComponentKmh,
        cp.slopePct ?? 0,
        bikeType,
        athleteWeightKg
      )
    );
  }, [weatherCheckpoints, effectiveSpeedKmh, bikeType, athleteWeightKg]);

  const summaryStats = useMemo(() => {
    const nominalMins =
      pacingMode === "power"
        ? powerSimResult.totalMinutes
        : Math.round((activeRoute.totalDistanceKm / Math.max(8, speedKmh)) * 60);
    const lastPlanned = plannedCheckpoints[plannedCheckpoints.length - 1];
    const finishEta = lastPlanned?.etaTimeLabel || departureTime;
    const finishIso = lastPlanned?.etaIso || `${rideDate}T${departureTime}`;

    if (weatherCheckpoints.length === 0) {
      return {
        nominalMins,
        realisticMins: nominalMins,
        realisticSpeedKmh: effectiveSpeedKmh,
        avgWindWattDelta: 0,
        finishEta,
        finishIso,
        minTemp: null,
        maxTemp: null,
        avgTemp: 15,
        avgHumidity: 60,
        avgWind: null,
        maxGust: null,
        maxRainProb: null,
        totalRainMm: 0,
        headwindPct: 0,
        tailwindPct: 0,
        crosswindPct: 0,
      };
    }

    const temps = weatherCheckpoints.map((c) => c.tempC);
    const winds = weatherCheckpoints.map((c) => c.windSpeedKmh);
    const gusts = weatherCheckpoints.map((c) => c.windGustsKmh);
    const probs = weatherCheckpoints.map((c) => c.precipProbPct);
    const rains = weatherCheckpoints.map((c) => c.precipitationMm);
    const hums = weatherCheckpoints.map((c) => c.humidityPct);

    const headCount = weatherCheckpoints.filter((c) => c.windImpact === "headwind").length;
    const tailCount = weatherCheckpoints.filter((c) => c.windImpact === "tailwind").length;
    const crossCount = weatherCheckpoints.filter((c) => c.windImpact === "crosswind").length;
    const n = weatherCheckpoints.length;

    const avgWindWattDelta =
      checkpointWattImpacts.length > 0
        ? Math.round(
            checkpointWattImpacts.reduce((s, w) => s + w.windDeltaWatts, 0) /
              checkpointWattImpacts.length
          )
        : 0;

    const realisticSpeedKmh =
      pacingMode === "power"
        ? powerSimResult.realisticSpeedKmh
        : checkpointWattImpacts.length > 0
          ? Number(
              (
                checkpointWattImpacts.length /
                checkpointWattImpacts.reduce(
                  (s, w) => s + 1 / Math.max(8, w.realisticSpeedKmh),
                  0
                )
              ).toFixed(1)
            )
          : speedKmh;

    const realisticMins =
      pacingMode === "power"
        ? powerSimResult.totalMinutes
        : Math.round((activeRoute.totalDistanceKm / Math.max(8, realisticSpeedKmh)) * 60);

    return {
      nominalMins,
      realisticMins,
      realisticSpeedKmh,
      avgWindWattDelta,
      finishEta,
      finishIso,
      minTemp: Math.round(Math.min(...temps)),
      maxTemp: Math.round(Math.max(...temps)),
      avgTemp: Number((temps.reduce((s, v) => s + v, 0) / n).toFixed(1)),
      avgHumidity: Math.round(hums.reduce((s, v) => s + v, 0) / n),
      avgWind: Math.round(winds.reduce((s, v) => s + v, 0) / n),
      maxGust: Math.max(...gusts),
      maxRainProb: Math.max(...probs),
      totalRainMm: Number(rains.reduce((s, v) => s + v, 0).toFixed(1)),
      headwindPct: Math.round((headCount / n) * 100),
      tailwindPct: Math.round((tailCount / n) * 100),
      crosswindPct: Math.round((crossCount / n) * 100),
    };
  }, [
    activeRoute.totalDistanceKm,
    pacingMode,
    powerSimResult.totalMinutes,
    powerSimResult.realisticSpeedKmh,
    speedKmh,
    effectiveSpeedKmh,
    plannedCheckpoints,
    departureTime,
    rideDate,
    weatherCheckpoints,
    checkpointWattImpacts,
  ]);

  const riderCursor = useMemo(() => {
    if (weatherMode !== "gpx") return null;
    return interpolateRideAtFraction(
      activeRoute,
      rideProgressPct / 100,
      summaryStats.realisticMins,
      departureTime,
      weatherCheckpoints,
      checkpointWattImpacts.map((w) => w.windDeltaWatts)
    );
  }, [
    weatherMode,
    activeRoute,
    rideProgressPct,
    summaryStats.realisticMins,
    departureTime,
    weatherCheckpoints,
    checkpointWattImpacts,
  ]);

  const duskAlert = useMemo(() => {
    if (!daylight || !summaryStats.finishIso) return null;
    const finishDateStr = summaryStats.finishIso.slice(0, 10);
    const finishTimeStr = summaryStats.finishIso.slice(11, 16);
    const sunsetMins = timeStringToMinutes(daylight.sunset);
    const finishMins = timeStringToMinutes(finishTimeStr);
    const startMins = timeStringToMinutes(departureTime);
    const sunriseMins = timeStringToMinutes(daylight.sunrise);

    if (startMins < sunriseMins) {
      return {
        level: "warn" as const,
        message: `Start przed wschodem słońca (${daylight.sunrise}) — obowiązkowe oświetlenie przód i tył na pierwsze kilometry.`,
      };
    }

    if (finishDateStr > rideDate || finishMins >= sunsetMins) {
      return {
        level: "danger" as const,
        message: `Planowana meta (${finishTimeStr}) przypada po zachodzie słońca (${daylight.sunset}). Zabierz mocne lampki przód/tył i odblaski!`,
      };
    }

    if (finishMins >= sunsetMins - 35) {
      const diff = sunsetMins - finishMins;
      return {
        level: "warn" as const,
        message: `Powrót na ${diff} min przed zachodem słońca (${daylight.sunset}) — przy lekkim opóźnieniu zapadnie zmrok. Zabierz oświetlenie awaryjne.`,
      };
    }
    return null;
  }, [daylight, summaryStats.finishIso, departureTime, rideDate]);

  const hydrationPlan = useMemo(
    () =>
      computeHydrationAndFueling({
        avgTempC: summaryStats.avgTemp,
        avgHumidityPct: summaryStats.avgHumidity,
        durationMin: summaryStats.realisticMins,
        bikeType,
      }),
    [summaryStats.avgTemp, summaryStats.avgHumidity, summaryStats.realisticMins, bikeType]
  );

  const rideAdvisory = useMemo(() => {
    const preset = BIKE_PRESETS[bikeType];
    if (weatherCheckpoints.length === 0) {
      return {
        kit: "Wybierz datę i godzinę wyjazdu, aby wyliczyć zestaw odzieży.",
        pressure: preset.tirePressure,
        aero: preset.aeroFactorNote,
      };
    }

    const minT = summaryStats.minTemp ?? 15;
    const maxRain = summaryStats.maxRainProb ?? 0;
    const maxWind = summaryStats.maxGust ?? 15;

    let kit = "Krótki rękaw i spodenki kolarskie, lekkie rękawki na start";
    if (minT <= 6) {
      kit =
        "Długie spodnie z wkładką, kurtka termiczna, bielizna z długim rękawem, rękawiczki i ochraniacze na buty";
    } else if (minT <= 12) {
      kit =
        "Nogawki/długie spodnie, potówka + bluza z długim rękawem i kamizelka przeciwwiatrowa";
    } else if (minT <= 17) {
      kit =
        "Krótkie spodenki, koszulka + rękawki i lekka kamizelka (szczególnie na zjazdy)";
    } else if (minT >= 25) {
      kit = "Przewiewna koszulka siatkowa, krem z filtrem UV i okulary";
    }

    if (maxRain >= 45 || summaryStats.totalRainMm >= 0.6) {
      kit += " + kurtka przeciwdeszczowa / błotniki (ryzyko mokrej nawierzchni)";
    }

    const pressure =
      maxRain >= 45
        ? `${preset.tirePressure} · obniż o ~0.3 bar na mokrym asfalcie/szutrze`
        : preset.tirePressure;

    const aero =
      maxWind >= 28
        ? `Silne porywy do ${maxWind} km/h! ${preset.aeroFactorNote}`
        : preset.aeroFactorNote;

    return { kit, pressure, aero };
  }, [bikeType, weatherCheckpoints.length, summaryStats]);

  const currentPreset = BIKE_PRESETS[bikeType];
  const activeDailyList =
    weatherMode === "location" && locationForecast
      ? locationForecast.dailyForecast
      : routeDailyForecast;

  // Elevation profile SVG geometry
  const elevationChart = useMemo(() => {
    const pts = activeRoute.points.filter((p) => p.ele !== null);
    if (pts.length < 2) return null;
    const eles = pts.map((p) => p.ele as number);
    const minE = Math.min(...eles);
    const maxE = Math.max(...eles);
    const spanE = Math.max(20, maxE - minE);
    const maxKm = Math.max(0.1, activeRoute.totalDistanceKm);

    const W = 760;
    const H = 120;
    const padL = 36;
    const padR = 16;
    const padT = 14;
    const padB = 22;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const toX = (km: number) => padL + (km / maxKm) * innerW;
    const toY = (ele: number) => padT + innerH - ((ele - minE) / spanE) * innerH;

    const lineCoords = pts.map(
      (p) => `${toX(p.km).toFixed(1)},${toY(p.ele as number).toFixed(1)}`
    );
    const linePath = `M ${lineCoords.join(" L ")}`;
    const areaPath = `${linePath} L ${toX(pts[pts.length - 1].km).toFixed(1)},${(
      padT + innerH
    ).toFixed(1)} L ${toX(pts[0].km).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

    return { W, H, padL, padR, padT, innerH, minE, maxE, toX, toY, linePath, areaPath };
  }, [activeRoute]);

  return (
    <div className="space-y-6">
      {/* Top Bar: GPX Upload, Locality Search, Subfolder Library */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <CloudSun className="h-6 w-6 text-sky-500 shrink-0" />
              <span>Planer Pogodowy & Foldery Tras GPX</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Organizuj trasy w podfolderach <span className="font-mono text-sky-600 dark:text-sky-400">saved_routes/</span>, sprawdzaj pogodę na kolejne 10 dni, koszt wiatru w watach i najlepsze okno wyjazdu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Locality Search Box */}
            <div className="relative">
              <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-slate-400 mr-1.5 shrink-0" />
                <input
                  type="text"
                  value={geoQuery}
                  onChange={(e) => void handleGeocodeSearch(e.target.value)}
                  placeholder="Wyszukaj miejscowość..."
                  className="w-36 sm:w-44 bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                />
                {geoQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setGeoQuery("");
                      setGeoResults([]);
                    }}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {(geoResults.length > 0 || geoSearching) && (
                <div className="absolute right-0 mt-1.5 w-64 sm:w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-40 overflow-hidden">
                  {geoSearching ? (
                    <div className="px-3 py-2.5 text-xs text-slate-500">Szukam miejscowości...</div>
                  ) : (
                    geoResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void handleSelectLocality(item)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 dark:hover:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {item.name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {[item.admin1, item.country].filter(Boolean).join(", ")}
                          </div>
                        </div>
                        <MapPin className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white px-3.5 py-2 text-xs font-bold shadow-sm cursor-pointer transition-colors whitespace-nowrap">
              <Upload className="h-3.5 w-3.5" />
              <span>Wgraj .GPX</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".gpx,application/gpx+xml,text/xml"
                className="hidden"
                onChange={handleUploadGpx}
              />
            </label>

            <button
              type="button"
              onClick={handleOpenStravaRoutesModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc5200] hover:bg-[#e04900] text-white px-3.5 py-2 text-xs font-bold shadow-sm cursor-pointer transition-colors whitespace-nowrap"
              title="Pobierz trasy ze swojego profilu Strava"
            >
              <Flame className="h-3.5 w-3.5 fill-current" />
              <span>Import ze Strava</span>
            </button>

            <button
              type="button"
              onClick={handleReverseRoute}
              title="Odwróć kierunek trasy i sprawdź wiatr na powrocie"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 text-sky-500" />
              <span>Odwróć</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadRouteGpx(activeRoute)}
              title="Pobierz aktywną trasę jako plik .GPX (uwzględnia odwrócenie)"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-sky-500" />
              <span>Pobierz .GPX</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSaveCurrentRoute()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap"
            >
              {saveFeedback ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">{saveFeedback}</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 text-sky-500" />
                  <span>Zapisz trasę</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mode Switcher when locality forecast is loaded */}
        {locationForecast && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/30 px-3.5 py-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
              <MapPin className="h-4 w-4 text-sky-500" />
              <span>
                Tryb widoku: {weatherMode === "location" ? `Miejscowość (${locationForecast.locationName})` : `Ślad GPX (${activeRoute.name})`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setWeatherMode("gpx");
                  setFitTrigger((n) => n + 1);
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  weatherMode === "gpx"
                    ? "bg-sky-600 text-white"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Trasa GPX
              </button>
              <button
                type="button"
                onClick={() => {
                  setWeatherMode("location");
                  setFitTrigger((n) => n + 1);
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  weatherMode === "location"
                    ? "bg-sky-600 text-white"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {locationForecast.locationName.split(",")[0]}
              </button>
            </div>
          </div>
        )}

        {gpxError && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{gpxError}</span>
          </div>
        )}

        {/* Saved Routes Subfolder Library Strip (./saved_routes/<folder>/) */}
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Folder Tabs with Rename & Delete */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
                <Folder className="h-3.5 w-3.5 text-sky-500" />
                <span>saved_routes/</span>
              </span>

              <button
                type="button"
                onClick={() => setActiveFolderSlug("all")}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  activeFolderSlug === "all"
                    ? "bg-slate-900 text-white dark:bg-sky-600"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                Wszystkie ({savedRoutes.length})
              </button>

              {folders.map((folder) => {
                const count = savedRoutes.filter(
                  (r) => (r.folder || "szosa") === folder.slug
                ).length;
                const isActive = activeFolderSlug === folder.slug;
                const isRenaming = renamingFolderSlug === folder.slug;

                if (isRenaming) {
                  return (
                    <div key={folder.slug} className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        value={renameFolderValue}
                        onChange={(e) => setRenameFolderValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRenameFolder(folder.slug);
                          if (e.key === "Escape") setRenamingFolderSlug(null);
                        }}
                        className="w-28 rounded-lg border border-sky-400 bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void handleRenameFolder(folder.slug)}
                        className="rounded-md bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                      >
                        OK
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={folder.slug}
                    onClick={() => setActiveFolderSlug(folder.slug)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setActiveFolderSlug(folder.slug);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                      isActive
                        ? "bg-slate-900 text-white dark:bg-sky-600"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    <span>{folder.name}</span>
                    <span className="font-mono text-[10px] opacity-75">({count})</span>
                    {!folder.isBuiltin && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingFolderSlug(folder.slug);
                            setRenameFolderValue(folder.name);
                          }}
                          title="Zmień nazwę podfolderu"
                          className="ml-0.5 opacity-75 hover:opacity-100 hover:text-sky-300"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteFolder(e, folder.slug)}
                          title="Usuń podfolder"
                          className="opacity-75 hover:opacity-100 hover:text-rose-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              {showNewFolderInput ? (
                <div className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleCreateFolder();
                      if (e.key === "Escape") setShowNewFolderInput(false);
                    }}
                    placeholder="Nazwa podfolderu..."
                    className="w-32 rounded-lg border border-sky-400 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-900 dark:text-white focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateFolder()}
                    className="rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-bold text-white"
                  >
                    Dodaj
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewFolderInput(false)}
                    className="rounded-lg px-1.5 py-1 text-[11px] text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewFolderInput(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-sky-600 hover:border-sky-400 transition-colors"
                >
                  <FolderPlus className="h-3 w-3" />
                  <span>Nowy podfolder</span>
                </button>
              )}
            </div>

            {/* Folder Search, Sort & Backup Bundle Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={folderSearchQuery}
                  onChange={(e) => setFolderSearchQuery(e.target.value)}
                  placeholder="Szukaj w folderze..."
                  className="w-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 pl-6 pr-2 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={folderSortMode}
                onChange={(e) => setFolderSortMode(e.target.value as RouteSortMode)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
                title="Sortowanie tras w folderze"
              >
                <option value="newest">Najnowsze</option>
                <option value="favorites">Ulubione ★</option>
                <option value="distance">Dystans km</option>
                <option value="elevation">Przewyższenie m</option>
                <option value="name">Nazwa A–Z</option>
              </select>

              <button
                type="button"
                onClick={handleExportFolderBundle}
                title="Eksportuj wszystkie trasy z wybranego folderu jako plik .json"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <Download className="h-3 w-3 text-sky-500" />
                <span>Eksport</span>
              </button>

              <label
                title="Importuj paczkę tras (.json) do wybranego podfolderu"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                <Upload className="h-3 w-3 text-sky-500" />
                <span>Import</span>
                <input
                  ref={bundleInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportFolderBundle}
                />
              </label>
            </div>
          </div>

          {/* Active Route Edit Metadata Bar (Name, Move Folder, Surface, Notes) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-2.5">
            <div className="lg:col-span-4">
              <input
                type="text"
                value={routeNameDraft}
                onChange={(e) => setRouteNameDraft(e.target.value)}
                placeholder="Nazwa trasy..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="lg:col-span-3 flex items-center gap-1.5">
              <FolderInput className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <select
                value={saveFolderDraft}
                onChange={(e) => void handleMoveActiveRoute(e.target.value)}
                title="Przenieś lub zapisz w podfolderze"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {folders.map((f) => (
                  <option key={f.slug} value={f.slug}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <select
                value={surfaceDraft}
                onChange={(e) => setSurfaceDraft(e.target.value as SurfaceType)}
                title="Nawierzchnia trasy"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {(Object.keys(SURFACE_LABELS) as SurfaceType[]).map((sKey) => (
                  <option key={sKey} value={sKey}>
                    {SURFACE_LABELS[sKey]}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-3">
              <input
                type="text"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Notatka (np. wodopój, kawa)..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Route Cards Strip */}
          <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1 no-scrollbar">
            {filteredSavedRoutes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                Brak pasujących tras w tym podfolderze. Wgraj plik .gpx lub zapisz aktywność z zakładki Aktywności.
              </div>
            ) : (
              filteredSavedRoutes.map((route) => {
                const isSelected = route.id === activeRoute.id && weatherMode === "gpx";
                const folderObj = folders.find((f) => f.slug === (route.folder || "szosa"));
                return (
                  <div
                    key={route.id}
                    onClick={() => handleSelectSavedRoute(route)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") handleSelectSavedRoute(route);
                    }}
                    className={`group flex min-w-[260px] max-w-[320px] shrink-0 items-start justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-sky-500 bg-sky-50/70 dark:border-sky-500 dark:bg-sky-950/30"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => void handleToggleFavorite(e, route)}
                          title={route.favorite ? "Usuń z ulubionych" : "Oznacz jako ulubioną"}
                          className="shrink-0"
                        >
                          <Star
                            className={`h-3.5 w-3.5 ${
                              route.favorite
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-300 hover:text-amber-400 dark:text-slate-600"
                            }`}
                          />
                        </button>
                        <div className="truncate font-display text-xs font-bold text-slate-900 dark:text-white">
                          {route.name}
                        </div>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                        {route.totalDistanceKm} km · +{route.elevationGainM} m ·{" "}
                        {folderObj?.name || route.folder}
                        {route.surface ? ` · ${SURFACE_LABELS[route.surface]}` : ""}
                      </div>
                      {route.notes && (
                        <div className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500">
                          {route.notes}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadRouteGpx(route);
                        }}
                        title="Pobierz .GPX"
                        className="rounded-lg p-1 text-slate-400 hover:bg-sky-100 hover:text-sky-600 dark:hover:bg-sky-950/50 dark:hover:text-sky-400 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      {savedRoutes.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteSavedRoute(e, route)}
                          title="Usuń zapisaną trasę"
                          className="rounded-lg p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Ride Planning Inputs: Data, Czas, Rodzaj roweru, Średnia prędkość */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="lg:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              <Calendar className="h-3.5 w-3.5 text-sky-500" />
              <span>Data jazdy</span>
            </label>
            <input
              type="date"
              value={rideDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setRideDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 font-mono text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 tabular-nums"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              <Clock className="h-3.5 w-3.5 text-sky-500" />
              <span>Godzina wyjazdu</span>
            </label>
            <input
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 font-mono text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 tabular-nums"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-4">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              <Bike className="h-3.5 w-3.5 text-sky-500" />
              <span>Rodzaj roweru</span>
            </label>
            <div className="grid grid-cols-4 gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-1">
              {(Object.keys(BIKE_PRESETS) as BikeType[]).map((key) => {
                const preset = BIKE_PRESETS[key];
                const isSel = bikeType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectBikeType(key)}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors truncate ${
                      isSel
                        ? "bg-sky-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                    }`}
                  >
                    {preset.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setPacingMode("speed")}
                  className={`rounded-md px-2 py-0.5 transition-colors ${
                    pacingMode === "speed"
                      ? "bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  Prędkość (km/h)
                </button>
                <button
                  type="button"
                  onClick={() => setPacingMode("power")}
                  className={`rounded-md px-2 py-0.5 transition-colors ${
                    pacingMode === "power"
                      ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  Symulator Mocy (W)
                </button>
              </div>
              <span className="font-mono text-xs font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">
                {pacingMode === "power"
                  ? `${targetWatts} W (${(targetWatts / Math.max(45, athleteWeightKg)).toFixed(2)} W/kg) · ~${powerSimResult.realisticSpeedKmh} km/h`
                  : `${speedKmh} km/h · Czas ${formatDurationMinutes(summaryStats.nominalMins)}`}
              </span>
            </div>

            {pacingMode === "speed" ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-1.5">
                <input
                  type="range"
                  min={currentPreset.minSpeedKmh}
                  max={currentPreset.maxSpeedKmh}
                  step={0.5}
                  value={speedKmh}
                  onChange={(e) => setSpeedKmh(Number(e.target.value))}
                  className="w-full accent-sky-600"
                />
                <input
                  type="number"
                  min={8}
                  max={60}
                  step={0.5}
                  value={speedKmh}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 8 && val <= 60) {
                      setSpeedKmh(val);
                    }
                  }}
                  className="w-14 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-right font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums focus:outline-none focus:border-sky-500"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-1.5">
                  <input
                    type="range"
                    min={90}
                    max={Math.max(360, Math.round(athleteFtp * 1.25))}
                    step={5}
                    value={targetWatts}
                    onChange={(e) => setTargetWatts(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <input
                    type="number"
                    min={60}
                    max={600}
                    step={5}
                    value={targetWatts}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val) && val >= 60 && val <= 600) {
                        setTargetWatts(val);
                      }
                    }}
                    className="w-16 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-right font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono font-bold">
                  {[
                    { label: "Z2 68%", pct: 0.68 },
                    { label: "Tempo 82%", pct: 0.82 },
                    { label: "SS 90%", pct: 0.9 },
                    { label: "FTP 98%", pct: 0.98 },
                  ].map((p) => {
                    const wVal = Math.round(athleteFtp * p.pct);
                    const active = Math.abs(targetWatts - wVal) <= 4;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setTargetWatts(wVal)}
                        className={`rounded-md px-1.5 py-0.5 border transition-colors ${
                          active
                            ? "border-emerald-500 bg-emerald-600 text-white"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-emerald-400"
                        }`}
                      >
                        {p.label} ({wVal}W)
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Weather Fetch Error */}
      {weatherError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{weatherError}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchRouteWeather()}
            className="rounded-lg bg-rose-600 px-3 py-1 text-white font-bold hover:bg-rose-500 shrink-0"
          >
            Ponów
          </button>
        </div>
      )}

      {/* Multi-Day 10-Day Cycling Weather Outlook */}
      {activeDailyList.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-sky-500" />
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Prognoza na kolejne 10 dni {weatherMode === "location" && locationForecast ? `· ${locationForecast.locationName}` : `· ${activeRoute.name}`}
              </h2>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Kliknij dowolny dzień, aby zobaczyć godzinową prognozę trasy
            </span>
          </div>

          <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1 no-scrollbar">
            {activeDailyList.map((day) => {
              const isSelected = day.date === rideDate;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setRideDate(day.date)}
                  className={`min-w-[138px] shrink-0 rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? "border-sky-500 bg-sky-50/80 dark:border-sky-500 dark:bg-sky-950/40 ring-1 ring-sky-500/40"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-white">
                      {day.dayShort}
                    </span>
                    <span className="text-base leading-none">{day.conditionEmoji}</span>
                  </div>

                  <div className="mt-1.5 font-mono text-sm font-black text-slate-900 dark:text-white tabular-nums">
                    {Math.round(day.tempMinC)}° / {Math.round(day.tempMaxC)}°C
                  </div>

                  <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {day.windCardinal} {day.windMaxKmh} km/h
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                    Deszcz {day.precipProbMaxPct}% ({day.precipSumMm} mm)
                  </div>

                  <div className="mt-1.5 flex items-center justify-between">
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                        day.comfortScore >= 80
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : day.comfortScore >= 60
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {day.comfortScore}/100
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 truncate max-w-[68px]">
                      {day.verdict}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Dusk / Sunset Alert Banner */}
      {weatherMode === "gpx" && duskAlert && (
        <div
          className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs font-semibold ${
            duskAlert.level === "danger"
              ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{duskAlert.message}</span>
        </div>
      )}

      {/* GPX Mode KPI Grid */}
      {weatherMode === "gpx" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>Trasa & Realistyczne ETA</span>
              <Navigation className="h-4 w-4 text-sky-500" />
            </div>
            <div className="mt-1.5 font-mono text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {activeRoute.totalDistanceKm} km
              <span className="ml-1.5 text-xs font-semibold text-slate-500">
                (+{activeRoute.elevationGainM} m)
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              Meta {summaryStats.finishEta} · Z wiatrem{" "}
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {formatDurationMinutes(summaryStats.realisticMins)}
              </span>{" "}
              ({summaryStats.realisticSpeedKmh} km/h)
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>Temperatura & Dzień</span>
              <Thermometer className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-1.5 font-mono text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {summaryStats.minTemp !== null
                ? summaryStats.minTemp === summaryStats.maxTemp
                  ? `${summaryStats.minTemp}°C`
                  : `${summaryStats.minTemp}° – ${summaryStats.maxTemp}°C`
                : "—"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {daylight ? (
                <>
                  <span className="inline-flex items-center gap-0.5">
                    <Sunrise className="h-3 w-3 text-amber-500" /> {daylight.sunrise}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Sunset className="h-3 w-3 text-orange-500" /> {daylight.sunset}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Sun className="h-3 w-3 text-yellow-500" /> UV {daylight.uvIndexMax}
                  </span>
                </>
              ) : (
                <span>Ładowanie dnia...</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>Wiatr & Wpływ Aero (W)</span>
              <Zap className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-1.5 font-mono text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {summaryStats.avgWind !== null ? `${summaryStats.avgWind} km/h` : "—"}
              <span
                className={`ml-2 text-xs font-bold ${
                  summaryStats.avgWindWattDelta > 4
                    ? "text-rose-600 dark:text-rose-400"
                    : summaryStats.avgWindWattDelta < -4
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-500"
                }`}
              >
                ({summaryStats.avgWindWattDelta >= 0
                  ? `+${summaryStats.avgWindWattDelta}`
                  : summaryStats.avgWindWattDelta}{" "}
                W)
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">{summaryStats.tailwindPct}% plecy</span>
              {" · "}
              <span className="text-amber-600 dark:text-amber-400">{summaryStats.crosswindPct}% bok</span>
              {" · "}
              <span className="text-rose-600 dark:text-rose-400">{summaryStats.headwindPct}% twarz</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>Opady & Porywy</span>
              <CloudRain className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="mt-1.5 font-mono text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {summaryStats.maxRainProb !== null ? `${summaryStats.maxRainProb}%` : "—"}
              {summaryStats.totalRainMm > 0 && (
                <span className="ml-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  ({summaryStats.totalRainMm} mm)
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              Porywy maks. {summaryStats.maxGust ?? "—"} km/h · {currentPreset.shortLabel}
            </div>
          </div>
        </div>
      )}

      {/* Departure Window Comparator ("Kiedy najlepiej ruszyć?") in GPX mode */}
      {weatherMode === "gpx" && departureCompare.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-500" />
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Kiedy najlepiej ruszyć na tę trasę? ({rideDate})
              </h2>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Kliknij wybraną godzinę, aby przestawić symulację startu
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {departureCompare.map((opt) => {
              const isSelected = departureTime.startsWith(opt.departureTime.slice(0, 2));
              return (
                <button
                  key={opt.departureTime}
                  type="button"
                  onClick={() => setDepartureTime(opt.departureTime)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? "border-sky-500 bg-sky-50/80 dark:border-sky-500 dark:bg-sky-950/40 ring-1 ring-sky-500/40"
                      : opt.isBest
                        ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800/70 dark:bg-emerald-950/20 hover:border-emerald-400"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {opt.departureTime}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                        opt.score >= 80
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : opt.score >= 60
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {opt.score}/100
                    </span>
                  </div>

                  <div className="mt-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
                    {opt.isBest ? "★ " : ""}
                    {opt.verdict}
                  </div>

                  <div className="mt-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {opt.avgTempC}°C · {opt.avgWindKmh} km/h
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                    Deszcz {opt.maxRainProbPct}% · Meta {opt.finishTime}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Interactive Google Map Section */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-slate-900 dark:text-white">
              <MapPin className="h-4 w-4 text-sky-500" />
              <span>
                {weatherMode === "location" && locationForecast
                  ? `Mapa i Prognoza: ${locationForecast.locationName}`
                  : "Interaktywna Mapa Pogodowa Trasy"}
              </span>
            </span>
            {weatherMode === "gpx" && (
              <>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[220px] sm:max-w-sm">
                  {activeRoute.fileName}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            {weatherMode === "gpx" && (
              <>
                <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5 mr-1">
                  {(
                    [
                      { id: "wind", label: "Wiatr" },
                      { id: "slope", label: "Nachylenie %" },
                      { id: "temp", label: "Temperatura" },
                    ] as Array<{ id: MapColorMode; label: string }>
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMapColorMode(m.id)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors ${
                        mapColorMode === m.id
                          ? "bg-sky-600 text-white"
                          : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {mapColorMode === "wind" && (
                  <>
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> W plecy
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Boczny
                    </span>
                    <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> W twarz
                    </span>
                  </>
                )}
                {mapColorMode === "slope" && (
                  <>
                    <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> &lt;1%
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> 1–3.9%
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> 4–6.9%
                    </span>
                    <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> ≥7%
                    </span>
                  </>
                )}
                {mapColorMode === "temp" && (
                  <>
                    <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> &lt;8°
                    </span>
                    <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> 8–14°
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> 15–21°
                    </span>
                    <span className="inline-flex items-center gap-1 text-orange-700 dark:text-orange-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> ≥22°
                    </span>
                  </>
                )}
              </>
            )}

            {weatherMode === "gpx" && (
              <button
                type="button"
                disabled={poiLoading}
                onClick={() => void handleTogglePois()}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
                  showPois
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {poiLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                )}
                <span>
                  {showPois
                    ? `POI na trasie (${filteredPois.length})`
                    : "Szukaj POI (Woda/Sklepy)"}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFitTrigger((n) => n + 1)}
              className="ml-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Crosshair className="h-3.5 w-3.5 text-sky-500" />
              <span>Wyśrodkuj</span>
            </button>

            {weatherMode === "gpx" && (
              <button
                type="button"
                disabled={weatherLoading}
                onClick={() => void fetchRouteWeather()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-sky-500 ${weatherLoading ? "animate-spin" : ""}`}
                />
                <span>Odśwież</span>
              </button>
            )}
          </div>
        </div>

        {/* POI Category Filters & Export Hint */}
        {weatherMode === "gpx" && (showPois || poiError) && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 px-3 py-2 text-xs">
            {poiError ? (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">{poiError}</span>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(POI_META) as PoiCategory[]).map((cat) => {
                    const count = routePois.filter((p) => p.category === cat).length;
                    const active = activePoiCategories[cat];
                    const meta = POI_META[cat];
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() =>
                          setActivePoiCategories((prev) => ({
                            ...prev,
                            [cat]: !prev[cat],
                          }))
                        }
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold transition-colors ${
                          active
                            ? "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs"
                            : "border-transparent bg-slate-200/60 dark:bg-slate-800/40 text-slate-400 line-through"
                        }`}
                      >
                        <span>{meta.emoji}</span>
                        <span>{meta.label}</span>
                        <span className="font-mono text-[10px] opacity-75">({count})</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pobierz .GPX zapakuje widoczne POI jako &lt;wpt&gt;
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDownloadRouteGpx(activeRoute)}
                    className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-sky-500"
                  >
                    <Download className="h-3 w-3" />
                    <span>Eksport .GPX z POI</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {mapsApiKey ? (
          <APIProvider
            apiKey={mapsApiKey}
            language="pl"
            region="PL"
            libraries={["marker"]}
          >
            <MapCanvasWrapper
              mode={weatherMode}
              route={activeRoute}
              checkpoints={weatherCheckpoints}
              wattDeltas={checkpointWattImpacts.map((w) => w.windDeltaWatts)}
              mapColorMode={mapColorMode}
              locationForecast={locationForecast}
              selectedCheckpointIdx={selectedCheckpointIdx}
              onSelectCheckpoint={setSelectedCheckpointIdx}
              climbs={routeClimbs}
              selectedClimbId={selectedClimbId}
              onSelectClimb={setSelectedClimbId}
              pois={filteredPois}
              selectedPoiId={selectedPoiId}
              onSelectPoi={setSelectedPoiId}
              riderCursor={riderCursor}
              targetWatts={targetWatts}
              riderWeightKg={athleteWeightKg}
              onJumpTimelineKm={handleJumpTimelineKm}
              darkMode={darkMode}
              fitTrigger={fitTrigger}
            />
          </APIProvider>
        ) : mapsKeyChecked ? (
          <div className="flex h-[320px] w-full flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/70 p-6 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
            <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400 mb-2" />
            <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Oczekiwanie na klucz Google Maps Platform (`VITE_GOOGLE_MAPS_API_KEY`)
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-600 dark:text-slate-300">
              Uruchom ponownie serwer lub dodaj klucz Maps API w konfiguracji środowiska, aby wyświetlić interaktywną mapę.
            </p>
          </div>
        ) : (
          <div className="h-[430px] sm:h-[520px] w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-500">
            Ładowanie Google Maps...
          </div>
        )}

        {/* Interactive Ride Timeline Simulation Slider & Live HUD */}
        {weatherMode === "gpx" && riderCursor && (
          <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (rideProgressPct >= 100) setRideProgressPct(0);
                    setIsPlayingTimeline((p) => !p);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white hover:bg-sky-500 shadow-xs transition-colors"
                  title={isPlayingTimeline ? "Zatrzymaj symulację" : "Odtwórz symulację jazdy"}
                >
                  {isPlayingTimeline ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4 ml-0.5" />
                  )}
                </button>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Symulator Przejazdu na Mapie (Timeline)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Przesuń suwak, aby zobaczyć godzinę, wiatr i nachylenie w każdym punkcie
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono text-xs font-bold tabular-nums">
                <span className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-slate-900 dark:text-white">
                  {riderCursor.km} / {activeRoute.totalDistanceKm} km
                </span>
                <span className="rounded-lg bg-sky-100 dark:bg-sky-950/60 px-2.5 py-1 text-sky-800 dark:text-sky-300">
                  ETA {riderCursor.etaTimeLabel}
                </span>
                {riderCursor.ele !== null && (
                  <span className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-slate-700 dark:text-slate-300">
                    {riderCursor.ele} m n.p.m. ({riderCursor.slopePct > 0 ? "+" : ""}
                    {riderCursor.slopePct}%)
                  </span>
                )}
                {riderCursor.tempC !== undefined && (
                  <span className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-slate-700 dark:text-slate-300">
                    {riderCursor.conditionEmoji} {riderCursor.tempC}°C · {riderCursor.windCardinal}{" "}
                    {riderCursor.windSpeedKmh} km/h
                    {riderCursor.windDeltaWatts !== undefined && (
                      <span
                        className={`ml-1 ${
                          riderCursor.windDeltaWatts > 4
                            ? "text-rose-600 dark:text-rose-400"
                            : riderCursor.windDeltaWatts < -4
                              ? "text-emerald-600 dark:text-emerald-400"
                              : ""
                        }`}
                      >
                        ({riderCursor.windDeltaWatts >= 0 ? "+" : ""}
                        {riderCursor.windDeltaWatts}W)
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={rideProgressPct}
              onChange={(e) => {
                setIsPlayingTimeline(false);
                setRideProgressPct(Number(e.target.value));
              }}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>
        )}

        {/* Elevation Profile */}
        {weatherMode === "gpx" && elevationChart && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Mountain className="h-3.5 w-3.5 text-sky-500" />
                <span>
                  Profil wysokościowy trasy ({elevationChart.minE}–{elevationChart.maxE} m n.p.m.)
                </span>
                {routeClimbs.length > 0 && (
                  <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800 dark:text-amber-300">
                    {routeClimbs.length} {routeClimbs.length === 1 ? "podjazd" : "podjazdy"}
                  </span>
                )}
              </span>
              <span className="font-mono text-[11px] tabular-nums">
                Kliknij profil lub marker podjazdu, aby ustawić symulację
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-2">
              <svg
                viewBox={`0 0 ${elevationChart.W} ${elevationChart.H}`}
                className="w-full h-auto select-none cursor-crosshair"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * elevationChart.W;
                  const innerW = elevationChart.W - elevationChart.padL - elevationChart.padR;
                  const frac = Math.max(
                    0,
                    Math.min(1, (clickX - elevationChart.padL) / Math.max(1, innerW))
                  );
                  setIsPlayingTimeline(false);
                  setRideProgressPct(Number((frac * 100).toFixed(1)));
                }}
              >
                <defs>
                  <linearGradient id="gpxEleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.03" />
                  </linearGradient>
                </defs>
                <path d={elevationChart.areaPath} fill="url(#gpxEleGrad)" />
                <path
                  d={elevationChart.linePath}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />

                {/* Climb summit markers */}
                {routeClimbs.map((climb) => {
                  const sx = elevationChart.toX(climb.endKm);
                  const sy = elevationChart.toY(climb.summitEleM);
                  const cColor = CLIMB_CAT_COLORS[climb.category];
                  return (
                    <g
                      key={climb.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelectedClimbId(climb.id);
                        handleJumpTimelineKm(climb.startKm);
                      }}
                      className="cursor-pointer"
                    >
                      <polygon
                        points={`${sx},${Math.max(4, sy - 10)} ${sx - 5},${Math.max(12, sy - 2)} ${sx + 5},${Math.max(12, sy - 2)}`}
                        fill={cColor}
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                    </g>
                  );
                })}

                {/* Timeline cursor vertical line & dot */}
                {riderCursor && (
                  <g>
                    <line
                      x1={elevationChart.toX(riderCursor.km)}
                      y1={elevationChart.padT}
                      x2={elevationChart.toX(riderCursor.km)}
                      y2={elevationChart.padT + elevationChart.innerH}
                      stroke="#0284c7"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                    {riderCursor.ele !== null && (
                      <circle
                        cx={elevationChart.toX(riderCursor.km)}
                        cy={elevationChart.toY(riderCursor.ele)}
                        r={5}
                        fill="#0284c7"
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    )}
                  </g>
                )}

                {weatherCheckpoints.map((cp) => {
                  const cx = elevationChart.toX(cp.km);
                  const cy = elevationChart.toY(cp.ele ?? elevationChart.minE);
                  const isSel = selectedCheckpointIdx === cp.index;
                  return (
                    <g
                      key={cp.index}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelectedCheckpointIdx(isSel ? null : cp.index);
                      }}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSel ? 6.5 : 4.5}
                        fill={WIND_COLORS[cp.windImpact]}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                      <text
                        x={cx}
                        y={elevationChart.H - 5}
                        textAnchor="middle"
                        className="fill-slate-500 dark:fill-slate-400 font-mono text-[9px]"
                      >
                        {cp.km === 0 ? "0 km" : `${Math.round(cp.km)} km`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}

        {/* ClimbFinder Cards Grid */}
        {weatherMode === "gpx" && routeClimbs.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                <Flag className="h-3.5 w-3.5 text-amber-500" />
                <span>ClimbFinder · Wykryte Podjazdy i Pacing ({routeClimbs.length})</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Kliknij podjazd, aby przybliżyć na mapie i ustawić suwak symulacji
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {routeClimbs.map((climb) => {
                const isSel = selectedClimbId === climb.id;
                const cColor = CLIMB_CAT_COLORS[climb.category];
                const climbEstMin = Math.max(
                  1,
                  Math.round((climb.lengthKm / Math.max(8, 22 - climb.avgSlopePct * 1.4)) * 60)
                );
                return (
                  <button
                    key={climb.id}
                    type="button"
                    onClick={() => {
                      setSelectedClimbId(isSel ? null : climb.id);
                      handleJumpTimelineKm(climb.startKm);
                    }}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      isSel
                        ? "border-amber-500 bg-amber-50/70 dark:border-amber-500 dark:bg-amber-950/30 ring-1 ring-amber-400/50"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-xs font-bold text-slate-900 dark:text-white truncate">
                        {climb.name}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] font-black text-white shrink-0"
                        style={{ backgroundColor: cColor }}
                      >
                        {climb.category === "HC" ? "HC" : `Kat. ${climb.category}`}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                      {climb.lengthKm} km · +{climb.elevationGainM} m · śr. {climb.avgSlopePct}%
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                      Maks. {climb.maxSlopePct}% · Szczyt {climb.summitEleM} m · ~{climbEstMin} min @{" "}
                      {targetWatts}W
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filtered Route POIs Quick Strip */}
        {weatherMode === "gpx" && showPois && filteredPois.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">
              Punkty na trasie (Woda, Sklepy, Stacje, Kawiarnie, Serwisy) · {filteredPois.length}
            </div>
            <div className="flex items-stretch gap-2 overflow-x-auto pb-1 no-scrollbar">
              {filteredPois.map((poi) => {
                const meta = POI_META[poi.category];
                const isSel = selectedPoiId === poi.id;
                return (
                  <button
                    key={poi.id}
                    type="button"
                    onClick={() => {
                      setSelectedPoiId(isSel ? null : poi.id);
                      handleJumpTimelineKm(poi.kmOnRoute);
                    }}
                    className={`min-w-[175px] shrink-0 rounded-xl border px-3 py-2 text-left transition-all ${
                      isSel
                        ? "border-sky-500 bg-sky-50/70 dark:bg-sky-950/40"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-slate-900 dark:text-white">
                      <span className="truncate">
                        {meta.emoji} {poi.name}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {poi.kmOnRoute.toFixed(1)} km · {poi.distFromRouteM}m od śladu
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* LOCATION FORECAST MODE DETAILS */}
      {weatherMode === "location" && locationForecast && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Dzień & Ekspozycja UV
                </span>
                {locationLoading && (
                  <RefreshCw className="h-3.5 w-3.5 text-sky-500 animate-spin" />
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 p-2.5 border border-slate-100 dark:border-slate-800">
                  <Sunrise className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                  <div className="text-[10px] text-slate-500">Wschód</div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {locationForecast.daylight.sunrise}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 p-2.5 border border-slate-100 dark:border-slate-800">
                  <Sunset className="h-4 w-4 text-orange-500 mx-auto mb-1" />
                  <div className="text-[10px] text-slate-500">Zachód</div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {locationForecast.daylight.sunset}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 p-2.5 border border-slate-100 dark:border-slate-800">
                  <Sun className="h-4 w-4 text-yellow-500 mx-auto mb-1" />
                  <div className="text-[10px] text-slate-500">UV Max</div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {locationForecast.daylight.uvIndexMax}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5 mb-3">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Najlepsze 2-godzinne okna na trening (48h)
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {locationForecast.bestWindows.map((win, idx) => (
                  <button
                    key={`${win.dateLabel}_${win.startHour}_${idx}`}
                    type="button"
                    onClick={() => setDepartureTime(win.startHour)}
                    className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-left hover:border-emerald-400 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                        {win.dateLabel} · {win.startHour}–{win.endHour}
                      </span>
                      <span className="text-base">{win.conditionEmoji}</span>
                    </div>
                    <div className="mt-1.5 font-mono text-sm font-black text-slate-900 dark:text-white">
                      {win.score}/100 pkt
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {win.avgTempC}°C · Wiatr {win.avgWindKmh} km/h · Deszcz {win.maxRainProbPct}%
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white mb-3">
              Prognoza godzinowa (48h) · {locationForecast.locationName}
            </h2>
            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Data / Godz.</th>
                    <th className="py-2 px-2">Warunki</th>
                    <th className="py-2 px-2 text-right">Temp.</th>
                    <th className="py-2 px-2">Wiatr</th>
                    <th className="py-2 px-2 text-right">Opady</th>
                    <th className="py-2 px-2 text-right">UV</th>
                    <th className="py-2 pl-2 text-right">Ocena</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {locationForecast.hourly.map((slot) => (
                    <tr key={slot.timeIso} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 pr-3 font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {slot.dateLabel} · {slot.hourLabel}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <span className="mr-1.5">{slot.conditionEmoji}</span>
                        <span className="text-slate-700 dark:text-slate-300">{slot.conditionLabel}</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap tabular-nums">
                        {slot.tempC}°C{" "}
                        <span className="text-[10px] font-normal text-slate-400">
                          ({slot.apparentTempC}°)
                        </span>
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">
                        {slot.windCardinal} {slot.windSpeedKmh} km/h{" "}
                        <span className="text-[10px] text-slate-400">(porywy {slot.windGustsKmh})</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {slot.precipProbPct}% ({slot.precipitationMm} mm)
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">{slot.uvIndex}</td>
                      <td className="py-2 pl-2 text-right font-mono font-bold tabular-nums">
                        <span
                          className={
                            slot.comfortScore >= 80
                              ? "text-emerald-600 dark:text-emerald-400"
                              : slot.comfortScore >= 60
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-rose-600 dark:text-rose-400"
                          }
                        >
                          {slot.comfortScore}/100
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* GPX Mode: Bike-Specific Advisory + Hydration/Fueling + Checkpoints Table */}
      {weatherMode === "gpx" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Bike className="h-5 w-5 text-sky-500" />
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Rekomendacje · {currentPreset.label}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Dopasowane do prognozy i masy {athleteWeightKg} kg
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3">
                <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Ubiór kolarski
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {rideAdvisory.kit}
                </p>
              </div>

              <div className="rounded-xl border border-sky-200/80 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Droplets className="h-3.5 w-3.5 text-sky-500" />
                    <span>Nawodnienie i Żywienie</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-sky-700 dark:text-sky-400">
                    {hydrationPlan.bottles750} × 750 ml
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px] tabular-nums">
                  <div className="rounded-lg bg-white/80 dark:bg-slate-900/80 px-2 py-1.5 border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">Płyny</div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {hydrationPlan.fluidMlPerHour} ml/h
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/80 dark:bg-slate-900/80 px-2 py-1.5 border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">Węgle</div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {hydrationPlan.carbsGramsPerHour} g/h
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/80 dark:bg-slate-900/80 px-2 py-1.5 border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">Sód</div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {hydrationPlan.sodiumMgPerHour} mg/h
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {hydrationPlan.note} (Łącznie ~{hydrationPlan.totalFluidLiters} L płynów,{" "}
                  {hydrationPlan.totalCarbsGrams} g węgli).
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3">
                <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Ciśnienie w oponach ({currentPreset.shortLabel})
                </div>
                <p className="font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                  {rideAdvisory.pressure}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3">
                <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Taktyka na wiatr ({currentPreset.windSensitivity})
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {rideAdvisory.aero}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Prognoza Godzinowa i Koszt Wiatru Wzdłuż Śladu GPX
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Kliknij dowolny punkt kontrolny, aby otworzyć szczegóły na mapie.
                </p>
              </div>
              {weatherLoading && (
                <span className="text-xs font-mono font-semibold text-sky-600 dark:text-sky-400">
                  Aktualizuję prognozę...
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Punkt / ETA</th>
                    <th className="py-2 px-2">Pogoda</th>
                    <th className="py-2 px-2 text-right">Temp.</th>
                    <th className="py-2 px-2">Wiatr i Kierunek</th>
                    <th className="py-2 px-2 text-right">Moc (ΔW)</th>
                    <th className="py-2 px-2 text-right">Opady</th>
                    <th className="py-2 pl-2 text-right">UV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {weatherCheckpoints.map((cp, idx) => {
                    const isSel = selectedCheckpointIdx === cp.index;
                    const wattObj = checkpointWattImpacts[idx];
                    const deltaW = wattObj?.windDeltaWatts ?? 0;
                    return (
                      <tr
                        key={cp.index}
                        onClick={() => setSelectedCheckpointIdx(isSel ? null : cp.index)}
                        className={`cursor-pointer transition-colors ${
                          isSel
                            ? "bg-sky-50/80 dark:bg-sky-950/40"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {cp.label}{" "}
                            <span className="font-mono text-[11px] font-normal text-slate-500 tabular-nums">
                              ({cp.km} km)
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-sky-600 dark:text-sky-400 font-semibold tabular-nums">
                            {cp.etaTimeLabel}
                            {cp.ele !== null ? ` · ${cp.ele} m` : ""}
                            {cp.slopePct ? ` · ${cp.slopePct > 0 ? "+" : ""}${cp.slopePct}%` : ""}
                          </div>
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap">
                          <span className="mr-1.5">{cp.conditionEmoji}</span>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {cp.conditionLabel}
                          </span>
                        </td>

                        <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                          {cp.tempC}°C
                          <span className="block text-[10px] font-normal text-slate-400">
                            odcz. {cp.apparentTempC}°C
                          </span>
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0"
                              style={{
                                backgroundColor: WIND_COLORS[cp.windImpact],
                                transform: `rotate(${(cp.windDirectionDeg + 180) % 360}deg)`,
                              }}
                              title={`Wiatr z ${cp.windCardinal} (${cp.windDirectionDeg}°)`}
                            >
                              ↑
                            </span>
                            <div>
                              <div className="font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                                {cp.windCardinal} {cp.windSpeedKmh} km/h
                                <span className="text-[10px] font-normal text-slate-400 ml-1">
                                  (porywy {cp.windGustsKmh})
                                </span>
                              </div>
                              <div
                                className="text-[10px] font-bold"
                                style={{ color: WIND_COLORS[cp.windImpact] }}
                              >
                                {cp.windImpactLabel}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              deltaW > 5
                                ? "text-rose-600 dark:text-rose-400"
                                : deltaW < -5
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {deltaW >= 0 ? `+${deltaW}` : deltaW} W
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            ~{wattObj?.realisticSpeedKmh ?? speedKmh} km/h
                          </span>
                        </td>

                        <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {cp.precipProbPct}%
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {cp.precipitationMm} mm
                          </span>
                        </td>

                        <td className="py-2.5 pl-2 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                          UV {cp.uvIndex}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Strava Routes Import Modal */}
      {showStravaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-5 bg-orange-50/50 dark:bg-orange-950/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fc5200] text-white shadow-sm">
                  <Flame className="h-5 w-5 fill-current" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Twoje trasy ze Strava
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Importuj zaplanowane trasy do folderu "Trasy Strava" i uruchom symulację pogodową
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStravaModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Token entry / refresh bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={stravaManualToken}
                  onChange={(e) => setStravaManualToken(e.target.value)}
                  placeholder="Wklej Access Token ze Strava lub pobierz z zapamiętanej sesji..."
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  disabled={loadingStravaRoutes}
                  onClick={() => fetchStravaRoutes(stravaManualToken)}
                  className="rounded-xl bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 text-xs font-bold transition-colors disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  {loadingStravaRoutes ? "Odświeżam..." : "Odśwież trasy"}
                </button>
              </div>
              {stravaModalError && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{stravaModalError}</span>
                </div>
              )}
            </div>

            {/* Routes List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2.5 max-h-[55vh]">
              {loadingStravaRoutes ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-orange-500 mb-2" />
                  Pobieranie listy tras ze Strava...
                </div>
              ) : stravaRoutesList.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  <Flame className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                  Brak zapisanych tras na profilu Strava lub wymagany Access Token z uprawnieniem read.
                </div>
              ) : (
                stravaRoutesList.map((r) => {
                  const isImporting = importingStravaRouteId === r.id;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-orange-300 dark:hover:border-orange-800/60 bg-white dark:bg-slate-950 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                            {r.name}
                          </span>
                          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                            {r.surface}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          <span>{r.distanceKm} km</span>
                          <span>↗ {r.elevationGainM} m</span>
                          {r.description && (
                            <span className="truncate max-w-[200px] text-slate-400 font-sans">
                              {r.description}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isImporting}
                        onClick={() => handleImportStravaRoute(r.id)}
                        className="rounded-xl bg-orange-600 hover:bg-orange-500 text-white px-3.5 py-2 text-xs font-bold transition-all shadow-sm disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        {isImporting ? "Importuję..." : "Zapisz i symuluj"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
