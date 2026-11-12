// SPDX-License-Identifier: EPL-2.0
import type { ModelSpec } from '../schema';

/**
 * Foragers on a landscape whose sites regrow food. Each tick a forager moves
 * to the free neighbouring site with the most food if that beats its own,
 * eats everything there, pays its metabolism, splits its energy with a child
 * on a free neighbouring site once it has enough, and dies with no energy
 * left. Now and then a newcomer arrives on an empty site.
 */
export const forager = {
  schemaVersion: 1,
  name: 'Foragers',
  description: 'Movement, eating, reproduction and death on a regrowing landscape.',
  parameters: {
    size: { type: 'int', default: 40, min: 5, max: 200, label: 'Size' },
    foragers: { type: 'int', default: 120, min: 0, label: 'Initial foragers' },
    maxFood: { type: 'real', default: 5, min: 0.1, label: 'Food capacity' },
    regrow: { type: 'real', default: 0.25, min: 0, label: 'Regrowth per tick' },
    metabolism: { type: 'real', default: 1, min: 0, label: 'Metabolism' },
    birthEnergy: { type: 'real', default: 20, min: 1, label: 'Energy to reproduce' },
    immigration: { type: 'real', default: 0.0002, min: 0, max: 1, label: 'Immigration' },
    showForagers: { type: 'boolean', default: true, label: 'Show foragers' },
  },
  spaces: {
    land: {
      kind: 'grid',
      width: 'param.size',
      height: 'param.size',
      neighborhood: 'vonNeumann',
      label: 'Land',
    },
  },
  agents: {
    patch: {
      space: 'land',
      as: 'cell',
      attributes: {
        food: {
          type: 'real',
          initial: { op: 'randomReal', args: [0, 'param.maxFood'] },
          record: ['mean', 'sum'],
        },
      },
      rules: [
        {
          name: 'regrow',
          do: [
            {
              set: 'food',
              to: {
                op: 'min',
                args: [{ op: 'add', args: ['food', 'param.regrow'] }, 'param.maxFood'],
              },
            },
          ],
        },
        {
          name: 'immigrate',
          when: { op: 'chance', args: ['param.immigration'] },
          do: [{ create: 'forager', at: 'here' }],
        },
      ],
      style: {
        color: {
          op: 'mix',
          args: [
            { color: '#f3efe0' },
            { color: '#3fa45b' },
            { op: 'div', args: ['food', 'param.maxFood'] },
          ],
        },
      },
    },
    forager: {
      space: 'land',
      count: 'param.foragers',
      attributes: {
        energy: {
          type: 'real',
          initial: { op: 'randomReal', args: [2, 10] },
          record: true,
        },
        age: { type: 'int', record: ['mean', 'max'] },
      },
      rules: [
        {
          name: 'live',
          do: [
            {
              if: {
                op: 'gt',
                args: [
                  {
                    aggregate: 'max',
                    over: { type: 'patch', from: 'neighbors' },
                    of: 'other.food',
                  },
                  'self.cell.food',
                ],
              },
              then: [{ moveTo: { type: 'patch', from: 'neighbors', pick: { max: 'other.food' } } }],
            },
            {
              with: { type: 'patch', from: 'here', as: 'site' },
              do: [
                { set: 'energy', to: { op: 'add', args: ['energy', 'site.food'] } },
                { set: 'site.food', to: 0 },
              ],
            },
            { set: 'energy', to: { op: 'sub', args: ['energy', 'param.metabolism'] } },
            { set: 'age', to: { op: 'add', args: ['age', 1] } },
            {
              if: { op: 'gt', args: ['energy', 'param.birthEnergy'] },
              then: [
                {
                  create: 'forager',
                  at: 'neighbor',
                  set: { energy: { op: 'div', args: ['energy', 2] } },
                },
                { set: 'energy', to: { op: 'div', args: ['energy', 2] } },
              ],
            },
            { if: { op: 'le', args: ['energy', 0] }, then: [{ die: true }] },
          ],
        },
      ],
      style: {
        color: { color: '#8a63d2' },
        shape: 'circle',
        hidden: { op: 'not', args: ['param.showForagers'] },
      },
    },
  },
  charts: [
    { kind: 'timeSeries', title: 'Foragers', series: ['forager.count'] },
    { kind: 'timeSeries', title: 'Energy', series: ['forager.energy.mean', 'forager.energy.max'] },
    { kind: 'timeSeries', title: 'Food', series: ['patch.food.mean'] },
    { kind: 'bars', title: 'Age', series: ['forager.age.mean', 'forager.age.max'] },
  ],
  stopWhen: {
    op: 'eq',
    args: [{ aggregate: 'count', over: { type: 'forager', from: 'all' } }, 0],
  },
} satisfies ModelSpec;
