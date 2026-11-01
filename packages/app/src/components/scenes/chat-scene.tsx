import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { SocialEmpty } from "../containers/social-empty";
import { TabPage } from "../containers/tab-page";

export interface ChatSceneProps {
  /** The page's content as the app draws it (the conversations, or one open, #955). Unset: the empty state, as a guest sees it. */
  children?: ReactNode;
  /** Back, up to the village (BACK-RULE #783); omitted, the bar's Home. */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The chat page (`/chat`, #973, in place of the Social page's Chat tab): its header (the title and Back), then the World, the
 * guild's and the private conversations and the requests (#955), each opening over the list. From `desktop` it is in the home's
 * side panel, on the right, as every page (open point 2's default).
 */
export function ChatScene({ children, onBack, onNavigate }: ChatSceneProps) {
  return (
    <TabPage tab="chat" title="Chat" onBack={onBack} onNavigate={onNavigate}>
      {children ?? <SocialEmpty page="chat" />}
    </TabPage>
  );
}
