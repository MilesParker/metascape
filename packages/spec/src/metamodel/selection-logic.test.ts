// SPDX-License-Identifier: EPL-2.0
import { RootScape, type Agent, type Array2D, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { compileModel } from './interpreter';
import type { InterpAgent, InterpCell, Holder } from './runtime';
import type { Act, Model } from './types';

// Queries and logic acts on a selection's candidates that take evaluates of the
// candidate (its column, here) as inputs, in both execution modes.

function model(acts: Record<string, Act>): Model {
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
          look: { kind: 'rule', targets: ['myX', 'cells'] },
          cells: {
            kind: 'select',
            selected: 'look',
            agent: 'cell',
            space: 'grid',
            targets: ['near', 'each', 'candX', ...('isA' in acts ? ['isA'] : [])],
          },
          near: { kind: 'query', selected: 'cells', function: 'neighbor', targets: ['combined'] },
          each: { kind: 'query', selected: 'cells', function: 'all', targets: ['combined'] },
          candX: { kind: 'evaluate', selected: 'cells', function: 'locationX', targets: ['dx'] },
          myX: { kind: 'evaluate', selected: 'look', function: 'locationX', targets: ['dx'] },
          dx: {
            kind: 'evaluate',
            selected: 'cells',
            function: 'sub',
            inputs: [{ evaluate: 'candX' }, { evaluate: 'myX' }],
            targets: ['absDx'],
          },
          absDx: {
            kind: 'evaluate',
            selected: 'cells',
            function: 'abs',
            inputs: [{ evaluate: 'dx' }],
            targets: ['adjacent'],
          },
          adjacent: {
            kind: 'query',
            selected: 'cells',
            function: 'lesserorEqual',
            inputs: [{ evaluate: 'absDx' }, { literal: 1 }],
            targets: ['combined'],
          },
          ...acts,
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
      cell: { kind: 'agent', label: 'Cell', attributes: { kind: { type: 'symbol' } } },
    },
    spaces: {
      grid: {
        kind: 'grid',
        label: 'Grid',
        neighborhood: 'moore',
        borderRule: 'periodic',
        dimensions: ['width', 'height'],
        attributes: {
          width: { type: 'integer', default: 5 },
          height: { type: 'integer', default: 5 },
        },
      },
    },
  };
}

function scapeNamed(root: RootScape, name: string): Scape<Agent> {
  return root.scapes.find((scape) => scape.name === name)!;
}

function seen(m: Model, execution: 'interpreted' | 'generated'): number {
  const root = new RootScape(compileModel(m, { execution }), { seed: 1 });
  const grid = scapeNamed(root, 'Grid').space as unknown as Array2D<InterpCell>;
  const bug = scapeNamed(root, 'Bugs').members[0] as unknown as InterpAgent & Holder;
  // On the left edge: of its eight neighbours on the wrapped grid, three are in column 4.
  bug.moveTo(grid.at(0, 2)!);
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      const cell = grid.at(x, y)! as unknown as Holder;
      cell.values[cell.info.attribute.get('kind')!.index] = y === 1 ? 'a' : 'b';
    }
  }
  root.iterate();
  const attribute = bug.info.attribute.get('seen')!;
  return bug.context!.state.read(bug, attribute) as number;
}

const kindA: Act = {
  kind: 'query',
  selected: 'cells',
  function: 'identical',
  inputs: [{ attribute: 'cell.kind' }, { literal: 'a' }],
  targets: ['combined'],
};

describe.each(['interpreted', 'generated'] as const)('selection logic, %s', (execution) => {
  it('narrows a selection by a query on an evaluate of the candidate', () => {
    // The five neighbours not across the border.
    expect(
      seen(model({ combined: { kind: 'all', selected: 'cells', targets: ['inc'] } }), execution),
    ).toBe(5);
  });

  it('takes an `any` of one query', () => {
    const m = model({ combined: { kind: 'any', selected: 'cells', targets: ['inc'] } });
    expect(seen(m, execution)).toBe(5);
  });

  it('takes an `any` of two queries', () => {
    // Adjacent, or in row 1: the five adjacent, and (4, 1) across the border.
    const m = model({ isA: kindA, combined: { kind: 'any', selected: 'cells', targets: ['inc'] } });
    expect(seen(m, execution)).toBe(6);
  });
});
