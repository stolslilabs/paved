import { useState } from "react";
import { LeaderboardDialog } from "../components/Leaderboard";
import { Surrender } from "../actions/Surrender";
import { Compass } from "../components/Compass";
import { ToolTipButton } from "../components/ToolTipButton";
import { useNavigate } from "react-router-dom";
import { useCameraStore } from "@/store";
import { motion } from "framer-motion";
import { SettingsDialog } from "../components/Settings";
import expand from "/assets/icons/EXPAND.svg";
import home from "/assets/icons/HOME.svg";
import cancel from "/assets/icons/CANCEL.svg";

export const Actions = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const { setReset } = useCameraStore();

  return (
    <div className="absolute left-2 bottom-2 md:left-4 md:bottom-6 z-30">
      <div className="relative">
        <div
          className={`flex flex-col gap-3 mb-3 transition-all duration-200 ${isExpanded ? "opacity-100" : "opacity-0"}`}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isExpanded ? 1 : 0, y: isExpanded ? 0 : 20 }}
            transition={{ duration: 0.4 }}
          >
            <Surrender />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isExpanded ? 1 : 0, y: isExpanded ? 0 : 20 }}
            transition={{ duration: 0.3 }}
          >
            <LeaderboardDialog />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isExpanded ? 1 : 0, y: isExpanded ? 0 : 20 }}
            transition={{ duration: 0.2 }}
          >
            <ToolTipButton
              onClick={() => navigate("", { replace: true })}
              icon={<img src={home} className="h-8 sm:h-4 md:h-8 fill-current" />}
              toolTipText="Home page"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isExpanded ? 1 : 0, y: isExpanded ? 0 : 20 }}
            transition={{ duration: 0.1 }}
          >
            <SettingsDialog />
          </motion.div>
        </div>

        <div className="flex gap-3 relative">
          <div className="z-[100]">
            <ToolTipButton
              onClick={() => setIsExpanded(!isExpanded)}
              icon={
                <img
                  src={expand}
                  className={`h-8 sm:h-4 md:h-8 fill-current duration-300  ${isExpanded ? "rotate-180" : ""}`}
                />
              }
              toolTipText={isExpanded ? "Collapse" : "Expand"}
            />
          </div>

          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: isExpanded ? 1 : 0, x: isExpanded ? 0 : -100 }}
            transition={{ duration: 0.1 }}
          >
            <ToolTipButton
              onClick={() => setReset(true)}
              icon={<img src={cancel} className="h-8 sm:h-4 md:h-8 fill-current" />}
              toolTipText="Reset view"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: isExpanded ? 1 : 0, x: isExpanded ? 0 : -100 }}
            transition={{ duration: 0.2 }}
          >
            <Compass />
          </motion.div>
        </div>
      </div>
    </div>
  );
};
