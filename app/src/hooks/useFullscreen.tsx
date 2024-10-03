import { useSyncExternalStore } from "react";

export const useFullscreen = () => {
  const subscribe = (callback: () => void) => {
    document.addEventListener("fullscreenchange", callback);
    return () => document.removeEventListener("fullscreenchange", callback);
  };

  const getSnapshot = () => {
    return !!document.fullscreenElement;
  };

  const isFullscreen = useSyncExternalStore(subscribe, getSnapshot);

  return isFullscreen;
};
