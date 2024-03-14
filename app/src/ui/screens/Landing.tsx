import { Button } from "@/components/ui/button";
import { BorderLayout } from "../components/BorderLayout";
import { Connection } from "../components/Connection";
import { Spawn } from "../components/Spawn";
import { useNavigate } from "react-router-dom";
import banner from "/assets/banner.svg";
import BoxRainScene from "../modules/BoxRain";
import { useDojo } from "@/dojo/useDojo";
import { useAccount } from "@starknet-react/core";

export const Landing = () => {
  const navigate = useNavigate();
  const { isConnected } = useAccount();

  const {
    account: { account },
    masterAccount,
  } = useDojo();

  return (
    <BorderLayout>
      <div className="fixed h-full w-full z-0">
        <BoxRainScene />
      </div>
      <div className="self-center justify-center flex h-full   bg-paved-brown">
        {" "}
        <div className="flex gap-4 self-center border-8 border-paved-pink p-10 flex-wrap  justify-center bg-paved-pink z-10">
          <div className="">
            <img src={banner} alt="banner" className="w-96" />
          </div>
          <div className="w-full flex justify-center">
            <Connection />
          </div>

          <div className="flex">
            <Spawn />

            {isConnected && account && account !== masterAccount && (
              <Button
                variant={"outline"}
                onClick={() => navigate("/game", { replace: true })}
              >
                Play!
              </Button>
            )}
          </div>
        </div>
      </div>
    </BorderLayout>
  );
};
