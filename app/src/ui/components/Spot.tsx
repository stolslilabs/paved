import { useEffect, useState } from "react";
import { getSpotFromIndex, getIndexFromSpot } from "@/dojo/game";
import { useGameStore } from "../../store";
import useSound from "use-sound";
import onCharacterPlace from "/sounds/effects/onCharacterPlace.wav";

interface TProps {
  index: number;
}

export const Spot = (props: TProps) => {
  const [play, { stop }] = useSound(onCharacterPlace);
  const { index } = props;
  const [selected, setSelected] = useState(false);
  const { spot, setSpot } = useGameStore();

  useEffect(() => {
    setSelected(index === getIndexFromSpot(spot));
  }, [spot]);

  const handleClick = () => {
    play();
    if (index === getIndexFromSpot(spot)) {
      setSpot(getSpotFromIndex(-1));
    } else {
      setSpot(getSpotFromIndex(index));
    }
  };

  return (
    <div
      className="h-full w-full flex justify-center items-center"
      onClick={handleClick}
    >
      <div
        className={`h-4 w-4 rounded-full ${selected ? "bg-slate-600" : "bg-white"
          }`}
      />
    </div>
  );
};
