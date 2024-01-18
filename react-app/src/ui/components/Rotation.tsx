import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";

export const Rotation = () => {
  const { orientation, setOrientation } = useGameStore();

  const handleClick = () => {
    setOrientation(orientation + 1);
  };

  return (
    <div
      className="z-20 row-span-1 col-span-1 border-2 flex justify-center items-center bg-white cursor-pointer"
      onClick={handleClick}
    >
      <FontAwesomeIcon icon={faRotateRight} />
    </div>
  );
};
