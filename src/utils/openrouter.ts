export const OPENROUTER_STORAGE_KEY = "darierpro_openrouter_api_key";
export const OPENROUTER_DEFAULT_MODEL = "openrouter/free";

export function getStoredOpenRouterKey(): string {
  try {
    return localStorage.getItem(OPENROUTER_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredOpenRouterKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(OPENROUTER_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(OPENROUTER_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function hasStoredOpenRouterKey(): boolean {
  return Boolean(getStoredOpenRouterKey());
}
