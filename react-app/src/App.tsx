import { ThreeGrid } from "./ui/components/Three";
import { Overlay } from "./ui/modules/Overlay";
import "./App.css";

function App() {
  return (
    <div className="relative w-screen h-screen flex flex-col">
      <main className="flex flex-col left-0 relative top-0 overflow-hidden grow">
        <Overlay />
        <div
          id="canvas-container"
          className="z-10 left-0 relative top-0 overflow-hidden grow"
        >
          <ThreeGrid />
        </div>
      </main>
    </div>
  );
}

export default App;
