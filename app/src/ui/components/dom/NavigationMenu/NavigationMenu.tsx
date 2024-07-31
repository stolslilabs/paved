import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IngameButton } from "../IngameButton";
import { NavigationMenuItems } from "./navigationMenuItems";
import burgerMenuIcon from "/assets/icons/menu.svg";
import infoIcon from "/assets/icons/info.svg";

export const NavigationMenu = () => {
    return (
        <div className="row-span-4 flex flex-col justify-between h-full">
            <Collapsible className="pointer-events-auto">
                <CollapsibleTrigger className="mb-1">
                    <IngameButton icon={burgerMenuIcon} />
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-1 absolute">
                    {NavigationMenuItems.map(({ name, icon }) => (
                        <IngameButton key={name} icon={icon} name={name} />
                    ))}
                </CollapsibleContent>
            </Collapsible>
            <IngameButton name="Deck Composition" icon={infoIcon} />
        </div>
    )
}
