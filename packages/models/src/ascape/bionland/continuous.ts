// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.examples.bionland.Model_Q (with its inner classes
// Bion, RedBion, OrangeBion, BlueBion and the move rules), and the Ascape core space
// org.ascape.model.space.Continuous2D (moveToward, moveAway, normalize, distance).
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  bool,
  type Color,
  Continuous2D,
  continuousView,
  defineModel,
  int,
  LocatedAgent,
  Scape,
  Singleton,
  stat,
  timeSeriesView,
} from '@metascape/engine';
import { BIONLAND_COPYRIGHT, SPECIES, SPECIES_COLORS } from './lattice-model';

/** A bion in continuous space, with its own vision and speed. */
export class FreeBion extends LocatedAgent {
  vision = 0;
  velocity = 0;

  constructor(
    readonly species: number,
    private readonly ranges: {
      minVision: number;
      maxVision: number;
      minVelocity: number;
      maxVelocity: number;
    },
  ) {
    super();
  }

  override initialize(): void {
    this.vision = this.random.int(this.ranges.minVision, this.ranges.maxVision + 1);
    this.velocity = this.random.int(this.ranges.minVelocity, this.ranges.maxVelocity + 1);
  }
}

/** Ascape's tolerance for treating two data values as equal. */
function nearlyEqual(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs((a - b) / (a + b)) < 1e-9 || Math.abs(a - b) < 1e-9;
}

/**
 * The territory: one continuous space holding all three species. Ascape
 * iterates each species' scape in turn (red, then orange, then blue), each in
 * a fresh random order; {@link Territory.iterateSpecies} does the same.
 */
export class Territory extends Continuous2D<FreeBion> {
  /** The nearest other bion of a species within `vision`; a random one among equally near. */
  nearestOfSpecies(origin: FreeBion, species: number): FreeBion | undefined {
    let best = Number.MAX_VALUE;
    let ties: FreeBion[] = [];
    let found: FreeBion | undefined;
    for (const other of this.members) {
      if (other.species !== species || other === origin) continue;
      // Ascape leaves out anything standing exactly where the searcher stands.
      if (other.x === origin.x && other.y === origin.y) continue;
      const d = this.distance(origin, other);
      if (d > origin.vision) continue;
      if (d < best) {
        best = d;
        found = other;
        ties = [];
      } else if (nearlyEqual(d, best)) {
        if (ties.length === 0 && found) ties.push(found);
        ties.push(other);
      }
    }
    return ties.length > 0 ? this.random.pick(ties) : found;
  }

  /** Ascape `Continuous2D.moveToward`: straight at the target, never past it, by the short way round. */
  legacyMoveToward(bion: FreeBion, target: FreeBion, distance: number): void {
    let originX = bion.x;
    let originY = bion.y;
    let targetX = target.x;
    let targetY = target.y;
    if (this.periodic) {
      if (originX < targetX) {
        if (targetX - originX > originX + (this.width - targetX)) originX += this.width;
      } else if (originX - targetX > targetX + (this.width - originX)) {
        targetX += this.width;
      }
      if (originY < targetY) {
        if (targetY - originY > originY + (this.height - targetY)) originY += this.height;
      } else if (originY - targetY > targetY + (this.height - originY)) {
        targetY += this.height;
      }
    }
    const theta = Math.atan2(targetY - originY, targetX - originX);
    let deltaX = distance * Math.cos(theta) + originX;
    let deltaY = distance * Math.sin(theta) + originY;
    if (originX < targetX) {
      if (deltaX > targetX) deltaX = targetX;
    } else if (deltaX < targetX) deltaX = targetX;
    if (originY < targetY) {
      if (deltaY > targetY) deltaY = targetY;
    } else if (deltaY < targetY) deltaY = targetY;
    bion.moveTo(deltaX, deltaY);
  }

  /** Ascape `Continuous2D.moveAway`: directly away along the plain (not wrapped) direction. */
  legacyMoveAway(bion: FreeBion, target: FreeBion, distance: number): void {
    const theta = Math.atan2(target.y - bion.y, target.x - bion.x);
    bion.moveTo(bion.x - distance * Math.cos(theta), bion.y - distance * Math.sin(theta));
  }

  /** One period: each species in turn, in a fresh random order drawn from the territory's stream. */
  iterateSpecies(): void {
    for (let species = 0; species < 3; species++) {
      const group = this.random.shuffle(this.members.filter((b) => b.species === species));
      const prey = (species + 1) % 3;
      const predator = (species + 2) % 3;
      for (const bion of group) {
        if (!bion.alive) continue;
        const toward = this.nearestOfSpecies(bion, prey);
        if (toward) this.legacyMoveToward(bion, toward, bion.velocity);
        const away = this.nearestOfSpecies(bion, predator);
        if (away) this.legacyMoveAway(bion, away, bion.velocity);
      }
    }
  }
}

/** Step Q: the chase of Step D, but in continuous space with speeds. */
export const stepQ = defineModel({
  name: 'Bionland: Step Q',
  description:
    'Red, orange and blue bions chase and flee each other across a continuous 600 x 600 space: each moves toward its nearest prey and away from its nearest predator within its vision, at its own speed.',
  provenance: {
    portedFrom: 'Ascape 5.6.1, org.ascape.examples.bionland.Model_Q',
    copyright: BIONLAND_COPYRIGHT,
    note:
      'Step Q: moves the species chase of Step D (movement only, no energy) into a periodic continuous space. ' +
      'Authors and citation are not stated in the sources. Ball images are not ported.',
  },
  parameters: {
    initialPopulationSize: int(40, {
      min: 1,
      max: 200,
      label: 'Initial population size',
      description: 'Bions of each species at the start.',
    }),
    minimumVision: int(60, { min: 1, max: 600, label: 'Minimum vision' }),
    maximumVision: int(100, { min: 1, max: 600, label: 'Maximum vision' }),
    minVelocity: int(7, { min: 0, max: 100, label: 'Minimum velocity' }),
    maxVelocity: int(13, { min: 0, max: 100, label: 'Maximum velocity' }),
    periodic: bool(true, {
      label: 'Periodic',
      description: 'Whether the edges of the space join up.',
    }),
  },
  build(root) {
    const p = root.parameters;
    const ranges = {
      minVision: p.minimumVision,
      maxVision: Math.max(p.minimumVision, p.maximumVision),
      minVelocity: p.minVelocity,
      maxVelocity: Math.max(p.minVelocity, p.maxVelocity),
    };
    const space = new Territory();
    const territory = root.add(
      new Scape<FreeBion>({
        name: 'Bionland',
        space,
        extent: [600, 600],
        periodic: p.periodic,
        size: 3 * p.initialPopulationSize,
        prototypeAgent: (index) =>
          new FreeBion(Math.floor(index / p.initialPopulationSize), ranges),
      }),
    );
    // The species take their turns as one rule of the model as a whole.
    root
      .add(new Scape({ name: 'Species', space: new Singleton() }))
      .addRule('Chase and flee', () => space.iterateSpecies(), {
        randomExecution: false,
      });
    SPECIES.forEach((name, species) =>
      territory.addStatCollector(stat.count(name, (b) => b.species === species)),
    );
    root.addStatCollector(
      stat.value('Mean distance to prey', () => {
        let total = 0;
        let counted = 0;
        for (const bion of territory.members) {
          let nearest = Infinity;
          for (const other of territory.members) {
            if (other.species === (bion.species + 1) % 3) {
              nearest = Math.min(nearest, space.distance(bion, other));
            }
          }
          if (nearest < Infinity) {
            total += nearest;
            counted++;
          }
        }
        return counted === 0 ? 0 : total / counted;
      }),
    );
    root.addView(
      continuousView<FreeBion>({
        title: 'Map',
        scape: territory,
        color: (b) => SPECIES_COLORS[b.species] as Color,
        legend: SPECIES.map((name, i) => ({
          color: SPECIES_COLORS[i] as Color,
          label: `${name} bion`,
        })),
        radius: () => 5,
      }),
    );
    root.addView(timeSeriesView({ title: 'Distance to prey', series: ['Mean distance to prey'] }));
  },
});
