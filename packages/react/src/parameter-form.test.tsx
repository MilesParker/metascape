// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { bool, choice, int, real, text } from '@metascape/engine';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParameterForm } from './parameter-form';

afterEach(cleanup);

const schema = {
  count: int(5, { min: 1, max: 10, label: 'Count', description: 'How many agents.' }),
  rate: real(0.5),
  fast: bool(false, { label: 'Fast mode' }),
  mode: choice(['a', 'b'], 'a', { label: 'Mode' }),
  note: text('hi', { label: 'Note' }),
};
const values = { count: 5, rate: 0.5, fast: false, mode: 'a', note: 'hi' };

describe('ParameterForm', () => {
  it('renders an input of the right type for each parameter, labelled', () => {
    render(<ParameterForm schema={schema} values={values} onChange={() => {}} />);
    expect(screen.getByLabelText('Count')).toHaveProperty('type', 'number');
    expect(screen.getByLabelText('Count slider')).toHaveProperty('type', 'range');
    expect(screen.getByLabelText('rate')).toHaveProperty('type', 'number');
    expect(screen.queryByLabelText('rate slider')).toBeNull();
    expect(screen.getByLabelText('Fast mode')).toHaveProperty('type', 'checkbox');
    expect(screen.getByLabelText('Mode').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Note')).toHaveProperty('type', 'text');
    expect(screen.getByText('How many agents.')).toBeTruthy();
  });

  it('reports changes with the right types', () => {
    const onChange = vi.fn();
    render(<ParameterForm schema={schema} values={values} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith('count', 7);
    fireEvent.change(screen.getByLabelText('Count slider'), { target: { value: '9' } });
    expect(onChange).toHaveBeenLastCalledWith('count', 9);
    fireEvent.change(screen.getByLabelText('rate'), { target: { value: '0.25' } });
    expect(onChange).toHaveBeenLastCalledWith('rate', 0.25);
    fireEvent.click(screen.getByLabelText('Fast mode'));
    expect(onChange).toHaveBeenLastCalledWith('fast', true);
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenLastCalledWith('mode', 'b');
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'yo' } });
    expect(onChange).toHaveBeenLastCalledWith('note', 'yo');
    expect(onChange).toHaveBeenCalledTimes(6);
  });

  it('shows the engine message for invalid input and does not call onChange', () => {
    const onChange = vi.fn();
    render(<ParameterForm schema={schema} values={values} onChange={onChange} />);
    const count = screen.getByLabelText('Count');
    fireEvent.change(count, { target: { value: '50' } });
    expect(screen.getByRole('alert').textContent).toMatch(/at most 10/);
    expect(count.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(count, { target: { value: '2.5' } });
    expect(screen.getByRole('alert').textContent).toMatch(/integer/);
    fireEvent.change(count, { target: { value: '' } });
    expect(screen.getByRole('alert').textContent).toMatch(/number/);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(count, { target: { value: '3' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange).toHaveBeenCalledWith('count', 3);
  });

  it('says so when there are no parameters', () => {
    render(<ParameterForm schema={{}} values={{}} onChange={() => {}} />);
    expect(screen.getByText(/no parameters/)).toBeTruthy();
  });
});
