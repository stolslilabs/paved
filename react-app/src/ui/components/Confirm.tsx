import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquareCheck } from "@fortawesome/free-solid-svg-icons";

interface TProps {}

export const Confirm = (props: TProps) => {
  const { gameId, orientation, x, y, setX, setY, setOrientation } =
    useGameStore();

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
      play.build({
        account: account,
        game_id: gameId,
        tile_id: builder.tile_id,
        orientation: orientation,
        x: x,
        y: y,
      });

      // Reset the orientation and position
      setOrientation(1);
      setX(0);
      setY(0);
    }
  };

  return (
    <div
      className="z-20 row-span-1 col-span-1 border-2 flex justify-center items-center bg-white cursor-pointer"
      onClick={handleClick}
    >
      <FontAwesomeIcon icon={faSquareCheck} />
    </div>
  );
};
