import { type ReactNode, useState } from "react";
import { Icon } from "./Icon.js";

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
        <Icon name="copy" size={16} />
      </button>
      <span role="status">
        {idCopyState === "copied" ? "Copied!" : idCopyState === "error" ? "Could not copy ID." : ""}
      </span>
    </span>
  );
}
