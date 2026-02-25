import { styled } from "tamagui";
import { Text, YStack } from "tamagui";

export const Badge = styled(YStack as any, {
  name: "Badge",
  paddingHorizontal: "$2",
  paddingVertical: "$1",
  borderRadius: "$1",
  backgroundColor: "$backgroundHover",
  alignItems: "center",
  justifyContent: "center",
  variants: {
    variant: {
      default: { backgroundColor: "$backgroundHover" },
      success: { backgroundColor: "$success" },
      error: { backgroundColor: "$error" },
      warning: { backgroundColor: "$warning" },
      primary: { backgroundColor: "$primary" },
    },
  } as const,
  defaultVariants: {
    variant: "default",
  },
} as any) as any;

export const BadgeText = styled(Text, {
  name: "BadgeText",
  color: "$color",
  fontSize: "$1",
  fontWeight: "700",
  fontFamily: "$body",
});

export type BadgeProps = any;
