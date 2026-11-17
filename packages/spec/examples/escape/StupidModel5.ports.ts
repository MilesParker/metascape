// SPDX-License-Identifier: EPL-2.0
//
// StupidModel5.metaabm's method bodies, ported by hand from Java to TypeScript
// (R21). `npm run translate-examples` puts each in place of the Java, keyed by
// the XMI path of its method act, so the `.metaabm` file stays as it is.
import type { MethodPorts } from '../../src/metaabm';

export const ports: MethodPorts = {
  // ConsumeFood. The original's Java:
  //   Habitat habitat = (Habitat) getHostCell();
  //   double availability = habitat.getFoodAvailability();
  //   double consumption = availability <  getMaxConsumption() ? availability : getMaxConsumption();
  //   setSize(getSize()+consumption);
  //   habitat.setFoodAvailability(availability-consumption);
  "//@agents[ID='bug']/@rootActivity/@members[ID='consumeFood']": [
    'const habitat = agent.cell;',
    "const availability = habitat.get('foodAvailability');",
    "const consumption = Math.min(availability, agent.get('maxConsumption'));",
    "agent.set('size', agent.get('size') + consumption);",
    "habitat.set('foodAvailability', availability - consumption);",
  ].join('\n'),
};
