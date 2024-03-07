import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useQueryParams } from "../../hooks/useQueryParams";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSackDollar } from "@fortawesome/free-solid-svg-icons";

export const Claimed = () => {
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

  return (
    <div className=" flex justify-center items-center text-l gap-2">
      <FontAwesomeIcon icon={faSackDollar} />
      {builder ? Number(builder.claimed / BigInt(1e12)) / 1000000 : "NaN"}
    </div>
  );
};
