import "./App.css";
import { useDojo } from "./dojo/useDojo";
import { ThreeGrid } from "./ui/components/Three";
import { Overlay } from "./ui/modules/Overlay";

function App() {
  const {
    setup: {
      client: { game_lobby, spawn },
    },
  } = useDojo();

  return (
    <div
      id="canvas-container"
      className="left-0 relative top-0 w-screen h-screen overflow-hidden"
    >
      <Overlay />
      <ThreeGrid />
    </div>
  );
}

export default App;
