import { styled, GetProps } from "tamagui";
import { Stack, Text } from "tamagui";

export const Button = styled(Stack, {
  name: "Button",
  tag: "button",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  gap: "$2",
  paddingHorizontal: "$4",
  paddingVertical: "$2",
  borderRadius: "$2",
  backgroundColor: "$primary",
  cursor: "pointer",
  pressStyle: {
    opacity: 0.8,
    scale: 0.98,
  },
  hoverStyle: {
    backgroundColor: "$primaryHover",
  },
  variants: {
    variant: {
      primary: {
        backgroundColor: "$primary",
      },
      secondary: {
        backgroundColor: "$secondary",
      },
      ghost: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "$borderColor",
      },
      danger: {
        backgroundColor: "$error",
      },
    },
    size: {
      sm: {
        paddingHorizontal: "$2",
        paddingVertical: "$1",
        height: "$1",
      },
      md: {
        paddingHorizontal: "$4",
        paddingVertical: "$2",
        height: "$true",
      },
      lg: {
        paddingHorizontal: "$6",
        paddingVertical: "$3",
        height: "$7",
      },
    },
    disabled: {
      true: {
        opacity: 0.5,
        cursor: "not-allowed",
        pointerEvents: "none",
      },
    },
  } as const,
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export const ButtonText = styled(Text, {
  name: "ButtonText",
  color: "$color",
  fontSize: "$3",
  fontWeight: "700",
  fontFamily: "$body",
});

export type ButtonProps = GetProps<typeof Button>;
