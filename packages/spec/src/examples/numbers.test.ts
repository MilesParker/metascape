// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { compileModel } from '../compile';
import { exampleSpecs } from './index';

/*
 * The numbers each example gives, pinned. A change to the format or the
 * interpreter that changes how a model runs shows up here. The digests are
 * of every period's data, as CSV.
 */

/** A 64-bit FNV-1a digest of a text, in hex. */
function digest(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}
const pinned: Record<string, Record<number, { period: number; stopped: boolean; data: string }>> = {
  life: {
    1: { period: 200, stopped: false, data: 'f3d44881e19ffe2e' },
    2: { period: 200, stopped: false, data: 'a872b7639c51d662' },
  },
  schelling: {
    1: { period: 12, stopped: true, data: 'b83e3fb91441bda0' },
    2: { period: 11, stopped: true, data: '463077ff8726db66' },
  },
  epidemic: {
    1: { period: 49, stopped: true, data: '8ab3974142be3597' },
    2: { period: 45, stopped: true, data: '8a6364ad910d4917' },
  },
  forager: {
    1: { period: 200, stopped: false, data: 'cd549a90082830c5' },
    2: { period: 200, stopped: false, data: '9bf905e862958dce' },
  },
  pursuit: {
    1: { period: 200, stopped: false, data: '2baf9ab01ae39e77' },
    2: { period: 200, stopped: false, data: '7f3b38737e933584' },
  },
};

function run(spec: (typeof exampleSpecs)[keyof typeof exampleSpecs], seed: number) {
  const root = new RootScape(compileModel(spec), { seed });
  root.run(200);
  return {
    period: root.period,
    stopped: root.stopped,
    data: digest(root.data.toCSV()),
  };
}

describe.each(Object.entries(exampleSpecs))('example %s', (name, spec) => {
  it.each([1, 2])('gives the pinned numbers with seed %i', (seed) => {
    const result = run(spec, seed);
    expect(result).toEqual(pinned[name]?.[seed]);
  });
});
