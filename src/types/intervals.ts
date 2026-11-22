export interface ZoneTimeEntry {
  id: string;
  secs: number;
}

export interface IntervalsSportSetting {
  types?: string[];
  ftp?: number;
  lthr?: number;
  max_hr?: number;
  threshold_pace?: number;
  power_zones?: number[];
  hr_zones?: number[];
}

export interface IntervalsAthlete {
  id: string;
  name?: string;
  firstname?: string;
  lastname?: string;
  weight?: number;
  icu_resting_hr?: number;
  sportSettings?: IntervalsSportSetting[];
}

export interface IntervalsActivity {
  id: string;
  start_date_local: string;
  type: string;
  name: string;
  description?: string | null;
  moving_time: number;
  elapsed_time?: number;
  distance: number;
  total_elevation_gain?: number;
  average_speed?: number;
  average_watts?: number | null;
  icu_weighted_avg_watts?: number | null;
  icu_training_load?: number | null;
  icu_intensity?: number | null;
  icu_ftp?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  icu_efficiency_factor?: number | null;
  decoupling?: number | null;
  icu_ctl?: number | null;
  icu_atl?: number | null;
  icu_zone_times?: Array<ZoneTimeEntry | number> | null;
  icu_hr_zone_times?: Array<ZoneTimeEntry | number> | null;
  icu_rpe?: number | null;
  feel?: number | null;
  calories?: number | null;
  trainer?: boolean | null;
  source?: string | null;
}

export interface IntervalsWellnessDay {
  id: string; // YYYY-MM-DD
  ctl?: number | null;
  atl?: number | null;
  rampRate?: number | null;
  ctlLoad?: number | null;
  atlLoad?: number | null;
  weight?: number | null;
  bodyFat?: number | null;
  restingHR?: number | null;
  hrv?: number | null;
  hrvSDNN?: number | null;
  sleepSecs?: number | null;
  sleepScore?: number | null;
  sleepQuality?: number | null;
  avgSleepingHR?: number | null;
  respiration?: number | null;
  spO2?: number | null;
  steps?: number | null;
  vo2max?: number | null;
  readiness?: number | null;
  fatigue?: number | null;
  soreness?: number | null;
  stress?: number | null;
  mood?: number | null;
  motivation?: number | null;
  hydration?: number | null;
}

export interface IntervalsIntervalSplit {
  id?: number | string;
  type?: string;
  label?: string;
  moving_time?: number;
  elapsed_time?: number;
  distance?: number;
  average_watts?: number | null;
  weighted_average_watts?: number | null;
  max_watts?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  average_speed?: number | null;
  zone?: number | null;
  intensity?: number | null;
}

export interface IntervalsActivityDetail extends IntervalsActivity {
  icu_intervals?: IntervalsIntervalSplit[];
}

export interface PmcPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  tss: number;
  rampRate: number;
}

export interface WeeklyVolumePoint {
  weekStart: string;
  weekLabel: string;
  durationHours: number;
  distanceKm: number;
  elevationM: number;
  tss: number;
  sessions: number;
}

export interface ZoneDistributionItem {
  zone: string;
  label: string;
  secs: number;
  percent: number;
  color: string;
}

export interface EfficiencyPoint {
  date: string;
  name: string;
  type: string;
  ef: number;
  decoupling: number | null;
  durationMin: number;
  avgHr: number | null;
  npOrWatts: number | null;
}

export interface SportBreakdownItem {
  category: string;
  label: string;
  sessions: number;
  durationHours: number;
  distanceKm: number;
  tss: number;
  sharePercent: number;
}

export interface AutomatedInsight {
  id: string;
  severity: "nominal" | "caution" | "warning";
  title: string;
  detail: string;
}

export interface WorkoutBlock {
  label: string;
  minutes: number;
  intensityPct: number;
  zone: "Z1" | "Z2" | "Z3" | "Z4" | "Z5" | "Z6";
}

export interface PlannedWorkoutDay {
  day: string;
  focus: string;
  workoutType: "Ride" | "Run" | "Swim" | "Strength" | "Rest";
  intensity: string;
  duration: string;
  durationMin: number;
  estimatedTss: number;
  zoneBucket: "rest" | "z1z2" | "z3z4" | "z5plus";
  coachRationale: string;
  blocks: WorkoutBlock[];
}

export interface AiAnalysisReport {
  readinessScore: number;
  readinessVerdict: string;
  readinessStatus: "optimal" | "build" | "caution" | "overload";
  executiveSummary: string;
  loadAndRecovery: string;
  zonesAndPolarization: string;
  aerobicEfficiency: string;
  strengths: string[];
  riskFlags: string[];
  nextSevenDaysPlan: PlannedWorkoutDay[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CoachTipsBiomarker {
  param: string;
  currentValue: string;
  normBaseline: string;
  status: "optimal" | "warning" | "alert" | "info";
  impact: string;
}

export interface CoachTipsLoadMetric {
  metric: string;
  value: string;
  interpretation: string;
  riskLevel: "low" | "moderate" | "high";
}

export interface CoachTipsActionPlan {
  timeWindow: string;
  recommendedWorkout: string;
  intensityZone: string;
  targetWattsOrHr: string;
  durationMin: number;
  rationale: string;
}

export interface CoachTipsReport {
  readinessStatus: "optimal" | "good" | "caution" | "overload";
  readinessScore: number;
  summaryDiagnosis: {
    healthStatus: string;
    formStatus: string;
    fatigueStatus: string;
    verdict: string;
  };
  biomarkersTable: CoachTipsBiomarker[];
  loadAndFormTable: CoachTipsLoadMetric[];
  actionablePlanTable: CoachTipsActionPlan[];
  coachingTips: {
    whatToDoToday: string[];
    whatToWatchOutFor: string[];
    nutritionAndRecovery: string[];
  };
  generatedAt?: string;
  sourceType?: "ai" | "realtime";
}

export interface IntervalsEvent {
  id?: number | string;
  start_date_local: string;
  category?: string; // WORKOUT, RACE_A, RACE_B, NOTE, etc.
  type?: string;
  name?: string;
  description?: string | null;
  moving_time?: number | null;
  icu_training_load?: number | null;
  icu_intensity?: number | null;
}

export interface PowerCurveSet {
  id: string;
  secs: number[];
  watts: number[];
  watts_per_kg?: number[];
}

export interface PaceCurveSet {
  id: string;
  secs?: number[];
  distance?: number[];
  pace?: number[];
  speed?: number[];
}

export interface ActivityStreams {
  time: number[];
  watts?: Array<number | null>;
  heartrate?: Array<number | null>;
  cadence?: Array<number | null>;
  altitude?: Array<number | null>;
  velocity_smooth?: Array<number | null>;
}

export interface TrainingGoals {
  weeklyHours: number;
  weeklyTss: number;
  weeklyKm: number;
  targetCtl: number;
}

export interface IntervalsSyncPayload {
  athlete: IntervalsAthlete;
  activities: IntervalsActivity[];
  wellness: IntervalsWellnessDay[];
  events?: IntervalsEvent[];
  powerCurves?: PowerCurveSet[];
  paceCurves?: PaceCurveSet[];
  syncedAt: string;
  source: "api" | "file" | "strava";
}
