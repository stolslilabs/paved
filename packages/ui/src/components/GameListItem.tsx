import { styled } from "tamagui";
import { Text, XStack, YStack } from "tamagui";
import { Badge, BadgeText } from "./Badge";
import { Button, ButtonText } from "./Button";

export interface GameListItemProps {
  gameId: number;
  mode: string;
  score: number;
  tilesPlaced: number;
  totalTiles: number;
  isOver: boolean;
  onEnter: () => void;
}

export const GameListItem = styled(XStack as any, {
  name: "GameListItem",
  backgroundColor: "$backgroundHover",
  borderRadius: "$3",
  borderWidth: 1,
  borderColor: "$borderColor",
  padding: "$3",
  gap: "$3",
  alignItems: "center",
  cursor: "pointer",
  pressStyle: {
    scale: 0.98,
    backgroundColor: "$backgroundPress",
  },
  hoverStyle: {
    borderColor: "$borderColorHover",
  },
} as any) as any;

export const GameListItemRow = styled(XStack as any, {
  name: "GameListItemRow",
  flex: 1,
  alignItems: "center",
  gap: "$2",
} as any) as any;

export const GameListItemLabel = styled(Text, {
  name: "GameListItemLabel",
  color: "$muted",
  fontSize: "$1",
  fontFamily: "$body",
});

export const GameListItemValue = styled(Text, {
  name: "GameListItemValue",
  color: "$color",
  fontSize: "$3",
  fontWeight: "700",
  fontFamily: "$body",
});

export function GameListItemView({
  gameId,
  mode,
  score,
  tilesPlaced,
  totalTiles,
  isOver,
  onEnter,
}: GameListItemProps) {
  return (
    <GameListItem onPress={onEnter}>
      <GameListItemRow>
        <Text color="$muted" fontSize="$1">
          {`#${gameId}`}
        </Text>
        <Badge>
          <BadgeText>{mode}</BadgeText>
        </Badge>
        <GameListItemValue>{`${score}`}</GameListItemValue>
        <Text color="$muted" fontSize="$1">
          {`${tilesPlaced}/${totalTiles}`}
        </Text>
      </GameListItemRow>
      <Badge variant={isOver ? "default" : "success"}>
        <BadgeText>{isOver ? "Complete" : "Active"}</BadgeText>
      </Badge>
      <Button size="sm" variant={isOver ? "ghost" : "primary"} onPress={onEnter}>
        <ButtonText>{isOver ? "View" : "Play"}</ButtonText>
      </Button>
    </GameListItem>
  );
}
