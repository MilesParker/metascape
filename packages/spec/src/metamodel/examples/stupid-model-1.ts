// SPDX-License-Identifier: EPL-2.0
//
// StupidModel 1, written by hand in the Metascape model format from
// examples/org.eclipse.amp.amf.examples.escape/StupidModel1.metaabm in the
// Eclipse Agent Modeling Platform, made available under the Eclipse Public
// License. It is a test of the format: a later step generates the AMP examples
// from their .metaabm files.
//
// Dropped in translation, as docs/metamodel-review.md describes: the
// implementation (Java class) of each element, the grid's "Dimensions" array
// attribute (R3), and editor-generated plural labels of acts.
import type { Model } from '../types';

/** Bugs that move at random to an empty neighbouring cell within their vision. */
export const stupidModel1: Model = {
  schemaVersion: 2,
  id: 'stupidModel1',
  label: 'StupidModel1',
  pluralLabel: 'StupidModel1s',
  language: 'typescript',
  attributes: {
    bugCount: {
      type: 'integer',
      label: 'Bug Count',
      pluralLabel: 'Bug Counts',
      description: 'The number of bugs to create.',
      default: 100,
    },
    habitatCount: {
      type: 'integer',
      label: 'Habitat Count',
      pluralLabel: 'Habitat Counts',
      description: 'The number of habitats to create.',
    },
    bugVision: { type: 'integer', label: 'Bug Vision', pluralLabel: 'Bug Visions', default: 4 },
  },
  acts: {
    id: 'rootActGroup',
    label: 'Root Act Group',
    pluralLabel: 'Root Act Groups',
    members: {
      buildStupidModel1: {
        kind: 'build',
        label: 'Build StupidModel1',
        pluralLabel: 'Build StupidModel1s',
        targets: ['createBugs', 'createHabitats', 'fillGrid'],
      },
      createBugs: {
        kind: 'create',
        label: 'Create Bugs',
        selected: 'buildStupidModel1',
        agent: 'bug',
        agentCount: { attribute: 'stupidModel1.bugCount' },
      },
      createHabitats: {
        kind: 'create',
        label: 'Create Habitats',
        selected: 'buildStupidModel1',
        agent: 'habitat',
        agentCount: { attribute: 'stupidModel1.habitatCount' },
      },
      fillGrid: {
        kind: 'buildGrid',
        label: 'Fill Grid',
        pluralLabel: 'Fill Grids',
        selected: 'buildStupidModel1',
        agents: ['bug'],
        space: 'grid2D',
        fillAgent: 'habitat',
      },
    },
  },
  agents: {
    bug: {
      kind: 'agent',
      label: 'Bug',
      pluralLabel: 'Bugs',
      acts: {
        id: 'rootActGroup',
        label: 'Root Act Group',
        pluralLabel: 'Root Act Groups',
        members: {
          initialize: {
            kind: 'initialize',
            label: 'Initialize',
            pluralLabel: 'Initializes',
            space: 'grid2D',
            targets: ['randomHabitat'],
          },
          randomHabitat: {
            kind: 'select',
            label: 'Random Habitat',
            selected: 'initialize',
            agent: 'habitat',
            space: 'grid2D',
            targets: ['randomHabitatAvailableQuery'],
          },
          randomHabitatAvailableQuery: {
            kind: 'query',
            label: 'Random Habitat: Available() Query',
            selected: 'randomHabitat',
            function: 'available',
            targets: ['movetoHabitatinGrid2D'],
          },
          movetoHabitatinGrid2D: {
            kind: 'move',
            label: 'Move to Habitat in Grid 2D',
            selected: 'initialize',
            destination: 'randomHabitat',
          },
          bugRule: {
            kind: 'rule',
            label: 'Bug Rule',
            pluralLabel: 'Bug Rules',
            description:
              "Move to a neighboring space. (In this version we also have to manually notify the bug's broker. :( )",
            space: 'grid2D',
            targets: ['nearbySpace'],
          },
          nearbySpace: {
            kind: 'select',
            label: 'Nearby Space',
            selected: 'bugRule',
            agent: 'habitat',
            space: 'grid2D',
            targets: ['habitatAvailable', 'habitatWItin'],
          },
          habitatAvailable: {
            kind: 'query',
            label: 'Habitat Available',
            selected: 'nearbySpace',
            function: 'available',
            targets: ['nearbySpace_HabitatAvailableAndHabitatWItin_'],
          },
          habitatWItin: {
            kind: 'query',
            label: 'Habitat WItin',
            selected: 'nearbySpace',
            function: 'within',
            inputs: [{ attribute: 'stupidModel1.bugVision', selected: 'bugRule' }],
            targets: ['nearbySpace_HabitatAvailableAndHabitatWItin_'],
          },
          nearbySpace_HabitatAvailableAndHabitatWItin_: {
            kind: 'all',
            label: 'Nearby Space (Habitat Available & Habitat WItin)',
            selected: 'nearbySpace',
            targets: ['movetoBuginGrid2D'],
          },
          movetoBuginGrid2D: {
            kind: 'move',
            label: 'Move to Bug in Grid 2D',
            selected: 'bugRule',
            destination: 'nearbySpace',
          },
        },
      },
      styles: {
        bugStyle2D: {
          kind: '2d',
          label: 'Bug Style 2D',
          pluralLabel: 'Bug Style 2Ds',
          acts: {
            id: 'rootActGroup',
            label: 'Root Act Group',
            pluralLabel: 'Root Act Groups',
            members: {
              bugRule: {
                kind: 'rule',
                label: 'Bug Rule',
                pluralLabel: 'Bug Rules',
                space: 'grid2D',
                targets: ['bugRuleColorRed'],
              },
              bugRuleColorRed: {
                kind: 'evaluate',
                label: 'Bug Rule: Color Red()',
                selected: 'bugRule',
                function: 'colorRed',
                targets: ['bugRuleShapeOval'],
              },
              bugRuleShapeOval: {
                kind: 'evaluate',
                label: 'Bug Rule: Shape Oval()',
                selected: 'bugRule',
                function: 'shapeOval',
                targets: ['bugRuleGraphicFill'],
              },
              bugRuleGraphicFill: {
                kind: 'evaluate',
                label: 'Bug Rule: Graphic Fill()',
                selected: 'bugRule',
                function: 'graphicFill',
              },
            },
          },
        },
      },
    },
    habitat: {
      kind: 'agent',
      label: 'Habitat',
      pluralLabel: 'Habitats',
      acts: {
        id: 'rootActGroup',
        label: 'Root Act Group',
        pluralLabel: 'Root Act Groups',
        members: {},
      },
      styles: {
        habitatStyle2D: {
          kind: '2d',
          label: 'Habitat Style 2D',
          pluralLabel: 'Habitat Style 2Ds',
          acts: {
            id: 'rootActGroup',
            label: 'Root Act Group',
            pluralLabel: 'Root Act Groups',
            members: {
              habitatRule: {
                kind: 'rule',
                label: 'Habitat Rule',
                pluralLabel: 'Habitat Rules',
                space: 'grid2D',
                targets: ['habitatRuleColorGreen'],
              },
              habitatRuleColorGreen: {
                kind: 'evaluate',
                label: 'Habitat Rule: Color Green()',
                selected: 'habitatRule',
                function: 'colorGreen',
                targets: ['habitatRuleShapeRectangle'],
              },
              habitatRuleShapeRectangle: {
                kind: 'evaluate',
                label: 'Habitat Rule: Shape Rectangle()',
                selected: 'habitatRule',
                function: 'shapeRectangle',
                targets: ['habitatRuleGraphicFill'],
              },
              habitatRuleGraphicFill: {
                kind: 'evaluate',
                label: 'Habitat Rule: Graphic Fill()',
                selected: 'habitatRule',
                function: 'graphicFill',
              },
            },
          },
        },
      },
    },
  },
  spaces: {
    grid2D: {
      kind: 'grid',
      label: 'Grid 2D',
      pluralLabel: 'Grid 2Ds',
      borderRule: 'periodic',
      neighborhood: 'moore',
      dimensions: ['width', 'height'],
      attributes: {
        width: {
          type: 'integer',
          label: 'Width',
          pluralLabel: 'Widths',
          description: 'The horizontal extent of the space.',
          default: 100,
        },
        height: {
          type: 'integer',
          label: 'Height',
          pluralLabel: 'Heights',
          description: 'The vertical extent of the space.',
          default: 100,
        },
      },
    },
  },
};
