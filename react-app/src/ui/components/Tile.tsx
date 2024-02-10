import { useEffect, useState, useMemo } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";
import { useQueryParams } from "../../hooks/useQueryParams";
import { getImage } from "../../utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye } from "@fortawesome/free-solid-svg-icons";
import { Spot } from "./Spot";

export const Tile = () => {
  const [rotation, setRotation] = useState(0);
  const [backgroundImage, setBackgroundImage] = useState(getImage(0));
  const { gameId } = useQueryParams();
  const { orientation, setSelectedTile, setActiveEntity } = useGameStore();

  const {
    account: { account },
    setup: {
      client: { play },
      clientComponents: { Builder, Tile },
    },
  } = useDojo();

  const builderEntity = useMemo(() => {
    return getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(account.address),
    ]) as Entity;
  }, [gameId, account]);
  const builder = useComponentValue(Builder, builderEntity);

  const tileEntity = useMemo(() => {
    return getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(builder ? builder.tile_id : 0),
    ]) as Entity;
  }, [gameId, builder]);
  const tile = useComponentValue(Tile, tileEntity);

  useEffect(() => {
    if (tile) {
      const image = getImage(tile);
      setBackgroundImage(image);
      setActiveEntity(tileEntity);
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

  const handleDrawClick = () => {
    setSelectedTile({ col: 0, row: 0 });
    play.draw({
      account: account,
      game_id: gameId,
    });
  };

  const spots = ["NW", "W", "SW", "N", "C", "S", "NE", "E", "SE"];

  return tile ? (
    <div className="w-48 h-48 border-2 border-black cursor-pointer bg-white bottom-0 right-0 absolute">
      <div
        className="w-full h-full absolute"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          transform: `rotate(${rotation}deg)`,
        }}
      />
      <div className="w-full h-full absolute grid grid-rows-3 grid-flow-col gap-2 justify-items-center items-center">
        {spots.map((_spot, index) => (
          <Spot key={index} index={index} />
        ))}
      </div>
    </div>
  ) : (
    <div
      className="w-48 h-48 border-2 border-black bottom-0 right-0 absolute cursor-pointer flex justify-center hover:bg-white/30"
      onClick={handleDrawClick}
    >
      <FontAwesomeIcon className="self-center h-12" icon={faEye} />
    </div>
  );
};
