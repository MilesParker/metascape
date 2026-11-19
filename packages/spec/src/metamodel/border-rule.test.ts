// SPDX-License-Identifier: EPL-2.0
import { RootScape, type Agent, type Array2D, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { checkModel } from './check';
import { compileModel } from './interpreter';
import type { Holder, InterpAgent, InterpCell } from './runtime';
import type { Attribute, Model, Space } from './types';

// A grid that is periodic while one of its own boolean attributes is true, so a parameter sets it.

function model(periodic: Attribute = periodicAttribute, rule: Model['spaces'] = undefined): Model {
  return {
    schemaVersion: 2,
    id: 'test',
    language: 'typescript',
    attributes: { bugCount: { type: 'integer', default: 1 } },
    acts: {
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
    },
    agents: {
      bug: {
        kind: 'agent',
        label: 'Bug',
        pluralLabel: 'Bugs',
        attributes: { seen: { type: 'integer' } },
        acts: {
          look: { kind: 'rule', targets: ['cells'] },
          cells: {
            kind: 'select',
            selected: 'look',
            agent: 'cell',
            space: 'grid',
            targets: ['near'],
          },
          near: { kind: 'query', selected: 'cells', function: 'neighbor', targets: ['each'] },
          each: { kind: 'query', selected: 'cells', function: 'all', targets: ['inc'] },
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
      },
      cell: { kind: 'agent', label: 'Cell' },
    },
    spaces: rule ?? {
      grid: {
        kind: 'grid',
        label: 'Grid',
        neighborhood: 'moore',
        borderRule: { periodic: 'periodic' },
        dimensions: ['width', 'height'],
        attributes: {
          width: { type: 'integer', default: 5 },
          height: { type: 'integer', default: 5 },
          periodic,
        },
      },
    },
  };
}

const periodicAttribute: Attribute = { type: 'boolean', label: 'Periodic', default: true };

function scapeNamed(root: RootScape, name: string): Scape<Agent> {
  return root.scapes.find((scape) => scape.name === name)!;
}

/** How many cells a bug in the corner counts as its neighbours. */
function neighbours(execution: 'interpreted' | 'generated', parameters: object = {}): number {
  const root = new RootScape(compileModel(model(), { execution }), {
    seed: 1,
    parameters: parameters as never,
  });
  const grid = scapeNamed(root, 'Grid').space as unknown as Array2D<InterpCell>;
  const bug = scapeNamed(root, 'Bugs').members[0] as unknown as InterpAgent & Holder;
  bug.moveTo(grid.at(0, 0)!);
  root.iterate();
  return bug.context!.state.read(bug, bug.info.attribute.get('seen')!) as number;
}

describe.each(['interpreted', 'generated'] as const)(
  'a border rule set by a parameter, %s',
  (execution) => {
    it('is periodic while the attribute is true, and aperiodic while it is false', () => {
      expect(neighbours(execution)).toBe(8);
      expect(neighbours(execution, { 'grid.periodic': false })).toBe(3);
      expect(neighbours(execution, { 'grid.periodic': true })).toBe(8);
    });
  },
);

describe('checking a border rule set by an attribute', () => {
  const errors = (m: Model) =>
    checkModel(m)
      .filter((d) => d.severity === 'error')
      .map((d) => `${d.path}: ${d.message}`);

  it('accepts a boolean attribute of the space', () => {
    expect(errors(model())).toEqual([]);
  });

  it('reports an attribute that is not the space’s, or not a boolean', () => {
    const base = model().spaces!['grid'] as Extract<Space, { kind: 'grid' }>;
    expect(
      errors(model(undefined, { grid: { ...base, borderRule: { periodic: 'wraps' } } })),
    ).toEqual([
      expect.stringMatching(/borderRule\.periodic: `wraps` is not an attribute of this space/),
    ]);
    expect(errors(model({ type: 'state', options: { yes: {}, no: {} } } as Attribute))).toEqual([
      expect.stringMatching(/borderRule\.periodic: The border rule's `periodic` must be a boolean/),
    ]);
  });
});
