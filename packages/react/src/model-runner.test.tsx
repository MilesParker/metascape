// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelRunner } from './model-runner';
import { demoModel } from './testing/demo-model';

afterEach(cleanup);

describe('ModelRunner', () => {
  it('shows controls, views and parameters, and applies changed parameters on restart', () => {
    render(
      <StrictMode>
        <ModelRunner model={demoModel} options={{ seed: 5 }} />
      </StrictMode>,
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Grid' })).toBeTruthy();
    expect(screen.getByText(/Click an agent/)).toBeTruthy();

    const apply = screen.getByRole('button', { name: 'Apply and restart' });
    expect(apply).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Walkers'), { target: { value: '9' } });
    expect(apply).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    expect(screen.getByTestId('ms-tick').textContent).toBe('1');
    fireEvent.click(apply);
    expect(screen.getByTestId('ms-tick').textContent).toBe('0');
    expect(screen.getByRole('button', { name: 'Apply and restart' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('img', { name: /^Latest: Count walkers 9/ })).toBeTruthy();
  });
});
