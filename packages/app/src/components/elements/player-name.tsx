import { cn } from "../../lib/utils";
import { shortAddress } from "./short-address";

/**
 * A player as the screens name them: the cached Cartridge username, else the short address in the mono font. Either is
 * cut with an ellipsis when its column is too narrow; the full name or address is its `title`.
 */
export function PlayerName({ name, address, className }: { name: string | null; address: string; className?: string }) {
  return name ? (
    <span title={name} className={cn("truncate", className)}>{name}</span>
  ) : (
    <span title={address} className={cn("truncate font-mono text-[0.9em]", className)}>{shortAddress(address)}</span>
  );
}
