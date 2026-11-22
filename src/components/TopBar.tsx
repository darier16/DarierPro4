import React from "react";
import {
  Activity,
  Brain,
  CalendarDays,
  CloudSun,
  Compass,
  HeartPulse,
  LayoutDashboard,
  Moon,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  Zap,
  Wrench,
  Cloud,
  User as UserIcon,
} from "lucide-react";
import type { SportFilter } from "../utils/analytics";

export type ActiveTab =
  | "overview"
  | "coach"
  | "plan"
  | "weather"
  | "activities"
  | "zones"
  | "health"
  | "gear"
  | "strategy"
  | "ai"
  | "coach-tips";

export interface TabItem {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  activeClass: string;
  badgeClass: string;
}

export const TABS: TabItem[] = [
  {
    id: "overview",
    label: "Przegląd",
    icon: LayoutDashboard,
    accentColor: "sky",
    activeClass:
      "text-sky-600 dark:text-sky-400 border-b-2 border-sky-500 bg-sky-50/50 dark:bg-sky-950/20",
    badgeClass: "bg-sky-500",
  },
  {
    id: "coach",
    label: "Trener",
    icon: Brain,
    accentColor: "purple",
    activeClass:
      "text-purple-600 dark:text-purple-400 border-b-2 border-purple-500 bg-purple-50/50 dark:bg-purple-950/20",
    badgeClass: "bg-purple-500",
  },
  {
    id: "plan",
    label: "Plan i Kalendarz",
    icon: CalendarDays,
    accentColor: "cyan",
    activeClass:
      "text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20",
    badgeClass: "bg-cyan-500",
  },
  {
    id: "weather",
    label: "Pogoda i Trasy",
    icon: CloudSun,
    accentColor: "sky",
    activeClass:
      "text-sky-600 dark:text-sky-400 border-b-2 border-sky-500 bg-sky-50/50 dark:bg-sky-950/20",
    badgeClass: "bg-sky-500",
  },
  {
    id: "activities",
    label: "Aktywności",
    icon: Activity,
    accentColor: "indigo",
    activeClass:
      "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20",
    badgeClass: "bg-indigo-500",
  },
  {
    id: "zones",
    label: "Strefy i Wydolność",
    icon: Zap,
    accentColor: "amber",
    activeClass:
      "text-amber-600 dark:text-amber-400 border-b-2 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
    badgeClass: "bg-amber-500",
  },
  {
    id: "health",
    label: "Zdrowie",
    icon: HeartPulse,
    accentColor: "emerald",
    activeClass:
      "text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
    badgeClass: "bg-emerald-500",
  },
  {
    id: "gear",
    label: "Zużycie i Komponenty",
    icon: Wrench,
    accentColor: "amber",
    activeClass:
      "text-amber-600 dark:text-amber-400 border-b-2 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
    badgeClass: "bg-amber-500",
  },
  {
    id: "strategy",
    label: "Strategia Wyścigu",
    icon: Compass,
    accentColor: "rose",
    activeClass:
      "text-rose-600 dark:text-rose-400 border-b-2 border-rose-500 bg-rose-50/50 dark:bg-rose-950/20",
    badgeClass: "bg-rose-500",
  },
];

interface TopBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isConnected: boolean;
  athleteName?: string;
  athleteId?: string;
  source?: string;
  isSyncing: boolean;
  onPrimaryAction: () => void;
  onOpenSettings: () => void;
  currentUser?: { email?: string | null; displayName?: string | null } | null;
  onOpenAuth: () => void;
  isCloudSyncing?: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  sportFilter: SportFilter;
  onSportFilterChange: (sport: SportFilter) => void;
  daysWindow: number;
  onDaysWindowChange: (days: number) => void;
  criticalGearCount?: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onTabChange,
  isConnected,
  athleteName,
  athleteId,
  source,
  isSyncing,
  onPrimaryAction,
  onOpenSettings,
  currentUser,
  onOpenAuth,
  isCloudSyncing,
  darkMode,
  onToggleDarkMode,
  sportFilter,
  onSportFilterChange,
  daysWindow,
  onDaysWindowChange,
  criticalGearCount,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95 transition-colors">
      {/* Upper Main Header Bar */}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand Logo & Athlete */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onTabChange("overview")}
            className="flex items-center gap-1.5 text-left focus:outline-none"
          >
            <span className="font-display text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Darier<span className="text-rose-600">Pro</span>
            </span>
          </button>

          {isConnected && athleteName && (
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-800">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  source === "strava"
                    ? "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400"
                    : "bg-slate-100 dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                    source === "strava" ? "bg-[#fc5200]" : "bg-emerald-500"
                  }`}
                />
                {source === "strava" ? `Strava: ${athleteName}` : athleteName}
              </span>
            </div>
          )}
        </div>

        {/* Action Controls & Sync */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* PDF Report / Print Button */}
          <button
            type="button"
            onClick={() => window.print()}
            title="Generuj Raport PDF / Drukuj"
            className="hidden sm:flex h-10 px-3 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-bold"
          >
            <span>Raport PDF</span>
          </button>

          {/* User Account / Cloud Sync Badge */}
          {currentUser ? (
            <button
              type="button"
              onClick={onOpenAuth}
              title={`Zalogowano: ${currentUser.email || "Konto w chmurze"}`}
              className="flex h-10 items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/40 px-3 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors text-xs font-bold"
            >
              <div className="relative">
                <UserIcon className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ${isCloudSyncing ? "bg-amber-400 animate-ping" : "bg-emerald-500"}`} />
              </div>
              <span className="hidden md:inline max-w-[120px] truncate">
                {currentUser.email ? currentUser.email.split("@")[0] : "Konto"}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              title="Zarejestruj konto przez e-mail lub zaloguj się"
              className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 transition-colors text-xs font-bold"
            >
              <UserIcon className="h-4 w-4 text-slate-500" />
              <span className="hidden sm:inline">Konto / Rejestracja</span>
            </button>
          )}

          {/* Settings / Account modal button */}
          <button
            type="button"
            onClick={onOpenSettings}
            title={isConnected ? `ID: ${athleteId || "Połączono"} (Ustawienia)` : "Połącz konto Intervals"}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* Sync Button (Crimson / Rose from Screenshot) */}
          <button
            type="button"
            disabled={isSyncing}
            onClick={onPrimaryAction}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white px-4 py-2.5 text-xs sm:text-sm font-bold shadow-md shadow-rose-600/25 transition-all disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span className="font-bold">
              {isSyncing ? "Sync..." : "Synchronizuj"}
            </span>
          </button>
        </div>
      </div>

      {/* Tabs Row with distinct per-tab colors and horizontal scrolling */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/60">
        <div className="mx-auto max-w-7xl px-3 sm:px-6">
          <nav
            className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-1"
            aria-label="Główne zakładki"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                tab.id === "coach"
                  ? activeTab === "coach" || activeTab === "coach-tips" || activeTab === "ai"
                  : activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`group relative flex items-center gap-2 shrink-0 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition-all ${
                    isActive
                      ? tab.activeClass
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border-b-2 border-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 transition-transform group-hover:scale-110 ${
                      isActive ? "" : "text-slate-400 dark:text-slate-500"
                    }`}
                  />
                  <span>{tab.label}</span>
                  {tab.id === "gear" && typeof criticalGearCount === "number" && criticalGearCount > 0 && (
                    <span
                      title={`${criticalGearCount} komponentów wymaga pilnej uwagi (>90% zużycia)`}
                      className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-black h-4 min-w-4 px-1 shadow-xs animate-pulse"
                    >
                      {criticalGearCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Sub-bar: Dark Mode toggle & Quick Filters */}
      <div className="border-t border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
          {/* Left: Dark Mode Toggle button (as in screenshot) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleDarkMode}
              title={darkMode ? "Włącz jasny motyw" : "Włącz ciemny motyw"}
              aria-label="Przełącz motyw"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              {darkMode ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-700" />
              )}
            </button>

            {/* Sport Filter: Focus on Cycling as requested */}
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => onSportFilterChange("cycling")}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  sportFilter === "cycling"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                🚴 Kolarstwo
              </button>
              <button
                type="button"
                onClick={() => onSportFilterChange("all")}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  sportFilter === "all"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Wszystkie
              </button>
              <button
                type="button"
                onClick={() => onSportFilterChange("running")}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  sportFilter === "running"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                🏃 Bieg
              </button>
            </div>
          </div>

          {/* Right: Days Window Range Selector */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            {[30, 90, 180, 365].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => onDaysWindowChange(days)}
                className={`rounded-lg px-2 py-1 transition-colors ${
                  daysWindow === days
                    ? "bg-white font-bold text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                    : "hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {days === 365 ? "Rok" : `${days}d`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};
