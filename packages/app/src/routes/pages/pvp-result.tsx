import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { deckArt } from "../../components/containers/deck-sheet";
import { shortAddress } from "../../components/elements/short-address";
import { PvpResultScene, type PvpReward } from "../../components/scenes/pvp-result-scene";
import { PvpSearchScene } from "../../components/scenes/pvp-search-scene";
import { starsFor } from "../../lib/pvp-rules";
import { useBoardSkins } from "../../data/board-skins";
import { useCobbleAccount } from "../../data/cobbles";
import { usePlayerStatus } from "../../data/indexer";
import { usePvpPlayer, usePvpSettled, usePvpStatus } from "../../data/pvp";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useDataSources } from "../../data/sources";
import { useTileArt } from "../../data/tile-art";
import { useTileRenders } from "../../data/tile-renders";
import { useVillage, useVillageReward, useVillageWrites } from "../../data/village";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useUpTo } from "../ref";
import NotFound from "./not-found";

/** The next UTC day: the daily cap of the village rewards resets then (#642). */
const nextDay = (now: number) => (Math.floor(now / 86_400) + 1) * 86_400;

/**
 * `/pvp/result/:id` (#647 PR 2): the end of the attacker's attack `id`. Its score and stars from `Arena.attack` (the last
 * attack) or the indexer's row, the crowns it moved from its last receipt or the indexer, the crowns after it from
 * `Matchmaker.league`; then the village reward the settlement granted (#642, `Rewards`): Open draws its three tiles, and #646's
 * sheet places one, adds a copy, or takes the Cobbles (`useVillageWrites`).
 */
export default function Page() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) return <NotFound />;
  return <Result id={Number(id)} />;
}

function Result({ id }: { id: number }) {
  const go = useAppNavigate();
  const onBack = useUpTo("/pvp/league");
  const now = useNow();
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? null;
  const status = usePvpStatus(me);
  const settled = usePvpSettled(me, id);
  const last = status.data?.attack.id === id ? status.data.attack : null;
  const defenderId = last?.defender ?? settled.data?.defender ?? null;
  const name = usePlayerStatus(defenderId).data?.player.name ?? null;
  const defender = usePvpPlayer(defenderId, name);
  const owner = wallet.username ?? (me ? shortAddress(me) : "");
  const village = useVillage(me, owner);
  const reward = useVillageReward(me);
  const account = useCobbleAccount(me);
  const writes = useVillageWrites(me);
  const [taken, setTaken] = useState<{ plan: number | null; cobbles: number | null } | null>(null);
  const tileArt = deckArt(useTileRenders(RENDERER_ASSETS), useBoardSkins(me), useTileArt(RENDERER_ASSETS));

  const self = { name: wallet.username ?? null, address: me ?? "0x0", level: 0, crowns: 0 };
  const error = status.error ?? settled.error ?? defender.error;
  const target = last?.target ?? settled.data?.target;
  const score = settled.data?.score ?? last?.score;
  if (me === null) return <PvpSearchScene state="error" player={self} error="Connect to see your attack's result." onRetry={() => void wallet.connect()} onCancel={onBack} />;
  if (status.data === null) return <PvpSearchScene state="error" player={self} error="PvP is not on this network yet." onCancel={onBack} />;
  if (!status.data || !settled.data || !defender.data || target === undefined || score === undefined) {
    const missing = settled.data === null && !status.isPending ? "This attack is not recorded yet: its result shows once the indexer has it." : (error?.message ?? null);
    return <PvpSearchScene state={missing ? "error" : "searching"} player={self} error={missing} errorDetail={error ? errorDetail(error) : undefined} onCancel={onBack} />;
  }
  const stars = settled.data.surrendered ? 0 : (settled.data.stars ?? starsFor(score, target));
  const offer = reward.data?.offer ?? null;
  const shown: PvpReward = taken
    ? { state: "taken", ...taken }
    : offer
      ? { state: "offer", offer }
      : (reward.data?.pending ?? 0) > 0
        ? { state: "sealed", pending: reward.data!.pending }
        : stars > 0
          ? { state: "capped", resetsAt: nextDay(now) }
          : { state: "none" };
  const send = (write: () => Promise<unknown>, done: { plan: number | null; cobbles: number | null } | null, title: string) => {
    if (writes.pending) return;
    writes.reset();
    write().then(
      () => {
        if (done) setTaken(done);
        toast.success(title);
      },
      (e: unknown) => toast.error("Village reward", { description: e instanceof Error ? e.message : String(e) }),
    );
  };
  return (
    <PvpResultScene
      defender={defender.data}
      stars={stars}
      score={score}
      target={target}
      crowns={settled.data.gained - settled.data.lost}
      crownsAfter={status.data.league.crowns}
      reward={shown}
      village={village.data?.village ?? { owner, level: 1, cells: [], tiles: [], copies: {}, score: 0, maxCells: 38 }}
      balance={account.data?.cobbles ?? 0}
      now={now}
      opening={writes.pending?.kind === "open"}
      tileArt={tileArt}
      onOpenReward={() => send(writes.open, null, "Reward opened")}
      onPlace={(p) => send(() => writes.place(p.slot, p.orientation, { x: p.x, y: p.y }), { plan: p.plan, cobbles: null }, "Tile placed in your village")}
      onAddCopy={(c) => send(() => writes.merge(c.slot), { plan: c.plan, cobbles: null }, "Copy added")}
      onTakeCobbles={() => send(writes.cobbles, { plan: null, cobbles: offer?.cobbles ?? 0 }, "Cobbles taken")}
      onReplay={() => go(`/pvp/replay/${me}/${id}`)}
      onAgain={() => go("/pvp")}
      onHome={() => go("/")}
    />
  );
}
