import { styled } from "tamagui";
import { Text, XStack, YStack } from "tamagui";
import { Badge, BadgeText } from "./Badge";
import { Button, ButtonText } from "./Button";

const Stack = YStack as any;

export interface GameModeCardProps {
  mode: string;
  title: string;
  description: string;
  tileCount: number;
  duration: string;
  entryFee: string;
  prizePool?: string;
  topPlayers?: { name: string; score: number }[];
  timeRemaining?: string;
  hasActiveGame?: boolean;
  onPress: () => void;
}

export const GameModeCard = styled(YStack as any, {
  name: "GameModeCard",
  backgroundColor: "$backgroundHover",
  borderRadius: "$3",
  borderWidth: 1,
  borderColor: "$borderColor",
  padding: "$4",
  gap: "$3",
  cursor: "pointer",
  pressStyle: {
    scale: 0.98,
    backgroundColor: "$backgroundPress",
  },
  hoverStyle: {
    borderColor: "$borderColorHover",
  },
} as any) as any;

export const GameModeCardTitle = styled(Text, {
  name: "GameModeCardTitle",
  color: "$color",
  fontSize: "$5",
  fontWeight: "700",
  fontFamily: "$heading",
});

export const GameModeCardDescription = styled(Text, {
  name: "GameModeCardDescription",
  color: "$muted",
  fontSize: "$2",
  fontFamily: "$body",
});

export const GameModeCardStats = styled(XStack as any, {
  name: "GameModeCardStats",
  gap: "$3",
  flexWrap: "wrap",
  alignItems: "center",
} as any) as any;

export function GameModeCardView({
  title,
  description,
  tileCount,
  duration,
  entryFee,
  prizePool,
  topPlayers,
  timeRemaining,
  hasActiveGame,
  onPress,
}: GameModeCardProps) {
  return (
    <GameModeCard
      onPress={onPress}
      borderColor={hasActiveGame ? "$primary" : "$borderColor"}
    >
      <GameModeCardTitle>{title}</GameModeCardTitle>
      <GameModeCardDescription>{description}</GameModeCardDescription>
      <GameModeCardStats>
        <Badge>
          <BadgeText>{`${tileCount} tiles`}</BadgeText>
        </Badge>
        <Badge>
          <BadgeText>{duration}</BadgeText>
        </Badge>
        <Badge variant={entryFee === "Free" ? "success" : "warning"}>
          <BadgeText>{entryFee}</BadgeText>
        </Badge>
      </GameModeCardStats>
      {prizePool ? (
        <Text color="$muted" fontSize="$2">
          {`Prize: ${prizePool} ETH`}
        </Text>
      ) : null}
      {timeRemaining ? (
        <Text color="$muted" fontSize="$1">
          {`Time: ${timeRemaining}`}
        </Text>
      ) : null}
      {topPlayers && topPlayers.length > 0 ? (
        <Stack gap="$1">
          {topPlayers.slice(0, 3).map((p: { name: string; score: number }, i: number) => (
            <Text key={i} color="$muted" fontSize="$1">
              {`${i + 1}. ${p.name} - ${p.score}`}
            </Text>
          ))}
        </Stack>
      ) : null}
      <Button onPress={onPress}>
        <ButtonText>{hasActiveGame ? "Resume" : "Play"}</ButtonText>
      </Button>
    </GameModeCard>
  );
}
