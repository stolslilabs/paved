import { cn } from "../../lib/utils";

/**
 * `0x05f1…6e7f`: `@paved/chain`'s `shortAddress`, restated so the scenes import only types from the chain package (no
 * starknet.js in a scene's bundle until P2 wires the data).
 */
export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** A player as the screens name them: the cached Cartridge username, else the short address in the mono font. */
export function PlayerName({ name, address, className }: { name: string | null; address: string; className?: string }) {
  return name ? (
    <span className={cn("truncate", className)}>{name}</span>
  ) : (
    <span className={cn("truncate font-mono text-[0.9em]", className)}>{shortAddress(address)}</span>
  );
}
