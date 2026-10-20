import { Notice } from "../../components/elements/notice";
import { Button } from "../../components/ui/button";
import { TopBar } from "../../components/containers/top-bar";
import { useAppNavigate, useBack } from "../ref";

/** The catch-all: a path that is not in the route map. */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useBack();
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Not found" onBack={onBack} />
      <main data-testid="not-found" className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 tablet:max-w-2xl">
        <Notice tone="warning" title="Page not found">
          This address leads nowhere in Paved.
        </Notice>
        <Button onClick={() => go("/")}>Back home</Button>
      </main>
    </div>
  );
}
