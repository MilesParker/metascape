// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { assertValidModel, checkModel } from './check';
import {
  ModelFormatError,
  type Action,
  type Expression,
  type ModelSpec,
  type Selection,
} from './schema';

/** A small valid model with every kind of space and agent. Each case breaks one thing. */
const base: ModelSpec = {
  schemaVersion: 1,
  name: 'Base',
  parameters: {
    size: { type: 'int', default: 10, min: 2 },
    speed: { type: 'real', default: 1 },
    mode: { type: 'choice', options: ['a', 'b'], default: 'a' },
  },
  spaces: {
    land: { kind: 'grid', width: 'param.size', height: 'param.size' },
    room: { kind: 'continuous', width: 50, height: 50 },
    ties: { kind: 'network', nodes: 'person' },
  },
  agents: {
    patch: { space: 'land', as: 'cell', attributes: { food: { type: 'real', record: true } } },
    walker: {
      space: 'land',
      count: 5,
      attributes: {
        energy: { type: 'real', initial: 1, record: true },
        mood: { type: 'state', states: ['calm', 'angry'], record: true },
        stance: { type: 'state', states: ['calm', 'angry'] },
        steps: { type: 'int' },
      },
    },
    bird: { space: 'room', count: 3, attributes: { height: { type: 'real' } } },
    person: { count: 4, attributes: { sick: { type: 'boolean', record: true } } },
  },
  charts: [{ kind: 'timeSeries', title: 'Walkers', series: ['walker.count'] }],
};

const variant = (change: (model: ModelSpec) => void): ModelSpec => {
  const copy = JSON.parse(JSON.stringify(base)) as ModelSpec;
  change(copy);
  return copy;
};

/** Gives an agent type one rule with these actions. */
const rule =
  (agent: string, actions: Action[], synchronous = false) =>
  (model: ModelSpec): void => {
    model.agents[agent]!.rules = [
      { name: 'test', do: actions, ...(synchronous ? { synchronous } : {}) },
    ];
  };

const walker = (...actions: Action[]) => rule('walker', actions);
const at = (agent: string, rest: string): string => `agents.${agent}.rules[0].do${rest}`;
const aggregate = (kind: 'count' | 'sum', over: Selection, of?: Expression): Expression =>
  of === undefined ? { aggregate: kind, over } : { aggregate: kind, over, of };

interface Case {
  readonly name: string;
  readonly change: (model: ModelSpec) => void;
  readonly path: string;
  /** Words the message must contain: the offending name, and a suggestion if any. */
  readonly mentions: readonly string[];
}

const cases: Case[] = [
  // ── Names and references
  {
    name: 'unknown attribute, with a suggestion',
    change: walker({ set: 'energy', to: 'enrgy' }),
    path: at('walker', '[0].to'),
    mentions: ['enrgy', 'did you mean "energy"'],
  },
  {
    name: 'unknown parameter, with a suggestion',
    change: walker({ set: 'energy', to: 'param.sped' }),
    path: at('walker', '[0].to'),
    mentions: ['sped', 'did you mean "speed"'],
  },
  {
    name: 'choice parameter in an expression',
    change: walker({ set: 'energy', to: 'param.mode' }),
    path: at('walker', '[0].to'),
    mentions: ['mode', 'choice'],
  },
  {
    name: 'unknown space in a size reference',
    change: walker({ set: 'energy', to: 'space.lnd.width' }),
    path: at('walker', '[0].to'),
    mentions: ['lnd', 'did you mean "land"'],
  },
  {
    name: '.cell of an agent that is not an occupant',
    change: rule('bird', [{ let: 'c', value: 'self.cell' }]),
    path: at('bird', '[0].value'),
    mentions: ['self.cell', 'bird'],
  },
  {
    name: '.x of a grid occupant',
    change: walker({ set: 'energy', to: 'self.x' }),
    path: at('walker', '[0].to'),
    mentions: ['self.x', 'self.cell.x'],
  },
  {
    name: 'a let name already in scope',
    change: walker({ let: 'n', value: 1 }, { let: 'n', value: 2 }),
    path: at('walker', '[1].let'),
    mentions: ['"n"'],
  },
  {
    name: 'a nested selection reusing the default binding',
    change: walker({
      with: { type: 'walker', from: 'neighbors' },
      do: [{ with: { type: 'walker', from: 'neighbors' }, do: [] }],
    }),
    path: at('walker', '[0].do[0].with.as'),
    mentions: ['"other"', 'as'],
  },
  {
    name: 'a binding named after a local variable',
    change: walker({ let: 'other', value: 1 }, { with: { type: 'walker', from: 'all' }, do: [] }),
    path: at('walker', '[1].with.as'),
    mentions: ['"other"'],
  },
  {
    name: 'a reserved binding name',
    change: walker({ with: { type: 'walker', from: 'all', as: 'self' }, do: [] }),
    path: at('walker', '[0].with.as'),
    mentions: ['"self"'],
  },
  // ── Types
  {
    name: 'a real where an int is wanted',
    change: walker({ set: 'steps', to: 1.5 }),
    path: at('walker', '[0].to'),
    mentions: ['steps', 'floor'],
  },
  {
    name: 'a boolean where a real is wanted',
    change: walker({ set: 'energy', to: true }),
    path: at('walker', '[0].to'),
    mentions: ['energy', 'boolean'],
  },
  {
    name: 'an operator argument of the wrong type',
    change: walker({ set: 'energy', to: { op: 'add', args: ['energy', true] } }),
    path: at('walker', '[0].to.args[1]'),
    mentions: ['add', 'argument 2'],
  },
  {
    name: 'an operator with the wrong number of arguments',
    change: walker({ set: 'energy', to: { op: 'sub', args: [1] } }),
    path: at('walker', '[0].to'),
    mentions: ['sub', '2 arguments'],
  },
  {
    name: 'randomInt with a real bound',
    change: walker({ set: 'steps', to: { op: 'randomInt', args: [1, 2.5] } }),
    path: at('walker', '[0].to.args[1]'),
    mentions: ['randomInt', 'an int'],
  },
  {
    name: 'an unknown state, with a suggestion',
    change: walker({ set: 'mood', to: { state: 'clam' } }),
    path: at('walker', '[0].to'),
    mentions: ['clam', 'did you mean "calm"'],
  },
  {
    name: 'a state literal without context',
    change: walker({ let: 's', value: { state: 'calm' } }),
    path: at('walker', '[0].value'),
    mentions: ['calm', 'context'],
  },
  {
    name: 'eq between a state and a number',
    change: walker({ if: { op: 'eq', args: ['mood', 'energy'] }, then: [] }),
    path: at('walker', '[0].if'),
    mentions: ['eq', '"mood"', '"energy"'],
  },
  {
    name: 'eq between two different state attributes',
    change: walker({ if: { op: 'eq', args: ['mood', 'stance'] }, then: [] }),
    path: at('walker', '[0].if'),
    mentions: ['eq', '"stance"'],
  },
  {
    name: 'if with branches of different types',
    change: walker({ set: 'energy', to: { op: 'if', args: [true, 1, false] } }),
    path: at('walker', '[0].to'),
    mentions: ['if', 'boolean'],
  },
  {
    name: 'a condition that is not a boolean',
    change: walker({ if: 'energy', then: [] }),
    path: at('walker', '[0].if'),
    mentions: ['"energy"', 'boolean'],
  },
  {
    name: 'distance between agents in different spaces',
    change: walker({
      with: { type: 'bird', from: 'all' },
      do: [{ let: 'd', value: { op: 'distance', args: ['self', 'other'] } }],
    }),
    path: at('walker', '[0].do[0].value'),
    mentions: ['distance', '"bird"'],
  },
  // ── Structure
  {
    name: 'a reserved attribute name',
    change: (m) => (m.agents.walker!.attributes!.x = { type: 'real' }),
    path: 'agents.walker.attributes.x',
    mentions: ['"x"', 'reserved'],
  },
  {
    name: 'a grid without a cell type',
    change: (m) => delete m.agents.patch,
    path: 'spaces.land',
    mentions: ['"land"', 'as: "cell"'],
  },
  {
    name: 'a grid with two cell types',
    change: (m) => (m.agents.soil = { space: 'land', as: 'cell' }),
    path: 'agents.soil.as',
    mentions: ['"patch"', '"soil"'],
  },
  {
    name: 'a cell type with a count',
    change: (m) => (m.agents.patch!.count = 3),
    path: 'agents.patch.count',
    mentions: ['"patch"', 'count'],
  },
  {
    name: '"as" outside a grid',
    change: (m) => (m.agents.bird!.as = 'occupant'),
    path: 'agents.bird.as',
    mentions: ['"bird"', 'room'],
  },
  {
    name: 'an unknown space, with a suggestion',
    change: (m) => (m.agents.walker!.space = 'lnd'),
    path: 'agents.walker.space',
    mentions: ['lnd', 'did you mean "land"'],
  },
  {
    name: 'an agent living in a network',
    change: (m) => (m.agents.person!.space = 'ties'),
    path: 'agents.person.space',
    mentions: ['"ties"', 'network'],
  },
  {
    name: 'a network whose nodes are not an agent type',
    change: (m) => (m.spaces!.ties = { kind: 'network', nodes: 'persn' }),
    path: 'spaces.ties.nodes',
    mentions: ['persn', 'did you mean "person"'],
  },
  {
    name: 'a space size that is not constant',
    change: (m) => (m.spaces!.land = { kind: 'grid', width: 'tick', height: 10 }),
    path: 'spaces.land.width',
    mentions: ['"tick"', 'parameters'],
  },
  {
    name: 'a random space size',
    change: (m) =>
      (m.spaces!.land = { kind: 'grid', width: { op: 'randomInt', args: [1, 5] }, height: 10 }),
    path: 'spaces.land.width',
    mentions: ['randomInt'],
  },
  {
    name: 'a grid size that is not an int',
    change: (m) => (m.spaces!.land = { kind: 'grid', width: 10.5, height: 10 }),
    path: 'spaces.land.width',
    mentions: ['10.5', 'an int'],
  },
  {
    name: 'a population that is not an int',
    change: (m) => (m.agents.walker!.count = 'param.speed'),
    path: 'agents.walker.count',
    mentions: ['"param.speed"', 'an int'],
  },
  {
    name: 'a parameter default outside its range',
    change: (m) => (m.parameters!.size = { type: 'int', default: 1, min: 2 }),
    path: 'parameters.size.default',
    mentions: ['"size"', 'min'],
  },
  // ── Selections
  {
    name: 'an unknown selection type, with a suggestion',
    change: walker({ with: { type: 'walkr', from: 'all' }, do: [] }),
    path: at('walker', '[0].with.type'),
    mentions: ['walkr', 'did you mean "walker"'],
  },
  {
    name: 'neighbors across spaces',
    change: walker({ with: { type: 'bird', from: 'neighbors' }, do: [] }),
    path: at('walker', '[0].with.from'),
    mentions: ['neighbors', '"bird"'],
  },
  {
    name: 'here from an agent without a grid',
    change: rule('bird', [{ forEach: { type: 'patch', from: 'here' }, do: [] }]),
    path: at('bird', '[0].forEach.from'),
    mentions: ['here', '"bird"'],
  },
  {
    name: 'within without a radius',
    change: walker({ with: { type: 'patch', from: 'within' }, do: [] }),
    path: at('walker', '[0].with'),
    mentions: ['within', 'radius'],
  },
  {
    name: 'within with a boolean radius',
    change: walker({ with: { type: 'patch', from: 'within', radius: true }, do: [] }),
    path: at('walker', '[0].with.radius'),
    mentions: ['true', 'number'],
  },
  {
    name: 'within across spaces',
    change: walker({ with: { type: 'bird', from: 'within', radius: 3 }, do: [] }),
    path: at('walker', '[0].with.from'),
    mentions: ['within', '"bird"'],
  },
  {
    name: 'a radius outside within',
    change: walker({ with: { type: 'walker', from: 'neighbors', radius: 2, as: 'n' }, do: [] }),
    path: at('walker', '[0].with.radius'),
    mentions: ['radius', 'neighbors'],
  },
  {
    name: 'linked without a network',
    change: rule('person', [{ with: { type: 'person', from: 'linked' }, do: [] }]),
    path: at('person', '[0].with'),
    mentions: ['linked', 'network'],
  },
  {
    name: 'linked from an agent that is not a node',
    change: walker({ with: { type: 'person', from: 'linked', network: 'ties' }, do: [] }),
    path: at('walker', '[0].with.network'),
    mentions: ['"ties"', '"walker"'],
  },
  {
    name: 'linked through an unknown network',
    change: rule('person', [{ with: { type: 'person', from: 'linked', network: 'tie' }, do: [] }]),
    path: at('person', '[0].with.network'),
    mentions: ['tie', 'did you mean "ties"'],
  },
  {
    name: 'pick nearest without a spatial scope',
    change: walker({ with: { type: 'walker', from: 'all', pick: 'nearest' }, do: [] }),
    path: at('walker', '[0].with.pick'),
    mentions: ['nearest', 'all'],
  },
  {
    name: 'pick max of a state',
    change: walker({ with: { type: 'walker', from: 'all', pick: { max: 'other.mood' } }, do: [] }),
    path: at('walker', '[0].with.pick.max'),
    mentions: ['"other.mood"', 'number'],
  },
  {
    name: 'sum without of',
    change: walker({ let: 's', value: aggregate('sum', { type: 'walker', from: 'all' }) }),
    path: at('walker', '[0].value'),
    mentions: ['sum', 'of'],
  },
  {
    name: 'sum of a state',
    change: walker({
      let: 's',
      value: aggregate('sum', { type: 'walker', from: 'all' }, 'other.mood'),
    }),
    path: at('walker', '[0].value.of'),
    mentions: ['sum', '"other.mood"'],
  },
  {
    name: 'count with a numeric condition',
    change: walker({
      let: 's',
      value: aggregate('count', { type: 'walker', from: 'all' }, 'other.energy'),
    }),
    path: at('walker', '[0].value.of'),
    mentions: ['"other.energy"', 'boolean'],
  },
  // ── Actions
  {
    name: 'set on a parameter',
    change: walker({ set: 'param.speed', to: 2 }),
    path: at('walker', '[0].set'),
    mentions: ['param.speed', 'attribute'],
  },
  {
    name: 'set on a local variable',
    change: walker({ let: 'n', value: 1 }, { set: 'n', to: 2 }),
    path: at('walker', '[1].set'),
    mentions: ['"n"', 'attribute'],
  },
  {
    name: 'moveTo by an agent that is not a grid occupant',
    change: rule('bird', [{ moveTo: { type: 'patch', from: 'all' } }]),
    path: at('bird', '[0].moveTo'),
    mentions: ['moveTo', '"bird"'],
  },
  {
    name: 'moveTo to an agent of another space',
    change: walker({ moveTo: { type: 'bird', from: 'all' } }),
    path: at('walker', '[0].moveTo.type'),
    mentions: ['"bird"', '"patch"'],
  },
  {
    name: 'moveTo onto an occupant of a single-occupancy grid',
    change: walker({ moveTo: { type: 'walker', from: 'neighbors' } }),
    path: at('walker', '[0].moveTo.type'),
    mentions: ['"walker"', 'multiOccupancy'],
  },
  {
    name: 'moveBy on a grid',
    change: walker({ moveBy: { dx: 1, dy: 0 } }),
    path: at('walker', '[0].moveBy'),
    mentions: ['moveBy', '"walker"'],
  },
  {
    name: 'moveToward a target in no continuous space',
    change: rule('bird', [
      { with: { type: 'person', from: 'all' }, do: [{ moveToward: 'other', distance: 1 }] },
    ]),
    path: at('bird', '[0].do[0].moveToward'),
    mentions: ['"other"', '"person"'],
  },
  {
    name: 'create of an unknown type, with a suggestion',
    change: walker({ create: 'walkr' }),
    path: at('walker', '[0].create'),
    mentions: ['walkr', 'did you mean "walker"'],
  },
  {
    name: 'create of cells',
    change: walker({ create: 'patch' }),
    path: at('walker', '[0].create'),
    mentions: ['"patch"', 'cells'],
  },
  {
    name: 'create here in another space',
    change: walker({ create: 'bird', at: 'here' }),
    path: at('walker', '[0].at'),
    mentions: ['"bird"', '"walker"'],
  },
  {
    name: 'create at a neighbor in a continuous space',
    change: rule('bird', [{ create: 'bird', at: 'neighbor' }]),
    path: at('bird', '[0].at'),
    mentions: ['neighbor', '"room"'],
  },
  {
    name: 'create setting an unknown attribute, with a suggestion',
    change: walker({ create: 'walker', set: { enrgy: 1 } }),
    path: at('walker', '[0].set.enrgy'),
    mentions: ['enrgy', 'did you mean "energy"'],
  },
  {
    name: 'create setting an attribute to the wrong type',
    change: walker({ create: 'walker', set: { energy: true } }),
    path: at('walker', '[0].set.energy'),
    mentions: ['"energy"', 'boolean'],
  },
  {
    name: 'create with a real count',
    change: walker({ create: 'walker', count: 1.5 }),
    path: at('walker', '[0].count'),
    mentions: ['1.5', 'an int'],
  },
  {
    name: 'connect through a space that is not a network',
    change: rule('person', [
      { with: { type: 'person', from: 'all' }, do: [{ connect: 'other', network: 'land' }] },
    ]),
    path: at('person', '[0].do[0].network'),
    mentions: ['"land"', 'not a network'],
  },
  {
    name: 'connect from an agent that is not a node',
    change: walker({
      with: { type: 'person', from: 'all' },
      do: [{ connect: 'other', network: 'ties' }],
    }),
    path: at('walker', '[0].do[0].network'),
    mentions: ['"ties"', '"walker"'],
  },
  {
    name: 'disconnect from an agent of the wrong type',
    change: rule('person', [
      { with: { type: 'walker', from: 'all' }, do: [{ disconnect: 'other', network: 'ties' }] },
    ]),
    path: at('person', '[0].do[0].disconnect'),
    mentions: ['"other"', '"walker"'],
  },
  {
    name: 'a cell that dies',
    change: rule('patch', [{ die: true }]),
    path: at('patch', '[0].die'),
    mentions: ['"patch"', 'Cells cannot die'],
  },
  {
    name: 'killing a cell',
    change: walker({ die: 'self.cell' }),
    path: at('walker', '[0].die'),
    mentions: ['"patch"'],
  },
  {
    name: 'a disallowed action in a synchronous rule',
    change: rule('walker', [{ moveTo: { type: 'patch', from: 'neighbors' } }], true),
    path: at('walker', '[0]'),
    mentions: ['"moveTo"', 'synchronous'],
  },
  {
    name: 'a synchronous rule setting another agent',
    change: rule(
      'walker',
      [
        {
          forEach: { type: 'walker', from: 'neighbors' },
          do: [{ set: 'other.energy', to: 0 }],
        },
      ],
      true,
    ),
    path: at('walker', '[0].do[0].set'),
    mentions: ['"other.energy"', 'synchronous'],
  },
  // ── Initial values, styles, charts, stopWhen
  {
    name: 'an initial value reading a later attribute',
    change: (m) => (m.agents.walker!.attributes!.energy!.initial = 'steps'),
    path: 'agents.walker.attributes.energy.initial',
    mentions: ['"steps"', 'before'],
  },
  {
    name: 'an initial state that is not one of the states',
    change: (m) => (m.agents.walker!.attributes!.mood!.initial = { state: 'happy' }),
    path: 'agents.walker.attributes.mood.initial',
    mentions: ['"happy"', 'calm, angry'],
  },
  {
    name: 'a style colour that is not a colour',
    change: (m) => (m.agents.walker!.style = { color: 1 }),
    path: 'agents.walker.style.color',
    mentions: ['style color', 'a color'],
  },
  {
    name: 'a style using randomness',
    change: (m) =>
      (m.agents.walker!.style = {
        color: {
          op: 'if',
          args: [{ op: 'chance', args: [0.5] }, { color: '#000000' }, { color: '#ffffff' }],
        },
      }),
    path: 'agents.walker.style.color.args[0]',
    mentions: ['"chance"', 'random'],
  },
  {
    name: 'an unknown chart series, with a suggestion',
    change: (m) => (m.charts = [{ kind: 'bars', title: 'x', series: ['walker.enrgy.mean'] }]),
    path: 'charts[0].series[0]',
    mentions: ['walker.enrgy.mean', 'did you mean "walker.energy.mean"'],
  },
  {
    name: 'a chart of an attribute that is not recorded',
    change: (m) => (m.charts = [{ kind: 'bars', title: 'x', series: ['walker.steps.mean'] }]),
    path: 'charts[0].series[0]',
    mentions: ['walker.steps.mean', 'record: true'],
  },
  {
    name: 'a chart of a statistic that is not recorded',
    change: (m) =>
      (m.charts = [{ kind: 'timeSeries', title: 'x', series: ['walker', 'walker.energy.stdDev'] }]),
    path: 'charts[0].series[1]',
    mentions: ['walker.energy.stdDev', 'records only'],
  },
  {
    name: 'stopWhen reading self',
    change: (m) => (m.stopWhen = 'self.sick'),
    path: 'stopWhen',
    mentions: ['self', 'stopWhen'],
  },
  {
    name: 'stopWhen with a bare attribute name',
    change: (m) => (m.stopWhen = 'sick'),
    path: 'stopWhen',
    mentions: ['"sick"', 'no acting agent'],
  },
  {
    name: 'stopWhen with a selection that needs an origin',
    change: (m) => (m.stopWhen = aggregate('count', { type: 'walker', from: 'neighbors' })),
    path: 'stopWhen.over',
    mentions: ['"neighbors"', 'stopWhen'],
  },
  {
    name: 'stopWhen that is not a boolean',
    change: (m) => (m.stopWhen = 'tick'),
    path: 'stopWhen',
    mentions: ['"tick"', 'boolean'],
  },
];

describe('checkModel', () => {
  it('accepts the base model', () => {
    expect(checkModel(base)).toEqual([]);
  });

  it('has a broad table of broken models', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(cases)('reports $name', ({ change, path, mentions }) => {
    const diagnostics = checkModel(variant(change));
    const found = diagnostics.find((d) => d.path === path);
    expect(found, `no diagnostic at ${path}; got ${JSON.stringify(diagnostics)}`).toBeDefined();
    for (const word of mentions) expect(found!.message).toContain(word);
  });

  it('accepts what the rules allow', () => {
    const allowed = variant((m) => {
      m.spaces!.land = {
        kind: 'grid',
        width: { op: 'mul', args: ['param.size', 2] },
        height: 'param.size',
        multiOccupancy: true,
      };
      m.agents.walker!.attributes!.steps!.initial = { op: 'randomInt', args: [0, 3] };
      m.agents.walker!.attributes!.energy!.initial = 2;
      m.agents.walker!.rules = [
        {
          name: 'ok',
          do: [
            { set: 'energy', to: 'steps' },
            { set: 'mood', to: { op: 'if', args: [true, { state: 'calm' }, 'mood'] } },
            { moveTo: { type: 'walker', from: 'neighbors', as: 'friend' } },
            {
              with: { type: 'patch', from: 'here', as: 'site' },
              do: [{ set: 'site.food', to: 0 }],
            },
            { set: 'self.cell.food', to: { op: 'abs', args: ['self.cell.x'] } },
          ],
        },
      ];
      m.agents.bird!.attributes!.height!.initial = 'self.x';
      m.stopWhen = {
        op: 'ge',
        args: [aggregate('count', { type: 'walker', from: 'all' }, 'other.energy'), 'tick'],
      };
    });
    const diagnostics = checkModel(allowed);
    // The stopWhen above is deliberately wrong (a numeric count condition); only it should fail.
    expect(diagnostics.map((d) => d.path)).toEqual(['stopWhen.args[0].of']);
  });

  it('reports structural problems before meaning', () => {
    const broken = { ...base, agents: { walker: { count: 'not a reference!' } } };
    const diagnostics = checkModel(broken as unknown as ModelSpec);
    expect(diagnostics[0]?.path).toBe('agents.walker.count');
  });

  it('assertValidModel throws a ModelFormatError with the diagnostics', () => {
    expect(() => assertValidModel(base)).not.toThrow();
    const broken = variant(walker({ set: 'energy', to: 'enrgy' }));
    expect(() => assertValidModel(broken)).toThrow(ModelFormatError);
    try {
      assertValidModel(broken);
    } catch (error) {
      expect((error as ModelFormatError).diagnostics).toEqual(checkModel(broken));
      expect((error as Error).message).toContain('enrgy');
    }
  });
});
