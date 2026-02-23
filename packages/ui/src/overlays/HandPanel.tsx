import { Stack } from "tamagui";
import { Button, ButtonText } from "../components/Button";

export interface HandPanelProps {
  onRotate?: () => void;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
}

export function HandPanel({
  onRotate,
  onConfirm,
  confirmDisabled = false,
}: HandPanelProps) {
  return (
    <Stack flexDirection="row" gap="$3" padding="$3" alignItems="center">
      <Button variant="ghost" onPress={onRotate}>
        <ButtonText>Rotate</ButtonText>
      </Button>
      <Button disabled={confirmDisabled} onPress={onConfirm}>
        <ButtonText>Confirm</ButtonText>
      </Button>
    </Stack>
  );
}
