import React, { useMemo } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useQueryParams } from "../../hooks/useQueryParams";
import { getOrder, getColorFromAddress } from "../../utils";

export const Order = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      clientComponents: { Builder },
    },
  } = useDojo();

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  const color = useMemo(() => {
    return getColorFromAddress(account.address);
  }, [account]);

  return (
    <div className={`flex justify-center items-center`} style={{ color }}>
      {getOrder(builder?.order)}
    </div>
  );
};
