import { Stack, Text } from "tamagui";
import { Button, ButtonText } from "../components/Button";

export interface LandingScreenProps {
  playerName?: string;
  onSpawn?: () => void;
  onPlay?: () => void;
  connected?: boolean;
}

export function LandingScreen({
  playerName,
  onSpawn,
  onPlay,
  connected = false,
}: LandingScreenProps) {
  return (
    <Stack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$background"
      gap="$6"
      padding="$6"
    >
      <Text fontSize="$9" fontWeight="700" fontFamily="$heading" color="$primary">
        PAVED
      </Text>
      <Text fontSize="$3" color="$muted" textAlign="center">
        A Carcassonne-style on-chain tile game
      </Text>
      {connected ? (
        playerName ? (
          <Button onPress={onPlay}>
            <ButtonText>Play as {playerName}</ButtonText>
          </Button>
        ) : (
          <Button onPress={onSpawn}>
            <ButtonText>Create Account</ButtonText>
          </Button>
        )
      ) : (
        <Text color="$muted">Connect your wallet to begin</Text>
      )}
    </Stack>
  );
}
