import { Button } from "@/ui/elements/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/elements/tooltip"

type Props = {
    icon: string
    name?: string
}

export const IngameButton = ({ icon, name }: Props) => {
    const img = (
        <Button className="px-2 w-10 py-5 border-none bg-[#D2E2F1] bg-opacity-80 rounded-md">
            <img src={icon} className="w-6" />
        </Button>
    )

    return name ? (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger className="w-10 pointer-events-auto">
                    {img}
                </TooltipTrigger>
                <TooltipContent className="bg-transparent" side="right">
                    <p>{name}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    ) : img
}
