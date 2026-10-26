import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { usePagePanel } from "./page-panel-context";

/** The panel's close (`xmark`) at the end of the page's header; nothing on a full page. Escape and a click on the village close it too. */
export function PanelClose({ className }: { className?: string }) {
  const panel = usePagePanel();
  if (!panel) return null;
  return (
    <Button variant="ghost" size="icon" aria-label="Close" onClick={panel.onClose} className={className}>
      <Icon name="xmark" />
    </Button>
  );
}
