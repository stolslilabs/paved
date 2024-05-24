import { Button } from "@/ui/elements/button";
import { ScrollArea } from "@/ui/elements/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/ui/elements/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBurn,
  faCity,
  faHammer,
  faInfoCircle,
  faPlaceOfWorship,
  faRoad,
  faStar,
  faTree,
  faTreeCity,
} from "@fortawesome/free-solid-svg-icons";
import { useLogs } from "@/hooks/useLogs";
import Info from "@/ui/icons/INFO.svg?react";

export type LogType = {
  timestamp: number;
  log: string;
  regionFrom?: number;
  regionTo?: number;
};

export const Log = () => {
  const { logs } = useLogs();
  return (
    <Sheet>
      <SheetTrigger>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={"command"} size={"command"}>
                <Info className="sm:h-4 md:h-8 fill-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="select-none">Game logs</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Game logs</SheetTitle>
        </SheetHeader>
        <ScrollArea className="grow">
          {logs &&
            logs.map((log, index) => (
              <div key={index} className="flex justify-between">
                <div className="flex gap-2 text-xs">
                  <span className="text-slate-400">
                    {`[${log.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}]`}
                  </span>
                  <strong style={{ color: log.color }}>
                    {` ${log.builder}`}
                  </strong>

                  {log.category === "ScoredCity" && (
                    <div className="flex gap-1">
                      <FontAwesomeIcon
                        icon={faStar}
                        className="text-yellow-500"
                      />
                      <FontAwesomeIcon icon={faCity} className="text-red-500" />
                    </div>
                  )}

                  {log.category === "ScoredRoad" && (
                    <div className="flex gap-1">
                      <FontAwesomeIcon
                        icon={faStar}
                        className="text-yellow-500"
                      />
                      <FontAwesomeIcon
                        icon={faRoad}
                        className="text-yellow-600"
                      />
                    </div>
                  )}

                  {log.category === "ScoredForestCity" && (
                    <div className="flex gap-1">
                      <FontAwesomeIcon
                        icon={faStar}
                        className="text-yellow-500"
                      />
                      <FontAwesomeIcon
                        icon={faTreeCity}
                        className="text-yellow-900"
                      />
                    </div>
                  )}

                  {log.category === "ScoredForestRoad" && (
                    <div className="flex gap-1">
                      <FontAwesomeIcon
                        icon={faStar}
                        className="text-yellow-500"
                      />
                      <FontAwesomeIcon
                        icon={faTree}
                        className="text-green-500"
                      />
                    </div>
                  )}

                  {log.category === "ScoredWonder" && (
                    <div className="flex gap-1">
                      <FontAwesomeIcon
                        icon={faStar}
                        className="text-yellow-500"
                      />
                      <FontAwesomeIcon
                        icon={faPlaceOfWorship}
                        className="text-blue-500"
                      />
                    </div>
                  )}

                  {log.category === "Discarded" && (
                    <div className="flex gap-1">
                      <FontAwesomeIcon
                        icon={faStar}
                        className="text-yellow-500"
                      />
                      <FontAwesomeIcon
                        icon={faBurn}
                        className="text-orange-500"
                      />
                    </div>
                  )}

                  {log.category === "Built" && (
                    <FontAwesomeIcon
                      icon={faHammer}
                      className="text-slate-500"
                    />
                  )}
                  <p>{log.log}</p>
                </div>
              </div>
            ))}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
