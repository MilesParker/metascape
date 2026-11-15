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
  RootScape,
  Scape,
  Singleton,
  stat,
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
    build(root: RootScape) {
      model.scape = root.add(scape());
    },
  };
  return model;
}

const walkers = (
  size: number,
  options: Partial<ConstructorParameters<typeof Scape<Walker>>[0]> = {},
) => new Scape<Walker>({ name: 'walkers', size, prototypeAgent: () => new Walker(), ...options });

/** For rules that visit their agents in order of joining. */
const inOrder = { randomExecution: false } as const;

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
    const root = new RootScape(model, { parameters: { width: 20, neighbourhood: 'vonNeumann' } });
    const width: number = root.parameters.width;
    const neighbourhood: 'moore' | 'vonNeumann' = root.parameters.neighbourhood;
    expect([width, root.parameters.density, root.parameters.wrap, neighbourhood]).toEqual([
      20,
      0.5,
      true,
      'vonNeumann',
    ]);
  });

  it('rejects values that do not fit the schema', () => {
    const run = (parameters: object) => () => new RootScape(model, { parameters } as never);
    expect(run({ width: 0 })).toThrow(ParameterError);
    expect(run({ width: 2.5 })).toThrow(ParameterError);
    expect(run({ density: 2 })).toThrow(ParameterError);
    expect(run({ wrap: 'yes' })).toThrow(ParameterError);
    expect(run({ neighbourhood: 'hex' })).toThrow(ParameterError);
    expect(run({ height: 3 })).toThrow(ParameterError);
  });
});

describe('initialization', () => {
  it('populates, initializes, then runs initial rules, leaving the period at 0', () => {
    const log: string[] = [];
    const model = hosting(() =>
      walkers(3).addInitialRule('place', (walker) => {
        log.push(`place ${walker.id} initialized=${walker.initialized}`);
      }),
    );
    const root = new RootScape(model, { seed: 1 });
    expect(root.period).toBe(0);
    expect(model.scape.size).toBe(3);
    expect(model.scape.members.map((walker) => walker.id)).toEqual([0, 1, 2]);
    expect(log).toHaveLength(3);
    expect(log.every((line) => line.endsWith('initialized=true'))).toBe(true);
  });

  it('lets agents see every scape from initialize()', () => {
    let seen = -1;
    class Late extends Agent {
      override initialize(): void {
        seen = this.root.findScape('second').size;
      }
    }
    new RootScape({
      name: 'two',
      parameters: {},
      build(root) {
        root.add(new Scape({ name: 'first', size: 1, prototypeAgent: () => new Late() }));
        root.add(new Scape({ name: 'second', size: 4, prototypeAgent: () => new Agent() }));
      },
    });
    expect(seen).toBe(4);
  });

  it('rejects duplicate scape names and late scapes', () => {
    const model = hosting(() => walkers(0));
    const root = new RootScape(model);
    expect(() => root.add(walkers(0))).toThrow(/while the model is built/);
    expect(
      () =>
        new RootScape({
          name: 'dup',
          parameters: {},
          build(root) {
            root.add(walkers(0));
            root.add(walkers(0));
          },
        }),
    ).toThrow(/already exists/);
  });
});

describe('iterating', () => {
  const trace = (executionOrder: 'byAgent' | 'byRule') => {
    const log: string[] = [];
    const model = hosting(() =>
      walkers(2, { executionOrder })
        .addRule('a', (walker) => log.push(`a${walker.id}`), inOrder)
        .addRule({
          name: 'b',
          ...inOrder,
          execute: (walker) => log.push(`b${walker.id}`),
          update: (walker) => log.push(`B${walker.id}`),
        }),
    );
    new RootScape(model).iterate();
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
    const root = new RootScape(model);
    model.scape.rules[0]!.enabled = false;
    root.iterate();
    expect(model.scape.members[0]!.position).toBe(0);
  });

  it('visits in a fresh shuffled order each iteration, reproducibly', () => {
    const orders = (seed: number) => {
      const seen: number[][] = [];
      let current: number[] = [];
      const model = hosting(() => walkers(20).addRule('note', (walker) => current.push(walker.id)));
      const root = new RootScape(model, { seed });
      for (let i = 0; i < 3; i++) {
        current = [];
        root.iterate();
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
    const counts = (executionStyle: 'completeTour' | 'repeatedDraw') => {
      const model = hosting(() =>
        walkers(10, { agentsPerIteration: 5, executionStyle }).addRule(
          'move',
          (walker) => walker.position++,
        ),
      );
      const root = new RootScape(model, { seed: 3 });
      root.run(40);
      return model.scape.members.map((walker) => walker.position);
    };
    const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
    expect(total(counts('completeTour'))).toBe(200);
    expect(total(counts('repeatedDraw'))).toBe(200);

    const oneStep = hosting(() =>
      walkers(10, { agentsPerIteration: 9, executionStyle: 'completeTour' }).addRule(
        'move',
        (walker) => walker.position++,
      ),
    );
    new RootScape(oneStep, { seed: 3 }).iterate();
    expect(Math.max(...oneStep.scape.members.map((walker) => walker.position))).toBe(1);
  });
});

describe('membership changes during an iteration', () => {
  it('skips agents removed earlier in the iteration and calls removed() once', () => {
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
        prototypeAgent: () => new Mortal(),
      })
        .addRule(
          'kill next',
          (mortal) => {
            mortal.acted = true;
            const next = mortal.scape.members.find((other) => other.id === mortal.id + 1);
            next?.die();
            next?.die();
          },
          inOrder,
        )
        .addRule('never after death', (mortal) => expect(mortal.alive).toBe(true), inOrder),
    );
    const root = new RootScape(model);
    root.iterate();
    expect(model.scape.members.map((mortal) => mortal.id)).toEqual([0, 2]);
    expect(model.scape.size).toBe(2);
    expect(removals).toBe(2);
    expect(model.scape.members.every((mortal) => mortal.acted && mortal.alive)).toBe(true);
  });

  it('initializes agents added mid-run at once but first iterates them next period', () => {
    const model = hosting(() =>
      walkers(1)
        .addInitialRule('mark', (walker) => (walker.position = 100), inOrder)
        .addRule(
          'move and breed',
          (walker) => {
            walker.position++;
            if (walker.root.period === 1) walker.scape.newAgent();
          },
          inOrder,
        ),
    );
    const root = new RootScape(model);
    root.iterate();
    const [parent, child] = model.scape.members;
    expect([parent!.position, child!.position, child!.initialized]).toEqual([101, 100, true]);
    root.iterate();
    expect([parent!.position, child!.position]).toEqual([102, 101]);
  });
  it('moves an agent from one scape to another without leaving it in the first', () => {
    const root = new RootScape({
      name: 'two scapes',
      parameters: {},
      build(r) {
        r.add(walkers(2));
        r.add(new Scape<Walker>({ name: 'elsewhere' }));
      },
    });
    const home = root.findScape('walkers') as Scape<Walker>;
    const away = root.findScape('elsewhere') as Scape<Walker>;
    const mover = home.members[0]!;
    mover.die();
    away.add(mover);
    expect(home.members).not.toContain(mover);
    expect(home.size).toBe(1);
    expect(away.members).toEqual([mover]);
    expect(mover.scape).toBe(away);
  });
});

describe('run control and listeners', () => {
  it('stops at the stop period, reports why, and refuses to iterate further', () => {
    const events: string[] = [];
    const model: Model = {
      name: 'observed',
      parameters: {},
      build(root) {
        root.add(walkers(1).addRule('move', (walker) => walker.position++));
        root.addScapeListener({
          scapeInitialized: (s) => events.push(`init@${s.period}`),
          scapeIterated: (s) => events.push(`step@${s.period}`),
          scapeStopped: (s) => events.push(`stop@${s.period}`),
        });
      },
    };
    const root = new RootScape(model, { stopPeriod: 2 });
    expect(root.run(10)).toBe(2);
    expect(root.stopped).toBe(true);
    expect(root.stopReason).toBe('stopPeriod reached');
    expect(root.iterate()).toBe(false);
    expect(events).toEqual(['init@0', 'step@1', 'step@2', 'stop@2']);
  });

  it('lets a rule stop the run after the current iteration', () => {
    const model = hosting(() =>
      walkers(3).addRule(
        'move',
        (walker) => {
          walker.position++;
          if (walker.root.period === 3) walker.root.stop('done');
        },
        inOrder,
      ),
    );
    const root = new RootScape(model);
    expect(root.run(100)).toBe(3);
    expect(model.scape.members.map((walker) => walker.position)).toEqual([3, 3, 3]);
    expect(root.stopReason).toBe('done');
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
          if (walker.random.chance(0.02)) walker.scape.newAgent();
        }),
    );
    const root = new RootScape(model, { seed });
    root.run(50);
    return model.scape.members.map((walker) => `${walker.id}:${walker.position}`).join(',');
  };

  it('gives identical runs for the same seed and different runs otherwise', () => {
    expect(trajectory(42)).toBe(trajectory(42));
    expect(trajectory('named')).toBe(trajectory('named'));
    expect(trajectory(42)).not.toBe(trajectory(43));
  });

  it('records the seed it chose when none is given', () => {
    const model = hosting(() => walkers(0));
    const root = new RootScape(model);
    expect(typeof root.seed).toBe('number');
  });
});

describe('views', () => {
  it('collects views added while building, then those from model.views', () => {
    const root = new RootScape({
      name: 'viewed',
      parameters: {},
      build(root) {
        root.addView({ type: 'timeSeries', title: 'declared', series: [] });
      },
      views: () => [{ type: 'bars', title: 'from model', series: [] }],
    });
    expect(root.allViews.map((view) => view.title)).toEqual(['declared', 'from model']);
    expect(root.allViews).toBe(root.allViews);
    expect(() => root.addView({ type: 'bars', title: 'late', series: [] })).toThrow(
      /while the model/,
    );
  });
});

describe('rules of the model as a whole', () => {
  it('run after the initial rules of the scapes before them, before the first statistics', () => {
    const log: string[] = [];
    const root = new RootScape({
      name: 'setup',
      parameters: {},
      build(root) {
        const scape = root.add(
          new Scape<Walker>({ name: 'walkers', size: 2, prototypeAgent: () => new Walker() }),
        );
        scape.addInitialRule('mark', (walker) => (walker.position = 1));
        const whole = root.add(new Scape({ name: 'whole', space: new Singleton() }));
        whole.addInitialRule('set up', () => {
          log.push(`setup sees ${scape.members.map((walker) => walker.position).join(',')}`);
          for (const walker of scape) walker.position = 5;
        });
        scape.addStatCollector(stat.measure('position', (walker) => walker.position));
      },
    });
    expect(log).toEqual(['setup sees 1,1']);
    expect(root.data.latest('position.mean')).toBe(5);
    expect(() => root.add(new Scape({ name: 'late', space: new Singleton() }))).toThrow(
      /while the model/,
    );
  });
});

describe('live parameters', () => {
  const model = defineModel({
    name: 'live',
    parameters: { rate: real(1, { min: 0, live: true }), size: int(3) },
    period: { name: 'year', startOf: (p) => 800 + p.size },
    build(root) {
      let total = 0;
      root.addStatCollector(stat.value('total', () => total));
      root.addScapeListener({ scapeIterated: () => void (total += root.parameters.rate) });
    },
  });

  it('changes a live parameter mid-run and the model sees it', () => {
    const root = new RootScape(model, { seed: 1 });
    root.iterate();
    root.setParameter('rate', 5);
    root.iterate();
    root.iterate(); // statistics are collected before this test's listener adds to the total
    expect(root.data.latest('total')).toBe(6);
    expect(Object.isFrozen(root.parameters)).toBe(true);
  });

  it('sets any parameter at any time, refusing unknown names and bad values', () => {
    const root = new RootScape(model, { seed: 1 });
    root.setParameter('size', 4);
    expect(root.parameters.size).toBe(4);
    expect(() => root.setParameter('size', 4.5)).toThrow(ParameterError);
    expect(() => root.setParameter('nope', 4)).toThrow(/Unknown/);
    expect(() => root.setParameter('rate', -1)).toThrow(/at least 0/);
    expect(root.parameters.rate).toBe(1);
  });

  it('counts periods from the start period of the model', () => {
    const root = new RootScape(model, { seed: 1 });
    expect(root.period).toBe(803);
    expect(root.iteration).toBe(0);
    root.run(10);
    expect(root.period).toBe(813);
    expect(root.iteration).toBe(10);
  });
});

describe('Ascape behaviour that a scape opts into', () => {
  it("tells a scape's self view of its events once statistics are collected, before other listeners", () => {
    const events: string[] = [];
    const model: Model = {
      name: 'self view',
      parameters: {},
      build(root) {
        const scape = root.add(walkers(2).addRule('move', (walker) => walker.position++, inOrder));
        scape.addStatCollector(stat.measure('position', (walker) => walker.position));
        root.addScapeListener({ scapeIterated: () => events.push('listener') });
        root.setSelfView({
          scapeIterated: () => {
            events.push(`self saw ${root.data.latest('position.sum')}`);
            for (const walker of scape) walker.position = 0;
          },
        });
      },
    };
    const root = new RootScape(model);
    root.run(2);
    expect(events).toEqual(['self saw 2', 'listener', 'self saw 2', 'listener']);
  });

  it('draws a fresh random order for each random rule when executing by rule, if asked', () => {
    const orders = (perRule: boolean): string[] => {
      const seen: number[][] = [[], [], []];
      const model = hosting(() =>
        walkers(8, { executionOrder: 'byRule', randomOrderPerRule: perRule })
          .addRule('first', (w) => void seen[0]!.push(w.id))
          .addRule('second', (w) => void seen[1]!.push(w.id))
          .addRule('in order', (w) => void seen[2]!.push(w.id), inOrder),
      );
      new RootScape(model, { seed: 3 }).iterate();
      return seen.map((ids) => ids.join(','));
    };
    const [a, b, c] = orders(true);
    expect(a).not.toBe(b);
    expect(c).toBe('0,1,2,3,4,5,6,7');
    const [d, e, f] = orders(false);
    expect(d).toBe(e);
    expect(f).toBe(d);
  });

  it('gives agents added during a run the initial rules unless they run only at the start', () => {
    const marked = (atStartOnly: boolean): boolean[] => {
      const model = hosting(() =>
        walkers(2, { initialRulesAtStartOnly: atStartOnly }).addInitialRule(
          'mark',
          (w) => void (w.position = 1),
        ),
      );
      const root = new RootScape(model);
      model.scape.newAgent();
      void root;
      return model.scape.members.map((w) => w.position === 1);
    };
    expect(marked(false)).toEqual([true, true, true]);
    expect(marked(true)).toEqual([true, true, false]);
  });
});
