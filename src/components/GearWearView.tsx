import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bike,
  Calculator,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Copy,
  DollarSign,
  Droplets,
  Edit2,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  HelpCircle,
  History,
  Info,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Share2,
  ShieldAlert,
  ShoppingCart,
  Sliders,
  Sparkles,
  Tag,
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";
import type { IntervalsActivity } from "../types/intervals";
import type { CloudGearComponent, CloudServiceRecord } from "../utils/firebase";

export interface BikeProfile {
  id: string;
  name: string;
  type: "road" | "gravel" | "mtb" | "trainer" | "all_bikes" | "run";
  defaultBrand?: string;
}

export interface TrackedComponent {
  id: string;
  bikeId: string;
  bikeName: string;
  name: string;
  category:
    | "chain"
    | "tire_front"
    | "tire_rear"
    | "brake_pads_front"
    | "brake_pads_rear"
    | "cassette"
    | "bottom_bracket"
    | "sealant"
    | "suspension_fork"
    | "suspension_shock"
    | "cables"
    | "battery"
    | "shoes"
    | "other";
  trackingType: "distance_km" | "hours" | "days";
  maxValue: number;
  baseValue: number; // manual offset at install
  installedAt: string; // YYYY-MM-DD
  lastServicedAt?: string;
  lastLubeDate?: string;
  lastLubeKm?: number;
  brandModel?: string;
  notes?: string;
}

export interface ServiceLogEntry {
  id: string;
  componentId?: string;
  componentName: string;
  bikeName: string;
  serviceDate: string;
  serviceType: "wymiana" | "serwis" | "dolewka" | "regulacja" | "smarowanie" | "inna";
  mileageAtService?: number;
  costPln?: number;
  notes?: string;
  createdAt: string;
}

const DEFAULT_BIKES: BikeProfile[] = [
  { id: "b1", name: "Canyon Aeroad CFR (Szosowy)", type: "road", defaultBrand: "Canyon" },
  { id: "b2", name: "Trek Supercaliber (MTB / XC)", type: "mtb", defaultBrand: "Trek" },
  { id: "b3", name: "Specialized Diverge (Gravel)", type: "gravel", defaultBrand: "Specialized" },
  { id: "b4", name: "Wahoo Kickr / Trenażer", type: "trainer", defaultBrand: "Indoor" },
];

function localTodayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function daysElapsed(sinceIso: string): number {
  const start = new Date(`${sinceIso}T00:00:00`).getTime();
  const now = new Date().getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
}

function matchesActivityToBike(act: IntervalsActivity, bikeType: BikeProfile["type"]): boolean {
  const t = (act.type || "").toLowerCase();
  const name = (act.name || "").toLowerCase();
  const isRun = t.includes("run") || t.includes("walk") || t.includes("hike");
  const isBike =
    t.includes("ride") ||
    t.includes("cycling") ||
    t.includes("virtualride") ||
    t.includes("gravel") ||
    t.includes("mountainbike") ||
    t.includes("mtb");

  if (bikeType === "run") return isRun;
  if (!isBike) return false;
  if (bikeType === "all_bikes") return true;
  if (bikeType === "trainer") {
    return Boolean(act.trainer) || t.includes("virtual");
  }
  if (bikeType === "gravel") {
    return t.includes("gravel") || name.includes("gravel") || name.includes("szutr");
  }
  if (bikeType === "mtb") {
    return (
      t.includes("mountain") ||
      t.includes("mtb") ||
      name.includes("mtb") ||
      name.includes("xc") ||
      name.includes("trail")
    );
  }
  // Road
  const isOffroad =
    t.includes("gravel") ||
    t.includes("mountain") ||
    t.includes("mtb") ||
    name.includes("gravel") ||
    name.includes("mtb");
  return !isOffroad;
}

const PRESET_TEMPLATES = [
  {
    name: "Łańcuch szosowy",
    category: "chain" as const,
    trackingType: "distance_km" as const,
    maxValue: 3000,
    hint: "Zalecana wymiana przy wyciągnięciu 0.5% (ok. 2500 - 3500 km)",
    icon: "⛓️",
  },
  {
    name: "Łańcuch MTB / Gravel",
    category: "chain" as const,
    trackingType: "distance_km" as const,
    maxValue: 2000,
    hint: "Błoto i piasek przyspieszają zużycie łańcucha (1500 - 2500 km)",
    icon: "⛓️",
  },
  {
    name: "Opony szosowe (Continental GP5000 / Schwalbe)",
    category: "tire_rear" as const,
    trackingType: "distance_km" as const,
    maxValue: 4500,
    hint: "Tylna opona zużywa się ok. 2x szybciej niż przednia",
    icon: "🛞",
  },
  {
    name: "Opony gravel / MTB",
    category: "tire_rear" as const,
    trackingType: "distance_km" as const,
    maxValue: 3500,
    hint: "Kontroluj bieżnik i stan klocków bocznych",
    icon: "🛞",
  },
  {
    name: "Klocki hamulcowe szosa",
    category: "brake_pads_front" as const,
    trackingType: "distance_km" as const,
    maxValue: 5000,
    hint: "Regularna inspekcja grubości okładziny (< 1.5mm do wymiany)",
    icon: "🛑",
  },
  {
    name: "Klocki hamulcowe MTB (metaliczne / żywiczne)",
    category: "brake_pads_front" as const,
    trackingType: "distance_km" as const,
    maxValue: 2000,
    hint: "Mokre warunki i zjazdy drastycznie skracają żywotność",
    icon: "🛑",
  },
  {
    name: "Kaseta zębatek (11s / 12s)",
    category: "cassette" as const,
    trackingType: "distance_km" as const,
    maxValue: 9000,
    hint: "Wytrzymuje zazwyczaj 3 regularnie zmieniane łańcuchy",
    icon: "⚙️",
  },
  {
    name: "Płyn uszczelniający Tubeless (Mleko)",
    category: "sealant" as const,
    trackingType: "days" as const,
    maxValue: 90,
    hint: "Mleko wysycha w oponie po 2-3 miesiącach (wymaga dolewki)",
    icon: "💧",
  },
  {
    name: "Mały serwis amortyzatora (Uszczelki i olej)",
    category: "suspension_fork" as const,
    trackingType: "hours" as const,
    maxValue: 50,
    hint: "Podstawowy serwis lag dolnych Fox / RockShox co 50 godzin",
    icon: "🛠️",
  },
  {
    name: "Duży serwis zawieszenia (Damper / Pełny widelec)",
    category: "suspension_shock" as const,
    trackingType: "hours" as const,
    maxValue: 125,
    hint: "Pełna regeneracja tłumika i komory powietrznej co 100-150h",
    icon: "🛠️",
  },
  {
    name: "Suport / Łożyska suportu",
    category: "bottom_bracket" as const,
    trackingType: "distance_km" as const,
    maxValue: 8000,
    hint: "Wymiana lub czyszczenie przy pierwszych luzach lub skrzypieniu",
    icon: "🔧",
  },
  {
    name: "Linki i pancerze przerzutek",
    category: "cables" as const,
    trackingType: "distance_km" as const,
    maxValue: 6000,
    hint: "Świeże linki gwarantują precyzję indeksacji przełożeń",
    icon: "🧵",
  },
  {
    name: "Buty biegowe startowe / treningowe",
    category: "shoes" as const,
    trackingType: "distance_km" as const,
    maxValue: 650,
    hint: "Pianka amortyzująca traci sprężystość po 500-800 km",
    icon: "👟",
  },
];

interface GearWearViewProps {
  activities: IntervalsActivity[];
  allActivities?: IntervalsActivity[];
  cloudComponents?: CloudGearComponent[];
  cloudServiceRecords?: CloudServiceRecord[];
  onSaveComponentsToCloud?: (components: CloudGearComponent[]) => Promise<void>;
  onSaveServiceRecordToCloud?: (record: CloudServiceRecord) => Promise<void>;
  onCriticalCountChange?: (count: number) => void;
}

export const GearWearView: React.FC<GearWearViewProps> = ({
  activities,
  allActivities,
  cloudComponents,
  cloudServiceRecords,
  onSaveComponentsToCloud,
  onSaveServiceRecordToCloud,
  onCriticalCountChange,
}) => {
  const sourceActivities = useMemo(() => {
    if (allActivities && allActivities.length > activities.length) {
      return allActivities;
    }
    return activities;
  }, [activities, allActivities]);

  // Load bikes
  const [bikes, setBikes] = useState<BikeProfile[]>(() => {
    try {
      const saved = localStorage.getItem("darierpro_bikes_list");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_BIKES;
  });

  // Tracked components state with realistic starter thresholds (including >90% flag)
  const [components, setComponents] = useState<TrackedComponent[]>(() => {
    if (cloudComponents && cloudComponents.length > 0) {
      return cloudComponents.map((c) => ({
        id: c.id,
        bikeId: c.bikeId || "b1",
        bikeName: c.bikeName || "Rower",
        name: c.name,
        category: (c.category as TrackedComponent["category"]) || "other",
        trackingType: c.trackingType || "distance_km",
        maxValue: c.maxValue || 3000,
        baseValue: c.baseValue || 0,
        installedAt: c.installedAt || localTodayIso(),
        lastServicedAt: c.lastServicedAt,
        brandModel: c.brandModel,
        notes: c.notes,
      }));
    }
    try {
      const saved = localStorage.getItem("darierpro_components_list");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 75);
    const pastIso = pastDate.toISOString().slice(0, 10);

    return [
      {
        id: "c1",
        bikeId: "b1",
        bikeName: "Canyon Aeroad CFR (Szosowy)",
        name: "Łańcuch Shimano Dura-Ace CN-M9100",
        category: "chain",
        trackingType: "distance_km",
        maxValue: 3000,
        baseValue: 2780, // High wear -> hits >92%
        installedAt: pastIso,
        lastLubeDate: "2026-11-12",
        lastLubeKm: 180,
        brandModel: "Shimano Dura-Ace 12s, woskowany Silca Hot Melt",
        notes: "Wyciągnięcie 0.48% zmierzone przymiarem Park Tool CC-4",
      },
      {
        id: "c2",
        bikeId: "b1",
        bikeName: "Canyon Aeroad CFR (Szosowy)",
        name: "Opony Continental GP 5000 S TR (Tył)",
        category: "tire_rear",
        trackingType: "distance_km",
        maxValue: 4200,
        baseValue: 3450, // Warning zone ~82%
        installedAt: pastIso,
        brandModel: "Continental GP5000 S TR 28mm",
        notes: "Ciśnienie 4.6 bar, system Tubeless, wskaźniki TWI jeszcze widoczne",
      },
      {
        id: "c3",
        bikeId: "b1",
        bikeName: "Canyon Aeroad CFR (Szosowy)",
        name: "Klocki hamulcowe tarczowe (Przód)",
        category: "brake_pads_front",
        trackingType: "distance_km",
        maxValue: 5500,
        baseValue: 1200, // Good zone ~22%
        installedAt: pastIso,
        brandModel: "SwissStop Disc RS",
        notes: "Mieszanka organiczna, wysoka kultura pracy, grubość 2.4 mm",
      },
      {
        id: "c4",
        bikeId: "b1",
        bikeName: "Canyon Aeroad CFR (Szosowy)",
        name: "Mleko uszczelniające Tubeless (Koła Szosa)",
        category: "sealant",
        trackingType: "days",
        maxValue: 90,
        baseValue: 0,
        installedAt: pastIso,
        brandModel: "Stan's NoTubes Race Sealant (60 ml)",
        notes: "Dolewka przez wentyl, regularna kontrola płynności",
      },
      {
        id: "c5",
        bikeId: "b2",
        bikeName: "Trek Supercaliber (MTB / XC)",
        name: "Łańcuch SRAM XX1 Eagle Rainbow",
        category: "chain",
        trackingType: "distance_km",
        maxValue: 2200,
        baseValue: 2020, // Critical zone >91%
        installedAt: pastIso,
        brandModel: "SRAM Eagle XX1 12s",
        notes: "Oliwka ceramiczna na trudne warunki, kontrola przymiarem 0.5%",
      },
      {
        id: "c6",
        bikeId: "b2",
        bikeName: "Trek Supercaliber (MTB / XC)",
        name: "Mały serwis amortyzatora RockShox SID",
        category: "suspension_fork",
        trackingType: "hours",
        maxValue: 50,
        baseValue: 14,
        installedAt: pastIso,
        brandModel: "RockShox SID SL Ultimate 100mm",
        notes: "Wymiana uszczelek kurzowych SKF i oleju Maxima Plush",
      },
    ];
  });

  // Service history state
  const [serviceLogs, setServiceLogs] = useState<ServiceLogEntry[]>(() => {
    if (cloudServiceRecords && cloudServiceRecords.length > 0) {
      return cloudServiceRecords.map((r) => ({
        id: r.id,
        componentId: r.componentId,
        componentName: r.componentName,
        bikeName: r.bikeName || "Rower",
        serviceDate: r.serviceDate,
        serviceType: (r.serviceType as ServiceLogEntry["serviceType"]) || "wymiana",
        mileageAtService: r.mileageAtService,
        costPln: r.costPln,
        notes: r.notes,
        createdAt: r.createdAt,
      }));
    }
    try {
      const saved = localStorage.getItem("darierpro_service_logs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: "s1",
        componentName: "Łańcuch Shimano Ultegra",
        bikeName: "Canyon Aeroad CFR (Szosowy)",
        serviceDate: "2026-09-15",
        serviceType: "wymiana",
        mileageAtService: 3150,
        costPln: 189,
        notes: "Zużycie osiągnęło 0.5%. Wymiana na nowy łańcuch Dura-Ace.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "s2",
        componentName: "Mleko uszczelniające Tubeless",
        bikeName: "Trek Supercaliber (MTB / XC)",
        serviceDate: "2026-10-02",
        serviceType: "dolewka",
        mileageAtService: 850,
        costPln: 35,
        notes: "Dolewka 80ml mleka Trezado do obu kół przed startem w maratonie.",
        createdAt: new Date().toISOString(),
      },
    ];
  });

  // UI Filters
  const [selectedBikeId, setSelectedBikeId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "critical" | "warning" | "good">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals & Panels
  const [showLogDrawer, setShowLogDrawer] = useState<boolean>(false);
  const [replaceModalComponent, setReplaceModalComponent] = useState<TrackedComponent | null>(null);
  const [addComponentModal, setAddComponentModal] = useState<boolean>(false);
  const [editingComponent, setEditingComponent] = useState<TrackedComponent | null>(null);
  const [addBikeModal, setAddBikeModal] = useState<boolean>(false);

  // Cool Improvement Modals:
  const [showSimulatorModal, setShowSimulatorModal] = useState<boolean>(false);
  const [simulatorTripKm, setSimulatorTripKm] = useState<number>(200);
  const [showShoppingListModal, setShowShoppingListModal] = useState<boolean>(false);
  const [showDiagnosticsGuide, setShowDiagnosticsGuide] = useState<boolean>(false);
  const [quickLubeComponent, setQuickLubeComponent] = useState<TrackedComponent | null>(null);
  const [copiedClipboard, setCopiedClipboard] = useState<boolean>(false);

  // Calculate accumulated values for each component
  const calculatedComponents = useMemo(() => {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const fourWeeksIso = fourWeeksAgo.toISOString().slice(0, 10);

    let rolling4wMeters = 0;
    let rolling4wSeconds = 0;
    for (const a of sourceActivities) {
      const d = (a.start_date_local || "").slice(0, 10);
      if (d >= fourWeeksIso) {
        rolling4wMeters += a.distance || 0;
        rolling4wSeconds += a.moving_time || 0;
      }
    }
    const avgWeeklyKm = Math.max(35, Math.round(rolling4wMeters / 1000 / 4));
    const avgWeeklyHours = Math.max(1.8, Number((rolling4wSeconds / 3600 / 4).toFixed(1)));

    return components.map((comp) => {
      const bike = bikes.find((b) => b.id === comp.bikeId);
      const bikeType = bike ? bike.type : "all_bikes";
      const installThreshold = comp.installedAt || "1970-01-01";

      let accumulatedActivitiesDistanceMeters = 0;
      let accumulatedActivitiesMovingSeconds = 0;

      for (const act of sourceActivities) {
        if (!matchesActivityToBike(act, bikeType)) continue;
        const actDate = (act.start_date_local || "").slice(0, 10);
        if (actDate < installThreshold) continue;

        accumulatedActivitiesDistanceMeters += Math.max(0, act.distance || 0);
        accumulatedActivitiesMovingSeconds += Math.max(0, act.moving_time || 0);
      }

      let current = comp.baseValue;
      if (comp.trackingType === "distance_km") {
        current += Math.round(accumulatedActivitiesDistanceMeters / 1000);
      } else if (comp.trackingType === "hours") {
        current += Number((accumulatedActivitiesMovingSeconds / 3600).toFixed(1));
      } else if (comp.trackingType === "days") {
        current += daysElapsed(comp.installedAt);
      }

      const percent = Math.min(150, Math.round((current / comp.maxValue) * 100));
      const remaining = Math.max(0, comp.maxValue - current);

      // Remaining time estimation
      let remainingEstimateText = "";
      let estimatedReplacementDate = "";

      if (comp.trackingType === "distance_km") {
        const weeksLeft = (remaining / avgWeeklyKm).toFixed(1);
        remainingEstimateText =
          remaining === 0
            ? "Limit 100% przekroczony!"
            : percent >= 90
            ? `PILNE: Pozostało tylko ~${remaining} km (~${weeksLeft} tyg.)`
            : `Pozostało ~${remaining} km (ok. ${weeksLeft} tyg.)`;

        if (remaining > 0 && avgWeeklyKm > 0) {
          const daysLeft = Math.round((remaining / avgWeeklyKm) * 7);
          const target = new Date();
          target.setDate(target.getDate() + daysLeft);
          estimatedReplacementDate = target.toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "short",
          });
        }
      } else if (comp.trackingType === "hours") {
        const weeksLeft = (remaining / avgWeeklyHours).toFixed(1);
        remainingEstimateText =
          remaining === 0
            ? "Wymagany natychmiastowy serwis!"
            : percent >= 90
            ? `PILNE: Pozostało ~${remaining.toFixed(1)} h (~${weeksLeft} tyg.)`
            : `Pozostało ~${remaining.toFixed(1)} h (ok. ${weeksLeft} tyg.)`;

        if (remaining > 0 && avgWeeklyHours > 0) {
          const daysLeft = Math.round((remaining / avgWeeklyHours) * 7);
          const target = new Date();
          target.setDate(target.getDate() + daysLeft);
          estimatedReplacementDate = target.toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "short",
          });
        }
      } else {
        remainingEstimateText =
          remaining === 0
            ? "Zalecana natychmiastowa dolewka!"
            : percent >= 90
            ? `PILNE: Pozostało ~${remaining} dni płynności`
            : `Pozostało ~${remaining} dni płynności`;

        if (remaining > 0) {
          const target = new Date();
          target.setDate(target.getDate() + remaining);
          estimatedReplacementDate = target.toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "short",
          });
        }
      }

      // Exact 90% indicator tiering
      const isCritical = percent >= 90;
      const isOverLimit = percent >= 100;
      const isWarning = percent >= 75 && percent < 90;

      let statusTier: "optimal" | "good" | "warning" | "danger" = "optimal";
      if (percent >= 90) statusTier = "danger";
      else if (percent >= 75) statusTier = "warning";
      else if (percent >= 50) statusTier = "good";

      return {
        ...comp,
        calculatedCurrent: current,
        wearPercent: percent,
        remainingValue: remaining,
        remainingEstimateText,
        estimatedReplacementDate,
        isCritical,
        isOverLimit,
        isWarning,
        statusTier,
      };
    });
  }, [components, bikes, sourceActivities]);

  // Persist components
  const persistComponents = (newList: TrackedComponent[]) => {
    setComponents(newList);
    try {
      localStorage.setItem("darierpro_components_list", JSON.stringify(newList));
    } catch {}
    if (onSaveComponentsToCloud) {
      const cloudFormatted: CloudGearComponent[] = newList.map((c) => ({
        id: c.id,
        userId: "",
        bikeId: c.bikeId,
        bikeName: c.bikeName,
        name: c.name,
        category: c.category,
        trackingType: c.trackingType,
        currentValue: c.baseValue,
        maxValue: c.maxValue,
        baseValue: c.baseValue,
        installedAt: c.installedAt,
        lastServicedAt: c.lastServicedAt,
        brandModel: c.brandModel,
        notes: c.notes,
        updatedAt: new Date().toISOString(),
      }));
      onSaveComponentsToCloud(cloudFormatted).catch((err) =>
        console.warn("Cloud components sync note:", err)
      );
    }
  };

  const persistServiceLogs = (newLogs: ServiceLogEntry[]) => {
    setServiceLogs(newLogs);
    try {
      localStorage.setItem("darierpro_service_logs", JSON.stringify(newLogs));
    } catch {}
    if (onSaveServiceRecordToCloud && newLogs[0]) {
      onSaveServiceRecordToCloud({
        id: newLogs[0].id,
        userId: "",
        componentId: newLogs[0].componentId,
        componentName: newLogs[0].componentName,
        bikeName: newLogs[0].bikeName,
        serviceDate: newLogs[0].serviceDate,
        serviceType: newLogs[0].serviceType,
        mileageAtService: newLogs[0].mileageAtService,
        costPln: newLogs[0].costPln,
        notes: newLogs[0].notes,
        createdAt: newLogs[0].createdAt,
      }).catch((e) => console.warn("Cloud log sync note:", e));
    }
  };

  // Filter components including >90% flag
  const filteredComponents = useMemo(() => {
    return calculatedComponents.filter((c) => {
      if (selectedBikeId !== "all" && c.bikeId !== selectedBikeId) return false;
      if (statusFilter === "critical" && c.wearPercent < 90) return false;
      if (statusFilter === "warning" && (c.wearPercent < 75 || c.wearPercent >= 90)) return false;
      if (statusFilter === "good" && c.wearPercent >= 75) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.bikeName.toLowerCase().includes(q) ||
          (c.brandModel || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [calculatedComponents, selectedBikeId, statusFilter, searchQuery]);

  // Overall Statistics with >90% flag
  const stats = useMemo(() => {
    const total = calculatedComponents.length;
    const criticalCount = calculatedComponents.filter((c) => c.wearPercent >= 90).length;
    const criticalList = calculatedComponents.filter((c) => c.wearPercent >= 90);
    const warningCount = calculatedComponents.filter(
      (c) => c.wearPercent >= 75 && c.wearPercent < 90
    ).length;

    // Find most urgent
    const sorted = [...calculatedComponents].sort((a, b) => b.wearPercent - a.wearPercent);
    const mostUrgent = sorted[0];

    const totalSpent = serviceLogs.reduce((acc, l) => acc + (l.costPln || 0), 0);

    return {
      total,
      criticalCount,
      criticalList,
      warningCount,
      mostUrgent,
      totalSpent,
    };
  }, [calculatedComponents, serviceLogs]);

  // Report critical count up to App/TopBar
  React.useEffect(() => {
    if (onCriticalCountChange) {
      onCriticalCountChange(stats.criticalCount);
    }
  }, [stats.criticalCount, onCriticalCountChange]);

  // Trip simulator calculation
  const simulatedTripResults = useMemo(() => {
    const targetBike = bikes.find((b) => b.id === selectedBikeId) || bikes[0];
    const bikeComps = calculatedComponents.filter(
      (c) => c.bikeId === (selectedBikeId === "all" ? bikes[0].id : selectedBikeId)
    );

    return bikeComps.map((c) => {
      let added = 0;
      if (c.trackingType === "distance_km") {
        added = simulatorTripKm;
      } else if (c.trackingType === "hours") {
        // Assume ~25 km/h avg pace
        added = Number((simulatorTripKm / 25).toFixed(1));
      }
      const projectedCurrent = c.calculatedCurrent + added;
      const projectedPercent = Math.min(200, Math.round((projectedCurrent / c.maxValue) * 100));
      const willCross90 = c.wearPercent < 90 && projectedPercent >= 90;
      const willCross100 = c.wearPercent < 100 && projectedPercent >= 100;

      return {
        ...c,
        projectedCurrent,
        projectedPercent,
        willCross90,
        willCross100,
      };
    });
  }, [calculatedComponents, selectedBikeId, bikes, simulatorTripKm]);

  return (
    <div className="space-y-6 pb-16">
      {/* View Header with Polish title & Action buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Wrench className="h-5 w-5" />
            </span>
            <h1 className="font-display text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Zużycie Komponentów i Sprzęt
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Automatyczne monitorowanie przebiegu, godzin pracy i zużycia łańcuchów, opon, klocków oraz zawieszenia na podstawie Twoich aktywności.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Usprawnienie: Symulator Trasy */}
          <button
            type="button"
            onClick={() => setShowSimulatorModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 px-3 py-2 text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer"
          >
            <Compass className="h-4 w-4" />
            <span>Symulator Wyprawy</span>
          </button>

          {/* Usprawnienie: Lista Zakupów / Warsztat */}
          <button
            type="button"
            onClick={() => setShowShoppingListModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition-colors cursor-pointer"
          >
            <ShoppingCart className="h-4 w-4 text-slate-500" />
            <span>Lista Zakupów / Warsztat</span>
          </button>

          {/* Usprawnienie: Poradnik Diagnostyczny */}
          <button
            type="button"
            onClick={() => setShowDiagnosticsGuide(!showDiagnosticsGuide)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
              showDiagnosticsGuide
                ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
            }`}
          >
            <HelpCircle className="h-4 w-4 text-amber-500" />
            <span>Poradnik Mechanika</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLogDrawer(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition-colors cursor-pointer"
          >
            <History className="h-4 w-4 text-slate-500" />
            <span>Książka ({serviceLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingComponent(null);
              setAddComponentModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white px-4 py-2 text-xs font-bold shadow-md shadow-rose-600/25 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nowy Komponent</span>
          </button>
        </div>
      </div>

      {/* Prominent Visual Flag Banner for components exceeding 90% */}
      {stats.criticalCount > 0 && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-rose-500/80 bg-gradient-to-r from-rose-500/15 via-rose-600/10 to-amber-500/10 dark:from-rose-950/60 dark:via-rose-900/40 dark:to-amber-950/30 p-5 shadow-lg shadow-rose-600/10 animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-600/30 animate-pulse">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase px-2 py-0.5 tracking-wider">
                    FLAGA OSTRZEGAWCZA &gt; 90%
                  </span>
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                    Wymagana pilna wymiana lub inspekcja!
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                  {stats.criticalCount === 1
                    ? "1 komponent przekroczył 90% limitu żywotności!"
                    : `${stats.criticalCount} komponenty przekroczyły 90% limitu żywotności!`}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Dotyczy:{" "}
                  <strong>
                    {stats.criticalList.map((c) => `${c.name} (${c.wearPercent}%)`).join(", ")}
                  </strong>
                  . Dalsza eksploatacja grozi zerwaniem łańcucha, zniszczeniem kasety lub nagłą awarią w trasie.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setStatusFilter("critical")}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-2 text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                <Filter className="h-3.5 w-3.5" />
                <span>Pokaż tylko &gt;90%</span>
              </button>
              <button
                type="button"
                onClick={() => setShowShoppingListModal(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 px-3.5 py-2 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
              >
                <span>Generuj zlecenia</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expandable Mechanic Diagnostics Guide */}
      {showDiagnosticsGuide && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-5 shadow-xs animate-fadeIn space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Poradnik Warsztatowy: Kiedy bezwzględnie wymieniać części rowerowe?
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowDiagnosticsGuide(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              Zamknij ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 p-3.5 space-y-1">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>⛓️ Łańcuch napędowy</span>
              </span>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Dla napędów 11 i 12s wymieniaj łańcuch przy <strong>0.5%</strong> wyciągnięcia (zanim zniszczy kasetę!). Dla napędów 8-10s granicą jest <strong>0.75%</strong>.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 p-3.5 space-y-1">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🛞 Opony i bieżnik</span>
              </span>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Szukaj wskaźników <strong>TWI</strong> (małe wgłębienia w czole opony). Gdy wgłębienie znika lub opona robi się płaska na szczycie — czas na wymianę!
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 p-3.5 space-y-1">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🛑 Klocki tarczowe</span>
              </span>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Minimalna grubość samej okładziny to <strong>1.5 mm</strong>. Jeśli metalowa sprężynka rozporowa zaczyna dotykać tarczy, wymieniaj natychmiast.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 p-3.5 space-y-1">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>💧 Mleko uszczelniające</span>
              </span>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                W temperaturze letniej mleko wysycha po <strong>60-90 dniach</strong>. Wstrząśnij kołem — jeśli nie słychać chlupotania, natychmiast dolej 50-70 ml.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Components */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Części w monitoringu
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-black text-slate-900 dark:text-white">
              {stats.total}
            </span>
            <span className="text-xs text-slate-500">na {bikes.length} rowerach</span>
          </div>
          <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Dane przeliczane automatycznie</span>
          </div>
        </div>

        {/* Critical Alerts (>90%) */}
        <div
          className={`rounded-2xl border p-4 shadow-xs transition-all ${
            stats.criticalCount > 0
              ? "border-rose-400 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/30 ring-1 ring-rose-500/30"
              : "border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/90"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              Krytyczne zużycie (&gt;90%)
            </span>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                stats.criticalCount > 0
                  ? "bg-rose-600 text-white animate-pulse shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500"
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`font-display text-3xl font-black ${
                stats.criticalCount > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-900 dark:text-white"
              }`}
            >
              {stats.criticalCount}
            </span>
            <span className="text-xs text-slate-500">
              {stats.warningCount > 0 ? `+ ${stats.warningCount} w strefie 75-90%` : "Brak ostrzeżeń"}
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            {stats.criticalCount > 0
              ? "Wymaga bezzwłocznej wymiany części"
              : "Wszystkie komponenty poniżej 90%"}
          </p>
        </div>

        {/* Most Urgent Component */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Najbardziej wyeksploatowany
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          {stats.mostUrgent ? (
            <div className="mt-2.5">
              <div className="truncate font-bold text-sm text-slate-900 dark:text-white">
                {stats.mostUrgent.name}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>{stats.mostUrgent.bikeName}</span>
                <span
                  className={`font-black ${
                    stats.mostUrgent.wearPercent >= 90
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {stats.mostUrgent.wearPercent}%
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 font-medium truncate">
                {stats.mostUrgent.remainingEstimateText}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-slate-400">Brak komponentów</div>
          )}
        </div>

        {/* Service Expense */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Wydatki serwisowe
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-black text-slate-900 dark:text-white">
              {stats.totalSpent} <span className="text-sm font-bold text-slate-500">PLN</span>
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Zarejestrowano w {serviceLogs.length} wpisach serwisowych
          </p>
        </div>
      </div>

      {/* Bike Filter Bar & Search controls */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 p-4 shadow-xs space-y-3">
        {/* Bike pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setSelectedBikeId("all")}
            className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              selectedBikeId === "all"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            Wszystkie rowery ({calculatedComponents.length})
          </button>

          {bikes.map((b) => {
            const count = calculatedComponents.filter((c) => c.bikeId === b.id).length;
            const hasCritical = calculatedComponents.some(
              (c) => c.bikeId === b.id && c.wearPercent >= 90
            );
            const hasWarning = calculatedComponents.some(
              (c) => c.bikeId === b.id && c.wearPercent >= 75 && c.wearPercent < 90
            );

            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBikeId(b.id)}
                className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  selectedBikeId === b.id
                    ? "bg-rose-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                <span>{b.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    hasCritical
                      ? "bg-rose-500 text-white animate-pulse"
                      : "bg-black/10 dark:bg-white/10"
                  }`}
                >
                  {count}
                </span>
                {hasCritical ? (
                  <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
                ) : hasWarning ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                ) : null}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setAddBikeModal(true)}
            className="shrink-0 flex items-center gap-1 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Dodaj rower</span>
          </button>
        </div>

        {/* Search & Status Filter Row with >90% flag filter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/60">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj części (np. łańcuch, GP5000)..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end overflow-x-auto no-scrollbar">
            <span className="text-xs text-slate-400 hidden sm:inline mr-1">Filtruj:</span>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                statusFilter === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              Wszystkie ({calculatedComponents.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("critical")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === "critical"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
              }`}
            >
              <span>🚨 Zagrożone (&gt;90%)</span>
              <span className="rounded-full bg-rose-700/20 text-[10px] px-1.5 py-0.2">
                {stats.criticalCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("warning")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                statusFilter === "warning"
                  ? "bg-amber-500 text-white"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300"
              }`}
            >
              ⚠️ Uwaga (75-90%)
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("good")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                statusFilter === "good"
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300"
              }`}
            >
              ✅ W normie (&lt;75%)
            </button>
          </div>
        </div>
      </div>

      {/* Component Cards Grid */}
      {filteredComponents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center bg-white/50 dark:bg-slate-900/50">
          <Wrench className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
            Brak komponentów spełniających kryteria
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            {statusFilter === "critical"
              ? "Świetna wiadomość! Żaden z Twoich komponentów nie przekroczył 90% zużycia."
              : "Dodaj komponenty do tego roweru lub zresetuj filtry wyszukiwania."}
          </p>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-xs font-bold transition-colors cursor-pointer"
          >
            <span>Pokaż wszystkie komponenty</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredComponents.map((c) => {
            const isCritical = c.wearPercent >= 90;
            const isOverLimit = c.wearPercent >= 100;
            const isWarning = c.wearPercent >= 75 && c.wearPercent < 90;

            return (
              <div
                key={c.id}
                className={`relative flex flex-col justify-between rounded-2xl border transition-all p-5 shadow-xs hover:shadow-md ${
                  isOverLimit
                    ? "border-rose-600 dark:border-rose-500 ring-2 ring-rose-600/40 bg-rose-50/25 dark:bg-rose-950/30"
                    : isCritical
                    ? "border-rose-400 dark:border-rose-800 ring-2 ring-rose-500/25 bg-rose-50/15 dark:bg-rose-950/20"
                    : isWarning
                    ? "border-amber-400/80 dark:border-amber-800/80 ring-1 ring-amber-500/20 bg-amber-50/10 dark:bg-amber-950/10"
                    : "border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900"
                }`}
              >
                {/* Critical >90% ribbon/badge on top edge */}
                {isCritical && (
                  <div className="absolute -top-3 left-4 right-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase px-2.5 py-0.5 shadow-md shadow-rose-600/30 animate-pulse">
                      <AlertTriangle className="h-3 w-3" />
                      <span>{isOverLimit ? "LIMIT 100% PRZEKROCZONY" : "FLAGA KRYTYCZNA >90%"}</span>
                    </span>
                    {c.estimatedReplacementDate && (
                      <span className="rounded-full bg-slate-900/80 text-white text-[9px] font-bold px-2 py-0.5 backdrop-blur-xs">
                        Wymiana: {c.estimatedReplacementDate}
                      </span>
                    )}
                  </div>
                )}

                {/* Header: Component Name & Bike Badge */}
                <div className={isCritical ? "pt-1" : ""}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="inline-block rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                        {c.bikeName}
                      </span>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug">
                        {c.name}
                      </h3>
                      {c.brandModel && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {c.brandModel}
                        </p>
                      )}
                    </div>

                    {/* Percentage Pill */}
                    <div
                      className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-black tabular-nums border ${
                        isCritical
                          ? "bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/25 animate-pulse"
                          : isWarning
                          ? "bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400"
                          : "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {c.wearPercent}%
                    </div>
                  </div>

                  {/* Multi-Tier Color-Coded Progress Bar with 90% threshold notch */}
                  <div className="mt-4">
                    <div className="flex justify-between items-center text-xs font-bold tabular-nums mb-1.5">
                      <span className="text-slate-800 dark:text-slate-200">
                        {c.trackingType === "distance_km"
                          ? `${c.calculatedCurrent} km`
                          : c.trackingType === "hours"
                          ? `${c.calculatedCurrent} h`
                          : `${c.calculatedCurrent} dni`}
                      </span>
                      <div className="flex items-center gap-1 text-[11px]">
                        {isCritical && (
                          <span className="text-rose-600 dark:text-rose-400 font-black animate-pulse flex items-center gap-0.5 mr-1">
                            <AlertTriangle className="h-3 w-3" />
                            <span>&gt;90% ZUŻYCIE</span>
                          </span>
                        )}
                        <span className="text-slate-400">
                          max:{" "}
                          {c.trackingType === "distance_km"
                            ? `${c.maxValue} km`
                            : c.trackingType === "hours"
                            ? `${c.maxValue} h`
                            : `${c.maxValue} dni`}
                        </span>
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className="relative h-3.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden p-0.5">
                      {/* Vertical line indicator at exactly 90% */}
                      <div
                        className="absolute top-0 bottom-0 right-[10%] w-0.5 bg-rose-500/60 dark:bg-rose-400/70 z-10"
                        title="Próg krytyczny 90%"
                      />
                      {/* Red danger zone tint for 90-100% */}
                      <div
                        className="absolute top-0 bottom-0 right-0 w-[10%] bg-rose-500/15 dark:bg-rose-500/20 pointer-events-none"
                        title="Strefa krytyczna (>90%)"
                      />

                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOverLimit
                            ? "bg-[repeating-linear-gradient(45deg,#e11d48,#e11d48_8px,#be123c_8px,#be123c_16px)] animate-pulse shadow-xs"
                            : isCritical
                            ? "bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600 animate-pulse shadow-xs"
                            : isWarning
                            ? "bg-amber-500"
                            : c.wearPercent > 50
                            ? "bg-sky-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, c.wearPercent)}%` }}
                      />
                    </div>

                    {/* Sub-label showing zone thresholds */}
                    <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-0.5">
                      <span>0%</span>
                      <span className="text-amber-500 font-medium">75% ostrzeżenie</span>
                      <span className="text-rose-500 font-bold flex items-center gap-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        <span>90% wymiana</span>
                      </span>
                      <span>100%</span>
                    </div>
                  </div>

                  {/* Estimation & status note */}
                  <div
                    className={`mt-3 rounded-xl p-2.5 text-xs space-y-1.5 ${
                      isCritical
                        ? "bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/50"
                        : "bg-slate-50 dark:bg-slate-950/70"
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-slate-500">Kondycja:</span>
                      <span
                        className={
                          isCritical
                            ? "text-rose-600 dark:text-rose-400 font-black flex items-center gap-1"
                            : isWarning
                            ? "text-amber-600 dark:text-amber-400 font-bold"
                            : "text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {isCritical && <AlertTriangle className="h-3 w-3" />}
                        {isOverLimit
                          ? "Limit przekroczony! Wymień natychmiast"
                          : isCritical
                          ? "Krytyczne zużycie (>90%)"
                          : isWarning
                          ? "Zalecany przegląd"
                          : "Bardzo dobry stan"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>Prognoza:</span>
                      <span className={`font-bold ${isCritical ? "text-rose-600 dark:text-rose-400" : ""}`}>
                        {c.remainingEstimateText}
                      </span>
                    </div>

                    {/* Chain specific quick maintenance status */}
                    {c.category === "chain" && (
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Droplets className="h-3 w-3 text-sky-500" />
                          <span>Smar / Wosk:</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {c.lastLubeKm ? `${c.lastLubeKm} km temu` : "Brak wpisu"}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuickLubeComponent(c)}
                            title="Zarejestruj smarowanie / woskowanie łańcucha"
                            className="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:underline"
                          >
                            + Zapisz wosk
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                      <span>Montaż: {c.installedAt}</span>
                      {c.notes && (
                        <span className="truncate max-w-[140px]" title={c.notes}>
                          {c.notes}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setReplaceModalComponent(c)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer ${
                      isCritical
                        ? "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/25"
                        : "bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>{isCritical ? "Zmień teraz (Reset)" : "Wymień / Serwis"}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingComponent(c);
                        setAddComponentModal(true);
                      }}
                      title="Edytuj komponent"
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Czy na pewno chcesz usunąć komponent "${c.name}"?`)) {
                          persistComponents(components.filter((item) => item.id !== c.id));
                        }
                      }}
                      title="Usuń komponent"
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Add Preset Bar at bottom */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 p-5 shadow-xs">
        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-rose-500" />
          <span>Szybkie dodawanie z bazy typowych komponentów:</span>
        </h3>
        <div className="flex flex-wrap gap-2 pt-1">
          {PRESET_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.name}
              type="button"
              onClick={() => {
                const targetBike = bikes.find((b) => b.id === selectedBikeId) || bikes[0];
                const newComp: TrackedComponent = {
                  id: `comp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                  bikeId: targetBike.id,
                  bikeName: targetBike.name,
                  name: tmpl.name,
                  category: tmpl.category,
                  trackingType: tmpl.trackingType,
                  maxValue: tmpl.maxValue,
                  baseValue: 0,
                  installedAt: localTodayIso(),
                  notes: tmpl.hint,
                };
                persistComponents([...components, newComp]);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-rose-400 dark:hover:border-rose-500 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
            >
              <span>{tmpl.icon}</span>
              <span>{tmpl.name}</span>
              <span className="text-[10px] text-slate-400">
                ({tmpl.maxValue} {tmpl.trackingType === "distance_km" ? "km" : tmpl.trackingType === "hours" ? "h" : "dni"})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Modal: Trip Simulator (Usprawnienie 1) */}
      {showSimulatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-rose-600" />
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Symulator Trasy / Wyprawy
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSimulatorModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
              Wpisz planowany dystans wyprawy lub wyścigu. Symulator natychmiast sprawdzi, które części przekroczą krytyczną barierę <strong>90%</strong> lub <strong>100%</strong> w trakcie jazdy.
            </p>

            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">Planowany dystans:</span>
                <span className="text-rose-600 dark:text-rose-400 font-display text-base">
                  {simulatorTripKm} km
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={1000}
                step={10}
                value={simulatorTripKm}
                onChange={(e) => setSimulatorTripKm(Number(e.target.value))}
                className="w-full accent-rose-600 cursor-pointer"
              />
              <div className="flex gap-2 justify-between">
                {[100, 200, 350, 500, 800].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSimulatorTripKm(d)}
                    className="text-[11px] font-bold px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                  >
                    {d} km
                  </button>
                ))}
              </div>
            </div>

            {/* Projected results */}
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Prognoza stanu części po przejechaniu {simulatorTripKm} km:
              </h4>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {simulatedTripResults.map((res) => (
                  <div
                    key={res.id}
                    className={`rounded-xl p-3 border text-xs flex items-center justify-between ${
                      res.projectedPercent >= 100
                        ? "border-rose-400 bg-rose-50/70 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 font-bold"
                        : res.projectedPercent >= 90
                        ? "border-amber-400 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>{res.name}</span>
                        {res.willCross90 && (
                          <span className="text-[10px] bg-rose-600 text-white rounded-md px-1.5 py-0.2">
                            WEJDZIE W &gt;90%
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Obecnie: {res.calculatedCurrent} {res.trackingType === "hours" ? "h" : "km"} ({res.wearPercent}%) → Po trasie: {res.projectedCurrent} ({res.projectedPercent}%)
                      </span>
                    </div>

                    <span
                      className={`text-sm font-black tabular-nums ${
                        res.projectedPercent >= 90 ? "text-rose-600 dark:text-rose-400" : ""
                      }`}
                    >
                      {res.projectedPercent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSimulatorModal(false)}
                className="rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2 text-xs font-bold"
              >
                Zamknij symulator
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Shopping List & Workshop Checklist (Usprawnienie 2) */}
      {showShoppingListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-rose-600" />
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Lista Zakupów i Zlecenie Serwisowe
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowShoppingListModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
              Zestawienie komponentów o zużyciu <strong>&ge; 75%</strong> do zakupu w sklepie rowerowym lub przekazania mechanikowi.
            </p>

            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
              {calculatedComponents.filter((c) => c.wearPercent >= 75).length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  Brak części wymagających zakupu! Wszystkie Twoje komponenty mają zużycie poniżej 75%.
                </div>
              ) : (
                calculatedComponents
                  .filter((c) => c.wearPercent >= 75)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{item.name}</span>
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${
                              item.wearPercent >= 90
                                ? "bg-rose-600 text-white"
                                : "bg-amber-500 text-white"
                            }`}
                          >
                            {item.wearPercent}%
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {item.bikeName} {item.brandModel ? `· Model: ${item.brandModel}` : ""}
                        </p>
                      </div>

                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        {item.remainingValue}{" "}
                        {item.trackingType === "distance_km" ? "km do 100%" : "do limitu"}
                      </span>
                    </div>
                  ))
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const criticals = calculatedComponents.filter((c) => c.wearPercent >= 75);
                  const text = `DARIERPRO - ZLECENIE SERWISOWE / LISTA ZAKUPÓW:\n` +
                    criticals.map((c) => `- [${c.wearPercent}% ZUŻYCIA] ${c.bikeName}: ${c.name} (${c.brandModel || "brak modelu"}) - Przebieg: ${c.calculatedCurrent}/${c.maxValue}`).join("\n");
                  navigator.clipboard.writeText(text);
                  setCopiedClipboard(true);
                  setTimeout(() => setCopiedClipboard(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
              >
                {copiedClipboard ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                <span>{copiedClipboard ? "Skopiowano do schowka!" : "Kopiuj listę do SMS / serwisu"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowShoppingListModal(false)}
                className="rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2 text-xs font-bold"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick Chain Wax/Lube Logger (Usprawnienie 3) */}
      {quickLubeComponent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Droplets className="h-5 w-5 text-sky-500" />
              <span>Zarejestruj Smarowanie / Wosk</span>
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Komponent: <strong>{quickLubeComponent.name}</strong>. Wpis nie zeruje całkowitego limitu łańcucha, lecz odświeża interwał smarowania.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const lubeType = (fd.get("lubeType") as string) || "Wosk na gorąco Silca";
                const today = localTodayIso();

                // Update component lastLubeDate
                const updated = components.map((c) =>
                  c.id === quickLubeComponent.id
                    ? { ...c, lastLubeDate: today, lastLubeKm: 0, notes: `${c.notes || ""} [Ostatni wosk: ${today}]`.trim() }
                    : c
                );
                persistComponents(updated);

                // Add logbook entry
                const log: ServiceLogEntry = {
                  id: `srv_lube_${Date.now()}`,
                  componentId: quickLubeComponent.id,
                  componentName: quickLubeComponent.name,
                  bikeName: quickLubeComponent.bikeName,
                  serviceDate: today,
                  serviceType: "smarowanie",
                  mileageAtService: (quickLubeComponent as any).calculatedCurrent || 0,
                  costPln: 0,
                  notes: `Smarowanie / woskowanie: ${lubeType}`,
                  createdAt: new Date().toISOString(),
                };
                persistServiceLogs([log, ...serviceLogs]);

                setQuickLubeComponent(null);
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Środek smarny:
                </label>
                <select
                  name="lubeType"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="Wosk na gorąco (Hot Melt Wax)">Wosk na gorąco (Silca / Molten Speed)</option>
                  <option value="Wosk w płynie (Drip Wax)">Wosk w płynie (Squirt / Silca Super Secret)</option>
                  <option value="Oliwka na suche warunki (Dry Lube)">Oliwka Dry (Muc-Off / Finish Line)</option>
                  <option value="Oliwka na mokre warunki (Wet Lube)">Oliwka Wet (Błoto / Deszcz)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickLubeComponent(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 text-xs font-bold shadow-sm"
                >
                  Zapisz smarowanie
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Replace / Service Component */}
      {replaceModalComponent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-rose-600" />
              <span>Zarejestruj Wymianę / Serwis</span>
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Wpisz szczegóły serwisu komponentu <strong>{replaceModalComponent.name}</strong>. Licznik zużycia zostanie zresetowany, a wpis trafi do Książki Serwisowej.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const serviceDate = (fd.get("serviceDate") as string) || localTodayIso();
                const cost = Number(fd.get("costPln")) || 0;
                const newModel = (fd.get("brandModel") as string) || replaceModalComponent.brandModel;
                const notes = (fd.get("notes") as string) || "";
                const serviceType = (fd.get("serviceType") as ServiceLogEntry["serviceType"]) || "wymiana";

                // 1. Add log entry
                const logEntry: ServiceLogEntry = {
                  id: `srv_${Date.now()}`,
                  componentId: replaceModalComponent.id,
                  componentName: replaceModalComponent.name,
                  bikeName: replaceModalComponent.bikeName,
                  serviceDate,
                  serviceType,
                  mileageAtService: (replaceModalComponent as any).calculatedCurrent || 0,
                  costPln: cost,
                  notes: notes || `Wymiana na ${newModel || "nowy egzemplarz"}`,
                  createdAt: new Date().toISOString(),
                };
                persistServiceLogs([logEntry, ...serviceLogs]);

                // 2. Reset component counter
                const updatedList = components.map((c) => {
                  if (c.id === replaceModalComponent.id) {
                    return {
                      ...c,
                      installedAt: serviceDate,
                      lastServicedAt: serviceDate,
                      baseValue: 0,
                      brandModel: newModel,
                    };
                  }
                  return c;
                });
                persistComponents(updatedList);
                setReplaceModalComponent(null);
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Typ operacji:
                </label>
                <select
                  name="serviceType"
                  defaultValue="wymiana"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="wymiana">Wymiana na nową część</option>
                  <option value="serwis">Serwis / Regeneracja / Mycie</option>
                  <option value="dolewka">Dolewka (mleko uszczelniające)</option>
                  <option value="regulacja">Regulacja i naciąg</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Data wykonania:
                </label>
                <input
                  type="date"
                  name="serviceDate"
                  defaultValue={localTodayIso()}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nowy model / marka (opcjonalnie):
                </label>
                <input
                  type="text"
                  name="brandModel"
                  defaultValue={replaceModalComponent.brandModel || ""}
                  placeholder="np. Shimano CN-M8100 12s"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Koszt części lub usługi (PLN):
                </label>
                <input
                  type="number"
                  name="costPln"
                  defaultValue={0}
                  step={1}
                  min={0}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Notatki / uwagi do serwisu:
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="np. Woskowany Silca Hot Melt, 114 ogniw, montaż samodzielny"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReplaceModalComponent(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 text-white px-5 py-2 text-xs font-bold hover:bg-rose-500 shadow-sm"
                >
                  Zapisz i zresetuj licznik
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add or Edit Component */}
      {addComponentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="h-5 w-5 text-rose-600" />
              <span>{editingComponent ? "Edytuj Komponent" : "Dodaj Nowy Komponent"}</span>
            </h3>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const bikeId = (fd.get("bikeId") as string) || bikes[0].id;
                const bike = bikes.find((b) => b.id === bikeId) || bikes[0];
                const name = (fd.get("name") as string)?.trim() || "Nowy komponent";
                const category = (fd.get("category") as TrackedComponent["category"]) || "chain";
                const trackingType = (fd.get("trackingType") as TrackedComponent["trackingType"]) || "distance_km";
                const maxValue = Number(fd.get("maxValue")) || 3000;
                const baseValue = Number(fd.get("baseValue")) || 0;
                const installedAt = (fd.get("installedAt") as string) || localTodayIso();
                const brandModel = (fd.get("brandModel") as string)?.trim() || "";
                const notes = (fd.get("notes") as string)?.trim() || "";

                if (editingComponent) {
                  const updated = components.map((c) =>
                    c.id === editingComponent.id
                      ? {
                          ...c,
                          bikeId,
                          bikeName: bike.name,
                          name,
                          category,
                          trackingType,
                          maxValue,
                          baseValue,
                          installedAt,
                          brandModel,
                          notes,
                        }
                      : c
                  );
                  persistComponents(updated);
                } else {
                  const newComp: TrackedComponent = {
                    id: `comp_${Date.now()}`,
                    bikeId,
                    bikeName: bike.name,
                    name,
                    category,
                    trackingType,
                    maxValue,
                    baseValue,
                    installedAt,
                    brandModel,
                    notes,
                  };
                  persistComponents([...components, newComp]);
                }

                setAddComponentModal(false);
                setEditingComponent(null);
              }}
              className="mt-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Przypisany rower / sprzęt:
                  </label>
                  <select
                    name="bikeId"
                    defaultValue={editingComponent?.bikeId || selectedBikeId !== "all" ? selectedBikeId : bikes[0].id}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {bikes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kategoria:
                  </label>
                  <select
                    name="category"
                    defaultValue={editingComponent?.category || "chain"}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  >
                    <option value="chain">Łańcuch</option>
                    <option value="tire_rear">Opona tył / przód</option>
                    <option value="brake_pads_front">Klocki hamulcowe</option>
                    <option value="cassette">Kaseta</option>
                    <option value="sealant">Mleko uszczelniające Tubeless</option>
                    <option value="suspension_fork">Amortyzator / Widelec</option>
                    <option value="suspension_shock">Damper / Tylne zawieszenie</option>
                    <option value="bottom_bracket">Suport</option>
                    <option value="cables">Linki i pancerze</option>
                    <option value="shoes">Buty biegowe</option>
                    <option value="other">Inny komponent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nazwa komponentu:
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingComponent?.name || ""}
                  placeholder="np. Łańcuch Shimano CN-M8100 12s"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Metryka zużycia:
                  </label>
                  <select
                    name="trackingType"
                    defaultValue={editingComponent?.trackingType || "distance_km"}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  >
                    <option value="distance_km">Dystans (km)</option>
                    <option value="hours">Godziny (h)</option>
                    <option value="days">Dni (tubeless)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Limit (km / h / dni):
                  </label>
                  <input
                    type="number"
                    name="maxValue"
                    required
                    min={1}
                    defaultValue={editingComponent?.maxValue || 3000}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Przebieg początkowy:
                  </label>
                  <input
                    type="number"
                    name="baseValue"
                    min={0}
                    defaultValue={editingComponent?.baseValue || 0}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data montażu:
                  </label>
                  <input
                    type="date"
                    name="installedAt"
                    defaultValue={editingComponent?.installedAt || localTodayIso()}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Marka / Specyfikacja:
                  </label>
                  <input
                    type="text"
                    name="brandModel"
                    defaultValue={editingComponent?.brandModel || ""}
                    placeholder="np. Shimano Deore XT"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Uwagi / Zalecenia:
                </label>
                <input
                  type="text"
                  name="notes"
                  defaultValue={editingComponent?.notes || ""}
                  placeholder="np. Wosk Silca, sprawdzić przymiarem 0.5% co 500 km"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setAddComponentModal(false);
                    setEditingComponent(null);
                  }}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 text-white px-5 py-2 text-xs font-bold hover:bg-rose-500 shadow-sm"
                >
                  {editingComponent ? "Zapisz zmiany" : "Dodaj komponent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Bike */}
      {addBikeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bike className="h-5 w-5 text-rose-600" />
              <span>Dodaj Rower / Sprzęt</span>
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const name = (fd.get("name") as string)?.trim() || "Nowy Rower";
                const type = (fd.get("type") as BikeProfile["type"]) || "road";
                const newBike: BikeProfile = {
                  id: `bike_${Date.now()}`,
                  name,
                  type,
                };
                const updatedBikes = [...bikes, newBike];
                setBikes(updatedBikes);
                try {
                  localStorage.setItem("darierpro_bikes_list", JSON.stringify(updatedBikes));
                } catch {}
                setSelectedBikeId(newBike.id);
                setAddBikeModal(false);
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nazwa roweru:
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="np. Orbea Oiz M-PRO (MTB)"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Dyscyplina (do dopasowania aktywności):
                </label>
                <select
                  name="type"
                  defaultValue="road"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="road">🚴 Szosa (Road / Asfalt)</option>
                  <option value="gravel">🪨 Gravel (Szutry / All-road)</option>
                  <option value="mtb">🚵 MTB / XC (Góry / Teren)</option>
                  <option value="trainer">🏠 Trenażer (Zwift / Indoor)</option>
                  <option value="all_bikes">🌐 Wszystkie typy rowerów</option>
                  <option value="run">🏃 Buty biegowe (Biegi)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddBikeModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 text-white px-5 py-2 text-xs font-bold hover:bg-rose-500 shadow-sm"
                >
                  Dodaj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer: Książka Serwisowa */}
      {showLogDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-rose-600" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Książka Serwisowa i Historia Wymian
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLogDrawer(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Total Expense Summary */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500">Łączny koszt serwisu:</span>
                <div className="font-display text-xl font-black text-slate-900 dark:text-white">
                  {stats.totalSpent} PLN
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold px-2.5 py-1">
                {serviceLogs.length} wpisów
              </span>
            </div>

            {/* Log items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {serviceLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Brak wpisów w historii serwisowej. Wymień część, aby dodać pierwszy wpis.
                </div>
              ) : (
                serviceLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900/60 shadow-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {log.componentName}
                      </span>
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        {log.costPln ? `${log.costPln} PLN` : "0 PLN"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{log.bikeName}</span>
                      <span className="tabular-nums">{log.serviceDate}</span>
                    </div>

                    {log.mileageAtService && log.mileageAtService > 0 && (
                      <div className="text-[11px] text-slate-500">
                        Przebieg przy wymianie:{" "}
                        <strong className="text-slate-700 dark:text-slate-300">
                          {log.mileageAtService} km
                        </strong>
                      </div>
                    )}

                    {log.notes && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                        {log.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
