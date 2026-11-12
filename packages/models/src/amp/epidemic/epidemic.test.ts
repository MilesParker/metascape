// SPDX-License-Identifier: EPL-2.0
import { Simulation, type Model, type ParameterSchema } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family } from './index';
import {
  epidemic,
  epidemicContact,
  epidemicPlague,
  epidemicRegional,
  epidemicRegionalPeriods,
} from './index';
import { Individual, Status } from './disease';
import { Flea, Rat } from './plague';

const small = { cityWidth: 20, cityHeight: 20, individualCount: 150 };
const smallRegion = {
  cityCount: 3,
  regionalMapWidth: 2,
  regionalMapHeight: 2,
  individualCount: 40,
  mapWidth: 10,
  mapHeight: 10,
};

function run(
  model: Model<ParameterSchema>,
  seed: number,
  ticks: number,
  parameters: Record<string, number> = {},
) {
  const sim = new Simulation(model, { seed, parameters });
  sim.run(ticks);
  return sim;
}

const variants: [string, Model<ParameterSchema>, Record<string, number>][] = [
  ['epidemic', epidemic as unknown as Model<ParameterSchema>, small],
  [
    'contact',
    epidemicContact as unknown as Model<ParameterSchema>,
    { ...small, initialInfectionProbability: 0.05 },
  ],
  [
    'plague',
    epidemicPlague as unknown as Model<ParameterSchema>,
    { ...small, individualCount: 50, fleaCount: 10, ratCount: 10 },
  ],
  ['regional', epidemicRegional as unknown as Model<ParameterSchema>, smallRegion],
  [
    'periods',
    epidemicRegionalPeriods as unknown as Model<ParameterSchema>,
    { ...smallRegion, regionalMapWidth: 3, regionalMapHeight: 1 },
  ],
];

describe('family', () => {
  it('lists the models with unique names and provenance', () => {
    expect(family.models).toHaveLength(5);
    expect(new Set(family.models.map((m) => m.name)).size).toBe(5);
    for (const model of family.models) {
      expect(model.provenance?.portedFrom).toMatch(/^Eclipse AMP, /);
      expect(model.provenance?.authors).toBe('Miles Parker');
      expect(model.provenance?.copyright).toBeTruthy();
    }
    expect(epidemic.provenance?.copyright).toBe(
      'Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.',
    );
  });

  it('keeps the AMP default parameter values', () => {
    expect(epidemic.parameters.individualCount.default).toBe(1500);
    expect(epidemic.parameters.initialInfectionProbability.default).toBe(0.05);
    expect(epidemic.parameters.maxPeriodExposure.default).toBe(72);
    expect(epidemic.parameters.cityHeight.default).toBe(100);
    expect(epidemicContact.parameters.initialInfectionProbability.default).toBe(0.005);
    expect(epidemicPlague.parameters.individualCount.default).toBe(0);
    expect(epidemicPlague.parameters.fleaCount.default).toBe(30);
    expect(epidemicPlague.parameters.ratCount.default).toBe(40);
    expect(epidemicPlague.parameters.fleaRange.default).toBe(3);
    expect(epidemicRegional.parameters.cityCount.default).toBe(4);
    expect(epidemicRegional.parameters.maxPeriodExposure.default).toBe(48);
    expect(epidemicRegional.parameters.migrationProbability.default).toBe(0.1);
    expect(epidemicRegionalPeriods.parameters.cityCount.default).toBe(100);
    expect(epidemicRegionalPeriods.parameters.migrationProbability.default).toBe(0.0005);
  });
});

describe.each(variants)('%s', (_name, model, parameters) => {
  it('builds and runs 30 ticks with views over recorded series', () => {
    const sim = run(model, 1, 30, parameters);
    expect(sim.tick).toBe(30);
    const known = new Set(sim.data.series.map((s) => s.id));
    expect(sim.views.some((v) => v.type === 'grid')).toBe(true);
    expect(sim.views.some((v) => v.type === 'timeSeries')).toBe(true);
    for (const view of sim.views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
    }
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const csv = (seed: number) => run(model, seed, 60, parameters).data.toCSV();
    expect(csv(4)).toBe(csv(4));
    expect(csv(4)).not.toBe(csv(5));
  });
});

describe('epidemic invariants', () => {
  it('conserves the population and never puts two individuals on a cell', () => {
    const sim = new Simulation(epidemic, { seed: 2, parameters: small });
    for (let t = 0; t < 80; t++) {
      sim.step();
      expect(sim.data.latest('population')).toBe(150);
      const statuses = [
        'susceptible',
        'exposed',
        'asymptomInfectious',
        'symptomInfectious',
        'recovered',
        'dead',
      ];
      expect(statuses.reduce((a, s) => a + sim.data.latest(s), 0)).toBe(150);
    }
    const grid = sim.scape('city');
    for (const cell of grid.members) {
      expect((cell as unknown as { occupants: unknown[] }).occupants.length).toBeLessThanOrEqual(1);
    }
  });

  it('starts about initialInfectionProbability of the population exposed', () => {
    const sim = new Simulation(epidemic, {
      seed: 3,
      parameters: {
        ...small,
        individualCount: 1000,
        cityWidth: 40,
        cityHeight: 40,
        initialInfectionProbability: 0.2,
      },
    });
    const exposed = sim.data.latest('exposed');
    expect(exposed).toBeGreaterThan(140);
    expect(exposed).toBeLessThan(260);
  });

  it('spreads nothing when transmission is zero, and everyone infected stays within the rules', () => {
    const sim = new Simulation(epidemic, {
      seed: 4,
      parameters: {
        ...small,
        minContactTransmissionProbability: 0,
        maxContactTransmissionProbability: 0,
      },
    });
    const initial = sim.data.latest('susceptible');
    sim.run(100);
    const infectedEver = 150 - sim.data.latest('susceptible');
    expect(infectedEver).toBe(150 - initial);
  });

  it('lets an epidemic run through to recovered and dead individuals', () => {
    const sim = new Simulation(epidemic, {
      seed: 5,
      parameters: {
        ...small,
        initialInfectionProbability: 0.1,
        minContactTransmissionProbability: 0.3,
        maxContactTransmissionProbability: 0.4,
      },
    });
    sim.run(500);
    expect(sim.data.latest('recovered') + sim.data.latest('dead')).toBeGreaterThan(30);
    expect(sim.data.latest('dead')).toBeGreaterThan(0);
  });

  it('draws exposure, asymptomatic and infection periods in order', () => {
    const sim = new Simulation(epidemic, {
      seed: 6,
      parameters: { ...small, initialInfectionProbability: 1 },
    });
    const people = sim.scape('individuals').members as readonly Individual[];
    for (const p of people) {
      expect(p.status).toBe(Status.exposed);
      expect(p.exposureEndPeriod).toBeGreaterThanOrEqual(24);
      expect(p.exposureEndPeriod).toBeLessThanOrEqual(72);
      expect(p.asymptomaticEndPeriod).toBeGreaterThanOrEqual(p.exposureEndPeriod + 24);
      expect(p.outcomePeriod).toBeGreaterThanOrEqual(p.asymptomaticEndPeriod + 24);
    }
  });
});

describe('contact', () => {
  it('records the infections as directed contacts', () => {
    const sim = run(epidemicContact as unknown as Model<ParameterSchema>, 7, 150, {
      ...small,
      initialInfectionProbability: 0.05,
      minContactTransmissionProbability: 0.3,
      maxContactTransmissionProbability: 0.4,
    });
    expect(sim.data.latest('contacts')).toBeGreaterThan(5);
  });
});

describe('plague', () => {
  it('starts with no individuals by default and keeps creatures on distinct cells', () => {
    const sim = new Simulation(epidemicPlague, {
      seed: 1,
      parameters: { cityWidth: 20, cityHeight: 20 },
    });
    expect(sim.data.latest('population')).toBe(0);
    expect(sim.data.latest('fleas')).toBe(30);
    expect(sim.data.latest('rats')).toBe(40);
    const rats = [...(sim.scape('rats').members as readonly Rat[])];
    const before = rats.map((r) => r.cell);
    sim.run(30);
    expect(rats.map((r) => r.cell)).toEqual(before);
    for (const cell of sim.scape('city').members) {
      expect((cell as unknown as { occupants: unknown[] }).occupants.length).toBeLessThanOrEqual(1);
    }
  });

  it('moves a flea toward a rat within range', () => {
    const sim = new Simulation(epidemicPlague, {
      seed: 1,
      parameters: { cityWidth: 20, cityHeight: 20, fleaCount: 1, ratCount: 1, fleaRange: 50 },
    });
    const flea = sim.scape('fleas').members[0] as Flea;
    const rat = sim.scape('rats').members[0] as Rat;
    const dist = () =>
      Math.max(Math.abs(flea.cell!.x - rat.cell!.x), Math.abs(flea.cell!.y - rat.cell!.y));
    const start = dist();
    sim.step();
    if (start > 1) expect(dist()).toBe(start - 1);
    else expect(dist()).toBe(1);
  });
});

describe('regional', () => {
  it('makes exactly one origin city and migrates individuals between cities', () => {
    const sim = new Simulation(epidemicRegional, {
      seed: 8,
      parameters: { ...smallRegion, migrationProbability: 0.3, initialInfectionProbability: 0.3 },
    });
    expect(sim.data.latest('population')).toBe(120);
    const before = [0, 1, 2].map((i) => sim.scape(`city ${i} individuals`).size);
    expect(before).toEqual([40, 40, 40]);
    sim.run(40);
    expect(sim.data.latest('population')).toBe(120);
    const after = [0, 1, 2].map((i) => sim.scape(`city ${i} individuals`).size);
    expect(after.reduce((a, b) => a + b, 0)).toBe(120);
    expect(after).not.toEqual(before);
    for (const i of [0, 1, 2]) {
      const grid = sim.scape(`city ${i} map`);
      for (const cell of grid.members) {
        expect((cell as unknown as { occupants: unknown[] }).occupants.length).toBeLessThanOrEqual(
          1,
        );
      }
    }
  });

  it('keeps individuals in place when migration is off, and starts infection in one city only', () => {
    const sim = new Simulation(epidemicRegional, {
      seed: 9,
      parameters: { ...smallRegion, migrationProbability: 0, initialInfectionProbability: 0.5 },
    });
    const counts = [0, 1, 2].map((i) =>
      sim.scape(`city ${i} individuals`).count((a) => (a as Individual).status === Status.exposed),
    );
    expect(counts.filter((c) => c > 0)).toHaveLength(1);
    sim.run(20);
    expect([0, 1, 2].map((i) => sim.scape(`city ${i} individuals`).size)).toEqual([40, 40, 40]);
  });

  it('stops the periods variant at its stop period', () => {
    const sim = new Simulation(epidemicRegionalPeriods, {
      seed: 1,
      parameters: {
        ...smallRegion,
        regionalMapWidth: 3,
        regionalMapHeight: 1,
        individualCount: 3,
        mapWidth: 4,
        mapHeight: 4,
      },
    });
    sim.run(5000);
    expect(sim.tick).toBe(3000);
    expect(sim.stopped).toBe(true);
  });
});
