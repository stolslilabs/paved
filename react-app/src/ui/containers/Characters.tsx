import { useState } from "react";
import { Character } from "../components/Character";
import { getAvailableCharacters } from "../../utils";
import { useMemo } from "react";
import { useComponentValue } from "@dojoengine/react";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useDojo } from "@/dojo/useDojo";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";

export const Characters = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      clientComponents: { Builder },
    },
  } = useDojo();

  const builderEntity = useMemo(() => {
    return getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(account.address),
    ]) as Entity;
  }, [gameId, account]);

  const builder = useComponentValue(Builder, builderEntity);

  const characters = useMemo(
    () => getAvailableCharacters(builder ? builder.characters : 0),
    [builder]
  );

  if (!account || !builder) return <></>;

  return (
    <footer className="z-20 flex justify-between items-center absolute bottom-6 left-1/2 transform -translate-x-1/2 max-width-1/2">
      <div className="flex flex-wrap-reverse justify-center items-center grow gap-8">
        {characters.map(({ status }, index) => (
          <Character key={index} index={index} enable={status} />
        ))}
      </div>
    </footer>
  );
};
