import { useGameStore } from "@/store";
import { Connection } from "../Connection";
import banner from "/assets/banner.svg";
import { ReactNode } from "react";

type OverlayProps = { children: ReactNode };

export const Overlay = ({ children }: OverlayProps) => {
  const { resetHoveredTile } = useGameStore();

  return (
    <div className="z-20 pointer-events-none" onMouseEnter={resetHoveredTile}>
      {children}
    </div>
  );
};

const Header = () => (
  <div className="absolute right-0 h-12 flex justify-end gap-4 p-2">
    <Connection />
  </div>
);

const Banner = () => (
  <div className="absolute top-0 left-0 flex justify-center items-center w-full h-12 md:h-40 opacity-5">
    <img src={banner} alt="banner" className="w-full h-full" />
  </div>
);

const Content = ({ children }: { children: ReactNode }) => (
  <div className="w-full h-full grid grid-cols-3 grid-rows-4 absolute p-4 select-none">
    {children}
  </div>
)

Overlay.Header = Header
Overlay.Banner = Banner
Overlay.Content = Content
