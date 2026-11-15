// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import {
  defineModel,
  int,
  readScapeSettings,
  real,
  Runner,
  Scape,
  SettingsStore,
  Singleton,
  Agent,
  ManualScheduler,
  type RootScape,
} from '@metascape/engine';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  describeExecution,
  groupParameters,
  isModelScape,
  rangePairs,
  useParameterController,
  useRulesController,
} from './controllers';

const model = defineModel({
  name: 'controlled',
  parameters: {
    rate: real(1, { min: 0, max: 5, live: true, group: 'Flow' }),
    size: int(3, { min: 1, max: 9 }),
    minAge: int(1, { min: 0, max: 10 }),
    maxAge: int(5, { min: 0, max: 10 }),
    valueMinimum: real(0),
    valueMaximum: real(1),
  },
  build(root) {
    const scape = root.add(
      new Scape({ name: 'things', size: 2, prototypeAgent: () => new Agent() }),
    );
    scape.addRule('first', () => {});
    scape.addRule('second', () => {});
  },
});

describe('parameter helpers', () => {
  it('pairs minimum and maximum parameters', () => {
    expect(rangePairs(model.parameters)).toEqual([
      { low: 'minAge', high: 'maxAge', quantity: 'Age' },
      { low: 'valueMinimum', high: 'valueMaximum', quantity: 'value' },
    ]);
  });

  it('groups parameters, ungrouped first', () => {
    expect(groupParameters(model.parameters).map((g) => g.group)).toEqual([undefined, 'Flow']);
  });

  it('says how a scape runs in words', () => {
    const words = describeExecution(
      {
        rules: [],
        executionOrder: 'byRule',
        agentsPerIteration: 4,
        executionStyle: 'repeatedDraw',
      },
      10,
    );
    expect(words.who).toMatch(/4 random draws/);
    expect(words.order).toMatch(/random order/);
    expect(words.schedule).toMatch(/each rule runs for every agent/);
  });
});

describe('useParameterController', () => {
  it('changes live parameters at once and collects the others for one restart', () => {
    const runner = new Runner(model, { scheduler: new ManualScheduler(), seed: 1 });
    const { result } = renderHook(() => useParameterController(model, runner));
    act(() => void result.current.set('rate', 2));
    expect(runner.root.parameters.rate).toBe(2);
    expect(result.current.pending).toEqual([]);
    expect(result.current.changed).toEqual(['rate']);
    act(() => void result.current.set('size', 7));
    expect(runner.root.parameters.size).toBe(3);
    expect(result.current.pending).toEqual(['size']);
    act(() => void result.current.set('size', 99));
    expect(result.current.errors['size']).toMatch(/at most 9/);
    act(() => void result.current.apply());
    expect(runner.root.parameters.size).toBe(7);
    expect(runner.root.parameters.rate).toBe(2);
    expect(result.current.pending).toEqual([]);
    act(() => result.current.resetAll());
    expect(runner.root.parameters.rate).toBe(1);
    expect(result.current.pending).toEqual(['size']);
  });
});

describe('useRulesController', () => {
  it('toggles and moves rules in the running model and keeps them in the store', () => {
    const runner = new Runner(model, { scheduler: new ManualScheduler(), seed: 1 });
    const store = new SettingsStore();
    store.attach(runner.root as unknown as RootScape);
    const changes: string[] = [];
    const { result } = renderHook(() =>
      useRulesController(runner.root as unknown as RootScape, store, 0, (scape) =>
        changes.push(scape),
      ),
    );
    act(() => result.current.toggle('things', 0, false));
    act(() => result.current.move('things', 1, 0));
    const settings = readScapeSettings(runner.root.findScape('things'));
    expect(settings.rules.map((r) => `${r.name}:${r.enabled}`)).toEqual([
      'second:true',
      'first:false',
    ]);
    expect(changes).toEqual(['things', 'things']);
    expect(result.current.customized).toBe(true);
    act(() => result.current.reset());
    expect(readScapeSettings(runner.root.findScape('things')).rules[0]!.name).toBe('first');
  });
});

describe('isModelScape', () => {
  it("is true only for scapes with a singleton space, whose rules are the model's own", () => {
    const whole = defineModel({
      name: 'whole',
      parameters: {},
      build(root) {
        root.add(new Scape({ name: 'things', size: 2, prototypeAgent: () => new Agent() }));
        root.add(new Scape({ name: 'stopping', space: new Singleton() })).addRule('stop', () => {});
      },
    });
    const runner = new Runner(whole, { scheduler: new ManualScheduler(), seed: 1 });
    expect(runner.root.scapes.map((scape) => [scape.name, isModelScape(scape)])).toEqual([
      ['things', false],
      ['stopping', true],
    ]);
  });
});
