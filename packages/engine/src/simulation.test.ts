// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import {
  Agent,
  bool,
  choice,
  defineModel,
  int,
  ParameterError,
  real,
  Scape,
  Simulation,
  type Model,
  type ParameterSchema,
} from './index';

class Walker extends Agent {
  position = 0;
  initialized = false;
  override initialize(): void {
    this.initialized = true;
  }
}

/** A model whose only job is to host one scape configured by the test. */
function hosting<A extends Agent>(
  scape: () => Scape<A>,
): Model<ParameterSchema> & { scape: Scape<A> } {
  const model = {
    name: 'test',
    parameters: {},
    scape: undefined as unknown as Scape<A>,
    build(sim: Simulation) {
      model.scape = sim.addScape(scape());
    },
  };
  return model;
}

const walkers = (
  size: number,
  options: Partial<ConstructorParameters<typeof Scape<Walker>>[0]> = {},
) => new Scape<Walker>({ name: 'walkers', size, create: () => new Walker(), ...options });

describe('parameters', () => {
  const model = defineModel({
    name: 'typed',
    parameters: {
      width: int(10, { min: 1, max: 100 }),
      density: real(0.5, { min: 0, max: 1 }),
      wrap: bool(true),
      neighbourhood: choice(['moore', 'vonNeumann'], 'moore'),
    },
    build() {},
  });

  it('applies defaults and overrides with inferred types', () => {
    const sim = new Simulation(model, { parameters: { width: 20, neighbourhood: 'vonNeumann' } });
    const width: number = sim.parameters.width;
    const neighbourhood: 'moore' | 'vonNeumann' = sim.parameters.neighbourhood;
    expect([width, sim.parameters.density, sim.parameters.wrap, neighbourhood]).toEqual([
      20,
      0.5,
      true,
      'vonNeumann',
    ]);
  });

  it('rejects values that do not fit the schema', () => {
    const run = (parameters: object) => () => new Simulation(model, { parameters } as never);
    expect(run({ width: 0 })).toThrow(ParameterError);
    expect(run({ width: 2.5 })).toThrow(ParameterError);
    expect(run({ density: 2 })).toThrow(ParameterError);
    expect(run({ wrap: 'yes' })).toThrow(ParameterError);
    expect(run({ neighbourhood: 'hex' })).toThrow(ParameterError);
    expect(run({ height: 3 })).toThrow(ParameterError);
  });
});

describe('initialization', () => {
  it('populates, initializes, then runs initial rules, leaving tick at 0', () => {
    const log: string[] = [];
    const model = hosting(() =>
      walkers(3).addInitialRule('place', (walker) => {
        log.push(`place ${walker.id} initialized=${walker.initialized}`);
      }),
    );
    const sim = new Simulation(model, { seed: 1 });
    expect(sim.tick).toBe(0);
    expect(model.scape.size).toBe(3);
    expect(model.scape.members.map((walker) => walker.id)).toEqual([0, 1, 2]);
    expect(log).toHaveLength(3);
    expect(log.every((line) => line.endsWith('initialized=true'))).toBe(true);
  });

  it('lets agents see every scape from initialize()', () => {
    let seen = -1;
    class Late extends Agent {
      override initialize(): void {
        seen = this.sim.scape('second').size;
      }
    }
    new Simulation({
      name: 'two',
      parameters: {},
      build(sim) {
        sim.addScape(new Scape({ name: 'first', size: 1, create: () => new Late() }));
        sim.addScape(new Scape({ name: 'second', size: 4, create: () => new Agent() }));
      },
    });
    expect(seen).toBe(4);
  });

  it('rejects duplicate scape names and late scapes', () => {
    const model = hosting(() => walkers(0));
    const sim = new Simulation(model);
    expect(() => sim.addScape(walkers(0))).toThrow(/while the model is built/);
    expect(
      () =>
        new Simulation({
          name: 'dup',
          parameters: {},
          build(sim) {
            sim.addScape(walkers(0));
            sim.addScape(walkers(0));
          },
        }),
    ).toThrow(/already exists/);
  });
});

describe('stepping', () => {
  const trace = (schedule: 'byAgent' | 'byRule') => {
    const log: string[] = [];
    const model = hosting(() =>
      walkers(2, { order: 'sequential', schedule })
        .addRule('a', (walker) => log.push(`a${walker.id}`))
        .addRule({
          name: 'b',
          execute: (walker) => log.push(`b${walker.id}`),
          update: (walker) => log.push(`B${walker.id}`),
        }),
    );
    new Simulation(model).step();
    return log.join(' ');
  };

  it('interleaves by agent, with updates after all executes', () => {
    expect(trace('byAgent')).toBe('a0 b0 a1 b1 B0 B1');
  });

  it('interleaves by rule, with updates after all executes', () => {
    expect(trace('byRule')).toBe('a0 a1 b0 b1 B0 B1');
  });

  it('skips disabled rules', () => {
    const model = hosting(() => walkers(1).addRule('move', (walker) => walker.position++));
    const sim = new Simulation(model);
    model.scape.rules[0]!.enabled = false;
    sim.step();
    expect(model.scape.members[0]!.position).toBe(0);
  });

  it('visits in a fresh shuffled order each step, reproducibly', () => {
    const orders = (seed: number) => {
      const seen: number[][] = [];
      let current: number[] = [];
      const model = hosting(() => walkers(20).addRule('note', (walker) => current.push(walker.id)));
      const sim = new Simulation(model, { seed });
      for (let i = 0; i < 3; i++) {
        current = [];
        sim.step();
        seen.push(current);
      }
      return seen;
    };
    const first = orders(5);
    expect(first[0]).not.toEqual(first[1]);
    expect([...first[0]!].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(orders(5)).toEqual(first);
    expect(orders(6)).not.toEqual(first);
  });

  it('activates a subset as a tour (distinct) or by draw (with replacement)', () => {
    const counts = (sampling: 'tour' | 'draw') => {
      const model = hosting(() =>
        walkers(10, { activations: 5, sampling }).addRule('move', (walker) => walker.position++),
      );
      const sim = new Simulation(model, { seed: 3 });
      sim.run(40);
      return model.scape.members.map((walker) => walker.position);
    };
    const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
    expect(total(counts('tour'))).toBe(200);
    expect(total(counts('draw'))).toBe(200);

    const oneStep = hosting(() =>
      walkers(10, { activations: 9, sampling: 'tour' }).addRule(
        'move',
        (walker) => walker.position++,
      ),
    );
    new Simulation(oneStep, { seed: 3 }).step();
    expect(Math.max(...oneStep.scape.members.map((walker) => walker.position))).toBe(1);
  });
});

describe('membership changes during a step', () => {
  it('skips agents removed earlier in the step and calls removed() once', () => {
    let removals = 0;
    class Mortal extends Agent {
      acted = false;
      override removed(): void {
        removals++;
      }
    }
    const model = hosting(() =>
      new Scape<Mortal>({
        name: 'mortals',
        size: 4,
        create: () => new Mortal(),
        order: 'sequential',
      })
        .addRule('kill next', (mortal) => {
          mortal.acted = true;
          const next = mortal.scape.members.find((other) => other.id === mortal.id + 1);
          next?.die();
          next?.die();
        })
        .addRule('never after death', (mortal) => expect(mortal.alive).toBe(true)),
    );
    const sim = new Simulation(model);
    sim.step();
    expect(model.scape.members.map((mortal) => mortal.id)).toEqual([0, 2]);
    expect(model.scape.size).toBe(2);
    expect(removals).toBe(2);
    expect(model.scape.members.every((mortal) => mortal.acted && mortal.alive)).toBe(true);
  });

  it('initializes agents added mid-run at once but first steps them next tick', () => {
    const model = hosting(() =>
      walkers(1, { order: 'sequential' })
        .addInitialRule('mark', (walker) => (walker.position = 100))
        .addRule('move and breed', (walker) => {
          walker.position++;
          if (walker.sim.tick === 1) walker.scape.spawn();
        }),
    );
    const sim = new Simulation(model);
    sim.step();
    const [parent, child] = model.scape.members;
    expect([parent!.position, child!.position, child!.initialized]).toEqual([101, 100, true]);
    sim.step();
    expect([parent!.position, child!.position]).toEqual([102, 101]);
  });
});

describe('run control and observers', () => {
  it('stops at stopAt, reports why, and refuses to step further', () => {
    const events: string[] = [];
    const model: Model = {
      name: 'observed',
      parameters: {},
      build(sim) {
        sim.addScape(walkers(1).addRule('move', (walker) => walker.position++));
        sim.observe({
          initialized: (s) => events.push(`init@${s.tick}`),
          stepped: (s) => events.push(`step@${s.tick}`),
          stopped: (s) => events.push(`stop@${s.tick}`),
        });
      },
    };
    const sim = new Simulation(model, { stopAt: 2 });
    expect(sim.run(10)).toBe(2);
    expect(sim.stopped).toBe(true);
    expect(sim.stopReason).toBe('stopAt reached');
    expect(sim.step()).toBe(false);
    expect(events).toEqual(['init@0', 'step@1', 'step@2', 'stop@2']);
  });

  it('lets a rule stop the run after the current step', () => {
    const model = hosting(() =>
      walkers(3, { order: 'sequential' }).addRule('move', (walker) => {
        walker.position++;
        if (walker.sim.tick === 3) walker.sim.stop('done');
      }),
    );
    const sim = new Simulation(model);
    expect(sim.run(100)).toBe(3);
    expect(model.scape.members.map((walker) => walker.position)).toEqual([3, 3, 3]);
    expect(sim.stopReason).toBe('done');
  });
});

describe('determinism', () => {
  const trajectory = (seed: number | string) => {
    const model = hosting(() =>
      walkers(25)
        .addRule('walk', (walker) => (walker.position += walker.random.int(-1, 2)))
        .addRule('die', (walker) => {
          if (walker.random.chance(0.02)) walker.die();
        })
        .addRule('breed', (walker) => {
          if (walker.random.chance(0.02)) walker.scape.spawn();
        }),
    );
    const sim = new Simulation(model, { seed });
    sim.run(50);
    return model.scape.members.map((walker) => `${walker.id}:${walker.position}`).join(',');
  };

  it('gives identical runs for the same seed and different runs otherwise', () => {
    expect(trajectory(42)).toBe(trajectory(42));
    expect(trajectory('named')).toBe(trajectory('named'));
    expect(trajectory(42)).not.toBe(trajectory(43));
  });

  it('records the seed it chose when none is given', () => {
    const model = hosting(() => walkers(0));
    const sim = new Simulation(model);
    expect(typeof sim.seed).toBe('number');
  });
});
