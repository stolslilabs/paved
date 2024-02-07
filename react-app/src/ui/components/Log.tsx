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
              <p>{log.log}</p>
              <p>{log.timestamp}</p>
            </div>
          ))}
      </SheetContent>
    </Sheet>
  );
};
