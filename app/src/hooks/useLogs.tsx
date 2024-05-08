import { useDojo } from "@/dojo/useDojo";
import { Event } from "@/dojo/events";
import {
  parseBuiltEvent,
  createBuiltLog,
  parseScoredEvent,
  createScoredCityLog,
  createScoredRoadLog,
  parseScoredForestEvent,
  createScoredForestLog,
  parseScoredWonderEvent,
  createScoredWonderLog,
  createDiscardedLog,
  parseDiscardedEvent,
} from "@/dojo/game/events";
import { useEffect, useRef, useState } from "react";
import { Subscription } from "rxjs";
import { useQueryParams } from "@/hooks/useQueryParams";
import { WorldEvents } from "@/dojo/generated/contractEvents";

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
  points: number;
  size: number;
  cities: number;
  roads: number;
  playerId: string;
  playerName: string;
  playerColor: string;
  playerMaster: string;
  orderId: number;
  timestamp: Date;
};

export type DiscardedLog = {
  id: string;
  gameId: number;
  tileId: number;
  playerId: string;
  playerName: string;
  playerColor: string;
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
  switch (event.keys[0]) {
    case WorldEvents.Built: {
      return createBuiltLog(parseBuiltEvent(event));
    }
    case WorldEvents.ScoredCity: {
      return createScoredCityLog(parseScoredEvent(event));
    }
    case WorldEvents.ScoredRoad: {
      return createScoredRoadLog(parseScoredEvent(event));
    }
    case WorldEvents.ScoredForest: {
      return createScoredForestLog(parseScoredForestEvent(event));
    }
    case WorldEvents.ScoredWonder: {
      return createScoredWonderLog(parseScoredWonderEvent(event));
    }
    case WorldEvents.Discarded: {
      return createDiscardedLog(parseDiscardedEvent(event));
    }
    default: {
      throw new Error("Unknown event type");
    }
  }
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
      const gameIdString = `0x${gameId.toString(16)}`;
      const builtEvents = await queryEvents([WorldEvents.Built, gameIdString]);
      const scoredCityEvents = await queryEvents([
        WorldEvents.ScoredCity,
        gameIdString,
      ]);
      const scoredRoadEvents = await queryEvents([
        WorldEvents.ScoredRoad,
        gameIdString,
      ]);
      const scoredForestEvents = await queryEvents([
        WorldEvents.ScoredForest,
        gameIdString,
      ]);
      const scoredWonderEvents = await queryEvents([
        WorldEvents.ScoredWonder,
        gameIdString,
      ]);
      const discardedEvents = await queryEvents([
        WorldEvents.Discarded,
        gameIdString,
      ]);
      setLogs((prevLogs) => [
        ...prevLogs,
        ...builtEvents.map(generateLogFromEvent),
        ...scoredCityEvents.map(generateLogFromEvent),
        ...scoredRoadEvents.map(generateLogFromEvent),
        ...scoredForestEvents.map(generateLogFromEvent),
        ...scoredWonderEvents.map(generateLogFromEvent),
        ...discardedEvents.map(generateLogFromEvent),
      ]);
    };

    query();

    // Check if already subscribed to prevent duplication due to HMR
    if (!subscribedRef.current) {
      console.log("Subscribing to logs");
      subscribedRef.current = true; // Mark as subscribed
      const subscriptions: Subscription[] = [];

      const subscribeToEvents = async () => {
        const gameIdString = `0x${gameId.toString(16)}`;
        const builtObservable = await createEvents([
          WorldEvents.Built,
          gameIdString,
        ]);
        subscriptions.push(
          builtObservable.subscribe(
            (event) =>
              event &&
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)]),
          ),
        );
        const scoredCityObservable = await createEvents([
          WorldEvents.ScoredCity,
          gameIdString,
        ]);
        subscriptions.push(
          scoredCityObservable.subscribe(
            (event) =>
              event &&
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)]),
          ),
        );

        const scoredRoadObservable = await createEvents([
          WorldEvents.ScoredRoad,
          gameIdString,
        ]);
        subscriptions.push(
          scoredRoadObservable.subscribe(
            (event) =>
              event &&
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)]),
          ),
        );

        const scoredForestObservable = await createEvents([
          WorldEvents.ScoredForest,
          gameIdString,
        ]);
        subscriptions.push(
          scoredForestObservable.subscribe(
            (event) =>
              event &&
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)]),
          ),
        );

        const scoredWonderObservable = await createEvents([
          WorldEvents.ScoredWonder,
          gameIdString,
        ]);
        subscriptions.push(
          scoredWonderObservable.subscribe(
            (event) =>
              event &&
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)]),
          ),
        );

        const discardedObservable = await createEvents([
          WorldEvents.Discarded,
          gameIdString,
        ]);
        subscriptions.push(
          discardedObservable.subscribe(
            (event) =>
              event &&
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)]),
          ),
        );
      };

      subscribeToEvents();

      // Cleanup function to unsubscribe
      return () => {
        subscriptions.forEach((sub) => sub.unsubscribe());
        console.log("Unsubscribed from logs");
        subscribedRef.current = false;
      };
    }
  }, []); // Empty dependency array ensures this effect runs only once on mount

  // Remove duplicates
  const dedupedLogs = logs.filter(
    (log, idx) => idx === logs.findIndex((l) => l.id === log.id),
  );
  const sortedLogs = dedupedLogs.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  );
  return { logs: sortedLogs };
};
