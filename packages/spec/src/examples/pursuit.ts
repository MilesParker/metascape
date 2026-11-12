// SPDX-License-Identifier: EPL-2.0
import type { ModelSpec } from '../schema';

const TAU = 6.283185307179586;

/**
 * Hunters and prey in a continuous arena. Prey wander until they sense a
 * hunter, then flee from the nearest; they breed when not crowded. Hunters
 * chase the nearest prey they can see and catch it when close enough. When
 * prey run low, a few arrive from elsewhere. The run ends if the prey die out.
 */
export const pursuit = {
  schemaVersion: 1,
  name: 'Pursuit',
  description: 'Chasing and fleeing in a continuous space.',
  parameters: {
    arena: { type: 'real', default: 100, min: 10, label: 'Arena size' },
    preyCount: { type: 'int', default: 60, min: 0, label: 'Prey' },
    hunterCount: { type: 'int', default: 6, min: 0, label: 'Hunters' },
    vision: { type: 'real', default: 12, min: 0, label: 'Vision' },
    preySpeed: { type: 'real', default: 0.9, min: 0, label: 'Prey speed' },
    hunterSpeed: { type: 'real', default: 1.1, min: 0, label: 'Hunter speed' },
    reach: { type: 'real', default: 1, min: 0, label: 'Catch distance' },
    birthChance: { type: 'real', default: 0.01, min: 0, max: 1, label: 'Prey birth chance' },
  },
  spaces: {
    field: { kind: 'continuous', width: 'param.arena', height: 'param.arena', label: 'Field' },
  },
  agents: {
    prey: {
      space: 'field',
      count: 'param.preyCount',
      attributes: {
        heading: { type: 'real', initial: { op: 'randomReal', args: [0, TAU] } },
        fear: { type: 'real', record: ['mean', 'max'] },
        closest: { type: 'real', label: 'Distance to the nearest hunter in sight' },
      },
      rules: [
        {
          name: 'sense',
          do: [
            {
              set: 'fear',
              to: {
                aggregate: 'sum',
                over: { type: 'hunter', from: 'within', radius: 'param.vision', as: 'threat' },
                of: {
                  op: 'sub',
                  args: ['param.vision', { op: 'distance', args: ['self', 'threat'] }],
                },
              },
            },
            {
              set: 'closest',
              to: {
                aggregate: 'min',
                over: { type: 'hunter', from: 'within', radius: 'param.vision' },
                of: { op: 'distance', args: ['self', 'other'] },
              },
            },
          ],
        },
        {
          name: 'flee',
          when: { op: 'gt', args: ['fear', 0] },
          do: [
            {
              with: { type: 'hunter', from: 'within', radius: 'param.vision', pick: 'nearest' },
              do: [{ moveToward: 'other', distance: { op: 'neg', args: ['param.preySpeed'] } }],
            },
          ],
        },
        {
          name: 'wander',
          when: { op: 'eq', args: ['fear', 0] },
          do: [
            {
              set: 'heading',
              to: { op: 'add', args: ['heading', { op: 'randomReal', args: [-0.4, 0.4] }] },
            },
            {
              moveBy: {
                dx: { op: 'mul', args: ['param.preySpeed', { op: 'cos', args: ['heading'] }] },
                dy: { op: 'mul', args: ['param.preySpeed', { op: 'sin', args: ['heading'] }] },
              },
            },
          ],
        },
        {
          name: 'breed',
          when: {
            op: 'and',
            args: [
              { op: 'chance', args: ['param.birthChance'] },
              {
                op: 'lt',
                args: [
                  { aggregate: 'count', over: { type: 'prey', from: 'within', radius: 5 } },
                  3,
                ],
              },
            ],
          },
          do: [
            {
              create: 'prey',
              at: 'here',
              set: { heading: { op: 'add', args: ['heading', TAU / 2] } },
            },
          ],
        },
      ],
      style: {
        color: {
          op: 'mix',
          args: [
            { color: '#3fa45b' },
            { color: '#e3b341' },
            { op: 'div', args: ['fear', 'param.vision'] },
          ],
        },
      },
    },
    hunter: {
      space: 'field',
      count: 'param.hunterCount',
      attributes: { catches: { type: 'int', record: ['sum', 'max'] } },
      rules: [
        {
          name: 'hunt',
          do: [
            {
              with: {
                type: 'prey',
                from: 'within',
                radius: { op: 'mul', args: ['param.vision', 2] },
                pick: 'nearest',
                as: 'quarry',
              },
              do: [
                { moveToward: 'quarry', distance: 'param.hunterSpeed' },
                {
                  if: {
                    op: 'le',
                    args: [{ op: 'distance', args: ['self', 'quarry'] }, 'param.reach'],
                  },
                  then: [
                    { die: 'quarry' },
                    { set: 'catches', to: { op: 'add', args: ['catches', 1] } },
                  ],
                },
              ],
              else: [
                {
                  moveBy: {
                    dx: { op: 'randomReal', args: [-1, 1] },
                    dy: { op: 'randomReal', args: [-1, 1] },
                  },
                },
              ],
            },
          ],
        },
        {
          name: 'restock',
          when: {
            op: 'and',
            args: [
              { op: 'chance', args: [0.05] },
              {
                op: 'lt',
                args: [{ aggregate: 'count', over: { type: 'prey', from: 'all' } }, 10],
              },
            ],
          },
          do: [{ create: 'prey', count: 2, at: 'random' }],
        },
      ],
      style: { color: { op: 'rgb', args: [217, 72, 59] } },
    },
  },
  charts: [
    { kind: 'timeSeries', title: 'Populations', series: ['prey.count', 'hunter.count'] },
    { kind: 'timeSeries', title: 'Fear', series: ['prey.fear.mean', 'prey.fear.max'] },
    { kind: 'bars', title: 'Catches', series: ['hunter.catches.sum', 'hunter.catches.max'] },
  ],
  stopWhen: {
    op: 'eq',
    args: [{ aggregate: 'count', over: { type: 'prey', from: 'all' } }, 0],
  },
} satisfies ModelSpec;
