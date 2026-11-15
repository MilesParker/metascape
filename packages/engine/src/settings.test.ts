// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import {
  Agent,
  applyScapeSettings,
  applyModelSettings,
  defineModel,
  int,
  ManualClock,
  ManualScheduler,
  readScapeSettings,
  readModelSettings,
  Runner,
  Scape,
  SettingsStore,
  type RootScape,
} from './index';

class Counter extends Agent {
  log: string[] = [];
}

/** For rules that visit their agents in order of joining. */
const inOrder = { randomExecution: false } as const;

/** Two rules named `tick` and one named `other`, on a scape of two agents; plus a second, rule-less scape. */
const model = defineModel({
  name: 'settings',
  parameters: { n: int(2) },
  build(root) {
    const scape = root.add(
      new Scape<Counter>({
        name: 'main',
        size: root.parameters.n,
        prototypeAgent: () => new Counter(),
      }),
    );
    scape
      .addRule('tick', (a) => a.log.push('a'), inOrder)
      .addRule('other', (a) => a.log.push('b'), inOrder)
      .addRule('tick', (a) => a.log.push('c'), inOrder);
    root.add(new Scape({ name: 'empty' }));
  },
});

const main = (root: RootScape): Scape<Counter> => root.findScape('main') as Scape<Counter>;
const logOf = (root: RootScape, i = 0): string => (main(root).members[i] as Counter).log.join('');
function newRoot(): RootScape {
  const runner = new Runner(model, { seed: 1 });
  return runner.root;
}

describe('readScapeSettings / applyScapeSettings', () => {
  it('reads rules with occurrence indexes and the execution options', () => {
    const settings = readScapeSettings(main(newRoot()));
    expect(settings.rules).toEqual([
      { name: 'tick', occurrence: 0, enabled: true },
      { name: 'other', occurrence: 0, enabled: true },
      { name: 'tick', occurrence: 1, enabled: true },
    ]);
    expect(settings).toMatchObject({
      executionOrder: 'byAgent',
      agentsPerIteration: null,
      executionStyle: 'completeTour',
    });
  });

  it('survives a JSON round trip', () => {
    const settings = readScapeSettings(main(newRoot()));
    expect(JSON.parse(JSON.stringify(settings))).toEqual(settings);
  });

  it('reorders and disables rules, telling same-named rules apart', () => {
    const root = newRoot();
    const scape = main(root);
    const base = readScapeSettings(scape);
    applyScapeSettings(scape, {
      ...base,
      rules: [
        { name: 'tick', occurrence: 1, enabled: true },
        { name: 'tick', occurrence: 0, enabled: false },
        { name: 'other', occurrence: 0, enabled: true },
      ],
    });
    root.iterate();
    expect(logOf(root)).toBe('cb');
    expect(
      readScapeSettings(scape).rules.map((r) => `${r.name}${r.occurrence}${r.enabled}`),
    ).toEqual(['tick1true', 'tick0false', 'other0true']);
  });

  it('keeps rules the settings do not mention, after the named ones, and ignores unknown ones', () => {
    const root = newRoot();
    const scape = main(root);
    applyScapeSettings(scape, {
      ...readScapeSettings(scape),
      rules: [
        { name: 'ghost', occurrence: 0, enabled: false },
        { name: 'other', occurrence: 0, enabled: true },
      ],
    });
    root.iterate();
    expect(logOf(root)).toBe('bac');
  });

  it('changes how agents and rules interleave', () => {
    const byAgent = newRoot();
    byAgent.iterate();
    expect(logOf(byAgent, 0)).toBe('abc');

    const root = newRoot();
    const order: string[] = [];
    // By rule, the first rule runs for both agents before the second rule starts.
    const scape = main(root);
    applyScapeSettings(scape, { ...readScapeSettings(scape), executionOrder: 'byRule' });
    scape.rules.splice(0, scape.rules.length);
    scape.addRule('first', (a) => order.push(`first:${scape.members.indexOf(a)}`), inOrder);
    scape.addRule('second', (a) => order.push(`second:${scape.members.indexOf(a)}`), inOrder);
    root.iterate();
    expect(order).toEqual(['first:0', 'first:1', 'second:0', 'second:1']);
  });

  it('sets agents per iteration and execution style, and draws as many times as there are members by default', () => {
    const root = newRoot();
    const scape = main(root);
    applyScapeSettings(scape, { ...readScapeSettings(scape), agentsPerIteration: 1 });
    root.iterate();
    expect(logOf(root, 0).length + logOf(root, 1).length).toBe(3);

    applyScapeSettings(scape, {
      ...readScapeSettings(scape),
      agentsPerIteration: null,
      executionStyle: 'repeatedDraw',
    });
    expect(scape.agentsPerIteration).toBeUndefined();
    for (const member of scape.members) (member as Counter).log.length = 0;
    root.iterate();
    // Two draws with replacement, three rules each.
    expect(logOf(root, 0).length + logOf(root, 1).length).toBe(6);
  });

  it('rejects invalid values and changes nothing', () => {
    const scape = main(newRoot());
    const base = readScapeSettings(scape);
    const attempt =
      (patch: object): (() => void) =>
      () =>
        applyScapeSettings(scape, { ...base, rules: [], ...patch } as never);
    expect(attempt({ agentsPerIteration: 0 })).toThrow(RangeError);
    expect(attempt({ agentsPerIteration: 1.5 })).toThrow(RangeError);
    expect(attempt({ executionOrder: 'sideways' })).toThrow(RangeError);
    expect(attempt({ executionStyle: 'sip' })).toThrow(RangeError);
    expect(attempt({ agentsPerIteration: -1 })).toThrow(RangeError);
    expect(readScapeSettings(scape)).toEqual(base);
  });

  it('is safe to apply while an iteration is running', () => {
    const root = newRoot();
    const scape = main(root);
    const seen: string[] = [];
    scape.rules.splice(0, scape.rules.length);
    scape.addRule(
      'first',
      () => {
        seen.push('first');
        applyScapeSettings(scape, {
          ...readScapeSettings(scape),
          rules: [{ name: 'second', occurrence: 0, enabled: false }],
        });
      },
      inOrder,
    );
    scape.addRule('second', () => seen.push('second'), inOrder);
    root.iterate();
    // The iteration finishes with the rules it began with; the change shows from the next one.
    expect(seen.filter((s) => s === 'second').length).toBe(2);
    seen.length = 0;
    root.iterate();
    expect(seen).toEqual(['first', 'first']);
  });
});

describe('model settings', () => {
  it('reads every scape and applies by scape name, ignoring unknown scapes', () => {
    const root = newRoot();
    const all = readModelSettings(root);
    expect(Object.keys(all)).toEqual(['main', 'empty']);
    applyModelSettings(root, {
      ...all,
      main: { ...all.main!, executionOrder: 'byRule' },
      nowhere: all.main!,
    });
    expect(main(root).executionOrder).toBe('byRule');
  });
});

describe('SettingsStore with a Runner', () => {
  function rig() {
    const store = new SettingsStore();
    const clock = new ManualClock();
    const runner = new Runner(model, {
      seed: 1,
      clock,
      scheduler: new ManualScheduler(clock),
      onRoot: (root) => store.attach(root),
    });
    return { store, runner };
  }

  it('calls onRoot for the first root and every restart', () => {
    const seen: RootScape[] = [];
    const runner = new Runner(model, { seed: 1, onRoot: (root) => seen.push(root) });
    expect(seen).toEqual([runner.root]);
    runner.restart();
    runner.restart({ parameters: { n: 3 } });
    expect(seen).toHaveLength(3);
    expect(seen[2]).toBe(runner.root);
  });

  it('leaves the runner untouched when the hook throws on restart', () => {
    let fail = false;
    const runner = new Runner(model, {
      seed: 1,
      onRoot: () => {
        if (fail) throw new Error('nope');
      },
    });
    const before = runner.root;
    fail = true;
    expect(() => runner.restart()).toThrow('nope');
    expect(runner.root).toBe(before);
  });

  it('keeps chosen settings across restarts until reset', () => {
    const { store, runner } = rig();
    expect(store.customized).toBe(false);
    const base = readScapeSettings(main(runner.root));
    store.set(runner.root, 'main', {
      ...base,
      executionOrder: 'byRule',
      rules: [
        { name: 'other', occurrence: 0, enabled: false },
        { name: 'tick', occurrence: 1, enabled: true },
        { name: 'tick', occurrence: 0, enabled: true },
      ],
    });
    expect(store.customized).toBe(true);

    runner.restart();
    runner.restart({ parameters: { n: 4 } });
    const scape = main(runner.root);
    expect(scape.size).toBe(4);
    expect(scape.executionOrder).toBe('byRule');
    expect(
      readScapeSettings(scape).rules.map((r) => `${r.name}${r.occurrence}${r.enabled}`),
    ).toEqual(['other0false', 'tick1true', 'tick0true']);
    runner.step();
    expect(logOf(runner.root)).toBe('ca');
  });

  it('resets to the defaults the model built, for this and later runs', () => {
    const { store, runner } = rig();
    const defaults = readModelSettings(runner.root);
    store.set(runner.root, 'main', {
      ...defaults.main!,
      agentsPerIteration: 1,
      rules: [{ name: 'other', occurrence: 0, enabled: false }],
    });
    expect(store.defaultsOf(runner.root)).toEqual(defaults);
    store.reset(runner.root);
    expect(readModelSettings(runner.root)).toEqual(defaults);
    expect(store.customized).toBe(false);
    runner.restart();
    expect(readModelSettings(runner.root)).toEqual(defaults);
  });

  it('does not remember settings that are rejected', () => {
    const { store, runner } = rig();
    const base = readScapeSettings(main(runner.root));
    expect(() => store.set(runner.root, 'main', { ...base, agentsPerIteration: -1 })).toThrow(
      RangeError,
    );
    expect(store.customized).toBe(false);
  });
});
