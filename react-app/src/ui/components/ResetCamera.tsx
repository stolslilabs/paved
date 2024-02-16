import { useCameraStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVideo } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";

export const ResetCamera = () => {
  const { setReset } = useCameraStore();
  return (
    <Button variant={"default"} size={"icon"} onClick={() => setReset(true)}>
      <FontAwesomeIcon icon={faVideo} />
    </Button>
  );
};
