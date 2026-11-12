// SPDX-License-Identifier: EPL-2.0
import { experimentRuns, Simulation, type Model } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import {
  HouseholdAggregate,
  HouseholdDisaggregate,
  type HouseholdBase,
  type Person,
} from './households';
import { family, lhv, lhvClan, lhvDisaggregate, lhvGreedy, lhvRmsExperiment } from './index';
import { RANK_COUNT, type Location, type Settlement } from './valley';

const series = (sim: Simulation, id: string): number[] => [...sim.data.values(id)];

describe('family', () => {
  it('lists the four runnable legacy models with provenance', () => {
    expect(family.models.map((m) => m.name)).toEqual([
      lhv.name,
      lhvGreedy.name,
      lhvDisaggregate.name,
      lhvClan.name,
    ]);
    for (const model of family.models) {
      expect(model.provenance?.portedFrom).toMatch(/^Ascape 5\.6\.1, edu\.brook\.aa\.LHV/);
      expect(model.provenance?.citation).toContain('PNAS');
    }
  });
  it('uses the full Ascape rank table', () => {
    expect(RANK_COUNT).toBe(135);
  });
});

describe.each(family.models.map((m) => [m.name, m] as const))('%s', (_name, model: Model) => {
  it('builds and runs 20 years', () => {
    const sim = new Simulation(model, { seed: 7 });
    expect(sim.run(20)).toBe(20);
    expect(sim.data.latest('year')).toBe(820);
    expect(series(sim, 'historicHouseholds')[0]).toBe(14);
  });
});

describe('determinism', () => {
  it('repeats a run for the same seed and differs for another', () => {
    const run = (seed: number, model: Model = lhv) => {
      const sim = new Simulation(model, { seed });
      sim.run(80);
      return series(sim, 'households');
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
    expect(run(5, lhvDisaggregate)).toEqual(run(5, lhvDisaggregate));
  });
});

function checkLandscape(sim: Simulation): void {
  const valley = sim.scape('valley') as unknown as Iterable<Location>;
  const households = sim.scape('households').members as readonly HouseholdBase[];
  const settlements = sim.scape('settlements').members as readonly Settlement[];
  const farmed = new Set<Location>();
  for (const household of households) {
    expect(household.settlement).not.toBeNull();
    expect(household.settlement!.alive).toBe(true);
    expect(household.settlement!.households).toContain(household);
    expect(household.farms.length).toBeGreaterThan(0);
    for (const farm of household.farms) {
      expect(farm.location!.farm).toBe(farm);
      expect(farmed.has(farm.location!)).toBe(false);
      farmed.add(farm.location!);
    }
    for (const stock of household.agedCornStocks) expect(stock).toBeGreaterThanOrEqual(0);
  }
  let settled = 0;
  for (const settlement of settlements) {
    expect(settlement.size).toBeGreaterThan(0);
    expect(settlement.location!.settlement).toBe(settlement);
    expect(settlement.cell).toBe(settlement.location);
    settled += settlement.size;
  }
  expect(settled).toBe(households.length);
  for (const location of valley) {
    if (location.farm) expect(location.settlement).toBeNull();
    if (location.farm || location.settlement) expect(location.onMap).toBe(true);
  }
}

describe('invariants', () => {
  it('aggregate households each work one farm and live in one settlement', () => {
    const sim = new Simulation(lhv, { seed: 11 });
    for (let i = 0; i < 6; i++) {
      sim.run(40);
      checkLandscape(sim);
      for (const h of sim.scape('households').members as readonly HouseholdAggregate[]) {
        expect(h).toBeInstanceOf(HouseholdAggregate);
        expect(h.farms).toHaveLength(1);
        expect(h.age).toBeLessThanOrEqual(h.deathAge);
      }
    }
    expect(series(sim, 'difference')).toEqual(
      series(sim, 'households').map((h, i) => h - series(sim, 'historicHouseholds')[i]!),
    );
  });

  it('people live in their household and marriages are mutual', () => {
    const sim = new Simulation(lhvDisaggregate, { seed: 12 });
    for (let i = 0; i < 4; i++) {
      sim.run(25);
      checkLandscape(sim);
      const households = sim.scape('households').members as readonly HouseholdDisaggregate[];
      let members = 0;
      for (const h of households) {
        expect(h.members.length).toBeGreaterThan(0);
        expect(h.farms.length).toBeLessThanOrEqual(12);
        members += h.members.length;
      }
      const people = sim.scape('people').members as readonly Person[];
      expect(members).toBe(people.length);
      for (const person of people) {
        expect(person.household!.alive).toBe(true);
        expect(person.household!.members).toContain(person);
        expect(person.age).toBeLessThan(46);
        if (person.mate) {
          expect(person.mate.mate).toBe(person);
          expect(person.mate.female).not.toBe(person.female);
        }
      }
    }
  });
});

describe('stop year', () => {
  it('stops at the stop year', () => {
    const sim = new Simulation(lhvClan, { seed: 1, parameters: { stopYear: 815 } });
    expect(sim.run(1000)).toBe(15);
    expect(sim.stopped).toBe(true);
  });
});

describe('growth and collapse (AD 800-1350)', () => {
  it('simulated households grow with the record and decline as it collapses around 1300', () => {
    const sim = new Simulation(lhv, { seed: 2026 });
    expect(sim.run(1000)).toBe(550);
    const year = series(sim, 'year');
    const simulated = series(sim, 'households');
    const historic = series(sim, 'historicHouseholds');
    expect(year[0]).toBe(800);
    expect(year.at(-1)).toBe(1350);
    const at = (s: number[], y: number): number => s[y - 800]!;
    // The record grows to a peak of 216 households in 1269 and is empty from 1300.
    expect(Math.max(...historic)).toBe(216);
    expect(at(historic, 1269)).toBe(216);
    for (let y = 1300; y <= 1350; y++) expect(at(historic, y)).toBe(0);
    // The simulation grows with it ...
    expect(at(simulated, 800)).toBe(14);
    expect(at(simulated, 1000)).toBeGreaterThan(at(simulated, 900));
    expect(at(simulated, 1050)).toBeGreaterThan(5 * at(simulated, 800));
    const peak = Math.max(...simulated);
    const peakYear = 800 + simulated.indexOf(peak);
    expect(peakYear).toBeGreaterThan(1000);
    expect(peakYear).toBeLessThan(1270);
    // ... and declines in the drought after 1250, though (as the authors report) not to zero.
    expect(at(simulated, 1300)).toBeLessThan(0.75 * at(simulated, 1250));
    expect(at(simulated, 1350)).toBeLessThan(0.5 * peak);
  });
});

describe('calibration harnesses', () => {
  it('express LHVRMS as a linked parameter sweep', () => {
    const runs = experimentRuns(lhv, { ...lhvRmsExperiment, maxTicks: 10 });
    const first = runs.next().value!;
    expect(first).toMatchObject({
      minFertilityAge: 13,
      maxFertilityAge: 19,
      minFertilityEndsAge: 26,
      maxFertilityEndsAge: 34,
      minFertility: 0.09,
      maxFertility: 0.16,
      minDeathAge: 26,
      maxDeathAge: 34,
      ticks: 10,
    });
    expect(Number.isFinite(first.rms)).toBe(true);
    expect(lhvRmsExperiment.parameters?.minFertility).toHaveLength(15);
    expect(lhvRmsExperiment.parameters?.maxFertility?.at(-1)).toBe(0.125);
  });
});
