import { Button, ButtonProps } from "@/ui/elements/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/elements/tooltip"
import { cn } from "@/ui/utils"
import React, { ReactElement } from "react"
import { isMobile } from "react-device-detect"

type IngameButtonProps = ButtonProps & React.RefAttributes<HTMLButtonElement> & {
    icon: string
    name?: string
    side?: "left" | "right" | "top" | "bottom"
    children?: ReactElement
}

export const IngameButton = React.forwardRef<HTMLButtonElement, IngameButtonProps>(
    ({ icon, name, side = "right", children, className, ...props }, ref): JSX.Element => {
        const content = children ?? (
            <Button
                ref={ref}
                className={cn("px-2 w-10 py-5 border-none bg-[#D2E2F1] bg-opacity-80 rounded-md pointer-events-auto", className)}
                {...props}
            >
                <img src={icon} className="w-6" />
            </Button>
        )

        return (name && !isMobile) ? (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger className="w-10 pointer-events-auto">
                        {content}
                    </TooltipTrigger>
                    <TooltipContent className="bg-transparent" side={side}>
                        <p>{name}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ) : content
    }
)

IngameButton.displayName = 'IngameButton'
