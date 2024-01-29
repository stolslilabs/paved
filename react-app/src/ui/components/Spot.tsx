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
      className="h-6 w-6 bg-white flex justify-center items-center"
      onClick={handleClick}
    >
      {selected ? "X" : ""}
    </div>
  );
};
