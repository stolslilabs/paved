import { useEffect, useState } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";
import { getImage } from "../../utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye } from "@fortawesome/free-solid-svg-icons";

export const Tile = () => {
  const [rotation, setRotation] = useState(0);
  const [backgroundImage, setBackgroundImage] = useState(getImage(0));
  const { gameId, orientation } = useGameStore();

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

  const tileId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(builder ? builder.tile_id : 0),
  ]) as Entity;
  const tile = useComponentValue(Tile, tileId);

  useEffect(() => {
    if (tile) {
      const image = getImage(tile);
      setBackgroundImage(image);
    }
  }, [tile]);

  useEffect(() => {
    switch (orientation) {
      case 1:
        setRotation(0);
        break;
      case 2:
        setRotation(90);
        break;
      case 3:
        setRotation(180);
        break;
      case 4:
        setRotation(270);
        break;
      default:
        setRotation(0);
    }
  }, [orientation]);

  if (!account || !builder) return <></>;

  const handleClick = () => {
    play.draw({
      account: account,
      game_id: gameId,
    });
  };

  const className =
    "w-48 h-48 border-2 border-black bottom-0 right-0 absolute cursor-pointer bg-white";

  return tile ? (
    <div
      className={className}
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        transform: `rotate(${rotation}deg)`,
      }}
    />
  ) : (
    <div className={className} onClick={handleClick}>
      <FontAwesomeIcon icon={faEye} />
      Click to draw a tile
    </div>
  );
};
