// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { assertValidModel, checkModel } from './check';
import { stupidModel1 } from './examples/stupid-model-1';
import { ModelFormatError } from './schema';
import type { Act, Agent, Diagnostic, Model, Scape } from './types';

/** A deep copy of a model (models are plain JSON data). */
function clone(model: Model): Model {
  return JSON.parse(JSON.stringify(model)) as Model;
}

/** A copy of StupidModel 1 with a change applied. */
function variant(change: (model: Model) => void): Model {
  const model = clone(stupidModel1);
  change(model);
  return model;
}

function bug(model: Model): Agent | Scape {
  const agent = model.agents?.bug;
  if (!agent) throw new Error('no bug');
  return agent;
}

/** An act of the bug agent, to change in place. */
function bugAct(model: Model, id: string): Act {
  const act = bug(model).acts?.[id];
  if (!act) throw new Error(`no act ${id}`);
  return act;
}

function addBugActs(model: Model, acts: Record<string, Act>): void {
  Object.assign(bug(model).acts!, acts);
}

const BUG = 'agents.bug.acts';

function expectFound(
  diagnostics: Diagnostic[],
  path: string,
  message: string,
  severity: Diagnostic['severity'] = 'error',
): void {
  expect(diagnostics).toContainEqual({ path, severity, message: expect.stringContaining(message) });
}

describe('StupidModel 1', () => {
  it('checks clean', () => {
    expect(checkModel(stupidModel1)).toEqual([]);
    expect(() => assertValidModel(stupidModel1)).not.toThrow();
  });

  it('survives a round trip through JSON', () => {
    const copy: unknown = JSON.parse(JSON.stringify(stupidModel1));
    expect(checkModel(copy as Model)).toEqual([]);
  });
});

describe('structure', () => {
  it('reports input that does not fit the format, with its path', () => {
    const model = variant((m) => Object.assign(bugAct(m, 'bugRule'), { kind: 'rules' }));
    const diagnostics = checkModel(model);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.path).toBe(`${BUG}.bugRule.kind`);
    expect(() => assertValidModel(model)).toThrow(ModelFormatError);
  });

  it('requires IDs and references to be written as IDs', () => {
    const model = variant((m) => {
      Object.assign(bugAct(m, 'habitatWItin'), { inputs: [{ attribute: 'bug..vision' }] });
      m.attributes!['bug count'] = { type: 'integer' };
    });
    const paths = checkModel(model).map((d) => d.path);
    expect(paths).toContain(`${BUG}.habitatWItin.inputs[0].attribute`);
    expect(paths).toContain('attributes.bug count');
  });
});

describe('references', () => {
  it('resolves targets within the agent, suggesting near misses', () => {
    const diagnostics = checkModel(
      variant((m) => Object.assign(bugAct(m, 'bugRule'), { targets: ['nearbySpaces'] })),
    );
    expectFound(
      diagnostics,
      `${BUG}.bugRule.targets[0]`,
      '`nearbySpaces` is not an act of agent `bug` (did you mean `nearbySpace`?)',
    );
  });

  it('does not resolve acts across agents or styles', () => {
    const diagnostics = checkModel(
      variant((m) =>
        Object.assign(bug(m).styles!.bugStyle2D!.acts!.bugRuleColorRed!, {
          targets: ['nearbySpace'],
        }),
      ),
    );
    expectFound(
      diagnostics,
      'agents.bug.styles.bugStyle2D.acts.bugRuleColorRed.targets[0]',
      'is not an act of style `bugStyle2D`',
    );
  });

  it('requires `selected` to name a selection', () => {
    const diagnostics = checkModel(
      variant((m) =>
        Object.assign(bugAct(m, 'movetoBuginGrid2D'), { selected: 'habitatAvailable' }),
      ),
    );
    expectFound(
      diagnostics,
      `${BUG}.movetoBuginGrid2D.selected`,
      '`habitatAvailable` is a query act; a select, create or root act is expected here.',
    );
  });

  it('resolves attributes by their path from the root scape', () => {
    const diagnostics = checkModel(
      variant((m) => {
        Object.assign(bugAct(m, 'habitatWItin'), {
          inputs: [{ attribute: 'bugVisions', selected: 'bugRule' }],
        });
        Object.assign(m.acts!.createBugs!, { agentCount: { attribute: 'model.bugCount' } });
      }),
    );
    expectFound(
      diagnostics,
      `${BUG}.habitatWItin.inputs[0].attribute`,
      'The root scape has no attribute `bugVisions` (did you mean `bugVision`?)',
    );
    expectFound(
      diagnostics,
      'acts.createBugs.agentCount.attribute',
      '`model` is not an agent, scape or space of this model',
    );
  });

  it('resolves functions by ID in the library', () => {
    const diagnostics = checkModel(
      variant((m) => Object.assign(bugAct(m, 'habitatAvailable'), { function: 'availabel' })),
    );
    expectFound(
      diagnostics,
      `${BUG}.habitatAvailable.function`,
      '`availabel` is not a function of the library (did you mean `available`?)',
    );
  });

  it('resolves agents and spaces, of the right kind', () => {
    const diagnostics = checkModel(
      variant((m) => {
        Object.assign(m.acts!.fillGrid!, { space: 'bug', fillAgent: 'grid2D' });
        Object.assign(bugAct(m, 'nearbySpace'), { agent: 'habitats' });
        m.spaces!.links = { kind: 'network' };
        Object.assign(m.acts!.createHabitats!, { space: 'links' });
        m.acts!.connectAll = {
          kind: 'connect',
          selected: 'createBugs',
          destination: 'createHabitats',
          within: 'grid2D',
        };
        Object.assign(m.acts!.createBugs!, { targets: ['connectAll'] });
      }),
    );
    expectFound(diagnostics, 'acts.fillGrid.space', '`bug` is an agent; a space is expected here.');
    expectFound(
      diagnostics,
      'acts.fillGrid.fillAgent',
      '`grid2D` is a space; an agent or scape is expected here.',
    );
    expectFound(
      diagnostics,
      `${BUG}.nearbySpace.agent`,
      '`habitats` is not an agent or scape of this model (did you mean `habitat`?)',
    );
    expectFound(
      diagnostics,
      'acts.connectAll.within',
      '`grid2D` is a grid space; a network space is expected here.',
    );
    expect(diagnostics.filter((d) => d.path === 'acts.createHabitats.space')).toEqual([]);
  });

  it('requires a cause to run a root act', () => {
    const diagnostics = checkModel(
      variant((m) => {
        addBugActs(m, {
          again: { kind: 'cause', selected: 'bugRule', result: 'nearbySpace' },
        });
        Object.assign(bugAct(m, 'movetoBuginGrid2D'), { targets: ['again'] });
      }),
    );
    expectFound(diagnostics, `${BUG}.again.result`, 'a cause runs a root act');
  });
});

describe('IDs (R1)', () => {
  it('refers to acts in groups by their path within the agent', () => {
    const model = variant((m) => {
      addBugActs(m, {
        moves: {
          kind: 'group',
          members: {
            bugRule: { kind: 'rule', targets: ['moves.step'] },
            step: { kind: 'move', selected: 'moves.bugRule', destination: 'moves.bugRule' },
          },
        },
      });
    });
    expect(checkModel(model)).toEqual([]);
    const bare = clone(model);
    Object.assign(bugAct(bare, 'moves'), {
      members: {
        bugRule: { kind: 'rule', targets: ['step'] },
        step: { kind: 'move', selected: 'moves.bugRule', destination: 'moves.bugRule' },
      },
    });
    expectFound(
      checkModel(bare),
      `${BUG}.moves.members.bugRule.targets[0]`,
      '`step` is not an act of agent `bug`',
    );
  });

  it('allows the same act ID in different agents and styles', () => {
    // `bugRule` is both an act of the bug and of its style, as in the original.
    expect(bugAct(stupidModel1, 'bugRule')).toBeDefined();
    expect(checkModel(stupidModel1)).toEqual([]);
  });

  it('requires the IDs of siblings to be unique across their records', () => {
    const diagnostics = checkModel(
      variant((m) => {
        m.attributes!.habitat = { type: 'integer' };
      }),
    );
    expectFound(
      diagnostics,
      'agents.habitat',
      "`habitat` is already the ID of one of this element's attributes.",
    );
  });

  it('allows the same ID in different scapes, referred to by path', () => {
    const model = variant((m) => {
      m.agents!.region = {
        kind: 'scape',
        spaces: { grid2D: { kind: 'network' } },
        attributes: { bugCount: { type: 'integer' } },
        agents: { bug: { kind: 'agent' } },
      };
      m.acts!.createRegionBugs = {
        kind: 'create',
        selected: 'buildStupidModel1',
        agent: 'region.bug',
        space: 'region.grid2D',
        agentCount: { attribute: 'region.bugCount' },
      };
      Object.assign(m.acts!.buildStupidModel1!, {
        targets: ['createBugs', 'createHabitats', 'fillGrid', 'createRegionBugs'],
      });
    });
    expect(checkModel(model)).toEqual([]);
    Object.assign(model.acts!.createRegionBugs!, { agent: 'region.bugs', space: 'grid2D.x' });
    const diagnostics = checkModel(model);
    expectFound(
      diagnostics,
      'acts.createRegionBugs.agent',
      '`region.bugs` is not an agent or scape of this model (did you mean `region.bug`?)',
    );
    expectFound(
      diagnostics,
      'acts.createRegionBugs.space',
      '`grid2D.x` is not a space of this model',
    );
  });

  it('refers to constants of the library, which take the type of where they are used', () => {
    const model = variant((m) => {
      bug(m).attributes = { age: { type: 'integer' }, weight: { type: 'real' } };
      addBugActs(m, {
        older: {
          kind: 'evaluate',
          selected: 'bugRule',
          function: 'add',
          inputs: [{ attribute: 'bug.age' }, { constant: 'unit' }],
          targets: ['setAge'],
        },
        setAge: {
          kind: 'set',
          selected: 'bugRule',
          attribute: 'bug.age',
          parameter: { evaluate: 'older' },
          targets: ['setWeight'],
        },
        setWeight: {
          kind: 'set',
          selected: 'bugRule',
          attribute: 'bug.weight',
          parameter: { constant: 'zero' },
          targets: ['setOther'],
        },
        setOther: {
          kind: 'set',
          selected: 'bugRule',
          attribute: 'bug.age',
          parameter: { constant: 'true' },
          targets: ['setUnknown'],
        },
        setUnknown: {
          kind: 'set',
          selected: 'bugRule',
          attribute: 'bug.age',
          parameter: { constant: 'units' },
        },
      });
      Object.assign(bugAct(m, 'bugRule'), { targets: ['nearbySpace', 'older'] });
    });
    const diagnostics = checkModel(model);
    expect(diagnostics.map((d) => d.path)).toEqual([
      `${BUG}.setOther.parameter`,
      `${BUG}.setUnknown.parameter.constant`,
    ]);
    expectFound(
      diagnostics,
      `${BUG}.setOther.parameter`,
      '`bug.age` takes an integer; `true` is a boolean.',
    );
    expectFound(
      diagnostics,
      `${BUG}.setUnknown.parameter.constant`,
      '`units` is not a constant of the library (did you mean `unit`?)',
    );
  });

  it('resolves attributes of nested scapes', () => {
    const diagnostics = checkModel(
      variant((m) => {
        m.agents!.region = {
          kind: 'scape',
          attributes: { rainfall: { type: 'real', default: 0.5 } },
          agents: { farmer: { kind: 'agent', attributes: { wealth: { type: 'real' } } } },
        };
        addBugActs(m, {
          farmer: { kind: 'select', selected: 'bugRule', agent: 'region.farmer', targets: ['wet'] },
          wet: {
            kind: 'query',
            selected: 'bugRule',
            function: 'lesser',
            inputs: [
              { attribute: 'region.farmer.wealth', selected: 'farmer' },
              { attribute: 'region.rainfall' },
            ],
          },
        });
        Object.assign(bugAct(m, 'bugRule'), { targets: ['nearbySpace', 'farmer'] });
      }),
    );
    expect(diagnostics).toEqual([]);
  });
});

describe('reads (D7)', () => {
  const reading = (acts: Record<string, Act>) =>
    checkModel(
      variant((m) => {
        bug(m).attributes = { size: { type: 'real' } };
        m.agents!.habitat!.attributes = { food: { type: 'real' } };
        addBugActs(m, acts);
        Object.assign(bugAct(m, 'nearbySpace'), {
          targets: ['habitatAvailable', 'habitatWItin', ...Object.keys(acts)],
        });
      }),
    );
  const sum = (inputs: unknown[]): Act =>
    ({ kind: 'evaluate', selected: 'nearbySpace', function: 'add', inputs }) as Act;

  it("reads an attribute from the act's own selection, which must be of an agent that has it", () => {
    const diagnostics = reading({
      own: sum([{ attribute: 'habitat.food' }, { attribute: 'bugVision' }]),
      wrong: sum([{ attribute: 'bug.size' }, { literal: 1 }]),
    });
    expect(diagnostics).toEqual([
      {
        path: `${BUG}.wrong.inputs[0].attribute`,
        severity: 'error',
        message:
          '`bug.size` is read from `nearbySpace`, a selection of `habitat`, which has no such attribute. Name the selection of a `bug` to read it from.',
      },
    ]);
  });

  it('reads an attribute from the selection it names, which must be of an agent that has it', () => {
    const diagnostics = reading({
      named: sum([{ attribute: 'bug.size', selected: 'bugRule' }, { literal: 1 }]),
      wrong: sum([{ attribute: 'habitat.food', selected: 'bugRule' }, { literal: 1 }]),
    });
    expect(diagnostics.map((d) => d.path)).toEqual([`${BUG}.wrong.inputs[0].selected`]);
  });

  it("reads a set's parameter from the root act's selection if its agent has it", () => {
    expect(
      reading({
        feed: {
          kind: 'set',
          selected: 'nearbySpace',
          attribute: 'habitat.food',
          parameter: { attribute: 'bug.size' },
        },
      }),
    ).toEqual([]);
  });
});

describe('flows', () => {
  it('rejects cycles', () => {
    const diagnostics = checkModel(
      variant((m) => Object.assign(bugAct(m, 'movetoBuginGrid2D'), { targets: ['nearbySpace'] })),
    );
    expectFound(
      diagnostics,
      `${BUG}.movetoBuginGrid2D.targets[0]`,
      'This flow loops back: `nearbySpace` → `habitatAvailable` → `nearbySpace_HabitatAvailableAndHabitatWItin_` → `movetoBuginGrid2D` → `nearbySpace`.',
    );
  });

  it('rejects flows into a root act', () => {
    const diagnostics = checkModel(
      variant((m) => Object.assign(bugAct(m, 'movetoBuginGrid2D'), { targets: ['initialize'] })),
    );
    expectFound(
      diagnostics,
      `${BUG}.movetoBuginGrid2D.targets[0]`,
      '`initialize` is a initialize act, which starts its own flow',
    );
  });

  it('requires a root act upstream of every act', () => {
    const diagnostics = checkModel(
      variant((m) => Object.assign(bugAct(m, 'bugRule'), { targets: [] })),
    );
    const unreachable = diagnostics
      .filter((d) => d.message.startsWith('No root act is upstream'))
      .map((d) => d.path);
    expect(unreachable).toEqual([
      `${BUG}.nearbySpace`,
      `${BUG}.habitatAvailable`,
      `${BUG}.habitatWItin`,
      `${BUG}.nearbySpace_HabitatAvailableAndHabitatWItin_`,
      `${BUG}.movetoBuginGrid2D`,
    ]);
  });

  it('requires selections to be upstream', () => {
    const diagnostics = checkModel(
      variant((m) => {
        Object.assign(bugAct(m, 'habitatAvailable'), { selected: 'randomHabitat' });
        Object.assign(bugAct(m, 'habitatWItin'), {
          inputs: [{ attribute: 'bugVision', selected: 'initialize' }],
        });
        Object.assign(bugAct(m, 'movetoBuginGrid2D'), { destination: 'randomHabitat' });
      }),
    );
    expectFound(
      diagnostics,
      `${BUG}.habitatAvailable.selected`,
      '`randomHabitat` is not upstream of this act. A selection is bound only on the flows that pass through it.',
    );
    expectFound(
      diagnostics,
      `${BUG}.habitatWItin.inputs[0].selected`,
      '`initialize` is not upstream',
    );
    expectFound(
      diagnostics,
      `${BUG}.movetoBuginGrid2D.destination`,
      '`randomHabitat` is not upstream',
    );
  });

  it('requires evaluates to be upstream of the acts that use their values', () => {
    const diagnostics = checkModel(
      variant((m) => {
        bug(m).attributes = { age: { type: 'integer' } };
        addBugActs(m, {
          older: {
            kind: 'evaluate',
            selected: 'bugRule',
            function: 'increment',
            inputs: [{ attribute: 'bug.age' }],
          },
          setAge: {
            kind: 'set',
            selected: 'bugRule',
            attribute: 'bug.age',
            parameter: { evaluate: 'older' },
          },
        });
        Object.assign(bugAct(m, 'bugRule'), { targets: ['nearbySpace', 'older', 'setAge'] });
      }),
    );
    expectFound(
      diagnostics,
      `${BUG}.setAge.parameter.evaluate`,
      "`older` is not upstream of this act. An evaluate's value flows only to the acts downstream of it.",
    );
  });

  it('requires logic acts to combine queries and logic acts', () => {
    const diagnostics = checkModel(
      variant((m) =>
        Object.assign(bugAct(m, 'nearbySpace'), {
          targets: [
            'habitatAvailable',
            'habitatWItin',
            'nearbySpace_HabitatAvailableAndHabitatWItin_',
          ],
        }),
      ),
    );
    expectFound(
      diagnostics,
      `${BUG}.nearbySpace_HabitatAvailableAndHabitatWItin_`,
      '`nearbySpace` (a select act) flows into this all act. Logic acts combine queries and other logic acts.',
    );
  });
});

describe('sinks', () => {
  it('matches inputs to prototypes in number', () => {
    const diagnostics = checkModel(
      variant((m) => Object.assign(bugAct(m, 'habitatWItin'), { inputs: [] })),
    );
    expectFound(
      diagnostics,
      `${BUG}.habitatWItin.inputs`,
      '`within` takes 1 input (distance); this query has 0.',
    );
  });

  it('matches inputs to prototypes in type', () => {
    const diagnostics = checkModel(
      variant((m) => Object.assign(bugAct(m, 'habitatWItin'), { inputs: [{ literal: true }] })),
    );
    expectFound(
      diagnostics,
      `${BUG}.habitatWItin.inputs[0]`,
      'Input `distance` of `within` takes a number; true is a boolean.',
    );
  });

  it('types literals, declared or inferred', () => {
    const diagnostics = checkModel(
      variant((m) =>
        Object.assign(bugAct(m, 'habitatWItin'), {
          inputs: [{ literal: 2.5, type: 'integer' }],
        }),
      ),
    );
    expectFound(diagnostics, `${BUG}.habitatWItin.inputs[0].literal`, '2.5 is not an integer.');
  });

  it('works out the result type of an evaluate as the generators do', () => {
    const model = variant((m) => {
      bug(m).attributes = {
        age: { type: 'integer' },
        weight: { type: 'real' },
        name: { type: 'symbol' },
      };
      addBugActs(m, {
        heavier: {
          kind: 'evaluate',
          selected: 'bugRule',
          function: 'add',
          inputs: [{ attribute: 'bug.age' }, { attribute: 'bug.weight' }],
          targets: ['setAge'],
        },
        setAge: {
          kind: 'set',
          selected: 'bugRule',
          attribute: 'bug.age',
          parameter: { evaluate: 'heavier' },
          targets: ['setName'],
        },
        setName: {
          kind: 'set',
          selected: 'bugRule',
          attribute: 'bug.name',
          parameter: { literal: 3 },
        },
      });
      Object.assign(bugAct(m, 'bugRule'), { targets: ['nearbySpace', 'heavier'] });
    });
    const diagnostics = checkModel(model);
    expectFound(
      diagnostics,
      `${BUG}.setAge.parameter`,
      '`bug.age` takes an integer; evaluate `heavier` is a real number.',
    );
    expectFound(
      diagnostics,
      `${BUG}.setName.parameter`,
      '`bug.name` takes a symbol; 3 is an integer.',
    );
  });

  it('requires queries to use logical functions, and spatial terms to be queries', () => {
    const diagnostics = checkModel(
      variant((m) => {
        Object.assign(bugAct(m, 'habitatAvailable'), { function: 'randomUnit' });
        addBugActs(m, {
          near: { kind: 'evaluate', selected: 'bugRule', function: 'neighbor' },
        });
        Object.assign(bugAct(m, 'bugRule'), { targets: ['nearbySpace', 'near'] });
      }),
    );
    expectFound(
      diagnostics,
      `${BUG}.habitatAvailable.function`,
      '`randomUnit` is not a logical function',
    );
    expectFound(diagnostics, `${BUG}.near.function`, '`neighbor` is a spatial query term');
  });

  it('checks states and their options', () => {
    const diagnostics = checkModel(
      variant((m) => {
        bug(m).attributes = {
          status: {
            type: 'state',
            options: { hungry: {}, fed: {} },
            defaultOption: 'full',
          },
          mood: { type: 'state', options: { calm: {} } },
        };
        addBugActs(m, {
          eat: {
            kind: 'set',
            selected: 'bugRule',
            attribute: 'bug.status',
            parameter: { option: 'bug.status.fedd' },
            targets: ['calm'],
          },
          calm: {
            kind: 'set',
            selected: 'bugRule',
            attribute: 'bug.status',
            parameter: { option: 'bug.mood.calm' },
            targets: ['pick'],
          },
          pick: {
            kind: 'evaluate',
            selected: 'bugRule',
            function: 'randomState',
            inputs: [{ attribute: 'bug.status' }],
            targets: ['setPicked'],
          },
          setPicked: {
            kind: 'set',
            selected: 'bugRule',
            attribute: 'bug.status',
            parameter: { evaluate: 'pick' },
          },
        });
        Object.assign(bugAct(m, 'bugRule'), { targets: ['nearbySpace', 'eat'] });
      }),
    );
    expectFound(
      diagnostics,
      'agents.bug.attributes.status.defaultOption',
      '`full` is not an option',
    );
    expectFound(
      diagnostics,
      `${BUG}.eat.parameter.option`,
      '`bug.status` has no option `fedd` (did you mean `fed`?)',
    );
    expectFound(
      diagnostics,
      `${BUG}.calm.parameter`,
      '`bug.status` takes an option of `bug.status`; `bug.mood.calm` is an option of `bug.mood`.',
    );
    expect(diagnostics.filter((d) => d.path.includes('setPicked'))).toEqual([]);
  });

  it('matches multi-values to multiple prototypes', () => {
    const model = variant((m) => {
      bug(m).attributes = {
        status: { type: 'state', options: { young: {}, old: {} } },
        size: { type: 'real' },
        sizeMinimum: { type: 'real' },
        sizeMaximum: { type: 'real' },
      };
      addBugActs(m, {
        drawSize: {
          kind: 'evaluate',
          selected: 'initialize',
          function: 'uniformAdditiveDistribution',
          inputs: [
            { multiValue: ['bug.status'] },
            { multiValue: ['bug.sizeMinimum'] },
            { multiValue: ['bug.sizeMaximum'] },
          ],
          targets: ['setSize'],
        },
        setSize: {
          kind: 'set',
          selected: 'initialize',
          attribute: 'bug.size',
          parameter: { evaluate: 'drawSize' },
        },
      });
      Object.assign(bugAct(m, 'initialize'), { targets: ['randomHabitat', 'drawSize'] });
    });
    expect(checkModel(model)).toEqual([]);

    const broken = clone(model);
    Object.assign(bugAct(broken, 'drawSize'), {
      inputs: [
        { multiValue: ['bug.status'] },
        { attribute: 'bug.sizeMinimum' },
        { multiValue: ['bug.status'] },
      ],
    });
    const diagnostics = checkModel(broken);
    expectFound(
      diagnostics,
      `${BUG}.drawSize.inputs[1]`,
      'Input `minimum` of `uniformAdditiveDistribution` takes a multi-value',
    );
    expectFound(
      diagnostics,
      `${BUG}.drawSize.inputs[2].multiValue[0]`,
      'lists attributes holding a real number; `bug.status` holds an option of `bug.status`.',
    );
  });
});

describe('selections', () => {
  it('warns about a query after a logic act on a selection that picks one agent (R18)', () => {
    const model = variant((m) => {
      addBugActs(m, {
        stillAvailable: {
          kind: 'query',
          selected: 'nearbySpace',
          function: 'available',
          targets: ['movetoBuginGrid2D'],
        },
      });
      Object.assign(bugAct(m, 'nearbySpace_HabitatAvailableAndHabitatWItin_'), {
        targets: ['stillAvailable'],
      });
    });
    const diagnostics = checkModel(model);
    expect(diagnostics).toEqual([
      {
        path: `${BUG}.stillAvailable`,
        severity: 'warning',
        message: expect.stringContaining(
          'filters the one agent selection `nearbySpace` has already chosen',
        ),
      },
    ]);
    expect(() => assertValidModel(model)).not.toThrow();
  });

  it('does not warn when the selection takes all agents', () => {
    const model = variant((m) => {
      addBugActs(m, {
        everyHabitat: {
          kind: 'query',
          selected: 'nearbySpace',
          function: 'all',
          targets: ['nearbySpace_HabitatAvailableAndHabitatWItin_'],
        },
        stillAvailable: {
          kind: 'query',
          selected: 'nearbySpace',
          function: 'available',
          targets: ['movetoBuginGrid2D'],
        },
      });
      Object.assign(bugAct(m, 'nearbySpace'), {
        targets: ['habitatAvailable', 'habitatWItin', 'everyHabitat'],
      });
      Object.assign(bugAct(m, 'nearbySpace_HabitatAvailableAndHabitatWItin_'), {
        targets: ['stillAvailable'],
      });
    });
    expect(checkModel(model)).toEqual([]);
  });

  it('allows at most one of nearest, minimize and maximize', () => {
    const diagnostics = checkModel(
      variant((m) => {
        addBugActs(m, {
          closest: {
            kind: 'query',
            selected: 'nearbySpace',
            function: 'nearest',
            targets: ['nearbySpace_HabitatAvailableAndHabitatWItin_'],
          },
          biggest: {
            kind: 'query',
            selected: 'nearbySpace',
            function: 'maximize',
            inputs: [{ attribute: 'bugVision' }],
            targets: ['nearbySpace_HabitatAvailableAndHabitatWItin_'],
          },
        });
        Object.assign(bugAct(m, 'nearbySpace'), {
          targets: ['habitatAvailable', 'habitatWItin', 'closest', 'biggest'],
        });
      }),
    );
    expectFound(diagnostics, `${BUG}.biggest`, 'already has the cardinality term `nearest`');
  });

  it('requires spatial query terms to have a space to look in', () => {
    const diagnostics = checkModel(
      variant((m) => Object.assign(bugAct(m, 'nearbySpace'), { space: undefined })),
    );
    expectFound(
      diagnostics,
      `${BUG}.habitatAvailable.function`,
      '`available` looks in a space, but selection `nearbySpace` names none.',
    );
    expectFound(diagnostics, `${BUG}.habitatWItin.function`, '`within` looks in a space');
  });
});

describe('attributes and spaces', () => {
  it('checks defaults and ranges', () => {
    const diagnostics = checkModel(
      variant((m) => {
        m.attributes!.bugCount = { type: 'integer', default: 2.5 };
        m.attributes!.bugVision = { type: 'integer', default: 4, min: 5, max: 3 };
        m.attributes!.name = { type: 'symbol', min: 0 };
      }),
    );
    expectFound(
      diagnostics,
      'attributes.bugCount.default',
      'The default must be an integer; found 2.5.',
    );
    expectFound(diagnostics, 'attributes.bugVision.max', '`max` (3) is less than `min` (5).');
    expectFound(
      diagnostics,
      'attributes.bugVision.default',
      'The default (4) is less than `min` (5).',
    );
    expectFound(
      diagnostics,
      'attributes.name.min',
      'Only integer and real attributes have a `min`.',
    );
  });

  it('requires dimensions to name size attributes of the space', () => {
    const diagnostics = checkModel(
      variant((m) => {
        const grid = m.spaces!.grid2D!;
        if (grid.kind !== 'grid') throw new Error('not a grid');
        grid.dimensions = ['width', 'depth'];
        grid.attributes!.width = { type: 'real' };
      }),
    );
    expectFound(
      diagnostics,
      'spaces.grid2D.dimensions[0]',
      'The size `width` must be an integer; it is a real number.',
    );
    expectFound(
      diagnostics,
      'spaces.grid2D.dimensions[1]',
      '`depth` is not an attribute of this space.',
    );
  });
});

describe('not supported yet', () => {
  it('warns about geography, value layers, shaped and loaded agents, and extensions', () => {
    const diagnostics = checkModel(
      variant((m) => {
        m.spaces!.world = { kind: 'geography' };
        m.valueLayers = { rainfall: {} };
        m.extensions = [{ kind: 'systemDynamics' }];
        Object.assign(m.acts!.createBugs!, { shape: 'point' });
        m.acts!.loadHabitats = {
          kind: 'load',
          selected: 'buildStupidModel1',
          agent: 'habitat',
          sourceURL: 'habitats.csv',
        };
        m.acts!.buildWorld = {
          kind: 'buildGeography',
          selected: 'buildStupidModel1',
          space: 'world',
        };
        Object.assign(m.acts!.buildStupidModel1!, {
          targets: ['createBugs', 'createHabitats', 'fillGrid', 'loadHabitats', 'buildWorld'],
        });
      }),
    );
    expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    expect(diagnostics.map((d) => [d.path, d.message])).toEqual(
      expect.arrayContaining([
        ['spaces.world', 'Geography spaces are not supported yet.'],
        ['valueLayers.rainfall', 'Value layers are not supported yet.'],
        ['extensions[0]', 'Extensions (here `systemDynamics`) are not supported yet.'],
        ['acts.createBugs.shape', 'Shaped agents are not supported yet.'],
        ['acts.loadHabitats', 'Loading agents is not supported yet.'],
        ['acts.buildWorld', 'Building geographies is not supported yet.'],
      ]),
    );
  });
});
