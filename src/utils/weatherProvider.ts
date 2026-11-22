export interface WeatherProviderOption {
  id: string;
  name: string;
  modelCode: string;
  country: string;
  resolution: string;
  description: string;
  recommendedForPoland?: boolean;
}

export const WEATHER_PROVIDERS: WeatherProviderOption[] = [
  {
    id: "icon_eu",
    name: "DWD ICON-EU (Niemiecka Służba Meteorologiczna)",
    modelCode: "icon_eu",
    country: "Niemcy / Europa Środkowa",
    resolution: "Siatka wysokiej rozdzielczości ~7 km (co 3h)",
    description:
      "Najwyższa sprawdzalność w Polsce i Europie Środkowej. Wyjątkowo dokładne prognozy porywów wiatru, opadów konwekcyjnych i zjawisk burzowych.",
    recommendedForPoland: true,
  },
  {
    id: "ecmwf_ifs025",
    name: "ECMWF IFS (Europejskie Centrum Prognoz)",
    modelCode: "ecmwf_ifs025",
    country: "Europa / Globalny",
    resolution: "Siatka ~25 km (co 6h)",
    description:
      "Uznawany przez meteorologów za najdokładniejszy globalny model numeryczny na świecie (gold standard). Bardzo wiarygodny trend na 3-10 dni.",
  },
  {
    id: "best_match",
    name: "Open-Meteo Best Match (Algorytm hybrydowy)",
    modelCode: "best_match",
    country: "Globalny / Mieszany",
    resolution: "Automatyczny dobór modelu wg współrzędnych",
    description:
      "Domyślny algorytm Open-Meteo łączący dane z wielu stacji i modeli. Może wykazywać rozbieżności przy lokalnych mikroklimatach.",
  },
  {
    id: "meteofrance_seamless",
    name: "Météo-France ARPEGE (Francja)",
    modelCode: "meteofrance_seamless",
    country: "Francja / Europa",
    resolution: "Siatka ~10 km (co 6h)",
    description:
      "Precyzyjny model narodowej służby meteorologicznej Francji. Bardzo dobry w prognozowaniu frontów atmosferycznych i zachmurzenia.",
  },
  {
    id: "gfs_seamless",
    name: "NOAA GFS (USA / Globalny)",
    modelCode: "gfs_seamless",
    country: "USA / Globalny",
    resolution: "Siatka ~22 km (co 6h)",
    description:
      "Klasyczny amerykański model globalny. Często zawyża lub opóźnia lokalne opady deszczu w Europie Środkowej w porównaniu z DWD ICON.",
  },
];

export const WEATHER_PROVIDER_STORAGE_KEY = "darierpro_weather_provider_v1";

export function getStoredWeatherProvider(): string {
  try {
    const stored = localStorage.getItem(WEATHER_PROVIDER_STORAGE_KEY);
    if (stored && WEATHER_PROVIDERS.some((p) => p.id === stored)) {
      return stored;
    }
  } catch {
    // ignore
  }
  return "icon_eu"; // Default to DWD ICON-EU for optimal Polish forecast accuracy
}

export function setStoredWeatherProvider(providerId: string): void {
  try {
    localStorage.setItem(WEATHER_PROVIDER_STORAGE_KEY, providerId);
    window.dispatchEvent(
      new CustomEvent("darierpro-weather-provider-changed", {
        detail: { providerId },
      })
    );
  } catch {
    // ignore
  }
}

export function getWeatherProviderInfo(providerId: string): WeatherProviderOption {
  return (
    WEATHER_PROVIDERS.find((p) => p.id === providerId) ||
    WEATHER_PROVIDERS[0]
  );
}
