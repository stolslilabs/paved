import { Icon } from "../ui/icon";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

export type QuestsTab = "quests" | "achievements";

export interface QuestsTabsProps {
  active: QuestsTab;
  /** The page goes to `/missions` or `/missions/lifetime` (section 6.1: two tabs of the Missions destination, one route each). */
  onSelect?: (tab: QuestsTab) => void;
  className?: string;
}

/**
 * Limited (the quests) and Lifetime (the achievements), the two tabs of the Missions destination. One route each, so the
 * Tabs remember the last tab (`rememberAs`) and the indicator slides across the route change. The list keeps one size on
 * both pages: full width on a phone, the widest label twice from the tablet on (`w-fit`, never stretched).
 */
export function QuestsTabs({ active, onSelect, className }: QuestsTabsProps) {
  return (
    <Tabs value={active} rememberAs="missions" onValueChange={(v) => onSelect?.(v as QuestsTab)} className={className}>
      <TabsList className="w-full tablet:w-fit">
        <TabsTrigger value="quests" className="gap-2 px-4">
          <Icon name="scroll" size="sm" />
          Limited
        </TabsTrigger>
        <TabsTrigger value="achievements" className="gap-2 px-4">
          <Icon name="medal" size="sm" />
          Lifetime
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
