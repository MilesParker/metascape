// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { checkModel } from './check';
import { compileModel } from './interpreter';
import { ModelFormatError } from './schema';
import { isOverlay, resolveModel } from './resolve';
import type { InterpScape } from './runtime';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/*
 * Overlays and agent-type extension: model files that build on others, resolved at load into
 * one flat model that the checker and the runtime see as any other.
 */

/** A model with two counters: a base for overlays. */
const base = {
  schemaVersion: 2,
  id: 'base',
  label: 'Base',
  description: 'The base model.',
  language: 'typescript',
  attributes: { rate: { type: 'integer', default: 1, min: 0, max: 9 } },
  acts: {
    build: { kind: 'build', targets: ['createCounters'] },
    createCounters: {
      kind: 'create',
      selected: 'build',
      agent: 'counter',
      agentCount: { literal: 3 },
    },
  },
  agents: {
    counter: {
      kind: 'agent',
      label: 'Counter',
      attributes: { count: { type: 'integer' }, spare: { type: 'integer' } },
      acts: {
        tick: { kind: 'rule', targets: ['add'] },
        add: {
          kind: 'set',
          selected: 'tick',
          attribute: 'counter.count',
          parameter: { literal: 1 },
        },
        clear: { kind: 'rule', targets: ['zero'] },
        zero: {
          kind: 'set',
          selected: 'clear',
          attribute: 'counter.spare',
          parameter: { literal: 0 },
        },
      },
    },
  },
};

/** The problems an attempt to resolve reports, as `file: path: message`. */
function problemsOf(source: unknown, bases: unknown[] = []): string[] {
  try {
    resolveModel(source, { bases });
  } catch (error) {
    if (error instanceof ModelFormatError) {
      return error.diagnostics.map((d) => `${d.file}: ${d.path}: ${d.message}`);
    }
    throw error;
  }
  throw new Error('Expected the model not to resolve');
}

describe('a model with nothing to resolve', () => {
  it('is only parsed, and the file is not changed', () => {
    const before = clone(base);
    const model = resolveModel(base);
    expect(model).toEqual(base);
    expect(base).toEqual(before);
    expect(isOverlay(base)).toBe(false);
  });

  it('is not parsed by `parseModel` when it is an overlay, which says what to do', () => {
    expect(() => resolveModel({ ...base, extends: 'x' }, { bases: [] })).toThrow(/no model `x`/);
  });
});

describe('overlays', () => {
  const overlay = {
    id: 'bigger',
    extends: 'base',
    label: 'Bigger',
    description: 'Counts by three.',
    replace: {
      'agents.counter.acts.add.parameter': { literal: 3 },
      'agents.counter.acts.tick.targets': ['add', 'twice'],
      'attributes.rate.default': 2,
    },
    add: {
      'agents.counter.attributes.double': { type: 'integer' },
      'agents.counter.acts.twice': {
        kind: 'set',
        selected: 'tick',
        attribute: 'counter.double',
        parameter: { literal: 2 },
      },
    },
    remove: ['agents.counter.acts.clear', 'agents.counter.acts.zero'],
  };

  it('applies what is added, replaced and removed, by path, to a copy of the base', () => {
    const before = clone(base);
    const model = resolveModel(overlay, { bases: [base] });
    expect(isOverlay(overlay)).toBe(true);
    expect(base).toEqual(before);
    expect(model.id).toBe('bigger');
    expect(model.label).toBe('Bigger');
    expect(model.description).toBe('Counts by three.');
    expect(model.attributes!['rate']).toMatchObject({ default: 2, max: 9 });
    const counter = model.agents!['counter']!;
    expect(counter.kind === 'agent' && Object.keys(counter.attributes!)).toEqual([
      'count',
      'spare',
      'double',
    ]);
    expect(Object.keys(counter.acts!)).toEqual(['tick', 'add', 'twice']);
    expect(counter.acts!['add']).toMatchObject({ parameter: { literal: 3 } });
    expect(checkModel(model).filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('keeps the place of what it replaces, and puts what it adds last', () => {
    const model = resolveModel(
      {
        id: 'again',
        extends: 'base',
        replace: { 'agents.counter.acts.tick': { kind: 'rule', targets: [] } },
        add: { 'agents.counter.acts.late': { kind: 'rule', targets: [] } },
      },
      { bases: [base] },
    );
    expect(Object.keys(model.agents!['counter']!.acts!)).toEqual([
      'tick',
      'add',
      'clear',
      'zero',
      'late',
    ]);
  });

  it('inherits the base label and description when it gives none', () => {
    const model = resolveModel({ id: 'plain', extends: 'base' }, { bases: [base] });
    expect(model.id).toBe('plain');
    expect(model.label).toBe('Base');
  });

  it('chains: a base may itself be an overlay', () => {
    const third = {
      id: 'third',
      extends: 'bigger',
      remove: ['agents.counter.acts.twice', 'agents.counter.attributes.double'],
    };
    const model = resolveModel(third, { bases: [base, overlay, third] });
    const counter = model.agents!['counter']!;
    expect(Object.keys(counter.acts!)).toEqual(['tick', 'add']);
    expect(counter.acts!['add']).toMatchObject({ parameter: { literal: 3 } });
    expect(model.label).toBe('Bigger');
  });

  it('removes first, so that a path can be removed and added again', () => {
    const model = resolveModel(
      {
        id: 'moved',
        extends: 'base',
        remove: ['agents.counter.acts.tick'],
        add: { 'agents.counter.acts.tick': { kind: 'rule', targets: ['add'] } },
      },
      { bases: [base] },
    );
    expect(Object.keys(model.agents!['counter']!.acts!)).toEqual(['add', 'clear', 'zero', 'tick']);
  });

  describe('reports against the overlay file, with the path', () => {
    it('a base that is missing', () => {
      expect(problemsOf({ id: 'a', extends: 'nope' }, [base])).toEqual([
        'a: extends: There is no model `nope` to extend; the models given are `base`',
      ]);
      expect(problemsOf({ id: 'a', extends: 'nope' })).toEqual([
        'a: extends: There is no model `nope` to extend (no base models were given)',
      ]);
    });

    it('a cycle, however long', () => {
      const a = { id: 'a', extends: 'b' };
      const b = { id: 'b', extends: 'c' };
      const c = { id: 'c', extends: 'a' };
      expect(problemsOf(a, [a, b, c])).toEqual([
        'c: extends: Models extend each other in a cycle: a → b → c → a',
      ]);
      const self = { id: 's', extends: 's' };
      expect(problemsOf(self, [self])).toEqual([
        's: extends: Models extend each other in a cycle: s → s',
      ]);
    });

    it('a path that is not there, is already there, or has no parent', () => {
      expect(
        problemsOf(
          {
            id: 'o',
            extends: 'base',
            replace: {
              'agents.counter.acts.nope': { kind: 'rule' },
              'agents.nope.acts.tick': { kind: 'rule' },
            },
            add: { 'agents.counter.acts.tick': { kind: 'rule' } },
            remove: ['agents.counter.attributes.nope'],
          },
          [base],
        ),
      ).toEqual([
        'o: remove[0]: There is nothing at `agents.counter.attributes.nope` to remove',
        'o: replace["agents.counter.acts.nope"]: There is nothing at `agents.counter.acts.nope` to replace; to put something there, use `add`',
        'o: replace["agents.nope.acts.tick"]: There is nothing at `agents.nope.acts` to hold `tick`',
        'o: add["agents.counter.acts.tick"]: There is already something at `agents.counter.acts.tick`; to change it, use `replace`',
      ]);
    });

    it('a malformed path, an overlay field addressed as an element, and a null', () => {
      expect(
        problemsOf(
          {
            id: 'o',
            extends: 'base',
            replace: { id: 'x', 'agents..counter': 1, 'attributes.rate': null },
          },
          [base],
        ),
      ).toEqual([
        'o: replace["id"]: `id` is one of the overlay\'s own fields, not an element of the base',
        'o: replace["agents..counter"]: `agents..counter` is not a path: IDs separated by dots, such as agents.sugarCell.acts.growBack',
        'o: replace["attributes.rate"]: A value is needed; to take `attributes.rate` away, use `remove`',
      ]);
    });

    it('a model written into the overlay rather than added by path', () => {
      expect(problemsOf({ id: 'o', extends: 'base', agents: {} }, [base])).toEqual([
        'o: agents: An overlay holds its own `id`, `label`, `pluralLabel` and `description`, the base it `extends`, and `add`, `replace` and `remove`; put `agents` under `add` or `replace`, by its path',
      ]);
    });

    it('an error in a base is reported against the base', () => {
      const broken = { id: 'broken', extends: 'nope' };
      expect(problemsOf({ id: 'top', extends: 'broken' }, [broken])).toEqual([
        'broken: extends: There is no model `nope` to extend; the models given are `broken`',
      ]);
    });

    it('is listed in the message of the error', () => {
      expect(() => resolveModel({ id: 'a', extends: 'nope' })).toThrow(
        /a: extends: There is no model `nope`/,
      );
    });
  });

  it('leaves the flat model to the checker, which finds what the merge broke', () => {
    const model = resolveModel(
      {
        id: 'broken',
        extends: 'base',
        replace: { 'agents.counter.acts.add.attribute': 'counter.missing' },
      },
      { bases: [base] },
    );
    expect(checkModel(model).filter((d) => d.severity === 'error')).not.toEqual([]);
  });
});

describe('agent types that extend others', () => {
  /** Two kinds of walker sharing an abstract `walker`. */
  const family = {
    ...base,
    id: 'family',
    agents: {
      walker: {
        kind: 'agent',
        abstract: true,
        label: 'Walker',
        description: 'Not instantiated.',
        attributes: {
          steps: { type: 'integer' },
          mood: { type: 'state', options: { calm: {}, cross: {} } },
        },
        acts: {
          walk: { kind: 'rule', targets: ['stepOn'] },
          stepOn: {
            kind: 'set',
            selected: 'walk',
            attribute: 'walker.steps',
            parameter: { literal: 1 },
          },
          grumble: { kind: 'rule', targets: ['isCalm'] },
          isCalm: {
            kind: 'query',
            selected: 'grumble',
            function: 'equal',
            inputs: [{ attribute: 'walker.mood' }, { option: 'walker.mood.calm' }],
            targets: ['getCross'],
          },
          getCross: {
            kind: 'set',
            selected: 'grumble',
            attribute: 'walker.mood',
            parameter: { option: 'walker.mood.cross' },
          },
        },
        styles: {
          dot: {
            kind: '2d',
            acts: { look: { kind: 'rule', targets: [] } },
          },
        },
        execution: { randomOrder: false },
      },
      hiker: {
        kind: 'agent',
        extends: 'walker',
        label: 'Hiker',
        attributes: { miles: { type: 'integer' } },
        acts: {
          walk: { kind: 'rule', targets: ['stepOn', 'addMile'] },
          addMile: {
            kind: 'set',
            selected: 'walk',
            attribute: 'hiker.miles',
            parameter: { literal: 1 },
          },
        },
        execution: { rules: ['grumble', 'walk'] },
      },
      stroller: { kind: 'agent', extends: 'walker', label: 'Stroller' },
    },
    acts: {
      build: { kind: 'build', targets: ['makeHikers', 'makeStrollers'] },
      makeHikers: {
        kind: 'create',
        selected: 'build',
        agent: 'hiker',
        agentCount: { literal: 2 },
      },
      makeStrollers: {
        kind: 'create',
        selected: 'build',
        agent: 'stroller',
        agentCount: { literal: 2 },
      },
    },
  };

  it('is made flat: the parent’s attributes, acts and styles, then the child’s, and no parent', () => {
    const model = resolveModel(family);
    expect(Object.keys(model.agents!)).toEqual(['hiker', 'stroller']);
    const hiker = model.agents!['hiker']!;
    expect(hiker).not.toHaveProperty('extends');
    expect(Object.keys(hiker.attributes!)).toEqual(['steps', 'mood', 'miles']);
    expect(Object.keys(hiker.acts!)).toEqual([
      'walk',
      'stepOn',
      'grumble',
      'isCalm',
      'getCross',
      'addMile',
    ]);
    expect(Object.keys(hiker.styles!)).toEqual(['dot']);
    expect(hiker.execution).toEqual({ randomOrder: false, rules: ['grumble', 'walk'] });
    expect(checkModel(model).filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('lets a child replace an inherited act by ID, in its place', () => {
    const hiker = resolveModel(family).agents!['hiker']!;
    expect(hiker.acts!['walk']).toMatchObject({ targets: ['stepOn', 'addMile'] });
    const stroller = resolveModel(family).agents!['stroller']!;
    expect(stroller.acts!['walk']).toMatchObject({ targets: ['stepOn'] });
  });

  it('gives each child the parent’s attributes and options as its own', () => {
    const model = resolveModel(family);
    for (const type of ['hiker', 'stroller']) {
      const acts = model.agents![type]!.acts as Record<string, unknown>;
      expect(acts['stepOn']).toMatchObject({ attribute: `${type}.steps` });
      expect(acts['isCalm']).toMatchObject({
        inputs: [{ attribute: `${type}.mood` }, { option: `${type}.mood.calm` }],
      });
      expect(acts['getCross']).toMatchObject({ parameter: { option: `${type}.mood.cross` } });
    }
  });

  it('takes nothing of the parent’s label or description, and the child’s own execution on top', () => {
    const model = resolveModel(family);
    expect(model.agents!['stroller']).toMatchObject({ label: 'Stroller' });
    expect(model.agents!['stroller']!.description).toBeUndefined();
    expect(model.agents!['stroller']!.execution).toEqual({ randomOrder: false });
  });

  it('chains through a parent that itself extends, and keeps a parent that is not abstract', () => {
    const chain = {
      ...family,
      agents: {
        ...family.agents,
        walker: { ...family.agents.walker, abstract: false },
        runner: {
          kind: 'agent',
          extends: 'hiker',
          acts: { walk: { kind: 'rule', targets: [] } },
        },
      },
      acts: { build: { kind: 'build', targets: [] } },
    };
    const model = resolveModel(chain);
    expect(Object.keys(model.agents!)).toEqual(['walker', 'hiker', 'stroller', 'runner']);
    const runner = model.agents!['runner']!;
    expect(Object.keys(runner.attributes!)).toEqual(['steps', 'mood', 'miles']);
    expect((runner.acts as Record<string, unknown>)['addMile']).toMatchObject({
      attribute: 'runner.miles',
    });
    expect(model.agents!['walker']).not.toHaveProperty('abstract');
  });

  it('does not find subtypes: a selection of a type finds that type alone', () => {
    // After resolution the types are unrelated, so a rule that selects every `walker` counts the
    // walkers, never the hikers that began as walkers.
    const counting = {
      ...family,
      attributes: { total: { type: 'integer', gatherData: true } },
      agents: {
        ...family.agents,
        walker: { ...family.agents.walker, abstract: false },
      },
      acts: {
        ...family.acts,
        makeWalkers: {
          kind: 'create',
          selected: 'build',
          agent: 'walker',
          agentCount: { literal: 4 },
        },
        build: { kind: 'build', targets: ['makeHikers', 'makeStrollers', 'makeWalkers'] },
        tally: { kind: 'rule', targets: ['everyWalker'] },
        everyWalker: { kind: 'select', selected: 'tally', agent: 'walker', targets: ['each'] },
        each: { kind: 'query', selected: 'everyWalker', function: 'all', targets: ['plusOne'] },
        plusOne: {
          kind: 'evaluate',
          selected: 'everyWalker',
          function: 'add',
          inputs: [{ attribute: 'total', selected: 'tally' }, { literal: 1 }],
          targets: ['setTotal'],
        },
        setTotal: {
          kind: 'set',
          selected: 'tally',
          attribute: 'total',
          parameter: { evaluate: 'plusOne' },
        },
      },
    };
    const model = resolveModel(counting);
    expect(Object.keys(model.agents!)).toContain('walker');
    const root = new RootScape(compileModel(model), { seed: 1 });
    root.run(1);
    expect(root.data.latest('walker.count')).toBe(4);
    expect(root.data.latest('hiker.count')).toBe(2);
    const top = root.scapes.find((scape) => scape.name === 'family') as unknown as InterpScape;
    expect(top.state.read(top, top.info.attribute.get('total')!)).toBe(4);
  });

  it('lets a parent have only acts, or only attributes', () => {
    const model = resolveModel({
      ...base,
      acts: { build: { kind: 'build', targets: [] } },
      agents: {
        ...base.agents,
        onlyActs: { kind: 'agent', abstract: true, acts: { go: { kind: 'rule', targets: [] } } },
        child: { kind: 'agent', extends: 'onlyActs', attributes: { n: { type: 'integer' } } },
        onlyAttributes: { kind: 'agent', abstract: true, attributes: { m: { type: 'integer' } } },
        other: { kind: 'agent', extends: 'onlyAttributes' },
      },
    });
    expect(Object.keys(model.agents!['child']!.acts!)).toEqual(['go']);
    expect(model.agents!['other']!.attributes).toEqual({ m: { type: 'integer' } });
    expect(model.agents!['other']!.acts).toBeUndefined();
  });

  it('works inside a scape, and for a parent in another scape', () => {
    const nested = {
      ...base,
      id: 'nested',
      acts: { build: { kind: 'build', targets: [] } },
      agents: {
        region: {
          kind: 'scape',
          agents: {
            parent: {
              kind: 'agent',
              abstract: true,
              attributes: { n: { type: 'integer' } },
              acts: {
                bump: {
                  kind: 'rule',
                  targets: ['add'],
                },
                add: {
                  kind: 'set',
                  selected: 'bump',
                  attribute: 'region.parent.n',
                  parameter: { literal: 1 },
                },
              },
            },
            child: { kind: 'agent', extends: 'region.parent' },
          },
        },
        other: { kind: 'agent', extends: 'region.parent' },
      },
    };
    const model = resolveModel(nested);
    const region = model.agents!['region']!;
    expect(region.kind === 'scape' && Object.keys(region.agents!)).toEqual(['child']);
    expect(model.agents!['other']!.acts!['add']).toMatchObject({ attribute: 'other.n' });
    expect(
      region.kind === 'scape' && (region.agents!['child']!.acts as Record<string, unknown>)['add'],
    ).toMatchObject({ attribute: 'region.child.n' });
  });

  describe('reports errors against the file', () => {
    it('a parent that is not there, a scape, a cycle, and a scape that extends', () => {
      const bad = (agents: Record<string, unknown>) =>
        problemsOf({ ...base, id: 'bad', agents: { ...base.agents, ...agents } });
      expect(bad({ x: { kind: 'agent', extends: 'nobody' } })).toEqual([
        'bad: agents.x.extends: There is no agent type `nobody` to extend',
      ]);
      expect(bad({ x: { kind: 'agent', extends: 'zone' }, zone: { kind: 'scape' } })).toEqual([
        'bad: agents.x.extends: `zone` is a scape; only an agent type can be extended',
      ]);
      expect(
        bad({
          x: { kind: 'agent', extends: 'y' },
          y: { kind: 'agent', extends: 'z' },
          z: { kind: 'agent', extends: 'x' },
        }),
      ).toEqual(['bad: agents.z.extends: Agent types extend each other in a cycle: x → y → z → x']);
      expect(bad({ x: { kind: 'scape', extends: 'counter' } })).toEqual([
        'bad: agents.x.extends: Only an agent type extends another; a scape does not',
      ]);
      expect(bad({ x: { kind: 'agent', extends: 'x' } })).toEqual([
        'bad: agents.x.extends: Agent types extend each other in a cycle: x → x',
      ]);
    });

    it('is the model the overlays made that is searched, so an overlay can replace what is inherited', () => {
      const model = resolveModel(
        {
          id: 'later',
          extends: 'family',
          replace: { 'agents.walker.acts.walk': { kind: 'rule', targets: [] } },
          remove: ['agents.hiker.acts.walk', 'agents.hiker.acts.addMile', 'agents.hiker.execution'],
        },
        { bases: [family] },
      );
      // Hiker had its own walk; with it removed it inherits the parent's replaced one.
      expect(model.agents!['hiker']!.acts!['walk']).toMatchObject({ targets: [] });
      expect(model.agents!['stroller']!.acts!['walk']).toMatchObject({ targets: [] });
    });
  });
});
