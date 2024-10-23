import { ModeType } from "@/dojo/game/types/mode";
import { useGame } from "@/hooks/useGame";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useTutorial } from "@/hooks/useTutorial";
import { Button, ButtonProps } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { cn } from "@/ui/utils";
import React, { ReactElement, useCallback, useMemo, useState } from "react";

type IngameButtonProps = ButtonProps &
  React.RefAttributes<HTMLButtonElement> & {
    icon: string;
    name?: string;
    side?: "left" | "right" | "top" | "bottom";
    tutorialCondition?: boolean;
    children?: ReactElement;
  };

export const IngameButton = React.forwardRef<
  HTMLButtonElement,
  IngameButtonProps
>(
  (
    {
      icon,
      name,
      side = "right",
      tutorialCondition = false,
      children,
      className,
      ...props
    },
    ref,
  ): JSX.Element => {
    const { gameId } = useQueryParams();
    const { game } = useGame({ gameId });
    const { currentTutorialStage } = useTutorial();

    const interactionText = useMemo(() => currentTutorialStage?.interactionText?.get(
      props.id ?? "",
    ), [currentTutorialStage?.interactionText, props.id])
    const tutorialOpen = useMemo(() => props.id && game?.mode.value === ModeType.Tutorial && interactionText, [game?.mode.value, interactionText, props.id])

    const [ephemeralOpen, setEphemeralOpen] = useState(
      !!tutorialOpen && tutorialCondition,
    );

    const content = children ?? (
      <Button
        ref={ref}
        className={cn(
          `px-2 aspect-square size-10 xl:size-16 p-2 ${tutorialOpen && tutorialCondition ? "border-solid" : "border-none"} border-blue-500 border-2 bg-[#D2E2F1] bg-opacity-80 rounded-md pointer-events-auto flex items-center justify-center`,
          className,
        )}
        {...props}
      >
        <img src={icon} className="w-full h-full object-contain" />
      </Button>
    );

    const memoizedOpen = useMemo(() => ephemeralOpen || (!!tutorialOpen && tutorialCondition), [ephemeralOpen, tutorialOpen, tutorialCondition])
    const onOpenChangeCallback = useCallback((open: boolean) => {
      if (!tutorialOpen && !tutorialCondition) {
        setEphemeralOpen(open);
      }
    }, [tutorialOpen, tutorialCondition])

    return name ? (
      <Tooltip
        open={memoizedOpen}
        onOpenChange={onOpenChangeCallback}
      >
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent
          className="sm:bg-transparent max-w-[200px] sm:max-w-full whitespace-normal text-center sm:text-start"
          side={side}
        >
          <p>
            {tutorialOpen && tutorialCondition
              ? `${interactionText ?? name}`
              : name}
          </p>
        </TooltipContent>
      </Tooltip>
    ) : (
      content
    );
  },
);

IngameButton.displayName = "IngameButton";
