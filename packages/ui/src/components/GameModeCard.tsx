import type { ReactNode } from "react";
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
  topPlayers?: { name: string; score: number }[];
  timeRemaining?: string;
  hasActiveGame?: boolean;
  /** A free card (Training): the fee badge says "Free" and no time or podium line shows. */
  free?: boolean;
  /** The button's label; "Resume" or "Play" by default. */
  actionLabel?: string;
  /** Content under the stats (the Challenge's top 3, with links). Pressing inside it does not press the card. */
  extra?: ReactNode;
  /** A plain notice under the stats (the Challenge's paused spawn, G4); the card still opens, a started game still resumes. */
  notice?: string;
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
  mode,
  title,
  description,
  tileCount,
  duration,
  entryFee,
  topPlayers,
  timeRemaining,
  hasActiveGame,
  free,
  actionLabel,
  extra,
  notice,
  onPress,
}: GameModeCardProps) {
  const fee = free ? "Free" : entryFee;
  const time = free ? undefined : timeRemaining;
  const podium = free ? undefined : topPlayers;
  return (
    <GameModeCard
      data-testid={`mode-card-${mode}`}
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
        <Badge variant={fee === "Free" ? "success" : "warning"}>
          <BadgeText>{fee}</BadgeText>
        </Badge>
      </GameModeCardStats>
      {time ? (
        <Text color="$muted" fontSize="$1">
          {`Time: ${time}`}
        </Text>
      ) : null}
      {podium && podium.length > 0 ? (
        <Stack gap="$1">
          {podium.slice(0, 3).map((p: { name: string; score: number }, i: number) => (
            <Text key={i} color="$muted" fontSize="$1">
              {`${i + 1}. ${p.name} - ${p.score}`}
            </Text>
          ))}
        </Stack>
      ) : null}
      {notice ? (
        <Text role="status" color="$muted" fontSize="$1" data-testid={`mode-card-notice-${mode}`}>
          {notice}
        </Text>
      ) : null}
      {extra ? <div onClick={(e) => e.stopPropagation()}>{extra}</div> : null}
      <Button onPress={onPress}>
        <ButtonText>{actionLabel ?? (hasActiveGame ? "Resume" : "Play")}</ButtonText>
      </Button>
    </GameModeCard>
  );
}
