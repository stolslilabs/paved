import { store } from "../store";
import { CreateAccount } from "./CreateAccount";
import { Create } from './Create';
import { Reveal } from "./Reveal";
import { Build } from "./Build";
import { useDojo } from "./hooks/useDojo";
import { useGameIdStore } from "../store";

export const UI = () => {
    const layers = store((state) => {
        return {
            networkLayer: state.networkLayer,
            phaserLayer: state.phaserLayer,
        };
    });

    if (!layers.networkLayer || !layers.phaserLayer) return <></>;

    // TODO: must be read from a form
    const name = "OHAYO";
    const order = 1;
    // TODO: must be provided by Phaser interface
    const orientation = 1;
    const x = 0x7fffffff + 1;
    const y = 0x7fffffff;

    return (
        <div className="absolute inset-0">
            <CreateAccount />
            <div className="flex flex-col">
                <Create name={name} order={order}/>
                <Reveal />
                <Build orientation={orientation} x={x} y={y}/>
            </div>
        </div>
    );
};
