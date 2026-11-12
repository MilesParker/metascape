// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { slug } from './slug';

describe('slug', () => {
  it('lower-cases and joins words with single dashes', () => {
    expect(slug('Epidemic (SIR) on a small-world network')).toBe(
      'epidemic-sir-on-a-small-world-network',
    );
  });

  it('leaves no leading or trailing dashes', () => {
    expect(slug('Epidemic: SIR on a small-world network!')).toBe(
      'epidemic-sir-on-a-small-world-network',
    );
    expect(slug('  --Boids--  ')).toBe('boids');
  });
});
