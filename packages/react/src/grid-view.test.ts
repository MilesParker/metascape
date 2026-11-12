// SPDX-License-Identifier: EPL-2.0
import {
  Cell,
  defineModel,
  GridScape,
  Occupant,
  Scape,
  Simulation,
  type GridViewSpec,
} from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { cellAtFraction, packColor, paintGrid } from './grid-view';

class Walker extends Occupant {}

function world(): { grid: GridScape<Cell>; walkers: Scape<Walker> } {
  const holder = {} as { grid: GridScape<Cell>; walkers: Scape<Walker> };
  new Simulation(
    defineModel({
      name: 'paint',
      parameters: {},
      build(sim) {
        holder.grid = sim.addScape(new GridScape<Cell>({ name: 'grid', width: 3, height: 2 }));
        holder.walkers = sim.addScape(
          new Scape<Walker>({ name: 'walkers', size: 2, create: () => new Walker() }),
        );
      },
    }),
  );
  return holder;
}

const spec = (grid: GridScape<Cell>, extra: Partial<GridViewSpec> = {}): GridViewSpec => ({
  type: 'grid',
  title: 'test',
  grid,
  ...extra,
});

describe('paintGrid', () => {
  it('packs colours so the image bytes read back as RGBA', () => {
    const pixels = new Uint32Array(1);
    pixels[0] = packColor(0x102030);
    expect([...new Uint8Array(pixels.buffer)]).toEqual([0x10, 0x20, 0x30, 0xff]);
  });

  it('paints one pixel per cell row by row, with the background where no colour function is given', () => {
    const { grid } = world();
    const pixels = new Uint32Array(6);
    paintGrid(
      spec(grid, {
        background: 0x0000ff,
        cellColor: (cell) => (cell.x === cell.y ? 0xff0000 : 0x00ff00),
      }),
      pixels,
    );
    const red = packColor(0xff0000);
    const green = packColor(0x00ff00);
    expect([...pixels]).toEqual([red, green, green, green, red, green]);

    paintGrid(spec(grid, { background: 0x0000ff }), pixels);
    expect([...pixels]).toEqual(new Array(6).fill(packColor(0x0000ff)));
  });

  it('paints occupants over their cells, honouring hidden ones, unless asked not to', () => {
    const { grid, walkers } = world();
    const [first, second] = walkers.members as [Walker, Walker];
    first.moveTo(grid.at(1, 0)!);
    second.moveTo(grid.at(2, 1)!);
    const cellColor = () => 0xffffff;
    const occupantColor = (o: Occupant) => (o === first ? 0x112233 : undefined);
    const pixels = new Uint32Array(6);
    paintGrid(spec(grid, { cellColor, occupantColor }), pixels);
    const white = packColor(0xffffff);
    expect([...pixels]).toEqual([white, packColor(0x112233), white, white, white, white]);

    paintGrid(spec(grid, { cellColor, occupantColor }), pixels, { occupants: false });
    expect([...pixels]).toEqual(new Array(6).fill(white));
  });

  it('rejects a buffer that is too small', () => {
    const { grid } = world();
    expect(() => paintGrid(spec(grid), new Uint32Array(5))).toThrow(RangeError);
  });
});

describe('cellAtFraction', () => {
  it('finds the cell under a point and nothing outside', () => {
    const { grid } = world();
    expect(cellAtFraction(grid, 0.1, 0.1)).toBe(grid.at(0, 0));
    expect(cellAtFraction(grid, 0.9, 0.9)).toBe(grid.at(2, 1));
    expect(cellAtFraction(grid, 0.5, 0.6)).toBe(grid.at(1, 1));
    expect(cellAtFraction(grid, 1.2, 0.5)).toBeUndefined();
    expect(cellAtFraction(grid, -0.1, 0.5)).toBeUndefined();
  });
});
