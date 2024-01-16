import { PhaserLayer } from "..";
// import { filter } from "rxjs";
// import { defineRxSystem } from "@dojoengine/recs";

export function createControlsSystem(layer: PhaserLayer) {
  const {
    scenes: {
      Main: {
        input,
        camera,
      },
    },
  } = layer;

  // click-and-drag to move the camera
  // https://github.com/latticexyz/opcraft-readonly/blob/main/packages/client/src/layers/phaser/systems/createInputSystem.ts
  // defineRxSystem(
  //   world,
  //   input.pointermove$.pipe(
  //     filter(
  //       ({ pointer }) =>
  //         pointer.isDown &&
  //         pointer.downElement instanceof HTMLCanvasElement &&
  //         // ignore events when there's no currentTarget, which seems to capture when the mouse is over plugin UI
  //         !!pointer.event.currentTarget
  //     )
  //   ),
  //   ({ pointer }) => {
  //     const deltaX = (pointer.x - pointer.prevPosition.x) / camera.phaserCamera.zoom;
  //     const deltaY = (pointer.y - pointer.prevPosition.y) / camera.phaserCamera.zoom;
  //     camera.setScroll(camera.phaserCamera.scrollX - deltaX, camera.phaserCamera.scrollY - deltaY);
  //   }
  // );
  
  input.onKeyPress(
    keys => keys.has("W"),
    () => {
        camera.centerOn(100, 100);
    });

  input.onKeyPress(
    keys => keys.has("A"),
    () => {
        camera.centerOn(300, 300);
    }
  );

  input.onKeyPress(
    keys => keys.has("S"),
    () => {
        camera.centerOn(500, 500);
    }
  );

  input.onKeyPress(
    keys => keys.has("D"),
    () => {
        camera.centerOn(700, 700);
    }
  );

//   input.pointerdown$ = ('pointerdown', (pointer: any) => {
//     isDragging = true;
//     dragStart.x = pointer.x;
//     dragStart.y = pointer.y;
//   });

//   input.on('pointermove', (pointer: any) => {
//     if (isDragging) {
//       const dragEnd = { x: pointer.x, y: pointer.y };
//       const dragDistance = { x: dragEnd.x - dragStart.x, y: dragEnd.y - dragStart.y };

//       camera.centerOn(pointer.x, pointer.y);

//       dragStart.x = pointer.x;
//       dragStart.y = pointer.y;
//     }
//   });

//   input.on('pointerup', () => {
//     isDragging = false;
//   });
}