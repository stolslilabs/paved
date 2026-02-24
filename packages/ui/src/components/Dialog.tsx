import { styled } from "tamagui";
import { Text, YStack } from "tamagui";

export const DialogOverlay = styled(YStack as any, {
  name: "DialogOverlay",
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  alignItems: "center",
  justifyContent: "center",
  zIndex: "$5",
} as any) as any;

export const DialogContent = styled(YStack as any, {
  name: "DialogContent",
  backgroundColor: "$background",
  borderRadius: "$3",
  borderWidth: 1,
  borderColor: "$borderColor",
  padding: "$6",
  maxWidth: 480,
  width: "90%",
  gap: "$4",
} as any) as any;

export const DialogTitle = styled(Text, {
  name: "DialogTitle",
  color: "$color",
  fontSize: "$6",
  fontWeight: "700",
  fontFamily: "$heading",
  textAlign: "center",
});

export const DialogDescription = styled(Text, {
  name: "DialogDescription",
  color: "$muted",
  fontSize: "$3",
  fontFamily: "$body",
  textAlign: "center",
});

export type DialogContentProps = any;
