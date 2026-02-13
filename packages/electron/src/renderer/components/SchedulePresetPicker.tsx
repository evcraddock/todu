import { type ReactNode, useState } from "react";

const WEEKDAYS = [
  { value: "MO", label: "Mon" },
  { value: "TU", label: "Tue" },
  { value: "WE", label: "Wed" },
  { value: "TH", label: "Thu" },
  { value: "FR", label: "Fri" },
  { value: "SA", label: "Sat" },
  { value: "SU", label: "Sun" },
];

type Preset = "daily" | "weekdays" | "weekly" | "monthly" | "custom";

function presetToRRule(preset: Preset, weekday: string, monthday: string): string {
  switch (preset) {
    case "daily":
      return "FREQ=DAILY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${weekday}`;
    case "monthly":
      return `FREQ=MONTHLY;BYMONTHDAY=${monthday}`;
    case "custom":
      return "";
  }
}

function detectPreset(rrule: string): {
  preset: Preset;
  weekday: string;
  monthday: string;
  custom: string;
} {
  const upper = rrule.toUpperCase();
  if (upper === "FREQ=DAILY") return { preset: "daily", weekday: "MO", monthday: "1", custom: "" };
  if (upper === "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")
    return { preset: "weekdays", weekday: "MO", monthday: "1", custom: "" };
  if (upper.startsWith("FREQ=WEEKLY;BYDAY=") && !upper.includes(",")) {
    const day = upper.replace("FREQ=WEEKLY;BYDAY=", "");
    return { preset: "weekly", weekday: day, monthday: "1", custom: "" };
  }
  if (upper.startsWith("FREQ=MONTHLY;BYMONTHDAY=")) {
    const day = upper.replace("FREQ=MONTHLY;BYMONTHDAY=", "");
    return { preset: "monthly", weekday: "MO", monthday: day, custom: "" };
  }
  return { preset: "custom", weekday: "MO", monthday: "1", custom: rrule };
}

export function SchedulePresetPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (rrule: string) => void;
}): ReactNode {
  const detected = detectPreset(value);
  const [preset, setPreset] = useState<Preset>(detected.preset);
  const [weekday, setWeekday] = useState(detected.weekday);
  const [monthday, setMonthday] = useState(detected.monthday);
  const [custom, setCustom] = useState(detected.custom);

  const handlePresetChange = (newPreset: Preset) => {
    setPreset(newPreset);
    if (newPreset === "custom") {
      onChange(custom);
    } else {
      onChange(presetToRRule(newPreset, weekday, monthday));
    }
  };

  const handleWeekdayChange = (day: string) => {
    setWeekday(day);
    onChange(`FREQ=WEEKLY;BYDAY=${day}`);
  };

  const handleMonthdayChange = (day: string) => {
    setMonthday(day);
    onChange(`FREQ=MONTHLY;BYMONTHDAY=${day}`);
  };

  const handleCustomChange = (rrule: string) => {
    setCustom(rrule);
    onChange(rrule);
  };

  return (
    <div className="schedule-picker">
      <select
        className="input"
        value={preset}
        onChange={(e) => handlePresetChange(e.target.value as Preset)}
      >
        <option value="daily">Daily</option>
        <option value="weekdays">Every weekday</option>
        <option value="weekly">Weekly (pick day)</option>
        <option value="monthly">Monthly (pick date)</option>
        <option value="custom">Custom RRULE</option>
      </select>

      {preset === "weekly" && (
        <select
          className="input schedule-sub-select"
          value={weekday}
          onChange={(e) => handleWeekdayChange(e.target.value)}
        >
          {WEEKDAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      )}

      {preset === "monthly" && (
        <select
          className="input schedule-sub-select"
          value={monthday}
          onChange={(e) => handleMonthdayChange(e.target.value)}
        >
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={String(d)}>
              Day {d}
            </option>
          ))}
        </select>
      )}

      {preset === "custom" && (
        <input
          type="text"
          className="input schedule-custom-input"
          placeholder="e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR"
          value={custom}
          onChange={(e) => handleCustomChange(e.target.value)}
        />
      )}
    </div>
  );
}
