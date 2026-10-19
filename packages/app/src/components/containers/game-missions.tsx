import { Cobbles } from "../elements/cobbles";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/** A mission one game completed (#595): a quest of its day or an achievement, with what it gives. */
export interface GameMission {
  /** `completionKey` of the mission: unique in the list. */
  key: string;
  kind: "quest" | "achievement";
  title: string;
  icon: string;
  /** Its Cobbles, to claim on the Missions page; none: no reward. */
  cobbles?: number;
  /** An achievement's points. */
  points?: number;
}

/**
 * The game over's missions (#595): those the game completed, each with its icon, its kind and its reward, and the way to the
 * Missions page where their Cobbles are claimed. Nothing when the game completed none.
 */
export function GameMissions({ missions, onOpen }: { missions: readonly GameMission[]; onOpen?: () => void }) {
  if (missions.length === 0) return null;
  return (
    <section data-slot="card" aria-label="Missions completed" className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
          <Icon name="scroll" size="sm" className="text-primary" />
          Missions completed
        </h2>
        <span className="numeric text-xs text-muted-foreground">{missions.length}</span>
      </header>
      <ul className="flex flex-col divide-y divide-border">
        {missions.map((m) => (
          <li key={m.key} className="flex items-center gap-3 py-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
              <Icon name={m.icon} size="sm" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col wrap-anywhere">
              <span className="text-sm font-semibold">{m.title}</span>
              <span className="text-xs text-muted-foreground">
                {m.kind === "quest" ? "Mission" : "Lifetime mission"}
                {m.points != null && <span className="numeric"> · +{m.points} pts</span>}
              </span>
            </span>
            {m.cobbles != null && m.cobbles > 0 && <Cobbles value={m.cobbles} sign="+" size="sm" />}
          </li>
        ))}
      </ul>
      {onOpen && (
        <Button variant="link" size="sm" onClick={onOpen} className="self-start px-0">
          Claim on the Missions page
        </Button>
      )}
    </section>
  );
}
