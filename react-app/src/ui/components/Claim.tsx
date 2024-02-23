import { useMemo, useState, useEffect } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSackDollar } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { useQueryParams } from "@/hooks/useQueryParams";

export const Claim = ({ show }: { show: boolean }) => {
  const { gameId } = useQueryParams();
  const [enable, setEnable] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const {
    account: { account },
    setup: {
      clientComponents: { Game, Builder },
      systemCalls: { claim },
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
    claim({
      account: account,
      game_id: gameId,
    });
  };
  useEffect(() => {
    if (builder) {
      setClaimed(builder.claimed > 0n);
    }
  }, [builder]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now()) / 1000;
      setEnable(
        (!claimed && game?.over) ||
          (game?.tiles_cap !== 0 && game?.tile_count >= game?.tiles_cap) ||
          (game?.duration !== 0 && now >= game?.start_time + game?.duration)
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [game, claimed]);

  if (!account || !game || !builder) return <></>;

  return (
    <Button
      disabled={show && !enable}
      className={`${
        show ? "opacity-100" : "opacity-0 -mb-16"
      } transition-all duration-200`}
      variant={"default"}
      size={"icon"}
      onClick={handleClick}
    >
      <FontAwesomeIcon icon={faSackDollar} />
    </Button>
  );
};
