import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook } from "@fortawesome/free-solid-svg-icons";
import { useLogs } from "@/hooks/useLogs";

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
      <SheetTrigger asChild>
        <Button variant={"default"}>
          <FontAwesomeIcon icon={faBook} />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Game logs</SheetTitle>
          <SheetDescription>List of the game logs</SheetDescription>
        </SheetHeader>
        {logs &&
          logs.map((log, index) => (
            <div key={index} className="flex justify-between">
              <p>
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
                {log.category === "Scored"
                  ? ` has scored ${log.log}`
                  : " has built a tile"}
              </p>
            </div>
          ))}
      </SheetContent>
    </Sheet>
  );
};
