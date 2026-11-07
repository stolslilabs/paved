import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { InlineError, type ErrorDetail } from "../elements/inline-error";

/**
 * Why the skins are not shown: the reads on their way (the account's too: every player has one, NO-GUEST, the owner's ruling of
 * 2026-11-07, so none is asked to connect), or a failed read (Retry).
 */
export type SkinsStatus = { kind: "loading" } | { kind: "error"; message: string; detail?: ErrorDetail };

export interface SkinsStatusViewProps {
  status: SkinsStatus;
  /** The heading of a failed read. */
  errorTitle?: string;
  /** The placeholder while loading; a row of tiles by default. */
  skeleton?: ReactNode;
  onRetry?: () => void;
}

/** The skins' place while they load, or after a failed read (Retry): shared by the skin pages. */
export function SkinsStatusView({ status, errorTitle = "The skins could not be read", skeleton, onRetry }: SkinsStatusViewProps) {
  if (status.kind === "error") {
    return (
      <InlineError
        title={errorTitle}
        message={status.message}
        detail={status.detail}
        action={
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    );
  }
  return (
    <div role="status" aria-label="Loading">
      {skeleton ?? (
        <div className="grid grid-cols-3 gap-2 tablet:grid-cols-4 desktop:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
          ))}
        </div>
      )}
    </div>
  );
}
