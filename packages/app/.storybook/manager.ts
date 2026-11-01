import { addons } from "storybook/manager-api";
import theme from "./theme";

addons.setConfig({
  theme,
  // #1002: every section of the sidebar starts folded; Storybook still opens the path to the open story. The IDs are
  // the sections' names as Storybook makes them (lower case, dashes); `__tests__/storybook-sort.test.ts` keeps the list whole.
  sidebar: {
    collapsedRoots: ["scenes", "containers", "elements", "ui", "foundations", "avatar", "pages", "renderer", "tiles"],
  },
});
