import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";

import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useComponentValue } from "@dojoengine/react";
import { useMemo } from "react";
import { shortString } from "starknet";

export const CreateSoloGame = () => {
  const {
    account: { account },
    setup: {
      clientComponents: { Player },
      systemCalls: { create_game },
    },
  } = useDojo();

  const playerId = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerId);

  const handleClick = () => {
    console.log("Create solo game");
    create_game({
      account: account,
      name: shortString.encodeShortString("Solo"),
      duration: 0,
      mode: 1,
    });
  };

  return (
    <Button disabled={!player} variant={"secondary"} onClick={handleClick}>
      Single
    </Button>
  );
};
