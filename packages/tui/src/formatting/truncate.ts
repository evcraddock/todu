export function truncateText(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength === 1) {
    return "…";
  }

  return `${value.slice(0, maxLength - 1)}…`;
}
