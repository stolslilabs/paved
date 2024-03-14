import { useCameraStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCompass } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect } from "react";

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
            <div
              className="relative w-full h-full flex flex-col justify-center items-center"
              style={style}
            >
              <p className="absolute top-1 left-1/2 -translate-x-1/2">N</p>
              <FontAwesomeIcon className="h-12 -rotate-45" icon={faCompass} />
            </div>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Rotate view</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
