import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

export type QuestsTab = "quests" | "achievements";

export interface QuestsTabsProps {
  active: QuestsTab;
  /** The page goes to `/quests` or `/achievements` (section 6.1: Achievements is a tab beside Quests, one route each). */
  onSelect?: (tab: QuestsTab) => void;
  className?: string;
}

/** Quests and Achievements, the two tabs of the Quests destination; the highlight slides between them (F3b's Tabs). */
export function QuestsTabs({ active, onSelect, className }: QuestsTabsProps) {
  return (
    <Tabs value={active} onValueChange={(v) => onSelect?.(v as QuestsTab)} className={className}>
      <TabsList className={cn("w-full tablet:w-auto")}>
        <TabsTrigger value="quests" className="flex-1 gap-2 px-4">
          <Icon name="scroll" size="sm" />
          Quests
        </TabsTrigger>
        <TabsTrigger value="achievements" className="flex-1 gap-2 px-4">
          <Icon name="medal" size="sm" />
          Achievements
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
