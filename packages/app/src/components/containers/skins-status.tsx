import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";

/** Why the skins are not shown: a guest (Connect), the reads on their way, or a failed read (Retry). */
export type SkinsStatus = { kind: "guest" } | { kind: "loading" } | { kind: "error"; message: string; detail?: ErrorDetail };

export interface SkinsStatusViewProps {
  status: SkinsStatus;
  /** What a guest is asked to connect for. */
  guestTitle: string;
  guestText: ReactNode;
  /** The placeholder while loading; a row of tiles by default. */
  skeleton?: ReactNode;
  onConnect?: () => void;
  onRetry?: () => void;
}

/** The skins' place for a guest (Connect), while they load, or after a failed read (Retry): shared by the three skin pages. */
export function SkinsStatusView({ status, guestTitle, guestText, skeleton, onConnect, onRetry }: SkinsStatusViewProps) {
  if (status.kind === "guest") {
    return (
      <Notice
        title={guestTitle}
        action={
          <Button size="sm" onClick={onConnect}>
            Connect
          </Button>
        }
      >
        {guestText}
      </Notice>
    );
  }
  if (status.kind === "error") {
    return (
      <InlineError
        title="The skins could not be read"
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
    <div role="status" aria-label="Loading the skins">
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
