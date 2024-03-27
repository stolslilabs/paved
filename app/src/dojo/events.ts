import { request, gql } from "graphql-request";
import { createClient } from "graphql-ws";
import { BehaviorSubject, Observable } from "rxjs";

export type Event = {
  id: string;
  keys: string[];
  data: any;
  createdAt: string;
};

export async function createEventBacklog(
  url: string,
  keys: string[],
): Promise<Event[]> {
  const endpoint = `${url}/graphql`;
  const formattedKeys = keys.map((key) => `"${key}"`).join(",");
  const query = gql`
    query {
      events(first: 100000, keys: [${formattedKeys}]) {
        edges {
          node {
            id
            keys
            data
            createdAt
          }
        }
      }
    }
  `;
  const data: { events: { edges: any } } = await request(endpoint, query);
  const events = data.events.edges.map((edge: any) => edge.node);
  return events as Event[];
}

export async function createEventSubscription(
  url: string,
  keys: string[],
): Promise<Observable<Event | null>> {
  const wsClient = createClient({
    url: `${url}/graphql/ws`.replace("http", "ws"),
  });

  const lastUpdate$ = new BehaviorSubject<Event | null>(null);

  const formattedKeys = keys.map((key) => `"${key}"`).join(",");

  wsClient.subscribe(
    {
      query: gql`
        subscription {
          eventEmitted(keys: [${formattedKeys}]) {
            id
            keys
            data
            createdAt
          }
        }
      `,
    },
    {
      next: ({ data }) => {
        try {
          const event = data?.eventEmitted as Event;
          if (event) {
            lastUpdate$.next(event);
          }
        } catch (error) {
          console.log({ error });
        }
      },
      error: (error) => console.log({ error }),
      complete: () => console.log("complete"),
    },
  );
  return lastUpdate$;
}

export const createCustomEvents = async (url: string) => {
  return {
    createEvents: async (keys: string[]) => createEventSubscription(url, keys),
    queryEvents: async (keys: string[]) => createEventBacklog(url, keys),
  };
};
