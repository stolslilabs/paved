import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

export type QuestsTab = "quests" | "achievements";

export interface QuestsTabsProps {
  active: QuestsTab;
  /** The page goes to `/missions` or `/missions/lifetime` (section 6.1: two tabs of the Missions destination, one route each). */
  onSelect?: (tab: QuestsTab) => void;
  className?: string;
}

/** Limited (the quests) and Lifetime (the achievements), the two tabs of the Missions destination; the highlight slides between them (F3b's Tabs). */
export function QuestsTabs({ active, onSelect, className }: QuestsTabsProps) {
  return (
    <Tabs value={active} onValueChange={(v) => onSelect?.(v as QuestsTab)} className={className}>
      <TabsList className={cn("w-full tablet:w-auto")}>
        <TabsTrigger value="quests" className="flex-1 gap-2 px-4">
          <Icon name="scroll" size="sm" />
          Limited
        </TabsTrigger>
        <TabsTrigger value="achievements" className="flex-1 gap-2 px-4">
          <Icon name="medal" size="sm" />
          Lifetime
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
