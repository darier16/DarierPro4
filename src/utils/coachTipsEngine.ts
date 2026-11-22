import type {
  CoachTipsReport,
  IntervalsActivity,
  IntervalsAthlete,
  IntervalsWellnessDay,
  PmcPoint,
  ZoneDistributionItem,
  WeeklyVolumePoint,
  EfficiencyPoint,
} from "../types/intervals";
import { computeSeilerPolarization } from "./analytics";

export function computeRealtimeCoachTips(params: {
  athlete: IntervalsAthlete;
  activities: IntervalsActivity[];
  wellness: IntervalsWellnessDay[];
  pmc: PmcPoint[];
  hrZones: ZoneDistributionItem[];
  powerZones: ZoneDistributionItem[];
  weeklyVolume: WeeklyVolumePoint[];
  efficiencySeries: EfficiencyPoint[];
}): CoachTipsReport {
  const { athlete, activities, wellness, pmc, hrZones, powerZones, weeklyVolume } = params;

  // 1. Current PMC & Load metrics
  const latestPmc = pmc[pmc.length - 1] || {
    date: new Date().toISOString().slice(0, 10),
    ctl: 55,
    atl: 50,
    tsb: 5,
    rampRate: 2,
  };
  const ctl = Math.round(latestPmc.ctl);
  const atl = Math.round(latestPmc.atl);
  const tsb = Math.round(latestPmc.tsb);

  // ACWR (Acute:Chronic Workload Ratio = ATL / CTL)
  const acwr = ctl > 0 ? Number((atl / ctl).toFixed(2)) : 1.0;

  // Ramp rate: CTL change over the last 7 days
  const pmc7DaysAgo = pmc.length >= 8 ? pmc[pmc.length - 8] : pmc[0];
  const rampRate7d = pmc7DaysAgo
    ? Number((latestPmc.ctl - pmc7DaysAgo.ctl).toFixed(1))
    : Number((latestPmc.rampRate || 0).toFixed(1));

  // 2. Wellness & Autonomic nervous system metrics
  const validWellness = wellness.filter(
    (w) => w.hrv || w.restingHR || w.sleepSecs || w.soreness || w.fatigue
  );
  const last7Wellness = validWellness.slice(-7);
  const baselineWellness = validWellness.slice(-30);

  // HRV (rMSSD)
  const recentHrvVals = last7Wellness
    .map((w) => w.hrv || w.hrvSDNN)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const baselineHrvVals = baselineWellness
    .map((w) => w.hrv || w.hrvSDNN)
    .filter((v): v is number => typeof v === "number" && v > 0);

  const currentHrv = recentHrvVals.length > 0 ? recentHrvVals[recentHrvVals.length - 1] : 58;
  const avgHrv7d =
    recentHrvVals.length > 0
      ? Math.round(recentHrvVals.reduce((s, v) => s + v, 0) / recentHrvVals.length)
      : currentHrv;
  const baselineHrv =
    baselineHrvVals.length > 0
      ? Math.round(baselineHrvVals.reduce((s, v) => s + v, 0) / baselineHrvVals.length)
      : avgHrv7d;
  const hrvDiffPct = baselineHrv > 0 ? Math.round(((avgHrv7d - baselineHrv) / baselineHrv) * 100) : 0;

  // Resting HR
  const recentRhrVals = last7Wellness
    .map((w) => w.restingHR)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const baselineRhrVals = baselineWellness
    .map((w) => w.restingHR)
    .filter((v): v is number => typeof v === "number" && v > 0);

  const currentRhr = recentRhrVals.length > 0 ? recentRhrVals[recentRhrVals.length - 1] : athlete.icu_resting_hr || 50;
  const baselineRhr =
    baselineRhrVals.length > 0
      ? Math.round(baselineRhrVals.reduce((s, v) => s + v, 0) / baselineRhrVals.length)
      : currentRhr;
  const rhrDiff = currentRhr - baselineRhr;

  // Sleep
  const recentSleepHours = last7Wellness
    .map((w) => (w.sleepSecs ? w.sleepSecs / 3600 : null))
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgSleepH =
    recentSleepHours.length > 0
      ? Number((recentSleepHours.reduce((s, v) => s + v, 0) / recentSleepHours.length).toFixed(1))
      : 7.5;
  const recentSleepScores = last7Wellness
    .map((w) => w.sleepScore || w.sleepQuality)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgSleepScore =
    recentSleepScores.length > 0
      ? Math.round(recentSleepScores.reduce((s, v) => s + v, 0) / recentSleepScores.length)
      : 80;

  // Subjective Soreness & Stress
  const recentSoreness = last7Wellness
    .map((w) => w.soreness)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgSoreness = recentSoreness.length > 0 ? recentSoreness[recentSoreness.length - 1] : 2;

  const recentStress = last7Wellness
    .map((w) => w.stress)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgStress = recentStress.length > 0 ? recentStress[recentStress.length - 1] : 2;

  // 3. Activity trends & Decoupling
  const recentActivities = activities.slice(0, 10);
  const recentDecoupling = recentActivities
    .map((a) => a.decoupling)
    .filter((d): d is number => typeof d === "number");
  const avgDecoupling =
    recentDecoupling.length > 0
      ? Number((recentDecoupling.reduce((s, v) => s + v, 0) / recentDecoupling.length).toFixed(1))
      : 2.5;

  const primaryZones = powerZones.reduce((s, z) => s + z.secs, 0) > 0 ? powerZones : hrZones;
  const pol = computeSeilerPolarization(primaryZones);

  // FTP & Power info
  const cyclingSettings = athlete.sportSettings?.find((s) =>
    s.types?.some((t) => t.toLowerCase().includes("ride"))
  );
  const ftp = cyclingSettings?.ftp || 250;

  // 4. Determine Readiness Status & Score
  let readinessScore = 80;

  // Adjust for TSB
  if (tsb >= 5 && tsb <= 20) readinessScore += 10;
  else if (tsb >= -10 && tsb < 5) readinessScore += 5;
  else if (tsb >= -25 && tsb < -10) readinessScore -= 5;
  else if (tsb < -25) readinessScore -= 18;

  // Adjust for HRV
  if (hrvDiffPct >= 5) readinessScore += 6;
  else if (hrvDiffPct <= -8) readinessScore -= 10;

  // Adjust for RHR
  if (rhrDiff >= 4) readinessScore -= 8;
  else if (rhrDiff <= -2) readinessScore += 4;

  // Adjust for Sleep
  if (avgSleepH < 6.5) readinessScore -= 10;
  else if (avgSleepH >= 7.8) readinessScore += 5;

  // Adjust for ACWR
  if (acwr > 1.45) readinessScore -= 12;
  else if (acwr >= 0.85 && acwr <= 1.25) readinessScore += 5;

  readinessScore = Math.max(25, Math.min(98, Math.round(readinessScore)));

  let readinessStatus: "optimal" | "good" | "caution" | "overload" = "good";
  if (readinessScore >= 82) readinessStatus = "optimal";
  else if (readinessScore >= 68) readinessStatus = "good";
  else if (readinessScore >= 50) readinessStatus = "caution";
  else readinessStatus = "overload";

  // 5. Diagnostics text synthesis
  const hrvStatusText =
    hrvDiffPct >= 3
      ? `Zmienność rytmu serca (HRV ${currentHrv} ms, ▲+${hrvDiffPct}% vs baseline) wskazuje na przewagę układu przywspółczulnego (parasympatycznego) i wysoki potencjał regeneracyjny.`
      : hrvDiffPct <= -6
      ? `Zmienność rytmu serca (HRV ${currentHrv} ms, ▼${Math.abs(hrvDiffPct)}% poniżej normy) sygnalizuje podwyższony ton współczulny i kumulację zmęczenia obwodowego.`
      : `Zmienność rytmu serca (HRV ${currentHrv} ms) utrzymuje się w stabilnym korytarzu fizjologicznym.`;

  const sleepStatusText =
    avgSleepH >= 7.5
      ? `Średnia długość snu (${avgSleepH}h/dobę) w pełni zaspokaja zapotrzebowanie na fazy głębokie i wyrzut hormonu wzrostu.`
      : `Średnia długość snu wynosi ${avgSleepH}h i wykazuje lekki deficyt regeneracyjny, który może spowalniać resyntezę glikogenu.`;

  const healthStatus = `${hrvStatusText} Tętno spoczynkowe na poziomie ${currentRhr} bpm (${rhrDiff > 0 ? `+${rhrDiff} bpm vs norma` : "w normie"}). ${sleepStatusText}`;

  const formStatus =
    tsb >= 10
      ? `Baza tlenowa wynosi CTL ${ctl}, a wskaźnik świeżości TSB (+${tsb}) oznacza fazę szczytowej gotowości startowej (Taper). Organizm zredukował zmęczenie i jest gotowy na maksymalny wysiłek docelowy.`
      : tsb >= -10
      ? `Twoja forma wynosi CTL ${ctl} przy zrównoważonym zmęczeniu (TSB ${tsb >= 0 ? `+${tsb}` : tsb}). Znajdujesz się w optymalnym oknie adaptacyjnym łączącym wysoką sprawność z bezpieczną regeneracją.`
      : tsb >= -25
      ? `Wskaźnik formy CTL wynosi ${ctl}, a ostre zmęczenie ATL ${atl} (TSB ${tsb}). Trwa intensywny blok budowania formy (Overload/Build) wymagający skrupulatnej higieny snu i węglowodanów.`
      : `Znaczne zmęczenie organizmu (TSB ${tsb}, ATL ${atl} przy CTL ${ctl}). Układ mięśniowy i nerwowy są silnie obciążone, co wymaga natychmiastowego wdrożenia mikrocyklu regeneracyjnego.`;

  const fatigueStatus =
    acwr > 1.35
      ? `Wskaźnik ostrego do przewlekłego obciążenia ACWR wynosi ${acwr} (>1.35) — oznacza to podwyższone ryzyko przeciążenia narządu ruchu. Należy unikać gwałtownych skoków objętości.`
      : `Wskaźnik obciążenia ACWR wynosi ${acwr} (strefa 'Sweet Spot' 0.8-1.3) oraz tempo przyrostu ${rampRate7d >= 0 ? `+${rampRate7d}` : rampRate7d} TSS/tydzień, co gwarantuje bezpieczną progresję bez ryzyka przetrenowania.`;

  const verdict =
    readinessStatus === "optimal"
      ? "Wysoka gotowość fizjologiczna: idealny moment na wykonanie kluczowego akcentu progowego lub start w zawodach."
      : readinessStatus === "good"
      ? "Stabilny stan organizmu: realizuj zaplanowany trening tlenowy lub umiarkowane interwały tempowe."
      : readinessStatus === "caution"
      ? "Organizm wykazuje oznaki zmęczenia: ogranicz intensywność do stref Z1-Z2 i skup się na pełnej regeneracji."
      : "Przeciążenie fizjologiczne: zalecany bezwzględny dzień odpoczynku (Rest Day) lub krótki rozjazd regeneracyjny w strefie Z1.";

  // 6. Biomarkers table
  const biomarkersTable = [
    {
      param: "HRV (rMSSD / Zmienność rytmu)",
      currentValue: `${currentHrv} ms`,
      normBaseline: `${baselineHrv} ms (baseline 30d)`,
      status: (hrvDiffPct >= 2 ? "optimal" : hrvDiffPct >= -6 ? "info" : "warning") as "optimal" | "warning" | "alert" | "info",
      impact:
        hrvDiffPct >= 2
          ? "Równowaga przywspółczulna OUN; pełna zdolność do adaptacji mocnego bodźca"
          : hrvDiffPct >= -6
          ? "Prawidłowy ton wegetatywny w granicach normy fizjologicznej"
          : "Stres współczulny; układ nerwowy potrzebuje dłuższego czasu na odbudowę",
    },
    {
      param: "Tętno spoczynkowe (RHR)",
      currentValue: `${currentRhr} bpm`,
      normBaseline: `${baselineRhr} bpm (norma)`,
      status: (rhrDiff <= 1 ? "optimal" : rhrDiff <= 4 ? "info" : "warning") as "optimal" | "warning" | "alert" | "info",
      impact:
        rhrDiff <= 1
          ? "Prawidłowa hemodynamika spoczynkowa i brak ukrytego stanu zapalnego"
          : "Lekkie podwyższenie rzutu serca wskutek niepełnej resyntezy glikogenu lub odwodnienia",
    },
    {
      param: "Długość i jakość snu",
      currentValue: `${avgSleepH} godz.`,
      normBaseline: "7.5 - 8.5 godz.",
      status: (avgSleepH >= 7.3 ? "optimal" : avgSleepH >= 6.5 ? "info" : "warning") as "optimal" | "warning" | "alert" | "info",
      impact:
        avgSleepH >= 7.3
          ? "Prawidłowa faza snu wolnofalowego (NREM 3) i wysoki wyrzut hormonu wzrostu"
          : "Obniżona resynteza białek mięśniowych i opóźnione oczyszczanie metabolitów",
    },
    {
      param: "Wynik regeneracji snu (Sleep Score)",
      currentValue: `${avgSleepScore} / 100`,
      normBaseline: "80 - 100 pkt",
      status: (avgSleepScore >= 80 ? "optimal" : avgSleepScore >= 68 ? "info" : "warning") as "optimal" | "warning" | "alert" | "info",
      impact:
        avgSleepScore >= 80
          ? "Wysoka efektywność snu, optymalna regeneracja centralnego układu nerwowego"
          : "Spadek efektywności snu; zalecane unikanie kofeiny i ekranów przed snem",
    },
    {
      param: "Bolesność mięśniowa (DOMS)",
      currentValue: `${avgSoreness} / 5 (${avgSoreness <= 2 ? "Niska" : avgSoreness === 3 ? "Umiarkowana" : "Wysoka"})`,
      normBaseline: "1 - 2 / 5",
      status: (avgSoreness <= 2 ? "optimal" : avgSoreness === 3 ? "info" : "warning") as "optimal" | "warning" | "alert" | "info",
      impact:
        avgSoreness <= 2
          ? "Brak mikrouszkodzeń włókien sarkomerowych; gotowość na pełną pracę siłową"
          : "Mikrouszkodzenia mięśniowe; unikaj gwałtownych zrywów i sprintów beztlenowych",
    },
    {
      param: "Poziom stresu i napięcia",
      currentValue: `${avgStress} / 5 (${avgStress <= 2 ? "Niski" : avgStress === 3 ? "Średni" : "Podwyższony"})`,
      normBaseline: "1 - 2 / 5",
      status: (avgStress <= 2 ? "optimal" : avgStress === 3 ? "info" : "warning") as "optimal" | "warning" | "alert" | "info",
      impact:
        avgStress <= 2
          ? "Niski poziom kortyzolu sprzyjający anabolizmowi powysiłkowemu"
          : "Konkurencja stresorów pozasportowych z adaptacją treningową",
    },
  ];

  // 7. Load and form table
  const loadAndFormTable = [
    {
      metric: "Forma długoterminowa (CTL / Fitness)",
      value: `${ctl} TSS`,
      interpretation: "Miara Twojej bazy tlenowej i długoterminowej odporności na obciążenia (42 dni).",
      riskLevel: "low" as const,
    },
    {
      metric: "Zmęczenie ostre (ATL / Fatigue)",
      value: `${atl} TSS`,
      interpretation: "Bieżące obciążenie z ostatnich 7 dni; odzwierciedla nagromadzone zmęczenie.",
      riskLevel: (atl > 85 ? "moderate" : "low") as "low" | "moderate" | "high",
    },
    {
      metric: "Bilans Świeżości (TSB / Form)",
      value: `${tsb >= 0 ? `+${tsb}` : tsb} TSS`,
      interpretation:
        tsb > 5
          ? "Strefa świeżości: wysoka dynamika i gotowość do mocnej jazdy."
          : tsb >= -10
          ? "Strefa neutralna: bezpieczny trening z dobrą adaptacją."
          : "Strefa zmęczenia: budowanie formy kosztem bieżącej świeżości.",
      riskLevel: (tsb < -25 ? "high" : tsb < -15 ? "moderate" : "low") as "low" | "moderate" | "high",
    },
    {
      metric: "Stosunek obciążeń (ACWR = ATL/CTL)",
      value: `${acwr}`,
      interpretation:
        acwr >= 0.8 && acwr <= 1.3
          ? "Strefa optymalna (Sweet Spot 0.8-1.3) — minimalne ryzyko przeciążenia."
          : acwr > 1.35
          ? "Strefa ostrzegawcza (>1.35) — zbyt szybki skok obciążeń w ostatnich 7 dniach."
          : "Strefa roztrenowania (<0.8) — spadek stymulacji fizjologicznej.",
      riskLevel: (acwr > 1.35 ? "high" : acwr > 1.25 ? "moderate" : "low") as "low" | "moderate" | "high",
    },
    {
      metric: "Tempo przyrostu (Ramp Rate 7d)",
      value: `${rampRate7d >= 0 ? `+${rampRate7d}` : rampRate7d} TSS/tydzień`,
      interpretation:
        Math.abs(rampRate7d) <= 6
          ? "Wzorcowa progresja (optymalnie 3-6 TSS/tydzień)."
          : rampRate7d > 8
          ? "Agresywny przyrost obciążenia; ryzyko załamania adaptacji."
          : "Stabilizacja lub spadek obciążenia w ramach regeneracji.",
      riskLevel: (rampRate7d > 8 ? "moderate" : "low") as "low" | "moderate" | "high",
    },
    {
      metric: "Dryf tętna (Decoupling tlenowy)",
      value: `${avgDecoupling}%`,
      interpretation:
        avgDecoupling <= 3.5
          ? "Znakomita wydolność tlenowa — tętno nie dryfuje wraz z upływem czasu."
          : avgDecoupling <= 5.5
          ? "Prawidłowy dryf tlenowy w normie fizjologicznej (<5%)."
          : "Zauważalny dryf (>5%) — spadek wydolności tlenowej lub odwodnienie.",
      riskLevel: (avgDecoupling > 5.5 ? "moderate" : "low") as "low" | "moderate" | "high",
    },
    {
      metric: "Polaryzacja obciążeń (Model Seilera)",
      value: `${pol.lowPercent}% Z1-Z2 / ${pol.midPercent}% Z3-Z4 / ${pol.highPercent}% Z5+`,
      interpretation: `Aktualny model: ${pol.modelLabel}. Zalecany standard: ~80% w strefach Z1-Z2.`,
      riskLevel: (pol.midPercent > 30 ? "moderate" : "low") as "low" | "moderate" | "high",
    },
  ];

  // 8. Actionable plan table for 48-72h
  const isHighReadiness = readinessStatus === "optimal";
  const isModerateReadiness = readinessStatus === "good";

  const actionablePlanTable = [
    {
      timeWindow: "Dzisiaj",
      recommendedWorkout: isHighReadiness
        ? "Akcent Sweet Spot / Próg FTP: 3 x 12 min"
        : isModerateReadiness
        ? "Wytrzymałość Tlenowa Z2 z płynną kadencją"
        : "Rozjazd regeneracyjny Active Recovery Z1 lub wolne",
      intensityZone: isHighReadiness ? "Z4 / Sweet Spot (88-94% FTP)" : isModerateReadiness ? "Z2 Tlenowa (56-75% FTP)" : "Z1 Aktywna Regeneracja (<55% FTP)",
      targetWattsOrHr: isHighReadiness
        ? `${Math.round(ftp * 0.88)} - ${Math.round(ftp * 0.94)} W`
        : isModerateReadiness
        ? `${Math.round(ftp * 0.60)} - ${Math.round(ftp * 0.72)} W`
        : `< ${Math.round(ftp * 0.55)} W (tętno < 120 bpm)`,
      durationMin: isHighReadiness ? 90 : isModerateReadiness ? 80 : 45,
      rationale: isHighReadiness
        ? "Wysoka gotowość układu autonomicznego i świeżość pozwalają na wygenerowanie silnego bodźca adaptacyjnego."
        : isModerateReadiness
        ? "Budowanie gęstości mitochondriów i utleniania kwasów tłuszczowych bez obciążania układu nerwowego."
        : "Przyspieszenie przepływu krwi i wypłukania metabolitów bez generowania mikrouszkodzeń.",
    },
    {
      timeWindow: "Jutro",
      recommendedWorkout: isHighReadiness
        ? "Wytrzymałość Tlenowa Z2 (Baza i objętość)"
        : isModerateReadiness
        ? "Trening Tempowy Z3 z interwałami pod górę"
        : "Trening Tlenowy Z2 z kontrolą tętna spoczynkowego",
      intensityZone: isHighReadiness ? "Z2 (60-72% FTP)" : isModerateReadiness ? "Z3 Tempo (76-85% FTP)" : "Z2 (55-65% FTP)",
      targetWattsOrHr: isHighReadiness
        ? `${Math.round(ftp * 0.62)} - ${Math.round(ftp * 0.72)} W`
        : isModerateReadiness
        ? `${Math.round(ftp * 0.76)} - ${Math.round(ftp * 0.85)} W`
        : `${Math.round(ftp * 0.58)} - ${Math.round(ftp * 0.68)} W`,
      durationMin: isHighReadiness ? 105 : isModerateReadiness ? 75 : 60,
      rationale: isHighReadiness
        ? "Konsolidacja bodźca progowego poprzez spokojną objętość tlenową."
        : "Umiarkowana stymulacja glikolityczna z pełną kontrolą tętna.",
    },
    {
      timeWindow: "Pojutrze",
      recommendedWorkout: "Dzień Regeneracji (Rest) lub Mobilność i Core",
      intensityZone: "Strefa Regeneracyjna Z0/Z1",
      targetWattsOrHr: "Dowolne tempo konwersacyjne lub ćwiczenia rozciągające",
      durationMin: 30,
      rationale: "Niezbędny dzień superkompensacji przed kolejnym blokiem treningowym w mikrocyklu.",
    },
  ];

  // 9. Coaching tips: What to do & What to watch out for
  const whatToDoToday = isHighReadiness
    ? [
        "Wykonaj solidną rozgrzewkę 20 minut z 3 przyspieszeniami 30-sekundowymi w kadencji 105 rpm.",
        `W części głównej utrzymuj równą moc w strefie Sweet Spot (${Math.round(ftp * 0.88)}-${Math.round(ftp * 0.94)} W).`,
        "Zadbaj o kadencję 90-95 rpm, aby oszczędzać glikogen w mięśniach i odciążyć stawy kolanowe.",
        "Po powrocie wykonaj 10 minut schłodzenia w strefie Z1 z luźnym pedałowaniem.",
      ]
    : isModerateReadiness
    ? [
        "Utrzymuj stabilną, konwersacyjną intensywność w strefie Z2 (tętno poniżej progu tlenowego LT1).",
        "Kontroluj płynność pedałowania i unikaj niepotrzebnych zrywów na krótkich podjazdach.",
        "Pij 500-750 ml płynów z elektrolitami na każdą godzinę jazdy.",
        "Włącz 10 minut rozciągania mięśni czworogłowych, kulszowo-goleniowych i pasma biodrowo-piszczelowego.",
      ]
    : [
        "Odpocznij całkowicie lub zrób maksymalnie 40-45 minut lekkiego rozjazdu z tętnem w strefie regeneracyjnej.",
        "Priorytetem dnia jest sen, uzupełnienie płynów i pełnowartościowy posiłek regeneracyjny.",
        "Skorzystaj z rolowania powięziowego (foam rolling) i chłodnych/naprzemiennych natrysków.",
        "Zaplanuj minimum 8 godzin snu w dobrze wywietrzonym, chłodnym pomieszczeniu.",
      ];

  const whatToWatchOutFor = [
    `Dryf tętna (Decoupling): jeśli po 60 minutach tętno rośnie o >5% przy stałej mocy, oznacza to spadek rezerwy tlenowej lub odwodnienie — skróć trening.`,
    `Poranne tętno spoczynkowe: jeśli jutro rano RHR wzrośnie o więcej niż 4 bpm w stosunku do normy (${baselineRhr} bpm), bezwzględnie zrezygnuj z mocnych interwałów.`,
    `Zmienność rytmu serca (HRV): spadek o >10% po dzisiejszym dniu będzie sygnałem do wdrożenia natychmiastowego dnia wolnego.`,
    `Wskaźnik ACWR (${acwr}): utrzymuj tygodniowy przyrost obciążenia TSS poniżej 8 punktów, aby uniknąć przeciążenia ścięgien Achillesa i więzadeł rzepki.`,
  ];

  const nutritionAndRecovery = [
    `Węglowodany w trakcie wysiłku: celuj w 40-60 g węglowodanów na godzinę (np. izotonik + banan/żel) przy treningu >60 minut.`,
    `Okno węglowodanowo-białkowe: w ciągu 30 minut po treningu spożyj 20-25 g pełnowartościowego białka i 1 g węglowodanów/kg masy ciała.`,
    `Nawodnienie: minimum 30-35 ml wody na kg masy ciała dziennie (${Math.round((athlete.weight || 75) * 0.035 * 10) / 10} L), z dodatkiem sodu i magnezu.`,
    `Higiena snu: temperatura w sypialni 18-19°C, odstawienie niebieskiego światła na 60 minut przed snem dla optymalnego wyrzutu melatoniny.`,
  ];

  return {
    readinessStatus,
    readinessScore,
    summaryDiagnosis: {
      healthStatus,
      formStatus,
      fatigueStatus,
      verdict,
    },
    biomarkersTable,
    loadAndFormTable,
    actionablePlanTable,
    coachingTips: {
      whatToDoToday,
      whatToWatchOutFor,
      nutritionAndRecovery,
    },
    sourceType: "realtime",
    generatedAt: new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
  };
}
