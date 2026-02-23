import { styled } from "tamagui";
import { Stack, Text } from "tamagui";
export const Badge = styled(Stack, {
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
    },
    defaultVariants: {
        variant: "default",
    },
});
export const BadgeText = styled(Text, {
    name: "BadgeText",
    color: "$color",
    fontSize: "$1",
    fontWeight: "700",
    fontFamily: "$body",
});
//# sourceMappingURL=Badge.js.map