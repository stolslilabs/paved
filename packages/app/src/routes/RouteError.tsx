import { useEffect, useState } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { InlineError } from "../components/elements/inline-error";
import { LoadingScene } from "../components/scenes/loading-scene";
import { Button } from "../components/ui/button";
import { TopBar } from "../components/containers/top-bar";
import { isChunkLoadError, reloadOnStaleChunk } from "../lib/stale-chunk";
import { errorDetail } from "./error-detail";
import { useAppNavigate } from "./ref";

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim();
  return error instanceof Error ? error.message : "Something went wrong.";
}

/**
 * A route's `errorElement`: a page that throws (or whose code fails to load) shows this, with a way back home. Code of a
 * build the host no longer serves reloads the page once (#589): the loading scene shows while the host is asked; a second
 * failure, or one that is not a stale build, shows the error with a "Reload" action.
 */
export function RouteError() {
  const error = useRouteError();
  const go = useAppNavigate();
  const chunk = isChunkLoadError(error);
  const [checking, setChecking] = useState(chunk);
  useEffect(() => {
    if (!chunk) return;
    let live = true;
    void reloadOnStaleChunk(error).then((reloading) => live && !reloading && setChecking(false));
    return () => {
      live = false;
    };
  }, [chunk, error]);
  if (checking) return <LoadingScene progress={null} />;
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Something broke" />
      <main data-testid="route-error" className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-2 tablet:max-w-2xl">
        <InlineError title="This page could not be shown" message={describe(error)} detail={errorDetail(error)} />
        {chunk && <Button onClick={() => window.location.reload()}>Reload</Button>}
        <Button variant={chunk ? "outline" : undefined} onClick={() => go("/", { replace: true })}>
          Back home
        </Button>
      </main>
    </div>
  );
}
