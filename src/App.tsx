import { useCallback, useEffect, useMemo, useState , useRef } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, RefreshCw, X } from "lucide-react";
import { TopBar, type ActiveTab } from "./components/TopBar";
import { OverviewView } from "./components/OverviewView";
import { TrainingPlanView } from "./components/TrainingPlanView";
import { ActivitiesView } from "./components/ActivitiesView";
import { ZonesView } from "./components/ZonesView";
import { HealthView } from "./components/HealthView";
import { AiCoachView } from "./components/AiCoachView";
import { StrategyView } from "./components/StrategyView";
import { WeatherView } from "./components/WeatherView";
import { CoachTipsView } from "./components/CoachTipsView";
import { ConnectPanel } from "./components/ConnectPanel";
import { ActivityDetailModal } from "./components/ActivityDetailModal";
import { MetricDetailModal, type MetricType } from "./components/MetricDetailModal";
import { GearWearView } from "./components/GearWearView";
import { AuthModal } from "./components/AuthModal";
import {
  auth,
  onAuthStateChanged,
  type User,
  saveUserSettingsToCloud,
  loadUserSettingsFromCloud,
  saveComponentsToCloud,
  loadComponentsFromCloud,
  saveServiceRecordToCloud,
  loadServiceRecordsFromCloud,
  saveActivitiesPayloadToCloud,
  loadActivitiesPayloadFromCloud,
  type CloudGearComponent,
  type CloudServiceRecord,
} from "./utils/firebase";
import type {
  IntervalsActivity,
  IntervalsSyncPayload,
} from "./types/intervals";
import {
  buildAiSummaryPayload,
  computeCriticalPower,
  computeDailyHeatmap,
  computeEfficiencySeries,
  computeIntensityScatter,
  computePmcSeries,
  computePowerCurveSummary,
  computeRunningSummary,
  computeSeilerPolarization,
  computeSportBreakdown,
  computeWeeklyVolume,
  computeWeeklyZoneStack,
  computeZoneDistribution,
  filterActivitiesByRangeAndSport,
  generateDeterministicInsights,
  type SportFilter,
} from "./utils/analytics";

const SESSION_KEY = "darierpro_intervals_session";
const STRAVA_SESSION_KEY = "darierpro_strava_session";
const CACHED_PAYLOAD_KEY = "darierpro_cached_payload";
const THEME_KEY = "darierpro_theme";

interface StoredCreds {
  service?: "intervals" | "strava";
  athleteId: string;
  accessToken: string;
  userFtp?: number;
  userWeight?: number;
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored !== null) return stored === "dark";
      return false; // Default clean light mode as shown in user screenshot
    } catch {
      return false;
    }
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>("plan");
  const [daysWindow, setDaysWindow] = useState<number>(90);
  const [sportFilter, setSportFilter] = useState<SportFilter>("cycling");

  const [serverConfigured, setServerConfigured] = useState(false);
  const [initialAthleteId, setInitialAthleteId] = useState("0");
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Persistent session credentials so user is never logged out - Intervals prioritized first
  const [creds, setCreds] = useState<StoredCreds | null>(() => {
    try {
      const rawIntervals =
        localStorage.getItem(SESSION_KEY) ||
        sessionStorage.getItem(SESSION_KEY);
      if (rawIntervals) return JSON.parse(rawIntervals) as StoredCreds;
      const stravaRaw =
        localStorage.getItem(STRAVA_SESSION_KEY) ||
        sessionStorage.getItem(STRAVA_SESSION_KEY);
      return stravaRaw ? (JSON.parse(stravaRaw) as StoredCreds) : null;
    } catch {
      return null;
    }
  });

  const [payload, setPayload] = useState<IntervalsSyncPayload | null>(() => {
    try {
      const cached = localStorage.getItem(CACHED_PAYLOAD_KEY);
      if (cached) return JSON.parse(cached) as IntervalsSyncPayload;
    } catch {
      // ignore
    }
    return null;
  });
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectModalMode, setConnectModalMode] = useState<
    "api" | "strava" | "garmin" | "file" | "openrouter" | "groq" | "weather" | "shiftwork"
  >("api");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);
  const [selectedActivity, setSelectedActivity] =
    useState<IntervalsActivity | null>(null);
  const [activeDetailMetric, setActiveDetailMetric] = useState<MetricType | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);

  // Cloud Account & Auto-Sync State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [lastCloudSyncTime, setLastCloudSyncTime] = useState<string | null>(null);
  const [cloudComponents, setCloudComponents] = useState<CloudGearComponent[] | undefined>(undefined);
  const [cloudServiceRecords, setCloudServiceRecords] = useState<CloudServiceRecord[] | undefined>(undefined);
  const [criticalGearCount, setCriticalGearCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("darierpro_components_list");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(
            (c: { currentValue?: number; baseValue?: number; maxValue?: number }) => {
              const val = c.currentValue ?? c.baseValue ?? 0;
              const max = c.maxValue || 3000;
              return val / max >= 0.9;
            }
          ).length;
        }
      }
    } catch {}
    return 2; // Starter data has 2 components above 90%
  });

  // Cloud backup & auto-sync trigger
  const triggerCloudBackupAndSync = useCallback(
    async (userToSync?: User | null) => {
      const targetUser = userToSync || currentUser;
      if (!targetUser) return;
      setIsCloudSyncing(true);
      try {
        // 1. Upload settings if creds exist
        await saveUserSettingsToCloud(targetUser.uid, {
          intervalsAthleteId: creds?.athleteId,
          intervalsApiKey: creds?.accessToken,
          userFtp: creds?.userFtp,
          userWeight: creds?.userWeight,
          theme: darkMode ? "dark" : "light",
        });

        // 2. Upload gear / components from localStorage if present
        const rawComps = localStorage.getItem("darierpro_components_list");
        if (rawComps) {
          try {
            const parsed = JSON.parse(rawComps);
            if (Array.isArray(parsed) && parsed.length > 0) {
              await saveComponentsToCloud(targetUser.uid, parsed);
            }
          } catch {}
        }

        // 3. Upload service logs from localStorage if present
        const rawLogs = localStorage.getItem("darierpro_service_logs");
        if (rawLogs) {
          try {
            const parsed = JSON.parse(rawLogs);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                await saveServiceRecordToCloud(targetUser.uid, item);
              }
            }
          } catch {}
        }

        // 4. Upload payload cache to cloud if present
        if (payload) {
          await saveActivitiesPayloadToCloud(targetUser.uid, JSON.stringify(payload));
        }

        setLastCloudSyncTime(new Date().toISOString());
        setSyncToast({
          type: "success",
          message: "Wszystkie ustawienia, zużycie sprzętu i aktywności zostały zapisane w chmurze!",
        });
      } catch (err) {
        console.warn("Cloud sync note:", err);
      } finally {
        setIsCloudSyncing(false);
      }
    },
    [currentUser, creds, darkMode, payload]
  );

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const [cloudSettings, cloudComps, cloudSrv] = await Promise.all([
            loadUserSettingsFromCloud(user.uid).catch(() => null),
            loadComponentsFromCloud(user.uid).catch(() => []),
            loadServiceRecordsFromCloud(user.uid).catch(() => []),
          ]);

          if (cloudComps && cloudComps.length > 0) {
            setCloudComponents(cloudComps);
            localStorage.setItem("darierpro_components_list", JSON.stringify(cloudComps));
          }

          if (cloudSrv && cloudSrv.length > 0) {
            setCloudServiceRecords(cloudSrv);
            localStorage.setItem("darierpro_service_logs", JSON.stringify(cloudSrv));
          }

          if (cloudSettings) {
            if (cloudSettings.intervalsApiKey && (!creds || !creds.accessToken)) {
              const restoredCreds = {
                athleteId: cloudSettings.intervalsAthleteId || "0",
                accessToken: cloudSettings.intervalsApiKey,
                userFtp: cloudSettings.userFtp,
                userWeight: cloudSettings.userWeight,
              };
              setCreds(restoredCreds);
              try {
                localStorage.setItem(SESSION_KEY, JSON.stringify(restoredCreds));
              } catch {}
            }
          }

          if (!payload) {
            const cachedCloudJson = await loadActivitiesPayloadFromCloud(user.uid).catch(() => null);
            if (cachedCloudJson) {
              try {
                const restored = JSON.parse(cachedCloudJson);
                setPayload(restored);
                localStorage.setItem(CACHED_PAYLOAD_KEY, cachedCloudJson);
              } catch {}
            }
          }

          setLastCloudSyncTime(new Date().toISOString());
        } catch (e) {
          console.warn("Error hydrating user cloud data:", e);
        }
      }
    });
    return () => unsubscribe();
  }, [creds, payload]);

  const handleOpenSettings = useCallback(
    (mode?: "api" | "strava" | "garmin" | "file" | "openrouter" | "groq" | "weather" | "shiftwork") => {
      if (mode) {
        setConnectModalMode(mode);
      } else if (activeTab === "weather") {
        setConnectModalMode("weather");
      } else if (activeTab === "ai") {
        setConnectModalMode("openrouter");
      } else {
        setConnectModalMode("api");
      }
      setShowConnectModal(true);
    },
    [activeTab]
  );

  useEffect(() => {
    if (!syncToast) return;
    const t = setTimeout(() => setSyncToast(null), 8000);
    return () => clearTimeout(t);
  }, [syncToast]);

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener("gmp-quota-exceeded", onQuota);
    return () => window.removeEventListener("gmp-quota-exceeded", onQuota);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
    } catch {
      // Ignore storage errors
    }
  }, [darkMode]);

  const performApiSync = useCallback(
    async (opts?: {
      athleteId?: string;
      accessToken?: string;
      rememberSession?: boolean;
    }) => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        const res = await fetch("/api/intervals/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            athleteId: opts?.athleteId,
            accessToken: opts?.accessToken,
            days: 365,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Nie udało się zsynchronizować danych.");
        }

        // Store session so refresh keeps user logged in
        if (opts?.accessToken) {
          const nextCreds: StoredCreds = {
            athleteId: opts.athleteId || "0",
            accessToken: opts.accessToken,
          };
          setCreds(nextCreds);
          try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(nextCreds));
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextCreds));
          } catch {
            // Ignore storage errors
          }
        }

        setPayload(data as IntervalsSyncPayload);
        setShowConnectModal(false);
      } catch (err) {
        setSyncError(
          err instanceof Error
            ? err.message
            : "Błąd podczas synchronizacji z Intervals.icu."
        );
      } finally {
        setIsSyncing(false);
      }
    },
    []
  );

    // Auto-sync z Intervals przy starcie apki
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current) return;
    if (creds?.athleteId && creds?.accessToken) {
      autoSyncedRef.current = true;
      performApiSync({
        athleteId: creds.athleteId,
        accessToken: creds.accessToken,
      });
    }
  }, [creds, performApiSync]);

  const performStravaSync = useCallback(
    async (opts: {
      accessToken: string;
      userFtp?: number;
      userWeight?: number;
      rememberSession?: boolean;
      startDate?: string;
      endDate?: string;
      fetchAll?: boolean;
      syncMode?: "all" | "missing_period" | "incremental";
    }) => {
      setIsSyncing(true);
      setSyncError(null);
      try {
        const res = await fetch("/api/strava/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: opts.accessToken,
            userFtp: opts.userFtp ?? creds?.userFtp,
            userWeight: opts.userWeight ?? creds?.userWeight,
            startDate: opts.startDate,
            endDate: opts.endDate,
            fetchAll: opts.fetchAll ?? true,
            syncMode: opts.syncMode || (opts.startDate ? "missing_period" : "all"),
            existingActivities: payload?.activities || [],
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Nie udało się zsynchronizować danych ze Strava.");
        }

        // Merge activities on the client side preserving existing ones
        const incoming = Array.isArray(data.activities) ? data.activities : [];
        const current = payload?.activities || [];
        const actMap = new Map<string, IntervalsActivity>();
        for (const act of current) {
          if (act.id) actMap.set(String(act.id), act);
        }
        for (const act of incoming) {
          if (act.id) actMap.set(String(act.id), act);
        }
        const mergedActivities = Array.from(actMap.values()).sort((a, b) =>
          (b.start_date_local || "").localeCompare(a.start_date_local || "")
        );

        const mergedPayload: IntervalsSyncPayload = {
          ...data,
          activities: mergedActivities,
          wellness: data.wellness?.length ? data.wellness : (payload?.wellness || []),
          events: data.events?.length ? data.events : (payload?.events || []),
          source: "strava",
        };

        setPayload(mergedPayload);

        try {
          localStorage.setItem(CACHED_PAYLOAD_KEY, JSON.stringify(mergedPayload));
        } catch {
          // ignore storage limit
        }

        if (opts.rememberSession !== false) {
          const nextCreds: StoredCreds = {
            service: "strava",
            athleteId: String(data.athlete?.id || creds?.athleteId || "strava"),
            accessToken: opts.accessToken,
            userFtp: opts.userFtp ?? creds?.userFtp,
            userWeight: opts.userWeight ?? creds?.userWeight,
          };
          setCreds(nextCreds);
          try {
            localStorage.setItem(STRAVA_SESSION_KEY, JSON.stringify(nextCreds));
            sessionStorage.setItem(STRAVA_SESSION_KEY, JSON.stringify(nextCreds));
          } catch {
            // ignore
          }
        }

        const stats = data.syncStats as {
          fetchedFromStrava?: number;
          totalActivities?: number;
          newActivitiesAdded?: number;
          updatedActivities?: number;
          rateLimitHit?: boolean;
          period?: { startDate?: string; endDate?: string };
        } | undefined;

        let toastMsg = `Pomyślnie zsynchronizowano ze Stravą! Łącznie w aplikacji: ${mergedActivities.length} treningów.`;
        if (stats) {
          if (stats.period?.startDate) {
            toastMsg = `Pobrano okres ${stats.period.startDate} – ${stats.period.endDate || "teraz"}: ${stats.fetchedFromStrava || 0} aktywności (nowe: ${stats.newActivitiesAdded || 0}). Łącznie w bazie: ${mergedActivities.length}.`;
          } else {
            toastMsg = `Pobrano ze Stravy: ${stats.fetchedFromStrava || 0} aktywności (nowe: ${stats.newActivitiesAdded || 0}, zaktualizowane: ${stats.updatedActivities || 0}). Łącznie w bazie: ${mergedActivities.length}.`;
          }
          if (stats.rateLimitHit) {
            toastMsg += " (Uwaga: osiągnięto limit zapytań Strava API, pobrano maksymalną liczbę dostępnych stron).";
          }
        }

        setSyncToast({
          type: stats?.rateLimitHit ? "warning" : "success",
          message: toastMsg,
        });
        setShowConnectModal(false);
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : "Błąd podczas synchronizacji ze Strava.";
        setSyncError(errorMsg);
        setSyncToast({ type: "error", message: errorMsg });
      } finally {
        setIsSyncing(false);
      }
    },
    [creds, payload]
  );

  // Global popup listener for Strava OAuth callback
  useEffect(() => {
    const handleGlobalMessage = (event: MessageEvent) => {
      if (event.data?.type === "STRAVA_AUTH_SUCCESS") {
        const token = event.data.payload?.accessToken;
        if (token) {
          performStravaSync({
            accessToken: token,
            rememberSession: true,
            fetchAll: true,
          });
        }
      }
    };
    window.addEventListener("message", handleGlobalMessage);
    return () => window.removeEventListener("message", handleGlobalMessage);
  }, [performStravaSync]);

  // Initialize and auto-sync if server credentials or stored credentials exist
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Check Intervals.icu server configuration first (default on startup)
        try {
          const res = await fetch("/api/intervals/status");
          if (res.ok) {
            const status = (await res.json()) as {
              serverConfigured: boolean;
              athleteIdHint: string | null;
            };
            if (cancelled) return;

            setServerConfigured(status.serverConfigured);
            if (status.athleteIdHint) setInitialAthleteId(status.athleteIdHint);

            if (status.serverConfigured) {
              await performApiSync({ athleteId: status.athleteIdHint || "0" });
              if (!cancelled) setCheckingStatus(false);
              return;
            }
          }
        } catch {
          // continue checking stored credentials
        }

        // 2. Check stored Intervals.icu session
        const rawIntervals =
          localStorage.getItem(SESSION_KEY) ||
          sessionStorage.getItem(SESSION_KEY);
        if (rawIntervals) {
          try {
            const parsed = JSON.parse(rawIntervals) as StoredCreds;
            if (parsed.accessToken && parsed.service !== "strava") {
              setCreds(parsed);
              await performApiSync({
                athleteId: parsed.athleteId || "0",
                accessToken: parsed.accessToken,
                rememberSession: true,
              });
              if (!cancelled) setCheckingStatus(false);
              return;
            }
          } catch {
            // ignore
          }
        }

        // 3. Fallback to Strava session only if Intervals is not available
        const rawStrava =
          localStorage.getItem(STRAVA_SESSION_KEY) ||
          sessionStorage.getItem(STRAVA_SESSION_KEY);
        if (rawStrava) {
          try {
            const parsed = JSON.parse(rawStrava) as StoredCreds;
            if (parsed.accessToken) {
              setCreds(parsed);
              await performStravaSync({
                accessToken: parsed.accessToken,
                userFtp: parsed.userFtp,
                userWeight: parsed.userWeight,
                rememberSession: true,
                fetchAll: true,
              });
              if (!cancelled) setCheckingStatus(false);
              return;
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // Keep manual connect state
      } finally {
        if (!cancelled) setCheckingStatus(false);
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrimaryTopBarAction = () => {
    if (!payload) {
      setShowConnectModal(true);
      return;
    }
    if (payload.source === "file") {
      setShowConnectModal(true);
      return;
    }
    if (payload.source === "strava" || creds?.service === "strava") {
      if (creds?.accessToken) {
        performStravaSync({
          accessToken: creds.accessToken,
          userFtp: creds.userFtp,
          userWeight: creds.userWeight,
          rememberSession: true,
          fetchAll: true,
        });
      } else {
        setShowConnectModal(true);
      }
      return;
    }
    if (serverConfigured && !creds?.accessToken) {
      performApiSync({ athleteId: initialAthleteId });
    } else if (creds?.accessToken) {
      performApiSync({
        athleteId: creds.athleteId,
        accessToken: creds.accessToken,
        rememberSession: true,
      });
    } else {
      setShowConnectModal(true);
    }
  };

  // Analytics pipeline
  const filteredActivities = useMemo(() => {
    if (!payload) return [];
    return filterActivitiesByRangeAndSport(
      payload.activities,
      daysWindow,
      sportFilter
    );
  }, [payload, daysWindow, sportFilter]);

  const pmcSeries = useMemo(() => {
    if (!payload) return [];
    return computePmcSeries(payload.activities, payload.wellness, daysWindow);
  }, [payload, daysWindow]);

  const weeklyVolume = useMemo(
    () => computeWeeklyVolume(filteredActivities),
    [filteredActivities]
  );

  const powerZones = useMemo(
    () => computeZoneDistribution(filteredActivities, "power"),
    [filteredActivities]
  );

  const hrZones = useMemo(
    () => computeZoneDistribution(filteredActivities, "hr"),
    [filteredActivities]
  );

  const efficiencySeries = useMemo(
    () => computeEfficiencySeries(filteredActivities),
    [filteredActivities]
  );

  const weeklyZoneStack = useMemo(
    () => computeWeeklyZoneStack(filteredActivities),
    [filteredActivities]
  );

  const intensityScatter = useMemo(
    () => computeIntensityScatter(filteredActivities),
    [filteredActivities]
  );

  const heatmapCells = useMemo(
    () => computeDailyHeatmap(filteredActivities, 180),
    [filteredActivities]
  );

  const sportBreakdown = useMemo(() => {
    if (!payload) return [];
    return computeSportBreakdown(payload.activities);
  }, [payload]);

  const deterministicInsights = useMemo(() => {
    if (!payload) return [];
    return generateDeterministicInsights(
      pmcSeries,
      weeklyVolume,
      powerZones,
      hrZones,
      efficiencySeries
    );
  }, [payload, pmcSeries, weeklyVolume, powerZones, hrZones, efficiencySeries]);

  const powerSummary = useMemo(
    () =>
      computePowerCurveSummary(
        payload?.powerCurves,
        payload?.athlete.weight
      ),
    [payload?.powerCurves, payload?.athlete.weight]
  );

  const cpModel = useMemo(
    () => computeCriticalPower(powerSummary.benchmarks),
    [powerSummary.benchmarks]
  );

  const athleteFtp = useMemo(() => {
    const rideSettings = payload?.athlete.sportSettings?.find(
      (s) => typeof s.ftp === "number" && s.ftp > 0
    );
    return rideSettings?.ftp || cpModel.cpWatts || 220;
  }, [payload?.athlete.sportSettings, cpModel.cpWatts]);

  const runningSummary = useMemo(() => {
    const runSettings = payload?.athlete.sportSettings?.find((s) =>
      s.types?.some((t) => t.toLowerCase().includes("run"))
    );
    return computeRunningSummary(
      payload?.paceCurves,
      filteredActivities,
      runSettings?.threshold_pace
    );
  }, [payload?.paceCurves, payload?.athlete.sportSettings, filteredActivities]);

  const currentPolarization = useMemo(() => {
    const primary =
      powerZones.reduce((s, z) => s + z.secs, 0) > 0 ? powerZones : hrZones;
    return computeSeilerPolarization(primary);
  }, [powerZones, hrZones]);

  const aiSummaryPayload = useMemo(() => {
    if (!payload) return {};
    return buildAiSummaryPayload(
      payload.athlete,
      filteredActivities,
      payload.wellness,
      pmcSeries,
      weeklyVolume,
      powerZones,
      hrZones,
      efficiencySeries
    );
  }, [
    payload,
    filteredActivities,
    pmcSeries,
    weeklyVolume,
    powerZones,
    hrZones,
    efficiencySeries,
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <TopBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setShowConnectModal(false);
          setActiveTab(tab);
        }}
        isConnected={Boolean(payload)}
        athleteName={payload?.athlete.name}
        athleteId={payload?.athlete.id}
        source={payload?.source}
        isSyncing={isSyncing}
        onPrimaryAction={handlePrimaryTopBarAction}
        onOpenSettings={() => handleOpenSettings()}
        currentUser={currentUser}
        onOpenAuth={() => setShowAuthModal(true)}
        isCloudSyncing={isCloudSyncing}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((m) => !m)}
        sportFilter={sportFilter}
        onSportFilterChange={setSportFilter}
        daysWindow={daysWindow}
        onDaysWindowChange={setDaysWindow}
        criticalGearCount={criticalGearCount}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === "weather" ? (
          <WeatherView
            darkMode={darkMode}
            athleteWeightKg={payload?.athlete.weight}
            athleteFtp={athleteFtp}
            pendingRouteId={pendingRouteId}
            onClearPendingRoute={() => setPendingRouteId(null)}
          />
        ) : activeTab === "gear" ? (
          <GearWearView
            activities={filteredActivities}
            allActivities={payload?.activities || []}
            cloudComponents={cloudComponents}
            cloudServiceRecords={cloudServiceRecords}
            onCriticalCountChange={setCriticalGearCount}
            onSaveComponentsToCloud={async (comps) => {
              if (currentUser) {
                await saveComponentsToCloud(currentUser.uid, comps);
              }
            }}
            onSaveServiceRecordToCloud={async (record) => {
              if (currentUser) {
                await saveServiceRecordToCloud(currentUser.uid, record);
              }
            }}
          />
        ) : checkingStatus && !payload ? (
          <div className="space-y-6 py-12">
            <div className="h-10 w-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((k) => (
                <div
                  key={k}
                  className="h-32 animate-pulse rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900"
                />
              ))}
            </div>
            <div className="h-96 animate-pulse rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900" />
          </div>
        ) : !payload ? (
          <ConnectPanel
            serverConfigured={serverConfigured}
            initialAthleteId={initialAthleteId}
            isSyncing={isSyncing}
            error={syncError}
            onSyncApi={({ athleteId, accessToken, rememberSession }) =>
              performApiSync({ athleteId, accessToken, rememberSession })
            }
            onSyncServerEnv={() =>
              performApiSync({ athleteId: initialAthleteId })
            }
            onSyncStrava={performStravaSync}
            onImportFile={(imported) => {
              setPayload(imported);
              setSyncError(null);
            }}
          />
        ) : (
          <div>
            {syncError && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{syncError}</span>
              </div>
            )}

            {/* Main Active Tab View */}
            {activeTab === "overview" && (
              <OverviewView
                activities={filteredActivities}
                pmc={pmcSeries}
                weekly={weeklyVolume}
                sportBreakdown={sportBreakdown}
                insights={deterministicInsights}
                wellness={payload.wellness}
                heatmapCells={heatmapCells}
                intensityScatter={intensityScatter}
                onSelectActivity={setSelectedActivity}
                onNavigateTab={(tab) => {
                  if (tab === "activities") setActiveTab("activities");
                  else if (tab === "zones") setActiveTab("zones");
                  else if (tab === "ai") setActiveTab("ai");
                }}
              />
            )}

            {activeTab === "plan" && (
              <TrainingPlanView
                athlete={payload.athlete}
                activities={filteredActivities}
                allActivities={payload.activities}
                wellness={payload.wellness}
                events={payload.events}
                cpModel={cpModel}
                accessToken={creds?.accessToken}
                athleteId={creds?.athleteId || initialAthleteId}
                source={payload.source}
                onPlanPushed={handlePrimaryTopBarAction}
                onSelectActivity={setSelectedActivity}
              />
            )}

            {activeTab === "activities" && (
              <ActivitiesView
                activities={filteredActivities}
                allActivities={payload.activities}
                events={payload.events}
                onSelectActivity={setSelectedActivity}
                onAddActivity={(newAct) => {
                  const updatedActivities = [newAct, ...payload.activities];
                  const updatedPayload: IntervalsSyncPayload = {
                    ...payload,
                    activities: updatedActivities,
                  };
                  setPayload(updatedPayload);
                  try {
                    localStorage.setItem(CACHED_PAYLOAD_KEY, JSON.stringify(updatedPayload));
                  } catch {
                    // ignore
                  }
                  setSyncToast({
                    type: "success",
                    message: `Dodano trening "${newAct.name}" i zaktualizowano statystyki!`,
                  });
                }}
                isStrava={payload.source === "strava" || creds?.service === "strava"}
                isSyncing={isSyncing}
                onSyncMissingPeriod={() => {
                  if (creds?.accessToken) {
                    performStravaSync({
                      accessToken: creds.accessToken,
                      userFtp: creds.userFtp,
                      userWeight: creds.userWeight,
                      startDate: "2026-09-03",
                      endDate: "2026-11-18",
                      syncMode: "missing_period",
                    });
                  } else {
                    setShowConnectModal(true);
                  }
                }}
                onFullSync={() => {
                  if (creds?.accessToken) {
                    performStravaSync({
                      accessToken: creds.accessToken,
                      userFtp: creds.userFtp,
                      userWeight: creds.userWeight,
                      fetchAll: true,
                      syncMode: "all",
                    });
                  } else {
                    setShowConnectModal(true);
                  }
                }}
              />
            )}

            {activeTab === "zones" && (
              <ZonesView
                powerZones={powerZones}
                hrZones={hrZones}
                efficiency={efficiencySeries}
                weeklyZoneStack={weeklyZoneStack}
                intensityScatter={intensityScatter}
                powerSummary={powerSummary}
                cpModel={cpModel}
                runningSummary={runningSummary}
              />
            )}

            {activeTab === "health" && (
              <HealthView
                athlete={payload.athlete}
                wellness={payload.wellness}
                activities={filteredActivities}
                pmc={pmcSeries}
                hrZones={hrZones}
                daysWindow={daysWindow}
                source={payload.source}
                athleteId={creds?.athleteId || initialAthleteId}
                accessToken={creds?.accessToken}
                onWellnessSaved={handlePrimaryTopBarAction}
                onOpenMetricModal={(m) => setActiveDetailMetric(m)}
              />
            )}

            {(activeTab === "coach" || activeTab === "coach-tips" || activeTab === "ai") && (
              <CoachTipsView
                athlete={payload.athlete}
                activities={filteredActivities}
                wellness={payload.wellness}
                pmc={pmcSeries}
                hrZones={hrZones}
                powerZones={powerZones}
                weeklyVolume={weeklyVolume}
                weeklyZoneStack={weeklyZoneStack}
                efficiencySeries={efficiencySeries}
                source={payload.source}
                athleteId={creds?.athleteId || initialAthleteId}
                accessToken={creds?.accessToken}
                onPlanPushed={handlePrimaryTopBarAction}
                onOpenSettings={() => handleOpenSettings("groq")}
                onNavigateTab={(tab) => setActiveTab(tab as ActiveTab)}
                onSelectActivity={setSelectedActivity}
              />
            )}


            {activeTab === "strategy" && (
              <StrategyView
                athlete={payload.athlete}
                activities={filteredActivities}
                allActivities={payload.activities}
                runningSummary={runningSummary}
                cpModel={cpModel}
              />
            )}
          </div>
        )}
      </main>

      {/* Settings / Connection Modal when athlete is connected */}
      {showConnectModal && payload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowConnectModal(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="mb-4 font-display text-lg font-bold text-slate-900 dark:text-white">
              Ustawienia aplikacji i połączeń
            </h3>
            <ConnectPanel
              serverConfigured={serverConfigured}
              initialAthleteId={initialAthleteId}
              isSyncing={isSyncing}
              error={syncError}
              initialMode={connectModalMode}
              onSyncApi={({ athleteId, accessToken, rememberSession }) =>
                performApiSync({ athleteId, accessToken, rememberSession })
              }
              onSyncServerEnv={() =>
                performApiSync({ athleteId: initialAthleteId })
              }
              onSyncStrava={performStravaSync}
              onImportFile={(imported) => {
                setPayload(imported);
                setSyncError(null);
                setShowConnectModal(false);
              }}
              onCancel={() => setShowConnectModal(false)}
            />
          </div>
        </div>
      )}

      {/* Activity Detail Modal */}
      <ActivityDetailModal
        activity={selectedActivity}
        accessToken={creds?.accessToken}
        source={payload?.source || "api"}
        onClose={() => setSelectedActivity(null)}
        onOpenRouteInWeather={(routeId) => {
          setPendingRouteId(routeId);
          setActiveTab("weather");
        }}
      />

      {/* Metric Detail Modal (Resting HR, HRV, Weight, Steps, TSB, Readiness, ACWR) */}
      {activeDetailMetric !== null && payload && (
        <MetricDetailModal
          initialMetric={activeDetailMetric}
          pmc={pmcSeries}
          wellness={payload.wellness}
          onClose={() => setActiveDetailMetric(null)}
        />
      )}

      {/* Cloud Account & Registration Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentUser={currentUser}
        onUserChanged={(u) => {
          setCurrentUser(u);
          if (u) triggerCloudBackupAndSync(u);
        }}
        onTriggerCloudSync={() => triggerCloudBackupAndSync()}
        isCloudSyncing={isCloudSyncing}
        lastCloudSyncTime={lastCloudSyncTime}
      />

      {/* Sync Status Toast / Notification */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md animate-slideUp">
          <div
            className={`flex items-start gap-3 rounded-2xl p-4 shadow-xl border backdrop-blur-md ${
              syncToast.type === "success"
                ? "bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
                : syncToast.type === "warning"
                ? "bg-amber-50/95 dark:bg-amber-950/90 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100"
                : "bg-rose-50/95 dark:bg-rose-950/90 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100"
            }`}
          >
            {syncToast.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : syncToast.type === "warning" ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs sm:text-sm">
              <div className="font-bold">
                {syncToast.type === "success"
                  ? "Synchronizacja Strava powiodła się"
                  : syncToast.type === "warning"
                  ? "Informacja o synchronizacji Strava"
                  : "Błąd synchronizacji Strava"}
              </div>
              <p className="mt-0.5 leading-relaxed">{syncToast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setSyncToast(null)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
