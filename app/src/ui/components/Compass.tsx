import { useCameraStore } from "../../store";
import { Button } from "@/ui/elements/button";
import { useMemo, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useEffect } from "react";
import icon from "/assets/icons/COMPASS.svg";

export const Compass = () => {
  const { compassRotation, setCompassRotate } = useCameraStore();
  const [rotation, setRotation] = useState(0);
  const [rotate, setRotate] = useState(false);

  useEffect(() => {
    if (!rotate) return;
    const rad = (compassRotation + Math.PI / 4) % (Math.PI * 2);
    setCompassRotate(rad);
    setRotate(false);
  }, [rotate]);

  useEffect(() => {
    const deg = -Math.floor((compassRotation * 180) / Math.PI);
    setRotation(deg);
  }, [compassRotation]);

  const style = useMemo(() => {
    return {
      transform: `rotate(${rotation}deg)`,
    };
  }, [rotation]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={"command"}
            size={"command"}
            onClick={() => setRotate(true)}
          >
            <img
              src={icon}
              style={style}
              className="h-8 sm:h-4 md:h-8 fill-current"
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Rotate view</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
