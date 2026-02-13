import { type ReactNode, useState } from "react";

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
  "#a855f7", // purple
  "#14b8a6", // teal
  "#f59e0b", // amber
];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}): ReactNode {
  const [customHex, setCustomHex] = useState(value || "");
  const isCustom = value && !PRESET_COLORS.includes(value);

  const handleCustomChange = (hex: string) => {
    setCustomHex(hex);
    if (HEX_COLOR_REGEX.test(hex)) {
      onChange(hex);
    }
  };

  return (
    <div className="color-picker">
      <div className="color-presets">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch ${value === color ? "color-swatch-selected" : ""}`}
            style={{ backgroundColor: color }}
            onClick={() => {
              onChange(color);
              setCustomHex(color);
            }}
            title={color}
          />
        ))}
      </div>
      <div className="color-custom">
        <input
          type="text"
          className={`input color-hex-input ${isCustom && !HEX_COLOR_REGEX.test(customHex) ? "input-error" : ""}`}
          placeholder="#RRGGBB"
          value={customHex}
          onChange={(e) => handleCustomChange(e.target.value)}
          maxLength={7}
        />
        {value && HEX_COLOR_REGEX.test(value) && (
          <span className="color-preview" style={{ backgroundColor: value }} />
        )}
      </div>
    </div>
  );
}
