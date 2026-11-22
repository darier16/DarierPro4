import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Briefcase,
  Bot,
  Calendar,
  Check,
  Clock,
  CloudSun,
  Compass,
  Copy,
  DownloadCloud,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Info,
  KeyRound,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import type { IntervalsSyncPayload } from "../types/intervals";
import { parseIntervalsExportFile } from "../utils/importer";
import {
  getStoredOpenRouterKey,
  setStoredOpenRouterKey,
  hasStoredOpenRouterKey,
  OPENROUTER_DEFAULT_MODEL,
} from "../utils/openrouter";
import {
  WEATHER_PROVIDERS,
  getStoredWeatherProvider,
  setStoredWeatherProvider,
  type WeatherProviderOption,
} from "../utils/weatherProvider";
import {
  getStoredShiftWorkConfig,
  setStoredShiftWorkConfig,
  generateShiftCalendar,
  SHIFT_METADATA,
  DEFAULT_SHIFT_WORK_PATTERN,
  type ShiftWorkConfig,
  type ShiftCode,
} from "../utils/shiftWork";

interface ConnectPanelProps {
  serverConfigured: boolean;
  initialAthleteId: string;
  isSyncing: boolean;
  error: string | null;
  onSyncApi: (opts: {
    athleteId: string;
    accessToken: string;
    rememberSession: boolean;
  }) => Promise<void>;
  onSyncServerEnv: () => Promise<void>;
  onSyncStrava: (opts: {
    accessToken: string;
    userFtp?: number;
    userWeight?: number;
    rememberSession: boolean;
    startDate?: string;
    endDate?: string;
    fetchAll?: boolean;
    syncMode?: "all" | "missing_period" | "incremental";
  }) => Promise<void>;
  onImportFile: (payload: IntervalsSyncPayload) => void;
  onCancel?: () => void;
  initialMode?: "api" | "strava" | "garmin" | "file" | "openrouter" | "groq" | "weather" | "shiftwork";
}

export const ConnectPanel: React.FC<ConnectPanelProps> = ({
  serverConfigured,
  initialAthleteId,
  isSyncing,
  error,
  onSyncApi,
  onSyncServerEnv,
  onSyncStrava,
  onImportFile,
  onCancel,
  initialMode = "api",
}) => {
  const [mode, setMode] = useState<
    "api" | "strava" | "garmin" | "file" | "openrouter" | "groq" | "weather" | "shiftwork"
  >(initialMode === "groq" ? "openrouter" : initialMode);
  const [garminEmail, setGarminEmail] = useState("");
  const [garminPassword, setGarminPassword] = useState("");
  const [garminSyncStatus, setGarminSyncStatus] = useState<string | null>(null);
  const [athleteId, setAthleteId] = useState(initialAthleteId || "0");
  const [accessToken, setAccessToken] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Weather Provider state
  const [weatherProvider, setWeatherProviderState] = useState<string>(() =>
    getStoredWeatherProvider()
  );
  const [weatherSavedToast, setWeatherSavedToast] = useState(false);

  // Shift Work state
  const [shiftConfig, setShiftConfig] = useState<ShiftWorkConfig>(() =>
    getStoredShiftWorkConfig()
  );
  const [shiftSavedToast, setShiftSavedToast] = useState(false);

  const handleSelectWeatherProvider = (id: string) => {
    setWeatherProviderState(id);
    setStoredWeatherProvider(id);
    setWeatherSavedToast(true);
    setTimeout(() => setWeatherSavedToast(false), 2500);
  };

  const handleToggleShiftWork = (enabled: boolean) => {
    const updated = { ...shiftConfig, enabled };
    setShiftConfig(updated);
    setStoredShiftWorkConfig(updated);
    setShiftSavedToast(true);
    setTimeout(() => setShiftSavedToast(false), 2500);
  };

  const handleUpdateShiftAnchorDate = (anchorDate: string) => {
    const updated = { ...shiftConfig, anchorDate };
    setShiftConfig(updated);
    setStoredShiftWorkConfig(updated);
    setShiftSavedToast(true);
    setTimeout(() => setShiftSavedToast(false), 2500);
  };

  const handleUpdateShiftAnchorIndex = (anchorShiftIndex: number) => {
    const updated = { ...shiftConfig, anchorShiftIndex };
    setShiftConfig(updated);
    setStoredShiftWorkConfig(updated);
    setShiftSavedToast(true);
    setTimeout(() => setShiftSavedToast(false), 2500);
  };

  const shiftPreview = useMemo(
    () => generateShiftCalendar(shiftConfig.anchorDate || "2026-11-18", 16, shiftConfig),
    [shiftConfig]
  );

  // OpenRouter API Key state
  const [openrouterKey, setOpenrouterKey] = useState<string>(() =>
    getStoredOpenRouterKey()
  );
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [openrouterSavedToast, setOpenrouterSavedToast] = useState(false);
  const [openrouterTesting, setOpenrouterTesting] = useState(false);
  const [openrouterTestStatus, setOpenrouterTestStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Strava specific state - restore from stored session if available
  const [stravaToken, setStravaToken] = useState(() => {
    try {
      const stored =
        localStorage.getItem("darierpro_strava_session") ||
        sessionStorage.getItem("darierpro_strava_session");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.accessToken || "";
      }
    } catch {
      // ignore
    }
    return "";
  });
  const [stravaClientId, setStravaClientId] = useState("");
  const [stravaClientSecret, setStravaClientSecret] = useState("");
  const [stravaFtp, setStravaFtp] = useState<number | "">(() => {
    try {
      const stored = localStorage.getItem("darierpro_strava_session");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.userFtp) return parsed.userFtp;
      }
    } catch {
      // ignore
    }
    return 250;
  });
  const [stravaWeight, setStravaWeight] = useState<number | "">(() => {
    try {
      const stored = localStorage.getItem("darierpro_strava_session");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.userWeight) return parsed.userWeight;
      }
    } catch {
      // ignore
    }
    return 75;
  });
  const [customStartDate, setCustomStartDate] = useState("2026-09-03");
  const [customEndDate, setCustomEndDate] = useState("2026-11-18");
  const [stravaServerConfigured, setStravaServerConfigured] = useState(false);
  const [stravaRedirectUri, setStravaRedirectUri] = useState(
    "https://ais-dev-ntqua7zs5iqcqjs6ppq2ai-727932171346.europe-west2.run.app/api/strava/callback"
  );
  const [stravaCallbackDomain, setStravaCallbackDomain] = useState(
    "ais-dev-ntqua7zs5iqcqjs6ppq2ai-727932171346.europe-west2.run.app"
  );
  const [isOpeningStravaOAuth, setIsOpeningStravaOAuth] = useState(false);
  const [stravaError, setStravaError] = useState<string | null>(null);
  const [showStravaAppConfig, setShowStravaAppConfig] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Check Strava server config status on mount
  useEffect(() => {
    let cancelled = false;
    async function checkStrava() {
      try {
        const res = await fetch("/api/strava/status");
        if (res.ok) {
          const data = (await res.json()) as {
            configured: boolean;
            clientId?: string | null;
            redirectUri: string;
            callbackDomain: string;
          };
          if (!cancelled) {
            setStravaServerConfigured(data.configured);
            if (data.clientId) setStravaClientId(data.clientId);
            if (data.redirectUri) setStravaRedirectUri(data.redirectUri);
            if (data.callbackDomain) setStravaCallbackDomain(data.callbackDomain);
          }
        }
      } catch {
        // ignore
      }
    }
    checkStrava();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyToClipboard = (text: string, fieldId: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleApiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSyncApi({
      athleteId: athleteId.trim() || "0",
      accessToken: accessToken.trim(),
      rememberSession,
    });
  };

  const handleStravaTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStravaError(null);
    if (!stravaToken.trim()) {
      setStravaError("Wprowadź token dostępu Strava (Personal Access Token).");
      return;
    }
    try {
      await onSyncStrava({
        accessToken: stravaToken.trim(),
        userFtp: stravaFtp ? Number(stravaFtp) : undefined,
        userWeight: stravaWeight ? Number(stravaWeight) : undefined,
        rememberSession,
      });
    } catch (err) {
      setStravaError(
        err instanceof Error ? err.message : "Błąd synchronizacji ze Strava."
      );
    }
  };

  const handleGarminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGarminSyncStatus(null);
    if (!garminEmail.trim()) {
      setGarminSyncStatus("Wprowadź e-mail Garmin Connect.");
      return;
    }
    try {
      setGarminSyncStatus("Łączenie z Garmin Connect i pobieranie danych...");
      const res = await fetch("/api/garmin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: garminEmail.trim(),
          password: garminPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się połączyć z Garmin Connect.");
      }
      setGarminSyncStatus(data.message || "Pomyślnie połączono z Garmin Connect!");
      setTimeout(() => {
        if (onCancel) onCancel();
      }, 1500);
    } catch (err) {
      setGarminSyncStatus(err instanceof Error ? err.message : "Błąd synchronizacji z Garmin Connect.");
    }
  };

  const handleStartStravaOAuth = async () => {
    setStravaError(null);
    setIsOpeningStravaOAuth(true);
    try {
      const params = new URLSearchParams();
      if (stravaClientId.trim()) params.set("clientId", stravaClientId.trim());
      if (stravaClientSecret.trim())
        params.set("clientSecret", stravaClientSecret.trim());

      const res = await fetch(
        `/api/strava/auth-url?${params.toString()}`
      );
      const data = (await res.json()) as {
        authUrl?: string;
        error?: string;
        redirectUri?: string;
      };

      if (!res.ok || !data.authUrl) {
        throw new Error(
          data.error ||
            "Nie udało się wygenerować adresu autoryzacji Strava. Upewnij się, że Client ID jest wpisane lub skonfigurowane w pliku .env."
        );
      }

      // Open provider URL directly in popup per oauth-integration skill
      const popup = window.open(
        data.authUrl,
        "strava_oauth",
        "width=600,height=720,status=no,resizable=yes,scrollbars=yes"
      );

      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        throw new Error(
          "Przeglądarka zablokowała wyskakujące okienko (popup). Zezwól na wyskakujące okna i spróbuj ponownie."
        );
      }

      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type === "STRAVA_AUTH_SUCCESS") {
          window.removeEventListener("message", handleMessage);
          setIsOpeningStravaOAuth(false);
          const payload = event.data.payload as { accessToken?: string };
          if (payload?.accessToken) {
            await onSyncStrava({
              accessToken: payload.accessToken,
              userFtp: stravaFtp ? Number(stravaFtp) : undefined,
              userWeight: stravaWeight ? Number(stravaWeight) : undefined,
              rememberSession,
            });
          }
        } else if (event.data?.type === "STRAVA_AUTH_ERROR") {
          window.removeEventListener("message", handleMessage);
          setIsOpeningStravaOAuth(false);
          setStravaError(
            event.data.error || "Wystąpił błąd podczas autoryzacji Strava."
          );
        }
      };

      window.addEventListener("message", handleMessage);
    } catch (err) {
      setIsOpeningStravaOAuth(false);
      setStravaError(
        err instanceof Error
          ? err.message
          : "Nie udało się uruchomić autoryzacji Strava."
      );
    }
  };

  const handleSyncMissingPeriod = async () => {
    setStravaError(null);
    const token = stravaToken.trim();
    if (!token) {
      setStravaError("Wprowadź Your Access Token lub zaloguj się przez OAuth powyżej.");
      return;
    }
    try {
      await onSyncStrava({
        accessToken: token,
        userFtp: stravaFtp ? Number(stravaFtp) : undefined,
        userWeight: stravaWeight ? Number(stravaWeight) : undefined,
        rememberSession,
        startDate: "2026-09-03",
        endDate: "2026-11-18",
        syncMode: "missing_period",
      });
    } catch (err) {
      setStravaError(
        err instanceof Error
          ? err.message
          : "Błąd podczas synchronizacji brakującego okresu ze Strava."
      );
    }
  };

  const handleSyncCustomRange = async () => {
    setStravaError(null);
    const token = stravaToken.trim();
    if (!token) {
      setStravaError("Wprowadź Your Access Token lub zaloguj się przez OAuth powyżej.");
      return;
    }
    try {
      await onSyncStrava({
        accessToken: token,
        userFtp: stravaFtp ? Number(stravaFtp) : undefined,
        userWeight: stravaWeight ? Number(stravaWeight) : undefined,
        rememberSession,
        startDate: customStartDate,
        endDate: customEndDate,
        syncMode: "missing_period",
      });
    } catch (err) {
      setStravaError(
        err instanceof Error
          ? err.message
          : "Błąd podczas synchronizacji wybranego zakresu dat."
      );
    }
  };

  const handleSyncAllWithoutLimit = async () => {
    setStravaError(null);
    const token = stravaToken.trim();
    if (!token) {
      setStravaError("Wprowadź Your Access Token lub zaloguj się przez OAuth powyżej.");
      return;
    }
    try {
      await onSyncStrava({
        accessToken: token,
        userFtp: stravaFtp ? Number(stravaFtp) : undefined,
        userWeight: stravaWeight ? Number(stravaWeight) : undefined,
        rememberSession,
        fetchAll: true,
        syncMode: "all",
      });
    } catch (err) {
      setStravaError(
        err instanceof Error
          ? err.message
          : "Błąd podczas pełnej synchronizacji ze Strava."
      );
    }
  };

  const handleSaveOpenRouterKey = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setStoredOpenRouterKey(openrouterKey);
    setOpenrouterSavedToast(true);
    setOpenrouterTestStatus(null);
    setTimeout(() => setOpenrouterSavedToast(false), 3000);
  };

  const handleClearOpenRouterKey = () => {
    setOpenrouterKey("");
    setStoredOpenRouterKey("");
    setOpenrouterTestStatus(null);
  };

  const handleTestOpenRouter = async () => {
    const keyToTest = openrouterKey.trim();
    if (!keyToTest) {
      setOpenrouterTestStatus({
        ok: false,
        message: "Wprowadź klucz OpenRouter API (sk-or-v1-...) przed wykonaniem testu.",
      });
      return;
    }
    setOpenrouterTesting(true);
    setOpenrouterTestStatus(null);
    try {
      const res = await fetch("/api/openrouter/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openrouter-api-key": keyToTest,
        },
        body: JSON.stringify({ openrouterApiKey: keyToTest }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd testu połączenia z OpenRouter.");
      }
      setOpenrouterTestStatus({
        ok: true,
        message: `Połączenie z OpenRouter API aktywne! Model ${data.model} odpowiedział pomyślnie.`,
      });
    } catch (err) {
      setOpenrouterTestStatus({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : "Nie udało się nawiązać połączenia z API OpenRouter.",
      });
    } finally {
      setOpenrouterTesting(false);
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const text = await file.text();
      const payload = parseIntervalsExportFile(file.name, text);
      onImportFile(payload);
    } catch (err) {
      setFileError(
        err instanceof Error ? err.message : "Nie udało się odczytać pliku."
      );
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 px-2.5 py-0.5 text-xs font-bold mb-2">
              <Flame className="h-3.5 w-3.5 fill-current" />
              <span>Integracja z platformami sportowymi</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Połącz konto lub zaimportuj dane
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Pobierz aktywności, wylicz automatycznie obciążenie Coggan TSS, IF, NP, strefy mocy i tętna oraz importuj trasy GPX do symulatora pogody.
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white whitespace-nowrap cursor-pointer"
            >
              Anuluj
            </button>
          )}
        </div>

        {serverConfigured && mode === "api" && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
            <span className="text-blue-900 dark:text-blue-200">
              Wykryto konfigurację serwerową Intervals.icu w zmiennych środowiskowych.
            </span>
            <button
              type="button"
              disabled={isSyncing}
              onClick={onSyncServerEnv}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              {isSyncing ? "Pobieranie..." : "Pobierz z konfiguracji serwera"}
            </button>
          </div>
        )}

        {/* Segmented mode switcher */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 rounded-xl bg-slate-100 p-1.5 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMode("api")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
              mode === "api"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span>Intervals</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("strava")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
              mode === "strava"
                ? "bg-[#fc5200] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            <span>Strava</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("garmin")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
              mode === "garmin"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-sky-300" />
            <span>Garmin</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("openrouter")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
              mode === "openrouter" || mode === "groq"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("weather")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
              mode === "weather"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <CloudSun className="h-3.5 w-3.5" />
            <span>Pogoda</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("shiftwork")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
              mode === "shiftwork"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Brygady</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
              mode === "file"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Upload className="h-3.5 w-3.5 text-indigo-500" />
            <span>Plik CSV</span>
          </button>
        </div>

        {/* ================================================================ */}
        {/* GARMIN CONNECT MODE */}
        {/* ================================================================ */}
        {mode === "garmin" && (
          <div className="mt-6 space-y-6">
            <div className="rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm shadow-md">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Garmin Connect & Garmin Edge / Forerunner / Fenix
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Importuj aktywności, tętno, HRV, sen i parametry z zegarków Garmin.
                  </p>
                </div>
              </div>

              <form onSubmit={handleGarminSubmit} className="space-y-4 mt-4">
                <div>
                  <label htmlFor="garmin-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    E-mail / Nazwa użytkownika Garmin Connect
                  </label>
                  <input
                    id="garmin-email"
                    type="text"
                    value={garminEmail}
                    onChange={(e) => setGarminEmail(e.target.value)}
                    placeholder="np. kolarz@gmail.com"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="garmin-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hasło Garmin Connect
                  </label>
                  <input
                    id="garmin-password"
                    type="password"
                    value={garminPassword}
                    onChange={(e) => setGarminPassword(e.target.value)}
                    placeholder="Wpisz hasło do konta Garmin..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                    Dane są używane wyłącznie lokalnie do autoryzacji sesji Garmin Connect API.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSyncing || !garminEmail.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white px-5 py-3 text-sm font-bold shadow-md shadow-blue-600/20 transition-all disabled:opacity-60 cursor-pointer"
                >
                  <Activity className="h-4 w-4" />
                  <span>Połącz i pobierz z Garmin Connect</span>
                </button>
              </form>

              {garminSyncStatus && (
                <div className="mt-4 p-3 rounded-lg bg-sky-100 dark:bg-sky-950/50 border border-sky-300 dark:border-sky-800 text-xs font-medium text-sky-900 dark:text-sky-200">
                  {garminSyncStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* STRAVA MODE */}
        {/* ================================================================ */}
        {mode === "strava" && (
          <div className="mt-6 space-y-6">
            {/* Athlete calibration fields */}
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <div>
                <label
                  htmlFor="strava-ftp"
                  className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Twoje FTP (Waty)
                </label>
                <input
                  id="strava-ftp"
                  type="number"
                  min="50"
                  max="600"
                  value={stravaFtp}
                  onChange={(e) =>
                    setStravaFtp(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="np. 250"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                />
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Do wyliczenia TSS, IF i stref Coggana
                </span>
              </div>
              <div>
                <label
                  htmlFor="strava-weight"
                  className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Waga kolarza (kg)
                </label>
                <input
                  id="strava-weight"
                  type="number"
                  min="35"
                  max="200"
                  value={stravaWeight}
                  onChange={(e) =>
                    setStravaWeight(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="np. 75"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                />
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Do wskaźników W/kg i symulacji wiatru
                </span>
              </div>
            </div>

            {/* Sposób 1: 1-Click Popup OAuth 2.0 */}
            <div className="rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50/50 dark:bg-orange-950/20 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fc5200] text-white font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      1-kliknięcie: Logowanie OAuth 2.0
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Otwiera oficjalne okno autoryzacji Strava w wyskakującym oknie popup.
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Oficjalne OAuth
                </span>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  disabled={isSyncing || isOpeningStravaOAuth}
                  onClick={handleStartStravaOAuth}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#fc5200] hover:bg-[#e04900] active:scale-[0.99] text-white px-5 py-3 text-sm font-bold shadow-md shadow-orange-600/20 transition-all disabled:opacity-60 cursor-pointer"
                >
                  <Flame className="h-4 w-4 fill-current" />
                  <span>
                    {isOpeningStravaOAuth
                      ? "Oczekiwanie na autoryzację w oknie Strava..."
                      : isSyncing
                      ? "Pobieranie treningów..."
                      : "Zaloguj przez Strava (OAuth Popup)"}
                  </span>
                </button>
              </div>

              {/* Toggle manual App configuration details */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowStravaAppConfig(!showStravaAppConfig)}
                  className="text-xs font-semibold text-orange-700 dark:text-orange-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>
                    {showStravaAppConfig
                      ? "Ukryj konfigurację aplikacji Strava API"
                      : "Konfiguracja własnej aplikacji Strava API (Client ID / Callback)"}
                  </span>
                </button>

                {showStravaAppConfig && (
                  <div className="mt-3 space-y-3 rounded-lg border border-orange-200 dark:border-orange-900/50 bg-white dark:bg-slate-900 p-4 text-xs">
                    <p className="text-slate-600 dark:text-slate-300">
                      Aby autoryzować przez OAuth, zarejestruj aplikację na stronie{" "}
                      <a
                        href="https://www.strava.com/settings/api"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-orange-600 hover:underline inline-flex items-center gap-0.5"
                      >
                        strava.com/settings/api
                        <ExternalLink className="h-3 w-3" />
                      </a>{" "}
                      i podaj poniższe parametry:
                    </p>

                    <div className="space-y-2 font-mono text-[11px]">
                      <div>
                        <div className="text-[10px] font-sans font-bold uppercase text-slate-500">
                          Application Name:
                        </div>
                        <div className="text-slate-800 dark:text-slate-200 font-semibold">
                          DarierPro Cycling Analytics
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[10px] font-sans font-bold uppercase text-slate-500">
                          <span>Authorization Callback Domain:</span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(stravaCallbackDomain, "domain")
                            }
                            className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 font-sans cursor-pointer"
                          >
                            {copiedField === "domain" ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>{copiedField === "domain" ? "Skopiowano" : "Kopiuj"}</span>
                          </button>
                        </div>
                        <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white break-all select-all">
                          {stravaCallbackDomain}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[10px] font-sans font-bold uppercase text-slate-500">
                          <span>Pełny Callback URL:</span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(stravaRedirectUri, "url")
                            }
                            className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 font-sans cursor-pointer"
                          >
                            {copiedField === "url" ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>{copiedField === "url" ? "Skopiowano" : "Kopiuj"}</span>
                          </button>
                        </div>
                        <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white break-all select-all">
                          {stravaRedirectUri}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor="strava-cid"
                          className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          Client ID (ze Strava API)
                        </label>
                        <input
                          id="strava-cid"
                          type="text"
                          value={stravaClientId}
                          onChange={(e) => setStravaClientId(e.target.value)}
                          placeholder="np. 123456"
                          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="strava-csec"
                          className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          Client Secret
                        </label>
                        <input
                          id="strava-csec"
                          type="password"
                          value={stravaClientSecret}
                          onChange={(e) => setStravaClientSecret(e.target.value)}
                          placeholder="Wklej Client Secret..."
                          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sposób 2: Direct Personal Access Token */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Błyskawiczne: Osobisty Access Token (bez rejestracji aplikacji)
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Wystarczy skopiować gotowy token z zakładki dewelopera Strava.
                  </p>
                </div>
              </div>

              <form onSubmit={handleStravaTokenSubmit} className="mt-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>
                    Skopiuj wartość pola{" "}
                    <strong className="text-slate-800 dark:text-slate-200">
                      Your Access Token
                    </strong>{" "}
                    ze strony{" "}
                    <a
                      href="https://www.strava.com/settings/api"
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-600 hover:underline inline-flex items-center gap-0.5 font-medium"
                    >
                      strava.com/settings/api
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={stravaToken}
                    onChange={(e) => setStravaToken(e.target.value)}
                    placeholder="Wklej Your Access Token ze Strava..."
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="submit"
                    disabled={isSyncing || !stravaToken.trim()}
                    className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-xs font-bold hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {isSyncing ? "Pobieranie..." : "Synchronizuj ze Strava"}
                  </button>
                </div>
              </form>
            </div>

            {/* Sposób 3: Dedykowana naprawa i pobieranie brakującego okresu ze Strava */}
            <div className="rounded-2xl border-2 border-orange-500/50 bg-gradient-to-br from-orange-50/80 via-amber-50/50 to-white dark:from-orange-950/40 dark:via-amber-950/20 dark:to-slate-900 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white font-bold text-xs">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Pobieranie brakującego okresu (03.09.2026 – 18.11.2026)
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Pobiera wszystkie strony wyników bez limitu 100/200, zapobiega duplikatom i zachowuje wszystkie dotychczasowe dane.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {/* 1-Click Button for Missing Period */}
                <button
                  type="button"
                  disabled={isSyncing || !stravaToken.trim()}
                  onClick={handleSyncMissingPeriod}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white px-4 py-3 text-xs sm:text-sm font-bold shadow-md shadow-orange-600/25 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <DownloadCloud className="h-4 w-4" />
                  <span>
                    {isSyncing
                      ? "Pobieranie aktywności..."
                      : "Pobierz brakujący okres: 03.09.2026 – 18.11.2026"}
                  </span>
                </button>

                {/* Custom Date Range */}
                <div className="rounded-xl border border-orange-200 dark:border-orange-900/40 bg-white/90 dark:bg-slate-950/60 p-3">
                  <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                    <span>Własny zakres dat (dowolny okres):</span>
                    <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">
                      Pobiera wszystkie strony wyników
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label htmlFor="custom-start-date" className="block text-[10px] text-slate-500 mb-0.5">Od</label>
                      <input
                        id="custom-start-date"
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="custom-end-date" className="block text-[10px] text-slate-500 mb-0.5">Do</label>
                      <input
                        id="custom-end-date"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        disabled={isSyncing || !stravaToken.trim()}
                        onClick={handleSyncCustomRange}
                        className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-3 py-2 text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        Pobierz ten zakres
                      </button>
                    </div>
                  </div>
                </div>

                {/* Full Unbounded Sync Button */}
                <button
                  type="button"
                  disabled={isSyncing || !stravaToken.trim()}
                  onClick={handleSyncAllWithoutLimit}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Pełna synchronizacja (Wszystkie strony bez limitu liczby treningów)</span>
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(e) => setRememberSession(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-600"
              />
              <span>Zapamiętaj sesję Strava w tej przeglądarce</span>
            </label>

            {(error || stravaError) && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{stravaError || error}</span>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* INTERVALS.ICU MODE */}
        {/* ================================================================ */}
        {mode === "api" && (
          <form onSubmit={handleApiSubmit} className="mt-6 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <div className="font-semibold text-slate-900 dark:text-slate-200">
                Skąd pobrać dane połączenia w Intervals.icu:
              </div>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                <li>
                  Zaloguj się na{" "}
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    intervals.icu
                  </span>{" "}
                  i przejdź do{" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Settings → Developer Settings
                  </span>
                  .
                </li>
                <li>
                  Skopiuj swój osobisty token dostępu (Personal Token) oraz opcjonalnie Athlete ID (np.{" "}
                  <span className="font-mono">i12345</span> lub zostaw{" "}
                  <span className="font-mono">0</span> dla własnego konta).
                </li>
                <li>
                  Połączenie realizowane jest przez serwerowe proxy aplikacji wyłącznie w celu pobrania Twoich treningów.
                </li>
              </ol>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="athlete-id"
                  className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Athlete ID
                </label>
                <input
                  id="athlete-id"
                  type="text"
                  value={athleteId}
                  onChange={(e) => setAthleteId(e.target.value)}
                  placeholder="0 lub i12345"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="intervals-token"
                  className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Token dostępu Intervals.icu (Developer Settings)
                </label>
                <input
                  id="intervals-token"
                  type="password"
                  required
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="Wklej token z Developer Settings..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(e) => setRememberSession(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>Zapamiętaj w tej sesji przeglądarki do szybkiego odświeżania</span>
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSyncing || !accessToken.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              {isSyncing ? "Pobieranie aktywności z Intervals.icu..." : "Pobierz aktywności i analizuj"}
            </button>
          </form>
        )}

        {/* ================================================================ */}
        {/* FILE IMPORT MODE */}
        {/* ================================================================ */}
        {mode === "file" && (
          <div className="mt-6 space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileChange(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition-colors hover:border-blue-500 hover:bg-slate-100/70 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-blue-500 dark:hover:bg-slate-900"
            >
              <Upload className="h-7 w-7 text-slate-400" aria-hidden="true" />
              <div className="mt-3 text-sm font-medium text-slate-900 dark:text-white">
                Upuść plik activities.csv lub .json z Intervals.icu / Strava
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                W Intervals.icu: Activities → List → Download CSV
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
            </div>

            {fileError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{fileError}</span>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* OPENROUTER AI MODE */}
        {/* ================================================================ */}
        {(mode === "openrouter" || mode === "groq") && (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/60 dark:bg-purple-950/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white font-bold text-xs shadow-xs">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      OpenRouter API ({OPENROUTER_DEFAULT_MODEL})
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Błyskawiczna analiza treningów, ocena tętna i mocy oraz czat Trenera AI.
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                  <Sparkles className="h-3 w-3" />
                  Free Tier
                </span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Wszystkie funkcje Analizy AI oraz Trenera AI korzystają ze standardowego formatu OpenAI
                (endpoint <code className="rounded bg-purple-100 dark:bg-purple-900/60 px-1 py-0.5 font-mono text-[11px] text-purple-800 dark:text-purple-200">https://openrouter.ai</code> z nagłówkiem <code className="rounded bg-purple-100 dark:bg-purple-900/60 px-1 py-0.5 font-mono text-[11px] text-purple-800 dark:text-purple-200">Authorization: Bearer</code>)
                oraz bezpłatnego modelu <strong className="font-semibold text-slate-900 dark:text-white">openrouter/free</strong>.
              </p>
            </div>

            {/* API Key Form */}
            <form onSubmit={handleSaveOpenRouterKey} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="openrouter-api-key"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Twój OpenRouter API Key (sk-or-v1-...)
                  </label>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:underline cursor-pointer"
                  >
                    <span>Pobierz darmowy klucz na OpenRouter</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    id="openrouter-api-key"
                    type={showOpenRouterKey ? "text" : "password"}
                    value={openrouterKey}
                    onChange={(e) => setOpenrouterKey(e.target.value)}
                    placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-3.5 pr-20 py-2.5 font-mono text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                      aria-label={showOpenRouterKey ? "Ukryj klucz" : "Pokaż klucz"}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      {showOpenRouterKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    {openrouterKey && (
                      <button
                        type="button"
                        onClick={handleClearOpenRouterKey}
                        aria-label="Wyczyść wpisany klucz"
                        className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>
                    Klucz jest bezpiecznie przechowywany w lokalnej pamięci Twojej przeglądarki (<code className="font-mono">localStorage</code>).
                  </span>
                  {hasStoredOpenRouterKey() ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3 w-3" />
                      Klucz zapisany
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      Brak zapisanego klucza
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                >
                  {openrouterSavedToast ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Zapisano w przeglądarce!</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Zapisz klucz w przeglądarce</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={openrouterTesting || !openrouterKey.trim()}
                  onClick={handleTestOpenRouter}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${openrouterTesting ? "animate-spin text-purple-600" : ""}`}
                  />
                  <span>
                    {openrouterTesting ? "Testowanie połączenia..." : "Przetestuj połączenie z OpenRouter"}
                  </span>
                </button>
              </div>

              {/* Status Message */}
              {openrouterTestStatus && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs ${
                    openrouterTestStatus.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                  }`}
                >
                  {openrouterTestStatus.ok ? (
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  )}
                  <span>{openrouterTestStatus.message}</span>
                </div>
              )}

              {/* OpenRouter guide */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50 p-3.5 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-purple-600" />
                  <span>Jak uzyskać darmowy klucz OpenRouter API:</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-[11px] leading-relaxed">
                  <li>
                    Otwórz{" "}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      openrouter.ai/keys
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    .
                  </li>
                  <li>Zaloguj się kontem Google lub GitHub (dostępne są bezpłatne modele :free).</li>
                  <li>Kliknij <strong className="font-semibold text-slate-800 dark:text-slate-200">"Create Key"</strong> i nazwij go np. <em>DarierPro</em>.</li>
                  <li>Skopiuj wygenerowany klucz zaczynający się od <code className="font-mono text-purple-700 dark:text-purple-300">sk-or-v1-...</code> i wklej powyżej.</li>
                </ol>
              </div>
            </form>
          </div>
        )}

        {/* ================================================================ */}
        {/* WEATHER PROVIDER MODE (5 models) */}
        {/* ================================================================ */}
        {mode === "weather" && (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-sky-200 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30 p-4">
              <div className="flex items-start gap-3">
                <CloudSun className="h-5 w-5 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-sky-950 dark:text-sky-100">
                    Wybór numerycznego modelu pogody
                  </h4>
                  <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
                    Niektóre modele globalne (np. amerykański GFS) wykazują tendencję do przekłamywania lokalnych opadów i wiatru w Polsce. Wybierz model o najwyższej sprawdzalności dla Twojego regionu jazdy.
                  </p>
                </div>
              </div>
            </div>

            {weatherSavedToast && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 animate-in fade-in">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Zapisano dostawcę pogody. Prognoza w symulatorze i planie została zaktualizowana!</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Dostępne modele prognostyczne (5 wariantów)</span>
                <span className="text-[11px] font-normal text-slate-500">
                  Wybrany: <strong className="font-semibold text-sky-600 dark:text-sky-400">{weatherProvider}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {WEATHER_PROVIDERS.map((provider) => {
                  const isSelected = weatherProvider === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => handleSelectWeatherProvider(provider.id)}
                      className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
                        isSelected
                          ? "border-sky-500 bg-sky-50/70 dark:border-sky-500/80 dark:bg-sky-950/40 ring-2 ring-sky-500/20"
                          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                              {provider.name}
                            </span>
                            {provider.recommendedForPoland && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                                <Sparkles className="h-3 w-3" />
                                Rekomendowany dla Polski
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {provider.country}
                            </span>
                            <span>•</span>
                            <span className="font-mono text-slate-600 dark:text-slate-400">
                              {provider.resolution}
                            </span>
                          </div>

                          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {provider.description}
                          </p>
                        </div>

                        <div className="shrink-0 mt-0.5">
                          <div
                            className={`h-5 w-5 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected
                                ? "border-sky-600 bg-sky-600 text-white"
                                : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 p-3.5 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-sky-500" />
                Dlaczego pogoda przekłamywała?
              </span>
              <p className="text-[11px] leading-relaxed">
                Standardowe modele globalne (np. GFS 22 km) uśredniają warunki na zbyt dużym obszarze, gubiąc mikroklimaty dolin, lasów i lokalne komórki opadowe. Model <strong className="text-slate-800 dark:text-slate-200">DWD ICON-EU (7 km)</strong> oblicza równania termodynamiczne z precyzją dopasowaną do ukształtowania terenu w Europie Środkowej.
              </p>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SHIFT WORK MODE (3333ww2222w1111w) */}
        {/* ================================================================ */}
        {mode === "shiftwork" && (
          <div className="mt-6 space-y-6">
            {/* Header info */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-900/60 dark:bg-indigo-950/30 p-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                    System 4-brygadowy (3333ww2222w1111w)
                  </h4>
                  <p className="text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
                    Praca zmianowa ma kluczowe znaczenie dla regeneracji: zaburza rytm dobowy, zmienia poziom kortyzolu i wahania HRV. DarierPro synchronizuje Twój grafik z Trenerem AI i planem treningowym.
                  </p>
                </div>
              </div>
            </div>

            {shiftSavedToast && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 animate-in fade-in">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Zapisano konfigurację zmian. Trener AI uwzględnia Twój cykl!</span>
              </div>
            )}

            {/* Toggle Enabled */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div>
                <div className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Uwzględniaj system 4-brygadowy
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Pokazuj badge zmian w kalendarzu, optymalne okna treningowe oraz chroń przed przetrenowaniem po nockach
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={shiftConfig.enabled}
                  onChange={(e) => handleToggleShiftWork(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Anchor Date & Shift selection */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
              <h5 className="font-display text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Kalibracja cyklu (Punkt odniesienia)
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Data początkowa / odniesienia
                  </label>
                  <input
                    type="date"
                    value={shiftConfig.anchorDate}
                    onChange={(e) => handleUpdateShiftAnchorDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">
                    Wybierz dowolny znany dzień i wskaż poniżej, która to była zmiana
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Zmiana w tym dniu (w cyklu 16-dniowym)
                  </label>
                  <select
                    value={shiftConfig.anchorShiftIndex}
                    onChange={(e) => handleUpdateShiftAnchorIndex(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={0}>Dzień 1: III zmiana (1. Nocka 22-06)</option>
                    <option value={1}>Dzień 2: III zmiana (2. Nocka 22-06)</option>
                    <option value={2}>Dzień 3: III zmiana (3. Nocka 22-06)</option>
                    <option value={3}>Dzień 4: III zmiana (4. Nocka 22-06)</option>
                    <option value={4}>Dzień 5: Wolne po nockach (1/2)</option>
                    <option value={5}>Dzień 6: Wolne po nockach (2/2)</option>
                    <option value={6}>Dzień 7: II zmiana (1. Popołudniówka 14-22)</option>
                    <option value={7}>Dzień 8: II zmiana (2. Popołudniówka 14-22)</option>
                    <option value={8}>Dzień 9: II zmiana (3. Popołudniówka 14-22)</option>
                    <option value={9}>Dzień 10: II zmiana (4. Popołudniówka 14-22)</option>
                    <option value={10}>Dzień 11: Wolne po popołudniówkach</option>
                    <option value={11}>Dzień 12: I zmiana (1. Rano 06-14)</option>
                    <option value={12}>Dzień 13: I zmiana (2. Rano 06-14)</option>
                    <option value={13}>Dzień 14: I zmiana (3. Rano 06-14)</option>
                    <option value={14}>Dzień 15: I zmiana (4. Rano 06-14)</option>
                    <option value={15}>Dzień 16: Wolne po rankach</option>
                  </select>
                  <span className="text-[10px] text-slate-400">
                    Cykl powtarza się w pętli 16-dniowej
                  </span>
                </div>
              </div>

              {/* Visual 16-day timeline preview */}
              <div className="pt-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Podgląd 16-dniowego cyklu zmian od wybranej daty:
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {shiftPreview.slice(0, 16).map((shift, idx) => (
                    <div
                      key={shift.dateStr + idx}
                      className={`rounded-lg border p-2 text-center transition-transform hover:scale-105 ${shift.badgeBg} ${shift.borderColor}`}
                    >
                      <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        {shift.dateStr.slice(8, 10)}.{shift.dateStr.slice(5, 7)}
                      </div>
                      <div className={`font-display text-xs font-black ${shift.textColor}`}>
                        {shift.code === "3" && "🌙 Noc"}
                        {shift.code === "2" && "☀️ Popoł."}
                        {shift.code === "1" && "🌅 Rano"}
                        {shift.code === "w" && "🌴 Wolne"}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                        {shift.dayInBlock}/{shift.totalInBlock}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Physiological rules for each shift */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <h5 className="font-display text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-indigo-500" />
                Zasady fizjologiczne Trenera AI dla 4-brygadówki
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 p-3 space-y-1">
                  <div className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1">
                    <Moon className="h-3.5 w-3.5" />
                    III Zmiana (Noc 22:00 – 06:00)
                  </div>
                  <p className="text-[11px] text-purple-800 dark:text-purple-200 leading-relaxed">
                    <strong>Tylko Z1/Z2 lub odpoczynek.</strong> Po nockach układ współczulny jest przeciążony, a HRV spada. Trener AI zablokuje interwały VO2max, aby chronić serce i układ nerwowy.
                  </p>
                </div>

                <div className="rounded-lg border border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 p-3 space-y-1">
                  <div className="font-bold text-sky-900 dark:text-sky-300 flex items-center gap-1">
                    <Sun className="h-3.5 w-3.5" />
                    II Zmiana (Popołudnie 14:00 – 22:00)
                  </div>
                  <p className="text-[11px] text-sky-800 dark:text-sky-200 leading-relaxed">
                    <strong>Najlepsze okno poranne (08:30–12:00).</strong> Po nocy organizm jest wypoczęty i nasycony glikogenem. Idealny dzień na Sweet Spot, próg i interwały jakościowe przed pracą!
                  </p>
                </div>

                <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1">
                  <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    I Zmiana (Rano 06:00 – 14:00)
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                    <strong>Okno po pracy (16:00–19:00).</strong> Pobudka o 4:30 wymaga 20-30 min drzemki po powrocie z pracy przed wejściem na rower. Trening bazy tlenowej i kadencji.
                  </p>
                </div>

                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1">
                  <div className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1">
                    <Compass className="h-3.5 w-3.5" />
                    Dni Wolne (w)
                  </div>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
                    <strong>Long Ride & akcenty.</strong> Pierwszy dzień po nockach przeznacz na odsypianie. Drugi dzień wolny lub dni wolne po rankach/popołudniówkach to idealne okna na długie jazdy 3-5h.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
