export interface ListWindow<T> {
  items: readonly T[];
  start: number;
  end: number;
  total: number;
  hasAbove: boolean;
  hasBelow: boolean;
}

export function getVisibleListWindow<T extends { id: string }>(
  items: readonly T[],
  selectedId: string | null,
  maxVisible: number,
): ListWindow<T> {
  const boundedMaxVisible = Math.max(1, maxVisible);
  if (items.length <= boundedMaxVisible) {
    return {
      items,
      start: 0,
      end: items.length,
      total: items.length,
      hasAbove: false,
      hasBelow: false,
    };
  }

  const selectedIndex = selectedId
    ? Math.max(
        0,
        items.findIndex((item) => item.id === selectedId),
      )
    : 0;
  const halfWindow = Math.floor(boundedMaxVisible / 2);
  const start = Math.min(Math.max(0, selectedIndex - halfWindow), items.length - boundedMaxVisible);
  const end = start + boundedMaxVisible;

  return {
    items: items.slice(start, end),
    start,
    end,
    total: items.length,
    hasAbove: start > 0,
    hasBelow: end < items.length,
  };
}

export function formatListWindowIndicator(
  window: ListWindow<unknown>,
  direction: "above" | "below",
): string | null {
  const count = direction === "above" ? window.start : window.total - window.end;

  if (count <= 0) {
    return null;
  }

  return `${direction === "above" ? "↑" : "↓"} ${count} more`;
}
