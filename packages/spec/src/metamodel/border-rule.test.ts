// SPDX-License-Identifier: EPL-2.0
import { RootScape, type Agent, type Array2D, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { checkModel } from './check';
import { compileModel } from './interpreter';
import type { Holder, InterpAgent, InterpCell } from './runtime';
import type { Attribute, Model, Space } from './types';

// A grid whose border rule is held by one of its own attributes, so a parameter chooses it.

function model(edges: Attribute = edgesAttribute, rule: Model['spaces'] = undefined): Model {
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
        borderRule: { attribute: 'edges' },
        dimensions: ['width', 'height'],
        attributes: {
          width: { type: 'integer', default: 5 },
          height: { type: 'integer', default: 5 },
          edges: edges,
        },
      },
    },
  };
}

const edgesAttribute: Attribute = {
  type: 'state',
  label: 'Edges',
  options: { periodic: { label: 'Wrap' }, sticky: { label: 'Stop' } },
  defaultOption: 'periodic',
};

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
  'a border rule chosen by a parameter, %s',
  (execution) => {
    it('wraps with the default option, and stops at the edge with the other', () => {
      expect(neighbours(execution)).toBe(8);
      expect(neighbours(execution, { 'grid.edges': 'sticky' })).toBe(3);
      expect(neighbours(execution, { 'grid.edges': 'periodic' })).toBe(8);
    });
  },
);

describe('checking a border rule held by an attribute', () => {
  const errors = (m: Model) =>
    checkModel(m)
      .filter((d) => d.severity === 'error')
      .map((d) => `${d.path}: ${d.message}`);

  it('accepts a state attribute of the space whose options are border rules', () => {
    expect(errors(model())).toEqual([]);
  });

  it('reports an attribute that is not the space’s, not a state, or has other options', () => {
    const base = model().spaces!['grid'] as Extract<Space, { kind: 'grid' }>;
    expect(
      errors(model(undefined, { grid: { ...base, borderRule: { attribute: 'edge' } } })),
    ).toEqual([
      expect.stringMatching(/borderRule\.attribute: `edge` is not an attribute of this space/),
    ]);
    expect(errors(model({ type: 'boolean', default: true }))).toEqual([
      expect.stringMatching(
        /borderRule\.attribute: The border rule `edges` must be a state attribute/,
      ),
    ]);
    expect(
      errors(
        model({
          ...edgesAttribute,
          options: { ...edgesAttribute.options, bouncy: {} },
        } as Attribute),
      ),
    ).toEqual([expect.stringMatching(/options\.bouncy: `bouncy` is not a border rule/)]);
  });
});
