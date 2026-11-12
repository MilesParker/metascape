// SPDX-License-Identifier: EPL-2.0
import type { ModelSpec } from '../schema';

/**
 * Conway's Game of Life. Every cell counts its live neighbours from the state
 * at the start of the tick (a synchronous rule), so the outcome does not
 * depend on the order cells act in.
 */
export const life = {
  schemaVersion: 1,
  name: 'Life',
  description: "Conway's Game of Life on a torus.",
  parameters: {
    size: { type: 'int', default: 40, min: 3, max: 200, label: 'Size' },
    density: { type: 'real', default: 0.3, min: 0, max: 1, label: 'Initial density' },
  },
  spaces: {
    world: {
      kind: 'grid',
      width: 'param.size',
      height: 'param.size',
      wrap: true,
      neighborhood: 'moore',
      label: 'World',
    },
  },
  agents: {
    cell: {
      space: 'world',
      as: 'cell',
      order: 'sequential',
      attributes: {
        on: { type: 'boolean', initial: { op: 'chance', args: ['param.density'] }, record: true },
      },
      rules: [
        {
          name: 'life',
          synchronous: true,
          do: [
            {
              let: 'live',
              value: {
                aggregate: 'count',
                over: { type: 'cell', from: 'neighbors', where: 'other.on' },
              },
            },
            {
              set: 'on',
              to: {
                op: 'or',
                args: [
                  { op: 'eq', args: ['live', 3] },
                  { op: 'and', args: ['on', { op: 'eq', args: ['live', 2] }] },
                ],
              },
            },
          ],
        },
      ],
      style: { color: { op: 'if', args: ['on', { color: '#3fa45b' }, { color: '#181c22' }] } },
    },
  },
  charts: [{ kind: 'timeSeries', title: 'Live cells', series: ['cell.on', 'cell.count'] }],
} satisfies ModelSpec;
