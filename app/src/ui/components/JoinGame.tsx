import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { useMemo } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";

export const JoinGame = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
    setup: {
      clientComponents: { Game, Builder },
      systemCalls: { join_game },
    },
  } = useDojo();

  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]),
    [gameId]
  );
  const game = useComponentValue(Game, gameKey);
  const builderKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]),
    [gameId, account]
  );
  const builder = useComponentValue(Builder, builderKey);

  const disabled = useMemo(
    () => !game || (!!builder && builder.index < game.player_count),
    [game, builder]
  );

  const over = useMemo(() => {
    if (game && game.mode === 1) {
      return game.tile_count >= 99;
    }
    if (game && game.mode === 2) {
      const endtime = game.start_time + game.duration;
      const now = Math.floor(Date.now() / 1000);
      return game.start_time !== 0 && game.duration !== 0 && now > endtime;
    }
    return true;
  }, [game]);

  const handleClick = async () => {
    if (!game) return;
    if (
      (!builder || builder.index >= game.player_count) &&
      game.start_time === 0 &&
      !over
    ) {
      await join_game({
        account: account,
        game_id: game.id,
      });
    }
  };

  if (!game) return null;

  return (
    <Button disabled={disabled} variant={"secondary"} onClick={handleClick}>
      Join
    </Button>
  );
};
