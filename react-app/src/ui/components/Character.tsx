import { useEffect, useState } from 'react';
import { getCharacterFromIndex, getIndexFromCharacter, getRole } from '../../utils';
import { useGameStore } from '../../store';

interface TProps {
  index: number;
}

export const Character = (props: TProps) => {
  const { index } = props;
  const [selected, setSelected] = useState(false);
  const { character, setCharacter } = useGameStore();

  useEffect(() => {
    setSelected(index === getIndexFromCharacter(character));
  }, [character]);

  const handleClick = () => {
    if (index === getIndexFromCharacter(character)) {
      setCharacter(getCharacterFromIndex(-1));
    } else {
      setCharacter(getCharacterFromIndex(index));
    }
  }

  const className = `h-12 w-12 flex justify-center items-center border-2 ${selected ? 'bg-emerald-200' : 'bg-white'}`;

  return (
    <div className={className} onClick={handleClick}>
      {getRole(index).slice(0, 2)}
    </div>
  );
};
