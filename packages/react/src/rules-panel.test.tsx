// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import {
  Agent,
  defineModel,
  readScapeSettings,
  Runner,
  Scape,
  SettingsStore,
  type Model,
  type Simulation,
} from '@metascape/engine';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RulesPanel } from './rules-panel';
import { demoModel } from './testing/demo-model';

afterEach(cleanup);

class Cat extends Agent {
  log = '';
}

const twoRules = defineModel({
  name: 'Cats',
  parameters: {},
  build(sim) {
    const cats = sim.addScape(
      new Scape<Cat>({ name: 'cats', size: 2, create: () => new Cat(), order: 'sequential' }),
    );
    cats.addRule('meow', (c) => (c.log += 'm'));
    cats.addRule('nap', (c) => (c.log += 'a'));
    cats.addRule('meow', (c) => (c.log += 'M'));
  },
});

function rig(model: Model = twoRules) {
  const store = new SettingsStore();
  const runner = new Runner(model, { seed: 1, onSimulation: (sim) => store.attach(sim) });
  const view = () => <RulesPanel sim={runner.sim as Simulation} store={store} />;
  render(view());
  return { store, runner };
}

const catLog = (runner: Runner): string => (runner.sim.scape('cats').members[0] as Cat).log;

describe('RulesPanel', () => {
  it('lists rules in order with checkboxes, and hides the scape picker for one scape', () => {
    rig();
    expect(screen.queryByLabelText('Scape')).toBeNull();
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent?.replace(/[↑↓]/g, ''))).toEqual([
      'meow',
      'nap',
      'meow',
    ]);
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(
      true,
    );
    expect(screen.getAllByRole('button', { name: 'Move meow up (execute before)' })).toHaveLength(
      2,
    );
  });

  it('turns a rule off, live and for the next restart', () => {
    const { runner, store } = rig();
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    runner.step();
    expect(catLog(runner)).toBe('mM');
    runner.restart();
    expect(readScapeSettings(runner.sim.scape('cats')).rules[1]!.enabled).toBe(false);
    expect(store.customized).toBe(true);
  });

  it('moves rules with the buttons, telling same-named rules apart', () => {
    const { runner } = rig();
    const rows = screen.getAllByRole('listitem');
    // Move the second "meow" (third row) up above "nap".
    fireEvent.click(within(rows[2]!).getByRole('button', { name: /up/ }));
    runner.step();
    expect(catLog(runner)).toBe('mMa');
    const after = screen.getAllByRole('listitem');
    expect(within(after[0]!).getByRole('button', { name: /up/ })).toHaveProperty('disabled', true);
    expect(within(after[2]!).getByRole('button', { name: /down/ })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('keeps keyboard focus on the move button after a move', () => {
    rig();
    const down = within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: /down/ });
    down.focus();
    fireEvent.click(down);
    const moved = within(screen.getAllByRole('listitem')[1]!).getByRole('button', { name: /down/ });
    expect(document.activeElement).toBe(moved);
  });

  it('changes execution order, visit order, style and agents per step', () => {
    const { runner } = rig();
    const scape = () => runner.sim.scape('cats');
    fireEvent.click(screen.getByLabelText('By rule'));
    expect(scape().schedule).toBe('byRule');
    fireEvent.click(screen.getByLabelText('Shuffled'));
    expect(scape().order).toBe('shuffled');
    fireEvent.click(screen.getByLabelText('Repeated draw'));
    expect(scape().sampling).toBe('draw');

    const count = screen.getByLabelText('Number of agents per step') as HTMLInputElement;
    expect(count.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Only'));
    expect(scape().activations).toBe(2);
    fireEvent.change(count, { target: { value: '1' } });
    expect(scape().activations).toBe(1);
    fireEvent.change(count, { target: { value: '0' } });
    expect(scape().activations).toBe(1);
    fireEvent.click(screen.getByLabelText('All'));
    expect(scape().activations).toBeUndefined();
  });

  it('resets to the model defaults', () => {
    const { runner } = rig();
    const reset = screen.getByRole('button', { name: 'Reset to model defaults' });
    expect(reset).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByLabelText('By rule'));
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(reset).toHaveProperty('disabled', false);
    fireEvent.click(reset);
    const scape = runner.sim.scape('cats');
    expect(scape.schedule).toBe('byAgent');
    expect(scape.rules.every((r) => r.enabled)).toBe(true);
    expect(reset).toHaveProperty('disabled', true);
    expect((screen.getByLabelText('By agent') as HTMLInputElement).checked).toBe(true);
  });

  it('shows a scape picker when several scapes have rules, skipping rule-less ones', () => {
    rig(demoModel as unknown as Model);
    const picker = screen.getByLabelText('Scape') as HTMLSelectElement;
    // The demo's grid has only an initial rule, so it is not offered.
    expect([...picker.options].map((o) => o.value)).toEqual(['walkers', 'space']);
    expect(screen.getByText('wander')).toBeTruthy();
    fireEvent.change(picker, { target: { value: 'space' } });
    expect(screen.getByText('drift')).toBeTruthy();
  });

  it('says so when there is nothing to edit', () => {
    const empty = defineModel({ name: 'Empty', parameters: {}, build() {} });
    rig(empty);
    expect(screen.getByText(/no rules to edit/)).toBeTruthy();
  });
});
