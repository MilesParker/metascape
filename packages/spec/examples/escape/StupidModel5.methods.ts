// SPDX-License-Identifier: EPL-2.0
//
// The implementations of StupidModel5.metaabm's method acts, ported by hand
// from Java to TypeScript (R21). They are ordinary functions given to
// `compileModel` (`methods`); the model holds the method act, marked as
// provided, and no code. `npm run translate-examples` marks the methods named
// here, so the `.metaabm` file stays as it is.
import type { MethodImplementations } from '../../src/metamodel/method';

export const methods: MethodImplementations = {
  bug: {
    // ConsumeFood. The original's Java:
    //   Habitat habitat = (Habitat) getHostCell();
    //   double availability = habitat.getFoodAvailability();
    //   double consumption = availability <  getMaxConsumption() ? availability : getMaxConsumption();
    //   setSize(getSize()+consumption);
    //   habitat.setFoodAvailability(availability-consumption);
    consumeFood(agent) {
      const habitat = agent.cell;
      if (!habitat) throw new Error('The bug stands on no habitat');
      const availability = habitat.get('foodAvailability') as number;
      const consumption = Math.min(availability, agent.get('maxConsumption') as number);
      agent.set('size', (agent.get('size') as number) + consumption);
      habitat.set('foodAvailability', availability - consumption);
    },
  },
};
