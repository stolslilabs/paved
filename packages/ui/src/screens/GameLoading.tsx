import { Stack, Text } from "tamagui";

export function GameLoadingScreen() {
  return (
    <Stack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$background"
    >
      <Text
        fontSize="$7"
        fontWeight="700"
        fontFamily="$heading"
        color="$primary"
      >
        PAVED
      </Text>
      <Text fontSize="$2" color="$muted" marginTop="$4">
        Loading...
      </Text>
    </Stack>
  );
}
