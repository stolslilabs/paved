import { useDojo } from "@/dojo/useDojo";
import { SCORED_EVENT } from "@/constants/events";
import { Event } from "@/dojo/createCustomEvents";
import { createScoredLog, parseScoredEvent } from "@/utils/events";
import { useEffect, useRef, useState } from "react";
import { Subscription } from "rxjs";

export type LogType = { timestamp: number; log: string };

const generateLogFromEvent = (event: Event): LogType => {
  if (event.keys[0] === SCORED_EVENT) {
    return createScoredLog(parseScoredEvent(event));
  }
  return { timestamp: Date.now(), log: "Unknown event" };
};

export const useLogs = () => {
  const [logs, setLogs] = useState<LogType[]>([]);
  const subscribedRef = useRef(false);

  const {
    setup: {
      contractEvents: { createScoredEvents, queryScoredEvents },
    },
  } = useDojo();

  useEffect(() => {
    // Query all existing logs from the db
    const queryEvents = async () => {
      const events = await queryScoredEvents();
      setLogs(events.map(generateLogFromEvent));
    };

    queryEvents();

    // Check if already subscribed to prevent duplication due to HMR
    if (!subscribedRef.current) {
      const subscriptions: Subscription[] = [];

      const subscribeToEvents = async () => {
        console.log("Subscribing to events");

        const supplyObservable = await createScoredEvents();

        subscriptions.push(
          supplyObservable.subscribe((event) => {
            if (event) {
              console.log(event);
              setLogs((prevLogs) => [...prevLogs, generateLogFromEvent(event)]);
            }
          })
        );

        subscribedRef.current = true; // Mark as subscribed
      };

      subscribeToEvents();

      // Cleanup function to unsubscribe
      return () => {
        subscriptions.forEach((sub) => sub.unsubscribe());
        console.log("Unsubscribed from all events");
        subscribedRef.current = false;
      };
    }
  }, []); // Empty dependency array ensures this effect runs only once on mount

  return { logs };
};
