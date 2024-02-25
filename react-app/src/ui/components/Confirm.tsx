import { useMemo } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquareCheck } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { useQueryParams } from "@/hooks/useQueryParams";

export const Confirm = () => {
  const { gameId } = useQueryParams();
  const {
    orientation,
    x,
    y,
    character,
    spot,
    selectedTile,
    resetX,
    resetY,
    resetOrientation,
    resetCharacter,
    resetSpot,
    resetSelectedTile,
    resetHoveredTile,
    valid,
  } = useGameStore();

  const {
    account: { account },
    setup: {
      clientComponents: { Builder },
      systemCalls: { build },
    },
  } = useDojo();

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  const disabled = useMemo(() => {
    const selected = selectedTile.row !== 0 && selectedTile.col !== 0;
    return !selected || !valid || !builder?.tile_id;
  }, [valid, builder, selectedTile]);

  const handleClick = () => {
    if (builder?.tile_id) {
      try {
        build({
          account: account,
          game_id: gameId,
          tile_id: builder.tile_id,
          orientation: orientation,
          x: x,
          y: y,
          role: character,
          spot: spot,
        });
      } catch (e) {
        console.log(e);
      } finally {
        // Reset the settings
        resetOrientation();
        resetX();
        resetY();
        resetCharacter();
        resetSpot();
        resetSelectedTile();
        resetHoveredTile();
      }
    }
  };

  return (
    <Button
      disabled={disabled}
      variant={"default"}
      size={"icon"}
      onClick={handleClick}
    >
      <FontAwesomeIcon icon={faSquareCheck} />
    </Button>
  );
};
