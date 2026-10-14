import { create } from "storybook/theming";

/** The Storybook UI, dark, on the board's colour (`--color-board` in src/styles/theme.css; spec A). */
export const BOARD = "#07111A";

export default create({
  base: "dark",
  appBg: BOARD,
  barBg: BOARD,
  appContentBg: BOARD,
  brandTitle: "Paved",
});
