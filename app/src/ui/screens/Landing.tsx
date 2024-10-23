import { Button } from "@/ui/elements/button";
import { Connection } from "../components/Connection";
import { Spawn } from "../actions/Spawn";
import { useNavigate } from "react-router-dom";
import banner from "/assets/banner.svg";
import BoxRainScene from "../modules/BoxRain";
import { useDojo } from "@/dojo/useDojo";
import { useAccount } from "@starknet-react/core";
import { memo, useMemo, useState } from "react";
import { usePlayer } from "@/hooks/usePlayer";
import { ComponentValue } from "@dojoengine/recs";
import { MusicPlayer } from "../components/MusicPlayer";

export const Landing = memo(() => {
  const { isConnected } = useAccount();
  const {
    account: { account },
  } = useDojo();

  const { player } = usePlayer({ playerId: account?.address });

  const [loading, setLoading] = useState(false);
  return (
    <div className="h-dscreen w-screen">
      <div className="fixed h-full w-full z-0">
        <BoxRainScene />
      </div>
      <div className="self-center justify-center flex h-full bg-blue-100">
        <div className="absolute top-4 right-4">
          <MusicPlayer />
        </div>
        <div className="flex gap-4 self-center  p-10 flex-wrap justify-center bg-paved-pink z-10">
          <div className="">
            <img src={banner} alt="banner" className="w-96" />
          </div>
          <div className="w-full flex justify-center">
            <Connection />
          </div>

          {(isConnected || !!account) && (
            <div className="flex">
              {!player ? (
                <Spawn setLoading={setLoading} loading={loading} />
              ) : (
                <Play player={player} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export const Play = ({ player }: { player: ComponentValue }) => {
  const navigate = useNavigate();

  const {
    account: { account },
  } = useDojo();

  const disabled = useMemo(() => {
    return !account || !player;
  }, [account, player]);

  const handleClick = () => {
    if (disabled) return;
    navigate("/", { replace: true });
  };

  return (
    <Button disabled={disabled} variant={"secondary"} onClick={handleClick}>
      {disabled ? "Loading..." : "Play"}
    </Button>
  );
};
