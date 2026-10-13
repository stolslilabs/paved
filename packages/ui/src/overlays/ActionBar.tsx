import { XStack, YStack } from "tamagui";
const Stack = YStack as any;
const Row = XStack as any;
import { Button, ButtonText } from "../components/Button";
import { TilePreview } from "./TilePreview";

export interface ActionBarProps {
  tilePlan: number;
  orientation: number;
  onRotate?: () => void;
  onConfirm?: () => void;
  onDiscard?: () => void;
  confirmDisabled?: boolean;
  discardDisabled?: boolean;
}

export function ActionBar({
  tilePlan,
  orientation,
  onRotate,
  onConfirm,
  onDiscard,
  confirmDisabled = false,
  discardDisabled = false,
}: ActionBarProps) {
  return (
    <Stack
      flexDirection="row"
      alignItems="center"
      gap="$3"
      padding="$3"
      backgroundColor="rgba(0,0,0,0.75)"
      borderRadius="$3"
      borderWidth={1}
      borderColor="$borderColor"
    >
      {/* Tile preview */}
      <TilePreview tilePlan={tilePlan} orientation={orientation} size={64} />

      {/* Action buttons */}
      <Row gap="$2" alignItems="center">
        <Button variant="ghost" onPress={onRotate}>
          <ButtonText>Rotate</ButtonText>
        </Button>
        <Button disabled={confirmDisabled} onPress={onConfirm}>
          <ButtonText>Confirm</ButtonText>
        </Button>
        <Button variant="danger" disabled={discardDisabled} onPress={onDiscard}>
          <ButtonText>Discard</ButtonText>
        </Button>
      </Row>
    </Stack>
  );
}
