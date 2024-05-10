import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/ui/elements/dialog";

import { useState } from "react";
import { faCog } from "@fortawesome/free-solid-svg-icons";
import { ToolTipButton } from "./ToolTipButton";
import { MusicPlayer } from "./MusicPlayer";
import { useGameStore } from "@/store";
import { Switch } from "../elements/switch";
import { Label } from "../elements/label";

export const SettingsDialog = () => {
  const [open, setOpen] = useState(false);

  const strategyMode = useGameStore((state) => state.strategyMode);
  const setStrategyMode = useGameStore((state) => state.setStrategyMode);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <ToolTipButton icon={faCog} toolTipText="Settings" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="flex items-center">Settings</DialogHeader>
        <MusicPlayer />

        <div className="flex justify-between w-full">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-finished"
              checked={strategyMode}
              onCheckedChange={() => setStrategyMode(!strategyMode)}
            />
            <Label className="text-xs" htmlFor="show-finished">
              Strategy Mode (2D Tiles)
            </Label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
