import { Tile } from "../components/Tile";
import { Rotation } from "../components/Rotation";
import { Discard } from "../components/Discard";
import { Confirm } from "../components/Confirm";
import { Button } from "@/components/ui/button";
import { Count } from "../components/Count";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

export const Hand = () => {
  return (
    <div className="absolute right-6 bottom-6 z-30 w-64 h-64">
      <div className="flex top-3 right-0 absolute justify-between space-x-1">
      <Button variant={"default"} size={"icon"}>
          <FontAwesomeIcon icon={faXmark} />
        </Button>
        <Confirm />
        <Discard />
        <Rotation />
      </div>

      <Count />
      <Tile />
    </div>
  );
};
