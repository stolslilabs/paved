import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDojo } from "../../dojo/useDojo";
import { Buy } from "../components/Buy";
import {
  faExpand,
  faCompress,
  faHome,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "@/components/ui/button";

export const Actions = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const navigate = useNavigate();

  return (
    <div className="absolute left-4 bottom-6 z-30">
      <div className="flex justify-center items-end gap-4">
        <div className="flex flex-col-reverse gap-4">
          <Button
            variant={"default"}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <FontAwesomeIcon icon={isExpanded ? faCompress : faExpand} />
          </Button>
          {isExpanded && <Button variant={"default"}>SCR</Button>}
          {isExpanded && (
            <Button
              variant={"default"}
              onClick={() => navigate("", { replace: true })}
            >
              <FontAwesomeIcon icon={faHome} />
            </Button>
          )}

          {isExpanded && <Buy />}
        </div>
        {isExpanded && (
          <div className="flex gap-4">
            <Button variant={"default"}>VIW</Button>
            <Button variant={"default"}>JMP</Button>
            <Button variant={"default"}>HLP</Button>
          </div>
        )}
      </div>
    </div>
  );
};
