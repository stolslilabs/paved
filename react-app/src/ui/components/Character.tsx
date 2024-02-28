import { useEffect, useState, useMemo } from "react";
import {
  getCharacterImage,
  getCharacterFromIndex,
  getIndexFromCharacter,
  getRole,
} from "../../utils";
import { useGameStore } from "../../store";
import { Button } from "@/components/ui/button";

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

  const image = useMemo(() => {
    return getCharacterImage(index + 1);
  }, [index]);

  const className = useMemo(() => {
    return `flex justify-center items-center border-2 rounded-xl
    ${enable ? "cursor-pointer" : "cursor-not-allowed opacity-25"}`;
  }, [selected, enable]);

  const backgroundColor = useMemo(() => {
    return selected ? "#688080" : "#BFD1D5";
  }, [selected]);

  const borderColor = useMemo(() => "#746064", []);

  const handleClick = () => {
    if (!enable) return;
    if (index === getIndexFromCharacter(character)) {
      setCharacter(getCharacterFromIndex(-1));
    } else {
      setCharacter(getCharacterFromIndex(index));
    }
  };

  return (
    <Button
      className={className}
      variant={"secondary"}
      size={"character"}
      style={{ backgroundColor, borderColor }}
      onClick={handleClick}
    >
      <img
        draggable={false}
        className="h-16"
        src={image}
        alt={getRole(index)}
      />
    </Button>
  );
};
