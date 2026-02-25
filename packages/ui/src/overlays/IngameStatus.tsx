import { Text, YStack } from "tamagui";
const Stack = YStack as any;

export interface IngameStatusProps {
  score: number;
  built: number;
  totalTiles: number;
  discarded: number;
}

export function IngameStatus({
  score,
  built,
  totalTiles,
  discarded,
}: IngameStatusProps) {
  return (
    <Stack
      gap="$2"
      padding="$3"
      backgroundColor="rgba(0,0,0,0.75)"
      borderRadius="$3"
      borderWidth={1}
      borderColor="$borderColor"
    >
      <Text color="$muted" fontSize="$1">Score</Text>
      <Text fontSize="$7" fontWeight="700" fontFamily="$heading" color="$primary">
        {score.toLocaleString()}
      </Text>
      <Stack flexDirection="row" gap="$4">
        <Stack flexDirection="row" alignItems="center" gap="$1">
          <Text color="$muted" fontSize="$1">Built</Text>
          <Text color="$color" fontSize="$2" fontWeight="700">
            {`${built}/${totalTiles}`}
          </Text>
        </Stack>
        <Stack flexDirection="row" alignItems="center" gap="$1">
          <Text color="$muted" fontSize="$1">Discarded</Text>
          <Text color="$error" fontSize="$2" fontWeight="700">
            {discarded}
          </Text>
        </Stack>
      </Stack>
    </Stack>
  );
}
