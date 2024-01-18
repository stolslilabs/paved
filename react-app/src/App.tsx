import { ThreeGrid } from "./ui/components/Three";
import { Overlay } from "./ui/modules/Overlay";
import { Initialize } from "./ui/components/Initialize";
import { ActionMenu } from "./ui/components/ActionMenu";
import { TileMenu } from "./ui/components/TileMenu";
import "./App.css";

function App() {
  return (
    <div className="relative w-screen h-screen flex flex-col">
      <main className="flex flex-col left-0 relative top-0 overflow-hidden grow">
        <Overlay />
        <div
          id="canvas-container"
          className="left-0 relative top-0 overflow-hidden grow"
        >
          <ThreeGrid />
        </div>
        <div className="absolute left-12 bottom-12">
          <ActionMenu />
        </div>
        <div className="absolute right-12 bottom-12">
          <TileMenu />
        </div>
      </main>
      <footer className="flex justify-between items-center border-2 h-20">
        <div className="flex justify-center items-center border-2 w-72 h-16">
          <div className="h-12 w-48 bg-white flex justify-center items-center border-2">
            ORDER
          </div>
          <div className="h-12 w-48 bg-white flex justify-center items-center border-2">
            SCORE
          </div>
        </div>
        <div className="flex justify-center items-center border-2 grow h-16 gap-8">
          <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
            Lo
          </div>
          <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
            La
          </div>
          <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
            Ad
          </div>
          <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
            Pa
          </div>
          <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
            Al
          </div>
          <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
            Wo
          </div>
        </div>
        <div className="flex justify-center items-center border-2 w-72 h-16">
          <div className="h-12 w-48 bg-white flex justify-center items-center border-2">
            COOLDOWN
          </div>
          <div className="h-12 w-48 bg-white flex justify-center items-center border-2">
            COUNT
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
