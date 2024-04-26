import { useState } from "react";
import { LeaderboardDialog } from "../components/Leaderboard";
import { Surrender } from "../components/Surrender";
import { Log } from "../components/Log";
import { Compass } from "../components/Compass";
import { ResetCamera } from "../components/ResetCamera";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Home } from "../components/Home";

export const Actions = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="absolute left-2 bottom-2 md:left-4 md:bottom-6 z-30">
      <div className="relative">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className={"z-10"}
                variant={"command"}
                size={"command"}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <FontAwesomeIcon
                  className="sm:h-4 md:h-12"
                  style={{ transform: `rotate(${isExpanded ? 180 : 0}deg)` }}
                  icon={faUpRightFromSquare}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="select-none">
                {isExpanded ? "Collapse" : "Expand"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div
          className={`absolute left-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 top-[-120%]" : "opacity-0 top-[100%]"
          }`}
        >
          <Home />
        </div>
        <div
          className={`absolute left-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 top-[-240%]" : "opacity-0 top-[100%]"
          }`}
        >
          <LeaderboardDialog />
        </div>
        <div
          className={`absolute left-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 top-[-360%]" : "opacity-0 top-[100%]"
          }`}
        >
          <Surrender />
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
          <Compass />
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
