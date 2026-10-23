import { type ReactNode, useEffect, useState } from "react";
import { resolveSystemTimezone } from "../lib/journal-time.js";

/** Format audit timestamps with a timezone; preserve legacy date-only values. */
export function formatEntityTimestamp(value: string, timezone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

export function EntityTimestamps({
  createdAt,
  updatedAt,
  timezone,
}: {
  createdAt: string;
  updatedAt?: string;
  timezone?: string;
}): ReactNode {
  const [settingsTimezone, setSettingsTimezone] = useState(resolveSystemTimezone);
  useEffect(() => {
    if (timezone || !window.todu?.settings?.get) return;
    let active = true;
    window.todu.settings
      .get()
      .then((settings) => {
        if (active) setSettingsTimezone(settings.timezone);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [timezone]);
  const displayTimezone = timezone ?? settingsTimezone;
  return (
    <>
      <span>Created: {formatEntityTimestamp(createdAt, displayTimezone)}</span>
      <span>Updated: {formatEntityTimestamp(updatedAt ?? createdAt, displayTimezone)}</span>
    </>
  );
}
