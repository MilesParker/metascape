// SPDX-License-Identifier: EPL-2.0
import type { Model } from '../types';

/**
 * Conway's Game of Life on a torus. Each cell first counts its live
 * neighbours: they flow to a set that adds one to the count for each. Once
 * every cell has counted (rules run one after another across all cells), each
 * cell's count and state flow to whether it lives: born with three, surviving
 * with two or three. So the outcome does not depend on the order cells act in.
 */
export const life: Model = {
  schemaVersion: 2,
  id: 'life',
  label: 'Life',
  description: "Conway's Game of Life on a torus.",
  language: 'typescript',
  attributes: {
    density: {
      type: 'real',
      label: 'Initial density',
      description: 'The chance that a cell is alive at the start.',
      default: 0.3,
      min: 0,
      max: 1,
    },
  },
  acts: {
    build: { kind: 'build', label: 'Build', targets: ['fillWorld'] },
    fillWorld: {
      kind: 'buildGrid',
      label: 'Fill World',
      selected: 'build',
      agents: [],
      space: 'world',
      fillAgent: 'cell',
    },
  },
  agents: {
    cell: {
      kind: 'agent',
      label: 'Cell',
      pluralLabel: 'Cells',
      attributes: {
        on: { type: 'boolean', label: 'Alive', gatherData: true },
        live: { type: 'integer', label: 'Live neighbours' },
      },
      acts: {
        // At the start a cell is alive with the chance `density`.
        seed: { kind: 'initialize', label: 'Seed', space: 'world', targets: ['draw'] },
        draw: {
          kind: 'evaluate',
          selected: 'seed',
          function: 'randomUnit',
          targets: ['drawnAlive'],
        },
        drawnAlive: {
          kind: 'query',
          selected: 'seed',
          function: 'lesser',
          inputs: [{ evaluate: 'draw' }, { attribute: 'density' }],
          targets: ['setAlive'],
        },
        setAlive: {
          kind: 'set',
          selected: 'seed',
          attribute: 'cell.on',
          parameter: { constant: 'true' },
        },

        // Count the live neighbours: every live neighbour adds one.
        count: {
          kind: 'rule',
          label: 'Count',
          space: 'world',
          targets: ['clearCount', 'neighbors'],
        },
        clearCount: {
          kind: 'set',
          selected: 'count',
          attribute: 'cell.live',
          parameter: { constant: 'zero' },
        },
        neighbors: {
          kind: 'select',
          selected: 'count',
          agent: 'cell',
          space: 'world',
          targets: ['neighbor', 'everyNeighbor', 'neighborAlive'],
        },
        neighbor: {
          kind: 'query',
          selected: 'neighbors',
          function: 'neighbor',
          targets: ['liveNeighbors'],
        },
        everyNeighbor: {
          kind: 'query',
          selected: 'neighbors',
          function: 'all',
          targets: ['liveNeighbors'],
        },
        neighborAlive: {
          kind: 'query',
          selected: 'neighbors',
          function: 'identity',
          inputs: [{ attribute: 'cell.on' }],
          targets: ['liveNeighbors'],
        },
        liveNeighbors: { kind: 'all', selected: 'neighbors', targets: ['oneMore'] },
        oneMore: {
          kind: 'evaluate',
          selected: 'count',
          function: 'increment',
          inputs: [{ attribute: 'cell.live' }],
          targets: ['setCount'],
        },
        setCount: {
          kind: 'set',
          selected: 'count',
          attribute: 'cell.live',
          parameter: { evaluate: 'oneMore' },
        },

        // Then live with three live neighbours, or with two if alive already.
        update: {
          kind: 'rule',
          label: 'Update',
          space: 'world',
          targets: ['three', 'alive', 'two'],
        },
        three: {
          kind: 'query',
          selected: 'update',
          function: 'equal',
          inputs: [{ attribute: 'cell.live' }, { literal: 3 }],
          targets: ['lives', 'dies'],
        },
        alive: {
          kind: 'query',
          selected: 'update',
          function: 'identity',
          inputs: [{ attribute: 'cell.on' }],
          targets: ['survives'],
        },
        two: {
          kind: 'query',
          selected: 'update',
          function: 'equal',
          inputs: [{ attribute: 'cell.live' }, { literal: 2 }],
          targets: ['survives'],
        },
        survives: { kind: 'all', selected: 'update', targets: ['lives', 'dies'] },
        lives: { kind: 'any', selected: 'update', targets: ['setOn'] },
        dies: { kind: 'none', selected: 'update', targets: ['setOff'] },
        setOn: {
          kind: 'set',
          selected: 'update',
          attribute: 'cell.on',
          parameter: { constant: 'true' },
        },
        setOff: {
          kind: 'set',
          selected: 'update',
          attribute: 'cell.on',
          parameter: { constant: 'false' },
        },
      },
      execution: { randomOrder: false },
      styles: {
        cellStyle: {
          kind: '2d',
          label: 'Cell Style',
          acts: {
            look: { kind: 'rule', space: 'world', targets: ['isAlive'] },
            isAlive: {
              kind: 'query',
              selected: 'look',
              function: 'identity',
              inputs: [{ attribute: 'cell.on' }],
              targets: ['green', 'isDead'],
            },
            isDead: { kind: 'none', selected: 'look', targets: ['dark'] },
            green: {
              kind: 'evaluate',
              selected: 'look',
              function: 'colorRGB',
              inputs: [
                { literal: 0.247, type: 'real' },
                { literal: 0.643, type: 'real' },
                { literal: 0.357, type: 'real' },
              ],
              targets: ['fillGreen'],
            },
            fillGreen: { kind: 'evaluate', selected: 'look', function: 'graphicFill' },
            dark: {
              kind: 'evaluate',
              selected: 'look',
              function: 'colorRGB',
              inputs: [
                { literal: 0.094, type: 'real' },
                { literal: 0.11, type: 'real' },
                { literal: 0.133, type: 'real' },
              ],
              targets: ['fillDark'],
            },
            fillDark: { kind: 'evaluate', selected: 'look', function: 'graphicFill' },
          },
        },
      },
    },
  },
  spaces: {
    world: {
      kind: 'grid',
      label: 'World',
      borderRule: 'periodic',
      neighborhood: 'moore',
      dimensions: ['width', 'height'],
      attributes: {
        width: { type: 'integer', label: 'Width', default: 40, min: 3, max: 200 },
        height: { type: 'integer', label: 'Height', default: 40, min: 3, max: 200 },
      },
    },
  },
};
