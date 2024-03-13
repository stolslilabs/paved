import { Button } from "@/components/ui/button";
import { BorderLayout } from "../components/BorderLayout";
import { Connection } from "../components/Connection";
import { Spawn } from "../components/Spawn";
import { useNavigate } from "react-router-dom";
import banner from "/assets/banner.svg";

export const Landing = () => {
  const navigate = useNavigate();

  return (
    <BorderLayout>
      <div className="self-center justify-center flex h-full">
        {" "}
        <div className="flex gap-4 self-center border-8 p-10 flex-wrap  justify-center">
          <div className="h-40 opacity-60">
            <img src={banner} alt="banner" className="w-96" />
          </div>
          <div className="w-full flex justify-center">
            <Connection />
          </div>

          <div className="flex">
            <Spawn />
            <Button onClick={() => navigate("/game", { replace: true })}>
              Start!
            </Button>
          </div>
        </div>
      </div>
    </BorderLayout>
  );
};
