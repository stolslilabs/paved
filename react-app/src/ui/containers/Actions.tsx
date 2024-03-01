import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Buy } from "../components/Buy";
import { Leaderboard } from "../components/Leaderboard";
import { Claim } from "../components/Claim";
import { Log } from "../components/Log";
import { ResetCamera } from "../components/ResetCamera";
import { faHome, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "@/components/ui/button";

export const Actions = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const navigate = useNavigate();

  return (
    <div className="absolute left-4 bottom-6 z-30">
      <div className="relative">
        <Button
          className={"z-10"}
          variant={"command"}
          size={"command"}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <FontAwesomeIcon
            className="h-12"
            style={{ transform: `rotate(${isExpanded ? 180 : 0}deg)` }}
            icon={faUpRightFromSquare}
          />
        </Button>
        <div
          className={`absolute left-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 top-[-120%]" : "opacity-0 top-[100%]"
          }`}
        >
          <Buy />
        </div>
        <div
          className={`absolute left-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 top-[-240%]" : "opacity-0 top-[100%]"
          }`}
        >
          <Button
            variant={"command"}
            size={"command"}
            onClick={() => navigate("", { replace: true })}
          >
            <FontAwesomeIcon className="h-12" icon={faHome} />
          </Button>
        </div>
        <div
          className={`absolute left-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 top-[-360%]" : "opacity-0 top-[100%]"
          }`}
        >
          <Leaderboard />
        </div>
        <div
          className={`absolute bottom-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 right-[-120%]" : "opacity-0 right-[100%]"
          }`}
        >
          <ResetCamera />
        </div>
        <div
          className={`absolute bottom-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 right-[-240%]" : "opacity-0 right-[100%]"
          }`}
        >
          <Claim />
        </div>
        <div
          className={`absolute bottom-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 right-[-360%]" : "opacity-0 right-[100%]"
          }`}
        >
          <Log />
        </div>
      </div>
    </div>
  );
};
