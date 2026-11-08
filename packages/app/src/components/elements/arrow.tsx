/** An arrow's button: a 44 px target at the carousel's edge, muted until hovered. */
export const ARROW = "size-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground";

/**
 * An arrow's glyph (the owner's ask of 2026-11-05: subtle arrows rather than the book's chunky chevrons): a thin arrow, its shaft and
 * its head with rounded ends, in the muted text colour, the foreground's under the pointer. Here since GAME-OVERLAY (the replay's
 * steps), out of the League carousel's module, which re-exports it.
 */
export function Arrow({ to }: { to: "left" | "right" }) {
  const d = to === "left" ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6";
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
