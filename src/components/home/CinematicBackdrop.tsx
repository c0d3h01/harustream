'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';

function CinematicScene() {
  const mesh = useRef<Mesh>(null);
  useFrame((state, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += delta * 0.035;
    mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.18) * 0.025;
  });

  return (
    <mesh ref={mesh} position={[1.5, 0, -2]} rotation={[0, -0.25, 0]}>
      <planeGeometry args={[7, 4]} />
      <meshBasicMaterial color="#152436" transparent opacity={0.22} />
    </mesh>
  );
}

export function CinematicBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 42 }}
        dpr={[1, 1.25]}
        gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
        frameloop="always"
      >
        <CinematicScene />
      </Canvas>
    </div>
  );
}
