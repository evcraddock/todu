import { Icon } from "./Icon.js";

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm btn-with-icon" onClick={onClick}>
      <Icon name="back" /> {label}
    </button>
  );
}
