import { useLobby } from "@/hooks/useLobby";
import BoxRainScene from "../modules/BoxRain";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../elements/tabs";
import { Tournament } from "../components/Tournament";
import { Games } from "../modules/Games";
import banner from "/assets/banner.svg";
import { MusicPlayer } from "../components/MusicPlayer";
import { CreateGame } from "../components/CreateGame";
import { Links } from "../components/Links";
import { Player } from "../modules/Player";
import { Address } from "../components/Address";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "../elements/drawer";
import leaderboardIcon from "/assets/icons/leaderboard.svg";
import { Mode, ModeType } from "@/dojo/game/types/mode";
import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import { useDojo } from "@/dojo/useDojo";
import { ComponentUpdate, ComponentValue, Has, Schema, defineEnterSystem, defineSystem } from "@dojoengine/recs";
import { useNavigate } from "react-router-dom";
import { useBuilder } from "@/hooks/useBuilder";

const tabs = ["daily", "weekly", "1v1", "tutorial"];
const disabledTabs = ["1v1"];

// TODO: Consider applying this to the tabs component directly
const tabsStyles = {
  trigger: "h-full bg-primary/50 data-[state=active]:bg-secondary/50 truncate rounded-b-none border-primary border-[1px] data-[state=active]:border-b-transparent disabled:bg-primary/25 sm:tracking-[0.25rem] text-xs sm:text-2xs lg:text-base",
  content: "h-full bg-primary mt-0 bg-secondary/50 border-x-[1px] border-primary"
}

export const GameLobby = () => {
  const { gameMode } = useLobby();

  return (
    <div className="h-screen flex w-full relative">
      <BoxRainScene />
      <PanelsContainer>
        <GameTablePanel>
          <PanelsContainerHeader>
            <img src={banner} className="h-full" />
            <MusicPlayer />
          </PanelsContainerHeader>
          <GameTable gameMode={gameMode} />
        </GameTablePanel>
        <InfoPanel gameMode={gameMode} />
      </PanelsContainer>
    </div>
  );
};

const GameTablePanel = ({ children }: { children: ReactNode }) => (
  <div className="w-full sm:w-7/12 z-0 flex flex-col p-4">
    {children}
  </div>
)

const PanelsContainer = ({ children }: { children: ReactNode }) => (
  <div className="flex w-full gap-8">
    <div className="absolute top-0 left-0 z-0 flex w-full h-full bg-white/90 pointer-events-none" />
    {children}
  </div>
)

const PanelsContainerHeader = ({ children }: { children: ReactNode }) => (
  <div className="h-24 flex justify-between w-full flex-shrink-0">
    {children}
  </div>
)

const GameTable = ({ gameMode }: { gameMode: Mode }) => {
  const { setMode } = useLobby()
  const navigate = useNavigate();

  const [games, setGames] = useState<{ [key: number]: ComponentValue<Schema, unknown> }>({});

  const {
    account: { account },
    setup: {
      world,
      clientModels: {
        models: { Game },
        classes: { Game: GameClass },
      },
    },
  } = useDojo();

  const [recentGame, setRecentGame] = useState<ComponentValue<Schema, unknown> | null>(null);
  const { builder } = useBuilder({ gameId: recentGame?.id, playerId: account?.address })

  useEffect(() => {
    if (!builder!) return

    if (builder.player_id === account?.address) {
      navigate("?id=" + builder.game_id, { replace: true })
    }
  }, [account?.address, builder, navigate])


  useMemo(() => {
    defineEnterSystem(world, [Has(Game)], function ({ value: [game] }: ComponentUpdate) {
      setGames((prevTiles: ComponentValue<Schema, unknown>) => game ? ({ ...prevTiles, [game.id]: new GameClass(game) }) : prevTiles);
    });
    defineSystem(world, [Has(Game)], function ({ value: [game] }: ComponentUpdate) {
      setGames((prevTiles: ComponentValue<Schema, unknown>) => game ? ({ ...prevTiles, [game.id]: new GameClass(game) }) : prevTiles);
    });

    defineSystem(world, [Has(Game)], function ({ value: [game] }: ComponentUpdate) {
      if (game) {
        setRecentGame(game)
      }
    }, { runOnInit: false });
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Tabs defaultValue={gameMode.value.toLowerCase()} onValueChange={setMode} className="w-full h-full flex flex-col">
        <TabsList className="flex-shrink-0 p-0 bg-transparent justify-start">
          {tabs.map((tab, index) => (
            <Fragment key={index}>
              <div className={`h-4 self-end border-b-[1px] border-primary ${index === (tabs.length - 1) ? "flex-grow" : "w-1 sm:w-6"}`} />
              <TabsTrigger disabled={disabledTabs.includes(tab)} value={tab} className={tabsStyles.trigger}>{tab}</TabsTrigger>
              {index === (tabs.length - 1) && <div className={`h-4 self-end border-b-[1px] border-primary w-6 hidden sm:block`} />}

            </Fragment>
          ))}
        </TabsList>
        <div className="flex-1 overflow-hidden">
          {tabs.map((tab) => (
            <TabsContent key={tab} value={tab} className={`${tabsStyles.content} h-full overflow-y-auto`}>
              <Games games={games} />
            </TabsContent>
          ))}
        </div>
        {gameMode.value !== ModeType.Tutorial && <CreateGameSliver gameMode={gameMode} />}
      </Tabs>
    </div>
  );
}

const CreateGameSliver = ({ gameMode }: { gameMode: Mode }) => (
  <div className={"w-full flex justify-between sm:justify-end h-20 border-x-[1px] border-b-[1px] border-primary bg-secondary/50 p-4"}>
    <ProfileSheet />
    <CreateGame mode={gameMode} />
  </div>
)
const InfoPanel = ({ gameMode }: { gameMode: Mode }) => (
  <div className="w-5/12 h-full z-20 bottom-0 p-4 shadow-2xl bg-primary hidden sm:flex sm:flex-col">
    <Address />
    <Player />
    <div className="flex-grow overflow-y-auto my-4 border shadow-sm bg-white/90">
      <Tournament mode={gameMode.value === ModeType.Tutorial ? new Mode(ModeType.Daily) : gameMode} />
    </div>
    <Links />
  </div>
)

const ProfileSheet = () => {
  const { gameMode } = useLobby();

  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <img src={leaderboardIcon} className="sm:hidden h-4/5 self-center" />
      </DrawerTrigger>
      <DrawerContent className="bg-primary w-full h-full flex flex-col px-2 sm:px-0">
        <DrawerHeader className="px-0">
          <DrawerTitle>
            <Address />
            <Player />
          </DrawerTitle>
          <DrawerDescription>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-grow overflow-y-auto my-4 border shadow-sm bg-white/90">
          <Tournament mode={gameMode} />
        </div>

        <DrawerFooter>
          <Links />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
