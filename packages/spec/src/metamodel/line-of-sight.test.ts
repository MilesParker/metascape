// SPDX-License-Identifier: EPL-2.0
import { RootScape, type Agent, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { checkModel } from './check';
import { compileModel } from './interpreter';
import type { InterpAgent, InterpCell } from './runtime';
import type { Act, Model } from './types';

/*
 * The two additions the Sugarscape pilot needed (docs/format-pilot/sugarscape.md):
 * the spatial term `lineOfSight`, and the evaluates `locationX` and `locationY`.
 */

function gridModel(
  neighborhood: 'moore' | 'vonNeumann',
  periodic: boolean,
  bugActs: Record<string, Act>,
  cellActs: Record<string, Act> = {},
): Model {
  return {
    schemaVersion: 2,
    id: 'test',
    language: 'typescript',
    acts: {
      build: { kind: 'build', targets: ['createBug', 'fill'] },
      createBug: { kind: 'create', selected: 'build', agent: 'bug', agentCount: { literal: 1 } },
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
        attributes: { seen: { type: 'integer' }, vision: { type: 'integer', default: 2 } },
        acts: bugActs,
      },
      cell: {
        kind: 'agent',
        label: 'Cell',
        pluralLabel: 'Cells',
        attributes: { x: { type: 'integer' }, y: { type: 'integer' } },
        acts: cellActs,
      },
    },
    spaces: {
      grid: {
        kind: 'grid',
        label: 'Grid',
        neighborhood,
        borderRule: periodic ? 'periodic' : 'aperiodic',
        dimensions: ['width', 'height'],
        attributes: {
          width: { type: 'integer', default: 9 },
          height: { type: 'integer', default: 9 },
        },
      },
    },
  };
}

/** A bug that counts the cells it sees, each flowing on to an increment of `seen`. */
function counting(
  neighborhood: 'moore' | 'vonNeumann',
  periodic: boolean,
  includeSelf: boolean,
): Model {
  const sources = ['sight', ...(includeSelf ? ['self'] : [])];
  return gridModel(neighborhood, periodic, {
    initialize: { kind: 'initialize', space: 'grid', targets: ['home'] },
    home: { kind: 'select', selected: 'initialize', agent: 'cell', space: 'grid', targets: ['at'] },
    at: { kind: 'query', selected: 'home', function: 'here', targets: ['go'] },
    go: { kind: 'move', selected: 'initialize', destination: 'home' },
    look: { kind: 'rule', space: 'grid', targets: ['seen'] },
    seen: {
      kind: 'select',
      selected: 'look',
      agent: 'cell',
      space: 'grid',
      targets: ['every', ...sources],
    },
    every: { kind: 'query', selected: 'seen', function: 'all', targets: ['both'] },
    sight: {
      kind: 'query',
      selected: 'seen',
      function: 'lineOfSight',
      inputs: [{ attribute: 'bug.vision', selected: 'look' }],
      targets: ['both'],
    },
    ...(includeSelf
      ? { self: { kind: 'query', selected: 'seen', function: 'includeSelf', targets: ['both'] } }
      : {}),
    both: { kind: 'all', selected: 'seen', targets: ['inc'] },
    inc: {
      kind: 'evaluate',
      selected: 'look',
      function: 'increment',
      inputs: [{ attribute: 'bug.seen' }],
      targets: ['count'],
    },
    count: { kind: 'set', selected: 'look', attribute: 'bug.seen', parameter: { evaluate: 'inc' } },
  });
}

function seenAfterOnePeriod(model: Model, at: [number, number]): number {
  expect(checkModel(model).filter((d) => d.severity === 'error')).toEqual([]);
  const root = new RootScape(compileModel(model), { seed: 1 });
  const bug = (root.scapes.find((s) => s.name === 'Bugs') as Scape<Agent>).members[0]!;
  const grid = root.scapes.find((s) => s.name === 'Grid')!.space as unknown as {
    at(x: number, y: number): InterpCell;
  };
  (bug as InterpAgent).moveTo(grid.at(...at));
  root.iterate();
  const holder = bug as InterpAgent;
  return holder.values[holder.info.attribute.get('seen')!.index] as number;
}

describe('lineOfSight', () => {
  it('sees along the directions of the neighbourhood, as far as the vision', () => {
    // Four directions, two cells each; eight along the Moore directions, two each.
    expect(seenAfterOnePeriod(counting('vonNeumann', true, false), [4, 4])).toBe(8);
    expect(seenAfterOnePeriod(counting('moore', true, false), [4, 4])).toBe(16);
  });

  it('includes the origin only with includeSelf', () => {
    expect(seenAfterOnePeriod(counting('vonNeumann', true, true), [4, 4])).toBe(9);
  });

  it('wraps on a periodic grid and stops at the edge of a bounded one', () => {
    expect(seenAfterOnePeriod(counting('vonNeumann', true, false), [0, 0])).toBe(8);
    // At the corner of a bounded grid only two directions have cells.
    expect(seenAfterOnePeriod(counting('vonNeumann', false, false), [0, 0])).toBe(4);
  });
});

describe('locationX and locationY', () => {
  it('give a cell its position, read when it initializes', () => {
    const model = gridModel(
      'vonNeumann',
      true,
      {},
      {
        initialize: { kind: 'initialize', space: 'grid', targets: ['x', 'y'] },
        x: {
          kind: 'evaluate',
          selected: 'initialize',
          function: 'locationX',
          targets: ['setX'],
        },
        setX: {
          kind: 'set',
          selected: 'initialize',
          attribute: 'cell.x',
          parameter: { evaluate: 'x' },
        },
        y: {
          kind: 'evaluate',
          selected: 'initialize',
          function: 'locationY',
          targets: ['setY'],
        },
        setY: {
          kind: 'set',
          selected: 'initialize',
          attribute: 'cell.y',
          parameter: { evaluate: 'y' },
        },
      },
    );
    expect(checkModel(model).filter((d) => d.severity === 'error')).toEqual([]);
    const root = new RootScape(compileModel(model), { seed: 1 });
    const cells = root.scapes.find((s) => s.name === 'Grid')!.members as unknown as InterpCell[];
    expect(cells).toHaveLength(81);
    for (const cell of cells) {
      expect(cell.values[cell.info.attribute.get('x')!.index]).toBe(cell.x);
      expect(cell.values[cell.info.attribute.get('y')!.index]).toBe(cell.y);
    }
  });
});
