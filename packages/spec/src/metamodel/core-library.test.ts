// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { checkLibrary } from './check';
import { coreLibrary } from './core-library';
import type { Library, LibraryFunction } from './types';

function allFunctions(library: Library): Map<string, LibraryFunction> {
  const found = new Map<string, LibraryFunction>();
  const visit = (lib: Library) => {
    for (const [id, fn] of Object.entries(lib.functions ?? {})) found.set(id, fn);
    for (const sub of Object.values(lib.subs ?? {})) visit(sub);
  };
  visit(library);
  return found;
}

const functions = allFunctions(coreLibrary);

describe('the core library', () => {
  it('checks clean: valid structure, unique IDs, optional inputs last', () => {
    expect(checkLibrary(coreLibrary)).toEqual([]);
  });

  it('reports duplicate function IDs across sub-libraries', () => {
    const library: Library = {
      subs: {
        operators: { functions: { pow: { kind: 'operator', symbol: '^' } } },
        math: { functions: { pow: { kind: 'genericFunction' } } },
      },
    };
    expect(checkLibrary(library)).toEqual([
      {
        path: 'subs.math.functions.pow',
        severity: 'error',
        message: expect.stringContaining('already used at subs.operators.functions.pow'),
      },
    ]);
  });

  it('has every function the AMP examples use', () => {
    const used = [
      'identical',
      'available',
      'add',
      'neighbor',
      'lesser',
      'graphicFill',
      'randomUnit',
      'randomInRange',
      'shapeOval',
      'different',
      'sub',
      'timeNow',
      'colorBlue',
      'colorRed',
      'colorGreen',
      'shapeRectangle',
      'colorBlack',
      'uniformAdditiveDistribution',
      'within',
      'increment',
      'colorYellow',
      'colorOrange',
      'colorRGB',
      'div',
      'greater',
      'identity',
      'not',
      'colorGray',
      'mul',
      'min',
      'randomToLimit',
      'randomIs',
      'all',
      'graphicOutline',
      'here',
      'includeSelf',
      'greaterorEqual',
      'toward',
      'nearest',
      'maximize',
      'minimize',
      'randomState',
      'abs',
      'lesserorEqual',
    ];
    expect(used.filter((id) => !functions.has(id))).toEqual([]);
  });

  it('leaves out the array functions and boundary2D (R3, R11)', () => {
    for (const id of [
      'item',
      'length',
      'randomMember',
      'randomWeighted',
      'withinBoundaries',
      'boundary2D',
    ]) {
      expect(functions.has(id), id).toBe(false);
    }
  });

  it('keeps the sub-libraries of the original', () => {
    expect(Object.keys(coreLibrary.subs ?? {})).toEqual([
      'operators',
      'spatial',
      'random',
      'graphic',
      'time',
      'math',
      'distribution',
    ]);
    expect(Object.keys(coreLibrary.subs?.operators?.subs ?? {})).toEqual([
      'logicalOperators',
      'numericOperators',
    ]);
  });

  it('types prototypes', () => {
    expect(functions.get('within')).toMatchObject({
      kind: 'genericLogical',
      inputs: { distance: { type: 'numeric', label: 'Distance' } },
    });
    expect(functions.get('randomUnit')).toMatchObject({
      kind: 'genericFunction',
      output: { type: 'real' },
    });
    expect(functions.get('add')).toMatchObject({ kind: 'operator', symbol: '+' });
    expect(functions.get('uniformAdditiveDistribution')?.inputs?.states).toMatchObject({
      type: 'generic',
      multiple: true,
    });
  });

  it('gives `not` a boolean input and `randomState` the type of its state', () => {
    expect(functions.get('not')?.inputs?.arg0?.type).toBe('boolean');
    const randomState = functions.get('randomState');
    expect(randomState?.kind === 'genericFunction' && randomState.output?.type).toBe('generic');
  });

  it('declares no output for logical functions and operators', () => {
    for (const [id, fn] of functions) {
      if (fn.kind !== 'genericFunction') expect('output' in fn, id).toBe(false);
    }
  });
});
