import { ShopPacks, type ShopPacksProps } from "../containers/shop-packs";
import { TopBar } from "../containers/top-bar";

export type { CobbleShop } from "../containers/shop-packs";

export interface CobblesSceneProps extends ShopPacksProps {
  onBack?: () => void;
}

/**
 * The Cobble packs in the sheet a page opens over itself (`useCobblesSheet`, BACK-RULE #783: a theme's, the avatar's Get Cobbles): the
 * Shop's Cobbles tab (SHOP-PAGE, `ShopPacks`), its cards and its Pay, under a top bar with the packs' balances. The packs' own page
 * left for the Shop's tab; its link lands there (`router.tsx`).
 */
export function CobblesScene({ onBack, ...props }: CobblesSceneProps) {
  return (
    <div className="flex flex-col bg-background text-foreground">
      <TopBar title="Cobbles" onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-8">
        <ShopPacks {...props} />
      </main>
    </div>
  );
}
