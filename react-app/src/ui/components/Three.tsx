import * as THREE from "three";
import { useMemo, useRef, useState } from "react";
import { Canvas, extend } from "@react-three/fiber";

import {
  OrbitControls,
  PerspectiveCamera,
  MapControls,
  Bounds,
} from "@react-three/drei";
import { useDojo } from "@/dojo/useDojo";
extend({ OrbitControls });

const createSquareGeometry = (size: any) => {
  const shape = new THREE.Shape();
  shape.moveTo(-size / 2, -size / 2);
  shape.lineTo(size / 2, -size / 2);
  shape.lineTo(size / 2, size / 2);
  shape.lineTo(-size / 2, size / 2);
  shape.lineTo(-size / 2, -size / 2);
  shape.closePath();

  return new THREE.ShapeGeometry(shape);
};

const Square = ({ position, size, col, row }: any) => {
  const {
    setup: {
      clientComponents: { Position, Base },
    },
  } = useDojo();

  const meshRef = useRef<any>();

  const [lineThickness, setLineThickness] = useState(1);
  const [lineColor, setLineColor] = useState("gray");
  const [backgroundColor, setBackgroundColor] = useState("white");
  const [linePosition, setLinePosition] = useState(position);

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);

  return (
    <>
      <mesh
        onPointerEnter={() => {
          setLineThickness(2);
          setLineColor("black");
          setBackgroundColor("lightgray");
        }}
        onPointerLeave={() => {
          setLineThickness(1);
          setLineColor("gray");
          setBackgroundColor("white");
        }}
        ref={meshRef}
        position={position}
        geometry={squareGeometry}
      >
        <meshStandardMaterial color={backgroundColor} />
      </mesh>
      <lineSegments
        geometry={new THREE.EdgesGeometry(squareGeometry)}
        material={
          new THREE.LineBasicMaterial({
            color: lineColor,
            linewidth: lineThickness,
          })
        }
        position={linePosition}
      />
    </>
  );
};

const SquareGrid = ({ rows, cols, squareSize }: any) => {
  const squares = [];
  const squareWidth = squareSize;
  const squareHeight = squareSize;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * squareWidth;
      const y = row * squareHeight;
      squares.push(
        <Square
          key={`${row}-${col}`}
          position={[x, y, 0]}
          size={squareSize}
          col={col}
          row={row}
        />
      );
    }
  }
  return <>{squares}</>;
};
export const ThreeGrid = () => {
  return (
    <Canvas className="z-1" shadows>
      <mesh>
        <PerspectiveCamera
          makeDefault
          position={[25, 270, 270]}
          zoom={2}
          aspect={1.77}
          near={3}
          far={3}
        />
        <MapControls makeDefault target={[0, 0, 0]} />
        <ambientLight color={"white"} intensity={1} />
        <pointLight
          rotation={[Math.PI / -2, 0, 0]}
          position={[10, 20, 10]}
          intensity={20}
        />
        <mesh rotation={[Math.PI / -2, 0, 0]}>
          <Bounds fit clip observe margin={1}>
            <SquareGrid rows={30} cols={30} squareSize={3} />
          </Bounds>
        </mesh>
      </mesh>
    </Canvas>
  );
};
