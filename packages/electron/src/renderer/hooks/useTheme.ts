import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "dark" | "light";

export const STORAGE_KEY = "todu-theme-preference";

export function getStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "system";
}

export function storePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // localStorage unavailable
  }
}

export function resolveTheme(pref: ThemePreference): "dark" | "light" {
  if (pref === "dark" || pref === "light") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(theme: "dark" | "light"): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Hook that manages theme preference and applies it to the document.
 * Persists preference in localStorage. Listens for system preference changes.
 */
export function useTheme(): {
  preference: ThemePreference;
  resolved: "dark" | "light";
  setPreference: (pref: ThemePreference) => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPreference);
  const [resolved, setResolved] = useState<"dark" | "light">(() => resolveTheme(preference));

  // Apply theme on mount and when preference changes
  useEffect(() => {
    const theme = resolveTheme(preference);
    setResolved(theme);
    applyTheme(theme);
  }, [preference]);

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (preference !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = (): void => {
      const theme = resolveTheme("system");
      setResolved(theme);
      applyTheme(theme);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preference]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    storePreference(pref);
  }, []);

  return { preference, resolved, setPreference };
}
