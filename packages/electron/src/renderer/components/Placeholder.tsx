import type { ReactNode } from "react";

interface PlaceholderProps {
  title: string;
}

export function Placeholder({ title }: PlaceholderProps): ReactNode {
  return (
    <div className="placeholder-view">
      <h2>{title}</h2>
      <p className="placeholder-text">Coming soon</p>
    </div>
  );
}
