import { useState } from "react";
import { useDojo } from "../../dojo/useDojo";
import { Buy } from "../components/Buy";
import { faExpand, faCompress } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "@/components/ui/button";

export const Actions = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="absolute left-4 bottom-24 z-20">
      <div className="flex justify-center items-end gap-4">
        <div className="flex flex-col-reverse gap-4">
          <Button
            variant={"default"}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <FontAwesomeIcon icon={isExpanded ? faCompress : faExpand} />
          </Button>
          {isExpanded && <Button variant={"default"}>SCR</Button>}
          {isExpanded && <Button variant={"default"}>HME</Button>}
          {isExpanded && (
            <div className="z-20">
              <Buy />
            </div>
          )}
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
