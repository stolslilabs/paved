import { styled } from "tamagui";
import { Text, XStack, YStack } from "tamagui";
import { DialogOverlay, DialogTitle } from "./Dialog";
import { Button, ButtonText } from "./Button";

const Row = XStack as any;

export interface ModeDetailDialogProps {
  open: boolean;
  mode: string;
  title: string;
  tileCount: number;
  entryFee: string;
  duration: string;
  prizePool?: string;
  topPlayers?: { name: string; score: number }[];
  hasActiveGame?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ModeDetailDialog = styled(YStack as any, {
  name: "ModeDetailDialog",
  backgroundColor: "$background",
  borderRadius: "$3",
  borderWidth: 1,
  borderColor: "$borderColor",
  padding: "$6",
  maxWidth: 480,
  width: "90%",
  gap: "$4",
} as any) as any;

export const ModeDetailDialogStat = styled(XStack as any, {
  name: "ModeDetailDialogStat",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: "$2",
  borderBottomWidth: 1,
  borderColor: "$borderColor",
} as any) as any;

export function ModeDetailDialogView({
  open,
  title,
  tileCount,
  entryFee,
  duration,
  prizePool,
  topPlayers,
  hasActiveGame,
  onConfirm,
  onClose,
}: ModeDetailDialogProps) {
  if (!open) return null;
  return (
    <DialogOverlay>
      <ModeDetailDialog>
        <DialogTitle>{title}</DialogTitle>
        <ModeDetailDialogStat>
          <Text color="$muted">{"Tiles"}</Text>
          <Text color="$color">{`${tileCount}`}</Text>
        </ModeDetailDialogStat>
        <ModeDetailDialogStat>
          <Text color="$muted">{"Duration"}</Text>
          <Text color="$color">{duration}</Text>
        </ModeDetailDialogStat>
        <ModeDetailDialogStat>
          <Text color="$muted">{"Entry Fee"}</Text>
          <Text color="$color">{entryFee}</Text>
        </ModeDetailDialogStat>
        {prizePool ? (
          <ModeDetailDialogStat>
            <Text color="$muted">{"Prize Pool"}</Text>
            <Text color="$color">{`${prizePool} ETH`}</Text>
          </ModeDetailDialogStat>
        ) : null}
        {topPlayers && topPlayers.length > 0 ? (
          topPlayers.slice(0, 3).map((p: { name: string; score: number }, i: number) => (
            <Text key={i} color="$muted" fontSize="$1">
              {`${i + 1}. ${p.name} - ${p.score}`}
            </Text>
          ))
        ) : null}
        <Row gap="$3">
          <Button variant="ghost" onPress={onClose} flex={1}>
            <ButtonText>{"Cancel"}</ButtonText>
          </Button>
          <Button onPress={onConfirm} flex={1}>
            <ButtonText>{hasActiveGame ? "Resume Game" : "Start Game"}</ButtonText>
          </Button>
        </Row>
      </ModeDetailDialog>
    </DialogOverlay>
  );
}
