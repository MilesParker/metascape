// SPDX-License-Identifier: EPL-2.0
import type { Model } from '../types';

const real = (value: number) => ({ literal: value, type: 'real' as const });

/**
 * Foragers on a landscape whose patches regrow food. Each period a forager
 * moves to the free neighbouring patch with the most food if that beats its
 * own, eats everything there, pays its metabolism, splits its energy with a
 * child on a free neighbouring patch once it has enough, and dies with no
 * energy left. Now and then a newcomer arrives on an empty patch.
 */
export const forager: Model = {
  schemaVersion: 2,
  id: 'foragers',
  label: 'Foragers',
  description: 'Movement, eating, reproduction and death on a regrowing landscape.',
  language: 'typescript',
  attributes: {
    foragers: { type: 'integer', label: 'Initial foragers', default: 120, min: 0 },
    maxFood: { type: 'real', label: 'Food capacity', default: 5, min: 0.1 },
    regrow: { type: 'real', label: 'Regrowth per period', default: 0.25, min: 0 },
    metabolism: { type: 'real', label: 'Metabolism', default: 1, min: 0 },
    birthEnergy: { type: 'real', label: 'Energy to reproduce', default: 20, min: 1 },
    immigration: { type: 'real', label: 'Immigration', default: 0.0002, min: 0, max: 1 },
  },
  acts: {
    build: { kind: 'build', label: 'Build', targets: ['createForagers', 'fillLand'] },
    createForagers: {
      kind: 'create',
      label: 'Create Foragers',
      selected: 'build',
      agent: 'forager',
      agentCount: { attribute: 'foragers' },
    },
    fillLand: {
      kind: 'buildGrid',
      label: 'Fill Land',
      selected: 'build',
      agents: ['forager'],
      space: 'land',
      fillAgent: 'patch',
    },
  },
  agents: {
    patch: {
      kind: 'agent',
      label: 'Patch',
      pluralLabel: 'Patches',
      attributes: { food: { type: 'real', label: 'Food', gatherData: true } },
      acts: {
        initialize: {
          kind: 'initialize',
          label: 'Initialize',
          space: 'land',
          targets: ['initialFood'],
        },
        initialFood: {
          kind: 'evaluate',
          selected: 'initialize',
          function: 'randomInRange',
          inputs: [real(0), { attribute: 'maxFood' }],
          targets: ['setInitialFood'],
        },
        setInitialFood: {
          kind: 'set',
          selected: 'initialize',
          attribute: 'patch.food',
          parameter: { evaluate: 'initialFood' },
        },

        // Food grows back, up to the capacity.
        regrow: { kind: 'rule', label: 'Regrow', space: 'land', targets: ['grown'] },
        grown: {
          kind: 'evaluate',
          selected: 'regrow',
          function: 'add',
          inputs: [{ attribute: 'patch.food' }, { attribute: 'regrow' }],
          targets: ['capped'],
        },
        capped: {
          kind: 'evaluate',
          selected: 'regrow',
          function: 'min',
          inputs: [{ evaluate: 'grown' }, { attribute: 'maxFood' }],
          targets: ['setFood'],
        },
        setFood: {
          kind: 'set',
          selected: 'regrow',
          attribute: 'patch.food',
          parameter: { evaluate: 'capped' },
        },

        // Now and then a newcomer arrives on the patch, if it is free.
        immigrate: { kind: 'rule', label: 'Immigrate', space: 'land', targets: ['draw'] },
        draw: {
          kind: 'evaluate',
          selected: 'immigrate',
          function: 'randomUnit',
          targets: ['arrives'],
        },
        arrives: {
          kind: 'query',
          selected: 'immigrate',
          function: 'lesser',
          inputs: [{ evaluate: 'draw' }, { attribute: 'immigration' }],
          targets: ['landing'],
        },
        landing: {
          kind: 'select',
          selected: 'immigrate',
          agent: 'patch',
          space: 'land',
          targets: ['landingHere', 'landingFree'],
        },
        landingHere: {
          kind: 'query',
          selected: 'landing',
          function: 'here',
          targets: ['freeHere'],
        },
        landingFree: {
          kind: 'query',
          selected: 'landing',
          function: 'available',
          targets: ['freeHere'],
        },
        freeHere: { kind: 'all', selected: 'landing', targets: ['newcomer'] },
        newcomer: {
          kind: 'create',
          label: 'Newcomer',
          selected: 'landing',
          agent: 'forager',
          targets: ['arrive'],
        },
        arrive: { kind: 'move', selected: 'newcomer', destination: 'landing' },
      },
      styles: {
        patchStyle: {
          kind: '2d',
          label: 'Patch Style',
          acts: {
            look: { kind: 'rule', space: 'land', targets: ['ripeness'] },
            // From pale (no food) to green (full), channel by channel.
            ripeness: {
              kind: 'evaluate',
              selected: 'look',
              function: 'div',
              inputs: [{ attribute: 'patch.food' }, { attribute: 'maxFood' }],
              targets: ['redShift', 'greenShift', 'blueShift'],
            },
            redShift: {
              kind: 'evaluate',
              selected: 'look',
              function: 'mul',
              inputs: [{ evaluate: 'ripeness' }, real(0.706)],
              targets: ['red'],
            },
            greenShift: {
              kind: 'evaluate',
              selected: 'look',
              function: 'mul',
              inputs: [{ evaluate: 'ripeness' }, real(0.294)],
              targets: ['green'],
            },
            blueShift: {
              kind: 'evaluate',
              selected: 'look',
              function: 'mul',
              inputs: [{ evaluate: 'ripeness' }, real(0.521)],
              targets: ['blue'],
            },
            red: {
              kind: 'evaluate',
              selected: 'look',
              function: 'sub',
              inputs: [real(0.953), { evaluate: 'redShift' }],
              targets: ['color'],
            },
            green: {
              kind: 'evaluate',
              selected: 'look',
              function: 'sub',
              inputs: [real(0.937), { evaluate: 'greenShift' }],
              targets: ['color'],
            },
            blue: {
              kind: 'evaluate',
              selected: 'look',
              function: 'sub',
              inputs: [real(0.878), { evaluate: 'blueShift' }],
              targets: ['color'],
            },
            color: {
              kind: 'evaluate',
              selected: 'look',
              function: 'colorRGB',
              inputs: [{ evaluate: 'red' }, { evaluate: 'green' }, { evaluate: 'blue' }],
              targets: ['fill'],
            },
            fill: { kind: 'evaluate', selected: 'look', function: 'graphicFill' },
          },
        },
      },
    },
    forager: {
      kind: 'agent',
      label: 'Forager',
      pluralLabel: 'Foragers',
      attributes: {
        energy: { type: 'real', label: 'Energy', gatherData: true },
        age: { type: 'integer', label: 'Age', gatherData: true },
      },
      acts: {
        // At the start: a random free patch, and some energy.
        initialize: {
          kind: 'initialize',
          label: 'Initialize',
          space: 'land',
          targets: ['freePatch', 'initialEnergy'],
        },
        freePatch: {
          kind: 'select',
          selected: 'initialize',
          agent: 'patch',
          space: 'land',
          targets: ['freePatchAvailable'],
        },
        freePatchAvailable: {
          kind: 'query',
          selected: 'freePatch',
          function: 'available',
          targets: ['settle'],
        },
        settle: { kind: 'move', selected: 'initialize', destination: 'freePatch' },
        initialEnergy: {
          kind: 'evaluate',
          selected: 'initialize',
          function: 'randomInRange',
          inputs: [real(2), real(10)],
          targets: ['setInitialEnergy'],
        },
        setInitialEnergy: {
          kind: 'set',
          selected: 'initialize',
          attribute: 'forager.energy',
          parameter: { evaluate: 'initialEnergy' },
        },

        live: {
          kind: 'rule',
          label: 'Live',
          space: 'land',
          targets: ['current', 'site', 'hungrier', 'older', 'rich', 'exhausted'],
        },

        // Move to the free neighbouring patch with the most food, if it has more than this one.
        current: {
          kind: 'select',
          selected: 'live',
          agent: 'patch',
          space: 'land',
          targets: ['currentHere'],
        },
        currentHere: {
          kind: 'query',
          selected: 'current',
          function: 'here',
          targets: ['best'],
        },
        best: {
          kind: 'select',
          selected: 'live',
          agent: 'patch',
          space: 'land',
          targets: ['bestNeighbor', 'bestFree', 'better', 'most'],
        },
        bestNeighbor: {
          kind: 'query',
          selected: 'best',
          function: 'neighbor',
          targets: ['bestPatch'],
        },
        bestFree: {
          kind: 'query',
          selected: 'best',
          function: 'available',
          targets: ['bestPatch'],
        },
        better: {
          kind: 'query',
          selected: 'best',
          function: 'greater',
          inputs: [{ attribute: 'patch.food' }, { attribute: 'patch.food', selected: 'current' }],
          targets: ['bestPatch'],
        },
        most: {
          kind: 'query',
          selected: 'best',
          function: 'maximize',
          inputs: [{ attribute: 'patch.food' }],
          targets: ['bestPatch'],
        },
        bestPatch: { kind: 'all', selected: 'best', targets: ['moveToBest'] },
        moveToBest: { kind: 'move', selected: 'live', destination: 'best' },

        // Eat everything on the patch it is on.
        site: {
          kind: 'select',
          selected: 'live',
          agent: 'patch',
          space: 'land',
          targets: ['siteHere'],
        },
        siteHere: {
          kind: 'query',
          selected: 'site',
          function: 'here',
          targets: ['fed', 'eaten'],
        },
        fed: {
          kind: 'evaluate',
          selected: 'live',
          function: 'add',
          inputs: [{ attribute: 'forager.energy' }, { attribute: 'patch.food', selected: 'site' }],
          targets: ['setFed'],
        },
        setFed: {
          kind: 'set',
          selected: 'live',
          attribute: 'forager.energy',
          parameter: { evaluate: 'fed' },
        },
        eaten: {
          kind: 'set',
          selected: 'site',
          attribute: 'patch.food',
          parameter: { constant: 'zero' },
        },

        // Pay the metabolism, and grow older.
        hungrier: {
          kind: 'evaluate',
          selected: 'live',
          function: 'sub',
          inputs: [{ attribute: 'forager.energy' }, { attribute: 'metabolism' }],
          targets: ['setHungrier'],
        },
        setHungrier: {
          kind: 'set',
          selected: 'live',
          attribute: 'forager.energy',
          parameter: { evaluate: 'hungrier' },
        },
        older: {
          kind: 'evaluate',
          selected: 'live',
          function: 'increment',
          inputs: [{ attribute: 'forager.age' }],
          targets: ['setOlder'],
        },
        setOlder: {
          kind: 'set',
          selected: 'live',
          attribute: 'forager.age',
          parameter: { evaluate: 'older' },
        },

        // With enough energy, share it with a child on a free neighbouring patch.
        rich: {
          kind: 'query',
          selected: 'live',
          function: 'greater',
          inputs: [{ attribute: 'forager.energy' }, { attribute: 'birthEnergy' }],
          targets: ['birthplace'],
        },
        birthplace: {
          kind: 'select',
          selected: 'live',
          agent: 'patch',
          space: 'land',
          targets: ['birthNeighbor', 'birthFree'],
        },
        birthNeighbor: {
          kind: 'query',
          selected: 'birthplace',
          function: 'neighbor',
          targets: ['freeNeighbor'],
        },
        birthFree: {
          kind: 'query',
          selected: 'birthplace',
          function: 'available',
          targets: ['freeNeighbor'],
        },
        freeNeighbor: { kind: 'all', selected: 'birthplace', targets: ['child'] },
        child: {
          kind: 'create',
          label: 'Child',
          selected: 'birthplace',
          agent: 'forager',
          targets: ['born', 'half'],
        },
        born: { kind: 'move', selected: 'child', destination: 'birthplace' },
        half: {
          kind: 'evaluate',
          selected: 'live',
          function: 'div',
          inputs: [{ attribute: 'forager.energy' }, real(2)],
          targets: ['setChildEnergy', 'setParentEnergy'],
        },
        setChildEnergy: {
          kind: 'set',
          selected: 'child',
          attribute: 'forager.energy',
          parameter: { evaluate: 'half' },
        },
        setParentEnergy: {
          kind: 'set',
          selected: 'live',
          attribute: 'forager.energy',
          parameter: { evaluate: 'half' },
        },

        // With no energy left, die.
        exhausted: {
          kind: 'query',
          selected: 'live',
          function: 'lesserorEqual',
          inputs: [{ attribute: 'forager.energy' }, { constant: 'zero' }],
          targets: ['starve'],
        },
        starve: { kind: 'die', selected: 'live' },
      },
      styles: {
        foragerStyle: {
          kind: '2d',
          label: 'Forager Style',
          acts: {
            look: { kind: 'rule', space: 'land', targets: ['purple'] },
            purple: {
              kind: 'evaluate',
              selected: 'look',
              function: 'colorRGB',
              inputs: [real(0.541), real(0.388), real(0.824)],
              targets: ['oval'],
            },
            oval: { kind: 'evaluate', selected: 'look', function: 'shapeOval', targets: ['fill'] },
            fill: { kind: 'evaluate', selected: 'look', function: 'graphicFill' },
          },
        },
      },
    },
  },
  spaces: {
    land: {
      kind: 'grid',
      label: 'Land',
      neighborhood: 'vonNeumann',
      dimensions: ['width', 'height'],
      attributes: {
        width: { type: 'integer', label: 'Width', default: 40, min: 5, max: 200 },
        height: { type: 'integer', label: 'Height', default: 40, min: 5, max: 200 },
      },
    },
  },
};
