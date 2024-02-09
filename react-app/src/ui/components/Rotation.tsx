import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";

export const Rotation = () => {
  const { orientation, setOrientation } = useGameStore();

  const handleClick = () => {
    setOrientation(orientation + 1);
  };

  return (
    <Button variant={"default"} size={"icon"} onClick={handleClick}>
      <FontAwesomeIcon icon={faRotateRight} />
    </Button>
  );
};
