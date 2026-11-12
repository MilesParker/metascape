// SPDX-License-Identifier: EPL-2.0
import type { ModelSpec } from '../schema';

/**
 * Schelling's segregation model. Residents of two groups are unhappy when
 * too small a share of their neighbours belong to their own group, and
 * unhappy residents move to a random free site. The run ends once everyone
 * is happy.
 */
export const schelling = {
  schemaVersion: 1,
  name: 'Schelling segregation',
  description: 'Mild preferences for similar neighbours produce strong segregation.',
  parameters: {
    size: { type: 'int', default: 30, min: 5, max: 200, label: 'Size' },
    density: { type: 'real', default: 0.85, min: 0, max: 0.99, label: 'Density' },
    ratio: { type: 'real', default: 0.5, min: 0, max: 1, label: 'Share of red' },
    tolerance: {
      type: 'real',
      default: 0.3,
      min: 0,
      max: 1,
      label: 'Wanted share of similar neighbours',
    },
  },
  spaces: {
    town: { kind: 'grid', width: 'param.size', height: 'param.size', label: 'Town' },
  },
  agents: {
    site: { space: 'town', as: 'cell', style: { color: { color: '#f4f1ea' } } },
    resident: {
      space: 'town',
      count: {
        op: 'floor',
        args: [{ op: 'mul', args: ['param.density', 'param.size', 'param.size'] }],
      },
      schedule: 'byRule',
      attributes: {
        group: {
          type: 'state',
          states: ['red', 'blue'],
          initial: {
            op: 'if',
            args: [{ op: 'chance', args: ['param.ratio'] }, { state: 'red' }, { state: 'blue' }],
          },
          record: true,
        },
        similar: { type: 'real', record: ['mean'], label: 'Share of similar neighbours' },
        happy: { type: 'boolean', record: true },
      },
      rules: [
        {
          name: 'assess',
          do: [
            {
              let: 'neighbors',
              value: { aggregate: 'count', over: { type: 'resident', from: 'neighbors' } },
            },
            {
              set: 'similar',
              to: {
                aggregate: 'mean',
                over: { type: 'resident', from: 'neighbors' },
                of: { op: 'if', args: [{ op: 'eq', args: ['other.group', 'group'] }, 1, 0] },
              },
            },
            {
              set: 'happy',
              to: {
                op: 'or',
                args: [
                  { op: 'eq', args: ['neighbors', 0] },
                  { op: 'ge', args: ['similar', 'param.tolerance'] },
                ],
              },
            },
          ],
        },
        {
          name: 'move',
          when: { op: 'not', args: ['happy'] },
          do: [{ moveTo: { type: 'site', from: 'all' } }],
        },
      ],
      style: {
        color: {
          op: 'if',
          args: [
            { op: 'eq', args: ['group', { state: 'red' }] },
            { color: '#d9483b' },
            { color: '#3b7dd8' },
          ],
        },
        shape: 'square',
      },
    },
  },
  charts: [
    { kind: 'timeSeries', title: 'Happy residents', series: ['resident.happy', 'resident.count'] },
    { kind: 'timeSeries', title: 'Similar neighbours', series: ['resident.similar.mean'] },
    { kind: 'bars', title: 'Groups', series: ['resident.group.red', 'resident.group.blue'] },
  ],
  stopWhen: { aggregate: 'all', over: { type: 'resident', from: 'all' }, of: 'other.happy' },
} satisfies ModelSpec;
