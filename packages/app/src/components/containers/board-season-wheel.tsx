import { useWheelPoint, type WheelState } from "../../data/season-wheel";
import { SeasonWheel } from "../elements/season-wheel";

export interface BoardSeasonWheelProps {
  state: WheelState;
  onNext: () => void;
  /** `GameScene.getDayNight` of the board's scene; none until it is up. */
  read: (() => { season: "summer" | "autumn" | "winter" | "spring"; position: number } | null) | null;
}

/**
 * The season wheel on the board (#547): reads the cycle once a second, only while the wheel is on auto (a timer, no frame of
 * its own: the scene draws what it draws). Its own lazy chunk (`board-scene.tsx`).
 */
export default function BoardSeasonWheel({ state, onNext, read }: BoardSeasonWheelProps) {
  const point = useWheelPoint(read, state === "auto");
  return <SeasonWheel state={state} point={point} onNext={onNext} />;
}
