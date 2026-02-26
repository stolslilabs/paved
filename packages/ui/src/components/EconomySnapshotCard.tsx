import { Text, XStack, YStack } from "tamagui";
import { Card, CardDescription, CardTitle } from "./Card";

const Stack = YStack as any;
const Row = XStack as any;

export interface EconomySnapshotStateInput {
  isLoading: boolean;
  error: string | null;
  multiplierLabel?: string;
}

export interface EconomySnapshotState {
  tone: "loading" | "error" | "ready";
  message: string;
}

export function resolveEconomySnapshotState(input: EconomySnapshotStateInput): EconomySnapshotState {
  if (input.isLoading) {
    return {
      tone: "loading",
      message: "Loading economy snapshot",
    };
  }

  if (input.error) {
    return {
      tone: "error",
      message: input.error,
    };
  }

  return {
    tone: "ready",
    message: `Multiplier ${input.multiplierLabel ?? "0x"}`,
  };
}

export interface EconomySnapshotCardProps {
  supplyLabel: string;
  targetLabel: string;
  multiplierLabel: string;
  warning?: string | null;
  isLoading?: boolean;
  error?: string | null;
}

export function EconomySnapshotCard({
  supplyLabel,
  targetLabel,
  multiplierLabel,
  warning = null,
  isLoading = false,
  error = null,
}: EconomySnapshotCardProps) {
  const status = resolveEconomySnapshotState({
    isLoading,
    error,
    multiplierLabel,
  });

  return (
    <Card>
      <CardTitle>{"Economy Snapshot"}</CardTitle>

      <Stack gap="$2">
        <Row justifyContent="space-between">
          <CardDescription>{"Supply"}</CardDescription>
          <Text color="$color">{supplyLabel}</Text>
        </Row>
        <Row justifyContent="space-between">
          <CardDescription>{"Target"}</CardDescription>
          <Text color="$color">{targetLabel}</Text>
        </Row>
        <Row justifyContent="space-between">
          <CardDescription>{"Multiplier"}</CardDescription>
          <Text color="$color">{multiplierLabel}</Text>
        </Row>

        <Text
          fontSize="$2"
          color={status.tone === "error" ? "$error" : "$muted"}
        >
          {status.message}
        </Text>
        {warning ? (
          <Text fontSize="$2" color="$warning">
            {warning}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
