import { useEffect, useMemo, useState } from "react";
import { LeaderboardDialog } from "../components/Leaderboard";
import { Surrender } from "../components/Surrender";
import { Log } from "../components/Log";
import { Compass } from "../components/Compass";
import {
  faBinoculars,
  faHome,
  faUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";
import { ToolTipButton } from "../components/ToolTipButton";
import { useNavigate } from "react-router-dom";
import { useCameraStore, useUIStore } from "@/store";
import { motion } from "framer-motion";
import { SettingsDialog } from "../components/Settings";
import Expand from "@/ui/icons/EXPAND.svg?react";
import Home from "@/ui/icons/HOME.svg?react";
import Cancel from "@/ui/icons/CANCEL.svg?react";
import useSound from "use-sound";
import { tracks } from "@/hooks/useMusic";

export const Actions = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const { setReset } = useCameraStore();

  const volume = useUIStore((state) => state.volume);
  const isPlaying = useUIStore((state) => state.isPlaying);
  const setIsPlaying = useUIStore((state) => state.setIsPlaying);

  const [play, { stop }] = useSound(tracks[0].url, {
    volume: volume / 100,
    onplay: () => setIsPlaying(true),
    onstop: () => setIsPlaying(false),
    onend: () => {
      setIsPlaying(false);
      // goToNextTrack();
    },
  });

  useMemo(() => {
    if (isPlaying) {
      play();
    } else {
      stop();
    }

    return () => stop();
  }, [isPlaying]);

  return (
    <div className="absolute left-2 bottom-2 md:left-4 md:bottom-6 z-30">
      <div className="relative">
        <ToolTipButton
          onClick={() => setIsExpanded(!isExpanded)}
          icon={
            <Expand
              className={`sm:h-4 md:h-8 fill-current duration-300  ${isExpanded ? "rotate-180" : ""}`}
            />
          }
          toolTipText={isExpanded ? "Collapse" : "Expand"}
        />
        <div
          className={`absolute left-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 top-[-120%]" : "opacity-0 top-[100%]"
          }`}
        >
          <ToolTipButton
            onClick={() => navigate("", { replace: true })}
            icon={<Home className="sm:h-4 md:h-8 fill-current" />}
            toolTipText="Home page"
          />
        </div>
        <div
          className={`absolute left-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 top-[-240%]" : "opacity-0 top-[100%]"
          }`}
        >
          <LeaderboardDialog />
        </div>
        <div
          className={`absolute left-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 top-[-360%]" : "opacity-0 top-[100%]"
          }`}
        >
          <Surrender />
        </div>
        <div
          className={`absolute bottom-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 right-[-120%]" : "opacity-0 right-[100%]"
          }`}
        >
          <ToolTipButton
            onClick={() => setReset(true)}
            icon={<Cancel className="sm:h-4 md:h-8 fill-current" />}
            toolTipText="Reset view"
          />
        </div>
        <div
          className={`absolute bottom-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 right-[-240%]" : "opacity-0 right-[100%]"
          }`}
        >
          <Compass />
        </div>
        <div
          className={`absolute bottom-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 right-[-360%]" : "opacity-0 right-[100%]"
          }`}
        >
          <Log />
        </div>
        <div
          className={`absolute bottom-0 transition-all duration-200 ${
            isExpanded ? "opacity-100 right-[-480%]" : "opacity-0 right-[100%]"
          }`}
        >
          <SettingsDialog />
        </div>
      </div>
    </div>
  );
};
