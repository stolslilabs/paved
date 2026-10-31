import { SocialEmptyTab } from "../../components/containers/social-tabs";

/** The Social page's Chat tab (#952), its own chunk: its empty state until the messages (#955) fill it. */
export default function ChatTab() {
  return <SocialEmptyTab tab="chat" />;
}
