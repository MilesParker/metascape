// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.TrackSocialNetwork.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type { Network, Rule } from '@metascape/engine';
import type { SugarAgent } from './agents';

/**
 * `TrackSocialNetwork`: each agent's network becomes the agents on its
 * neighboring cells at the moment the rule runs (`setNetwork(findNeighborsOnHost())`),
 * replacing its previous links. The legacy network is per agent and so
 * directed: a link from A to B means B was A's neighbor when A last ran the rule.
 */
export function trackSocialNetwork(network: Network<SugarAgent>): Rule<SugarAgent> {
  return {
    name: 'Track Social Network',
    execute(agent) {
      for (const old of [...network.neighbors(agent)]) network.disconnect(agent, old);
      for (const neighbor of agent.neighboringOccupants()) {
        network.connect(agent, neighbor as SugarAgent);
      }
    },
  };
}
