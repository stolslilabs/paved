import { styled } from "tamagui";
import { Stack, Text } from "tamagui";
export const Card = styled(Stack, {
    name: "Card",
    backgroundColor: "$backgroundHover",
    borderRadius: "$3",
    borderWidth: 1,
    borderColor: "$borderColor",
    padding: "$4",
    variants: {
        pressable: {
            true: {
                cursor: "pointer",
                pressStyle: {
                    scale: 0.98,
                    backgroundColor: "$backgroundPress",
                },
                hoverStyle: {
                    borderColor: "$borderColorHover",
                },
            },
        },
    },
});
export const CardTitle = styled(Text, {
    name: "CardTitle",
    color: "$color",
    fontSize: "$5",
    fontWeight: "700",
    fontFamily: "$heading",
    marginBottom: "$2",
});
export const CardDescription = styled(Text, {
    name: "CardDescription",
    color: "$muted",
    fontSize: "$2",
    fontFamily: "$body",
});
//# sourceMappingURL=Card.js.map