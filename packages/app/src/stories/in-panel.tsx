import type { Decorator } from "@storybook/react-vite";
import { fn } from "storybook/test";
import PagePanel from "../components/containers/page-panel";

/** A page's story drawn as the app draws it from `desktop` (DESK-PANELS, #762): in the home's side panel, laid out as on a phone. */
export const inPanel =
  (title: string): Decorator =>
  (Story) => (
    <PagePanel open title={title} onClose={fn()}>
      <Story />
    </PagePanel>
  );
