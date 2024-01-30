import { useEffect, useState, useMemo } from "react";
import {
  getCharacterFromIndex,
  getColorFromCharacter,
  getIndexFromCharacter,
  getRole,
} from "../../utils";
import { useGameStore } from "../../store";

interface TProps {
  index: number;
  enable: boolean;
}

export const Character = (props: TProps) => {
  const { index, enable } = props;
  const [selected, setSelected] = useState(false);
  const { character, setCharacter } = useGameStore();

  useEffect(() => {
    setSelected(index === getIndexFromCharacter(character));
  }, [character]);

  const className = useMemo(() => {
    return `h-12 w-12 flex justify-center items-center border-2
    ${selected ? "bg-emerald-200" : "bg-white"}
    ${enable ? "cursor-pointer" : "cursor-not-allowed opacity-25"}`;
  }, [selected, enable]);

  const handleClick = () => {
    if (!enable) return;
    if (index === getIndexFromCharacter(character)) {
      setCharacter(getCharacterFromIndex(-1));
    } else {
      setCharacter(getCharacterFromIndex(index));
    }
  };

  const borderStyle = {
    borderColor: getColorFromCharacter(getCharacterFromIndex(index)),
  };

  return (
    <div className={className} style={borderStyle} onClick={handleClick}>
      {getRole(index).slice(0, 2)}
    </div>
  );
};
