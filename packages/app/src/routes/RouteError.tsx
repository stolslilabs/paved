import { isRouteErrorResponse, useRouteError } from "react-router";
import { Notice } from "../components/elements/notice";
import { Button } from "../components/ui/button";
import { TopBar } from "../components/containers/top-bar";
import { useAppNavigate } from "./ref";

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim();
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** A route's `errorElement`: a page that throws (or whose code fails to load) shows this, with a way back home. */
export function RouteError() {
  const error = useRouteError();
  const go = useAppNavigate();
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Something broke" />
      <main data-testid="route-error" className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-2 tablet:max-w-2xl">
        <Notice tone="danger" title="This page could not be shown">
          {describe(error)}
        </Notice>
        <Button onClick={() => go("/", { replace: true })}>Back home</Button>
      </main>
    </div>
  );
}
