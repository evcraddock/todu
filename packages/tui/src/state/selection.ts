export function resolveSelectedId<T extends { id: string }>(
  items: readonly T[],
  currentSelectedId: string | null,
): string | null {
  if (items.length === 0) {
    return null;
  }

  if (currentSelectedId && items.some((item) => item.id === currentSelectedId)) {
    return currentSelectedId;
  }

  return items[0]?.id ?? null;
}

export function moveSelection<T extends { id: string }>(
  items: readonly T[],
  currentSelectedId: string | null,
  direction: "next" | "previous",
): string | null {
  if (items.length === 0) {
    return null;
  }

  const currentIndex = currentSelectedId
    ? items.findIndex((item) => item.id === currentSelectedId)
    : -1;
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(items.length - 1, safeIndex + delta));

  return items[nextIndex]?.id ?? null;
}

export function getSelectedItem<T extends { id: string }>(
  items: readonly T[],
  selectedId: string | null,
): T | null {
  return items.find((item) => item.id === selectedId) ?? null;
}
