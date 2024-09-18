import { useCameraStore } from "../../store";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import icon from "/assets/icons/compass.svg";
import { Button } from "../elements/button";

// TODO: Remove redundant component (move correct functionality to camera instead, custom hook called from NavigationMenu instead etc.)
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
    <Button
      className={`px-2 aspect-square size-10 xl:size-16 p-2 bg-[#D2E2F1] border-none bg-opacity-80 rounded-md pointer-events-auto flex items-center justify-center`}
      onClick={() => setRotate(true)}
    >
      <img src={icon} className="w-full h-full object-contain" style={style} />
    </Button>
  );
};
