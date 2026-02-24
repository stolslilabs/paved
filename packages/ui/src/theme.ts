import { createV5Theme, defaultChildrenThemes } from "@tamagui/config/v5";
import { yellow, yellowDark, red, redDark, green, greenDark } from "@tamagui/colors";
import { v5ComponentThemes } from "@tamagui/themes/v5";
import { createFont, createTamagui, createTokens } from "tamagui";

const rubikFont = createFont({
  family: "RubikMonoOne",
  size: {
    1: 12,
    2: 14,
    3: 16,
    4: 18,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
    9: 48,
  },
  lineHeight: {
    1: 16,
    2: 18,
    3: 20,
    4: 22,
    5: 24,
    6: 28,
    7: 36,
    8: 44,
    9: 52,
  },
  weight: {
    4: "400",
    7: "700",
  },
  letterSpacing: {
    4: 0,
  },
});

const tokens = createTokens({
  color: {
    background: "#0a0a0a",
    backgroundHover: "#1a1a1a",
    backgroundPress: "#111111",
    backgroundFocus: "#1a1a1a",
    backgroundTransparent: "rgba(10, 10, 10, 0.8)",
    borderColor: "#333333",
    borderColorHover: "#555555",
    color: "#ffffff",
    colorHover: "#cccccc",
    colorPress: "#999999",
    colorFocus: "#cccccc",
    primary: "#f59e0b",
    primaryHover: "#d97706",
    secondary: "#6366f1",
    success: "#22c55e",
    error: "#ef4444",
    warning: "#eab308",
    muted: "#6b7280",
    // Game-specific
    road: "#a0522d",
    city: "#708090",
    forest: "#228b22",
    wonder: "#daa520",
    stop: "#dc143c",
  },
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
    9: 48,
    10: 64,
    true: 16,
  },
  size: {
    0: 0,
    1: 20,
    2: 24,
    3: 28,
    4: 32,
    5: 36,
    6: 40,
    7: 48,
    8: 56,
    9: 64,
    10: 72,
    true: 44,
  },
  radius: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    true: 8,
  },
  zIndex: {
    0: 0,
    1: 100,
    2: 200,
    3: 300,
    4: 400,
    5: 500,
  },
});

const darkPalette = [
  "hsla(0, 15%, 1%, 1)",
  "hsla(0, 15%, 6%, 1)",
  "hsla(0, 15%, 12%, 1)",
  "hsla(0, 15%, 17%, 1)",
  "hsla(0, 15%, 23%, 1)",
  "hsla(0, 15%, 28%, 1)",
  "hsla(0, 15%, 34%, 1)",
  "hsla(0, 15%, 39%, 1)",
  "hsla(0, 15%, 45%, 1)",
  "hsla(0, 15%, 50%, 1)",
  "hsla(0, 15%, 93%, 1)",
  "hsla(0, 15%, 99%, 1)",
];

const lightPalette = [
  "hsla(0, 15%, 99%, 1)",
  "hsla(0, 15%, 94%, 1)",
  "hsla(0, 15%, 88%, 1)",
  "hsla(0, 15%, 83%, 1)",
  "hsla(0, 15%, 77%, 1)",
  "hsla(0, 15%, 72%, 1)",
  "hsla(0, 15%, 66%, 1)",
  "hsla(0, 15%, 61%, 1)",
  "hsla(0, 15%, 55%, 1)",
  "hsla(0, 15%, 50%, 1)",
  "hsla(0, 15%, 15%, 1)",
  "hsla(0, 15%, 1%, 1)",
];

const accentLight = {
  accent1: "hsla(40, 27%, 40%, 1)",
  accent2: "hsla(40, 27%, 43%, 1)",
  accent3: "hsla(40, 27%, 46%, 1)",
  accent4: "hsla(40, 27%, 48%, 1)",
  accent5: "hsla(40, 27%, 51%, 1)",
  accent6: "hsla(40, 27%, 54%, 1)",
  accent7: "hsla(40, 27%, 57%, 1)",
  accent8: "hsla(40, 27%, 59%, 1)",
  accent9: "hsla(40, 27%, 62%, 1)",
  accent10: "hsla(40, 27%, 65%, 1)",
  accent11: "hsla(250, 50%, 95%, 1)",
  accent12: "hsla(250, 50%, 95%, 1)",
};

const accentDark = {
  accent1: "hsla(40, 27%, 38%, 1)",
  accent2: "hsla(40, 27%, 40%, 1)",
  accent3: "hsla(40, 27%, 43%, 1)",
  accent4: "hsla(40, 27%, 45%, 1)",
  accent5: "hsla(40, 27%, 48%, 1)",
  accent6: "hsla(40, 27%, 50%, 1)",
  accent7: "hsla(40, 27%, 53%, 1)",
  accent8: "hsla(40, 27%, 55%, 1)",
  accent9: "hsla(40, 27%, 58%, 1)",
  accent10: "hsla(40, 27%, 60%, 1)",
  accent11: "hsla(250, 50%, 90%, 1)",
  accent12: "hsla(250, 50%, 95%, 1)",
};

const builtThemes = createV5Theme({
  darkPalette,
  lightPalette,
  componentThemes: v5ComponentThemes,
  accent: {
    light: accentLight,
    dark: accentDark,
  },
  childrenThemes: {
    ...defaultChildrenThemes,
    warning: {
      light: yellow,
      dark: yellowDark,
    },
    error: {
      light: red,
      dark: redDark,
    },
    success: {
      light: green,
      dark: greenDark,
    },
  },
});

export type Themes = typeof builtThemes;
export const themes: Themes = builtThemes;

export const tamaguiConfig = createTamagui({
  tokens,
  themes: themes as any,
  fonts: {
    heading: rubikFont,
    body: rubikFont,
  },
  defaultTheme: "dark",
});

export type TamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  interface TamaguiCustomConfig extends TamaguiConfig {}
}
