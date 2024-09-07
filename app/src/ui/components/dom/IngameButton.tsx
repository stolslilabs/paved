import { ModeType } from "@/dojo/game/types/mode"
import { useGame } from "@/hooks/useGame"
import { useQueryParams } from "@/hooks/useQueryParams"
import { useTutorial } from "@/hooks/useTutorial"
import { Button, ButtonProps } from "@/ui/elements/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/elements/tooltip"
import { cn } from "@/ui/utils"
import React, { ReactElement, useState } from "react"

type IngameButtonProps = ButtonProps & React.RefAttributes<HTMLButtonElement> & {
    icon: string
    name?: string
    side?: "left" | "right" | "top" | "bottom"
    tutorialCondition?: boolean
    children?: ReactElement
}

export const IngameButton = React.forwardRef<HTMLButtonElement, IngameButtonProps>(
    ({ icon, name, side = "right", tutorialCondition = false, children, className, ...props }, ref): JSX.Element => {
        const { gameId } = useQueryParams();
        const { game } = useGame({ gameId });
        const { currentTutorialStage } = useTutorial();

        const interactionText = currentTutorialStage?.interactionText?.get(props.id ?? "")
        const tutorialOpen = props.id && game?.mode.value === ModeType.Tutorial && interactionText

        const [ephemeralOpen, setEphemeralOpen] = useState(!!tutorialOpen && tutorialCondition)

        const content = children ?? (
            <Button
                ref={ref}
                className={cn(`px-2 aspect-square size-10 xl:size-16 p-2 ${tutorialOpen && tutorialCondition ? "border-solid" : "border-none"} border-blue-500 border-2 bg-[#D2E2F1] bg-opacity-80 rounded-md pointer-events-auto flex items-center justify-center`, className)}
                {...props}
            >
                <img src={icon} className="w-full h-full object-contain" />
            </Button>
        )

        return name ? (
            <TooltipProvider>
                <Tooltip
                    open={ephemeralOpen || (!!tutorialOpen && tutorialCondition)}
                    onOpenChange={(open) => {
                        if (!tutorialOpen && !tutorialCondition) {
                            setEphemeralOpen(open);
                        }
                    }}
                >
                    <TooltipTrigger asChild>
                        {content}
                    </TooltipTrigger>
                    <TooltipContent className="bg-transparent" side={side}>
                        <p>{tutorialOpen && tutorialCondition ? `${interactionText ?? name}` : name}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ) : content
    }
)

IngameButton.displayName = 'IngameButton'
