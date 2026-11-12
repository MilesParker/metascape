// SPDX-License-Identifier: EPL-2.0
import {
  Random,
  runExperiment,
  Simulation,
  type Cell,
  type GridScape,
  type Model,
} from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { Chromosome } from './chromosome';
import {
  family,
  pd2dga,
  pd2dgaClosest,
  pd2dgaFurthest,
  pd2dgaMulti,
  pd2dgaMultiDesign,
  pd2dgaMultiple,
  pd2dgaMultipleDesign,
  pd2dgaMultipleTo,
  pd2dgaMultipleToDesign,
  pd2dgaPreference,
} from './index';
import { genomeColor, type GaPlayer } from './spatial-ipd';

const make = (model: Model, seed: number, parameters: Record<string, number> = {}) =>
  new Simulation(model as never, { seed, parameters: parameters as never });
const csv = (model: Model, seed: number, ticks: number): string => {
  const sim = make(model, seed);
  sim.run(ticks);
  return sim.data.toCSV();
};
const playersOf = (sim: Simulation) => [...(sim.scape('Players') as unknown as Iterable<GaPlayer>)];

describe('Chromosome', () => {
  it('crosses over a prefix, keeping the genes between the two', () => {
    const a = new Chromosome(5);
    const b = new Chromosome(5);
    b.encoding.fill(1);
    a.crossover(b, 2);
    expect(a.toString()).toBe('DDCCC');
    expect(b.toString()).toBe('CCDDD');
    a.crossover(b, 0);
    expect(a.toString()).toBe('DDCCC');
  });

  it('measures Hamming distance as a share and mutates by probability', () => {
    const a = new Chromosome(4);
    const b = new Chromosome(4);
    b.encoding.set([1, 1, 0, 0]);
    expect(a.hammingDistance(b)).toBe(0.5);
    const random = new Random(1);
    a.mutate(random, 0);
    expect(a.toString()).toBe('CCCC');
    a.mutate(random, 1);
    expect(a.toString()).toBe('DDDD');
  });
});

describe('Spatial IPD (GA) family', () => {
  it('lists the legacy classes with unique names and provenance', () => {
    expect(family.models).toHaveLength(8);
    expect(new Set(family.models.map((m) => m.name)).size).toBe(8);
    for (const model of family.models) {
      expect(model.provenance?.authors).toBe('Miles T. Parker');
      expect(model.provenance?.citation).toBeUndefined();
      expect(model.provenance?.copyright).toBe('Copyright 2000 Miles T. Parker.');
    }
  });

  for (const model of family.models) {
    describe(model.name, () => {
      it('builds with views and runs 30 ticks', () => {
        const sim = make(model, 1);
        expect(sim.views.some((v) => v.type === 'grid')).toBe(true);
        expect(sim.views.some((v) => v.type === 'timeSeries')).toBe(true);
        sim.run(30);
        expect(sim.tick).toBeGreaterThan(0);
      });

      it('is deterministic by seed', () => {
        expect(csv(model, 1, 30)).toBe(csv(model, 1, 30));
        expect(csv(model, 1, 30)).not.toBe(csv(model, 2, 30));
      });
    });
  }

  it('starts with the legacy initial conditions', () => {
    const sim = make(pd2dga, 1);
    const players = playersOf(sim);
    expect(players).toHaveLength(100);
    expect((sim.scape('Environment') as GridScape<Cell>).size).toBe(400);
    for (const p of players) {
      expect(p.strategies.encoding).toHaveLength(7);
      expect(p.wealth).toBe(6);
    }
    expect(sim.parameters).toMatchObject({
      payoffCC: 3,
      payoffCD: -5,
      payoffDC: 6,
      payoffDD: -2,
      fissionWealth: 20,
      mutationRate: 0,
      mutationProbability: 0.01,
      crossoverProbability: 0.01,
      memorySize: 1,
      trackAll: 0,
    });
  });

  it('keeps genes binary, histories in range and cells single-occupied', () => {
    for (const memorySize of [1, 2]) {
      const sim = make(pd2dga, 4, { memorySize });
      const length = 4 ** memorySize + 2 * memorySize + 1;
      for (let t = 0; t < 40; t++) {
        sim.step();
        for (const p of playersOf(sim)) {
          expect(p.strategies.encoding).toHaveLength(length);
          expect(p.strategies.encoding.every((g) => g === 0 || g === 1)).toBe(true);
          expect(p.cell?.occupants).toEqual([p]);
          if (p.playRecord) expect(p.playRecord.played).toBeLessThan(4 ** memorySize);
        }
      }
    }
  });

  it('shares play records with the parent after fission (legacy clone quirk)', () => {
    const sim = make(pd2dga, 1, { initialWealth: 30, numberOfAgents: 30 });
    sim.run(3);
    const players = playersOf(sim);
    const parentsRecords = new Set(players.map((p) => p.playRecord).filter(Boolean));
    expect(parentsRecords.size).toBeLessThan(players.filter((p) => p.playRecord).length);
  });

  it('runs with all partners tracked in one shared table', () => {
    const sim = make(pd2dga, 3, { trackAll: 1 });
    sim.run(30);
    expect(playersOf(sim).length).toBeGreaterThan(0);
  });

  it('selects the play rules of each variant, in the legacy rule order', () => {
    const enabled = (model: Model) =>
      (make(model, 1).scape('Players').rules as { rule: { name: string }; enabled: boolean }[])
        .filter((r) => r.enabled)
        .map((r) => r.rule.name);
    expect(enabled(pd2dga)).toEqual([
      'Random Walk',
      'Play Random Neighbor',
      'Fissioning',
      'Update',
      'Death',
      'Crossover',
      'Mutation',
    ]);
    expect(enabled(pd2dgaClosest)).toContain('Play Closest');
    expect(enabled(pd2dgaClosest)).not.toContain('Play Random Neighbor');
    expect(enabled(pd2dgaFurthest)).toContain('Play Furthest');
    expect(enabled(pd2dgaPreference)).toContain('Play Preference');
    expect(enabled(pd2dgaMultiple)).toEqual(
      expect.arrayContaining(['Play Random Neighbor', 'Play Preference']),
    );
    expect(enabled(pd2dgaMultipleTo)).toEqual(
      expect.arrayContaining(['Play Random Neighbor', 'Play Closest']),
    );
    expect(enabled(pd2dgaMulti)).toEqual(enabled(pd2dga));
    expect(make(pd2dgaPreference, 1).views.length).toBe(make(pd2dga, 1).views.length + 1);
  });

  it('plays the most similar neighbor when closest, the least similar when furthest', () => {
    const sim = make(pd2dgaClosest, 2, { numberOfAgents: 200 });
    const centre = playersOf(sim).find((p) => p.neighboringOccupants().length >= 2)!;
    const [near, far] = centre.neighboringOccupants() as GaPlayer[];
    centre.strategies.encoding.fill(0);
    near!.strategies.encoding.fill(0);
    far!.strategies.encoding.fill(1);
    for (const n of centre.neighboringOccupants() as GaPlayer[]) {
      if (n !== near && n !== far) n.strategies.encoding.fill(1);
    }
    const chosen: unknown[] = [];
    centre.play = (partner) => chosen.push(partner);
    centre.playClosest();
    expect(chosen).toEqual([near]);
    chosen.length = 0;
    far!.strategies.encoding.fill(1);
    centre.playFurthest();
    expect(chosen[0]).not.toBe(near);
    expect((chosen[0] as GaPlayer).strategies.encoding.every((g) => g === 1)).toBe(true);
  });

  it('closest play sustains a population that furthest play loses', () => {
    const total = (model: Model) =>
      [1, 2, 3].reduce((sum, seed) => {
        const sim = make(model, seed);
        sim.run(300);
        return sum + sim.scape('Players').size;
      }, 0);
    expect(total(pd2dgaClosest)).toBeGreaterThan(total(pd2dgaFurthest));
  });

  it('gives genomes deterministic colours', () => {
    expect(genomeColor('CDCD')).toBe(genomeColor('CDCD'));
    expect(genomeColor('CDCD')).not.toBe(genomeColor('DDDD'));
  });
});

describe('batch harnesses as experiments', () => {
  it('runs the PD2DGAMultiple sweep (reduced)', () => {
    const rows = runExperiment(
      pd2dgaMultiple as never,
      pd2dgaMultipleDesign({ replicates: 2, maxTicks: 40 }) as never,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ memorySize: 1, ticks: 40 });
    expect(rows[0]).toHaveProperty('cooperateRatio');
    expect(pd2dgaMultipleDesign().replicates).toBe(35);
    expect(pd2dgaMultipleDesign().maxTicks).toBe(1000);
  });

  it('stops PD2DGAMultipleTo runs at extinction', () => {
    const rows = runExperiment(
      pd2dgaMultipleTo as never,
      pd2dgaMultipleToDesign({ replicates: 2, maxTicks: 500 }) as never,
    );
    expect(rows.length).toBe(2);
    const sim = make(pd2dgaMultipleTo, 1, { deathAge: 2 });
    sim.run(500);
    expect(sim.stopReason).toBe('extinct');
    expect(sim.scape('Players').size).toBe(0);
    expect(sim.tick).toBeLessThan(500);
  });

  it('ranks the commonest genomes for PD2DGAMulti', () => {
    const rows = runExperiment(
      pd2dgaMulti as never,
      pd2dgaMultiDesign({ replicates: 1, maxTicks: 20 }, 3) as never,
    );
    const row = rows[0] as Record<string, unknown>;
    expect(typeof row.genome0).toBe('string');
    expect(row.count0 as number).toBeGreaterThanOrEqual(row.count1 as number);
    expect(row.count1 as number).toBeGreaterThanOrEqual(row.count2 as number);
  });
});
