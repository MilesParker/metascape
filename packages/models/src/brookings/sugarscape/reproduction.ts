// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.PromiscuousReprod,
// PromiscuousSpiceReprod, CulturalReproduction (in GAS_III_6.java).
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type { Rule, Scape } from '@metascape/engine';
import type { CulturalSexualAgent, SexualAgent, SexualSpiceAgent, SugarAgent } from './agents';
import { findRandomAvailableNeighbor, isNeighborAvailable, randomSeries } from './ascape-space';

interface Breeder extends SugarAgent {
  female: boolean;
  isFertile(): boolean;
}

/**
 * The loop shared by the three legacy reproduction rules: visit the
 * neighboring occupants in a random order (one draw from `uniqueSeries`) and,
 * while still fertile, have a child with every fertile neighbor of the other
 * sex, provided either parent's cell has a free neighbor.
 *
 * As in the legacy code the child is a fresh agent that is added to the scape
 * and initialized (so it draws its own random traits and a random cell), then
 * leaves that cell; `inherit` then sets what it gets from its parents, and it
 * is put on a free neighbor of the first parent, or else of the mate.
 */
function reproduce<A extends Breeder>(
  agent: A,
  inherit: (child: A, agent: A, mate: A) => void,
): void {
  const neighbors = agent.neighboringOccupants() as A[];
  const series = randomSeries(agent.random, neighbors.length);
  for (const index of series) {
    if (!agent.isFertile()) break;
    const mate = neighbors[index - 1]!;
    if (agent.female === mate.female || !mate.isFertile()) continue;
    const agentCell = agent.cell;
    const mateCell = mate.cell;
    if (!agentCell || !mateCell) continue;
    if (!isNeighborAvailable(agentCell) && !isNeighborAvailable(mateCell)) continue;
    const child = agent.newOfSameKind() as A;
    (agent.scape as Scape<SugarAgent>).add(child);
    child.leave();
    inherit(child, agent, mate);
    const target = isNeighborAvailable(agentCell)
      ? findRandomAvailableNeighbor(agentCell, agent.random)
      : findRandomAvailableNeighbor(mateCell, agent.random);
    if (target) child.moveTo(target);
  }
}

/**
 * `PromiscuousReprod`: the child gets up to 5 sugar from each parent, but the
 * second assignment overwrites the first, so it keeps only the mate's share
 * while the first parent's share is lost (kept legacy behaviour). Vision and
 * metabolism each come from a random parent; age is 0.
 */
export const promiscuousReproduction: Rule<SexualAgent> = {
  name: 'Promiscuous Reproduction',
  execute(agent) {
    reproduce(agent, (child, self, mate) => {
      child.sugar.stock = self.sugar.takeStock(self.getContributionToChild());
      child.sugar.stock = mate.sugar.takeStock(mate.getContributionToChild());
      child.age = 0;
      child.vision = child.random.chance(0.5) ? self.vision : mate.vision;
      child.sugarMetabolism = child.random.chance(0.5)
        ? self.sugarMetabolism
        : mate.sugarMetabolism;
    });
  },
};

/**
 * `CulturalReproduction` (GAS_III_6): as {@link promiscuousReproduction}, but
 * if the first parent's culture is "blue" (tag majority set) the child
 * inherits vision, otherwise metabolism; the other trait stays as randomly
 * initialized. Each tag bit is the parents' common bit, or random where they differ.
 */
export const culturalReproduction: Rule<CulturalSexualAgent> = {
  name: 'Cultural Reproduction',
  execute(agent) {
    reproduce(agent, (child, self, mate) => {
      child.sugar.stock = self.sugar.takeStock(self.getContributionToChild());
      child.sugar.stock = mate.sugar.takeStock(mate.getContributionToChild());
      child.age = 0;
      if (self.getMajority()) {
        child.vision = child.random.chance(0.5) ? self.vision : mate.vision;
      } else {
        child.sugarMetabolism = child.random.chance(0.5)
          ? self.sugarMetabolism
          : mate.sugarMetabolism;
      }
      for (let j = 0; j < self.world.tagLength; j++) {
        child.tag[j] = self.tag[j] === mate.tag[j] ? self.tag[j]! : child.random.chance(0.5);
      }
    });
  },
};

/**
 * `PromiscuousSpiceReprod`: each parent gives half its initial sugar and spice
 * endowments, but again only the mate's share is kept. Vision comes from a
 * random parent and both metabolisms together from a random parent.
 */
export const promiscuousSpiceReproduction: Rule<SexualSpiceAgent> = {
  name: 'Promiscuous Spice Rule',
  execute(agent) {
    reproduce(agent, (child, self, mate) => {
      child.sugar.stock = self.sugar.takeStock(self.getSugarContributionToChild());
      child.sugar.stock = mate.sugar.takeStock(mate.getSugarContributionToChild());
      child.spice.stock = self.spice.takeStock(self.getSpiceContributionToChild());
      child.spice.stock = mate.spice.takeStock(mate.getSpiceContributionToChild());
      child.age = 0;
      child.vision = child.random.chance(0.5) ? self.vision : mate.vision;
      if (child.random.chance(0.5)) {
        child.sugarMetabolism = self.sugarMetabolism;
        child.spiceMetabolism = self.spiceMetabolism;
      } else {
        child.sugarMetabolism = mate.sugarMetabolism;
        child.spiceMetabolism = mate.spiceMetabolism;
      }
    });
  },
};
