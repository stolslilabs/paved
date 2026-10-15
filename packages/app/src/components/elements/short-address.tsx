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
 * An address cut in the middle (`0x05f1…6e7f`), in the mono font, never broken over two lines (WRAP360: addresses
 * truncate, the full value stays reachable). The full address is its `title` for the pointer, and visually hidden text
 * for a screen reader, which reads it instead of the cut one: an `aria-label` on a plain `span` is not read reliably
 * (ARIA 1.2 prohibits it on the generic role).
 */
export function ShortAddress({ address, className }: ShortAddressProps) {
  const short = shortAddress(address);
  return (
    <span title={address} className={cn("font-mono whitespace-nowrap", className)}>
      {short === address ? (
        address
      ) : (
        <>
          <span aria-hidden>{short}</span>
          <span className="sr-only">{address}</span>
        </>
      )}
    </span>
  );
}
