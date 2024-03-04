import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useLogs } from "@/hooks/useLogs";
import { faHammer, faStar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const Logsboard = () => {
  const { logs } = useLogs();
  return (
    <div className="flex flex-col">
      <p className="text-right text-sm text-slate-500 mt-4 mb-2 mr-2">Logs</p>
      <Table>
        <TableBody className="text-right text-xs">
          {logs.filter((log) => log.category === "Scored").slice(0, 5).map((log: any, index: number) => (
            <LogRow key={index} log={log} index={logs.length - index} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export const LogRow = ({ log, index }: { log: any; index: number }) => {
  return (
    <TableRow>
      <TableCell>
        <p>{`#${index}`}</p>
      </TableCell>
      <TableCell>
        <p style={{ color: log.color }}>{log.builder}</p>
      </TableCell>
      <TableCell>
        {log.category === "Scored" ? (
          <FontAwesomeIcon icon={faStar} className="text-yellow-500" />
        ) : (
          <FontAwesomeIcon icon={faHammer} className="text-slate-500" />
        )}
      </TableCell>
      <TableCell>{log.log}</TableCell>
    </TableRow>
  );
};
