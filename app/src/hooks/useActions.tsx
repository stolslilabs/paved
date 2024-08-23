import { useCallback, useEffect } from "react";

import { useQueryParams } from "@/hooks/useQueryParams";
import { useGameStore, useUIStore } from "@/store";
import { useDojo } from "@/dojo/useDojo";
import { useBuilder } from "./useBuilder";
import { useGame } from "./useGame";
import { useActionsStore } from "@/store";
import useSound from "use-sound";
import Click from "/sounds/effects/p-complete.m4a";
import Points from "/sounds/effects/points.wav";
import { comparePartials, useTutorial } from "./useTutorial";
import { ModeType } from "@/dojo/game/types/mode";
import { toast } from "sonner";

export const useActions = () => {
  const { gameId } = useQueryParams();
  const {
    orientation,
    x,
    y,
    character,
    spot,
    selectedTile,
    resetX,
    resetY,
    resetCharacter,
    resetSpot,
    resetSelectedTile,
    resetHoveredTile,
    resetOrientation,
    valid,
  } = useGameStore();
  const [play, { stop }] = useSound(Click);
  const [playPoints] = useSound(Points);
  const { game } = useGame({ gameId });
  const { disabled, setDisabled, enabled, setEnabled } = useActionsStore();

  const loading = useUIStore((state) => state.loading);
  const setLoading = useUIStore((state) => state.setLoading);

  const {
    account: { account },
    setup: {
      systemCalls: { build, discard, surrender },
    },
  } = useDojo();

  const { builder } = useBuilder({ gameId, playerId: account?.address });

  useEffect(() => {
    const selected = selectedTile.row !== 0 && selectedTile.col !== 0;
    setDisabled(loading || !selected || !valid || !builder?.tile_id);
    setEnabled(!loading && !!builder?.tile_id);
  }, [game, builder, selectedTile, valid, loading]);

  const { currentTutorialStage } = useTutorial()

  const handleConfirm = useCallback(async () => {
    if (game && builder?.tile_id) {
      setLoading(true);
      play();
      try {
        const tx = {
          account: account,
          mode: game.mode,
          game_id: gameId,
          tile_id: builder.tile_id,
          orientation: orientation,
          x: x,
          y: y,
          role: character,
          spot: spot,
        }
        if (game.mode.value === ModeType.Tutorial) {
          if (!comparePartials(currentTutorialStage().presetTransaction, tx)) {
            // Reset the settings
            resetX();
            resetY();
            resetCharacter();
            resetSpot();
            resetSelectedTile();
            resetHoveredTile();
            setLoading(false);
            return toast.error("Incorrect tile configuration, please correct and try again.")
          }
        }
        await build(tx);
        // Reset the settings
        resetX();
        resetY();
        resetCharacter();
        resetSpot();
        resetSelectedTile();
        resetHoveredTile();
        resetOrientation();
      } catch (e) {
        console.log(e);
      }
      setLoading(false);
      playPoints();
    }
  }, [game, builder, account, gameId, orientation, x, y, character, spot]);

  const handleDiscard = useCallback(async () => {
    if (game) {
      setLoading(true);
      play();
      await discard({
        account: account,
        mode: game.mode,
        game_id: game.id,
      });
      setLoading(false);
      playPoints();
    }
  }, [game, account]);

  const handleSurrender = useCallback(async () => {
    if (game && account) {
      setLoading(true);
      play();
      await surrender({
        account: account,
        mode: game.mode,
        game_id: game.id,
      });
      setLoading(false);
    }
  }, [game, account]);

  return {
    handleConfirm,
    handleDiscard,
    handleSurrender,
    disabled,
    enabled,
    builder,
  };
};
