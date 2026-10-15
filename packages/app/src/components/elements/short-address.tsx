import { cn } from "../../lib/utils";

/**
 * `0x05f1…6e7f`: `@paved/chain`'s `shortAddress`, restated so the scenes import only types from the chain package (no
 * starknet.js in a scene's bundle until P2 wires the data).
 */
export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export interface ShortAddressProps {
  address: string;
  className?: string;
}

/**
 * An address cut in the middle (`0x05f1…6e7f`), in the mono font, never broken over two lines; the full address is its
 * `title` (WRAP360: addresses truncate, the full value stays reachable).
 */
export function ShortAddress({ address, className }: ShortAddressProps) {
  return (
    <span title={address} className={cn("font-mono whitespace-nowrap", className)}>
      {shortAddress(address)}
    </span>
  );
}
