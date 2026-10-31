import { SocialEmptyTab } from "../../components/containers/social-tabs";

/** The Social page's Friends tab (#952), its own chunk: its empty state until the follows and friends (#954) fill it. */
export default function FriendsTab() {
  return <SocialEmptyTab tab="friends" />;
}
