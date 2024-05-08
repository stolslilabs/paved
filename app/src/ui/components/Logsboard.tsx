import { Table, TableBody, TableCell, TableRow } from "@/ui/elements/table";
import { useLogs } from "@/hooks/useLogs";
import {
  faBurn,
  faChessRook,
  faCity,
  faHammer,
  faPlaceOfWorship,
  faRoad,
  faStar,
  faTree,
  faTreeCity,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const Logsboard = () => {
  const { logs } = useLogs();
  return (
    <div className="flex flex-col">
      <p className="text-right text-sm mt-4 mb-2 mr-2">Logs</p>
      <Table>
        <TableBody className="text-right text-xs">
          {logs
            .filter(
              (log) =>
                log.category.includes("Scored") || log.category === "Discarded",
            )
            .slice(0, 5)
            .map((log: any, index: number) => (
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
        <p style={{ color: log.color }}>{log.builder}</p>
      </TableCell>
      <TableCell>
        {log.category === "ScoredCity" && (
          <FontAwesomeIcon icon={faCity} className="text-red-500" />
        )}
        {log.category === "ScoredRoad" && (
          <FontAwesomeIcon icon={faRoad} className="text-yellow-600" />
        )}
        {log.category === "ScoredForestCity" && (
          <FontAwesomeIcon icon={faTreeCity} className="text-yellow-900" />
        )}
        {log.category === "ScoredForestRoad" && (
          <FontAwesomeIcon icon={faTree} className="text-green-500" />
        )}
        {log.category === "ScoredWonder" && (
          <FontAwesomeIcon icon={faPlaceOfWorship} className="text-blue-500" />
        )}
        {log.category === "Discarded" && (
          <FontAwesomeIcon icon={faBurn} className="text-orange-500" />
        )}
        {log.category === "Built" && (
          <FontAwesomeIcon icon={faHammer} className="text-slate-500" />
        )}
      </TableCell>
      <TableCell>{log.log}</TableCell>
    </TableRow>
  );
};
