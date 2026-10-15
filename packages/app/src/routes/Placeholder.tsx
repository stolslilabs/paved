import { TabPage } from "../components/containers/tab-page";
import { TopBar } from "../components/containers/top-bar";
import { useRoutePage } from "./handle";
import { useBack, useTabNavigate } from "./ref";

const BODY = "This page arrives with its phase.";

/**
 * An unwired page, in the layout its route belongs to: a tab page (the sticky navigation, a title) or a
 * full-screen flow (the top bar with Back). A wired scene brings the same chrome itself and replaces it.
 */
export function Placeholder() {
  const page = useRoutePage();
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  if (!page) return null;
  const path = page.path || "/";
  if (page.nav) {
    return (
      <TabPage tab={page.nav} title={page.title} onNavigate={onNavigate}>
        <p data-testid="page" data-path={path} className="text-sm text-muted-foreground">
          {BODY}
        </p>
      </TabPage>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title={page.title} onBack={onBack} />
      <main data-testid="page" data-path={path} className="mx-auto w-full max-w-md px-4 pt-2 text-sm text-muted-foreground tablet:max-w-2xl">
        {BODY}
      </main>
    </div>
  );
}
