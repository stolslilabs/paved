import {
  useCallback,
  useMemo,
  useState,
  createContext,
  useContext,
  useEffect,
} from "react";

import { useQueryParams } from "@/hooks/useQueryParams";
import { useGameStore, useUIStore } from "@/store";
import { useDojo } from "@/dojo/useDojo";
import { useBuilder } from "./useBuilder";
import { Account } from "starknet";
import { useAccount } from "@starknet-react/core";
import { useGame } from "./useGame";
import { useActionsStore } from "@/store";
import useSound from "use-sound";
import Click from "/sounds/p-complete.m4a";
import Points from "/sounds/points.wav";

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

  // const { account } = useAccount();
  const { game } = useGame({ gameId });
  const { disabled, setDisabled, enabled, setEnabled } = useActionsStore();
  // const [isWaiting, setIsWaiting] = useState(false);

  const loading = useUIStore((state) => state.loading);
  const setLoading = useUIStore((state) => state.setLoading);

  const {
    account: { account },
    setup: {
      systemCalls: { build },
    },
  } = useDojo();

  const { builder } = useBuilder({ gameId, playerId: account?.address });

  useEffect(() => {
    const selected = selectedTile.row !== 0 && selectedTile.col !== 0;
    setDisabled(loading || !selected || !valid || !builder?.tile_id);
    setEnabled(!loading && !!builder?.tile_id);
  }, [game, builder, selectedTile, valid, loading]);

  const handleClick = useCallback(async () => {
    if (game && builder?.tile_id) {
      setLoading(true);
      play();
      try {
        await build({
          account: account as Account,
          mode: game.mode,
          game_id: gameId,
          tile_id: builder.tile_id,
          orientation: orientation,
          x: x,
          y: y,
          role: character,
          spot: spot,
        });
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

  return {
    handleClick,
    disabled,
    enabled,
    builder,
  };
};
