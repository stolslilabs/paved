import { ExpandIcon, ShrinkIcon } from "lucide-react";
import { Button } from "../elements/button";
import { useEffect, useState } from "react";

export const FullscreenToggle = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleToggle = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen()
      : document?.exitFullscreen();

  const FullscreenStateIcon = isFullscreen ? ShrinkIcon : ExpandIcon;

  return (
    document.fullscreenEnabled && (
      <Button variant="default" className="w-full" onClick={handleToggle}>
        <FullscreenStateIcon className="absolute left-4 h-4 w-4" />
        {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
      </Button>
    )
  );
};
