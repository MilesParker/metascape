// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import {
  Agent,
  defineModel,
  ManualScheduler,
  readScapeSettings,
  Runner,
  Scape,
  SettingsStore,
  Singleton,
  type RootScape,
} from '@metascape/engine';
import { useRulesController } from '@metascape/react';
import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RulesPanel } from './RulesPanel';

afterEach(cleanup);

const model = defineModel({
  name: 'stopping',
  parameters: {},
  build(root) {
    const agents = root.add(
      new Scape({ name: 'agents', size: 2, prototypeAgent: () => new Agent() }),
    );
    agents.addRule('Move', () => {});
    agents.addRule('Eat', () => {});
    root.add(new Scape({ name: 'Stop period', space: new Singleton() })).addRule('Stop', () => {});
  },
});

function panel() {
  const runner = new Runner(model, { scheduler: new ManualScheduler(), seed: 1 });
  const root = runner.root as unknown as RootScape;
  const store = new SettingsStore();
  store.attach(root);
  const { result } = renderHook(() => useRulesController(root, store, 0));
  render(<RulesPanel controller={result.current} />);
  return { root, result };
}

describe('RulesPanel', () => {
  it('lists the rules of the model as a whole under the model, not as a scape of agents', () => {
    panel();
    expect(screen.getByRole('region', { name: 'Rules of agents' })).toBeTruthy();
    const model = screen.getByRole('region', { name: 'Rules of the model' });
    expect(within(model).getByText('Stop')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Rules of Stop period' })).toBeNull();
    // Nothing to execute across: no execution settings, and no count of members.
    expect(within(model).queryByRole('button', { expanded: false })).toBeNull();
    expect(within(model).queryByText(/cell|agent/)).toBeNull();
  });

  it('still switches them off', () => {
    const { root } = panel();
    const model = screen.getByRole('region', { name: 'Rules of the model' });
    fireEvent.click(within(model).getByRole('switch', { name: 'Stop on' }));
    expect(readScapeSettings(root.findScape('Stop period')).rules[0]!.enabled).toBe(false);
  });
});
