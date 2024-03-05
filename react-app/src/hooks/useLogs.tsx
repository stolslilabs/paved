import { useDojo } from "@/dojo/useDojo";
import { Event } from "@/dojo/createCustomEvents";
import {
  parseBuiltEvent,
  createBuiltLog,
  parseScoredEvent,
  createScoredLog,
  createDiscardedLog,
  parseDiscardedEvent,
} from "@/utils/events";
import { useEffect, useRef, useState } from "react";
import { Subscription } from "rxjs";
import { useQueryParams } from "@/hooks/useQueryParams";
import { BUILT_EVENT, SCORED_EVENT, DISCARDED_EVENT } from "@/constants/events";

export type BuiltLog = {
  id: string;
  gameId: number;
  tileId: number;
  tileX: number;
  tileY: number;
  playerId: string;
  playerName: string;
  playerColor: string;
  timestamp: Date;
};

export type ScoredLog = {
  id: string;
  gameId: number;
  tileId: number;
  tileX: number;
  tileY: number;
  playerId: string;
  playerName: string;
  playerColor: string;
  orderId: number;
  score: number;
  timestamp: Date;
};

export type DiscardedLog = {
  id: string;
  gameId: number;
  tileId: number;
  playerId: string;
  playerName: string;
  playerColor: string;
  orderId: number;
  score: number;
  timestamp: Date;
};

export type Log = {
  id: string;
  timestamp: Date;
  category: string;
  builder: string;
  color: string;
  log: string;
};

const generateLogFromEvent = (event: Event): Log => {
  if (event.keys[0] === BUILT_EVENT) {
    return createBuiltLog(parseBuiltEvent(event));
  } else if (event.keys[0] === SCORED_EVENT) {
    return createScoredLog(parseScoredEvent(event));
  } else if (event.keys[0] === DISCARDED_EVENT) {
    return createDiscardedLog(parseDiscardedEvent(event));
  }
  throw new Error("Unknown event type");
};

export const useLogs = () => {
  const { gameId } = useQueryParams();
  const [logs, setLogs] = useState<Log[]>([]);
  const subscribedRef = useRef(false);

  const {
    setup: {
      contractEvents: { createEvents, queryEvents },
    },
  } = useDojo();

  useEffect(() => {
    // Query all existing logs from the db
    const query = async () => {
      let gameIdString = `0x${gameId.toString(16)}`;
      const builtEvents = await queryEvents([BUILT_EVENT, gameIdString]);
      const scoredEvents = await queryEvents([SCORED_EVENT, gameIdString]);
      const discardedEvents = await queryEvents([
        DISCARDED_EVENT,
        gameIdString,
      ]);
      setLogs((prevLogs) => [
        ...prevLogs,
        ...builtEvents.map(generateLogFromEvent),
        ...scoredEvents.map(generateLogFromEvent),
        ...discardedEvents.map(generateLogFromEvent),
      ]);
    };

    query();

    // Check if already subscribed to prevent duplication due to HMR
    if (!subscribedRef.current) {
      const subscriptions: Subscription[] = [];

      const subscribeToEvents = async () => {
        let gameIdString = `0x${gameId.toString(16)}`;
        const builtObservable = await createEvents([BUILT_EVENT, gameIdString]);
        subscriptions.push(
          builtObservable.subscribe(
            (event) =>
              event &&
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)])
          )
        );
        const scoredObservable = await createEvents([
          SCORED_EVENT,
          gameIdString,
        ]);
        subscriptions.push(
          scoredObservable.subscribe(
            (event) =>
              event &&
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)])
          )
        );
        const discardedObservable = await createEvents([
          DISCARDED_EVENT,
          gameIdString,
        ]);
        subscriptions.push(
          discardedObservable.subscribe(
            (event) =>
              event &&
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)])
          )
        );
        subscribedRef.current = true; // Mark as subscribed
      };

      subscribeToEvents();

      // Cleanup function to unsubscribe
      return () => {
        subscriptions.forEach((sub) => sub.unsubscribe());
        subscribedRef.current = false;
      };
    }
  }, []); // Empty dependency array ensures this effect runs only once on mount

  // Remove duplicates
  const dedupedLogs = logs.filter(
    (log, idx) => idx === logs.findIndex((l) => l.id === log.id)
  );
  const sortedLogs = dedupedLogs.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
  return { logs: sortedLogs };
};
