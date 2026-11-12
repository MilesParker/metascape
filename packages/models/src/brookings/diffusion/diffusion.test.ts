// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape, type Model } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import type { ActionCell } from './action-cell';
import type { ABCell } from './ab-model';
import { family } from './index';

const cellsOf = <C>(sim: Simulation) =>
  (sim.scape('cells') as GridScape<never>).members as unknown as C[];

describe('diffusion family', () => {
  it('has five uniquely named models', () => {
    expect(new Set(family.models.map((m) => m.name)).size).toBe(5);
  });

  for (const model of family.models as Model[]) {
    it(`${model.name} runs 40 ticks and is deterministic`, () => {
      const csv = (seed: number) => {
        const sim = new Simulation(model, { seed, parameters: { span: 8 } });
        expect(sim.run(40)).toBe(40);
        return sim.data.toCSV();
      };
      expect(csv(1)).toBe(csv(1));
      expect(csv(1)).not.toBe(csv(2));
    });

    it(`${model.name} only refers to recorded series`, () => {
      const sim = new Simulation(model, { seed: 1 });
      for (const view of sim.views) {
        if (view.type === 'timeSeries') for (const id of view.series) sim.data.get(id);
      }
    });
  }

  it('uses the legacy spans and defaults', () => {
    const sizes = family.models.map((m) => (m.parameters.span as { default: number }).default);
    expect(sizes).toEqual([50, 10, 10, 20, 20]);
    expect((family.models[2]!.parameters.gamma as { default: number }).default).toBe(40);
  });

  it('keeps AB all-B when beta is high, and random when beta is zero', () => {
    const high = new Simulation(family.models[0]!, { seed: 1, parameters: { span: 20, beta: 5 } });
    high.run(200);
    expect(high.data.latest('A')).toBe(0);
    const zero = new Simulation(family.models[0]!, { seed: 1, parameters: { span: 20, beta: 0 } });
    zero.run(400);
    const a = zero.data.latest('A');
    expect(a + zero.data.latest('B')).toBe(400);
    expect(a).toBeGreaterThan(140);
    expect(a).toBeLessThan(260);
    expect(cellsOf<ABCell>(zero).length).toBe(400);
  });

  it('assigns characteristics by checkerboard and half', () => {
    const sim = new Simulation(family.models[1]!, { seed: 1 });
    for (const c of cellsOf<ActionCell>(sim)) {
      if ((c.x + c.y) % 2 === 0) expect(c.characteristic).toBe('M');
      else expect(c.characteristic).toBe(c.y < 5 ? 'H' : 'L');
      expect(c.action).toBe(1);
    }
  });

  it('makes low cells choose A in ABC, since B and C pay nothing', () => {
    const sim = new Simulation(family.models[1]!, { seed: 2 });
    sim.run(400);
    for (const c of cellsOf<ActionCell>(sim)) {
      if (c.characteristic === 'L') expect(c.action).toBe(0);
      if (c.characteristic === 'M') expect(c.action).toBeLessThan(2);
    }
  });

  it('conserves cell counts across actions', () => {
    const sim = new Simulation(family.models[2]!, { seed: 3 });
    sim.run(50);
    let total = 0;
    for (const id of ['.6', '.5', '.4', '.9', '.8', '.7']) {
      total += sim.data.latest(`${id} Above`) + sim.data.latest(`${id} Below`);
    }
    expect(total).toBe(100);
  });
});
