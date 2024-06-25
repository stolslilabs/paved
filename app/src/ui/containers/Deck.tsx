import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/ui/elements/carousel";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/ui/elements/drawer";
import { Button } from "@/ui/elements/button";
import { useMemo, useState } from "react";
import { useMediaQuery } from "react-responsive";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useGame } from "@/hooks/useGame";
import { Plan } from "@/dojo/game/types/plan";
import icon from "/assets/icons/INFO.svg";

export const Deck = () => {
  const { gameId } = useQueryParams();
  const { game } = useGame({ gameId });
  const isMdOrLarger = useMediaQuery({ query: "(min-width: 768px)" });
  const items = useMemo(() => game?.getPlans() || [], [game]);

  if (!game) return null;

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="command" size="command">
          <img src={icon} className="sm:h-4 md:h-7 fill-current" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="w-full max-w-sm md:max-w-full m-auto">
          <DrawerHeader>
            <DrawerTitle className="text-center text-2xl">
              Remaining tiles
            </DrawerTitle>
          </DrawerHeader>

          <Carousel
            className="w-full"
            orientation={"horizontal"}
            opts={{ dragFree: isMdOrLarger }}
          >
            <CarouselContent>
              {items.map(
                (
                  { plan, count }: { plan: Plan; count: number },
                  index: number,
                ) => (
                  <CarouselItem
                    key={index}
                    className="md:basis-1/3 lg:basis-1/5 2xl:basis-1/12 flex justify-center"
                  >
                    <div className="relative flex justify-center items-center h-28 w-28">
                      <div
                        className={`absolute inset-0 bg-cover bg-center opacity-90 z-0 opacity-50`}
                        style={{ backgroundImage: `url('${plan.getImage()}')` }}
                      />
                      <p className="text-6xl z-10">{count}</p>
                    </div>
                  </CarouselItem>
                ),
              )}
            </CarouselContent>
          </Carousel>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
