export const GROQ_STORAGE_KEY = "darierpro_groq_api_key";

export function getStoredGroqKey(): string {
  try {
    return localStorage.getItem(GROQ_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredGroqKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(GROQ_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(GROQ_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function hasStoredGroqKey(): boolean {
  return Boolean(getStoredGroqKey());
}
