import { useEffect, useState } from "react";

/** Remember a list dropdown without changing its behavior when storage is unavailable. */
export function useSavedSelection<T extends string>(
  key: string,
  defaultValue: T,
  options?: readonly T[],
) {
  const storageKey = `todu:list:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null && (!options || options.includes(saved as T))) return saved as T;
    } catch {
      // Keep the default selection when storage is unavailable.
    }
    return defaultValue;
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // Keep the dropdown usable when storage is unavailable.
    }
  }, [storageKey, value]);
  return [value, setValue] as const;
}
