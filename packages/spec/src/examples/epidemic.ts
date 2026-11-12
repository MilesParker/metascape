// SPDX-License-Identifier: EPL-2.0
import type { ModelSpec } from '../schema';

/**
 * An SIR epidemic on a small-world contact network. Infected people infect
 * susceptible contacts with some probability each day and recover after a
 * fixed number of days. A few people a day drop one contact and meet a
 * stranger instead. The run ends when nobody is infected.
 */
export const epidemic = {
  schemaVersion: 1,
  name: 'Small-world epidemic',
  description: 'Susceptible, infected, recovered on a Watts-Strogatz network.',
  parameters: {
    population: { type: 'int', default: 300, min: 2, max: 5000, label: 'Population' },
    k: { type: 'int', default: 3, min: 1, max: 20, label: 'Contacts on each side' },
    rewire: { type: 'real', default: 0.1, min: 0, max: 1, label: 'Rewiring probability' },
    seeded: { type: 'real', default: 0.02, min: 0, max: 1, label: 'Initially infected' },
    transmission: { type: 'real', default: 0.08, min: 0, max: 1, label: 'Transmission' },
    recovery: { type: 'int', default: 14, min: 1, max: 100, label: 'Days to recover' },
    churn: { type: 'real', default: 0.01, min: 0, max: 1, label: 'Daily contact change' },
    lastDay: { type: 'int', default: 1000, min: 1, label: 'Last day' },
  },
  spaces: {
    contacts: {
      kind: 'network',
      nodes: 'person',
      initial: { topology: 'smallWorld', k: 'param.k', probability: 'param.rewire' },
      label: 'Contacts',
    },
  },
  agents: {
    person: {
      count: 'param.population',
      attributes: {
        health: {
          type: 'state',
          states: ['susceptible', 'infected', 'recovered'],
          initial: {
            op: 'if',
            args: [
              { op: 'chance', args: ['param.seeded'] },
              { state: 'infected' },
              { state: 'susceptible' },
            ],
          },
          record: true,
        },
        sick: { type: 'int', record: ['mean', 'max'], label: 'Days infected' },
      },
      rules: [
        {
          name: 'spread',
          when: { op: 'eq', args: ['health', { state: 'infected' }] },
          do: [
            {
              forEach: {
                type: 'person',
                from: 'linked',
                network: 'contacts',
                as: 'contact',
                where: { op: 'eq', args: ['contact.health', { state: 'susceptible' }] },
              },
              do: [
                {
                  if: { op: 'chance', args: ['param.transmission'] },
                  then: [{ set: 'contact.health', to: { state: 'infected' } }],
                },
              ],
            },
          ],
        },
        {
          name: 'recover',
          when: { op: 'eq', args: ['health', { state: 'infected' }] },
          do: [
            { set: 'sick', to: { op: 'add', args: ['sick', 1] } },
            {
              if: { op: 'ge', args: ['sick', 'param.recovery'] },
              then: [{ set: 'health', to: { state: 'recovered' } }],
            },
          ],
        },
        {
          name: 'mingle',
          when: { op: 'chance', args: ['param.churn'] },
          do: [
            {
              with: { type: 'person', from: 'linked', network: 'contacts', as: 'old' },
              do: [
                { disconnect: 'old', network: 'contacts' },
                {
                  with: { type: 'person', from: 'all', as: 'stranger' },
                  do: [{ connect: 'stranger', network: 'contacts' }],
                },
              ],
            },
          ],
        },
        {
          name: 'calendar',
          when: { op: 'ge', args: ['tick', 'param.lastDay'] },
          do: [{ stop: 'Reached the last day' }],
        },
      ],
      style: {
        color: {
          op: 'if',
          args: [
            { op: 'eq', args: ['health', { state: 'infected' }] },
            { color: '#d9483b' },
            {
              op: 'if',
              args: [
                { op: 'eq', args: ['health', { state: 'recovered' }] },
                { color: '#8a8f98' },
                { color: '#3b7dd8' },
              ],
            },
          ],
        },
      },
    },
  },
  charts: [
    {
      kind: 'timeSeries',
      title: 'Health',
      series: ['person.health.susceptible', 'person.health.infected', 'person.health.recovered'],
    },
    { kind: 'timeSeries', title: 'Days infected', series: ['person.sick.mean', 'person.sick.max'] },
  ],
  stopWhen: {
    op: 'not',
    args: [
      {
        aggregate: 'any',
        over: { type: 'person', from: 'all' },
        of: { op: 'eq', args: ['other.health', { state: 'infected' }] },
      },
    ],
  },
} satisfies ModelSpec;
