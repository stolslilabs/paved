import { useCameraStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBinoculars, faVideo } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";

export const ResetCamera = () => {
  const { setReset } = useCameraStore();
  return (
    <Button variant={"command"} size={"command"} onClick={() => setReset(true)}>
      <FontAwesomeIcon className="h-12" icon={faBinoculars} />
    </Button>
  );
};
