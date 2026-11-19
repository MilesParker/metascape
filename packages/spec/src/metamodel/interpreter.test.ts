// SPDX-License-Identifier: EPL-2.0
import {
  Array2D,
  CellOccupant,
  Graph,
  readScapeSettings,
  RootScape,
  type Agent,
  type Cell,
  type Scape,
} from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { stupidModel1 } from './examples/stupid-model-1';
import { compileModel, styleOf } from './interpreter';
import type { MethodImplementation } from './method';
import { MethodCodeError, UnsupportedModelError } from './model-index';
import { InterpAgent, InterpCell, InterpScape, MAX_TRIGGER_DEPTH, type Holder } from './runtime';
import type { Act, Attribute, Model } from './types';

// ───────────────────────────── Helpers ─────────────────────────────

/** An agent's acts. */
const group = (members: Record<string, Act>): Record<string, Act> => members;

function scapeNamed(root: RootScape, name: string): Scape<Agent> {
  const found = root.scapes.find((scape) => scape.name === name);
  if (!found)
    throw new Error(`No scape ${name}; have ${root.scapes.map((s) => s.name).join(', ')}`);
  return found;
}

const membersOf = <T extends Agent = InterpAgent>(root: RootScape, name: string) =>
  scapeNamed(root, name).members as unknown as T[];

/** An attribute value, read as the model reads it (derived values included). */
function value(holder: Holder & Agent, id: string) {
  const attribute = holder.info.attribute.get(id)!;
  const state = holder instanceof InterpScape ? holder.state : holder.context!.state;
  return state.read(holder, attribute);
}

function setValue(holder: Holder & Agent, id: string, v: boolean | number | string): void {
  holder.values[holder.info.attribute.get(id)!.index] = v;
}

const topOf = (root: RootScape) => scapeNamed(root, 'test') as InterpScape;

interface GridOptions {
  width?: number;
  height?: number;
  bugs?: number;
  neighborhood?: 'moore' | 'vonNeumann' | 'euclidean';
  periodic?: boolean;
  cellAttributes?: Record<string, Attribute>;
  cellActs?: Record<string, Act>;
  bugAttributes?: Record<string, Attribute>;
  rootAttributes?: Record<string, Attribute>;
  rootActs?: Record<string, Act>;
}

/** A root scape with a grid of `cell`s and some `bug`s standing on it, not yet placed. */
function gridModel(bugActs: Record<string, Act>, options: GridOptions = {}): Model {
  return {
    schemaVersion: 2,
    id: 'test',
    language: 'typescript',
    attributes: {
      bugCount: { type: 'integer', default: options.bugs ?? 1 },
      ...options.rootAttributes,
    },
    acts: group({
      build: { kind: 'build', targets: ['createBugs', 'fill'] },
      createBugs: {
        kind: 'create',
        selected: 'build',
        agent: 'bug',
        agentCount: { attribute: 'bugCount' },
      },
      fill: {
        kind: 'buildGrid',
        selected: 'build',
        agents: ['bug'],
        space: 'grid',
        fillAgent: 'cell',
      },
      ...options.rootActs,
    }),
    agents: {
      bug: {
        kind: 'agent',
        label: 'Bug',
        pluralLabel: 'Bugs',
        attributes: options.bugAttributes,
        acts: group(bugActs),
      },
      cell: {
        kind: 'agent',
        label: 'Cell',
        attributes: options.cellAttributes,
        acts: group(options.cellActs ?? {}),
      },
    },
    spaces: {
      grid: {
        kind: 'grid',
        label: 'Grid',
        neighborhood: options.neighborhood ?? 'moore',
        borderRule: options.periodic === false ? 'aperiodic' : 'periodic',
        dimensions: ['width', 'height'],
        attributes: {
          width: { type: 'integer', default: options.width ?? 5 },
          height: { type: 'integer', default: options.height ?? 5 },
        },
      },
    },
  };
}

const gridOf = (root: RootScape) =>
  scapeNamed(root, 'Grid').space as unknown as Array2D<InterpCell>;
const bugs = (root: RootScape) => membersOf(root, 'Bugs');

function place(root: RootScape, bug: InterpAgent, x: number, y: number): void {
  bug.moveTo(gridOf(root).at(x, y)!);
}

// ───────────────────────────── StupidModel 1 ─────────────────────────────

describe('StupidModel 1', () => {
  const gridOf = (root: RootScape) =>
    scapeNamed(root, 'Grid 2D').space as unknown as Array2D<InterpCell>;
  const positions = (root: RootScape) =>
    bugs(root).map((bug) => [bug.hostCell!.x, bug.hostCell!.y] as const);

  it('places its bugs, each on a cell of its own, and moves them within their vision', () => {
    const root = new RootScape(compileModel(stupidModel1), { seed: 1 });
    expect(root.scapes.map((s) => s.name)).toEqual(['stupidModel1', 'Grid 2D', 'Bugs']);
    expect(bugs(root)).toHaveLength(100);
    const before = positions(root);
    expect(new Set(before.map(([x, y]) => `${x},${y}`)).size).toBe(100);
    root.iterate();
    const after = positions(root);
    expect(new Set(after.map(([x, y]) => `${x},${y}`)).size).toBe(100);
    const grid = gridOf(root);
    let moved = 0;
    after.forEach(([x, y], i) => {
      const [px, py] = before[i]!;
      const distance = grid.distance({ x, y }, { x: px, y: py });
      expect(distance).toBeLessThanOrEqual(4);
      if (distance > 0) moved++;
    });
    expect(moved).toBeGreaterThan(90);
  });

  it('runs the same from the same seed, and differently from another', () => {
    const run = (seed: number) => {
      const root = new RootScape(compileModel(stupidModel1), { seed });
      root.run(10);
      return positions(root);
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('draws bugs as red ovals and habitats as green rectangles', () => {
    const root = new RootScape(compileModel(stupidModel1), { seed: 1 });
    expect(styleOf(bugs(root)[0]!)).toEqual([
      { shape: 'oval', color: 0xff0000, fill: true, inset: 0 },
    ]);
    const cell = gridOf(root).at(0, 0)!;
    expect(styleOf(cell)).toEqual([{ shape: 'rectangle', color: 0x00ff00, fill: true, inset: 0 }]);
    const view = root.allViews.find((v) => v.type === 'grid');
    expect(view).toMatchObject({ title: 'Grid 2D', occupantShape: 'circle' });
  });

  it('makes the root scape and space attributes parameters', () => {
    const model = compileModel(stupidModel1);
    expect(Object.keys(model.parameters)).toEqual([
      'bugCount',
      'habitatCount',
      'bugVision',
      'grid2D.width',
      'grid2D.height',
    ]);
    const root = new RootScape(model, {
      seed: 1,
      parameters: { bugCount: 10, 'grid2D.width': 20 },
    });
    expect(bugs(root)).toHaveLength(10);
    expect(gridOf(root).width).toBe(20);
  });
});

// ───────────────────────────── Acts ─────────────────────────────

const counterModel = (
  agentActs: Record<string, Act>,
  rootActs: Record<string, Act> = {},
): Model => ({
  schemaVersion: 2,
  id: 'test',
  language: 'typescript',
  attributes: { count: { type: 'integer', default: 3 }, total: { type: 'integer' } },
  acts: group({
    build: { kind: 'build', targets: ['make'] },
    make: {
      kind: 'create',
      selected: 'build',
      agent: 'a',
      agentCount: { attribute: 'count' },
    },
    ...rootActs,
  }),
  agents: {
    a: {
      kind: 'agent',
      label: 'A',
      pluralLabel: 'As',
      attributes: {
        n: { type: 'integer' },
        inited: { type: 'boolean' },
        born: { type: 'integer', default: -1 },
        flag: { type: 'boolean' },
        other: { type: 'boolean' },
        hits: { type: 'integer' },
        share: { type: 'real' },
      },
      acts: group(agentActs),
    },
  },
});

const incrementN: Record<string, Act> = {
  step: { kind: 'rule', label: 'Step', targets: ['inc'] },
  inc: {
    kind: 'evaluate',
    selected: 'step',
    function: 'increment',
    inputs: [{ attribute: 'a.n' }],
    targets: ['setN'],
  },
  setN: { kind: 'set', selected: 'step', attribute: 'a.n', parameter: { evaluate: 'inc' } },
};

describe('acts', () => {
  it('builds, creates, and runs rules: evaluate then set', () => {
    const root = new RootScape(compileModel(counterModel(incrementN)), { seed: 1 });
    expect(membersOf(root, 'As')).toHaveLength(3);
    root.run(2);
    expect(membersOf(root, 'As').map((a) => value(a, 'n'))).toEqual([2, 2, 2]);
  });

  it('runs initialize once, over the agents present at the start only (R15)', () => {
    const root = new RootScape(
      compileModel(
        counterModel(
          {
            init: { kind: 'initialize', targets: ['setInited'] },
            setInited: {
              kind: 'set',
              selected: 'init',
              attribute: 'a.inited',
              parameter: { literal: true },
            },
          },
          {
            tick: { kind: 'rule', targets: ['spawn'] },
            spawn: { kind: 'create', selected: 'tick', agent: 'a', targets: ['now'] },
            now: { kind: 'evaluate', selected: 'spawn', function: 'timeNow', targets: ['setBorn'] },
            setBorn: {
              kind: 'set',
              selected: 'spawn',
              attribute: 'a.born',
              parameter: { evaluate: 'now' },
            },
          },
        ),
      ),
      { seed: 1 },
    );
    root.run(2);
    const as = membersOf(root, 'As');
    expect(as.map((a) => [value(a, 'born'), value(a, 'inited')])).toEqual([
      [-1, true],
      [-1, true],
      [-1, true],
      [1, false],
      [2, false],
    ]);
  });

  it('fires a plain act once for each agent of an `all` selection, depth first, so sets accumulate', () => {
    const root = new RootScape(
      compileModel(
        counterModel(
          {},
          {
            tick: { kind: 'rule', targets: ['everyA'] },
            everyA: { kind: 'select', selected: 'tick', agent: 'a', targets: ['allOfThem'] },
            allOfThem: { kind: 'query', selected: 'everyA', function: 'all', targets: ['sum'] },
            sum: {
              kind: 'evaluate',
              selected: 'everyA',
              function: 'add',
              inputs: [{ attribute: 'total', selected: 'tick' }, { literal: 1 }],
              targets: ['setTotal'],
            },
            setTotal: {
              kind: 'set',
              selected: 'tick',
              attribute: 'total',
              parameter: { evaluate: 'sum' },
            },
          },
        ),
      ),
      { seed: 1 },
    );
    root.run(2);
    expect(value(topOf(root), 'total')).toBe(6);
  });

  it('runs a query once for each arrival, as a plain act, with what has changed in between', () => {
    // `small` is reached from the rule and again after `mark`; each arrival increments n.
    const root = new RootScape(
      compileModel(
        counterModel({
          step: { kind: 'rule', targets: ['small', 'mark'] },
          mark: {
            kind: 'set',
            selected: 'step',
            attribute: 'a.flag',
            parameter: { literal: true },
            targets: ['small'],
          },
          small: {
            kind: 'query',
            selected: 'step',
            function: 'lesser',
            inputs: [{ attribute: 'a.n' }, { literal: 10 }],
            targets: ['inc'],
          },
          inc: {
            kind: 'evaluate',
            selected: 'step',
            function: 'add',
            inputs: [{ attribute: 'a.n' }, { constant: 'unit' }],
            targets: ['setN'],
          },
          setN: { kind: 'set', selected: 'step', attribute: 'a.n', parameter: { evaluate: 'inc' } },
        }),
      ),
      { seed: 1 },
    );
    root.iterate();
    expect(membersOf(root, 'As').map((a) => value(a, 'n'))).toEqual([2, 2, 2]);
  });

  it('gives a numeric constant the type of the numbers beside it', () => {
    const root = new RootScape(
      compileModel(
        counterModel({
          step: { kind: 'rule', targets: ['seven'] },
          seven: {
            kind: 'evaluate',
            selected: 'step',
            function: 'add',
            inputs: [{ literal: 6 }, { constant: 'unit' }],
            targets: ['half'],
          },
          half: {
            kind: 'evaluate',
            selected: 'step',
            function: 'div',
            inputs: [{ evaluate: 'seven' }, { literal: 2 }],
            targets: ['setN'],
          },
          setN: {
            kind: 'set',
            selected: 'step',
            attribute: 'a.share',
            parameter: { evaluate: 'half' },
          },
        }),
      ),
      { seed: 1 },
    );
    root.iterate();
    // Integer division, as in Java: 7 / 2 is 3.
    expect(value(membersOf(root, 'As')[0]!, 'share')).toBe(3);
  });

  it('kills agents and removes them from the model', () => {
    const root = new RootScape(
      compileModel(
        counterModel({
          ...incrementN,
          old: { kind: 'rule', targets: ['tooOld'] },
          tooOld: {
            kind: 'query',
            selected: 'old',
            function: 'greaterorEqual',
            inputs: [{ attribute: 'a.n' }, { literal: 2 }],
            targets: ['dies'],
          },
          dies: { kind: 'die', selected: 'old' },
        }),
      ),
      { seed: 1 },
    );
    root.iterate();
    expect(membersOf(root, 'As')).toHaveLength(3);
    root.iterate();
    expect(membersOf(root, 'As')).toHaveLength(0);
  });

  it('causes a root act, recursively', () => {
    const root = new RootScape(
      compileModel(
        counterModel({
          step: { kind: 'rule', targets: ['kick'] },
          kick: { kind: 'cause', selected: 'step', result: 'again' },
          again: { kind: 'perform', targets: ['small'] },
          small: {
            kind: 'query',
            selected: 'again',
            function: 'lesser',
            inputs: [{ attribute: 'a.n' }, { literal: 5 }],
            targets: ['inc'],
          },
          inc: {
            kind: 'evaluate',
            selected: 'again',
            function: 'increment',
            inputs: [{ attribute: 'a.n' }],
            targets: ['setN'],
          },
          setN: {
            kind: 'set',
            selected: 'again',
            attribute: 'a.n',
            parameter: { evaluate: 'inc' },
            targets: ['recurse'],
          },
          recurse: { kind: 'cause', selected: 'again', result: 'again' },
        }),
      ),
      { seed: 1 },
    );
    root.iterate();
    expect(membersOf(root, 'As').map((a) => value(a, 'n'))).toEqual([5, 5, 5]);
  });

  it('runs a schedule from its start, every interval', () => {
    const root = new RootScape(
      compileModel(
        counterModel({
          ...incrementN,
          step: { kind: 'schedule', start: 2, interval: 3, targets: ['inc'] },
        }),
      ),
      { seed: 1 },
    );
    root.run(8);
    // Periods 2, 5 and 8.
    expect(value(membersOf(root, 'As')[0]!, 'n')).toBe(3);
  });

  const methodModel = (code: Act) =>
    counterModel({
      step: { kind: 'rule', targets: ['code'] },
      code,
    });

  it('runs a method implementation with the agent, its scape and the seeded random stream (R21)', () => {
    const make = (implementation: MethodImplementation) =>
      compileModel(methodModel({ kind: 'method', selected: 'step', provided: true }), {
        methods: { a: { code: implementation } },
      });
    const root = new RootScape(
      make((agent, scape, random) =>
        agent.set(
          'n',
          (agent.get('n') as number) +
            (scape.get('count') as number) +
            random.int(0, 0) +
            scape.period,
        ),
      ),
      { seed: 1 },
    );
    root.run(2);
    // 0 + (3 + 0 + 1) + (3 + 0 + 2)
    expect(value(membersOf(root, 'As')[0]!, 'n')).toBe(9);
    const draws = (seed: number) => {
      const run = new RootScape(
        make((agent, _scape, random) => agent.set('n', random.int(1, 1000))),
        { seed },
      );
      run.iterate();
      return membersOf(run, 'As').map((a) => value(a, 'n'));
    };
    expect(draws(3)).toEqual(draws(3));
  });

  it('does not evaluate a method body held in the model unless allowed (R21)', () => {
    const body = "agent.set('n', agent.get('n') + 1);";
    const model = methodModel({ kind: 'method', selected: 'step', body });
    expect(() => compileModel(model)).toThrow(MethodCodeError);
    expect(() => compileModel(model)).toThrow(/not run unless allowed: `a: code`/);
    // A method with no code does nothing, and needs nothing.
    expect(() => compileModel(methodModel({ kind: 'method', selected: 'step' }))).not.toThrow();
    // A method marked as provided needs its implementation.
    expect(() =>
      compileModel(methodModel({ kind: 'method', selected: 'step', provided: true })),
    ).toThrow(/no implementation was given: `a: code`/);
    // An implementation of what is not a method is an error.
    expect(() => compileModel(model, { methods: { a: { step: () => {} } } })).toThrow(
      /not methods of the model: `a: step`/,
    );
    // An implementation given takes the place of the body, which is not evaluated.
    const given = new RootScape(
      compileModel(model, { methods: { a: { code: (agent) => agent.set('n', 7) } } }),
      { seed: 1 },
    );
    given.iterate();
    expect(value(membersOf(given, 'As')[0]!, 'n')).toBe(7);
  });

  it('evaluates a method body when allowed, with the same API (R21)', () => {
    const make = (body: string) =>
      compileModel(methodModel({ kind: 'method', selected: 'step', body }), {
        allowMethodBodies: true,
      });
    const root = new RootScape(
      make(
        "agent.set('n', agent.get('n') + scape.get('count') + random.int(0, 0) + scape.period);",
      ),
      { seed: 1 },
    );
    root.run(2);
    expect(value(membersOf(root, 'As')[0]!, 'n')).toBe(9);
    expect(() => new RootScape(make('Math.random();'), { seed: 1 }).iterate()).toThrow(
      /Method `code` failed/,
    );
    expect(() => make('this is not code')).toThrow(/does not compile/);
  });
});

// ───────────────────────────── Execution settings (R14) ─────────────────────────────

describe('execution settings', () => {
  const twoRules = (execution?: Model['execution']): Model => {
    const model = counterModel({
      first: { kind: 'rule', label: 'First', targets: ['one'] },
      one: { kind: 'set', selected: 'first', attribute: 'a.n', parameter: { literal: 1 } },
      second: { kind: 'rule', label: 'Second', targets: ['two'] },
      two: { kind: 'set', selected: 'second', attribute: 'a.n', parameter: { literal: 2 } },
    });
    model.agents!.a!.execution = execution;
    return model;
  };

  it("defaults to Ascape's rule order, rules in the order of their acts, agents in random order", () => {
    const root = new RootScape(compileModel(twoRules()), { seed: 1 });
    root.iterate();
    expect(value(membersOf(root, 'As')[0]!, 'n')).toBe(2);
    const settings = readScapeSettings(scapeNamed(root, 'As'));
    expect(settings.executionOrder).toBe('byRule');
    expect(settings.rules.map((rule) => rule.name)).toEqual(['First', 'Second']);
    expect(scapeNamed(root, 'As').rules.every((entry) => entry.rule.randomExecution)).toBe(true);
  });

  it('takes the order, the rule order and random execution from the model', () => {
    const root = new RootScape(
      compileModel(twoRules({ order: 'agent', randomOrder: false, rules: ['second', 'first'] })),
      { seed: 1 },
    );
    root.iterate();
    expect(value(membersOf(root, 'As')[0]!, 'n')).toBe(1);
    const scape = scapeNamed(root, 'As');
    expect(readScapeSettings(scape).executionOrder).toBe('byAgent');
    expect(scape.rules.map((entry) => entry.rule.name)).toEqual(['Second', 'First']);
    expect(scape.rules.every((entry) => entry.rule.randomExecution === false)).toBe(true);
  });
});

// ───────────────────────────── Selections ─────────────────────────────

describe('selections', () => {
  const look = (
    queries: Record<string, Act>,
    terms: string[],
    after: Record<string, Act>,
  ): Record<string, Act> => ({
    look: { kind: 'rule', targets: ['target'] },
    target: {
      kind: 'select',
      selected: 'look',
      agent: 'cell',
      space: 'grid',
      targets: terms,
    },
    ...queries,
    ...after,
  });
  const moveThere: Record<string, Act> = {
    go: { kind: 'move', selected: 'look', destination: 'target' },
  };

  it('chooses one agent at random from the set without a cardinality term', () => {
    const model = gridModel(
      look(
        {
          near: {
            kind: 'query',
            selected: 'target',
            function: 'within',
            inputs: [{ literal: 1 }],
            targets: ['go'],
          },
        },
        ['near'],
        moveThere,
      ),
      { width: 9, height: 9 },
    );
    const root = new RootScape(compileModel(model), { seed: 1 });
    const bug = bugs(root)[0]!;
    place(root, bug, 4, 4);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const from = bug.hostCell!;
      root.iterate();
      const to = bug.hostCell!;
      expect(gridOf(root).distance(from, to)).toBe(1);
      seen.add(`${to.x - from.x},${to.y - from.y}`);
    }
    expect(seen.size).toBeGreaterThan(4);
  });

  it('yields every member with `all`, leaving out the origin unless `includeSelf`', () => {
    const counting = (extra: Record<string, Act>, terms: string[], neighborhood?: 'vonNeumann') =>
      gridModel(
        look(
          {
            near: {
              kind: 'query',
              selected: 'target',
              function: 'within',
              inputs: [{ literal: 1 }],
              targets: ['every'],
            },
            ...extra,
            every: {
              kind: 'all',
              selected: 'target',
              targets: ['inc'],
            },
          },
          terms,
          {
            inc: {
              kind: 'evaluate',
              selected: 'look',
              function: 'increment',
              inputs: [{ attribute: 'bug.seen' }],
              targets: ['count'],
            },
            count: {
              kind: 'set',
              selected: 'look',
              attribute: 'bug.seen',
              parameter: { evaluate: 'inc' },
            },
          },
        ),
        { bugAttributes: { seen: { type: 'integer' } }, ...(neighborhood ? { neighborhood } : {}) },
      );
    const allTerm = (targets: string[]): Record<string, Act> => ({
      each: { kind: 'query', selected: 'target', function: 'all', targets },
    });
    const self: Record<string, Act> = {
      self: { kind: 'query', selected: 'target', function: 'includeSelf', targets: ['every'] },
    };
    const run = (model: Model) => {
      const root = new RootScape(compileModel(model), { seed: 1 });
      place(root, bugs(root)[0]!, 2, 2);
      root.iterate();
      return value(bugs(root)[0]!, 'seen');
    };
    expect(run(counting(allTerm(['every']), ['near', 'each']))).toBe(8);
    expect(run(counting(allTerm(['every']), ['near', 'each'], 'vonNeumann'))).toBe(4);
    expect(run(counting({ ...allTerm(['every']), ...self }, ['near', 'each', 'self']))).toBe(9);
  });

  it('finds the nearest, and the neighbour with the greatest or least value', () => {
    const cellAttributes = { food: { type: 'boolean' }, heat: { type: 'real' } } as const;
    const nearestActs = look(
      {
        closest: { kind: 'query', selected: 'target', function: 'nearest', targets: ['both'] },
        hasFood: {
          kind: 'query',
          selected: 'target',
          function: 'identity',
          inputs: [{ attribute: 'cell.food' }],
          targets: ['both'],
        },
        both: { kind: 'all', selected: 'target', targets: ['go'] },
      },
      ['closest', 'hasFood'],
      moveThere,
    );
    const nearestFood = gridModel(nearestActs, {
      width: 9,
      height: 9,
      periodic: false,
      cellAttributes,
    });
    let root = new RootScape(compileModel(nearestFood), { seed: 1 });
    const grid = gridOf(root);
    setValue(grid.at(8, 8)!, 'food', true);
    setValue(grid.at(1, 3)!, 'food', true);
    place(root, bugs(root)[0]!, 1, 1);
    root.iterate();
    expect([bugs(root)[0]!.hostCell!.x, bugs(root)[0]!.hostCell!.y]).toEqual([1, 3]);

    // On a torus the search by rank goes the shortest way round, and chooses among ties only.
    const torus = gridModel(nearestActs, {
      width: 9,
      height: 9,
      periodic: true,
      cellAttributes,
    });
    for (const execution of ['interpreted', 'generated'] as const) {
      const chosen = new Set<string>();
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        root = new RootScape(compileModel(torus, { execution }), { seed });
        const cells = gridOf(root);
        for (const [x, y] of [
          [8, 0],
          [0, 8],
          [2, 0],
          [4, 4],
        ] as const)
          setValue(cells.at(x, y)!, 'food', true);
        place(root, bugs(root)[0]!, 0, 0);
        root.iterate();
        chosen.add(`${bugs(root)[0]!.hostCell!.x},${bugs(root)[0]!.hostCell!.y}`);
      }
      expect([...chosen].sort()).toEqual(['0,8', '8,0']);
    }

    const extreme = (term: 'maximize' | 'minimize') =>
      gridModel(
        look(
          {
            best: {
              kind: 'query',
              selected: 'target',
              function: term,
              inputs: [{ attribute: 'cell.heat' }],
              targets: ['both'],
            },
            next: { kind: 'query', selected: 'target', function: 'neighbor', targets: ['both'] },
            both: { kind: 'all', selected: 'target', targets: ['go'] },
          },
          ['best', 'next'],
          moveThere,
        ),
        { width: 9, height: 9, cellAttributes },
      );
    for (const [term, expected] of [
      ['maximize', [5, 5]],
      ['minimize', [3, 3]],
    ] as const) {
      root = new RootScape(compileModel(extreme(term)), { seed: 1 });
      for (const cell of gridOf(root).scape.members) setValue(cell, 'heat', 10);
      setValue(gridOf(root).at(5, 5)!, 'heat', 20);
      setValue(gridOf(root).at(3, 3)!, 'heat', 1);
      setValue(gridOf(root).at(0, 0)!, 'heat', 100);
      place(root, bugs(root)[0]!, 4, 4);
      root.iterate();
      expect([bugs(root)[0]!.hostCell!.x, bugs(root)[0]!.hostCell!.y]).toEqual(expected);
    }
  });

  it('selects the cell an agent stands on with `here`', () => {
    const model = gridModel(
      look(
        {
          mine: { kind: 'query', selected: 'target', function: 'here', targets: ['mark'] },
        },
        ['mine'],
        {
          mark: {
            kind: 'set',
            selected: 'target',
            attribute: 'cell.marked',
            parameter: { literal: true },
          },
        },
      ),
      { cellAttributes: { marked: { type: 'boolean' } } },
    );
    const root = new RootScape(compileModel(model), { seed: 1 });
    place(root, bugs(root)[0]!, 3, 1);
    root.iterate();
    const marked = gridOf(root).scape.members.filter((cell) => value(cell, 'marked') === true);
    expect(marked.map((cell) => [cell.x, cell.y])).toEqual([[3, 1]]);
  });

  it('moves only to available cells with `available`', () => {
    const model = gridModel(
      look(
        {
          next: { kind: 'query', selected: 'target', function: 'neighbor', targets: ['both'] },
          free: { kind: 'query', selected: 'target', function: 'available', targets: ['both'] },
          both: { kind: 'all', selected: 'target', targets: ['go'] },
        },
        ['next', 'free'],
        moveThere,
      ),
      { width: 3, height: 3, bugs: 8 },
    );
    const root = new RootScape(compileModel(model), { seed: 1 });
    bugs(root).forEach((bug, i) => place(root, bug, i % 3, Math.floor(i / 3)));
    for (let i = 0; i < 5; i++) {
      root.iterate();
      const cells = new Set(bugs(root).map((bug) => bug.hostCell));
      expect(cells.size).toBe(8);
    }
  });
});

// ───────────────────────────── Logic and boundaries ─────────────────────────────

describe('logic acts and selection boundaries (R18)', () => {
  const kinds = { kind: { type: 'symbol' } } as const;
  const counting = (combine: 'any' | 'none') =>
    gridModel(
      {
        look: { kind: 'rule', targets: ['cells'] },
        cells: {
          kind: 'select',
          selected: 'look',
          agent: 'cell',
          space: 'grid',
          targets: ['each', 'isA', 'isB'],
        },
        each: { kind: 'query', selected: 'cells', function: 'all', targets: ['combined'] },
        isA: {
          kind: 'query',
          selected: 'cells',
          function: 'identical',
          inputs: [{ attribute: 'cell.kind' }, { literal: 'a' }],
          targets: ['combined'],
        },
        isB: {
          kind: 'query',
          selected: 'cells',
          function: 'identical',
          inputs: [{ attribute: 'cell.kind' }, { literal: 'b' }],
          targets: ['combined'],
        },
        combined: { kind: combine, selected: 'cells', targets: ['inc'] },
        inc: {
          kind: 'evaluate',
          selected: 'look',
          function: 'increment',
          inputs: [{ attribute: 'bug.seen' }],
          targets: ['count'],
        },
        count: {
          kind: 'set',
          selected: 'look',
          attribute: 'bug.seen',
          parameter: { evaluate: 'inc' },
        },
      },
      { cellAttributes: kinds, bugAttributes: { seen: { type: 'integer' } } },
    );

  const run = (model: Model) => {
    const root = new RootScape(compileModel(model), { seed: 1 });
    const cells = gridOf(root).scape.members;
    cells.forEach((cell, i) => setValue(cell, 'kind', i < 3 ? 'a' : i < 8 ? 'b' : 'c'));
    place(root, bugs(root)[0]!, 0, 0);
    root.iterate();
    return value(bugs(root)[0]!, 'seen');
  };

  it("treats logic acts on a select's queries as set operations on what it chooses from", () => {
    // `any`: union of the a and b cells; `none`: the cells that are neither.
    expect(run(counting('any'))).toBe(8);
    // The `all` term says how many to choose; it is not an operand of the logic act.
    expect(run(counting('none'))).toBe(25 - 8);
  });

  const boundary = (filterAfterLogic: boolean) =>
    gridModel(
      {
        look: { kind: 'rule', targets: ['cell'] },
        cell: {
          kind: 'select',
          selected: 'look',
          agent: 'cell',
          space: 'grid',
          targets: filterAfterLogic ? ['good'] : ['good', 'marked'],
        },
        good: {
          kind: 'query',
          selected: 'cell',
          function: 'identity',
          inputs: [{ attribute: 'cell.good' }],
          targets: ['both'],
        },
        both: { kind: 'all', selected: 'cell', targets: filterAfterLogic ? ['marked'] : ['hit'] },
        marked: {
          kind: 'query',
          selected: 'cell',
          function: 'identity',
          inputs: [{ attribute: 'cell.marked' }],
          targets: filterAfterLogic ? ['hit'] : ['both'],
        },
        hit: { kind: 'set', selected: 'look', attribute: 'bug.hit', parameter: { literal: true } },
      },
      {
        bugs: 10,
        cellAttributes: { good: { type: 'boolean', default: true }, marked: { type: 'boolean' } },
        bugAttributes: { hit: { type: 'boolean' } },
      },
    );

  it('filters what was chosen with a query after a logic act, and chooses from what passes before it', () => {
    const hits = (model: Model) => {
      const root = new RootScape(compileModel(model), { seed: 2 });
      setValue(gridOf(root).at(2, 2)!, 'marked', true);
      root.iterate();
      return bugs(root).filter((bug) => value(bug, 'hit') === true).length;
    };
    expect(hits(boundary(false))).toBe(10);
    expect(hits(boundary(true))).toBeLessThan(10);
  });

  it('branches on the agent chosen, testing it with queries after the select', () => {
    // As in the Demographic Prisoner's Dilemma: one neighbour is chosen, then its strategy is tested.
    const model = gridModel(
      {
        play: { kind: 'rule', targets: ['iCooperate', 'other'] },
        iCooperate: {
          kind: 'query',
          selected: 'play',
          function: 'identity',
          inputs: [{ attribute: 'bug.cooperate' }],
          targets: ['cc', 'cd'],
        },
        other: { kind: 'select', selected: 'play', agent: 'bug', space: 'grid', targets: ['next'] },
        next: {
          kind: 'query',
          selected: 'other',
          function: 'neighbor',
          targets: ['otherC', 'otherD'],
        },
        otherC: {
          kind: 'query',
          selected: 'other',
          function: 'identity',
          inputs: [{ attribute: 'bug.cooperate' }],
          targets: ['cc'],
        },
        otherD: {
          kind: 'query',
          selected: 'other',
          function: 'not',
          inputs: [{ attribute: 'bug.cooperate' }],
          targets: ['cd'],
        },
        cc: { kind: 'all', selected: 'other', targets: ['addCC'] },
        cd: { kind: 'all', selected: 'other', targets: ['addCD'] },
        addCC: {
          kind: 'evaluate',
          selected: 'play',
          function: 'increment',
          inputs: [{ attribute: 'bug.cc' }],
          targets: ['setCC'],
        },
        setCC: {
          kind: 'set',
          selected: 'play',
          attribute: 'bug.cc',
          parameter: { evaluate: 'addCC' },
        },
        addCD: {
          kind: 'evaluate',
          selected: 'play',
          function: 'increment',
          inputs: [{ attribute: 'bug.cd' }],
          targets: ['setCD'],
        },
        setCD: {
          kind: 'set',
          selected: 'play',
          attribute: 'bug.cd',
          parameter: { evaluate: 'addCD' },
        },
      },
      {
        bugs: 3,
        bugAttributes: {
          cooperate: { type: 'boolean' },
          cc: { type: 'integer' },
          cd: { type: 'integer' },
        },
      },
    );
    const root = new RootScape(compileModel(model), { seed: 3 });
    const [me, friend, foe] = bugs(root) as [InterpAgent, InterpAgent, InterpAgent];
    place(root, me, 2, 2);
    place(root, friend, 1, 2);
    place(root, foe, 3, 2);
    setValue(me, 'cooperate', true);
    setValue(friend, 'cooperate', true);
    root.run(20);
    const cc = value(me, 'cc') as number;
    const cd = value(me, 'cd') as number;
    expect(cc + cd).toBe(20);
    expect(cc).toBeGreaterThan(0);
    expect(cd).toBeGreaterThan(0);
  });

  it('runs a `none` after a query on the root selection for what fails it', () => {
    const model = counterModel({
      ...incrementN,
      check: { kind: 'rule', targets: ['big'] },
      big: {
        kind: 'query',
        selected: 'check',
        function: 'greater',
        inputs: [{ attribute: 'a.n' }, { literal: 1 }],
        targets: ['yes', 'otherwise'],
      },
      otherwise: { kind: 'none', selected: 'check', targets: ['no'] },
      yes: { kind: 'set', selected: 'check', attribute: 'a.flag', parameter: { literal: true } },
      no: { kind: 'set', selected: 'check', attribute: 'a.other', parameter: { literal: true } },
    });
    const root = new RootScape(compileModel(model), { seed: 1 });
    root.iterate();
    const a = membersOf(root, 'As')[0]!;
    expect([value(a, 'flag'), value(a, 'other')]).toEqual([false, true]);
    root.iterate();
    expect([value(a, 'flag'), value(a, 'other')]).toEqual([true, true]);
  });
});

// ───────────────────────────── Watch and derive (R16) ─────────────────────────────

describe('watch and derive', () => {
  it('fires a watch whenever its attribute is set, even to the same value', () => {
    const root = new RootScape(
      compileModel(
        counterModel({
          step: { kind: 'rule', targets: ['same'] },
          same: { kind: 'set', selected: 'step', attribute: 'a.n', parameter: { literal: 0 } },
          seen: { kind: 'watch', attribute: 'a.n', targets: ['inc'] },
          inc: {
            kind: 'evaluate',
            selected: 'seen',
            function: 'increment',
            inputs: [{ attribute: 'a.hits' }],
            targets: ['count'],
          },
          count: {
            kind: 'set',
            selected: 'seen',
            attribute: 'a.hits',
            parameter: { evaluate: 'inc' },
          },
        }),
      ),
      { seed: 1 },
    );
    root.run(3);
    expect(membersOf(root, 'As').map((a) => value(a, 'hits'))).toEqual([3, 3, 3]);
  });

  it('stops the run with a clear message when watches set each other off too deep', () => {
    const root = new RootScape(
      compileModel(
        counterModel({
          ...incrementN,
          seen: { kind: 'watch', attribute: 'a.n', targets: ['again'] },
          again: {
            kind: 'evaluate',
            selected: 'seen',
            function: 'increment',
            inputs: [{ attribute: 'a.n' }],
            targets: ['setAgain'],
          },
          setAgain: {
            kind: 'set',
            selected: 'seen',
            attribute: 'a.n',
            parameter: { evaluate: 'again' },
          },
        }),
      ),
      { seed: 1 },
    );
    root.iterate();
    expect(root.stopped).toBe(true);
    expect(root.stopReason).toMatch(`more than ${MAX_TRIGGER_DEPTH} levels deep`);
    expect(root.iterate()).toBe(false);
  });

  it('computes a derived attribute on read, again only when what it reads has changed', () => {
    const model = counterModel({
      draw: { kind: 'derive', attribute: 'a.d', targets: ['noise'] },
      noise: { kind: 'evaluate', selected: 'draw', function: 'randomUnit', targets: ['sum'] },
      sum: {
        kind: 'evaluate',
        selected: 'draw',
        function: 'add',
        inputs: [{ attribute: 'a.n' }, { evaluate: 'noise' }],
      },
    });
    model.agents!.a!.attributes!.d = { type: 'real', derived: true, gatherData: true };
    const root = new RootScape(compileModel(model), { seed: 1 });
    const a = membersOf(root, 'As')[0]!;
    const first = value(a, 'd') as number;
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(value(a, 'd')).toBe(first);
    a.context.state.write(a, a.info.attribute.get('n')!, 5);
    const second = value(a, 'd') as number;
    expect(second).toBeGreaterThanOrEqual(5);
    expect(second).toBeLessThan(6);
    expect(second - 5).not.toBe(first);
    expect(value(a, 'd')).toBe(second);
    // Derived values are collected like any other.
    expect(root.data.latest('a.d.count')).toBe(3);
  });
});

// ───────────────────────────── Diffusion (R17) ─────────────────────────────

describe('diffusion', () => {
  const heatModel = (rates: boolean) =>
    gridModel(
      {},
      {
        width: 3,
        height: 3,
        bugs: 0,
        rootAttributes: rates
          ? { rate: { type: 'real', default: 0.5 }, loss: { type: 'real', default: 0.1 } }
          : {},
        cellAttributes: { heat: { type: 'real' } },
        cellActs: {
          spread: {
            kind: 'diffuse',
            diffused: 'cell.heat',
            ...(rates ? { diffusionRate: 'rate', evaporationRate: 'loss' } : {}),
          },
        },
      },
    );

  it("takes the neighbourhood from the grid and updates in two phases, as Ascape's generator did", () => {
    const root = new RootScape(compileModel(heatModel(false)), { seed: 1 });
    // On a 3 × 3 torus with Moore neighbourhoods, every cell neighbours every other.
    setValue(gridOf(root).at(1, 1)!, 'heat', 9);
    root.iterate();
    const heats = gridOf(root).scape.members.map((cell) => value(cell, 'heat') as number);
    expect(heats[4]).toBe(0);
    for (const [i, heat] of heats.entries()) if (i !== 4) expect(heat).toBeCloseTo(9 / 8);
  });

  it('applies the diffusion and evaporation rates', () => {
    const root = new RootScape(compileModel(heatModel(true)), { seed: 1 });
    setValue(gridOf(root).at(1, 1)!, 'heat', 9);
    root.iterate();
    const heats = gridOf(root).scape.members.map((cell) => value(cell, 'heat') as number);
    expect(heats[4]).toBeCloseTo((9 + (0 - 9) * 0.5) * 0.9);
    expect(heats[0]).toBeCloseTo((9 / 8) * 0.5 * 0.9);
  });
});

// ───────────────────────────── Nested scapes and several spaces ─────────────────────────────

describe('nested scapes', () => {
  const regional: Model = {
    schemaVersion: 2,
    id: 'test',
    language: 'typescript',
    attributes: { cityCount: { type: 'integer', default: 2 } },
    acts: group({
      build: { kind: 'build', targets: ['cities', 'region'] },
      cities: {
        kind: 'create',
        selected: 'build',
        agent: 'city',
        agentCount: { attribute: 'cityCount' },
      },
      region: { kind: 'buildGrid', selected: 'build', agents: ['city'], space: 'regionMap' },
    }),
    spaces: {
      regionMap: {
        kind: 'grid',
        label: 'Region',
        neighborhood: 'moore',
        dimensions: ['width', 'height'],
        attributes: {
          width: { type: 'integer', default: 3 },
          height: { type: 'integer', default: 3 },
        },
      },
    },
    agents: {
      city: {
        kind: 'scape',
        label: 'City',
        pluralLabel: 'Cities',
        attributes: { people: { type: 'integer', default: 4 } },
        acts: group({
          settle: { kind: 'initialize', targets: ['spot'] },
          spot: { kind: 'select', selected: 'settle', space: 'regionMap', targets: ['free'] },
          free: { kind: 'query', selected: 'spot', function: 'available', targets: ['go'] },
          go: { kind: 'move', selected: 'settle', destination: 'spot' },
          found: { kind: 'build', targets: ['folk', 'streets'] },
          folk: {
            kind: 'create',
            selected: 'found',
            agent: 'city.person',
            agentCount: { attribute: 'city.people' },
          },
          streets: {
            kind: 'buildGrid',
            selected: 'found',
            agents: ['city.person'],
            space: 'city.map',
            fillAgent: 'city.lot',
          },
        }),
        spaces: {
          map: {
            kind: 'grid',
            label: 'Map',
            neighborhood: 'moore',
            borderRule: 'periodic',
            dimensions: ['width', 'height'],
            attributes: {
              width: { type: 'integer', default: 4 },
              height: { type: 'integer', default: 4 },
            },
          },
        },
        agents: {
          lot: { kind: 'agent', label: 'Lot' },
          person: {
            kind: 'agent',
            label: 'Person',
            pluralLabel: 'People',
            attributes: { seen: { type: 'integer' } },
            acts: group({
              arrive: { kind: 'initialize', targets: ['home'] },
              home: {
                kind: 'select',
                selected: 'arrive',
                agent: 'city.lot',
                space: 'city.map',
                targets: ['empty'],
              },
              empty: {
                kind: 'query',
                selected: 'home',
                function: 'available',
                targets: ['moveIn'],
              },
              moveIn: { kind: 'move', selected: 'arrive', destination: 'home' },
              count: { kind: 'rule', targets: ['others'] },
              others: {
                kind: 'select',
                selected: 'count',
                agent: 'city.person',
                space: 'city.map',
                targets: ['every', 'near'],
              },
              every: { kind: 'query', selected: 'others', function: 'all', targets: ['both'] },
              near: {
                kind: 'query',
                selected: 'others',
                function: 'within',
                inputs: [{ literal: 10 }],
                targets: ['both'],
              },
              both: { kind: 'all', selected: 'others', targets: ['inc'] },
              inc: {
                kind: 'evaluate',
                selected: 'count',
                function: 'increment',
                inputs: [{ attribute: 'city.person.seen' }],
                targets: ['setSeen'],
              },
              setSeen: {
                kind: 'set',
                selected: 'count',
                attribute: 'city.person.seen',
                parameter: { evaluate: 'inc' },
              },
            }),
          },
        },
      },
    },
  };

  it('gives each scape instance its own spaces and populations, placed in the outer scape', () => {
    const root = new RootScape(compileModel(regional), { seed: 1 });
    const cities = membersOf<InterpScape>(root, 'Cities');
    expect(cities).toHaveLength(2);
    expect(root.scapes.map((s) => s.name)).toEqual([
      'test',
      'Region',
      'Cities',
      'City',
      'City Map',
      'City People',
      'City 2',
      'City 2 Map',
      'City 2 People',
    ]);
    for (const city of cities) {
      expect(city.hostCell?.scape.name).toBe('Region');
      const map = city.spaces.get('map')!;
      const people = city.populations.get('person')!.members as InterpAgent[];
      expect(people).toHaveLength(4);
      expect(
        people.every((p) => p.hostCell?.scape === (map as unknown as { scape: Scape }).scape),
      ).toBe(true);
    }
    root.iterate();
    // Each person sees the three others of its own city, not those of the other.
    for (const city of cities) {
      for (const person of city.populations.get('person')!.members as InterpAgent[]) {
        expect(value(person, 'seen')).toBe(3);
      }
    }
    expect(root.allViews.map((view) => view.title)).toEqual(['Region', 'City: Map', 'City 2: Map']);
  });

  it('puts an agent in a grid and a network at once', () => {
    const model = gridModel(
      {
        meet: { kind: 'initialize', targets: ['friend'] },
        friend: { kind: 'select', selected: 'meet', agent: 'bug', targets: ['link'] },
        link: {
          kind: 'connect',
          selected: 'meet',
          destination: 'friend',
          within: 'net',
          directed: false,
        },
        count: { kind: 'rule', targets: ['linked'] },
        linked: {
          kind: 'select',
          selected: 'count',
          agent: 'bug',
          space: 'net',
          targets: ['every', 'next'],
        },
        every: { kind: 'query', selected: 'linked', function: 'all', targets: ['both'] },
        next: { kind: 'query', selected: 'linked', function: 'neighbor', targets: ['both'] },
        both: { kind: 'all', selected: 'linked', targets: ['inc'] },
        inc: {
          kind: 'evaluate',
          selected: 'count',
          function: 'increment',
          inputs: [{ attribute: 'bug.friends' }],
          targets: ['setFriends'],
        },
        setFriends: {
          kind: 'set',
          selected: 'count',
          attribute: 'bug.friends',
          parameter: { evaluate: 'inc' },
        },
        stand: { kind: 'initialize', targets: ['spot'] },
        spot: {
          kind: 'select',
          selected: 'stand',
          agent: 'cell',
          space: 'grid',
          targets: ['free'],
        },
        free: { kind: 'query', selected: 'spot', function: 'available', targets: ['go'] },
        go: { kind: 'move', selected: 'stand', destination: 'spot' },
      },
      {
        bugs: 6,
        bugAttributes: { friends: { type: 'integer' } },
        rootActs: {
          network: { kind: 'buildNetwork', selected: 'build', agents: ['bug'], space: 'net' },
        },
      },
    );
    model.acts!.build = { kind: 'build', targets: ['createBugs', 'fill', 'network'] };
    model.spaces!.net = { kind: 'network', label: 'Friends' };
    const root = new RootScape(compileModel(model), { seed: 4 });
    const graph = scapeNamed(root, 'Friends').space as Graph<Agent>;
    expect(scapeNamed(root, 'Friends').members).toHaveLength(6);
    expect(graph.edgeCount).toBeGreaterThan(0);
    root.iterate();
    for (const bug of bugs(root)) {
      expect(bug.hostCell).toBeDefined();
      expect(value(bug, 'friends')).toBe(graph.neighbors(bug).length);
    }
  });

  it('moves agents toward the nearest of another type in a continuous space', () => {
    const model: Model = {
      schemaVersion: 2,
      id: 'test',
      language: 'typescript',
      acts: group({
        build: { kind: 'build', targets: ['walkers', 'goals', 'place'] },
        walkers: { kind: 'create', selected: 'build', agent: 'walker', agentCount: { literal: 3 } },
        goals: { kind: 'create', selected: 'build', agent: 'goal', agentCount: { literal: 2 } },
        place: {
          kind: 'buildSpace',
          selected: 'build',
          agents: ['walker', 'goal'],
          space: 'plane',
        },
      }),
      spaces: {
        plane: {
          kind: 'continuous',
          label: 'Plane',
          borderRule: 'periodic',
          dimensions: ['width', 'height'],
          attributes: {
            width: { type: 'real', default: 50 },
            height: { type: 'real', default: 50 },
          },
        },
      },
      agents: {
        goal: { kind: 'agent', label: 'Goal', pluralLabel: 'Goals' },
        walker: {
          kind: 'agent',
          label: 'Walker',
          pluralLabel: 'Walkers',
          acts: group({
            walk: { kind: 'rule', targets: ['target'] },
            target: {
              kind: 'select',
              selected: 'walk',
              agent: 'goal',
              space: 'plane',
              targets: ['closest', 'there'],
            },
            closest: { kind: 'query', selected: 'target', function: 'nearest', targets: ['both'] },
            there: { kind: 'query', selected: 'target', function: 'toward', targets: ['both'] },
            both: { kind: 'all', selected: 'target', targets: ['step'] },
            step: { kind: 'move', selected: 'walk', destination: 'target' },
          }),
        },
      },
    };
    const root = new RootScape(compileModel(model), { seed: 5 });
    const plane = scapeNamed(root, 'Walkers').space as unknown as {
      distance(a: Agent, b: Agent): number;
    };
    const goals = membersOf(root, 'Goals');
    const nearest = (walker: InterpAgent) =>
      Math.min(...goals.map((goal) => plane.distance(walker, goal)));
    const before = membersOf(root, 'Walkers').map(nearest);
    root.iterate();
    const after = membersOf(root, 'Walkers').map(nearest);
    after.forEach((d, i) => expect(d).toBeCloseTo(Math.max(0, before[i]! - 1)));
  });
});

// ───────────────────────────── What is not supported yet ─────────────────────────────

describe('unsupported models', () => {
  it('rejects geographies with a list of what is not supported', () => {
    const model = gridModel({});
    model.spaces!.world = { kind: 'geography' };
    expect(() => compileModel(model)).toThrow(UnsupportedModelError);
    expect(() => compileModel(model)).toThrow(/geography `world`/);
  });
});

// Keep a reference to engine types used only for casts above.
export type { Cell, CellOccupant };

describe('checking execution settings', () => {
  it('accepts the rule acts of the agent, by path, and rejects anything else', async () => {
    const { checkModel } = await import('./check');
    const model = counterModel(incrementN);
    model.agents!.a!.execution = { rules: ['step', 'inc', 'missing', 'step'] };
    const errors = checkModel(model)
      .filter((d) => d.severity === 'error')
      .map((d) => d.message);
    expect(errors).toEqual([
      '`inc` is not a rule, schedule or diffuse act, which are what run each period.',
      '`missing` is not an act of this agent.',
      '`step` is listed twice.',
    ]);
  });
});
