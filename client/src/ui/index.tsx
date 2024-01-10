import { store } from "../store";
import { CreateAccount } from "./CreateAccount";
import { Create } from "./Create";
import { Buy } from "./Buy";
import { Draw } from "./Draw";
import { Discard } from "./Discard";
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
    const x = 2;
    const y = 2;

    return (
        <div className="absolute inset-0">
            <CreateAccount />
            <div className="flex flex-col">
                <Create name={name} order={order} />
                <Buy />
                <Draw />
                <Discard />
                <Build orientation={orientation} x={x} y={y} />
            </div>
        </div>
    );
};
