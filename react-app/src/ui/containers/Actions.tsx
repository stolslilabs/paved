import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDojo } from "../../dojo/useDojo";
import { Buy } from "../components/Buy";
import { Leaderboard } from "../components/Leaderboard";
import { Claim } from "../components/Claim";
import { Log } from "../components/Log";
import {
  faExpand,
  faCompress,
  faHome,
  faTrophy,
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
            className={"z-10"}
            variant={"default"}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <FontAwesomeIcon
              className="h-6"
              icon={isExpanded ? faCompress : faExpand}
            />
          </Button>
          <Claim show={isExpanded} />
          <Leaderboard show={isExpanded} />

          <Button
            className={`${
              isExpanded ? "opacity-100" : "opacity-0 -mb-16"
            } transition-all duration-200`}
            variant={"default"}
            onClick={() => navigate("", { replace: true })}
          >
            <FontAwesomeIcon className="h-6" icon={faHome} />
          </Button>

          <Buy show={isExpanded} />
          <Log show={isExpanded} />
        </div>

        <div className="flex gap-4">
          <Button
            className={`${
              isExpanded ? "opacity-100" : "opacity-0 -ml-16"
            } transition-all duration-200`}
            variant={"default"}
          >
            VIW
          </Button>
          <Button
            className={`${
              isExpanded ? "opacity-100" : "opacity-0 -ml-16"
            } transition-all duration-200`}
            variant={"default"}
          >
            JMP
          </Button>
          <Button
            className={`${
              isExpanded ? "opacity-100" : "opacity-0 -ml-32"
            } transition-all duration-200`}
            variant={"default"}
          >
            HLP
          </Button>
        </div>
      </div>
    </div>
  );
};
