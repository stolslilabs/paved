import { useMemo, useState, useEffect } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSackDollar } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { useQueryParams } from "@/hooks/useQueryParams";

export const Claim = () => {
  const { gameId } = useQueryParams();
  const [enable, setEnable] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const {
    account: { account },
    setup: {
      client: { play },
      clientComponents: { Game, Builder },
    },
  } = useDojo();

  const gameEntity = getEntityIdFromKeys([BigInt(gameId)]) as Entity;
  const game = useComponentValue(Game, gameEntity);

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  const handleClick = () => {
    play.claim({
      account: account,
      game_id: gameId,
    });
  };
  useEffect(() => {
    if (builder) {
      console.log(builder.claimed, builder.claimed > 0n);
      setClaimed(builder.claimed > 0n);
    }
  }, [builder]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now()) / 1000;
      setEnable(
        game?.over ||
          (game?.tiles_cap !== 0 && game?.tile_count >= game?.tiles_cap) ||
          (game?.endtime !== 0 && now >= game?.endtime)
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [game]);

  const className = useMemo(() => {
    return `${
      enable && !claimed ? "cursor-pointer" : "cursor-not-allowed opacity-25"
    }`;
  }, [game, enable, claimed]);

  if (!account || !game || !builder) return <></>;

  return (
    <Button className={className} variant={"default"} onClick={handleClick}>
      <FontAwesomeIcon icon={faSackDollar} />
    </Button>
  );
};
