// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import {
  Agent,
  applyScapeSettings,
  applySimulationSettings,
  defineModel,
  int,
  ManualClock,
  ManualScheduler,
  readScapeSettings,
  readSimulationSettings,
  Runner,
  Scape,
  SettingsStore,
  type Simulation,
} from './index';

class Counter extends Agent {
  log: string[] = [];
}

/** Two rules named `tick` and one named `other`, on a scape of two agents; plus a second, rule-less scape. */
const model = defineModel({
  name: 'settings',
  parameters: { n: int(2) },
  build(sim) {
    const scape = sim.addScape(
      new Scape<Counter>({
        name: 'main',
        size: sim.parameters.n,
        create: () => new Counter(),
        order: 'sequential',
      }),
    );
    scape
      .addRule('tick', (a) => a.log.push('a'))
      .addRule('other', (a) => a.log.push('b'))
      .addRule('tick', (a) => a.log.push('c'));
    sim.addScape(new Scape({ name: 'empty' }));
  },
});

const main = (sim: Simulation): Scape<Counter> => sim.scape('main') as Scape<Counter>;
const logOf = (sim: Simulation, i = 0): string => (main(sim).members[i] as Counter).log.join('');
function newSim(): Simulation {
  const runner = new Runner(model, { seed: 1 });
  return runner.sim;
}

describe('readScapeSettings / applyScapeSettings', () => {
  it('reads rules with occurrence indexes and the execution options', () => {
    const settings = readScapeSettings(main(newSim()));
    expect(settings.rules).toEqual([
      { name: 'tick', occurrence: 0, enabled: true },
      { name: 'other', occurrence: 0, enabled: true },
      { name: 'tick', occurrence: 1, enabled: true },
    ]);
    expect(settings).toMatchObject({
      schedule: 'byAgent',
      order: 'sequential',
      activations: null,
      sampling: 'tour',
    });
  });

  it('survives a JSON round trip', () => {
    const settings = readScapeSettings(main(newSim()));
    expect(JSON.parse(JSON.stringify(settings))).toEqual(settings);
  });

  it('reorders and disables rules, telling same-named rules apart', () => {
    const sim = newSim();
    const scape = main(sim);
    const base = readScapeSettings(scape);
    applyScapeSettings(scape, {
      ...base,
      rules: [
        { name: 'tick', occurrence: 1, enabled: true },
        { name: 'tick', occurrence: 0, enabled: false },
        { name: 'other', occurrence: 0, enabled: true },
      ],
    });
    sim.step();
    expect(logOf(sim)).toBe('cb');
    expect(
      readScapeSettings(scape).rules.map((r) => `${r.name}${r.occurrence}${r.enabled}`),
    ).toEqual(['tick1true', 'tick0false', 'other0true']);
  });

  it('keeps rules the settings do not mention, after the named ones, and ignores unknown ones', () => {
    const sim = newSim();
    const scape = main(sim);
    applyScapeSettings(scape, {
      ...readScapeSettings(scape),
      rules: [
        { name: 'ghost', occurrence: 0, enabled: false },
        { name: 'other', occurrence: 0, enabled: true },
      ],
    });
    sim.step();
    expect(logOf(sim)).toBe('bac');
  });

  it('changes how agents and rules interleave', () => {
    const byAgent = newSim();
    byAgent.step();
    expect(logOf(byAgent, 0)).toBe('abc');

    const sim = newSim();
    const order: string[] = [];
    // By rule, the first rule runs for both agents before the second rule starts.
    const scape = main(sim);
    applyScapeSettings(scape, { ...readScapeSettings(scape), schedule: 'byRule' });
    scape.rules.splice(0, scape.rules.length);
    scape.addRule('first', (a) => order.push(`first:${scape.members.indexOf(a)}`));
    scape.addRule('second', (a) => order.push(`second:${scape.members.indexOf(a)}`));
    sim.step();
    expect(order).toEqual(['first:0', 'first:1', 'second:0', 'second:1']);
  });

  it('sets activations and sampling, and draws as many times as there are members by default', () => {
    const sim = newSim();
    const scape = main(sim);
    applyScapeSettings(scape, { ...readScapeSettings(scape), activations: 1 });
    sim.step();
    expect(logOf(sim, 0).length + logOf(sim, 1).length).toBe(3);

    applyScapeSettings(scape, {
      ...readScapeSettings(scape),
      activations: null,
      sampling: 'draw',
    });
    expect(scape.activations).toBeUndefined();
    for (const member of scape.members) (member as Counter).log.length = 0;
    sim.step();
    // Two draws with replacement, three rules each.
    expect(logOf(sim, 0).length + logOf(sim, 1).length).toBe(6);
  });

  it('rejects invalid values and changes nothing', () => {
    const scape = main(newSim());
    const base = readScapeSettings(scape);
    const attempt =
      (patch: object): (() => void) =>
      () =>
        applyScapeSettings(scape, { ...base, rules: [], ...patch } as never);
    expect(attempt({ activations: 0 })).toThrow(RangeError);
    expect(attempt({ activations: 1.5 })).toThrow(RangeError);
    expect(attempt({ schedule: 'sideways' })).toThrow(RangeError);
    expect(attempt({ order: 'random' })).toThrow(RangeError);
    expect(attempt({ sampling: 'sip' })).toThrow(RangeError);
    expect(readScapeSettings(scape)).toEqual(base);
  });

  it('is safe to apply while a step is running', () => {
    const sim = newSim();
    const scape = main(sim);
    const seen: string[] = [];
    scape.rules.splice(0, scape.rules.length);
    scape.addRule('first', () => {
      seen.push('first');
      applyScapeSettings(scape, {
        ...readScapeSettings(scape),
        rules: [{ name: 'second', occurrence: 0, enabled: false }],
      });
    });
    scape.addRule('second', () => seen.push('second'));
    sim.step();
    // The step finishes with the rules it began with; the change shows from the next one.
    expect(seen.filter((s) => s === 'second').length).toBe(2);
    seen.length = 0;
    sim.step();
    expect(seen).toEqual(['first', 'first']);
  });
});

describe('simulation settings', () => {
  it('reads every scape and applies by scape name, ignoring unknown scapes', () => {
    const sim = newSim();
    const all = readSimulationSettings(sim);
    expect(Object.keys(all)).toEqual(['main', 'empty']);
    applySimulationSettings(sim, {
      ...all,
      main: { ...all.main!, schedule: 'byRule' },
      nowhere: all.main!,
    });
    expect(main(sim).schedule).toBe('byRule');
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
      onSimulation: (sim) => store.attach(sim),
    });
    return { store, runner };
  }

  it('calls onSimulation for the first simulation and every restart', () => {
    const seen: Simulation[] = [];
    const runner = new Runner(model, { seed: 1, onSimulation: (sim) => seen.push(sim) });
    expect(seen).toEqual([runner.sim]);
    runner.restart();
    runner.restart({ parameters: { n: 3 } });
    expect(seen).toHaveLength(3);
    expect(seen[2]).toBe(runner.sim);
  });

  it('leaves the runner untouched when the hook throws on restart', () => {
    let fail = false;
    const runner = new Runner(model, {
      seed: 1,
      onSimulation: () => {
        if (fail) throw new Error('nope');
      },
    });
    const before = runner.sim;
    fail = true;
    expect(() => runner.restart()).toThrow('nope');
    expect(runner.sim).toBe(before);
  });

  it('keeps chosen settings across restarts until reset', () => {
    const { store, runner } = rig();
    expect(store.customized).toBe(false);
    const base = readScapeSettings(main(runner.sim));
    store.set(runner.sim, 'main', {
      ...base,
      schedule: 'byRule',
      rules: [
        { name: 'other', occurrence: 0, enabled: false },
        { name: 'tick', occurrence: 1, enabled: true },
        { name: 'tick', occurrence: 0, enabled: true },
      ],
    });
    expect(store.customized).toBe(true);

    runner.restart();
    runner.restart({ parameters: { n: 4 } });
    const scape = main(runner.sim);
    expect(scape.size).toBe(4);
    expect(scape.schedule).toBe('byRule');
    expect(
      readScapeSettings(scape).rules.map((r) => `${r.name}${r.occurrence}${r.enabled}`),
    ).toEqual(['other0false', 'tick1true', 'tick0true']);
    runner.step();
    expect(logOf(runner.sim)).toBe('ca');
  });

  it('resets to the defaults the model built, for this and later runs', () => {
    const { store, runner } = rig();
    const defaults = readSimulationSettings(runner.sim);
    store.set(runner.sim, 'main', {
      ...defaults.main!,
      order: 'shuffled',
      activations: 1,
      rules: [{ name: 'other', occurrence: 0, enabled: false }],
    });
    expect(store.defaultsOf(runner.sim)).toEqual(defaults);
    store.reset(runner.sim);
    expect(readSimulationSettings(runner.sim)).toEqual(defaults);
    expect(store.customized).toBe(false);
    runner.restart();
    expect(readSimulationSettings(runner.sim)).toEqual(defaults);
  });

  it('does not remember settings that are rejected', () => {
    const { store, runner } = rig();
    const base = readScapeSettings(main(runner.sim));
    expect(() => store.set(runner.sim, 'main', { ...base, activations: -1 })).toThrow(RangeError);
    expect(store.customized).toBe(false);
  });
});
