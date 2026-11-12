// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model EpidemicPlague.metaabm.
// Original: Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { colors, defineModel, int, Scape, type Color } from '@metascape/engine';
import { epidemicCopyright, epidemicDescription } from './constants';
import { Creature } from './disease';
import { buildCity, cityParameters, type Place } from './single-city';

/** A rat: placed on a random free cell and then stationary. Drawn with an orange outline colour. */
export class Rat extends Creature {
  override color(): Color {
    return colors.orange;
  }
}

/** A flea: each period it steps toward the nearest rat within range. Drawn gray. */
export class Flea extends Creature {
  override color(): Color {
    return colors.gray;
  }

  /**
   * Flea Movement rule. Selects the nearest rat within `range` (distance is
   * Euclidean rounded to whole cells, as Ascape's `Array2DEuclidian`; ties are
   * broken at random), then moves one cell toward it if that cell is free.
   */
  move(range: number): void {
    const cell = this.cell;
    if (!cell) return;
    const grid = cell.grid;
    const limit = Math.trunc(range);
    let best = Infinity;
    let nearest: Place[] = [];
    for (const other of grid.within(cell as Place, limit)) {
      if (!(other.occupant instanceof Rat)) continue;
      const d = Math.round(Math.hypot(other.x - cell.x, other.y - cell.y));
      if (d > limit || d === 0) continue;
      if (d < best) {
        best = d;
        nearest = [other as Place];
      } else if (d === best) {
        nearest.push(other as Place);
      }
    }
    if (nearest.length === 0) return;
    const target = this.random.pick(nearest);
    // Ascape's findCellToward on a bounded 2D array: one step in each axis toward the target.
    const next = grid.at(
      cell.x + Math.sign(target.x - cell.x),
      cell.y + Math.sign(target.y - cell.y),
    );
    if (next && next.isAvailable) this.moveTo(next);
  }
}

/**
 * EpidemicPlague.metaabm: the Epidemic model with the individual count
 * defaulting to zero, plus rats that stand still and fleas that seek them. In
 * the AMP model fleas and rats have no effect on the disease.
 */
export const epidemicPlague = defineModel({
  name: 'Epidemic (AMP): Plague',
  description: `${epidemicDescription} This variant adds stationary rats and fleas that move toward the nearest rat within range; it starts with no individuals.`,
  provenance: {
    authors: 'Miles Parker',
    portedFrom: 'Eclipse AMP, EpidemicPlague.metaabm',
    copyright: epidemicCopyright,
  },
  parameters: {
    ...cityParameters({ individualCount: 0, initialInfectionProbability: 0.05 }),
    fleaCount: int(30, {
      min: 0,
      max: 2000,
      label: 'Flea Count',
      description: 'The number of fleas to create.',
    }),
    ratCount: int(40, {
      min: 0,
      max: 2000,
      label: 'Rat Count',
      description: 'The number of rats to create.',
    }),
    fleaRange: int(3, {
      min: 1,
      max: 50,
      label: 'Flea Range',
      description: 'How far a flea can see a rat, in cells.',
    }),
  },
  build(sim) {
    const p = sim.parameters;
    buildCity(sim, p, {
      addCreatures(city) {
        const fleas = sim.addScape(
          new Scape<Flea>({
            name: 'fleas',
            size: p.fleaCount,
            schedule: 'byRule',
            create: () => new Flea(),
          }),
        );
        const rats = sim.addScape(
          new Scape<Rat>({
            name: 'rats',
            size: p.ratCount,
            schedule: 'byRule',
            create: () => new Rat(),
          }),
        );
        const place = (creature: Creature): void => {
          const cell = city.randomAvailableCell();
          if (cell) creature.moveTo(cell);
        };
        fleas.addInitialRule('initialize', place);
        rats.addInitialRule('initialize', place);
        fleas.addRule('flea movement', (flea) => flea.move(p.fleaRange));
        sim.data.count(fleas, 'fleas');
        sim.data.count(rats, 'rats');
      },
    });
  },
});
