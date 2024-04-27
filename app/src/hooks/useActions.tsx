import {
  useCallback,
  useMemo,
  useState,
  createContext,
  useContext,
  useEffect,
} from "react";

import { useQueryParams } from "@/hooks/useQueryParams";
import { useGameStore } from "@/store";
import { useDojo } from "@/dojo/useDojo";
import { useBuilder } from "./useBuilder";
import { Account } from "starknet";
import { useAccount } from "@starknet-react/core";
import { useGame } from "./useGame";
import { useActionsStore } from "@/store";

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
    valid,
  } = useGameStore();
  const { account } = useAccount();
  const { game } = useGame({ gameId });
  const { disabled, setDisabled, enabled, setEnabled } = useActionsStore();
  const [isWaiting, setIsWaiting] = useState(false);

  const {
    setup: {
      systemCalls: { build },
    },
  } = useDojo();

  const { builder } = useBuilder({ gameId, playerId: account?.address });

  useEffect(() => {
    const selected = selectedTile.row !== 0 && selectedTile.col !== 0;
    setDisabled(isWaiting || !selected || !valid || !builder?.tile_id);
    setEnabled(!isWaiting && !!builder?.tile_id);
  }, [game, builder, selectedTile, valid, isWaiting]);

  const handleClick = useCallback(async () => {
    if (game && builder?.tile_id) {
      setIsWaiting(true);
      try {
        await build({
          account: account as Account,
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
      } catch (e) {
        console.log(e);
      }
      setIsWaiting(false);
    }
  }, [game, builder, account, gameId, orientation, x, y, character, spot]);

  return {
    handleClick,
    disabled,
    enabled,
    builder,
  };
};
