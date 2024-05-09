import * as THREE from "three";
import { offset, other_offset } from "@/dojo/game";
import { useMemo, useRef, useState } from "react";
import { useGameStore } from "@/store";
import { useGLTF } from "@react-three/drei";

export const loader = new THREE.TextureLoader();

export const createSquareGeometry = (size: any) => {
  return new THREE.BoxGeometry(size, size, 0.1);
};

export const TileTexture = ({ tile, size }: any) => {
  const meshRef = useRef<any>();
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const { setHoveredTile } = useGameStore();

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);
  const position = useMemo(() => {
    const row = tile ? tile.y - offset + other_offset : 0;
    const col = tile ? tile.x - offset + other_offset : 0;
    return getSquarePosition({ row, col, squareSize: size });
  }, [tile, size]);

  useMemo(() => {
    if (tile) {
      const rotation = (Math.PI / 2) * (1 - tile.orientation.into());
      const image = tile.getImage();
      loader.load(image, (loadedTexture) => {
        loadedTexture.center.set(0.5, 0.5);
        loadedTexture.rotation = rotation;
        setTexture(loadedTexture);
      });
    } else {
      setTexture(undefined);
    }
  }, [tile]);

  const handlePointerEnter = () => {
    const col = tile ? tile?.y - offset + other_offset : 0;
    const row = tile ? tile?.x - offset + other_offset : 0;
    setHoveredTile({ col, row });
  };

  const models = useMemo(() => {
    return {
      1: useGLTF("/models/ccccccccc.glb").scene.clone(),
      2: useGLTF("/models/cccccfffc.glb").scene.clone(),
      3: useGLTF("/models/cccccfrfc.glb").scene.clone(),
      4: useGLTF("/models/cfffcfffc.glb").scene.clone(),
      5: useGLTF("/models/ffcfffcff.glb").scene.clone(),
      6: useGLTF("/models/ffcfffffc.glb").scene.clone(),
      7: useGLTF("/models/ffffcccff.glb").scene.clone(),
      8: useGLTF("/models/ffffffcff.glb").scene.clone(),
      9: useGLTF("/models/rfffrfcfr.glb").scene.clone(),
      10: useGLTF("/models/rfffrfffr.glb").scene.clone(),
      11: useGLTF("/models/rfrfcccfr.glb").scene.clone(),
      12: useGLTF("/models/rfrfffcfr.glb").scene.clone(),
      13: useGLTF("/models/rfrfffffr.glb").scene.clone(),
      14: useGLTF("/models/rfrfrfcff.glb").scene.clone(),
      15: useGLTF("/models/sfrfrfcfr.glb").scene.clone(),
      16: useGLTF("/models/sfrfrfffr.glb").scene.clone(),
      17: useGLTF("/models/sfrfrfrfr.glb").scene.clone(),
      18: useGLTF("/models/wffffffff.glb").scene.clone(),
      19: useGLTF("/models/wfffffffr.glb").scene.clone(),
    };
  }, []);

  console.log(tile.id);

  return (
    <group
      key={`tile-${tile.id}`}
      scale={0.77}
      rotation={[Math.PI / 2, 0, 0]}
      position={[position.x + 0.03, position.y - 0.03, 0.4]}
    >
      <primitive
        position={[0, 0, 0]}
        object={models[tile.plan.into() as keyof typeof models]}
        rotation={[0, (Math.PI / 2) * (1 - tile.orientation.into()), 0]}
      />
    </group>
  );
};

export const getSquarePosition = ({
  row,
  col,
  squareSize,
}: {
  row: number;
  col: number;
  squareSize: number;
}) => {
  const x = col * squareSize;
  const y = row * squareSize;
  return { x, y };
};

const getModelPath = (id: number) => {
  switch (id) {
    case 1:
      return "/models/ccccccccc.glb";
    case 2:
      return "/models/cccccfffc.glb";
    case 3:
      return "/models/cccccfrfc.glb";
    case 4:
      return "/models/cfffcfffc.glb";
    case 5:
      return "/models/ffcfffcff.glb";
    case 6:
      return "/models/ffcfffffc.glb";
    case 7:
      return "/models/ffffcccff.glb";
    case 8:
      return "/models/ffffffcff.glb";
    case 9:
      return "/models/rfffrfcfr.glb";
    case 10:
      return "/models/rfffrfffr.glb";
    case 11:
      return "/models/rfrfcccfr.glb";
    case 12:
      return "/models/rfrfffcfr.glb";
    case 13:
      return "/models/rfrfffffr.glb";
    case 14:
      return "/models/rfrfrfcff.glb";
    case 15:
      return "/models/sfrfrfcfr.glb";
    case 16:
      return "/models/sfrfrfffr.glb";
    case 17:
      return "/models/sfrfrfrfr.glb";
    case 18:
      return "/models/wffffffff.glb";
    case 19:
      return "/models/wfffffffr.glb";
    default:
      return "/models/ccccccccc.glb";
  }
};

// export const getImage = (tile: any) => {
//   switch (tile?.plan) {
//     case 1:
//       return ccccccccc;
//     case 2:
//       return cccccfffc;
//     case 3:
//       return cccccfrfc;
//     case 4:
//       return cfffcfffc;
//     case 5:
//       return ffcfffcff;
//     case 6:
//       return ffcfffffc;
//     case 7:
//       return ffffcccff;
//     case 8:
//       return ffffffcff;
//     case 9:
//       return rfffrfcfr;
//     case 10:
//       return rfffrfffr;
//     case 11:
//       return rfrfcccfr;
//     case 12:
//       return rfrfffcfr;
//     case 13:
//       return rfrfffffr;
//     case 14:
//       return rfrfrfcff;
//     case 15:
//       return sfrfrfcfr;
//     case 16:
//       return sfrfrfffr;
//     case 17:
//       return sfrfrfrfr;
//     case 18:
//       return wffffffff;
//     case 19:
//       return wfffffffr;
//     default:
//       return zero;
//   }
// };
