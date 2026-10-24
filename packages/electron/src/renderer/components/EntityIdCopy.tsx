import { type ReactNode, useState } from "react";

export function EntityIdCopy({ id, entityName }: { id: string; entityName: string }): ReactNode {
  const [idCopyResult, setIdCopyResult] = useState<{
    id: string;
    status: "copied" | "error";
  } | null>(null);
  const idCopyState = idCopyResult?.id === id ? idCopyResult.status : "idle";
  return (
    <span className="detail-id-copy">
      <span>{id}</span>
      <button
        type="button"
        className="btn-icon detail-copy-button"
        aria-label={`Copy ${entityName} ID`}
        title={`Copy ${entityName} ID`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(id);
            setIdCopyResult({ id: id, status: "copied" });
          } catch {
            setIdCopyResult({ id: id, status: "error" });
          }
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <span role="status">
        {idCopyState === "copied" ? "Copied!" : idCopyState === "error" ? "Could not copy ID." : ""}
      </span>
    </span>
  );
}
