import { useEffect, useState } from "react";
import { getSpotFromIndex, getIndexFromSpot } from "../../utils";
import { useGameStore } from "../../store";

interface TProps {
  index: number;
}

export const Spot = (props: TProps) => {
  const { index } = props;
  const [selected, setSelected] = useState(false);
  const { spot, setSpot } = useGameStore();

  useEffect(() => {
    setSelected(index === getIndexFromSpot(spot));
  }, [spot]);

  const handleClick = () => {
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
        className={`h-4 w-4 rounded-full ${
          selected ? "bg-slate-600" : "bg-white"
        }`}
      />
    </div>
  );
};
