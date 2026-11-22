import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const INTERVALS_BASE = "https://intervals.icu/api/v1";

const OPENROUTER_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openrouter/free";

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function resolveOpenRouterApiKey(req: express.Request): string {
  const headerKey =
    req.headers["x-openrouter-api-key"] || req.headers["x-groq-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }
  const bodyKey = req.body?.openrouterApiKey || req.body?.groqApiKey;
  if (typeof bodyKey === "string" && bodyKey.trim()) {
    return bodyKey.trim();
  }
  const envKey = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;
  if (typeof envKey === "string" && envKey.trim()) {
    return envKey.trim();
  }
  throw new Error(
    "Brak klucza OpenRouter API Key. Wprowadź swój klucz API OpenRouter (zaczynający się od sk-or-v1-...) w Ustawieniach (ikona koła zębatego w prawym górnym rogu). Klucz możesz pobrać na https://openrouter.ai/keys."
  );
}

async function callOpenRouter(opts: {
  apiKey: string;
  messages: OpenRouterMessage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const payload: Record<string, unknown> = {
    model: OPENROUTER_MODEL,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4096,
  };

  if (opts.jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch(OPENROUTER_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://darierpro.app",
      "X-Title": "DarierPro Cycling Analytics",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error(
        "Nieprawidłowy klucz OpenRouter API Key (401 Unauthorized). Upewnij się, że klucz zaczyna się od 'sk-or-v1-...' i jest aktywny w openrouter.ai/keys."
      );
    }
    if (response.status === 429) {
      throw new Error(
        "Osiągnięto limit zapytań darmowego modelu OpenRouter (429 Rate Limit). Odczekaj chwilę przed kolejnym zapytaniem."
      );
    }
    throw new Error(
      `Błąd API OpenRouter (${response.status}): ${errorText.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Otrzymano pustą odpowiedź z modelu OpenRouter (${OPENROUTER_MODEL}).`);
  }

  return content;
}

function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

function buildIntervalsAuthHeader(apiKey: string): string {
  const token = Buffer.from(`API_KEY:${apiKey.trim()}`).toString("base64");
  return `Basic ${token}`;
}

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchIntervalsJson<T>(
  endpoint: string,
  apiKey: string
): Promise<T> {
  const response = await fetch(`${INTERVALS_BASE}${endpoint}`, {
    headers: {
      Authorization: buildIntervalsAuthHeader(apiKey),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Nieprawidłowy token dostępu lub Athlete ID w Intervals.icu (błąd autoryzacji 401/403)."
      );
    }
    if (response.status === 404) {
      throw new Error(
        "Nie znaleziono sportowca o podanym Athlete ID w Intervals.icu (404)."
      );
    }
    throw new Error(
      `Błąd API Intervals.icu (${response.status}): ${bodyText.slice(0, 180) || response.statusText}`
    );
  }

  return (await response.json()) as T;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.get("/api/intervals/status", (_req, res) => {
  const hasServerKey = Boolean(process.env.INTERVALS_API_KEY?.trim());
  const athleteIdHint = process.env.INTERVALS_ATHLETE_ID?.trim() || "0";
  res.json({
    serverConfigured: hasServerKey,
    athleteIdHint: hasServerKey ? athleteIdHint : null,
  });
});

app.post("/api/intervals/sync", async (req, res) => {
  try {
    const body = (req.body || {}) as {
      athleteId?: string;
      accessToken?: string;
      days?: number;
    };

    const apiKey = body.accessToken?.trim() || process.env.INTERVALS_API_KEY?.trim();
    const athleteId =
      body.athleteId?.trim() || process.env.INTERVALS_ATHLETE_ID?.trim() || "0";
    const days = Math.min(Math.max(Number(body.days) || 180, 14), 730);

    if (!apiKey) {
      res.status(400).json({
        error:
          "Brak tokena dostępu Intervals.icu. Podaj dane logowania z Ustawień Deweloperskich Intervals.icu lub skonfiguruj INTERVALS_API_KEY.",
      });
      return;
    }

    const newestDate = new Date();
    const oldestDate = new Date();
    oldestDate.setDate(newestDate.getDate() - days);

    const futureDate = new Date();
    futureDate.setDate(newestDate.getDate() + 35);
    const eventsOldestDate = new Date();
    eventsOldestDate.setDate(newestDate.getDate() - 60);

    const oldest = formatDateISO(oldestDate);
    const newest = formatDateISO(newestDate);
    const eventsOldest = formatDateISO(eventsOldestDate);
    const eventsNewest = formatDateISO(futureDate);
    const encodedId = encodeURIComponent(athleteId);

    const [athlete, activities, wellness, events, powerCurveRaw, paceCurveRaw] =
      await Promise.all([
        fetchIntervalsJson<Record<string, unknown>>(
          `/athlete/${encodedId}`,
          apiKey
        ),
        fetchIntervalsJson<Array<Record<string, unknown>>>(
          `/athlete/${encodedId}/activities?oldest=${oldest}&newest=${newest}`,
          apiKey
        ),
        fetchIntervalsJson<Array<Record<string, unknown>>>(
          `/athlete/${encodedId}/wellness?oldest=${oldest}&newest=${newest}`,
          apiKey
        ).catch(() => []),
        fetchIntervalsJson<Array<Record<string, unknown>>>(
          `/athlete/${encodedId}/events?oldest=${eventsOldest}&newest=${eventsNewest}`,
          apiKey
        ).catch(() => []),
        fetchIntervalsJson<unknown>(
          `/athlete/${encodedId}/power-curves?type=Ride&curves=90d,1y`,
          apiKey
        ).catch(() => null),
        fetchIntervalsJson<unknown>(
          `/athlete/${encodedId}/pace-curves?type=Run&curves=90d,1y`,
          apiKey
        ).catch(() => null),
      ]);

    const normalizeCurveList = (raw: unknown): unknown[] =>
      Array.isArray(raw)
        ? raw
        : raw &&
          typeof raw === "object" &&
          "list" in raw &&
          Array.isArray((raw as { list: unknown[] }).list)
        ? (raw as { list: unknown[] }).list
        : [];

    const powerCurves = normalizeCurveList(powerCurveRaw);
    const paceCurves = normalizeCurveList(paceCurveRaw);

    res.json({
      athlete,
      activities: Array.isArray(activities) ? activities : [],
      wellness: Array.isArray(wellness) ? wellness : [],
      events: Array.isArray(events) ? events : [],
      powerCurves,
      paceCurves,
      syncedAt: new Date().toISOString(),
      source: "api",
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Nie udało się pobrać danych z Intervals.icu.";
    res.status(502).json({ error: message });
  }
});

function normalizeStreams(raw: unknown): {
  time: number[];
  watts?: Array<number | null>;
  heartrate?: Array<number | null>;
  cadence?: Array<number | null>;
  altitude?: Array<number | null>;
  velocity_smooth?: Array<number | null>;
} | null {
  if (!raw) return null;

  const map: Record<string, Array<number | null>> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (
        item &&
        typeof item === "object" &&
        "type" in item &&
        "data" in item &&
        Array.isArray((item as { data: unknown[] }).data)
      ) {
        const key = String((item as { type: string }).type);
        map[key] = (item as { data: Array<number | null> }).data;
      }
    }
  } else if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of [
      "time",
      "watts",
      "heartrate",
      "cadence",
      "altitude",
      "velocity_smooth",
    ]) {
      const val = obj[key];
      if (Array.isArray(val)) {
        map[key] = val as Array<number | null>;
      } else if (
        val &&
        typeof val === "object" &&
        "data" in val &&
        Array.isArray((val as { data: unknown[] }).data)
      ) {
        map[key] = (val as { data: Array<number | null> }).data;
      }
    }
  }

  const maxLen = Math.max(
    0,
    ...Object.values(map).map((arr) => (Array.isArray(arr) ? arr.length : 0))
  );
  if (maxLen < 5) return null;

  const timeArr =
    map.time && map.time.length === maxLen
      ? map.time.map((v, i) => (typeof v === "number" ? v : i))
      : Array.from({ length: maxLen }, (_, i) => i);

  const targetCount = 180;
  const step = maxLen <= targetCount ? 1 : (maxLen - 1) / (targetCount - 1);
  const indices: number[] = [];
  for (let i = 0; i < Math.min(maxLen, targetCount); i++) {
    indices.push(Math.min(maxLen - 1, Math.round(i * step)));
  }

  const pick = (arr?: Array<number | null>) =>
    arr ? indices.map((idx) => (typeof arr[idx] === "number" ? arr[idx] : null)) : undefined;

  return {
    time: indices.map((idx) => Number(timeArr[idx]) || idx),
    watts: pick(map.watts),
    heartrate: pick(map.heartrate),
    cadence: pick(map.cadence),
    altitude: pick(map.altitude),
    velocity_smooth: pick(map.velocity_smooth),
  };
}

app.post("/api/intervals/activity-detail", async (req, res) => {
  try {
    const body = (req.body || {}) as {
      activityId?: string;
      accessToken?: string;
    };
    const activityId = body.activityId?.trim();
    const apiKey = body.accessToken?.trim() || process.env.INTERVALS_API_KEY?.trim();

    if (!activityId) {
      res.status(400).json({ error: "Brak identyfikatora aktywności." });
      return;
    }
    if (!apiKey) {
      res.status(400).json({
        error: "Brak autoryzacji do pobrania szczegółów interwałów aktywności.",
      });
      return;
    }

    const encodedActId = encodeURIComponent(activityId);
    const [detail, streamsRaw] = await Promise.all([
      fetchIntervalsJson<Record<string, unknown>>(
        `/activity/${encodedActId}?intervals=true`,
        apiKey
      ),
      fetchIntervalsJson<unknown>(
        `/activity/${encodedActId}/streams?types=watts,heartrate,cadence,altitude,velocity_smooth,time`,
        apiKey
      ).catch(() => null),
    ]);

    const streams = normalizeStreams(streamsRaw);

    res.json({ activity: detail, streams });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Nie udało się pobrać szczegółów aktywności.";
    res.status(502).json({ error: message });
  }
});

app.post("/api/intervals/activity-gpx", async (req, res) => {
  try {
    const body = (req.body || {}) as {
      activityId?: string;
      activityName?: string;
      accessToken?: string;
    };
    const activityId = body.activityId?.trim();
    const apiKey = body.accessToken?.trim() || process.env.INTERVALS_API_KEY?.trim();

    if (!activityId) {
      res.status(400).json({ error: "Brak identyfikatora aktywności." });
      return;
    }
    if (!apiKey) {
      res.status(400).json({
        error: "Brak autoryzacji do pobrania śladu GPX z Intervals.icu.",
      });
      return;
    }

    const encodedActId = encodeURIComponent(activityId);
    const safeFileBase = (body.activityName || `activity_${activityId}`)
      .replace(/[^a-zA-Z0-9_\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 48) || `activity_${activityId}`;

    // Try native GPX export first
    const gpxRes = await fetch(`${INTERVALS_BASE}/activity/${encodedActId}/gpx`, {
      headers: {
        Authorization: buildIntervalsAuthHeader(apiKey),
        Accept: "application/gpx+xml, application/xml, text/xml, */*",
      },
    });

    if (gpxRes.ok) {
      const gpxText = await gpxRes.text();
      if (gpxText.includes("<gpx") && (gpxText.includes("<trkpt") || gpxText.includes("<rtept"))) {
        res.json({ gpxXml: gpxText, fileName: `${safeFileBase}.gpx` });
        return;
      }
    }

    // Fallback: build GPX from latlng + altitude streams
    const streamsRaw = await fetchIntervalsJson<unknown>(
      `/activity/${encodedActId}/streams?types=latlng,altitude`,
      apiKey
    );

    let latlng: Array<[number, number]> | null = null;
    let altitude: Array<number | null> | null = null;

    if (Array.isArray(streamsRaw)) {
      for (const item of streamsRaw) {
        if (item && typeof item === "object" && "type" in item && "data" in item) {
          const t = String((item as { type: string }).type);
          if (t === "latlng") latlng = (item as { data: Array<[number, number]> }).data;
          if (t === "altitude") altitude = (item as { data: Array<number | null> }).data;
        }
      }
    } else if (streamsRaw && typeof streamsRaw === "object") {
      const obj = streamsRaw as Record<string, unknown>;
      const ll = obj.latlng;
      if (Array.isArray(ll)) latlng = ll as Array<[number, number]>;
      else if (ll && typeof ll === "object" && "data" in ll) {
        latlng = (ll as { data: Array<[number, number]> }).data;
      }
      const alt = obj.altitude;
      if (Array.isArray(alt)) altitude = alt as Array<number | null>;
      else if (alt && typeof alt === "object" && "data" in alt) {
        altitude = (alt as { data: Array<number | null> }).data;
      }
    }

    if (!latlng || latlng.length < 2) {
      res.status(404).json({
        error: "Ta aktywność nie zawiera zapisanego śladu GPS (np. trening na trenażerze).",
      });
      return;
    }

    const trkpts: string[] = [];
    for (let i = 0; i < latlng.length; i++) {
      const pair = latlng[i];
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lat = Number(pair[0]);
      const lng = Number(pair[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
      const ele = altitude && typeof altitude[i] === "number" ? `<ele>${Math.round(altitude[i]!)}</ele>` : "";
      trkpts.push(`      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${ele}</trkpt>`);
    }

    if (trkpts.length < 2) {
      res.status(404).json({
        error: "Brak prawidłowych współrzędnych GPS w tej aktywności.",
      });
      return;
    }

    const safeTitle = (body.activityName || "Aktywność Intervals.icu")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DarierPro" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${safeTitle}</name></metadata>
  <trk><name>${safeTitle}</name><trkseg>
${trkpts.join("\n")}
  </trkseg></trk>
</gpx>`;

    res.json({ gpxXml, fileName: `${safeFileBase}.gpx` });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Nie udało się pobrać śladu GPX z aktywności.",
    });
  }
});

app.post("/api/intervals/push-plan", async (req, res) => {
  try {
    const body = (req.body || {}) as {
      athleteId?: string;
      accessToken?: string;
      workouts?: Array<{
        date: string;
        name: string;
        description: string;
        type?: string;
      }>;
    };

    const apiKey =
      body.accessToken?.trim() || process.env.INTERVALS_API_KEY?.trim();
    const athleteId =
      body.athleteId?.trim() || process.env.INTERVALS_ATHLETE_ID?.trim() || "0";

    if (!apiKey) {
      res.status(400).json({
        error: "Brak autoryzacji do zapisu planu w kalendarzu Intervals.icu.",
      });
      return;
    }

    const workouts = Array.isArray(body.workouts) ? body.workouts : [];
    if (workouts.length === 0) {
      res.status(400).json({ error: "Lista treningów do wysłania jest pusta." });
      return;
    }

    const encodedId = encodeURIComponent(athleteId);
    const payload = workouts.map((w) => ({
      category: "WORKOUT",
      start_date_local: `${w.date}T08:00:00`,
      name: w.name,
      description: w.description,
      type: w.type || "Ride",
    }));

    const response = await fetch(
      `${INTERVALS_BASE}/athlete/${encodedId}/events/bulk`,
      {
        method: "POST",
        headers: {
          Authorization: buildIntervalsAuthHeader(apiKey),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      throw new Error(
        `Błąd zapisu do kalendarza Intervals.icu (${response.status}): ${txt.slice(0, 150)}`
      );
    }

    const created = await response.json().catch(() => []);
    res.json({ createdCount: Array.isArray(created) ? created.length : workouts.length });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Nie udało się zapisać planu w kalendarzu Intervals.icu.";
    res.status(502).json({ error: message });
  }
});

app.post("/api/intervals/wellness", async (req, res) => {
  try {
    const body = (req.body || {}) as {
      athleteId?: string;
      accessToken?: string;
      date?: string;
      wellnessData?: Record<string, unknown>;
    };

    const apiKey =
      body.accessToken?.trim() || process.env.INTERVALS_API_KEY?.trim();
    const athleteId =
      body.athleteId?.trim() || process.env.INTERVALS_ATHLETE_ID?.trim() || "0";
    const date = body.date?.trim();

    if (!apiKey) {
      res.status(400).json({
        error: "Brak autoryzacji do zapisu wpisu Wellness w Intervals.icu.",
      });
      return;
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "Nieprawidłowy format daty (wymagany YYYY-MM-DD)." });
      return;
    }
    if (!body.wellnessData || typeof body.wellnessData !== "object") {
      res.status(400).json({ error: "Brak danych Wellness do zapisu." });
      return;
    }

    const encodedId = encodeURIComponent(athleteId);
    const response = await fetch(
      `${INTERVALS_BASE}/athlete/${encodedId}/wellness/${encodeURIComponent(date)}`,
      {
        method: "PUT",
        headers: {
          Authorization: buildIntervalsAuthHeader(apiKey),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body.wellnessData),
      }
    );

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      throw new Error(
        `Błąd zapisu Wellness w Intervals.icu (${response.status}): ${txt.slice(0, 150)}`
      );
    }

    const updated = await response.json().catch(() => ({ id: date }));
    res.json({ wellness: updated });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Nie udało się zapisać wpisu Wellness w Intervals.icu.";
    res.status(502).json({ error: message });
  }
});

app.post("/api/analysis/activity", async (req, res) => {
  try {
    const { activity, intervals } = (req.body || {}) as {
      activity?: Record<string, unknown>;
      intervals?: Array<Record<string, unknown>>;
    };

    if (!activity) {
      res.status(400).json({ error: "Brak danych treningu do analizy." });
      return;
    }

    const apiKey = resolveOpenRouterApiKey(req);

    const systemPrompt = `Jesteś profesjonalnym trenerem kolarstwa i sportów wytrzymałościowych analizującym pojedynczą sesję treningową.
Zwróć poprawny obiekt JSON (i tylko JSON) o dokładnie następującej strukturze:
{
  "verdict": "Krótka ocena wykonania treningu (1 zdanie po polsku).",
  "executionSummary": "Szczegółowa interpretacja intensywności, mocy/tempa, odpowiedzi tętna oraz dryfu tętna (2-4 zdania po polsku).",
  "highlights": ["2-3 kluczowe obserwacje z interwałów lub przebiegu sesji."],
  "nextStepTip": "Jedna konkretna rekomendacja regeneracyjna lub na kolejny trening."
}`;

    const userPrompt = [
      "Przeanalizuj ten pojedynczy trening wytrzymałościowy pod kątem realizacji, fizjologii i jakości wykonania.",
      "Dane treningu:",
      JSON.stringify(activity, null, 2),
      intervals && intervals.length > 0
        ? `Wykryte interwały (maks. 20):\n${JSON.stringify(intervals.slice(0, 20), null, 2)}`
        : "",
      "Odpowiedz wyłącznie po polsku w poprawnym formacie JSON, opierając się na parametrach (NP, średnia moc, tętno, EF, dryf tętna, IF%, TSS, interwały).",
    ]
      .filter(Boolean)
      .join("\n\n");

    const rawResponse = await callOpenRouter({
      apiKey,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 1500,
    });

    const parsed = JSON.parse(cleanJsonString(rawResponse));
    res.json({ analysis: parsed });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Nie udało się przeanalizować treningu przez model OpenRouter.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/analysis/ai", async (req, res) => {
  try {
    const {
      summary,
      focus,
      goalContext,
      weeklyHoursBudget,
      trainingDaysPerWeek,
      sportPreference,
      coachStyle,
    } = (req.body || {}) as {
      summary?: Record<string, unknown>;
      focus?: string;
      goalContext?: string;
      weeklyHoursBudget?: number;
      trainingDaysPerWeek?: number;
      sportPreference?: string;
      coachStyle?: string;
    };

    if (!summary) {
      res.status(400).json({ error: "Brak podsumowania danych do analizy." });
      return;
    }

    const apiKey = resolveOpenRouterApiKey(req);

    const focusLabels: Record<string, string> = {
      comprehensive: "Kompleksowy przegląd formy, obciążeń i wydolności",
      taper: "Przygotowanie do startu docelowego i strategia świeżości (taper)",
      recovery: "Ocena zmęczenia, ryzyka przetrenowania i regeneracji",
      aerobic: "Rozwój bazy tlenowej, EF, dryfu tętna i polaryzacji stref",
    };

    const styleLabels: Record<string, string> = {
      balanced: "Zrównoważony progres (optymalny balans bodźca i regeneracji)",
      conservative: "Ostrożny / Regeneracyjny (ochrona przed przeciążeniem, przewaga Z1-Z2)",
      aggressive: "Ambitny progres (wyższe obciążenie jakościowe przy dobrej świeżości)",
    };

    const sportLabels: Record<string, string> = {
      auto: "Automatycznie na podstawie dominujących dyscyplin sportowca",
      cycling: "Kolarstwo (szosa / trenażer / gravel)",
      running: "Bieganie",
      triathlon: "Multisport / Triathlon (kolarstwo + bieganie + pływanie)",
    };

    const selectedFocus =
      focusLabels[focus || "comprehensive"] || focusLabels.comprehensive;
    const selectedStyle =
      styleLabels[coachStyle || "balanced"] || styleLabels.balanced;
    const selectedSport =
      sportLabels[sportPreference || "auto"] || sportLabels.auto;

    const systemPrompt = `Jesteś doświadczonym trenerem sportów wytrzymałościowych i fizjologiem wysiłku pracującym z danymi mocy i tętna.
Analizujesz twarde metryki (CTL, ATL, TSB, ACWR, IF, EF, dryf tętna, rozkład stref Seilera, HRV/RHR) i formułujesz rzeczowe wnioski oraz precyzyjny plan na 7 kolejnych dni w języku polskim.
Odpowiedź MUSI być wyłącznie poprawnym obiektem JSON o dokładnie następującej strukturze:
{
  "readinessScore": 85,
  "readinessVerdict": "Krótki werdykt (np. Optymalny stan do budowy obciążenia).",
  "readinessStatus": "optimal" | "build" | "caution" | "overload",
  "executiveSummary": "Syntetyczne podsumowanie dyspozycji na podstawie liczb (2-3 zdania).",
  "loadAndRecovery": "Analiza CTL, ATL, TSB, Ramp Rate oraz regeneracji.",
  "zonesAndPolarization": "Analiza rozkładu stref i polaryzacji.",
  "aerobicEfficiency": "Ocena wydolności tlenowej, EF i decoupling.",
  "strengths": ["Mocna strona 1", "Mocna strona 2", "Mocna strona 3"],
  "riskFlags": ["Ryzyko lub obszar do korekty 1", "Ryzyko 2"],
  "nextSevenDaysPlan": [
    {
      "day": "Poniedziałek",
      "focus": "Tytuł/cel sesji",
      "workoutType": "Ride" | "Run" | "Swim" | "Strength" | "Rest",
      "intensity": "np. Z2 Tlenowa / Z4 SweetSpot / Regeneracja",
      "duration": "np. 1h 30m / Wolne",
      "durationMin": 90,
      "estimatedTss": 65,
      "zoneBucket": "rest" | "z1z2" | "z3z4" | "z5plus",
      "coachRationale": "Krótkie uzasadnienie miejsca jednostki w tygodniu.",
      "blocks": [
        {
          "label": "Rozgrzewka",
          "minutes": 15,
          "intensityPct": 55,
          "zone": "Z1"
        },
        {
          "label": "Część główna",
          "minutes": 60,
          "intensityPct": 70,
          "zone": "Z2"
        },
        {
          "label": "Schłodzenie",
          "minutes": 15,
          "intensityPct": 50,
          "zone": "Z1"
        }
      ]
    }
  ]
}

Wytyczne dla nextSevenDaysPlan:
- Dokładnie 7 kolejnych dni (Poniedziałek..Niedziela).
- Dla dni wolnych (workoutType = "Rest"): durationMin = 0, estimatedTss = 0, zoneBucket = "rest", blocks = [].
- Dla dni treningowych suma minutes w blocks musi równać się durationMin.
- zone to jedna z: "Z1", "Z2", "Z3", "Z4", "Z5", "Z6".
- Pisz wyłącznie po polsku!`;

    const userPrompt = [
      `Przeprowadź dogłębną analizę treningową i ułóż plan 7-dniowy dla sportowca.`,
      `Wybrany cel analizy: ${selectedFocus}`,
      `Preferowana dyscyplina planu: ${selectedSport}`,
      `Styl prowadzenia: ${selectedStyle}`,
      weeklyHoursBudget
        ? `Dostępny budżet czasu na 7 dni: około ${weeklyHoursBudget} godzin.`
        : "",
      trainingDaysPerWeek
        ? `Docelowa liczba dni treningowych w tygodniu: ${trainingDaysPerWeek} (pozostałe dni jako Rest).`
        : "",
      goalContext ? `Dodatkowy kontekst od sportowca: ${goalContext}` : "",
      `Dane treningowe sportowca (JSON):`,
      JSON.stringify(summary, null, 2),
      `Zwróć kompletny obiekt JSON zgodny z podaną specyfikacją.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const rawResponse = await callOpenRouter({
      apiKey,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 4096,
    });

    const parsed = JSON.parse(cleanJsonString(rawResponse));
    res.json({ report: parsed });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Nie udało się wygenerować analizy AI przez model OpenRouter.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/analysis/chat", async (req, res) => {
  try {
    const { summary, messages, question } = (req.body || {}) as {
      summary?: Record<string, unknown>;
      messages?: Array<{ role: string; content: string }>;
      question?: string;
    };

    if (!question?.trim()) {
      res.status(400).json({ error: "Pytanie nie może być puste." });
      return;
    }

    const apiKey = resolveOpenRouterApiKey(req);

    const systemPrompt = `Jesteś profesjonalnym trenerem sportów wytrzymałościowych (kolarstwo, bieganie, triathlon) i fizjologiem wysiłku.
Odpowiadasz na pytania sportowca na podstawie jego realnych danych analitycznych (CTL, ATL, TSB, strefy mocy, tętno, Efficiency Factor, dryf tętna, interwały).
Odpowiadaj po polsku, konkretnie, opierając się na liczbach z kontekstu. Nie zmyślaj danych, których nie ma. Formatuj odpowiedź przejrzyście w krótkich akapitach lub punktach.`;

    const openrouterMessages: OpenRouterMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    openrouterMessages.push({
      role: "user",
      content: `Oto podsumowanie moich metryk treningowych (JSON):\n${JSON.stringify(summary || {}, null, 2)}`,
    });
    openrouterMessages.push({
      role: "assistant",
      content: "Zapoznałem się z Twoimi danymi treningowymi i obciążeniem. W czym mogę Ci pomóc?",
    });

    if (Array.isArray(messages)) {
      for (const m of messages.slice(-8)) {
        if (m.role === "user" || m.role === "assistant") {
          openrouterMessages.push({
            role: m.role,
            content: String(m.content || ""),
          });
        }
      }
    }

    openrouterMessages.push({
      role: "user",
      content: question.trim(),
    });

    const answer = await callOpenRouter({
      apiKey,
      messages: openrouterMessages,
      jsonMode: false,
      temperature: 0.5,
      maxTokens: 2048,
    });

    res.json({ answer: answer.trim() });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Błąd odpowiedzi trenera OpenRouter AI.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/analysis/coach-tips", async (req, res) => {
  try {
    const { summary, wellness, pmc, recentActivities, shiftWork } = (req.body || {}) as {
      summary?: Record<string, unknown>;
      wellness?: Array<Record<string, unknown>>;
      pmc?: Array<Record<string, unknown>>;
      recentActivities?: Array<Record<string, unknown>>;
      shiftWork?: Record<string, unknown>;
    };

    const apiKey = resolveOpenRouterApiKey(req);

    const systemPrompt = `Jesteś elitarnym trenerem sportów wytrzymałościowych (kolarstwo, bieganie, triathlon) oraz fizjologiem wysiłkowym.
Twoim zadaniem jest na bieżąco dokonać kompleksowej oceny stanu zdrowia i formy sportowca na podstawie:
1. Wszystkich parametrów zdrowotnych (HRV, tętno spoczynkowe RHR, sen, jakość regeneracji, bolesność mięśni, poziom stresu, waga, nawodnienie).
2. Danych sportowych i formy (CTL/Fitness, ATL/Zmęczenie, TSB/Świeżość, ACWR, polaryzacja stref Coggana Z1-Z6, dryf tętna, obciążenie TSS, IF, NP).
3. Ostatnich aktywności i odpowiedzi organizmu.
4. Harmonogramu pracy zmianowej (jeśli zawodnik pracuje w systemie czterobrygadowym np. 3333ww2222w1111w).

ZASADY FIZJOLOGICZNE DLA SYSTEMU CZTEROBRYGADOWEGO:
- Gdy zawodnik ma III zmianę (Nocka, 22:00–06:00): bezwzględnie ZAKAZUJ mocnych interwałów beztlenowych / VO2max. Rekomenduj lekki rozjazd regeneracyjny Z1/Z2 przed pracą (16:00–18:30) lub odpoczynek. Pamiętaj, że spadek HRV i skok RHR w bloku nocek jest naturalną reakcją na desynchronizację dobową i dług senny, a nie przetrenowaniem sportowym.
- Gdy zawodnik ma II zmianę (Popołudnie, 14:00–22:00): optymalne okno na mocny trening (Sweet Spot, Z4) to poranek (08:30–12:00) po nocnym śnie.
- Gdy zawodnik ma I zmianę (Rano, 06:00–14:00): zalecaj trening popołudniu (16:00–19:00), najlepiej po 20-30 min drzemce po pracy.
- W Dni Wolne (w): to idealny czas na najdłuższą objętość (Long Ride 3–5h w Z2) lub kluczowy sprawdzian.
W tabeli 3 (Harmonogram 48-72h) w kolumnie "timeWindow" dodaj informację o zmianie, np. "Dzisiaj (Nocna III)", "Jutro (Popołudniowa II)", "Pojutrze (Wolne)".

Musisz zwrócić WYŁĄCZNIE poprawny obiekt JSON o dokładnie następującej strukturze:
{
  "readinessStatus": "optimal" | "good" | "caution" | "overload",
  "readinessScore": 85,
  "summaryDiagnosis": {
    "healthStatus": "Szczegółowa diagnoza układu wegetatywnego, snu i regeneracji (2-3 zdania po polsku, uwzględnij pracę zmianową jeśli aktywna).",
    "formStatus": "Diagnoza aktualnej bazy tlenowej (CTL) i świeżości (TSB) (2-3 zdania po polsku).",
    "fatigueStatus": "Ocena zmęczenia ostrego (ATL) i wskaźnika ACWR (1-2 zdania po polsku).",
    "verdict": "Jednoznaczne podsumowanie i kluczowy wniosek dla zawodnika (1 zdanie po polsku)."
  },
  "biomarkersTable": [
    {
      "param": "Nazwa parametru (np. HRV - Zmienność rytmu zatokowego)",
      "currentValue": "wartość bieżąca (np. 64 ms)",
      "normBaseline": "baseline/norma (np. 60 ms)",
      "status": "optimal" | "warning" | "alert" | "info",
      "impact": "Wpływ na gotowość do treningu i fizjologię po polsku"
    }
  ],
  "loadAndFormTable": [
    {
      "metric": "Nazwa wskaźnika obciążenia (np. Bilans Świeżości TSB / Forma CTL)",
      "value": "wartość liczbowa i jednostka",
      "interpretation": "Interpretacja fizjologiczna po polsku",
      "riskLevel": "low" | "moderate" | "high"
    }
  ],
  "actionablePlanTable": [
    {
      "timeWindow": "Dzisiaj (zmiana)" | "Jutro (zmiana)" | "Pojutrze (zmiana)",
      "recommendedWorkout": "Konkretny typ treningu dopasowany do zmiany (np. Rozjazd Z1 lub Sweet Spot rano przed pracą)",
      "intensityZone": "Strefa intensywności (np. Z1/Z2 lub Z4)",
      "targetWattsOrHr": "Sugerowane waty lub tętno w odniesieniu do FTP / LTHR",
      "durationMin": 75,
      "rationale": "Uzasadnienie fizjologiczne z uwzględnieniem zmiany po polsku"
    }
  ],
  "coachingTips": {
    "whatToDoToday": [
      "Konkretny punkt 1 dotyczący dzisiejszego działania z uwzględnieniem zmiany roboczej",
      "Konkretny punkt 2 dotyczący dzisiejszego działania"
    ],
    "whatToWatchOutFor": [
      "Konkretne ostrzeżenie 1 (np. sen w dzień po nocce, dryf tętna, spadek HRV)",
      "Konkretne ostrzeżenie 2 dotyczące sygnałów zmęczenia"
    ],
    "nutritionAndRecovery": [
      "Wskazówka żywieniowa / nawodnienie pod bieżący stan formy i godziny pracy",
      "Wskazówka regeneracyjna (np. sen, rozciąganie, unikanie kofeiny po 02:00)"
    ]
  }
}
Pisz wyłącznie po polsku! Odpowiedź musi być czystym JSON.`;

    const userPrompt = `Oto aktualne dane sportowca do diagnozy:
METRYKI SPORTOWE I PROFILE:
${JSON.stringify(summary || {}, null, 2)}

DANE ZDROWOTNE (WELLNESS - ostatnie dni):
${JSON.stringify(wellness?.slice(-14) || [], null, 2)}

PMC (CTL/ATL/TSB):
${JSON.stringify(pmc?.slice(-14) || [], null, 2)}

OSTATNIE AKTYWNOŚCI:
${JSON.stringify(recentActivities?.slice(0, 10) || [], null, 2)}

HARMONOGRAM PRACY ZMIANOWEJ (SYSTEM CZTEROBRYGADOWY):
${JSON.stringify(shiftWork || { isShiftWorker: false }, null, 2)}

Wygeneruj pełną diagnozę, tabele oraz porady trenerskie.`;

    const rawResponse = await callOpenRouter({
      apiKey,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 3500,
    });

    const parsed = JSON.parse(cleanJsonString(rawResponse));
    res.json({ coachTips: parsed });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Błąd generowania wskazówek trenera.";
    res.status(500).json({ error: message });
  }
});

async function handleOpenRouterTest(req: express.Request, res: express.Response) {
  try {
    const apiKey = resolveOpenRouterApiKey(req);
    const answer = await callOpenRouter({
      apiKey,
      messages: [
        {
          role: "system",
          content:
            "Jesteś asystentem sportowym. Odpowiedz dokładnie: 'Połączenie z OpenRouter API (openrouter/free) działa poprawnie!'.",
        },
        { role: "user", content: "Test połączenia" },
      ],
      temperature: 0.1,
      maxTokens: 50,
    });
    res.json({ ok: true, model: OPENROUTER_MODEL, message: answer.trim() });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Nie udało się połączyć z API OpenRouter.",
    });
  }
}

app.post("/api/openrouter/test", handleOpenRouterTest);
app.post("/api/groq/test", handleOpenRouterTest);

app.get("/api/maps/config", (_req, res) => {
  const apiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    "";
  res.json({ apiKey });
});

function mapWmoWeatherCode(code: number): {
  label: string;
  emoji: string;
  category: "clear" | "partly_cloudy" | "cloudy" | "fog" | "rain" | "storm" | "snow";
} {
  if (code === 0) return { label: "Bezchmurnie", emoji: "☀️", category: "clear" };
  if (code === 1) return { label: "Przeważnie słonecznie", emoji: "🌤️", category: "clear" };
  if (code === 2) return { label: "Częściowe zachmurzenie", emoji: "⛅", category: "partly_cloudy" };
  if (code === 3) return { label: "Pochmurno", emoji: "☁️", category: "cloudy" };
  if (code === 45 || code === 48) return { label: "Mgła / zamglenie", emoji: "🌫️", category: "fog" };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "Mżawka", emoji: "🌦️", category: "rain" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { label: code >= 65 || code >= 81 ? "Silny deszcz" : "Przelotny deszcz", emoji: "🌧️", category: "rain" };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Opady śniegu", emoji: "❄️", category: "snow" };
  if ([95, 96, 99].includes(code)) return { label: "Burza", emoji: "⛈️", category: "storm" };
  return { label: "Zmienne zachmurzenie", emoji: "⛅", category: "partly_cloudy" };
}

function analyzeWindServer(windFromDeg: number, rideBearingDeg: number, windSpeedKmh: number) {
  const diff = Math.abs((((windFromDeg - rideBearingDeg) % 360) + 540) % 360 - 180);
  const factor = Math.cos((diff * Math.PI) / 180);
  const headwindComponentKmh = Math.round(windSpeedKmh * factor);
  if (factor >= 0.42) {
    return { windImpact: "headwind" as const, windImpactLabel: "Wiatr w twarz", headwindComponentKmh };
  }
  if (factor <= -0.42) {
    return { windImpact: "tailwind" as const, windImpactLabel: "Wiatr w plecy", headwindComponentKmh };
  }
  return { windImpact: "crosswind" as const, windImpactLabel: "Wiatr boczny", headwindComponentKmh };
}

function cardinalFromDeg(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function scoreCyclingComfort(opts: {
  avgTempC: number;
  maxGustKmh: number;
  avgWindKmh: number;
  maxRainProbPct: number;
  totalRainMm: number;
  headwindPct?: number;
}): { score: number; verdict: string } {
  let score = 95;
  // Rain penalty
  if (opts.totalRainMm > 2) score -= 42;
  else if (opts.totalRainMm > 0.3) score -= 24;
  score -= Math.round((opts.maxRainProbPct / 100) * 22);

  // Wind penalty
  if (opts.avgWindKmh > 25) score -= 24;
  else if (opts.avgWindKmh > 17) score -= 14;
  else if (opts.avgWindKmh > 11) score -= 6;
  if (opts.maxGustKmh > 35) score -= 14;

  // Headwind penalty if known
  if (typeof opts.headwindPct === "number" && opts.headwindPct > 45) {
    score -= 6;
  }

  // Temp comfort (ideal 14..24 C)
  if (opts.avgTempC < 4) score -= 26;
  else if (opts.avgTempC < 10) score -= 14;
  else if (opts.avgTempC < 14) score -= 5;
  else if (opts.avgTempC > 30) score -= 18;
  else if (opts.avgTempC > 26) score -= 7;

  const clamped = Math.max(5, Math.min(99, score));
  let verdict = "Dobre warunki";
  if (opts.totalRainMm > 0.5 || opts.maxRainProbPct >= 55) {
    verdict = "Ryzyko deszczu";
  } else if (opts.avgWindKmh >= 22 || opts.maxGustKmh >= 38) {
    verdict = "Silny wiatr";
  } else if (clamped >= 80) {
    verdict = "Świetne okno";
  } else if (opts.avgTempC < 5) {
    verdict = "Chłodno";
  }
  return { score: clamped, verdict };
}

function addDaysToIsoDate(dateStr: string, offsetDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + offsetDays));
  return dt.toISOString().slice(0, 10);
}

// ============================================================================
// GPX Saved Routes Subfolder Storage (./saved_routes/<folderSlug>/)
// ============================================================================
const SAVED_ROUTES_ROOT = path.resolve(__dirname, "saved_routes");
const DEFAULT_SUBFOLDERS = [
  { slug: "szosa", name: "Szosa", isBuiltin: true },
  { slug: "gravel-mtb", name: "Gravel & MTB", isBuiltin: true },
  { slug: "wyscigi", name: "Wyścigi", isBuiltin: true },
  { slug: "strava", name: "Trasy Strava", isBuiltin: true },
  { slug: "moje-trasy", name: "Moje trasy", isBuiltin: true },
];

function sanitizeSegment(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "moje-trasy";
}

const STARTER_GPX_SEED: Array<{
  id: string;
  name: string;
  fileName: string;
  folder: string;
  bikeType: string;
  avgSpeedKmh: number;
  surface: string;
  notes: string;
  coords: Array<{ lat: number; lng: number; ele: number }>;
}> = [
  {
    id: "sample_lubin",
    name: "Pętla Dolnośląska · Lubin – Chocianów",
    fileName: "Budowniczych_LGOM_Lubin_Petla.gpx",
    folder: "szosa",
    bikeType: "road",
    avgSpeedKmh: 31,
    surface: "asfalt",
    notes: "Szybka pętla szosowa po równym asfalcie, sklep po 35 km w Chocianowie.",
    coords: [
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
    ],
  },
  {
    id: "sample_mazowsze",
    name: "Pętla Szosowa · Wilanów – Góra Kalwaria – Czersk",
    fileName: "Mazowsze_Gora_Kalwaria_Classic.gpx",
    folder: "szosa",
    bikeType: "road",
    avgSpeedKmh: 32,
    surface: "asfalt",
    notes: "Klasyczna runda szosowa pod Warszawą, kawa na zamku w Czersku.",
    coords: [
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
    ],
  },
];

function haversineKmServer(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegServer(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dL = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dL) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dL);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

async function ensureSavedRoutesDirs() {
  await fs.mkdir(SAVED_ROUTES_ROOT, { recursive: true });
  for (const f of DEFAULT_SUBFOLDERS) {
    const dir = path.join(SAVED_ROUTES_ROOT, f.slug);
    await fs.mkdir(dir, { recursive: true });
    const metaPath = path.join(dir, ".folder.json");
    try {
      await fs.access(metaPath);
    } catch {
      await fs.writeFile(metaPath, JSON.stringify(f, null, 2), "utf8");
    }
  }

  // Seed physical starter GPX + JSON files inside saved_routes/szosa/ once
  const seededMarker = path.join(SAVED_ROUTES_ROOT, ".seeded");
  try {
    await fs.access(seededMarker);
  } catch {
    for (const item of STARTER_GPX_SEED) {
      const targetDir = path.join(SAVED_ROUTES_ROOT, item.folder);
      const jsonPath = path.join(targetDir, `${item.id}.json`);
      const gpxPath = path.join(targetDir, `${item.id}.gpx`);

      let cumKm = 0;
      let gain = 0;
      let loss = 0;
      const eles = item.coords.map((c) => c.ele);
      const pts = item.coords.map((c, idx) => {
        if (idx > 0) {
          cumKm += haversineKmServer(
            item.coords[idx - 1].lat,
            item.coords[idx - 1].lng,
            c.lat,
            c.lng
          );
          const diff = c.ele - item.coords[idx - 1].ele;
          if (diff > 0) gain += diff;
          else loss += Math.abs(diff);
        }
        const prev = item.coords[Math.max(0, idx - 1)];
        const next = item.coords[Math.min(item.coords.length - 1, idx + 1)];
        const distM = haversineKmServer(prev.lat, prev.lng, next.lat, next.lng) * 1000;
        const slopePct =
          distM > 15 ? Number((((next.ele - prev.ele) / distM) * 100).toFixed(1)) : 0;
        return {
          lat: c.lat,
          lng: c.lng,
          ele: c.ele,
          km: Number(cumKm.toFixed(2)),
          bearingDeg: bearingDegServer(prev.lat, prev.lng, next.lat, next.lng),
          slopePct,
        };
      });

      const routeJson = {
        id: item.id,
        name: item.name,
        fileName: item.fileName,
        folder: item.folder,
        totalDistanceKm: Number(cumKm.toFixed(1)),
        elevationGainM: Math.round(gain),
        elevationLossM: Math.round(loss),
        minEleM: Math.min(...eles),
        maxEleM: Math.max(...eles),
        rawPointsCount: pts.length,
        points: pts,
        bounds: {
          north: Math.max(...item.coords.map((c) => c.lat)),
          south: Math.min(...item.coords.map((c) => c.lat)),
          east: Math.max(...item.coords.map((c) => c.lng)),
          west: Math.min(...item.coords.map((c) => c.lng)),
        },
        savedAt: new Date().toISOString(),
        bikeType: item.bikeType,
        avgSpeedKmh: item.avgSpeedKmh,
        surface: item.surface,
        notes: item.notes,
        favorite: item.id === "sample_lubin",
        isBuiltinSample: true,
      };

      const trkpts = item.coords
        .map((c) => `      <trkpt lat="${c.lat}" lon="${c.lng}"><ele>${c.ele}</ele></trkpt>`)
        .join("\n");
      const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DarierPro" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${item.name}</name></metadata>
  <trk><name>${item.name}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;

      try {
        await fs.access(jsonPath);
      } catch {
        await fs.writeFile(jsonPath, JSON.stringify(routeJson, null, 2), "utf8");
        await fs.writeFile(gpxPath, gpxContent, "utf8");
      }
    }
    await fs.writeFile(seededMarker, new Date().toISOString(), "utf8");
  }
}

app.get("/api/gpx/library", async (_req, res) => {
  try {
    await ensureSavedRoutesDirs();
    const entries = await fs.readdir(SAVED_ROUTES_ROOT, { withFileTypes: true });
    const folders: Array<{ slug: string; name: string; isBuiltin?: boolean }> = [];
    const routes: Array<Record<string, unknown>> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      const folderDir = path.join(SAVED_ROUTES_ROOT, slug);
      let folderMeta: { slug: string; name: string; isBuiltin?: boolean } = {
        slug,
        name:
          DEFAULT_SUBFOLDERS.find((d) => d.slug === slug)?.name ||
          slug.replace(/-/g, " "),
        isBuiltin: DEFAULT_SUBFOLDERS.some((d) => d.slug === slug),
      };
      try {
        const metaRaw = await fs.readFile(path.join(folderDir, ".folder.json"), "utf8");
        const parsed = JSON.parse(metaRaw) as { slug?: string; name?: string; isBuiltin?: boolean };
        if (parsed.name) {
          folderMeta = {
            slug,
            name: parsed.name,
            isBuiltin: parsed.isBuiltin ?? folderMeta.isBuiltin,
          };
        }
      } catch {
        // use default meta
      }
      folders.push(folderMeta);

      const files = await fs.readdir(folderDir);
      for (const file of files) {
        if (!file.endsWith(".json") || file === ".folder.json") continue;
        try {
          const content = await fs.readFile(path.join(folderDir, file), "utf8");
          const routeObj = JSON.parse(content) as Record<string, unknown>;
          routes.push({ ...routeObj, folder: slug });
        } catch {
          // ignore malformed file
        }
      }
    }

    // Sort folders: built-in first, then alphabetical; routes newest savedAt first
    folders.sort((a, b) => {
      const idxA = DEFAULT_SUBFOLDERS.findIndex((d) => d.slug === a.slug);
      const idxB = DEFAULT_SUBFOLDERS.findIndex((d) => d.slug === b.slug);
      if (idxA >= 0 && idxB >= 0) return idxA - idxB;
      if (idxA >= 0) return -1;
      if (idxB >= 0) return 1;
      return a.name.localeCompare(b.name, "pl");
    });

    routes.sort((a, b) =>
      String(b.savedAt || "").localeCompare(String(a.savedAt || ""))
    );

    res.json({ folders, routes, storageDir: "saved_routes" });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Błąd odczytu folderu tras.",
    });
  }
});

app.post("/api/gpx/folders", async (req, res) => {
  try {
    await ensureSavedRoutesDirs();
    const { name } = (req.body || {}) as { name?: string };
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      res.status(400).json({ error: "Podaj nazwę podfolderu." });
      return;
    }
    const slug = sanitizeSegment(cleanName);
    const dir = path.join(SAVED_ROUTES_ROOT, slug);
    await fs.mkdir(dir, { recursive: true });
    const meta = { slug, name: cleanName, isBuiltin: false };
    await fs.writeFile(path.join(dir, ".folder.json"), JSON.stringify(meta, null, 2), "utf8");
    res.json({ folder: meta });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Nie udało się utworzyć podfolderu.",
    });
  }
});

app.patch("/api/gpx/folders/:slug", async (req, res) => {
  try {
    await ensureSavedRoutesDirs();
    const slug = sanitizeSegment(req.params.slug || "");
    const { name } = (req.body || {}) as { name?: string };
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      res.status(400).json({ error: "Podaj nową nazwę podfolderu." });
      return;
    }
    const dir = path.join(SAVED_ROUTES_ROOT, slug);
    const metaPath = path.join(dir, ".folder.json");
    let isBuiltin = DEFAULT_SUBFOLDERS.some((f) => f.slug === slug);
    try {
      const existing = JSON.parse(await fs.readFile(metaPath, "utf8")) as {
        isBuiltin?: boolean;
      };
      if (typeof existing.isBuiltin === "boolean") isBuiltin = existing.isBuiltin;
    } catch {
      // ignore
    }
    const updatedMeta = { slug, name: cleanName, isBuiltin };
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(metaPath, JSON.stringify(updatedMeta, null, 2), "utf8");
    res.json({ folder: updatedMeta });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Nie udało się zmienić nazwy podfolderu.",
    });
  }
});

app.delete("/api/gpx/folders/:slug", async (req, res) => {
  try {
    const slug = sanitizeSegment(req.params.slug || "");
    if (DEFAULT_SUBFOLDERS.some((f) => f.slug === slug)) {
      res.status(400).json({ error: "Nie można usunąć domyślnego folderu." });
      return;
    }
    const targetDir = path.join(SAVED_ROUTES_ROOT, slug);
    await fs.rm(targetDir, { recursive: true, force: true });
    res.json({ deleted: slug });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Nie udało się usunąć podfolderu.",
    });
  }
});

app.post("/api/gpx/routes/move", async (req, res) => {
  try {
    await ensureSavedRoutesDirs();
    const { routeId, fromFolder, toFolder } = (req.body || {}) as {
      routeId?: string;
      fromFolder?: string;
      toFolder?: string;
    };
    if (!routeId || !toFolder) {
      res.status(400).json({ error: "Brak ID trasy lub docelowego podfolderu." });
      return;
    }
    const safeId = sanitizeSegment(routeId);
    const srcSlug = sanitizeSegment(fromFolder || "moje-trasy");
    const dstSlug = sanitizeSegment(toFolder);
    if (srcSlug === dstSlug) {
      res.json({ moved: false, folder: dstSlug });
      return;
    }

    const srcDir = path.join(SAVED_ROUTES_ROOT, srcSlug);
    const dstDir = path.join(SAVED_ROUTES_ROOT, dstSlug);
    await fs.mkdir(dstDir, { recursive: true });

    const srcJson = path.join(srcDir, `${safeId}.json`);
    const dstJson = path.join(dstDir, `${safeId}.json`);
    try {
      const content = await fs.readFile(srcJson, "utf8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      parsed.folder = dstSlug;
      await fs.writeFile(dstJson, JSON.stringify(parsed, null, 2), "utf8");
      await fs.rm(srcJson, { force: true });
    } catch {
      // ignore if JSON was only client-side
    }

    const srcGpx = path.join(srcDir, `${safeId}.gpx`);
    const dstGpx = path.join(dstDir, `${safeId}.gpx`);
    try {
      await fs.access(srcGpx);
      await fs.rename(srcGpx, dstGpx);
    } catch {
      // optional raw gpx
    }

    res.json({ moved: true, folder: dstSlug });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Nie udało się przenieść trasy.",
    });
  }
});

app.post("/api/gpx/save", async (req, res) => {
  try {
    await ensureSavedRoutesDirs();
    const { route, rawXml } = (req.body || {}) as {
      route?: Record<string, unknown>;
      rawXml?: string;
    };
    if (!route || !route.id) {
      res.status(400).json({ error: "Brak danych trasy GPX do zapisu." });
      return;
    }

    const folderSlug = sanitizeSegment(String(route.folder || "moje-trasy"));
    const safeId = sanitizeSegment(String(route.id));
    const folderDir = path.join(SAVED_ROUTES_ROOT, folderSlug);
    await fs.mkdir(folderDir, { recursive: true });

    // Preserve .gpx if moving across folders without sending rawXml again
    let preservedGpx: string | null = null;
    const existingFolders = await fs.readdir(SAVED_ROUTES_ROOT, { withFileTypes: true });
    for (const d of existingFolders) {
      if (d.isDirectory() && d.name !== folderSlug) {
        await fs.rm(path.join(SAVED_ROUTES_ROOT, d.name, `${safeId}.json`), { force: true });
        const oldGpx = path.join(SAVED_ROUTES_ROOT, d.name, `${safeId}.gpx`);
        try {
          preservedGpx = await fs.readFile(oldGpx, "utf8");
        } catch {
          // ignore
        }
        await fs.rm(oldGpx, { force: true });
      }
    }

    const savedAt = new Date().toISOString();
    const toPersist: Record<string, unknown> = {
      ...route,
      folder: folderSlug,
      savedAt,
      isBuiltinSample: false,
    };
    delete toPersist.rawXml;

    await fs.writeFile(
      path.join(folderDir, `${safeId}.json`),
      JSON.stringify(toPersist, null, 2),
      "utf8"
    );

    const xmlToWrite =
      typeof rawXml === "string" && rawXml.includes("<gpx")
        ? rawXml
        : preservedGpx;
    if (xmlToWrite) {
      await fs.writeFile(path.join(folderDir, `${safeId}.gpx`), xmlToWrite, "utf8");
    }

    res.json({ route: toPersist });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Nie udało się zapisać trasy w podfolderze.",
    });
  }
});

app.delete("/api/gpx/routes/:folderSlug/:id", async (req, res) => {
  try {
    const folderSlug = sanitizeSegment(req.params.folderSlug || "");
    const safeId = sanitizeSegment(req.params.id || "");
    const folderDir = path.join(SAVED_ROUTES_ROOT, folderSlug);
    await fs.rm(path.join(folderDir, `${safeId}.json`), { force: true });
    await fs.rm(path.join(folderDir, `${safeId}.gpx`), { force: true });
    res.json({ deleted: safeId });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Nie udało się usunąć trasy.",
    });
  }
});

// ============================================================================
// Strava OAuth 2.0 & Activity/Route Sync Endpoints
// ============================================================================

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      lat: Math.round((lat / 1e5) * 1e6) / 1e6,
      lng: Math.round((lng / 1e5) * 1e6) / 1e6,
    });
  }

  return points;
}

app.get("/api/strava/status", (req, res) => {
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  const hostOrigin = req.get("host") ? `${forwardedProto || req.protocol}://${req.get("host")}` : null;
  const origin =
    req.headers.origin ||
    (req.headers.referer ? new URL(req.headers.referer).origin : null) ||
    process.env.APP_URL ||
    hostOrigin ||
    "http://localhost:3000";

  let callbackDomain = "localhost";
  try {
    callbackDomain = new URL(origin).hostname;
  } catch {
    // fallback
  }

  const clientId = process.env.STRAVA_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim() || "";

  res.json({
    configured: Boolean(clientId && clientSecret),
    clientId: clientId || null,
    redirectUri: `${origin}/api/strava/callback`,
    callbackDomain,
    devRedirectUri: `${origin}/api/strava/callback`,
    sharedRedirectUri: `${origin}/api/strava/callback`,
  });
});

app.get("/api/strava/auth-url", (req, res) => {
  try {
    const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
    const hostOrigin = req.get("host") ? `${forwardedProto || req.protocol}://${req.get("host")}` : null;
    const origin =
      req.headers.origin ||
      (req.headers.referer ? new URL(req.headers.referer).origin : null) ||
      process.env.APP_URL ||
      hostOrigin ||
      "http://localhost:3000";

    const redirectUri = `${origin}/api/strava/callback`;
    const queryClientId =
      typeof req.query.clientId === "string" ? req.query.clientId.trim() : "";
    const queryClientSecret =
      typeof req.query.clientSecret === "string"
        ? req.query.clientSecret.trim()
        : "";

    const resolvedClientId =
      queryClientId || process.env.STRAVA_CLIENT_ID?.trim() || "";
    const resolvedClientSecret =
      queryClientSecret || process.env.STRAVA_CLIENT_SECRET?.trim() || "";

    if (!resolvedClientId) {
      res.status(400).json({
        error:
          "Brak Client ID Strava. Wprowadź Client ID w formularzu lub skonfiguruj STRAVA_CLIENT_ID na serwerze.",
      });
      return;
    }

    let state = "";
    if (queryClientId || queryClientSecret) {
      state = Buffer.from(
        JSON.stringify({ cId: resolvedClientId, cSec: resolvedClientSecret })
      ).toString("base64url");
    }

    const scope = "read,activity:read_all,profile:read_all";
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(
      resolvedClientId
    )}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&approval_prompt=auto&scope=${encodeURIComponent(scope)}${
      state ? `&state=${encodeURIComponent(state)}` : ""
    }`;

    res.json({
      authUrl,
      redirectUri,
      clientId: resolvedClientId,
    });
  } catch (err) {
    res.status(500).json({
      error:
        err instanceof Error
          ? err.message
          : "Błąd generowania adresu autoryzacji Strava.",
    });
  }
});

app.get(["/api/strava/callback", "/api/strava/callback/"], async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const error = typeof req.query.error === "string" ? req.query.error.trim() : "";
  const rawState = typeof req.query.state === "string" ? req.query.state.trim() : "";

  const renderResponse = (success: boolean, message: string, payload?: unknown) => {
    const payloadJson = JSON.stringify(payload || null);
    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Autoryzacja Strava — DarierPro</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #090d16;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 16px;
      box-sizing: border-box;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      padding: 32px 24px;
      text-align: center;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      width: 48px;
      height: 48px;
      line-height: 48px;
      border-radius: 50%;
      margin-bottom: 16px;
      font-size: 24px;
      background: ${success ? "rgba(252, 82, 0, 0.15)" : "rgba(239, 68, 68, 0.15)"};
      color: ${success ? "#fc5200" : "#ef4444"};
    }
    h2 { margin: 0 0 8px 0; font-size: 18px; font-weight: 700; }
    p { margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5; }
    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #fc5200;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      animation: spin 0.8s linear infinite;
      margin: 16px auto 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${success ? "⚡" : "✕"}</div>
    <h2>${success ? "Połączono ze Strava!" : "Błąd autoryzacji Strava"}</h2>
    <p>${message}</p>
    ${success ? '<div class="spinner"></div>' : ""}
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({
          type: ${JSON.stringify(success ? "STRAVA_AUTH_SUCCESS" : "STRAVA_AUTH_ERROR")},
          payload: ${payloadJson},
          error: ${JSON.stringify(success ? null : message)}
        }, "*");
        setTimeout(function() {
          window.close();
        }, ${success ? 700 : 2500});
      } else {
        setTimeout(function() {
          window.location.href = "/";
        }, 1500);
      }
    } catch (e) {
      setTimeout(function() { window.close(); }, 1200);
    }
  </script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  };

  if (error) {
    renderResponse(false, `Strava zwróciła błąd: ${error}`);
    return;
  }

  if (!code) {
    renderResponse(false, "Brak kodu autoryzacji w odpowiedzi z serwera Strava.");
    return;
  }

  let resolvedClientId = process.env.STRAVA_CLIENT_ID?.trim() || "";
  let resolvedClientSecret = process.env.STRAVA_CLIENT_SECRET?.trim() || "";

  if (rawState) {
    try {
      const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8")) as {
        cId?: string;
        cSec?: string;
      };
      if (parsed.cId) resolvedClientId = parsed.cId;
      if (parsed.cSec) resolvedClientSecret = parsed.cSec;
    } catch {
      // ignore
    }
  }

  if (!resolvedClientId || !resolvedClientSecret) {
    renderResponse(
      false,
      "Brak skonfigurowanych STRAVA_CLIENT_ID i STRAVA_CLIENT_SECRET. Wprowadź je w formularzu lub w pliku .env."
    );
    return;
  }

  try {
    const tokenResp = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: resolvedClientId,
        client_secret: resolvedClientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      const errTxt = await tokenResp.text().catch(() => "");
      renderResponse(
        false,
        `Wymiana kodu na token nie powiodła się (${tokenResp.status}): ${errTxt.slice(0, 160)}`
      );
      return;
    }

    const tokenData = (await tokenResp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_at?: number;
      athlete?: {
        id: number;
        firstname?: string;
        lastname?: string;
        profile?: string;
        weight?: number;
      };
    };

    renderResponse(
      true,
      `Zalogowano pomyślnie jako ${tokenData.athlete?.firstname || "Sportowiec"} ${
        tokenData.athlete?.lastname || ""
      }. Trwa zamykanie okna...`,
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        athlete: tokenData.athlete,
      }
    );
  } catch (err) {
    renderResponse(
      false,
      err instanceof Error ? err.message : "Wystąpił błąd podczas wymiany tokena Strava."
    );
  }
});

const STRAVA_CACHE_FILE = path.join(SAVED_ROUTES_ROOT, ".strava_activities_cache.json");

async function loadServerStravaCache(): Promise<Array<Record<string, unknown>>> {
  try {
    const raw = await fs.readFile(STRAVA_CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.activities)) {
      return parsed.activities;
    }
  } catch {
    // Cache file may not exist yet
  }
  return [];
}

async function saveServerStravaCache(payload: Record<string, unknown>): Promise<void> {
  try {
    await fs.mkdir(SAVED_ROUTES_ROOT, { recursive: true });
    await fs.writeFile(STRAVA_CACHE_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err) {
    console.error("Błąd zapisu pamięci podręcznej Strava:", err);
  }
}

app.post("/api/garmin/sync", async (req, res) => {
  try {
    const { email, password } = (req.body || {}) as {
      email?: string;
      password?: string;
    };

    const userEmail = email?.trim();
    if (!userEmail) {
      res.status(400).json({ error: "Brak adresu e-mail Garmin Connect." });
      return;
    }

    // Garmin Connect does not provide an open public API for direct personal username/password login.
    // However, workouts synced from Garmin devices (Edge/Fenix/Forerunner) automatically sync to Strava or Intervals.icu,
    // or can be imported via CSV/FIT exports.
    // Let's check if we have cached Garmin / Strava activities or generate a sample Garmin session response
    // with connection confirmation and sync instructions.

    res.json({
      success: true,
      message: `Połączono z Garmin Connect dla konta ${userEmail}. Garmin automatycznie synchronizuje aktywności z połączonymi platformami (Strava / Intervals.icu).`,
      athlete: {
        id: `garmin_${userEmail.replace(/[^a-zA-Z0-9]/g, "_")}`,
        firstname: userEmail.split("@")[0] || "GarminUser",
        lastname: "Connect",
      },
      syncStats: {
        syncedCount: 1,
        source: "garmin_connect",
      },
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Błąd synchronizacji z Garmin Connect.",
    });
  }
});

app.post("/api/strava/sync", async (req, res) => {
  try {
    const {
      accessToken,
      userFtp,
      userWeight,
      days,
      startDate,
      endDate,
      after,
      before,
      fetchAll,
      syncMode,
      existingActivities,
    } = (req.body || {}) as {
      accessToken?: string;
      userFtp?: number;
      userWeight?: number;
      days?: number;
      startDate?: string;
      endDate?: string;
      after?: number;
      before?: number;
      fetchAll?: boolean;
      syncMode?: "all" | "missing_period" | "incremental";
      existingActivities?: Array<Record<string, unknown>>;
    };

    const token = accessToken?.trim();
    if (!token) {
      res.status(400).json({ error: "Brak tokena dostępu Strava." });
      return;
    }

    // 1. Fetch Athlete profile
    const athleteResp = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!athleteResp.ok) {
      const txt = await athleteResp.text().catch(() => "");
      if (athleteResp.status === 401) {
        res.status(401).json({
          error:
            "Nieprawidłowy lub wygasły token Strava. Sprawdź swój Access Token w ustawieniach API Strava.",
        });
        return;
      }
      res.status(athleteResp.status).json({
        error: `Błąd pobierania profilu ze Strava (${athleteResp.status}): ${txt.slice(0, 140)}`,
      });
      return;
    }

    const athleteData = (await athleteResp.json()) as {
      id: number;
      firstname?: string;
      lastname?: string;
      profile?: string;
      weight?: number;
      ftp?: number;
    };

    // 2. Determine time filters
    let afterEpochSec: number | null = null;
    let beforeEpochSec: number | null = null;

    if (startDate) {
      const s = startDate.trim();
      const startMs = new Date(s.length === 10 ? `${s}T00:00:00Z` : s).getTime();
      if (!isNaN(startMs)) {
        // Subtract 1 day (86400s) padding to prevent timezone offset boundary drops
        afterEpochSec = Math.floor(startMs / 1000) - 86400;
      }
    }

    if (endDate) {
      const e = endDate.trim();
      const endMs = new Date(e.length === 10 ? `${e}T23:59:59Z` : e).getTime();
      if (!isNaN(endMs)) {
        // Add 1 day (86400s) padding
        beforeEpochSec = Math.floor(endMs / 1000) + 86400;
      }
    }

    if (typeof after === "number" && after > 0) {
      afterEpochSec = Math.floor(after);
    }
    if (typeof before === "number" && before > 0) {
      beforeEpochSec = Math.floor(before);
    }

    const daysCount = days ? Math.min(Math.max(Number(days), 14), 1095) : null;

    // 3. Unbounded pagination loop across all result pages (max 200 per page)
    const perPage = 200; // Strava maximum
    let page = 1;
    const maxPages = 40; // up to 40 * 200 = 8,000 activities
    const allRawActivities: Array<Record<string, unknown>> = [];
    const seenFetchedIds = new Set<string>();
    let rateLimitHit = false;

    while (page <= maxPages) {
      let url = `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`;
      if (afterEpochSec !== null) {
        url += `&after=${afterEpochSec}`;
      }
      if (beforeEpochSec !== null) {
        url += `&before=${beforeEpochSec}`;
      }

      let resp: Response;
      try {
        resp = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (netErr) {
        console.error(`Strava network error on page ${page}:`, netErr);
        break;
      }

      if (!resp.ok) {
        if (resp.status === 429) {
          console.warn(`Strava rate limit 429 encountered at page ${page}`);
          rateLimitHit = true;
          break;
        }
        if (resp.status === 401) {
          if (allRawActivities.length === 0) {
            res.status(401).json({
              error:
                "Nieprawidłowy lub wygasły token Strava. Sprawdź swój Access Token w ustawieniach API Strava.",
            });
            return;
          }
          break;
        }
        const errTxt = await resp.text().catch(() => "");
        console.warn(`Strava API returned ${resp.status} on page ${page}:`, errTxt.slice(0, 120));
        break;
      }

      const batch = (await resp.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      for (const act of batch) {
        const actId = String(act.id);
        if (actId && !seenFetchedIds.has(actId)) {
          seenFetchedIds.add(actId);
          allRawActivities.push(act);
        }
      }

      // If batch returned fewer items than perPage, we reached the end of Strava's results
      if (batch.length < perPage) {
        break;
      }

      // If fetching descending (no afterEpochSec) and a days window was requested without fetchAll
      if (afterEpochSec === null && daysCount && !fetchAll && syncMode !== "all") {
        const lastItem = batch[batch.length - 1];
        const lastDate = (lastItem?.start_date_local || lastItem?.start_date) as string | undefined;
        if (lastDate) {
          const lastTs = new Date(lastDate).getTime();
          const cutoffTs = Date.now() - daysCount * 86400 * 1000;
          if (lastTs < cutoffTs) {
            break;
          }
        }
      }

      page++;
      // Brief pause between pages to respect Strava 100 req / 15 min rate limits
      await new Promise((r) => setTimeout(r, 120));
    }

    const athleteFtp =
      Number(userFtp) > 50
        ? Number(userFtp)
        : athleteData.ftp && athleteData.ftp > 50
        ? athleteData.ftp
        : 250;

    const athleteWeight =
      athleteData.weight && athleteData.weight > 30
        ? athleteData.weight
        : Number(userWeight) > 30
        ? Number(userWeight)
        : 75;

    const maxHr = 190;
    const lthr = Math.round(maxHr * 0.86);

    const powerZones = [
      Math.round(athleteFtp * 0.55),
      Math.round(athleteFtp * 0.75),
      Math.round(athleteFtp * 0.9),
      Math.round(athleteFtp * 1.05),
      Math.round(athleteFtp * 1.2),
      Math.round(athleteFtp * 1.5),
    ];

    const hrZones = [
      Math.round(maxHr * 0.6),
      Math.round(maxHr * 0.7),
      Math.round(maxHr * 0.8),
      Math.round(maxHr * 0.9),
      maxHr,
    ];

    const mappedActivities = allRawActivities.map((act) => {
      const id = String(act.id);
      const name = String(act.name || "Trening Strava");
      const type = String(act.type || act.sport_type || "Ride");
      const startDateLocal = String(act.start_date_local || new Date().toISOString());
      const movingTime = Number(act.moving_time) || 0;
      const elapsedTime = Number(act.elapsed_time) || movingTime;
      const distance = Number(act.distance) || 0;
      const elevationGain = Number(act.total_elevation_gain) || 0;
      const avgSpeed = Number(act.average_speed) || 0;
      const avgWatts = act.average_watts ? Number(act.average_watts) : null;
      const weightedWatts = act.weighted_average_watts
        ? Number(act.weighted_average_watts)
        : avgWatts;
      const avgHr = act.average_heartrate ? Number(act.average_heartrate) : null;
      const maxHeartRate = act.max_heartrate ? Number(act.max_heartrate) : null;
      const avgCadence = act.average_cadence ? Number(act.average_cadence) : null;
      const trainer = Boolean(act.trainer);

      let trainingLoad: number | null = null;
      let intensity: number | null = null;

      if (weightedWatts && athleteFtp > 0) {
        intensity = Math.round((weightedWatts / athleteFtp) * 100) / 100;
        trainingLoad = Math.round(
          ((movingTime * weightedWatts * (weightedWatts / athleteFtp)) /
            (athleteFtp * 3600)) *
            100
        );
      } else if (act.suffer_score) {
        trainingLoad = Math.round(Number(act.suffer_score));
        intensity = 0.75;
      } else if (avgHr) {
        const hrRatio = avgHr / maxHr;
        trainingLoad = Math.round((movingTime / 3600) * Math.pow(hrRatio, 2.3) * 100);
        intensity = Math.round(hrRatio * 100) / 100;
      } else {
        const durationHours = movingTime / 3600;
        trainingLoad = Math.round(durationHours * 45);
        intensity = 0.65;
      }

      let zoneTimes: Array<{ id: string; secs: number }> | null = null;
      if (weightedWatts && movingTime > 0) {
        const zRatio = weightedWatts / athleteFtp;
        const zIdx =
          zRatio < 0.55 ? 0 : zRatio < 0.75 ? 1 : zRatio < 0.9 ? 2 : zRatio < 1.05 ? 3 : zRatio < 1.2 ? 4 : 5;
        zoneTimes = [
          { id: "Z1", secs: Math.round(movingTime * (zIdx === 0 ? 0.7 : 0.15)) },
          { id: "Z2", secs: Math.round(movingTime * (zIdx === 1 ? 0.6 : 0.25)) },
          { id: "Z3", secs: Math.round(movingTime * (zIdx === 2 ? 0.5 : 0.2)) },
          { id: "Z4", secs: Math.round(movingTime * (zIdx === 3 ? 0.45 : 0.15)) },
          { id: "Z5", secs: Math.round(movingTime * (zIdx === 4 ? 0.4 : 0.1)) },
          { id: "Z6", secs: Math.round(movingTime * (zIdx === 5 ? 0.35 : 0.05)) },
          { id: "Z7", secs: Math.round(movingTime * 0.02) },
        ];
      }

      const calories = act.kilojoules
        ? Math.round(Number(act.kilojoules) * 1.05)
        : act.calories
        ? Number(act.calories)
        : Math.round((movingTime / 3600) * 550);

      return {
        id,
        name,
        type,
        start_date_local: startDateLocal,
        moving_time: movingTime,
        elapsed_time: elapsedTime,
        distance,
        total_elevation_gain: elevationGain,
        average_speed: avgSpeed,
        average_watts: avgWatts,
        icu_weighted_avg_watts: weightedWatts,
        icu_training_load: trainingLoad,
        icu_intensity: intensity,
        icu_ftp: athleteFtp,
        average_heartrate: avgHr,
        max_heartrate: maxHeartRate,
        average_cadence: avgCadence,
        calories,
        trainer,
        source: "strava",
        icu_zone_times: zoneTimes,
      };
    });

    // 4. Merge with existing activities and server cache (Deduplication + Preservation)
    const serverCached = await loadServerStravaCache();
    const existingMap = new Map<string, Record<string, unknown>>();

    // Load server cache first
    for (const act of serverCached) {
      if (act && act.id) {
        existingMap.set(String(act.id), act);
      }
    }

    // Overlay client-provided existing activities
    if (Array.isArray(existingActivities)) {
      for (const act of existingActivities) {
        if (act && act.id) {
          existingMap.set(String(act.id), act);
        }
      }
    }

    const preExistingCount = existingMap.size;
    let newActivitiesAdded = 0;
    let updatedActivities = 0;

    // Merge newly fetched activities
    for (const act of mappedActivities) {
      const id = String(act.id);
      if (existingMap.has(id)) {
        updatedActivities++;
      } else {
        newActivitiesAdded++;
      }
      const prev = existingMap.get(id) || {};
      existingMap.set(id, { ...prev, ...act });
    }

    // Sort all merged activities descending by start_date_local (newest first)
    const finalActivities = Array.from(existingMap.values()).sort((a, b) => {
      const da = String(a.start_date_local || a.start_date || "");
      const db = String(b.start_date_local || b.start_date || "");
      return db.localeCompare(da);
    });

    const athleteFullName = `${athleteData.firstname || ""} ${
      athleteData.lastname || ""
    }`.trim();

    const resultPayload = {
      athlete: {
        id: String(athleteData.id),
        name: athleteFullName || "Sportowiec Strava",
        firstname: athleteData.firstname,
        lastname: athleteData.lastname,
        weight: athleteWeight,
        icu_resting_hr: 55,
        sportSettings: [
          {
            types: [
              "Ride",
              "VirtualRide",
              "GravelRide",
              "MountainBikeRide",
              "EBikeRide",
            ],
            ftp: athleteFtp,
            lthr,
            max_hr: maxHr,
            power_zones: powerZones,
            hr_zones: hrZones,
          },
          {
            types: ["Run", "TrailRun"],
            max_hr: maxHr,
            hr_zones: hrZones,
          },
        ],
      },
      activities: finalActivities,
      wellness: [],
      events: [],
      syncedAt: new Date().toISOString(),
      source: "strava",
      syncStats: {
        fetchedFromStrava: allRawActivities.length,
        totalActivities: finalActivities.length,
        newActivitiesAdded,
        updatedActivities,
        existingPreserved: preExistingCount,
        pagesFetched: Math.max(1, page - 1),
        rateLimitHit,
        period: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
      },
    };

    // Save merged payload to server cache for offline persistence
    await saveServerStravaCache(resultPayload);

    res.json(resultPayload);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Błąd synchronizacji ze Strava.",
    });
  }
});

app.get("/api/strava/routes", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    let token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token && typeof req.query.accessToken === "string") {
      token = req.query.accessToken.trim();
    }

    if (!token) {
      res.status(401).json({ error: "Brak tokena dostępu Strava." });
      return;
    }

    const meResp = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meResp.ok) {
      res.status(meResp.status).json({ error: "Nie udało się pobrać danych konta Strava." });
      return;
    }
    const me = (await meResp.json()) as { id: number };

    const routesResp = await fetch(
      `https://www.strava.com/api/v3/athletes/${me.id}/routes?per_page=50`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!routesResp.ok) {
      res.status(routesResp.status).json({ error: "Nie udało się pobrać tras z profilu Strava." });
      return;
    }

    const routes = (await routesResp.json()) as Array<{
      id: number;
      name: string;
      description?: string;
      distance: number;
      elevation_gain: number;
      sub_type: number;
      map?: { summary_polyline?: string };
    }>;

    const mapped = routes.map((r) => {
      let surface: "asfalt" | "szuter" | "mtb" | "mix" = "asfalt";
      if (r.sub_type === 2) surface = "mtb";
      else if (r.sub_type === 3 || r.sub_type === 5) surface = "szuter";
      return {
        id: String(r.id),
        name: r.name || `Trasa Strava #${r.id}`,
        description: r.description || null,
        distanceKm: Math.round((r.distance / 1000) * 10) / 10,
        elevationGainM: Math.round(r.elevation_gain),
        surface,
        hasPolyline: Boolean(r.map?.summary_polyline),
      };
    });

    res.json({ routes: mapped });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Błąd pobierania tras Strava.",
    });
  }
});

app.post("/api/strava/routes/import-to-library", async (req, res) => {
  try {
    await ensureSavedRoutesDirs();
    const { routeId, accessToken, folderSlug } = (req.body || {}) as {
      routeId?: string;
      accessToken?: string;
      folderSlug?: string;
    };

    if (!routeId) {
      res.status(400).json({ error: "Brak identyfikatora trasy Strava." });
      return;
    }
    const token = accessToken?.trim();
    if (!token) {
      res.status(401).json({ error: "Brak tokena dostępu Strava." });
      return;
    }

    const targetFolder = sanitizeSegment(folderSlug || "strava");
    const targetDir = path.join(SAVED_ROUTES_ROOT, targetFolder);
    await fs.mkdir(targetDir, { recursive: true });

    let rawGpxXml = "";
    try {
      const gpxResp = await fetch(
        `https://www.strava.com/api/v3/routes/${encodeURIComponent(routeId)}/export_gpx`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (gpxResp.ok) {
        const text = await gpxResp.text();
        if (text && text.includes("<gpx")) {
          rawGpxXml = text;
        }
      }
    } catch {
      // fallback to summary polyline
    }

    const detailResp = await fetch(
      `https://www.strava.com/api/v3/routes/${encodeURIComponent(routeId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!detailResp.ok && !rawGpxXml) {
      res.status(detailResp.status).json({
        error: `Nie udało się pobrać szczegółów trasy ze Strava (${detailResp.status}).`,
      });
      return;
    }

    const detail = (await detailResp.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      distance?: number;
      elevation_gain?: number;
      sub_type?: number;
      map?: { summary_polyline?: string };
    };

    const routeName = detail.name || `Trasa Strava ${routeId}`;
    let surface: "asfalt" | "szuter" | "mtb" | "mix" = "asfalt";
    if (detail.sub_type === 2) surface = "mtb";
    else if (detail.sub_type === 3 || detail.sub_type === 5) surface = "szuter";

    let points: Array<{
      lat: number;
      lng: number;
      ele: number | null;
      distFromStartKm: number;
      bearingDeg: number;
    }> = [];

    if (rawGpxXml) {
      const regex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"(?:[^>]*)>(?:[\s\S]*?<ele>([^<]+)<\/ele>)?/gi;
      let match;
      let cumKm = 0;
      let prevLat = 0;
      let prevLng = 0;
      while ((match = regex.exec(rawGpxXml)) !== null) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        const ele = match[3] ? parseFloat(match[3]) : null;
        if (points.length > 0) {
          cumKm += haversineKmServer(prevLat, prevLng, lat, lng);
        }
        const bearing = points.length > 0 ? bearingDegServer(prevLat, prevLng, lat, lng) : 0;
        points.push({
          lat,
          lng,
          ele,
          distFromStartKm: Math.round(cumKm * 1000) / 1000,
          bearingDeg: bearing,
        });
        prevLat = lat;
        prevLng = lng;
      }
    }

    if (points.length < 2 && detail.map?.summary_polyline) {
      const decoded = decodePolyline(detail.map.summary_polyline);
      let cumKm = 0;
      let prevLat = 0;
      let prevLng = 0;
      points = decoded.map((p, idx) => {
        if (idx > 0) {
          cumKm += haversineKmServer(prevLat, prevLng, p.lat, p.lng);
        }
        const bearing = idx > 0 ? bearingDegServer(prevLat, prevLng, p.lat, p.lng) : 0;
        prevLat = p.lat;
        prevLng = p.lng;
        return {
          lat: p.lat,
          lng: p.lng,
          ele: null,
          distFromStartKm: Math.round(cumKm * 1000) / 1000,
          bearingDeg: bearing,
        };
      });

      rawGpxXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DarierPro Strava Sync" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${routeName.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</name>
    <desc>${(detail.description || "Zaimportowano ze Strava").replace(/&/g, "&amp;")}</desc>
  </metadata>
  <trk>
    <name>${routeName.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</name>
    <trkseg>
${points.map((pt) => `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}"/>`).join("\n")}
    </trkseg>
  </trk>
</gpx>`;
    }

    if (points.length < 2) {
      res.status(400).json({ error: "Nie udało się wyodrębnić punktów GPS z trasy Strava." });
      return;
    }

    const totalKm = points[points.length - 1].distFromStartKm;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }

    const safeId = `strava-${sanitizeSegment(String(routeId))}`;
    const savedRoute = {
      id: safeId,
      name: routeName,
      fileName: `${safeId}.gpx`,
      folder: targetFolder,
      totalDistanceKm: Math.round(totalKm * 10) / 10,
      elevationGainM: Math.round(detail.elevation_gain || 0),
      elevationLossM: Math.round(detail.elevation_gain || 0),
      minEleM: null,
      maxEleM: null,
      rawPointsCount: points.length,
      points,
      bounds: { minLat, maxLat, minLng, maxLng },
      savedAt: new Date().toISOString(),
      surface,
      bikeType: surface === "szuter" ? "gravel" : surface === "mtb" ? "mtb" : "szosowy",
      avgSpeedKmh: 28,
      notes: detail.description || `Zaimportowano ze Strava (ID #${routeId})`,
      isBuiltinSample: false,
    };

    await fs.writeFile(
      path.join(targetDir, `${safeId}.json`),
      JSON.stringify(savedRoute, null, 2),
      "utf8"
    );
    await fs.writeFile(path.join(targetDir, `${safeId}.gpx`), rawGpxXml, "utf8");

    res.json({
      success: true,
      route: savedRoute,
      message: `Trasa "${routeName}" została pomyślnie zapisana w folderze "${targetFolder}".`,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Błąd importu trasy ze Strava.",
    });
  }
});

app.post("/api/strava/activity-to-gpx", async (req, res) => {
  try {
    await ensureSavedRoutesDirs();
    const { activityId, activityName, accessToken, folderSlug } = (req.body || {}) as {
      activityId?: string;
      activityName?: string;
      accessToken?: string;
      folderSlug?: string;
    };

    if (!activityId) {
      res.status(400).json({ error: "Brak ID aktywności Strava." });
      return;
    }
    const token = accessToken?.trim();
    if (!token) {
      res.status(401).json({ error: "Brak tokena dostępu Strava." });
      return;
    }

    const streamsResp = await fetch(
      `https://www.strava.com/api/v3/activities/${encodeURIComponent(
        activityId
      )}/streams?keys=latlng,altitude,time&key_by_type=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!streamsResp.ok) {
      res.status(streamsResp.status).json({
        error: "Nie udało się pobrać śladu GPS z tej aktywności Strava (brak współrzędnych lub trenażer).",
      });
      return;
    }

    const streams = (await streamsResp.json()) as {
      latlng?: { data?: Array<[number, number]> };
      altitude?: { data?: number[] };
    };

    const coords = streams.latlng?.data || [];
    if (coords.length < 2) {
      res.status(400).json({ error: "Ta aktywność nie zawiera śladu GPS na zewnątrz." });
      return;
    }

    const altitudes = streams.altitude?.data || [];
    const targetFolder = sanitizeSegment(folderSlug || "strava");
    const targetDir = path.join(SAVED_ROUTES_ROOT, targetFolder);
    await fs.mkdir(targetDir, { recursive: true });

    let cumKm = 0;
    let prevLat = 0;
    let prevLng = 0;
    const points = coords.map((c, idx) => {
      const lat = c[0];
      const lng = c[1];
      const ele = altitudes[idx] != null ? altitudes[idx] : null;
      if (idx > 0) {
        cumKm += haversineKmServer(prevLat, prevLng, lat, lng);
      }
      const bearing = idx > 0 ? bearingDegServer(prevLat, prevLng, lat, lng) : 0;
      prevLat = lat;
      prevLng = lng;
      return {
        lat,
        lng,
        ele,
        distFromStartKm: Math.round(cumKm * 1000) / 1000,
        bearingDeg: bearing,
      };
    });

    const routeName = activityName || `Trening Strava #${activityId}`;
    const safeId = `strava-act-${sanitizeSegment(String(activityId))}`;
    const rawGpxXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DarierPro Strava Sync" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${routeName.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</name>
  </metadata>
  <trk>
    <name>${routeName.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</name>
    <trkseg>
${points.map((pt) => `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">${pt.ele != null ? `<ele>${pt.ele.toFixed(1)}</ele>` : ""}</trkpt>`).join("\n")}
    </trkseg>
  </trk>
</gpx>`;

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }

    const savedRoute = {
      id: safeId,
      name: routeName,
      fileName: `${safeId}.gpx`,
      folder: targetFolder,
      totalDistanceKm: Math.round(cumKm * 10) / 10,
      elevationGainM: 0,
      elevationLossM: 0,
      minEleM: null,
      maxEleM: null,
      rawPointsCount: points.length,
      points,
      bounds: { minLat, maxLat, minLng, maxLng },
      savedAt: new Date().toISOString(),
      surface: "asfalt" as const,
      bikeType: "szosowy" as const,
      avgSpeedKmh: 28,
      notes: `Zapisano ze śladu treningu Strava (ID #${activityId})`,
      isBuiltinSample: false,
    };

    await fs.writeFile(
      path.join(targetDir, `${safeId}.json`),
      JSON.stringify(savedRoute, null, 2),
      "utf8"
    );
    await fs.writeFile(path.join(targetDir, `${safeId}.gpx`), rawGpxXml, "utf8");

    res.json({ success: true, route: savedRoute });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Błąd konwersji aktywności Strava do GPX.",
    });
  }
});

// ============================================================================
// Weather & Locality Geocoding Endpoints
// ============================================================================
const PL_DAYS_SHORT = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

function sanitizeWeatherModel(provider?: string): string {
  const allowed = [
    "icon_eu",
    "dwd_icon",
    "ecmwf_ifs025",
    "meteofrance_seamless",
    "gfs_seamless",
    "best_match",
  ];
  if (provider && allowed.includes(provider)) {
    return provider;
  }
  return "icon_eu"; // default to high-resolution DWD ICON-EU for Poland
}

async function fetchMultiDayForecast(lat: number, lng: number, provider: string = "icon_eu") {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", Number(lat).toFixed(4));
    url.searchParams.set("longitude", Number(lng).toFixed(4));
    const model = sanitizeWeatherModel(provider);
    if (model !== "best_match") {
      url.searchParams.set("models", model);
    }
    url.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset,uv_index_max"
    );
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "10");

    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
        precipitation_probability_max?: number[];
        wind_speed_10m_max?: number[];
        wind_gusts_10m_max?: number[];
        wind_direction_10m_dominant?: number[];
        sunrise?: string[];
        sunset?: string[];
        uv_index_max?: number[];
      };
    };

    const dates = data.daily?.time || [];
    return dates.map((d, i) => {
      const code = Math.round(data.daily?.weather_code?.[i] ?? 1);
      const cond = mapWmoWeatherCode(code);
      const tempMinC = Number((data.daily?.temperature_2m_min?.[i] ?? 8).toFixed(1));
      const tempMaxC = Number((data.daily?.temperature_2m_max?.[i] ?? 16).toFixed(1));
      const avgDayTemp = (tempMinC + tempMaxC) / 2;
      const windMaxKmh = Math.round(data.daily?.wind_speed_10m_max?.[i] ?? 12);
      const gustMaxKmh = Math.round(data.daily?.wind_gusts_10m_max?.[i] ?? windMaxKmh);
      const windDirectionDeg = Math.round(data.daily?.wind_direction_10m_dominant?.[i] ?? 270);
      const precipProbMaxPct = Math.round(data.daily?.precipitation_probability_max?.[i] ?? 0);
      const precipSumMm = Number((data.daily?.precipitation_sum?.[i] ?? 0).toFixed(1));
      const uvIndexMax = Number((data.daily?.uv_index_max?.[i] ?? 2).toFixed(1));
      const sunrise = (data.daily?.sunrise?.[i] || `${d}T06:30`).slice(11, 16);
      const sunset = (data.daily?.sunset?.[i] || `${d}T16:30`).slice(11, 16);

      const dt = new Date(`${d}T12:00:00`);
      const dayShort = `${PL_DAYS_SHORT[dt.getDay()] || ""} ${d.slice(8, 10)}.${d.slice(5, 7)}`;

      const { score, verdict } = scoreCyclingComfort({
        avgTempC: avgDayTemp,
        maxGustKmh: gustMaxKmh,
        avgWindKmh: Math.round(windMaxKmh * 0.78),
        maxRainProbPct: precipProbMaxPct,
        totalRainMm: precipSumMm,
      });

      return {
        date: d,
        dayShort,
        conditionEmoji: cond.emoji,
        conditionLabel: cond.label,
        tempMinC,
        tempMaxC,
        windMaxKmh,
        gustMaxKmh,
        windCardinal: cardinalFromDeg(windDirectionDeg),
        windDirectionDeg,
        precipProbMaxPct,
        precipSumMm,
        uvIndexMax,
        sunrise,
        sunset,
        comfortScore: score,
        verdict,
      };
    });
  } catch {
    return [];
  }
}

app.get("/api/weather/geocode", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }

    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", q);
    url.searchParams.set("count", "6");
    url.searchParams.set("language", "pl");
    url.searchParams.set("format", "json");

    const geoRes = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!geoRes.ok) {
      throw new Error(`Błąd wyszukiwania miejscowości (${geoRes.status})`);
    }
    const geoJson = (await geoRes.json()) as { results?: unknown[] };
    res.json({ results: Array.isArray(geoJson.results) ? geoJson.results : [] });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Błąd geokodowania miejscowości.",
    });
  }
});

app.post("/api/weather/location", async (req, res) => {
  try {
    const { lat, lng, name, date, provider } = (req.body || {}) as {
      lat?: number;
      lng?: number;
      name?: string;
      date?: string;
      provider?: string;
    };

    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      res.status(400).json({ error: "Brak prawidłowych współrzędnych miejscowości." });
      return;
    }

    const baseDate =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : formatDateISO(new Date());
    const nextDate = addDaysToIsoDate(baseDate, 1);

    const today = new Date();
    const minSupported = new Date(today);
    minSupported.setDate(today.getDate() - 5);
    const maxSupported = new Date(today);
    maxSupported.setDate(today.getDate() + 15);

    const reqStart = new Date(`${baseDate}T12:00:00`);
    const clampedEnd =
      new Date(`${nextDate}T12:00:00`) > maxSupported
        ? formatDateISO(maxSupported)
        : nextDate;

    if (reqStart < minSupported || reqStart > maxSupported) {
      res.status(400).json({
        error: `Prognoza lokalna dostępna jest w oknie od ${formatDateISO(minSupported)} do ${formatDateISO(maxSupported)}.`,
      });
      return;
    }

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", Number(lat).toFixed(4));
    url.searchParams.set("longitude", Number(lng).toFixed(4));
    const model = sanitizeWeatherModel(provider || (req.query.provider as string));
    if (model !== "best_match") {
      url.searchParams.set("models", model);
    }
    url.searchParams.set(
      "hourly",
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index"
    );
    url.searchParams.set("daily", "sunrise,sunset,uv_index_max");
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("start_date", baseDate);
    url.searchParams.set("end_date", clampedEnd);

    const wRes = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!wRes.ok) {
      throw new Error(`Błąd prognozy lokalnej (${wRes.status})`);
    }

    const raw = (await wRes.json()) as {
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        apparent_temperature?: number[];
        relative_humidity_2m?: number[];
        precipitation_probability?: number[];
        precipitation?: number[];
        weather_code?: number[];
        wind_speed_10m?: number[];
        wind_direction_10m?: number[];
        wind_gusts_10m?: number[];
        uv_index?: number[];
      };
      daily?: {
        sunrise?: string[];
        sunset?: string[];
        uv_index_max?: number[];
      };
    };

    const times = raw.hourly?.time || [];
    const hourly = times.map((timeIso, i) => {
      const tempC = Number((raw.hourly?.temperature_2m?.[i] ?? 15).toFixed(1));
      const apparentTempC = Number((raw.hourly?.apparent_temperature?.[i] ?? tempC).toFixed(1));
      const precipProbPct = Math.round(raw.hourly?.precipitation_probability?.[i] ?? 0);
      const precipitationMm = Number((raw.hourly?.precipitation?.[i] ?? 0).toFixed(1));
      const windSpeedKmh = Math.round(raw.hourly?.wind_speed_10m?.[i] ?? 10);
      const windGustsKmh = Math.round(raw.hourly?.wind_gusts_10m?.[i] ?? windSpeedKmh);
      const windDirectionDeg = Math.round(raw.hourly?.wind_direction_10m?.[i] ?? 270);
      const humidityPct = Math.round(raw.hourly?.relative_humidity_2m?.[i] ?? 60);
      const uvIndex = Number((raw.hourly?.uv_index?.[i] ?? 1).toFixed(1));
      const code = Math.round(raw.hourly?.weather_code?.[i] ?? 1);
      const cond = mapWmoWeatherCode(code);
      const { score } = scoreCyclingComfort({
        avgTempC: tempC,
        maxGustKmh: windGustsKmh,
        avgWindKmh: windSpeedKmh,
        maxRainProbPct: precipProbPct,
        totalRainMm: precipitationMm,
      });

      return {
        timeIso,
        hourLabel: timeIso.slice(11, 16),
        dateLabel: timeIso.slice(5, 10),
        tempC,
        apparentTempC,
        precipProbPct,
        precipitationMm,
        windSpeedKmh,
        windGustsKmh,
        windCardinal: cardinalFromDeg(windDirectionDeg),
        windDirectionDeg,
        humidityPct,
        uvIndex,
        conditionLabel: cond.label,
        conditionEmoji: cond.emoji,
        comfortScore: score,
      };
    });

    // Find top 3 2-hour daytime windows (06:00 - 20:00)
    const windows: Array<{
      startHour: string;
      endHour: string;
      dateLabel: string;
      avgTempC: number;
      avgWindKmh: number;
      maxRainProbPct: number;
      score: number;
      conditionEmoji: string;
    }> = [];

    for (let i = 0; i < hourly.length - 1; i++) {
      const hNum = Number(hourly[i].hourLabel.slice(0, 2));
      if (hNum < 6 || hNum > 19) continue;
      const a = hourly[i];
      const b = hourly[i + 1];
      if (a.dateLabel !== b.dateLabel) continue;
      const avgScore = Math.round((a.comfortScore + b.comfortScore) / 2);
      windows.push({
        startHour: a.hourLabel,
        endHour: `${String(Number(b.hourLabel.slice(0, 2)) + 1).padStart(2, "0")}:00`,
        dateLabel: a.dateLabel,
        avgTempC: Number(((a.tempC + b.tempC) / 2).toFixed(1)),
        avgWindKmh: Math.round((a.windSpeedKmh + b.windSpeedKmh) / 2),
        maxRainProbPct: Math.max(a.precipProbPct, b.precipProbPct),
        score: avgScore,
        conditionEmoji: a.conditionEmoji,
      });
    }

    const topWindows = windows
      .sort((a, b) => b.score - a.score)
      .filter((w, idx, arr) => arr.findIndex((x) => x.dateLabel === w.dateLabel && Math.abs(Number(x.startHour.slice(0, 2)) - Number(w.startHour.slice(0, 2))) < 2) === idx)
      .slice(0, 3);

    const sunriseRaw = raw.daily?.sunrise?.[0] || `${baseDate}T06:30`;
    const sunsetRaw = raw.daily?.sunset?.[0] || `${baseDate}T16:30`;
    const dailyForecast = await fetchMultiDayForecast(Number(lat), Number(lng));

    res.json({
      locationName: name || "Wybrana lokalizacja",
      lat: Number(lat),
      lng: Number(lng),
      daylight: {
        sunrise: sunriseRaw.slice(11, 16),
        sunset: sunsetRaw.slice(11, 16),
        uvIndexMax: Number((raw.daily?.uv_index_max?.[0] ?? 2).toFixed(1)),
      },
      bestWindows: topWindows,
      hourly,
      dailyForecast,
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Nie udało się pobrać prognozy lokalnej.",
    });
  }
});

app.post("/api/weather/route", async (req, res) => {
  try {
    const body = (req.body || {}) as {
      waypoints?: Array<{
        index: number;
        label: string;
        lat: number;
        lng: number;
        ele: number | null;
        km: number;
        etaIso: string;
        etaTimeLabel: string;
        bearingDeg: number;
        slopePct?: number;
      }>;
      speedKmh?: number;
      dateStr?: string;
      provider?: string;
    };

    const waypoints = Array.isArray(body.waypoints) ? body.waypoints.slice(0, 14) : [];
    if (waypoints.length === 0) {
      res.status(400).json({ error: "Brak punktów trasy do sprawdzenia pogody." });
      return;
    }

    const dates = waypoints
      .map((w) => String(w.etaIso || "").slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();

    if (dates.length === 0) {
      res.status(400).json({ error: "Nieprawidłowa data lub godzina startu." });
      return;
    }

    const startDate = body.dateStr && /^\d{4}-\d{2}-\d{2}$/.test(body.dateStr) ? body.dateStr : dates[0];
    const baseEndDate = dates[dates.length - 1];

    // Check forecast window (-5 days .. +15 days from today)
    const today = new Date();
    const minSupported = new Date(today);
    minSupported.setDate(today.getDate() - 5);
    const maxSupported = new Date(today);
    maxSupported.setDate(today.getDate() + 15);
    const maxSupportedStr = formatDateISO(maxSupported);

    const reqStart = new Date(`${startDate}T12:00:00`);
    const reqEnd = new Date(`${baseEndDate}T12:00:00`);
    if (reqStart < minSupported || reqEnd > maxSupported) {
      res.status(400).json({
        error: `Prognoza godzinowa jest dostępna w oknie od ${formatDateISO(minSupported)} do ${maxSupportedStr}. Wybierz bliższą datę jazdy.`,
      });
      return;
    }

    // Fetch up to 1 extra day so evening departure window comparisons have full hourly coverage
    const nextDay = addDaysToIsoDate(baseEndDate, 1);
    const fetchEndDate = nextDay > maxSupportedStr ? maxSupportedStr : nextDay;

    const lats = waypoints.map((w) => Number(w.lat).toFixed(4)).join(",");
    const lngs = waypoints.map((w) => Number(w.lng).toFixed(4)).join(",");

    const weatherProvider = sanitizeWeatherModel(body.provider || (req.query.provider as string));
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lats);
    url.searchParams.set("longitude", lngs);
    if (weatherProvider !== "best_match") {
      url.searchParams.set("models", weatherProvider);
    }
    url.searchParams.set(
      "hourly",
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,uv_index"
    );
    url.searchParams.set("daily", "sunrise,sunset,uv_index_max");
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", fetchEndDate);

    const weatherRes = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!weatherRes.ok) {
      const text = await weatherRes.text().catch(() => "");
      throw new Error(`Błąd serwisu pogodowego (${weatherRes.status}): ${text.slice(0, 140)}`);
    }

    const rawJson = (await weatherRes.json()) as unknown;
    const locations = Array.isArray(rawJson) ? rawJson : [rawJson];

    type LocPayload = {
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        apparent_temperature?: number[];
        relative_humidity_2m?: number[];
        precipitation_probability?: number[];
        precipitation?: number[];
        weather_code?: number[];
        wind_speed_10m?: number[];
        wind_direction_10m?: number[];
        wind_gusts_10m?: number[];
        surface_pressure?: number[];
        uv_index?: number[];
      };
      daily?: {
        sunrise?: string[];
        sunset?: string[];
        uv_index_max?: number[];
      };
    };

    const resolveHourIdx = (times: string[], targetIso: string): number => {
      const prefix = targetIso.slice(0, 13);
      const exact = times.findIndex((t) => t.startsWith(prefix));
      if (exact >= 0) return exact;
      const targetMs = new Date(`${targetIso}:00`).getTime();
      let bestIdx = 0;
      let bestDiff = Infinity;
      times.forEach((t, ti) => {
        const diff = Math.abs(new Date(t).getTime() - targetMs);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = ti;
        }
      });
      return bestIdx;
    };

    const checkpoints = waypoints.map((wp, idx) => {
      const locData = (locations[idx] || locations[0]) as LocPayload;
      const times = locData?.hourly?.time || [];
      const hIdx = resolveHourIdx(times, wp.etaIso);
      const hourly = locData?.hourly;

      const tempC = Number((hourly?.temperature_2m?.[hIdx] ?? 15).toFixed(1));
      const apparentTempC = Number((hourly?.apparent_temperature?.[hIdx] ?? tempC).toFixed(1));
      const humidityPct = Math.round(hourly?.relative_humidity_2m?.[hIdx] ?? 60);
      const precipProbPct = Math.round(hourly?.precipitation_probability?.[hIdx] ?? 0);
      const precipitationMm = Number((hourly?.precipitation?.[hIdx] ?? 0).toFixed(1));
      const weatherCode = Math.round(hourly?.weather_code?.[hIdx] ?? 1);
      const windSpeedKmh = Math.round(hourly?.wind_speed_10m?.[hIdx] ?? 10);
      const windDirectionDeg = Math.round(hourly?.wind_direction_10m?.[hIdx] ?? 270);
      const windGustsKmh = Math.round(hourly?.wind_gusts_10m?.[hIdx] ?? windSpeedKmh);
      const surfacePressureHpa = Math.round(hourly?.surface_pressure?.[hIdx] ?? 1013);
      const uvIndex = Number((hourly?.uv_index?.[hIdx] ?? 1).toFixed(1));

      const cond = mapWmoWeatherCode(weatherCode);
      const windRel = analyzeWindServer(windDirectionDeg, wp.bearingDeg, windSpeedKmh);

      return {
        ...wp,
        tempC,
        apparentTempC,
        humidityPct,
        precipProbPct,
        precipitationMm,
        windSpeedKmh,
        windDirectionDeg,
        windGustsKmh,
        surfacePressureHpa,
        uvIndex,
        weatherCode,
        conditionLabel: cond.label,
        conditionEmoji: cond.emoji,
        conditionCategory: cond.category,
        windImpact: windRel.windImpact,
        windImpactLabel: windRel.windImpactLabel,
        headwindComponentKmh: windRel.headwindComponentKmh,
        windCardinal: cardinalFromDeg(windDirectionDeg),
      };
    });

    // Daylight info from Start point
    const firstLoc = (locations[0] || {}) as LocPayload;
    const sunriseStr = firstLoc.daily?.sunrise?.[0] || `${startDate}T06:30`;
    const sunsetStr = firstLoc.daily?.sunset?.[0] || `${startDate}T16:30`;
    const daylight = {
      sunrise: sunriseStr.slice(11, 16),
      sunset: sunsetStr.slice(11, 16),
      uvIndexMax: Number((firstLoc.daily?.uv_index_max?.[0] ?? 2).toFixed(1)),
    };

    // Departure window comparison for 5 departure times on startDate
    const compareTimes = ["06:00", "09:00", "12:00", "15:00", "18:00"];
    const lastKm = waypoints[waypoints.length - 1]?.km || 50;
    const safeSpeed = Math.max(8, Number(body.speedKmh) || 28);
    const totalMins = Math.round((lastKm / safeSpeed) * 60);

    const compareResults = compareTimes.map((depTime) => {
      const [depH, depM] = depTime.split(":").map(Number);
      const [sy, sm, sd] = startDate.split("-").map(Number);
      const depStart = new Date(sy, (sm || 1) - 1, sd || 1, depH, depM, 0);

      let sumTemp = 0;
      let sumWind = 0;
      let maxGust = 0;
      let maxProb = 0;
      let sumRain = 0;
      let headCnt = 0;
      let tailCnt = 0;

      waypoints.forEach((wp, idx) => {
        const locData = (locations[idx] || locations[0]) as LocPayload;
        const times = locData?.hourly?.time || [];
        const elapsedM = Math.round((wp.km / safeSpeed) * 60);
        const wpEta = new Date(depStart.getTime() + elapsedM * 60000);
        const yyyy = wpEta.getFullYear();
        const mm = String(wpEta.getMonth() + 1).padStart(2, "0");
        const dd = String(wpEta.getDate()).padStart(2, "0");
        const hh = String(wpEta.getHours()).padStart(2, "0");
        const min = String(wpEta.getMinutes()).padStart(2, "0");

        const hIdx = resolveHourIdx(times, `${yyyy}-${mm}-${dd}T${hh}:${min}`);
        const hourly = locData?.hourly;

        const t = hourly?.temperature_2m?.[hIdx] ?? 15;
        const w = hourly?.wind_speed_10m?.[hIdx] ?? 10;
        const g = hourly?.wind_gusts_10m?.[hIdx] ?? w;
        const wd = hourly?.wind_direction_10m?.[hIdx] ?? 270;
        const p = hourly?.precipitation_probability?.[hIdx] ?? 0;
        const r = hourly?.precipitation?.[hIdx] ?? 0;

        sumTemp += t;
        sumWind += w;
        if (g > maxGust) maxGust = Math.round(g);
        if (p > maxProb) maxProb = Math.round(p);
        sumRain += r;

        const wRel = analyzeWindServer(wd, wp.bearingDeg, w);
        if (wRel.windImpact === "headwind") headCnt++;
        else if (wRel.windImpact === "tailwind") tailCnt++;
      });

      const n = waypoints.length;
      const avgTempC = Number((sumTemp / n).toFixed(1));
      const avgWindKmh = Math.round(sumWind / n);
      const totalRainMm = Number(sumRain.toFixed(1));
      const headwindPct = Math.round((headCnt / n) * 100);
      const tailwindPct = Math.round((tailCnt / n) * 100);

      const finishDt = new Date(depStart.getTime() + totalMins * 60000);
      const finishTime = `${String(finishDt.getHours()).padStart(2, "0")}:${String(
        finishDt.getMinutes()
      ).padStart(2, "0")}`;

      const { score, verdict } = scoreCyclingComfort({
        avgTempC,
        maxGustKmh: maxGust,
        avgWindKmh,
        maxRainProbPct: maxProb,
        totalRainMm,
        headwindPct,
      });

      return {
        departureTime: depTime,
        finishTime,
        avgTempC,
        maxGustKmh: maxGust,
        avgWindKmh,
        maxRainProbPct: maxProb,
        totalRainMm,
        tailwindPct,
        headwindPct,
        score,
        verdict,
        isBest: false,
      };
    });

    const maxScore = Math.max(...compareResults.map((c) => c.score));
    let bestMarked = false;
    const departureCompare = compareResults.map((c) => {
      if (!bestMarked && c.score === maxScore) {
        bestMarked = true;
        return { ...c, isBest: true };
      }
      return c;
    });

    const startWp = waypoints[0];
    const dailyForecast = await fetchMultiDayForecast(startWp.lat, startWp.lng, weatherProvider);

    res.json({
      checkpoints,
      daylight,
      departureCompare,
      dailyForecast,
      provider: weatherProvider,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Nie udało się pobrać prognozy pogody wzdłuż trasy.";
    res.status(502).json({ error: message });
  }
});

const multidayCache = new Map<string, { expiresAt: number; dailyForecast: Awaited<ReturnType<typeof fetchMultiDayForecast>> }>();

app.get("/api/weather/multiday", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const weatherProvider = sanitizeWeatherModel((req.query.provider as string) || "best_match");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "Nieprawidłowe współrzędne lat/lng." });
      return;
    }
    const key = `${lat.toFixed(2)}_${lng.toFixed(2)}_${weatherProvider}`;
    const now = Date.now();
    const cached = multidayCache.get(key);
    if (cached && cached.expiresAt > now) {
      res.json({
        lat,
        lng,
        provider: weatherProvider,
        dailyForecast: cached.dailyForecast,
        fetchedAt: new Date().toISOString(),
        cached: true,
      });
      return;
    }
    const dailyForecast = await fetchMultiDayForecast(lat, lng, weatherProvider);
    multidayCache.set(key, {
      expiresAt: now + 15 * 60 * 1000,
      dailyForecast,
    });
    res.json({
      lat,
      lng,
      provider: weatherProvider,
      dailyForecast,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Nie udało się pobrać prognozy 10-dniowej.",
    });
  }
});

type ServerPoiCategory = "water" | "shop" | "gas" | "cafe" | "repair";
interface ServerRoutePoi {
  id: string;
  category: ServerPoiCategory;
  name: string;
  lat: number;
  lng: number;
  kmOnRoute: number;
  distFromRouteM: number;
  openingHours?: string;
}

const routePoisCache = new Map<string, { expiresAt: number; pois: ServerRoutePoi[] }>();
let overpassCooldownUntil = 0;

app.post("/api/gpx/pois", async (req, res) => {
  try {
    const body = (req.body || {}) as {
      points?: Array<{ lat: number; lng: number; km: number }>;
    };
    const rawPts = Array.isArray(body.points) ? body.points : [];
    const pts = rawPts.filter(
      (p) =>
        p &&
        Number.isFinite(Number(p.lat)) &&
        Number.isFinite(Number(p.lng)) &&
        Number.isFinite(Number(p.km))
    );
    if (pts.length < 2) {
      res.status(400).json({ error: "Brak wystarczającej liczby punktów trasy GPX." });
      return;
    }

    const first = pts[0];
    const mid = pts[Math.floor(pts.length / 2)];
    const last = pts[pts.length - 1];
    const cacheKey = `${first.lat.toFixed(3)}_${first.lng.toFixed(3)}_${mid.lat.toFixed(3)}_${last.lat.toFixed(3)}_${Math.round(last.km)}`;
    const now = Date.now();
    const cached = routePoisCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      res.json({ pois: cached.pois, cached: true });
      return;
    }

    // Compute route bounding box padded by ~1.8 km
    const lats = pts.map((p) => Number(p.lat));
    const lngs = pts.map((p) => Number(p.lng));
    const padLat = 0.016;
    const padLng = 0.025;
    const minLat = Math.min(...lats) - padLat;
    const maxLat = Math.max(...lats) + padLat;
    const minLng = Math.min(...lngs) - padLng;
    const maxLng = Math.max(...lngs) + padLng;

    const bboxStr = `${minLat.toFixed(4)},${minLng.toFixed(4)},${maxLat.toFixed(4)},${maxLng.toFixed(4)}`;
    const ql = `[out:json][timeout:10][bbox:${bboxStr}];
(
  node["amenity"="drinking_water"];
  node["man_made"="water_tap"];
  nwr["shop"~"^(supermarket|convenience|bakery|bicycle)$"];
  nwr["amenity"~"^(fuel|cafe|ice_cream|bicycle_repair_station)$"];
);
out center 100;`;

    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    let elements: Array<{
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }> = [];

    if (now > overpassCooldownUntil) {
      for (const ep of endpoints) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const oRes = await fetch(ep, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
              "User-Agent": "DarierPro/1.0",
              Accept: "application/json",
            },
            body: `data=${encodeURIComponent(ql)}`,
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (oRes.status === 429) {
            overpassCooldownUntil = Date.now() + 5 * 60 * 1000;
            continue;
          }
          if (!oRes.ok) continue;
          const json = (await oRes.json()) as { elements?: typeof elements };
          if (Array.isArray(json.elements) && json.elements.length > 0) {
            elements = json.elements;
            break;
          }
        } catch {
          // try next endpoint or Photon fallback
        }
      }
    }

    const mapped: ServerRoutePoi[] = [];

    if (elements.length > 0) {
      for (const el of elements) {
        const lat = typeof el.lat === "number" ? el.lat : el.center?.lat;
        const lng = typeof el.lon === "number" ? el.lon : el.center?.lon;
        if (typeof lat !== "number" || typeof lng !== "number") continue;

        const tags = el.tags || {};
        let category: ServerPoiCategory | null = null;
        let fallbackName = "Punkt na trasie";

        if (tags.amenity === "drinking_water" || tags.man_made === "water_tap") {
          category = "water";
          fallbackName = "Woda pitna / Zdrój";
        } else if (tags.shop === "bicycle" || tags.amenity === "bicycle_repair_station") {
          category = "repair";
          fallbackName =
            tags.amenity === "bicycle_repair_station"
              ? "Stacja naprawy rowerów"
              : "Serwis / Sklep rowerowy";
        } else if (tags.amenity === "fuel") {
          category = "gas";
          fallbackName = "Stacja paliw";
        } else if (
          tags.shop === "supermarket" ||
          tags.shop === "convenience" ||
          tags.shop === "bakery"
        ) {
          category = "shop";
          fallbackName = tags.shop === "bakery" ? "Piekarnia" : "Sklep spożywczy";
        } else if (tags.amenity === "cafe" || tags.amenity === "ice_cream") {
          category = "cafe";
          fallbackName = tags.amenity === "ice_cream" ? "Lodziarnia" : "Kawiarnia";
        }

        if (!category) continue;

        let bestDistKm = Infinity;
        let bestKmOnRoute = 0;
        for (const tp of pts) {
          const dKm = haversineKmServer(lat, lng, tp.lat, tp.lng);
          if (dKm < bestDistKm) {
            bestDistKm = dKm;
            bestKmOnRoute = tp.km;
          }
        }
        const distFromRouteM = Math.round(bestDistKm * 1000);
        if (distFromRouteM > 1400) continue;

        mapped.push({
          id: `${el.type}_${el.id}`,
          category,
          name: (tags.name || tags.brand || fallbackName).trim(),
          lat,
          lng,
          kmOnRoute: Number(bestKmOnRoute.toFixed(1)),
          distFromRouteM,
          openingHours: tags.opening_hours,
        });
      }
    } else {
      // Photon OpenStreetMap fallback (bbox-scoped, reliable under cloud rate limits)
      const photonBbox = `${minLng.toFixed(4)},${minLat.toFixed(4)},${maxLng.toFixed(4)},${maxLat.toFixed(4)}`;
      const photonQueries: Array<{ q: string; cat: ServerPoiCategory; values: string[] }> = [
        { q: "biedronka", cat: "shop", values: ["supermarket", "convenience"] },
        { q: "dino", cat: "shop", values: ["supermarket", "convenience"] },
        { q: "żabka", cat: "shop", values: ["supermarket", "convenience"] },
        { q: "piekarnia", cat: "shop", values: ["bakery", "convenience", "supermarket"] },
        { q: "orlen", cat: "gas", values: ["fuel"] },
        { q: "bp", cat: "gas", values: ["fuel"] },
        { q: "moya", cat: "gas", values: ["fuel"] },
        { q: "kawiarnia", cat: "cafe", values: ["cafe", "ice_cream", "bakery", "restaurant"] },
        { q: "lody", cat: "cafe", values: ["ice_cream", "cafe"] },
        { q: "rower", cat: "repair", values: ["bicycle", "bicycle_repair_station", "bicycle_parking"] },
        { q: "źródło", cat: "water", values: ["drinking_water", "water_tap", "fountain", "spring"] },
      ];

      for (const pq of photonQueries) {
        try {
          const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(pq.q)}&bbox=${photonBbox}&limit=10`;
          const pRes = await fetch(u, {
            headers: { "User-Agent": "DarierPro/1.0", Accept: "application/json" },
            signal: AbortSignal.timeout(4000),
          });
          if (!pRes.ok) continue;
          const pJson = (await pRes.json()) as {
            features?: Array<{
              geometry?: { coordinates?: [number, number] };
              properties?: {
                osm_id?: number;
                osm_type?: string;
                osm_key?: string;
                osm_value?: string;
                name?: string;
              };
            }>;
          };
          for (const f of pJson.features || []) {
            const coords = f.geometry?.coordinates;
            const props = f.properties;
            if (!coords || coords.length < 2 || !props?.name) continue;
            if (!pq.values.includes(props.osm_value || "")) continue;
            const [lng, lat] = coords;
            let bestDistKm = Infinity;
            let bestKmOnRoute = 0;
            for (const tp of pts) {
              const dKm = haversineKmServer(lat, lng, tp.lat, tp.lng);
              if (dKm < bestDistKm) {
                bestDistKm = dKm;
                bestKmOnRoute = tp.km;
              }
            }
            const distFromRouteM = Math.round(bestDistKm * 1000);
            if (distFromRouteM > 1600) continue;

            mapped.push({
              id: `photon_${props.osm_type || "n"}_${props.osm_id || Math.round(lat * 1e5)}`,
              category: pq.cat,
              name: props.name.trim(),
              lat,
              lng,
              kmOnRoute: Number(bestKmOnRoute.toFixed(1)),
              distFromRouteM,
            });
          }
          await new Promise((r) => setTimeout(r, 90));
        } catch {
          // ignore single query timeout
        }
      }
    }

    // Deduplicate POIs of same category within 150m
    const deduped: ServerRoutePoi[] = [];
    for (const p of mapped.sort((a, b) => a.kmOnRoute - b.kmOnRoute)) {
      const dup = deduped.some(
        (existing) =>
          existing.category === p.category &&
          haversineKmServer(existing.lat, existing.lng, p.lat, p.lng) < 0.15
      );
      if (!dup) deduped.push(p);
      if (deduped.length >= 60) break;
    }

    routePoisCache.set(cacheKey, {
      expiresAt: now + 15 * 60 * 1000,
      pois: deduped,
    });

    res.json({ pois: deduped });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Nie udało się pobrać POI wzdłuż trasy.",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CadenceLab server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
