import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export const Log = ({ show }: { show: boolean }) => {
  const { logs } = useLogs();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          className={`${
            show ? "opacity-100" : "opacity-0 -mb-16"
          } transition-all duration-200`}
          variant={"default"}
          size={"icon"}
        >
          <FontAwesomeIcon icon={faBook} />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Game logs</SheetTitle>
          <SheetDescription>List of the game logs</SheetDescription>
        </SheetHeader>
        <ScrollArea className="grow">
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
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
