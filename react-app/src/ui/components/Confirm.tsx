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
    setX,
    setY,
    setOrientation,
    setCharacter,
    setSpot,
    setSelectedTile,
    valid,
  } = useGameStore();

  const {
    account: { account },
    setup: {
      client: { play },
      clientComponents: { Builder, Tile },
    },
  } = useDojo();

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  if (!account || !builder) return <></>;

  const handleClick = () => {
    if (builder.tile_id) {
      try {
        play.build({
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
        setOrientation(1);
        setX(0);
        setY(0);
        setCharacter(0);
        setSpot(0);
        setSelectedTile({ col: 0, row: 0 });
      }
    }
  };

  return (
    <Button
      disabled={!valid}
      variant={"default"}
      size={"icon"}
      onClick={handleClick}
    >
      <FontAwesomeIcon icon={faSquareCheck} />
    </Button>
  );
};
