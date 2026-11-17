// SPDX-License-Identifier: EPL-2.0
import type { Model } from '../types';

const rgb = (r: number, g: number, b: number) => [
  { literal: r, type: 'real' as const },
  { literal: g, type: 'real' as const },
  { literal: b, type: 'real' as const },
];

/**
 * Schelling's segregation model. Residents of two groups are unhappy when too
 * small a share of their neighbours belong to their own group, and unhappy
 * residents move to a random free site. Each resident's neighbours flow to two
 * counts, of all of them and of those in its own group; the share is one over
 * the other.
 */
export const schelling: Model = {
  schemaVersion: 2,
  id: 'schelling',
  label: 'Schelling segregation',
  description: 'Mild preferences for similar neighbours produce strong segregation.',
  language: 'typescript',
  attributes: {
    density: {
      type: 'real',
      label: 'Density',
      description: 'The share of sites with a resident.',
      default: 0.85,
      min: 0,
      max: 0.99,
    },
    ratio: { type: 'real', label: 'Share of red', default: 0.5, min: 0, max: 1 },
    tolerance: {
      type: 'real',
      label: 'Wanted share of similar neighbours',
      default: 0.3,
      min: 0,
      max: 1,
    },
  },
  acts: {
    build: { kind: 'build', label: 'Build', targets: ['sites', 'fillTown'] },
    sites: {
      kind: 'evaluate',
      selected: 'build',
      function: 'mul',
      inputs: [{ attribute: 'town.width' }, { attribute: 'town.height' }],
      targets: ['occupied'],
    },
    occupied: {
      kind: 'evaluate',
      selected: 'build',
      function: 'mul',
      inputs: [{ attribute: 'density' }, { evaluate: 'sites' }],
      targets: ['residentCount'],
    },
    residentCount: {
      kind: 'evaluate',
      selected: 'build',
      function: 'floor',
      inputs: [{ evaluate: 'occupied' }],
      targets: ['createResidents'],
    },
    createResidents: {
      kind: 'create',
      label: 'Create Residents',
      selected: 'build',
      agent: 'resident',
      agentCount: { evaluate: 'residentCount' },
    },
    fillTown: {
      kind: 'buildGrid',
      label: 'Fill Town',
      selected: 'build',
      agents: ['resident'],
      space: 'town',
      fillAgent: 'site',
    },
  },
  agents: {
    site: {
      kind: 'agent',
      label: 'Site',
      pluralLabel: 'Sites',
      acts: {},
      styles: {
        siteStyle: {
          kind: '2d',
          label: 'Site Style',
          acts: {
            look: { kind: 'rule', space: 'town', targets: ['paper'] },
            paper: {
              kind: 'evaluate',
              selected: 'look',
              function: 'colorRGB',
              inputs: rgb(0.957, 0.945, 0.918),
              targets: ['fill'],
            },
            fill: { kind: 'evaluate', selected: 'look', function: 'graphicFill' },
          },
        },
      },
    },
    resident: {
      kind: 'agent',
      label: 'Resident',
      pluralLabel: 'Residents',
      attributes: {
        group: {
          type: 'state',
          label: 'Group',
          options: { red: { label: 'Red' }, blue: { label: 'Blue' } },
          defaultOption: 'red',
          gatherData: true,
        },
        similar: { type: 'real', label: 'Share of similar neighbours', gatherData: true },
        happy: { type: 'boolean', label: 'Happy', gatherData: true },
        neighbors: { type: 'integer', label: 'Neighbours' },
        same: { type: 'real', label: 'Neighbours in the same group' },
      },
      acts: {
        // At the start: a random free site, and red with the chance `ratio`.
        initialize: {
          kind: 'initialize',
          label: 'Initialize',
          space: 'town',
          targets: ['freeSite', 'draw'],
        },
        freeSite: {
          kind: 'select',
          selected: 'initialize',
          agent: 'site',
          space: 'town',
          targets: ['freeSiteAvailable'],
        },
        freeSiteAvailable: {
          kind: 'query',
          selected: 'freeSite',
          function: 'available',
          targets: ['settle'],
        },
        settle: { kind: 'move', selected: 'initialize', destination: 'freeSite' },
        draw: {
          kind: 'evaluate',
          selected: 'initialize',
          function: 'randomUnit',
          targets: ['drawnRed'],
        },
        drawnRed: {
          kind: 'query',
          selected: 'initialize',
          function: 'lesser',
          inputs: [{ evaluate: 'draw' }, { attribute: 'ratio' }],
          targets: ['setRed', 'drawnBlue'],
        },
        drawnBlue: { kind: 'none', selected: 'initialize', targets: ['setBlue'] },
        setRed: {
          kind: 'set',
          selected: 'initialize',
          attribute: 'resident.group',
          parameter: { option: 'resident.group.red' },
        },
        setBlue: {
          kind: 'set',
          selected: 'initialize',
          attribute: 'resident.group',
          parameter: { option: 'resident.group.blue' },
        },

        // Count the neighbours, and those of the same group; the share is one over the other.
        assess: {
          kind: 'rule',
          label: 'Assess',
          space: 'town',
          targets: ['clearNeighbors', 'clearSame', 'others', 'anyNeighbors'],
        },
        clearNeighbors: {
          kind: 'set',
          selected: 'assess',
          attribute: 'resident.neighbors',
          parameter: { constant: 'zero' },
        },
        clearSame: {
          kind: 'set',
          selected: 'assess',
          attribute: 'resident.same',
          parameter: { constant: 'zero' },
        },
        others: {
          kind: 'select',
          selected: 'assess',
          agent: 'resident',
          space: 'town',
          targets: ['otherNeighbor', 'everyOther'],
        },
        otherNeighbor: {
          kind: 'query',
          selected: 'others',
          function: 'neighbor',
          targets: ['neighborhood'],
        },
        everyOther: {
          kind: 'query',
          selected: 'others',
          function: 'all',
          targets: ['neighborhood'],
        },
        neighborhood: {
          kind: 'all',
          selected: 'others',
          targets: ['oneMoreNeighbor', 'sameGroup'],
        },
        oneMoreNeighbor: {
          kind: 'evaluate',
          selected: 'assess',
          function: 'increment',
          inputs: [{ attribute: 'resident.neighbors' }],
          targets: ['setNeighbors'],
        },
        setNeighbors: {
          kind: 'set',
          selected: 'assess',
          attribute: 'resident.neighbors',
          parameter: { evaluate: 'oneMoreNeighbor' },
        },
        sameGroup: {
          kind: 'query',
          selected: 'others',
          function: 'equal',
          inputs: [
            { attribute: 'resident.group' },
            { attribute: 'resident.group', selected: 'assess' },
          ],
          targets: ['oneMoreSame'],
        },
        oneMoreSame: {
          kind: 'evaluate',
          selected: 'assess',
          function: 'increment',
          inputs: [{ attribute: 'resident.same' }],
          targets: ['setSame'],
        },
        setSame: {
          kind: 'set',
          selected: 'assess',
          attribute: 'resident.same',
          parameter: { evaluate: 'oneMoreSame' },
        },
        anyNeighbors: {
          kind: 'query',
          selected: 'assess',
          function: 'greater',
          inputs: [{ attribute: 'resident.neighbors' }, { literal: 0 }],
          targets: ['share', 'noNeighbors'],
        },
        share: {
          kind: 'evaluate',
          selected: 'assess',
          function: 'div',
          inputs: [{ attribute: 'resident.same' }, { attribute: 'resident.neighbors' }],
          targets: ['setSimilar'],
        },
        setSimilar: {
          kind: 'set',
          selected: 'assess',
          attribute: 'resident.similar',
          parameter: { evaluate: 'share' },
        },
        noNeighbors: { kind: 'none', selected: 'assess', targets: ['clearSimilar'] },
        clearSimilar: {
          kind: 'set',
          selected: 'assess',
          attribute: 'resident.similar',
          parameter: { constant: 'zero' },
        },

        // Happy with no neighbours or enough similar ones; the unhappy move to a free site.
        move: {
          kind: 'rule',
          label: 'Move',
          space: 'town',
          targets: ['alone', 'content'],
        },
        alone: {
          kind: 'query',
          selected: 'move',
          function: 'equal',
          inputs: [{ attribute: 'resident.neighbors' }, { literal: 0 }],
          targets: ['happy', 'unhappy'],
        },
        content: {
          kind: 'query',
          selected: 'move',
          function: 'greaterorEqual',
          inputs: [{ attribute: 'resident.similar' }, { attribute: 'tolerance' }],
          targets: ['happy', 'unhappy'],
        },
        happy: { kind: 'any', selected: 'move', targets: ['setHappy'] },
        unhappy: { kind: 'none', selected: 'move', targets: ['setUnhappy', 'newSite'] },
        setHappy: {
          kind: 'set',
          selected: 'move',
          attribute: 'resident.happy',
          parameter: { constant: 'true' },
        },
        setUnhappy: {
          kind: 'set',
          selected: 'move',
          attribute: 'resident.happy',
          parameter: { constant: 'false' },
        },
        newSite: {
          kind: 'select',
          selected: 'move',
          agent: 'site',
          space: 'town',
          targets: ['newSiteAvailable'],
        },
        newSiteAvailable: {
          kind: 'query',
          selected: 'newSite',
          function: 'available',
          targets: ['moveToNewSite'],
        },
        moveToNewSite: { kind: 'move', selected: 'move', destination: 'newSite' },
      },
      styles: {
        residentStyle: {
          kind: '2d',
          label: 'Resident Style',
          acts: {
            look: { kind: 'rule', space: 'town', targets: ['isRed'] },
            isRed: {
              kind: 'query',
              selected: 'look',
              function: 'equal',
              inputs: [{ attribute: 'resident.group' }, { option: 'resident.group.red' }],
              targets: ['red', 'isBlue'],
            },
            isBlue: { kind: 'none', selected: 'look', targets: ['blue'] },
            red: {
              kind: 'evaluate',
              selected: 'look',
              function: 'colorRGB',
              inputs: rgb(0.851, 0.282, 0.231),
              targets: ['redSquare'],
            },
            redSquare: {
              kind: 'evaluate',
              selected: 'look',
              function: 'shapeRectangle',
              targets: ['fillRed'],
            },
            fillRed: { kind: 'evaluate', selected: 'look', function: 'graphicFill' },
            blue: {
              kind: 'evaluate',
              selected: 'look',
              function: 'colorRGB',
              inputs: rgb(0.231, 0.49, 0.847),
              targets: ['blueSquare'],
            },
            blueSquare: {
              kind: 'evaluate',
              selected: 'look',
              function: 'shapeRectangle',
              targets: ['fillBlue'],
            },
            fillBlue: { kind: 'evaluate', selected: 'look', function: 'graphicFill' },
          },
        },
      },
    },
  },
  spaces: {
    town: {
      kind: 'grid',
      label: 'Town',
      neighborhood: 'moore',
      dimensions: ['width', 'height'],
      attributes: {
        width: { type: 'integer', label: 'Width', default: 30, min: 5, max: 200 },
        height: { type: 'integer', label: 'Height', default: 30, min: 5, max: 200 },
      },
    },
  },
};
