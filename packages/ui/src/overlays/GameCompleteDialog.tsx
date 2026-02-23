import { Stack, Text } from "tamagui";
import { DialogOverlay, DialogContent, DialogTitle, DialogDescription } from "../components/Dialog";
import { Button, ButtonText } from "../components/Button";

export interface GameCompleteDialogProps {
  score: number;
  onClose?: () => void;
  onScreenshot?: () => void;
  visible?: boolean;
}

export function GameCompleteDialog({
  score,
  onClose,
  onScreenshot,
  visible = false,
}: GameCompleteDialogProps) {
  if (!visible) return null;

  return (
    <DialogOverlay>
      <DialogContent>
        <DialogTitle>Game Complete!</DialogTitle>
        <DialogDescription>
          Final Score
        </DialogDescription>
        <Text
          fontSize="$8"
          fontWeight="700"
          fontFamily="$heading"
          color="$primary"
          textAlign="center"
        >
          {score.toLocaleString()}
        </Text>
        <Stack flexDirection="row" gap="$3" justifyContent="center">
          {onScreenshot && (
            <Button variant="ghost" onPress={onScreenshot}>
              <ButtonText>Screenshot</ButtonText>
            </Button>
          )}
          <Button onPress={onClose}>
            <ButtonText>Continue</ButtonText>
          </Button>
        </Stack>
      </DialogContent>
    </DialogOverlay>
  );
}
