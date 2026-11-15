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
  type RootScape,
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
  build(root) {
    const cats = root.add(
      new Scape<Cat>({ name: 'cats', size: 2, prototypeAgent: () => new Cat() }),
    );
    const inOrder = { randomExecution: false };
    cats.addRule('meow', (c) => (c.log += 'm'), inOrder);
    cats.addRule('nap', (c) => (c.log += 'a'), inOrder);
    cats.addRule('meow', (c) => (c.log += 'M'), inOrder);
  },
});

function rig(model: Model = twoRules) {
  const store = new SettingsStore();
  const runner = new Runner(model, { seed: 1, onRoot: (root) => store.attach(root) });
  const view = () => <RulesPanel root={runner.root as RootScape} store={store} />;
  render(view());
  return { store, runner };
}

const catLog = (runner: Runner): string => (runner.root.findScape('cats').members[0] as Cat).log;

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
    expect(readScapeSettings(runner.root.findScape('cats')).rules[1]!.enabled).toBe(false);
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

  it('changes execution order, style and agents per iteration', () => {
    const { runner } = rig();
    const scape = () => runner.root.findScape('cats');
    fireEvent.click(screen.getByLabelText('By rule'));
    expect(scape().executionOrder).toBe('byRule');
    // There is no visit order to set: whether agents are shuffled is a property of each rule.
    expect(screen.queryByLabelText('Shuffled')).toBeNull();
    fireEvent.click(screen.getByLabelText('Repeated draw'));
    expect(scape().executionStyle).toBe('repeatedDraw');

    const count = screen.getByLabelText('Number of agents per iteration') as HTMLInputElement;
    expect(count.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Only'));
    expect(scape().agentsPerIteration).toBe(2);
    fireEvent.change(count, { target: { value: '1' } });
    expect(scape().agentsPerIteration).toBe(1);
    fireEvent.change(count, { target: { value: '0' } });
    expect(scape().agentsPerIteration).toBe(1);
    fireEvent.click(screen.getByLabelText('All'));
    expect(scape().agentsPerIteration).toBeUndefined();
  });

  it('resets to the model defaults', () => {
    const { runner } = rig();
    const reset = screen.getByRole('button', { name: 'Reset to model defaults' });
    expect(reset).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByLabelText('By rule'));
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(reset).toHaveProperty('disabled', false);
    fireEvent.click(reset);
    const scape = runner.root.findScape('cats');
    expect(scape.executionOrder).toBe('byAgent');
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
