// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { checkModel } from '../metamodel/check';
import type { Act, Model } from '../metamodel/types';
import { pathOf, resolveReference, splitReferences } from './xmi';
import { parseXml } from './xml';
import { translateMetaabm } from './translate';

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<metaabm:SContext xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:act="http://metaabm.org/act" xmlns:function="http://metaabm.org/function" xmlns:metaabm="http://metaabm.org/structure" xmlns:sd="sd" label="Test" ID="test" pluralLabel="Tests">`;

/** A model around some XMI: a root group and one agent `a` in a grid, with these parts. */
function translate(parts: { root?: string; agent?: string; space?: string; attributes?: string }) {
  const grid =
    parts.space ??
    `<projections xsi:type="metaabm:SGrid" label="Grid" ID="grid" dimensionality="2" neighborhood="MOORE">
      <attributes label="Width" ID="width" sType="INTEGER" defaultValue="10"/>
      <attributes label="Height" ID="height" sType="INTEGER" defaultValue="10"/>
    </projections>`;
  return translateMetaabm(`${HEAD}
  ${parts.attributes ?? ''}
  ${parts.root ?? ''}
  <agents label="A" ID="a" pluralLabel="As">
    <rootActivity xsi:type="act:AGroup" label="Root" ID="rootActGroup">${parts.agent ?? ''}</rootActivity>
  </agents>
  ${grid}
</metaabm:SContext>`);
}

const rule = `<members xsi:type="act:ARule" label="Rule" ID="rule" selected="//@agents[ID='a']/@rootActivity/@members[ID='rule']" agent="//@agents[ID='a']" space="//@projections[ID='grid']"`;
const at = (id: string) => `//@agents[ID='a']/@rootActivity/@members[ID='${id}']`;
const member = (model: Model | undefined, id: string): Act => {
  const act = model?.agents?.['a']?.acts?.members[id];
  if (!act) throw new Error(`no act ${id}`);
  return act;
};
const messages = (text: string, kind?: string) =>
  translateMetaabm(text)
    .diagnostics.filter((d) => kind === undefined || d.kind === kind)
    .map((d) => d.message);

describe('XMI references', () => {
  const root =
    parseXml(`<r><agents ID="a"><rootActivity ID="g"><members ID="x"/><members ID="y"/></rootActivity>
    <attributes ID="s"><options ID="o1"/><options ID="o2"/></attributes></agents></r>`);

  it('resolve paths by ID, by index and through single-valued features', () => {
    const node = (ref: string) => {
      const resolved = resolveReference(root, ref);
      return resolved.kind === 'local' ? resolved.node.attrs['ID'] : resolved.kind;
    };
    expect(node("//@agents[ID='a']/@rootActivity/@members[ID='y']")).toBe('y');
    expect(node("//@agents[ID='a']/@attributes[ID='s']/@options.1")).toBe('o2');
    expect(node("//@agents[ID='a']/@rootActivity/@members.0")).toBe('x');
    expect(node('/')).toBeUndefined();
    expect(node("//@agents[ID='nobody']")).toBe('missing');
  });

  it('read hrefs into other files', () => {
    expect(
      resolveReference(
        root,
        "http://metaabm.org/core_library.metaabm#//@library[ID='coreFunctions']/@subs[ID='spatial']/@functions[ID='available']",
      ),
    ).toEqual({
      kind: 'external',
      reference: {
        file: 'http://metaabm.org/core_library.metaabm',
        segments: [
          ['library', 'coreFunctions'],
          ['subs', 'spatial'],
          ['functions', 'available'],
        ],
      },
    });
  });

  it('write the path of an element the way EMF does', () => {
    const resolved = resolveReference(root, "//@agents[ID='a']/@attributes[ID='s']/@options.1");
    if (resolved.kind !== 'local') throw new Error('unresolved');
    expect(pathOf(resolved.node)).toBe("//@agents[ID='a']/@attributes[ID='s']/@options.1");
    expect(pathOf(root)).toBe('/');
  });

  it('split lists of references', () => {
    expect(splitReferences("//@a[ID='x'] //@b[ID='y z']")).toEqual([
      "//@a[ID='x']",
      "//@b[ID='y z']",
    ]);
    expect(splitReferences(undefined)).toEqual([]);
  });
});

describe('translateMetaabm', () => {
  it('reports XML that is not well formed instead of throwing', () => {
    const result = translateMetaabm('<metaabm:SContext');
    expect(result.model).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', kind: 'invalid' });
  });

  it('does not translate a model that uses an extension, and says which', () => {
    const result = translateMetaabm(
      `${HEAD}<children xsi:type="sd:SdModel" name="SD"><abstractVariables xsi:type="sd:SdStockVariable" name="S"/></children></metaabm:SContext>`,
    );
    expect(result.model).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      path: '//@children.0',
      severity: 'error',
      kind: 'unsupported',
    });
    expect(result.diagnostics[0]?.message).toContain('system dynamics');
  });

  it('writes the core library constants as literals', () => {
    const k = "http://metaabm.org/core_library.metaabm#//@attributes[ID='";
    const { model, diagnostics } = translate({
      attributes: `<attributes label="N" ID="n" sType="INTEGER"/><attributes label="F" ID="f" sType="BOOLEAN"/>`,
      agent: `${rule} targets="${at('setN')} ${at('setF')}"/>
        <members xsi:type="act:ASet" label="Set N" ID="setN" sources="${at('rule')}" selected="${at('rule')}" attribute="//@attributes[ID='n']"><parameter xsi:type="metaabm:SAttribute" href="${k}unit']"/></members>
        <members xsi:type="act:ASet" label="Set F" ID="setF" sources="${at('rule')}" selected="${at('rule')}" attribute="//@attributes[ID='f']"><parameter xsi:type="metaabm:SAttribute" href="${k}true']"/></members>`,
    });
    expect(diagnostics.filter((d) => d.severity !== 'note')).toEqual([]);
    expect(member(model, 'setN')).toMatchObject({ parameter: { literal: 1 } });
    expect(member(model, 'setF')).toMatchObject({ parameter: { literal: true } });
    expect(checkModel(model!)).toEqual([]);
  });

  it('types a literal from its text: a decimal point makes it real', () => {
    const { model } = translate({
      agent: `${rule} targets="${at('e')}"/>
        <members xsi:type="act:AEvaluate" label="E" ID="e" sources="${at('rule')}" selected="${at('rule')}">
          <inputs selected="${at('rule')}" value="${at('e')}/@inputs.0/@literal"><literal label="L" ID="l" valueLiteral="1.0"/></inputs>
          <inputs selected="${at('rule')}" value="${at('e')}/@inputs.1/@literal"><literal label="M" ID="m" valueLiteral="2"/></inputs>
          <function xsi:type="function:FOperator" href="http://metaabm.org/core_library.metaabm#//@library[ID='coreFunctions']/@subs[ID='operators']/@subs[ID='mathOperators']/@functions[ID='add']"/>
        </members>`,
    });
    expect(member(model, 'e')).toMatchObject({
      inputs: [{ literal: 1, type: 'real' }, { literal: 2 }],
    });
  });

  it("keeps an input's selection only where it differs from the act's own", () => {
    const { model } = translate({
      attributes: `<attributes label="N" ID="n" sType="INTEGER"/>`,
      agent: `${rule} targets="${at('s')}"/>
        <members xsi:type="act:ASelect" label="S" ID="s" sources="${at('rule')}" selected="${at('rule')}" agent="//@agents[ID='a']" space="//@projections[ID='grid']" targets="${at('q')}"/>
        <members xsi:type="act:AQuery" label="Q" ID="q" sources="${at('s')}" selected="${at('s')}">
          <inputs selected="${at('rule')}" value="//@attributes[ID='n']"/>
          <inputs selected="${at('s')}" value="//@attributes[ID='n']"/>
          <function xsi:type="function:FLogicalOperator" href="http://metaabm.org/core_library.metaabm#//@library[ID='coreFunctions']/@subs[ID='operators']/@subs[ID='logicalOperators']/@functions[ID='lesser']"/>
        </members>`,
    });
    expect(member(model, 'q')).toMatchObject({
      inputs: [{ attribute: 'test.n', selected: 'rule' }, { attribute: 'test.n' }],
    });
  });

  it('drops the agent and selection of a root, and says when they differ', () => {
    const same = translate({ agent: `${rule}/>` });
    expect(member(same.model, 'rule')).toEqual({
      kind: 'rule',
      label: 'Rule',
      space: 'grid',
    });
    expect(same.diagnostics.filter((d) => d.severity !== 'note')).toEqual([]);

    const other = translate({
      agent: `<members xsi:type="act:ARule" label="Rule" ID="rule" selected="//@agents[ID='a']/@rootActivity/@members[ID='other']" agent="/"/>
        <members xsi:type="act:ARule" label="Other" ID="other" selected="${at('other')}" agent="//@agents[ID='a']"/>`,
    });
    expect(other.diagnostics.map((d) => [d.severity, d.path])).toEqual([
      ['warning', `${at('rule')}/@agent`],
      ['warning', `${at('rule')}/@selected`],
    ]);
  });

  it('drops the destination of die, leave and disconnect, and says when it differs', () => {
    const net = `<projections xsi:type="metaabm:SNetwork" label="Net" ID="net" directed="false"/>`;
    const { model, diagnostics } = translate({
      space: net,
      agent: `${rule} targets="${at('die')} ${at('leave')} ${at('disconnect')}"/>
        <members xsi:type="act:ADie" label="Die" ID="die" sources="${at('rule')}" selected="${at('rule')}" destination="${at('rule')}"/>
        <members xsi:type="act:ALeave" label="Leave" ID="leave" sources="${at('rule')}" selected="${at('rule')}" destination="${at('rule')}"/>
        <members xsi:type="act:ADisconnect" label="Disconnect" ID="disconnect" sources="${at('rule')}" selected="${at('rule')}" destination="${at('die')}" within="//@projections[ID='net']"/>`,
    });
    expect(member(model, 'die')).toEqual({ kind: 'die', label: 'Die', selected: 'rule' });
    expect(member(model, 'disconnect')).toEqual({
      kind: 'disconnect',
      label: 'Disconnect',
      selected: 'rule',
      within: 'net',
    });
    expect(diagnostics.filter((d) => d.severity === 'warning').map((d) => d.path)).toEqual([
      `${at('disconnect')}/@destination`,
    ]);
  });

  it('maps border rules and writes out a missing neighbourhood', () => {
    const grid = (extra: string) =>
      translate({
        space: `<projections xsi:type="metaabm:SGrid" label="Grid" ID="grid" dimensionality="2" ${extra}>
          <attributes xsi:type="metaabm:SAttributeArray" label="Dimensions" ID="dimensions" size="2"/>
          <attributes label="Width" ID="width" sType="INTEGER"/><attributes label="Height" ID="height" sType="INTEGER"/></projections>`,
      });
    const strict = grid('borderRule="STRICT"');
    expect(strict.model?.spaces?.['grid']).toMatchObject({
      kind: 'grid',
      borderRule: 'sticky',
      neighborhood: 'euclidean',
      dimensions: ['width', 'height'],
    });
    expect(strict.diagnostics.map((d) => [d.kind, d.path])).toEqual(
      expect.arrayContaining([
        ['dropped', "//@projections[ID='grid']/@borderRule"],
        ['defaulted', "//@projections[ID='grid']/@neighborhood"],
        ['dropped', "//@projections[ID='grid']/@attributes[ID='dimensions']"],
      ]),
    );
    expect(
      grid('borderRule="PERIODIC" neighborhood="VON_NEUMANN"').model?.spaces?.['grid'],
    ).toMatchObject({
      borderRule: 'periodic',
      neighborhood: 'vonNeumann',
    });
    expect(
      Object.keys(
        strict.model?.spaces?.['grid'] && 'attributes' in strict.model.spaces['grid']
          ? (strict.model.spaces['grid'].attributes ?? {})
          : {},
      ),
    ).toEqual(['width', 'height']);
  });

  it('gives an attribute with no type the ecore default, integer, and says so', () => {
    const { model, diagnostics } = translate({
      attributes: `<attributes label="N" ID="n" defaultValue="3"/>`,
    });
    expect(model?.attributes?.['n']).toEqual({ type: 'integer', label: 'N', default: 3 });
    expect(diagnostics.find((d) => d.kind === 'defaulted')?.path).toBe(
      "//@attributes[ID='n']/@sType",
    );
  });

  it('keeps the options of a state and its default by ID', () => {
    const { model } = translate({
      agent: '',
      attributes: `<attributes xsi:type="metaabm:SState" label="S" ID="s" sType="SYMBOL" defaultValue="Two" defaultOption="//@attributes[ID='s']/@options.1">
        <options label="One" ID="one" pluralLabel="Ones"/><options label="Two" ID="two"/></attributes>`,
    });
    expect(model?.attributes?.['s']).toEqual({
      type: 'state',
      label: 'S',
      options: { one: { label: 'One', pluralLabel: 'Ones' }, two: { label: 'Two' } },
      defaultOption: 'two',
    });
  });

  it('keeps a Java method body as a comment and says it is Java', () => {
    const { model, diagnostics } = translate({
      agent: `${rule} targets="${at('m')}"/>
        <members xsi:type="act:AMethod" label="M" ID="m" sources="${at('rule')}" selected="${at('rule')}" body="    int x = 1;&#xD;&#xA;    x++;"/>`,
    });
    expect(member(model, 'm')).toMatchObject({
      kind: 'method',
      body: '// Java, from the original model. Port it to TypeScript by hand.\n// int x = 1;\n// x++;',
    });
    expect(diagnostics.filter((d) => d.severity === 'warning')).toMatchObject([
      { kind: 'unsupported', path: `${at('m')}/@body` },
    ]);
  });

  it('reports a reference that does not resolve, and an act of another agent', () => {
    const missing = translate({
      agent: `${rule} targets="${at('nowhere')}"/>`,
    });
    expect(missing.diagnostics.map((d) => [d.severity, d.kind])).toContainEqual([
      'error',
      'invalid',
    ]);

    const moved = translateMetaabm(`${HEAD}
      <agents label="A" ID="a"><rootActivity xsi:type="act:AGroup" ID="g">${rule} targets="//@agents[ID='b']/@rootActivity/@members[ID='x']"/></rootActivity></agents>
      <agents label="B" ID="b"><rootActivity xsi:type="act:AGroup" ID="g">
        <members xsi:type="act:ADie" label="X" ID="x" selected="//@agents[ID='a']/@rootActivity/@members[ID='rule']"/></rootActivity></agents>
    </metaabm:SContext>`);
    // The flow starts in agent a, so the die act belongs to a, wherever its group is.
    expect(moved.model?.agents?.['a']?.acts?.members['x']).toMatchObject({
      kind: 'die',
      selected: 'rule',
    });
    expect(moved.model?.agents?.['b']?.acts?.members).toEqual({});
    expect(moved.diagnostics.filter((d) => d.kind === 'moved')).toHaveLength(1);
  });

  it('reports an ID the format cannot hold', () => {
    const { diagnostics } = translate({
      attributes: `<attributes label="N" ID="not valid" sType="INTEGER"/>`,
    });
    expect(diagnostics.find((d) => d.severity === 'error')?.message).toContain('not valid');
  });

  it("drops a select's `for` with a warning only when it disagrees with the query terms", () => {
    const select = (cardinality: string) =>
      translate({
        agent: `${rule} targets="${at('s')}"/>
          <members xsi:type="act:ASelect" label="S" ID="s" sources="${at('rule')}" selected="${at('rule')}" agent="//@agents[ID='a']" space="//@projections[ID='grid']" for="${cardinality}"/>`,
      }).diagnostics.filter((d) => d.path.endsWith('/@for'));
    expect(select('ALL')).toMatchObject([{ severity: 'warning' }]);
    expect(select('ONE')).toMatchObject([{ severity: 'note' }]);
  });

  it('says when a source and a target do not agree', () => {
    const { diagnostics } = translate({
      agent: `${rule} targets="${at('d')}"/>
        <members xsi:type="act:ADie" label="D" ID="d" selected="${at('rule')}"/>`,
    });
    expect(messages(`${HEAD}</metaabm:SContext>`, 'dropped')).toEqual([]);
    expect(diagnostics).toMatchObject([{ severity: 'warning', path: `${at('rule')}/@targets` }]);
  });

  it('reads any model the format check accepts without errors', () => {
    const { model } = translate({ agent: `${rule}/>` });
    expect(checkModel(model!).filter((d) => d.severity === 'error')).toEqual([]);
  });
});
