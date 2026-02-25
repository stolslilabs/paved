import { Text, XStack, YStack } from "tamagui";
const Stack = YStack as any;
const Row = XStack as any;
import { Button, ButtonText } from "../components/Button";
import { GameModeCardView } from "../components/GameModeCard";
import { GameListItemView } from "../components/GameListItem";
import { LeaderboardTableView } from "../components/LeaderboardTable";
import type { GameModeCardProps } from "../components/GameModeCard";
import type { GameListItemProps } from "../components/GameListItem";

export interface LandingScreenProps {
  connected?: boolean;
  playerName?: string;
  onSpawn?: () => void;
  onPlay?: () => void;
  gameModes?: GameModeCardProps[];
  activeGames?: GameListItemProps[];
  completedGames?: GameListItemProps[];
  leaderboard?: { rank: number; name: string; score: number }[];
  isLoading?: boolean;
  onModeSelect?: (mode: string) => void;
}

export function LandingScreen({
  connected = false,
  playerName,
  onSpawn,
  onPlay,
  gameModes = [],
  activeGames = [],
  completedGames = [],
  leaderboard = [],
  isLoading = false,
  onModeSelect,
}: LandingScreenProps) {
  const hasPlayer = connected && !!playerName;
  const hasGames = activeGames.length > 0 || completedGames.length > 0;

  return (
    <Stack flex={1} backgroundColor="$background" overflow="auto">
      <Stack
        maxWidth={960}
        width="100%"
        alignSelf="center"
        padding="$6"
        gap="$8"
      >
        {/* Header */}
        <Stack alignItems="center" gap="$3">
          <Text
            fontSize="$9"
            fontWeight="700"
            fontFamily="$heading"
            color="$primary"
          >
            {"PAVED"}
          </Text>
          <Text fontSize="$3" color="$muted" textAlign="center">
            {"A Carcassonne-style on-chain tile game"}
          </Text>
          {connected ? (
            playerName ? (
              <Text fontSize="$3" color="$color">
                {`Welcome, ${playerName}`}
              </Text>
            ) : (
              <Button onPress={onSpawn}>
                <ButtonText>{"Create Account"}</ButtonText>
              </Button>
            )
          ) : (
            <Text color="$muted">{"Connect your wallet to begin"}</Text>
          )}
        </Stack>

        {/* Game Modes */}
        {hasPlayer && gameModes.length > 0 ? (
          <Stack gap="$4">
            <Text
              fontSize="$6"
              fontWeight="700"
              fontFamily="$heading"
              color="$color"
            >
              {"Game Modes"}
            </Text>
            <Row gap="$4" flexWrap="wrap">
              {gameModes.map((mode) => (
                <GameModeCardView key={mode.mode} {...mode} />
              ))}
            </Row>
          </Stack>
        ) : null}

        {/* Your Games */}
        {hasPlayer ? (
          <Stack gap="$4">
            <Text
              fontSize="$6"
              fontWeight="700"
              fontFamily="$heading"
              color="$color"
            >
              {"Your Games"}
            </Text>
            {activeGames.length > 0 ? (
              <Stack gap="$2">
                {activeGames.map((g) => (
                  <GameListItemView key={g.gameId} {...g} />
                ))}
              </Stack>
            ) : null}
            {completedGames.length > 0 ? (
              <Stack gap="$2">
                <Text fontSize="$3" color="$muted">
                  {"Completed"}
                </Text>
                {completedGames.map((g) => (
                  <GameListItemView key={g.gameId} {...g} />
                ))}
              </Stack>
            ) : null}
            {!hasGames ? (
              <Text color="$muted">{"No games yet"}</Text>
            ) : null}
          </Stack>
        ) : null}

        {/* Leaderboard */}
        {hasPlayer ? (
          <Stack gap="$4">
            <Text
              fontSize="$6"
              fontWeight="700"
              fontFamily="$heading"
              color="$color"
            >
              {"Leaderboard"}
            </Text>
            <LeaderboardTableView
              players={leaderboard}
              isLoading={isLoading}
            />
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}
