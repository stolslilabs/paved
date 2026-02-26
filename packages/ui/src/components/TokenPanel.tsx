import { Text, XStack, YStack } from "tamagui";
import { Card, CardDescription, CardTitle } from "./Card";
import { Button, ButtonText } from "./Button";
import { Badge, BadgeText } from "./Badge";

const Stack = YStack as any;
const Row = XStack as any;

export interface TokenPanelStateInput {
  supportsMint: boolean;
  isMinting: boolean;
  error: string | null;
}

export interface TokenPanelState {
  actionLabel: string;
  actionDisabled: boolean;
  statusTone: "idle" | "loading" | "error";
  statusText: string;
}

export function resolveTokenPanelState(input: TokenPanelStateInput): TokenPanelState {
  if (input.isMinting) {
    return {
      actionLabel: "Minting...",
      actionDisabled: true,
      statusTone: "loading",
      statusText: "Transaction pending",
    };
  }

  if (input.error) {
    return {
      actionLabel: "Mint Test Tokens",
      actionDisabled: false,
      statusTone: "error",
      statusText: input.error,
    };
  }

  if (!input.supportsMint) {
    return {
      actionLabel: "Mint Unavailable",
      actionDisabled: true,
      statusTone: "idle",
      statusText: "Mint disabled for this network",
    };
  }

  return {
    actionLabel: "Mint Test Tokens",
    actionDisabled: false,
    statusTone: "idle",
    statusText: "Ready",
  };
}

export interface TokenPanelProps {
  networkLabel: string;
  balanceLabel: string;
  supportsMint: boolean;
  isMinting?: boolean;
  error?: string | null;
  onMint?: () => void;
}

export function TokenPanel({
  networkLabel,
  balanceLabel,
  supportsMint,
  isMinting = false,
  error = null,
  onMint,
}: TokenPanelProps) {
  const state = resolveTokenPanelState({
    supportsMint,
    isMinting,
    error,
  });

  return (
    <Card>
      <Row justifyContent="space-between" alignItems="center" marginBottom="$2">
        <CardTitle>{"Token"}</CardTitle>
        <Badge variant="primary">
          <BadgeText>{networkLabel}</BadgeText>
        </Badge>
      </Row>

      <Stack gap="$2">
        <CardDescription>{"Balance"}</CardDescription>
        <Text fontFamily="$heading" fontSize="$7" color="$color">
          {balanceLabel}
        </Text>

        <Button
          onPress={onMint}
          disabled={state.actionDisabled}
          variant={state.statusTone === "error" ? "danger" : "primary"}
        >
          <ButtonText>{state.actionLabel}</ButtonText>
        </Button>

        <Text
          fontSize="$2"
          color={state.statusTone === "error" ? "$error" : "$muted"}
        >
          {state.statusText}
        </Text>
      </Stack>
    </Card>
  );
}
