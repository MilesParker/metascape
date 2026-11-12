// SPDX-License-Identifier: EPL-2.0
import { GridScape, Simulation, type Cell, type Model } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { PdPlayer } from './demographic-pd';
import { family, pd2d, pd2dCellular, pd2dDemo, pd2dSmallWorld } from './index';

const all = [pd2d, pd2dSmallWorld, pd2dCellular, pd2dDemo];

const csv = (model: Model, seed: number, ticks: number): string => {
  const sim = new Simulation(model as never, { seed });
  sim.run(ticks);
  return sim.data.toCSV();
};

describe('Demographic PD family', () => {
  it('lists the four legacy classes with unique names and provenance', () => {
    expect(family.models).toHaveLength(4);
    expect(new Set(family.models.map((m) => m.name)).size).toBe(4);
    for (const model of family.models) {
      expect(model.provenance?.portedFrom).toMatch(/^Ascape 5\.6\.1, edu\.brook\.pd\./);
      expect(model.provenance?.citation).toMatch(/^Epstein/);
      expect(model.views).toBeUndefined();
    }
  });

  for (const model of all) {
    describe(model.name, () => {
      it('builds, has views and runs 40 ticks', () => {
        const sim = new Simulation(model as never, { seed: 1 });
        expect(sim.views.some((v) => v.type === 'grid')).toBe(true);
        expect(sim.views.some((v) => v.type === 'timeSeries')).toBe(true);
        expect(sim.run(40)).toBe(40);
      });

      it('is deterministic by seed', () => {
        expect(csv(model, 5, 40)).toBe(csv(model, 5, 40));
        expect(csv(model, 5, 40)).not.toBe(csv(model, 6, 40));
      });

      it('keeps single occupancy and the rules of death and fission', () => {
        const sim = new Simulation(model as never, { seed: 3 });
        const players = sim.scape('Players') as unknown as Iterable<PdPlayer>;
        const grid = sim.scape('Environment') as GridScape<Cell>;
        for (let t = 0; t < 40; t++) {
          sim.step();
          let n = 0;
          for (const p of players) {
            n++;
            expect(p.wealth).toBeGreaterThanOrEqual(0);
            expect(p.age).toBeLessThanOrEqual(100);
            expect(p.cell?.occupants).toEqual([p]);
          }
          let occupied = 0;
          for (const cell of grid) {
            expect(cell.occupants.length).toBeLessThanOrEqual(1);
            occupied += cell.occupants.length;
          }
          expect(occupied).toBe(n);
        }
      });
    });
  }

  it('starts with the legacy initial conditions', () => {
    const sim = new Simulation(pd2d, { seed: 1 });
    const players = [...(sim.scape('Players') as unknown as Iterable<PdPlayer>)];
    expect(players).toHaveLength(100);
    expect(players.every((p) => p.wealth === 6 && p.age >= 0 && p.age <= 100)).toBe(true);
    expect((sim.scape('Environment') as GridScape<Cell>).size).toBe(400);
    const demo = new Simulation(pd2dDemo, { seed: 1 });
    expect((demo.scape('Environment') as GridScape<Cell>).size).toBe(900);
  });

  it('removes initial agents that find no free cell', () => {
    const sim = new Simulation(pd2d, {
      seed: 1,
      parameters: { latticeWidth: 5, latticeHeight: 5, numberOfAgents: 40 },
    });
    expect((sim.scape('Players') as unknown as { size: number }).size).toBe(25);
  });

  it('conserves wealth in a single game between two players', () => {
    const sim = new Simulation(pd2d, { seed: 1, parameters: { numberOfAgents: 2 } });
    const [a, b] = [...(sim.scape('Players') as unknown as Iterable<PdPlayer>)] as [
      PdPlayer,
      PdPlayer,
    ];
    a.strategy = 0;
    b.strategy = 1;
    a.wealth = 0;
    b.wealth = 0;
    a.play(b);
    expect([a.wealth, b.wealth]).toEqual([-6, 6]);
    b.play(a);
    expect([a.wealth, b.wealth]).toEqual([-12, 12]);
  });

  it('lets cooperators survive beside defectors on the lattice (zones of cooperation)', () => {
    for (const seed of [1, 2, 3]) {
      const sim = new Simulation(pd2d, { seed });
      sim.run(300);
      expect(sim.data.latest('Cooperate')).toBeGreaterThan(20);
      expect(sim.data.latest('Defect')).toBeGreaterThan(0);
    }
  });

  it('gives PD2DCellular a bounded Moore neighborhood', () => {
    const sim = new Simulation(pd2dCellular, { seed: 1 });
    const grid = sim.scape('Environment') as GridScape<Cell>;
    expect(grid.at(0, 0)!.neighbors).toHaveLength(3);
    expect(grid.at(5, 0)!.neighbors).toHaveLength(5);
    expect(grid.at(5, 5)!.neighbors).toHaveLength(8);
  });
});
