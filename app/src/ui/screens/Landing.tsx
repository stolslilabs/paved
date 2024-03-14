import { Button } from "@/components/ui/button";
import { BorderLayout } from "../components/BorderLayout";
import { Connection } from "../components/Connection";
import { Spawn } from "../components/Spawn";
import { useNavigate } from "react-router-dom";
import banner from "/assets/banner.svg";
import BoxRainScene from "../modules/BoxRain";
import { useDojo } from "@/dojo/useDojo";
import { useAccount } from "@starknet-react/core";
import { useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useComponentValue } from "@dojoengine/react";

export const Landing = () => {
  const { isConnected } = useAccount();
  const {
    account: { account },
    setup: {
      clientComponents: { Player },
    },
  } = useDojo();

  const playerId = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerId);

  return (
    <BorderLayout>
      <div className="fixed h-full w-full z-0">
        <BoxRainScene />
      </div>
      <div className="self-center justify-center flex h-full bg-paved-brown">
        <div className="flex gap-4 self-center border-8 border-paved-pink p-10 flex-wrap justify-center bg-paved-pink z-10">
          <div className="">
            <img src={banner} alt="banner" className="w-96" />
          </div>
          <div className="w-full flex justify-center">
            <Connection />
          </div>

          <div className="flex">
            {isConnected && !player && <Spawn />}
            {isConnected && !!player && <Play />}
          </div>
        </div>
      </div>
    </BorderLayout>
  );
};

export const Play = () => {
  const navigate = useNavigate();

  const {
    account: { account },
    masterAccount,
    setup: {
      clientComponents: { Player },
    },
  } = useDojo();

  const playerId = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerId);

  const disabled = useMemo(() => {
    return !account || account === masterAccount || !player;
  }, [account, masterAccount]);

  const handleClick = () => {
    if (disabled) return;
    navigate("/game", { replace: true });
  };

  return (
    <Button disabled={disabled} variant={"secondary"} onClick={handleClick}>
      Play!
    </Button>
  );
};
