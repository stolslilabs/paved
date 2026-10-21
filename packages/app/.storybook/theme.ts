import { create } from "storybook/theming";

/**
 * The Storybook UI, dark, on the board's colour (`--color-board` in src/styles/theme.css; spec A). The manager bundle
 * cannot read the token file, so __tests__/tokens.test.ts checks this equals it.
 */
export const BOARD = "#0C0D0F";

export default create({
  base: "dark",
  appBg: BOARD,
  barBg: BOARD,
  appContentBg: BOARD,
  brandTitle: "Paved",
});
