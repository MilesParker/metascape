// SPDX-License-Identifier: EPL-2.0
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exampleMethods } from '../../examples/escape/methods';
import { checkModel } from '../metamodel/check';
import { stupidModel1 } from '../metamodel/examples/stupid-model-1';
import { parseModel } from '../metamodel/schema';
import { renderTranslation } from './render';
import { translateMetaabm, type TranslationDiagnostic } from './translate';

const examples = new URL('../../examples/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, examples), 'utf8');
const escape = readdirSync(new URL('escape/', examples))
  .filter((name) => name.endsWith('.metaabm'))
  .map((name) => name.slice(0, -'.metaabm'.length))
  .sort();

/** The diagnostics worth a look: everything but the notes that say what was dropped or defaulted by design. */
const loud = (diagnostics: TranslationDiagnostic[]) =>
  diagnostics.filter((d) => d.severity !== 'note').map((d) => `${d.severity} ${d.kind} ${d.path}`);

/** What translating an Escape example is expected to report besides notes. */
const EXPECTED_WARNINGS: Record<string, string[]> = {
  // The disconnect act's destination is a different act from its selection; only move has one.
  Markets: [
    "warning dropped //@agents[ID='trader']/@rootActivity/@members[ID='disconnect']/@destination",
  ],
};

describe('the Escape examples', () => {
  it('are the twelve there are', () => {
    expect(escape).toEqual([
      'DemographicPrisoner_sDilemma',
      'Epidemic',
      'EpidemicContact',
      'EpidemicPlague',
      'EpidemicRegional',
      'Heatbugs',
      'Markets',
      'StupidModel1',
      'StupidModel2',
      'StupidModel3',
      'StupidModel5',
      'WikiExample',
    ]);
  });

  describe.each(escape)('%s', (name) => {
    const methods = exampleMethods[name] ?? {};
    const translation = translateMetaabm(read(`escape/${name}.metaabm`), { methods });

    it('translates with only the expected diagnostics', () => {
      expect(translation.model).toBeDefined();
      expect(loud(translation.diagnostics)).toEqual(EXPECTED_WARNINGS[name] ?? []);
    });

    it('fits the format and passes the checker with nothing to say', () => {
      const model = parseModel(JSON.parse(JSON.stringify(translation.model)));
      expect(checkModel(model)).toEqual([]);
    });

    it('is the translated example that is committed beside it', () => {
      const rendered = renderTranslation(read(`escape/${name}.metaabm`), { methods });
      expect(read(`escape/${name}.model.json`)).toBe(rendered.model);
      expect(read(`escape/${name}.diagnostics.json`)).toBe(rendered.diagnostics);
    });
  });

  it('keep every act of the models', () => {
    const count = (text: string) => (text.match(/<members /g) ?? []).length;
    const acts = (model: unknown): number => {
      let n = 0;
      const visit = (value: unknown) => {
        if (value && typeof value === 'object') {
          // An agent's or style's acts, and the members of each group.
          const { acts, members } = value as {
            acts?: Record<string, unknown>;
            members?: Record<string, unknown>;
          };
          if (acts) n += Object.keys(acts).length;
          if (members) n += Object.keys(members).length;
          Object.values(value).forEach(visit);
        }
      };
      visit(model);
      return n;
    };
    for (const name of escape) {
      const text = read(`escape/${name}.metaabm`);
      expect(acts(translateMetaabm(text).model), name).toBe(count(text));
    }
  });

  it('keep the text of labels, plural labels and descriptions as they are', () => {
    const model = translateMetaabm(read('escape/StupidModel1.metaabm')).model!;
    expect(model.agents?.['bug']?.acts?.['bugRule']).toMatchObject({
      label: 'Bug Rule',
      pluralLabel: 'Bug Rules',
      description:
        "Move to a neighboring space. (In this version we also have to manually notify the bug's broker. :( )",
    });
    expect(model.attributes?.['habitatCount']?.description).toBe(
      'The number of habitats to create.',
    );
  });
});

describe('StupidModel1', () => {
  it('is the hand-written example, exactly', () => {
    const { model } = translateMetaabm(read('escape/StupidModel1.metaabm'));
    expect(model).toEqual(stupidModel1);
  });
});

describe('Markets', () => {
  it("names the selection of a set's parameter that its own selection's agent lacks (D7)", () => {
    const { model, diagnostics } = translateMetaabm(read('escape/Markets.metaabm'));
    expect(model?.agents?.['firm']?.acts?.['setOfferPriceToLastPrice']).toMatchObject({
      selected: 'createInstrument',
      parameter: { attribute: 'firm.lastPrice', selected: 'offerShares' },
    });
    expect(
      diagnostics.filter((d) => d.kind === 'defaulted' && d.path.endsWith('@parameter')),
    ).toEqual([
      expect.objectContaining({
        path: "//@agents[ID='firm']/@rootActivity/@members[ID='setOfferPriceToLastPrice']/@parameter",
        severity: 'note',
      }),
    ]);
  });
});

describe('StupidModel5', () => {
  it('keeps the Java of ConsumeFood as a comment when no implementation is provided', () => {
    const { model, diagnostics } = translateMetaabm(read('escape/StupidModel5.metaabm'));
    const method = model?.agents?.['bug']?.acts?.['consumeFood'];
    expect(method).toMatchObject({ kind: 'method', label: 'ConsumeFood', selected: 'grow' });
    const body = method && 'body' in method ? method.body : undefined;
    expect(body).toContain('Port it to TypeScript by hand');
    expect(body).toContain('// Habitat habitat = (Habitat) getHostCell();');
    expect(body?.split('\n').every((line) => line.startsWith('//'))).toBe(true);
    expect(diagnostics.filter((d) => d.kind === 'unsupported')).toHaveLength(1);
  });

  it('marks ConsumeFood as provided, with no body, when its implementation is given', () => {
    const { model, diagnostics } = translateMetaabm(read('escape/StupidModel5.metaabm'), {
      methods: exampleMethods['StupidModel5']!,
    });
    const method = model?.agents?.['bug']?.acts?.['consumeFood'];
    expect(method).toEqual({
      kind: 'method',
      label: 'ConsumeFood',
      pluralLabel: 'ConsumeFoods',
      selected: 'grow',
      provided: true,
    });
    expect(diagnostics.filter((d) => d.kind === 'ported')).toEqual([
      expect.objectContaining({
        path: "//@agents[ID='bug']/@rootActivity/@members[ID='consumeFood']/@body",
        severity: 'note',
      }),
    ]);
  });

  it('reports an implementation that matches no method', () => {
    const { diagnostics } = translateMetaabm(read('escape/StupidModel5.metaabm'), {
      methods: { bug: { grow: () => {} } },
    });
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([
      expect.objectContaining({ kind: 'invalid', message: expect.stringContaining('`grow`') }),
    ]);
  });
});

describe('the AMF test models', () => {
  const translate = (name: string) => translateMetaabm(read(`tests/${name}.metaabm`));
  const errors = (name: string) =>
    checkModel(translate(name).model!)
      .filter((d) => d.severity === 'error')
      .map((d) => d.path);

  it('TestBasics translates and checks without errors', () => {
    expect(translate('TestBasics').diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(errors('TestBasics')).toEqual([]);
  });

  it('TestBasics types its untyped booleans from how they are used', () => {
    const { model, diagnostics } = translate('TestBasics');
    expect(model?.attributes?.['someFlag']).toMatchObject({ type: 'boolean', default: true });
    expect(model?.agents?.['operationsAgent']).toMatchObject({
      attributes: { boolean1: { type: 'boolean' } },
    });
    expect(
      diagnostics.filter((d) => d.message.startsWith('No type is given. It is boolean')),
    ).not.toHaveLength(0);
  });

  it('TestBasics has sixteen Java methods, each reported', () => {
    const java = translate('TestBasics').diagnostics.filter(
      (d) => d.kind === 'unsupported' && d.path.endsWith('/@body'),
    );
    expect(java).toHaveLength(16);
  });

  it('TestMovement translates, moving the acts of one flow to its agent, and has one bad read', () => {
    const { model, diagnostics } = translate('TestMovement');
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    // It reads a network agent's attribute from a selection of moving agents,
    // with no network agent selected upstream (D7).
    expect(errors('TestMovement')).toEqual([
      'agents.basicMovementAgent.acts.identityMovingTowardGoalTwice.inputs[0].attribute',
    ]);
    expect(diagnostics.filter((d) => d.kind === 'moved')).toHaveLength(9);
    expect(model?.agents?.['basicMovementAgent']?.acts?.['goalinArea2']).toBeDefined();
    expect(model?.agents?.['networkAgent']?.acts?.['goalinArea2']).toBeUndefined();
  });

  it('TestSpatial translates except for its arrays, which the format does not have', () => {
    const { diagnostics } = translate('TestSpatial');
    expect(diagnostics.filter((d) => d.severity === 'error').map((d) => d.kind)).toEqual([
      'unsupported',
      'unsupported',
      'unsupported',
      'unsupported',
    ]);
    expect(
      diagnostics.filter((d) => d.kind === 'unsupported' && d.severity === 'warning'),
    ).toHaveLength(2);
    // The queries using the arrays name withinBoundaries, which is left out of the library with
    // arrays; and two sets read an evaluate that is not upstream of them, as the original has them.
    expect(errors('TestSpatial')).toEqual([
      'agents.complexMovementAgent.acts.testParallelRootWithin2DBoundary_WithinSpace_Query.function',
      'agents.complexMovementAgent.acts.testParallelRootWithin2DBoundary_WithinSpace_QueryCopy.function',
      'agents.complexMovementAgent.acts.setResultToTestParallelRootResultAddUnitCopy.parameter.evaluate',
      'agents.complexMovementAgent.acts.setResultToTestParallelRootResultAddUnitCopyCopy.parameter.evaluate',
      'agents.complexLocation.acts.selfAvailableWithinCopy.function',
      'agents.complexLocation.acts.testSelfWithinBoundsWithin2DBoundary_GoodBoundary_Query.function',
    ]);
  });
});

describe('SIR', () => {
  it('is reported as unsupported, not translated in part', () => {
    const { model, diagnostics } = translateMetaabm(read('sd/SIR.metaabm'));
    expect(model).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      path: '//@children.0',
      severity: 'error',
      kind: 'unsupported',
    });
    expect(diagnostics[0]?.message).toContain('system dynamics');
  });
});
