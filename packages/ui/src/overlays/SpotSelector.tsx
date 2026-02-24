import { Text, XStack, YStack } from "tamagui";
const Stack = YStack as any;
const Row = XStack as any;
import {
  getValidSpotsForRole,
  Layout,
  Plan,
  Orientation,
  SpotType,
  categoryToChar,
} from "@paved/game-core";
import { Button } from "../components/Button";

export interface SpotSelectorProps {
  tilePlan: number;
  orientation: number;
  roleIndex: number;
  selectedSpot: number;
  onSelectSpot: (spot: number) => void;
  visible: boolean;
}

// 3x3 grid: each row is [spotContractNumber, spotContractNumber, spotContractNumber]
const GRID_ROWS = [
  [2, 3, 4], // NW, N, NE
  [9, 1, 5], // W,  C, E
  [8, 7, 6], // SW, S, SE
];

const SPOT_TYPES: Record<number, SpotType> = {
  1: SpotType.Center,
  2: SpotType.NorthWest,
  3: SpotType.North,
  4: SpotType.NorthEast,
  5: SpotType.East,
  6: SpotType.SouthEast,
  7: SpotType.South,
  8: SpotType.SouthWest,
  9: SpotType.West,
};

export function SpotSelector({
  tilePlan,
  orientation,
  roleIndex,
  selectedSpot,
  onSelectSpot,
  visible,
}: SpotSelectorProps) {
  if (!visible) return null;

  const validSpots =
    roleIndex >= 0
      ? getValidSpotsForRole(roleIndex, tilePlan, orientation)
      : [];
  const validSet = new Set(validSpots);

  // Get layout for category labels
  const plan = Plan.from(tilePlan);
  const layout = Layout.from(plan, Orientation.from(orientation).value);

  return (
    <Stack
      backgroundColor="$background"
      borderRadius="$3"
      borderWidth={1}
      borderColor="$borderColor"
      padding="$2"
      gap="$1"
    >
      {GRID_ROWS.map((row, rowIdx) => (
        <Row key={rowIdx} gap="$1">
          {row.map((spotNum) => {
            const spotType = SPOT_TYPES[spotNum];
            const category = layout.getCategory(spotType);
            const label = categoryToChar(category.value);
            const isValid = validSet.has(spotNum);
            const isSelected = spotNum === selectedSpot;

            return (
              <Button
                key={spotNum}
                size="sm"
                variant={isSelected ? "primary" : "ghost"}
                disabled={!isValid}
                onPress={() => isValid && onSelectSpot(spotNum)}
                opacity={isValid ? 1 : 0.3}
                width={40}
                height={40}
                borderWidth={isSelected ? 2 : 1}
                borderColor={isSelected ? "$primary" : "$borderColor"}
              >
                <Text
                  fontSize="$2"
                  fontWeight="700"
                  color={isValid ? "$color" : "$muted"}
                >
                  {label}
                </Text>
              </Button>
            );
          })}
        </Row>
      ))}
    </Stack>
  );
}
