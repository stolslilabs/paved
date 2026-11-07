import { cn } from "../../lib/utils";
import { vaultArtSources, type VaultArtName } from "./vault-art";

export interface VaultArtImageProps {
  name: VaultArtName;
  /** The width it is drawn at in CSS px, so it loads a copy sharp at that size; `className` sizes it. */
  px: number;
  className?: string;
}

/** One of the Vault's painted icons (`vault-art.ts`), drawn as a `UiIcon` is: decorative, its word beside it names it. */
export function VaultArtImage({ name, px, className }: VaultArtImageProps) {
  return (
    <img
      {...vaultArtSources(name, px)}
      alt=""
      aria-hidden
      decoding="async"
      draggable={false}
      data-slot="vault-art"
      data-art={name}
      className={cn("inline-block shrink-0 select-none", className)}
    />
  );
}
