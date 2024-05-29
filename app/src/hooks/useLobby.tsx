import { Mode, ModeType } from "@/dojo/game/types/mode";
import { useLobbyStore } from "@/store";
import { useMemo } from "react";

export const useLobby = () => {
  const { mode, setMode } = useLobbyStore();

  const gameMode: Mode = useMemo(() => {
    if (mode === ModeType.Weekly) {
      return new Mode(ModeType.Weekly);
    } else if (mode === ModeType.Daily) {
      return new Mode(ModeType.Daily);
    } else {
      return new Mode(ModeType.None);
    }
  }, [mode]);

  return {
    gameMode,
  };
};
