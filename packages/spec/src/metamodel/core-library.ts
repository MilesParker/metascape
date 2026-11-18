// SPDX-License-Identifier: EPL-2.0
// Translated from core_library.metaabm in the Eclipse Agent Modeling Platform
// (org.eclipse.amp.amf.acore/src/model), made available under the Eclipse
// Public License. The format it is written in is derived from the MetaABM
// metamodel: see ./types.ts.
import type { Library } from './types';

/**
 * The core function library: every built-in function a sink (query or
 * evaluate) can name, with its typed input and output prototypes.
 *
 * This is the function library of AMP's `core_library.metaabm`, as data.
 * Implementations come with the interpreter. Left out, as decided in
 * docs/metamodel-review.md: the list functions `item` and `length` and the
 * random functions `randomMember` and `randomWeighted`, which take arrays
 * (R3); `withinBoundaries`, whose only input is an array; and `boundary2D`,
 * the only function with two outputs (R11). The other departures from the
 * original are listed under "Ambiguities" in that document: `not` takes a
 * boolean, `randomState` yields an option of its input state, the math
 * library's duplicate `pow` is left out, and `original`'s unnamed input is
 * called `value`.
 *
 * The constants are the attributes `true`, `false`, `zero` and `unit` of the
 * original's context. `zero` and `unit` are numeric, so they take the type of
 * where they are used. The untyped `path` and `self` are unused and left out.
 */
export const coreLibrary: Library = {
  label: 'Core Functions',
  constants: {
    true: { type: 'boolean', value: true, label: 'True' },
    false: { type: 'boolean', value: false, label: 'False' },
    zero: { type: 'numeric', value: 0, label: 'Zero', description: 'The value 0.' },
    unit: { type: 'numeric', value: 1, label: 'Unit', description: 'The unit value, e.g. 1.' },
  },
  subs: {
    operators: {
      label: 'Operators',
      subs: {
        logicalOperators: {
          label: 'Logical Operators',
          description:
            'Logical operators allow comparison between values. They are typically used in Query terms but may be used in Evaluate actions as well.',
          functions: {
            not: {
              kind: 'logicalOperator',
              label: 'Not',
              symbol: '!',
              inputs: {
                arg0: { type: 'boolean', label: 'Argument 0' },
              },
            },
            equal: {
              kind: 'logicalOperator',
              label: 'Equal',
              symbol: '==',
              inputs: {
                arg0: { type: 'generic', label: 'Argument 0' },
                arg1: { type: 'generic', label: 'Argument 1' },
              },
            },
            identical: {
              kind: 'logicalOperator',
              label: 'Identical',
              symbol: '==',
              inputs: {
                arg0: { type: 'generic', label: 'Argument 0' },
                arg1: { type: 'generic', label: 'Argument 1' },
              },
            },
            greater: {
              kind: 'logicalOperator',
              label: 'Greater',
              symbol: '>',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            lesser: {
              kind: 'logicalOperator',
              label: 'Lesser',
              symbol: '<',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            greaterorEqual: {
              kind: 'logicalOperator',
              label: 'Greater or Equal',
              symbol: '>=',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            lesserorEqual: {
              kind: 'logicalOperator',
              label: 'Lesser or Equal',
              symbol: '<=',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            true: {
              kind: 'logicalOperator',
              label: 'True',
              symbol: 'true',
            },
            false: {
              kind: 'logicalOperator',
              label: 'False',
              symbol: 'false',
            },
            identity: {
              kind: 'logicalOperator',
              label: 'Identity',
              inputs: {
                arg0: { type: 'generic', label: 'Argument 0' },
              },
            },
            different: {
              kind: 'logicalOperator',
              label: 'Different',
              symbol: '!=',
              inputs: {
                argument0: { type: 'generic', label: 'Argument 0' },
                argument1: { type: 'generic', label: 'Argument 1' },
              },
            },
          },
        },
        numericOperators: {
          label: 'Numeric Operators',
          description: 'Numeric operators support all of the basic operators used in evaluations.',
          functions: {
            neg: {
              kind: 'operator',
              label: 'Negative Value',
              symbol: '-',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
              },
            },
            add: {
              kind: 'operator',
              label: 'Add',
              symbol: '+',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            sub: {
              kind: 'operator',
              label: 'Subtract',
              symbol: '-',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            mul: {
              kind: 'operator',
              label: 'Multiply',
              symbol: '*',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            div: {
              kind: 'operator',
              label: 'Divide',
              symbol: '/',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            pow: {
              kind: 'operator',
              label: 'Power',
              symbol: '^',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            mod: {
              kind: 'operator',
              label: 'Modulo',
              symbol: '%',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
                arg1: { type: 'numeric', label: 'Argument 1' },
              },
            },
            increment: {
              kind: 'operator',
              label: 'Increment',
              description:
                'Incremented numeric value by 1 unit. Not transformative of initial value like C!',
              symbol: '++',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
              },
            },
            decrement: {
              kind: 'operator',
              label: 'Decrement',
              description: 'Decrement numeric value by 1 unit.',
              symbol: '--',
              inputs: {
                arg0: { type: 'numeric', label: 'Argument 0' },
              },
            },
            unit: {
              kind: 'operator',
              label: 'Unit Value',
              description: 'The value of one common unit, e.g. 1.',
              symbol: '1',
            },
            zero: {
              kind: 'operator',
              label: 'Zero Value',
              description: 'The value of no units, e.g. zero.',
              symbol: '0',
            },
            original: {
              kind: 'operator',
              label: 'Original Value',
              description: 'The original value, e.g. the value for the value client at time 0.',
              symbol: '0',
              inputs: {
                value: {
                  type: 'numeric',
                  description:
                    'Simply return the value itself. This is useful for some limited cases where atrrbitues cannot be used directly.',
                },
              },
            },
          },
        },
      },
    },
    spatial: {
      label: 'Spatial',
      description:
        'Spatial functions provide the core functionality for Agent Models. Spatial functions are polymorphic, which basically means that they don\'t care what space they are operating on as long as that space is suitable for them. Spatial functions are designed to collaborate with one another. For example, by intersecting the "Neighbor", "Available" and "Toward" functions, we can design a rule that causes the agent to move to the next neighboring cell that get\'s it closer to some target agent. See the function details for more information.',
      functions: {
        nearest: {
          kind: 'genericLogical',
          label: 'Nearest',
          description:
            'Represents the nearest agents (including gird cells) or locations to this agent. If more than one agent or location is the same distance away they will all be considered. Note that while this function is defined for the selection of an agent, the result of this function is defined by the context within which it is used. If the selection specifies another agent within a space, this function will represent the nearest agent in that space. If the selection specifies a Cell within a grid space, this function will represent that cell.',
        },
        toward: {
          kind: 'genericLogical',
          label: 'Toward',
          description:
            "Represents a location that is on the shortest path to a particular agent or location from the source agent (that is, the selection's selection's agent). This function collaborates with the within and neighbor functions to allow the agent to move in a particular direction towards some objective.",
        },
        within: {
          kind: 'genericLogical',
          label: 'Within',
          description:
            'Represents a limit to the distance of a spatial search. When used in combination with other spatial functions such as "nearest" requires that all agents or locations must be within the distance specified by the input value.',
          inputs: {
            distance: { type: 'numeric', label: 'Distance' },
          },
        },
        lineOfSight: {
          kind: 'genericLogical',
          label: 'Line Of Sight',
          description:
            'Represents the locations that can be seen from the source agent along each direction of the grid\'s neighborhood (the four lattice directions of a von Neumann grid, the eight of a Moore grid), up to the distance specified by the input value, with wrapping at the edges of a periodic grid. Used with "include self" and "maximize", it finds the best location in sight. Not in the original library: added for Sugarscape vision (Epstein and Axtell, 1996). In a space that is not a grid it means the same as "within".',
          inputs: {
            distance: { type: 'numeric', label: 'Distance' },
          },
        },
        neighbor: {
          kind: 'genericLogical',
          label: 'Neighbor',
          description:
            "Represents any agents that are nearest neighbors to the agent, that is nominally of distance 1. This function is only relevant in discrete spaces -- grids and networks -- where there are immediate neighboring cells as defined by the geometry of the selection's space.",
        },
        includeSelf: {
          kind: 'genericLogical',
          label: 'Include Self',
          description:
            "Specifies whether the agent that we are searching from -- that is, the agent of the selection for this Query Action's selection -- is included in the results of the search.",
        },
        here: {
          kind: 'genericLogical',
          label: 'Here',
          description:
            "Represents the location of the searching agent. For example, if a selection is defined for an agent cell, and that selection's selection's agent is an occupant of a cell, the cell that the agent is occupying will be used.",
        },
        available: {
          kind: 'genericLogical',
          label: 'Available',
          description:
            'Represents cells which are not currently occupied. This function is only relevant for grids which are not multi-occupant.',
        },
        distance: {
          kind: 'genericFunction',
          label: 'Distance',
          description:
            'The distance between the source agent and an agent represented by this selection. If more than one agent is represented by the other functions in the selection, this function will the distance to an arbitrary (randomly selected) agent as defined by those other functions.',
          output: { type: 'real', label: 'Distance Between Agents' },
        },
        locationX: {
          kind: 'genericFunction',
          label: 'Location X',
          description:
            "The first coordinate of the location the source agent is at in the selection's space: its cell's column in a grid. Not in the original library: added to give grid cells a landscape defined by their position.",
          output: { type: 'integer', label: 'X' },
        },
        locationY: {
          kind: 'genericFunction',
          label: 'Location Y',
          description:
            "The second coordinate of the location the source agent is at in the selection's space: its cell's row in a grid. Not in the original library.",
          output: { type: 'integer', label: 'Y' },
        },
        away: {
          kind: 'genericLogical',
          label: 'Away',
          description:
            "Represents a location that is on the path that will take the source agent (that is, the selection's selection's agent) the farthest distance from the agent(s) represented by the search. This function collaborates with the within and neighbor functions to allow the agent to move in a particular direction away from some location or agent.",
        },
        minimize: {
          kind: 'genericLogical',
          label: 'Minimize',
          description:
            'Finds the agent with the lowest value for the specified input. For example, if we created a Select for HeatCell, created a Minimize Query Term with Heat as the input Query Term, created Neighbor and Available Query Terms and set an Intersect as the target for all of those Queries, the result would be the the neighboring available cell with the lowest heat level.',
          inputs: {
            minimumValue: {
              type: 'real',
              label: 'Minimum Value',
              description: 'The value we will minimize for.',
            },
          },
        },
        maximize: {
          kind: 'genericLogical',
          label: 'Maximize',
          description:
            'Finds the agent with the highest value for the specified input. For example, if we created a Select for HeatCell, created a Maximize Query Term with Heat as the input Query Term, created Neighbor and Available Query Terms and set an Intersect as the target for all of those Queries, the result would be the the neighboring available cell with the highest heat level.',
          inputs: {
            minimumValue: {
              type: 'real',
              label: 'Minimum Value',
              description: 'The value we will maximize for.',
            },
          },
        },
        location2D: {
          kind: 'genericLogical',
          label: 'Location 2D',
          description:
            'Represents the location of the current agent for use in subsequent selections.',
          inputs: {
            x: { type: 'real', label: 'X' },
            y: { type: 'real', label: 'Y' },
          },
        },
        all: {
          kind: 'genericLogical',
          label: 'All',
          description:
            'Causes all agents that meet the other query terms to be included in a selection. Without this query term, a single random agent is picked out of all agents matching the query terms.',
        },
      },
    },
    random: {
      label: 'Random',
      description:
        "Random functions are especially significant for agent models. Of particular interest are the weighted membership and random state and boolean value functions. You should be familiar with these functions so that you don't have to create more complex Action flows to accomplish the same thing.\n\nNote that we only have support for uniform distributions as of this release. We're working on a collaborative design for evaluations that allow easy mixing and matching of random functions and distributions.",
      functions: {
        randomInRange: {
          kind: 'genericFunction',
          label: 'Random In Range',
          description:
            'A pseudo-random value within that numeric range specified as drawn from a uniform distribution. The minimum values are inclusive. The maximum values are inclusive for integer inputs and exclusive for Real inputs.',
          inputs: {
            min: {
              type: 'numeric',
              label: 'Minimum Value',
              description: 'The minimum value (inclusive).',
            },
            max: {
              type: 'numeric',
              label: 'Maximum Value',
              description: 'The maximum value (inclusive).',
            },
          },
          output: { type: 'numeric', label: 'Random Number', description: 'The random number.' },
        },
        randomToLimit: {
          kind: 'genericFunction',
          label: 'Random To Limit',
          description:
            'A pseudo-random value between zero and the value specified by the (non-zero) input and drawn from a uniform range. That value is inclusive for Integers and exclusive for Reals. (Note that as with the random in range function in the context of real numbers the distinction between an exclusive and inclusive limit is essentially meaningless.)',
          inputs: {
            max: {
              type: 'numeric',
              label: 'Maximum Value',
              description: 'The maximum value (inclusive).',
            },
          },
          output: { type: 'numeric', label: 'Random Number', description: 'The result.' },
        },
        randomUnit: {
          kind: 'genericFunction',
          label: 'Random Unit',
          description:
            'A pseudo-random Real value between 0 and 1 drawn from a uniform distribution. (The distinction between inclusive and exclusive range is essentially meaningless in this context and we can assume that the result will never be greater or equal to 1.)',
          output: { type: 'real', label: 'Random Value' },
        },
        randomIs: {
          kind: 'genericLogical',
          label: 'Random Boolean',
          description: 'A value that is randomly true or false, i.e. a fair coin toss.',
        },
        randomState: {
          kind: 'genericFunction',
          label: 'Random State',
          description: 'A random specified value (option) from the specified state.',
          inputs: {
            strategyEnum: {
              type: 'generic',
              label: 'Strategy Enum',
              description: 'The state to select items from. All items are included.',
            },
          },
          output: {
            type: 'generic',
            label: 'Selected Strategy',
            description: 'The resulting option.',
          },
        },
      },
    },
    graphic: {
      label: 'Graphic',
      description:
        'Graphic functions are combined within Style Evaluate Actions to determine how to draw an agent within a visualization. One nice aspect of this approach is that the same style definition can be used in multiple places without changing any code. For example, the same style could be used to draw an agent on a two-dimensional grid within Escape, a three-dimensional shape within Escape, a Java Swing based visualization in Ascape, and an XML configured visualizaiton in Repast Simphony.\n\nTo define a graphic style for an agent, design a flow in which you create Evaluate Actions for color and shape, and then create an Evaluate Action with the graphic fill or outline function as a target of these.',
      functions: {
        shapeOval: {
          kind: 'genericFunction',
          label: 'Shape Oval',
          description: 'Draw a generic oval.',
        },
        shapeRectangle: {
          kind: 'genericFunction',
          label: 'Shape Rectangle',
          description: 'Draws a rectangular shape.',
        },
        shapeInset: {
          kind: 'genericFunction',
          label: 'Shape Inset',
          description:
            'Shrinks the current shape by the input amount. (The overall scale is currently unspecified, but in most implementations should be 20.)',
          inputs: {
            value: {
              type: 'integer',
              label: 'Value',
              description: 'Number of nominal pixels to inset.',
            },
          },
        },
        shapeMarker: {
          kind: 'genericFunction',
          label: 'Shape Marker',
          description:
            'Draw a marker, that is a graphical indicator that can be used to add an additional que about the object state. For example, in a two-dimensional graphics representation this might be a small shape drawn inset at the corner of the larger shape.',
        },
        shapeMarker2: {
          kind: 'genericFunction',
          label: 'Shape Marker 2',
          description:
            'Represents a marker placed in a different location from the other shape markers.',
        },
        shapeMarker3: {
          kind: 'genericFunction',
          label: 'Shape Marker 3',
          description:
            'Represents a marker placed in a different location from the other shape markers.',
        },
        colorRGB: {
          kind: 'genericFunction',
          label: 'Color RGB',
          description:
            'A color specified by the three inputs for Red, Green and Blue color components. Those inputs are expected to be in the range 0..1.',
          inputs: {
            red: { type: 'real', label: 'Red Component', description: 'A value from 0.0 to 1.0.' },
            green: {
              type: 'real',
              label: 'Green Component',
              description: 'A value from 0.0 to 1.0.',
            },
            blue: {
              type: 'real',
              label: 'Blue Component',
              description: 'A value from 0.0 to 1.0.',
            },
          },
        },
        colorRed: {
          kind: 'genericFunction',
          label: 'Color Red',
          description: 'The color red.',
        },
        colorYellow: {
          kind: 'genericFunction',
          label: 'Color Yellow',
          description: 'The color yellow.',
        },
        colorBlue: {
          kind: 'genericFunction',
          label: 'Color Blue',
          description: 'The color blue.',
        },
        colorOrange: {
          kind: 'genericFunction',
          label: 'Color Orange',
          description: 'The color orange.',
        },
        colorGreen: {
          kind: 'genericFunction',
          label: 'Color Green',
          description: 'The color green.',
        },
        colorPurple: {
          kind: 'genericFunction',
          label: 'Color Purple',
          description: 'The color purple.',
        },
        colorBlack: {
          kind: 'genericFunction',
          label: 'Color Black',
          description: 'The color black.',
        },
        colorWhite: {
          kind: 'genericFunction',
          label: 'Color White',
          description: 'The color white.',
        },
        colorGray: {
          kind: 'genericFunction',
          label: 'Color Gray',
          description: 'The color gray.',
        },
        graphicOutline: {
          kind: 'genericFunction',
          label: 'Graphic Outline',
          description:
            'Draws an outline of the last evaluated shape, using the last specified color or the default color (usually black) if none has been specified.',
        },
        graphicFill: {
          kind: 'genericFunction',
          label: 'Graphic Fill',
          description:
            'Fills the last evaluated shape with the last specified color or the default color (usually black) if none has been specified.',
        },
      },
    },
    time: {
      label: 'Time',
      description: 'Time functions return values related to model execution time.',
      functions: {
        timeNow: {
          kind: 'genericFunction',
          label: 'Now',
          description:
            "The current period, that is the number of iterations that the model has gone through, or in the case of models with callibrarted time, the number of iterations added to the model's nominal start time.",
          output: { type: 'integer', label: 'Period', description: 'The current period.' },
        },
      },
    },
    math: {
      label: 'Math',
      description:
        "The math functions use the extremely well specified and tested routines form the Java Math library. (Because of copyright restrictions, we aren't able to include the exact definitions here. Click on the links to get more details on each function.)",
      functions: {
        sin: {
          kind: 'genericFunction',
          label: 'Sine',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        cos: {
          kind: 'genericFunction',
          label: 'Cosine',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        tan: {
          kind: 'genericFunction',
          label: 'Tangent',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        asin: {
          kind: 'genericFunction',
          label: 'Arc Sine',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        acos: {
          kind: 'genericFunction',
          label: 'Arc Cosine',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        atan: {
          kind: 'genericFunction',
          label: 'Arc Tangent',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        toRadians: {
          kind: 'genericFunction',
          label: 'Convert Degree to Radians',
          inputs: {
            angdeg: { type: 'real', label: 'Angdeg' },
          },
          output: { type: 'real', label: 'Result' },
        },
        toDegrees: {
          kind: 'genericFunction',
          label: 'Convert Radians to Degrees',
          inputs: {
            angrad: { type: 'real', label: 'Angrad' },
          },
          output: { type: 'real', label: 'Result' },
        },
        exp: {
          kind: 'genericFunction',
          label: 'Exp',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        log: {
          kind: 'genericFunction',
          label: 'Log',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        log10: {
          kind: 'genericFunction',
          label: 'Log b10',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        squareRoot: {
          kind: 'genericFunction',
          label: 'Square Root',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        cbrt: {
          kind: 'genericFunction',
          label: 'Cube Root',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        IEEEremainder: {
          kind: 'genericFunction',
          label: 'Remainder',
          inputs: {
            f1: { type: 'real', label: 'F1' },
            f2: { type: 'real', label: 'F2' },
          },
          output: { type: 'real', label: 'Result' },
        },
        ceil: {
          kind: 'genericFunction',
          label: 'Ceiling',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        floor: {
          kind: 'genericFunction',
          label: 'Floor',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        rint: {
          kind: 'genericFunction',
          label: 'Rount',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        atan2: {
          kind: 'genericFunction',
          label: 'Arc Tangent Rectangular',
          inputs: {
            y: { type: 'real', label: 'Y' },
            x: { type: 'real', label: 'X' },
          },
          output: { type: 'real', label: 'Result' },
        },
        abs: {
          kind: 'genericFunction',
          label: 'Absolute Value',
          inputs: {
            a: { type: 'real', label: 'A' },
          },
          output: { type: 'real', label: 'Result' },
        },
        max: {
          kind: 'genericFunction',
          label: 'Maximum',
          inputs: {
            a: { type: 'real', label: 'A' },
            b: { type: 'real', label: 'B' },
          },
          output: { type: 'real', label: 'Result' },
        },
        min: {
          kind: 'genericFunction',
          label: 'Minimum',
          inputs: {
            a: { type: 'real', label: 'A' },
            b: { type: 'real', label: 'B' },
          },
          output: { type: 'real', label: 'Result' },
        },
        ulp: {
          kind: 'genericFunction',
          label: 'ULP',
          inputs: {
            d: { type: 'real', label: 'D' },
          },
          output: { type: 'real', label: 'Result' },
        },
        signum: {
          kind: 'genericFunction',
          label: 'Sign',
          inputs: {
            d: { type: 'real', label: 'D' },
          },
          output: { type: 'real', label: 'Result' },
        },
        sinh: {
          kind: 'genericFunction',
          label: 'Hyperbolic Sine',
          inputs: {
            x: { type: 'real', label: 'X' },
          },
          output: { type: 'real', label: 'Result' },
        },
        cosh: {
          kind: 'genericFunction',
          label: 'Hyperbolic Cosine',
          inputs: {
            x: { type: 'real', label: 'X' },
          },
          output: { type: 'real', label: 'Result' },
        },
        tanh: {
          kind: 'genericFunction',
          label: 'Hyperbolic Tan',
          inputs: {
            x: { type: 'real', label: 'X' },
          },
          output: { type: 'real', label: 'Result' },
        },
        hypotuneuse: {
          kind: 'genericFunction',
          label: 'Hypotuneuse',
          inputs: {
            x: { type: 'real', label: 'X' },
            y: { type: 'real', label: 'Y' },
          },
          output: { type: 'real', label: 'Result' },
        },
        expm1: {
          kind: 'genericFunction',
          label: 'Expm1',
          inputs: {
            x: { type: 'real', label: 'X' },
          },
          output: { type: 'real', label: 'Result' },
        },
        log1p: {
          kind: 'genericFunction',
          label: 'Log1p',
          inputs: {
            x: { type: 'real', label: 'X' },
          },
          output: { type: 'real', label: 'Result' },
        },
      },
    },
    distribution: {
      label: 'Distribution',
      description:
        'One of the most common tasks in the Agent Modeling process is the creation of agents with particular states drawn from a distribution. For example, you might want to create a number of agents with wealth randomly distributed between some minimum and maximum values. The distribution functions greatly ease the process of setting up those initializations and their associated parameters.',
      functions: {
        uniformCrossDistribution: {
          kind: 'genericFunction',
          label: 'Uniform Cross Distribution',
          description:
            'A random number taken from a distribution of values as defined by a cross of all values. (See Cross Distribution.) This funciton then returns a value drawn from the minimum and maximum values as determined by the current agent state. In the cross distribution, each of the values is treated independently so that an input attribute is created for every potential combination of states.',
          inputs: {
            states: {
              type: 'generic',
              label: 'States',
              description:
                'The list of states to factor into the distribution. This is a multi-argument, which means that you can specify any number of attributes as arguments.',
              multiple: true,
            },
            minimum: {
              type: 'real',
              label: 'Minimum',
              description:
                "The set of attributes that will determine the minimum value of the function result based on the current state of the agent. Note that this list is automatically created and maintained. These values don't need to be and should not be manually edited.",
              multiple: true,
            },
            maximum: {
              type: 'real',
              label: 'Maximum',
              description:
                "The set of attributes that will determine the maximum value of the function result based on the current state of the agent. Note that this list is automatically created and maintained. These values don't need to be and should not be manually edited.",
              multiple: true,
            },
          },
          output: {
            type: 'real',
            label: 'Result',
            description:
              'The resulting random number based on the current agent state and the input parameters.',
          },
        },
        uniformAdditiveDistribution: {
          kind: 'genericFunction',
          label: 'Uniform Additive Distribution',
          description:
            'A random number taken from a distribution of values in which each of the minimum and maximum values are added to determine a total minimum and maximum value. (See Additive Distribution.) In the additive distribution, each of the values is treated as dependent on the others so that an input attribute is only created for each seperate state.',
          inputs: {
            states: {
              type: 'generic',
              label: 'States',
              description:
                'The list of states to factor into the distribution. This is a multi-argument, which means that you can specify any number of attributes as arguments.',
              multiple: true,
            },
            minimum: {
              type: 'real',
              label: 'Minimum',
              description:
                "The set of attributes that will determine the minimum value of the function result based on the current state of the agent. Note that this list is automatically created and maintained. These values don't need to be and should not be manually edited.",
              multiple: true,
            },
            maximum: {
              type: 'real',
              label: 'Maximum',
              description:
                "The set of attributes that will determine the maximum value of the function result based on the current state of the agent. Note that this list is automatically created and maintained. These values don't need to be and should not be manually edited.",
              multiple: true,
            },
          },
          output: {
            type: 'real',
            label: 'Result',
            description:
              'The resulting random number based on the current agent state and the input parameters.',
          },
        },
        crossDistribution: {
          kind: 'genericFunction',
          label: 'Cross Distribution',
          description:
            'A value taken from a set of (auto-generated) attributes based on the value of each state included. For example, if the multi-values included a state X with values A and B and a state Y with values I and II, this distribution would create separate input attributes for AI, AII, BI and BII. Then for an agent with States A and II this function would return the value specified by the AII input attribute.',
          inputs: {
            states: {
              type: 'generic',
              label: 'States',
              description:
                'The list of states to factor into the distribution. This is a multi-argument, which means that you can specify any number of attributes as arguments.',
              multiple: true,
            },
            value: {
              type: 'real',
              label: 'Value',
              description:
                "The set of attributes that when multiplied against each other will determine the value of the function result based on the current state of the agent. Note that this list is automatically created and maintained. These values don't need to be and should not be manually edited.",
              multiple: true,
            },
          },
          output: {
            type: 'real',
            label: 'Result',
            description:
              'The resulting value based on the current agent state and the input parameters.',
          },
        },
        additiveDistribution: {
          kind: 'genericFunction',
          label: 'Additive Distribution',
          description:
            'A value taken from a set of (auto-generated) attributes based on the combined values of the states provided. For example, if the multi-values included a state X with values A and B and a state Y with values I and II, this distribution would create input attributes for A, B, I and II. Those values would then be added together, so that for an Agent with state A and II this function would return A + II.',
          inputs: {
            states: {
              type: 'generic',
              label: 'States',
              description:
                'The states to include in the distribution. This is a multi-argument, which means that you can specify any number of attributes as arguments.',
              multiple: true,
            },
            factor: {
              type: 'real',
              label: 'Factor',
              description:
                "The set of attributes that when combined with each other determine the value of the function result based on the current state of the agent. Note that this list is automatically created and maintained. These values don't need to be and should not be manually edited.",
              multiple: true,
            },
          },
          output: {
            type: 'real',
            label: 'Result',
            description:
              'The resulting value based on the current agent state and the input parameters.',
          },
        },
      },
    },
  },
};
