// SPDX-License-Identifier: EPL-2.0
import { Random } from '@metascape/engine';
import { useEffect, useRef, useState } from 'react';

const SIZE = 480;
const WALKERS = 200;
const STEPS = 400;

/** Draws seeded random walks: the same seed always paints the same picture. */
function drawWalks(context: CanvasRenderingContext2D, seed: string): void {
  const random = new Random(seed);
  context.clearRect(0, 0, SIZE, SIZE);
  for (let walker = 0; walker < WALKERS; walker++) {
    let x = SIZE / 2;
    let y = SIZE / 2;
    context.strokeStyle = `hsl(${random.int(0, 360)} 70% 50% / 0.35)`;
    context.beginPath();
    context.moveTo(x, y);
    for (let step = 0; step < STEPS; step++) {
      x += random.int(-3, 4);
      y += random.int(-3, 4);
      context.lineTo(x, y);
    }
    context.stroke();
  }
}

export function App() {
  const [seed, setSeed] = useState('metascape');
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context) drawWalks(context, seed);
  }, [seed]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem auto', width: SIZE }}>
      <h1>Metascape Studio</h1>
      <p>
        Scaffold check: {WALKERS} random walks drawn from the engine&apos;s seeded generator. The
        same seed always gives the same picture.
      </p>
      <label>
        Seed <input value={seed} onChange={(event) => setSeed(event.target.value)} />
      </label>
      <canvas ref={canvas} width={SIZE} height={SIZE} style={{ display: 'block', marginTop: 16 }} />
    </main>
  );
}
