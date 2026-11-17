// SPDX-License-Identifier: EPL-2.0
//
// The translation from AMP's run files to run specs and run tests: `.apar`
// files (the APar grammar, `org.eclipse.amp.amf.parameters/APar.xtext`) and
// `.atest` files (`org.eclipse.amp.amf.testing/ATest.xtext`), both built on
// ABase (`org.eclipse.amp.amf.abase/ABase.xtext`). Names in them are resolved
// against the translated model, as AMP's scope providers resolved them.
import type { Attribute, Model } from '../metamodel/types';
import {
  RUN_SPEC_SCHEMA_VERSION,
  type Constraint,
  type Measure,
  type RunParameter,
  type RunSpec,
  type RunTest,
  type RunValue,
} from '../runspec/types';
import type { TranslationDiagnostic } from './translate';

// ─────────────────────────────── Tokens ───────────────────────────────

type TokenKind = 'id' | 'string' | 'desc' | 'integer' | 'real' | 'symbol' | 'end';

interface Token {
  readonly kind: TokenKind;
  /** The token's value: an unquoted string, or the text of anything else. */
  readonly text: string;
  readonly line: number;
}

const ESCAPES: Readonly<Record<string, string>> = {
  b: '\b',
  t: '\t',
  n: '\n',
  f: '\f',
  r: '\r',
  '"': '"',
  "'": "'",
  '\\': '\\',
  '«': '«',
  '»': '»',
};

class SyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

/**
 * The tokens of a file, by the terminals of Xtext's common terminals and of
 * ABase: IDs (with an optional `^`), strings in double or single quotes,
 * descriptions in « », integers and reals (`-`? digits, and a real has a
 * point: `.1` and `0.` are reals), keywords, and comments.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '\n') {
      line++;
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else if (text.startsWith('//', i)) {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw new SyntaxError('A comment is not closed', line);
      line += text.slice(i, end).split('\n').length - 1;
      i = end + 2;
    } else if (c === '"' || c === "'" || c === '«') {
      const close = c === '«' ? '»' : c;
      const start = line;
      let value = '';
      i++;
      while (text[i] !== close) {
        if (i >= text.length) throw new SyntaxError('A string is not closed', start);
        if (text[i] === '\\') {
          const escaped = ESCAPES[text[i + 1] ?? ''];
          if (escaped === undefined) throw new SyntaxError('An unknown escape in a string', line);
          value += escaped;
          i += 2;
        } else {
          if (text[i] === '\n') line++;
          value += text[i];
          i++;
        }
      }
      i++;
      tokens.push({ kind: c === '«' ? 'desc' : 'string', text: value, line: start });
    } else {
      // A point alone is the keyword `.`, as Xtext prefers keywords.
      const number = /^-?([0-9]+\.[0-9]*|\.[0-9]+|[0-9]+)/.exec(text.slice(i));
      const id = /^\^?[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
      if (number) {
        tokens.push({ kind: number[0].includes('.') ? 'real' : 'integer', text: number[0], line });
        i += number[0].length;
      } else if (id) {
        tokens.push({ kind: 'id', text: id[0].replace(/^\^/, ''), line });
        i += id[0].length;
      } else if ('=[](),.'.includes(c)) {
        tokens.push({ kind: 'symbol', text: c, line });
        i++;
      } else {
        throw new SyntaxError(`Unexpected \`${c}\``, line);
      }
    }
  }
  tokens.push({ kind: 'end', text: '', line });
  return tokens;
}

class Tokens {
  #at = 0;
  constructor(readonly tokens: readonly Token[]) {}
  get next(): Token {
    return this.tokens[this.#at]!;
  }
  take(): Token {
    const token = this.next;
    if (token.kind !== 'end') this.#at++;
    return token;
  }
  is(kind: TokenKind, text?: string): boolean {
    return this.next.kind === kind && (text === undefined || this.next.text === text);
  }
  accept(kind: TokenKind, text?: string): Token | undefined {
    return this.is(kind, text) ? this.take() : undefined;
  }
  expect(kind: TokenKind, text?: string): Token {
    const token = this.accept(kind, text);
    if (token) return token;
    const found = this.next.kind === 'end' ? 'the end' : `\`${this.next.text}\``;
    throw new SyntaxError(
      `Expected ${text ? `\`${text}\`` : `${kind}`}, found ${found}`,
      this.next.line,
    );
  }
}

// ─────────────────────────────── Shared ───────────────────────────────

/** Finds the model a run file names, by the file name as written (`|Epidemic.metaabm`). */
export type ModelResolver = (uri: string) => Model | undefined;

export interface RunFileTranslation<T> {
  /** The translation; missing if the file could not be read. */
  value: T | undefined;
  /** Each with the line of the file it is about (`line 3`). */
  diagnostics: TranslationDiagnostic[];
}

/** `EpiBase` for `"EpiBase.apar"`, `"|params/EpiBase.apar"` or `"../EpiBase.apar"`. */
export function runFileId(uri: string): string {
  const name = uri.replace(/^\|/, '').split('/').at(-1)!;
  return name.replace(/\.[^.]*$/, '');
}

/** StringUtils.capitalize: the first character in upper case. */
const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const at = (line: number) => `line ${line}`;

/** A value as ABase reads it: an integer, real, string or boolean. */
function readValue(tokens: Tokens): { value: RunValue; kind: TokenKind; line: number } {
  const token = tokens.take();
  switch (token.kind) {
    case 'integer':
    case 'real':
      return { value: Number(token.text), kind: token.kind, line: token.line };
    case 'string':
      return { value: token.text, kind: token.kind, line: token.line };
    case 'id':
      if (token.text === 'true' || token.text === 'false') {
        return { value: token.text === 'true', kind: token.kind, line: token.line };
      }
  }
  throw new SyntaxError(`Expected a value, found \`${token.text}\``, token.line);
}

// ──────────────────────────────── APar ────────────────────────────────

export interface AparOptions {
  /** The run spec's ID. Default: `run`. Translating a file, its name without the extension. */
  readonly id?: string;
  /** Finds the model the file names. */
  readonly models: ModelResolver;
}

/** The engine's attributes that APar could set (`Engine.metaabm` of the parameters plug-in). */
const ENGINE = { stopPeriod: 'Stop Period', pausePeriod: 'Pause Period' } as const;

interface Named {
  /** `stopPeriod` and `pausePeriod` are the engine's; anything else is an attribute reference. */
  readonly ref: string;
  readonly attribute?: Attribute;
}

/**
 * The attributes an APar file can name, as AMP's `AParScopeProvider` named
 * them: by ID, capitalized (`StopPeriod`, `IndividualCount`, and for an
 * attribute of a space the space's ID first, `CityWidth`), and, for files
 * written before that, by label (`"Stop Period"`, `"Individual Count"`, and
 * for a space's attribute the space's label first). Immutable attributes
 * cannot be set, so they are not named.
 */
function aparNames(model: Model): { byId: Map<string, Named>; byLabel: Map<string, Named> } {
  const byId = new Map<string, Named>();
  const byLabel = new Map<string, Named>();
  for (const [ref, label] of Object.entries(ENGINE)) {
    byId.set(capitalize(ref), { ref });
    byLabel.set(label, { ref });
  }
  const add = (ref: string, id: string, label: string | undefined, attribute: Attribute) => {
    if (attribute.immutable) return;
    byId.set(id, { ref, attribute });
    if (label !== undefined) byLabel.set(label, { ref, attribute });
  };
  for (const [id, attribute] of Object.entries(model.attributes ?? {})) {
    add(id, capitalize(id), attribute.label, attribute);
  }
  for (const [spaceId, space] of Object.entries(model.spaces ?? {})) {
    for (const [id, attribute] of Object.entries(space.attributes ?? {})) {
      add(
        `${spaceId}.${id}`,
        capitalize(spaceId) + capitalize(id),
        attribute.label !== undefined && space.label !== undefined
          ? `${space.label} ${attribute.label}`
          : undefined,
        attribute,
      );
    }
  }
  return { byId, byLabel };
}

/**
 * Translates the text of an `.apar` file to a run spec. The engine's `Stop
 * Period` becomes the run spec's stop period; its `Pause Period` is dropped
 * (a run spec has none); a symbol beginning with `|` (AMP's project path) is
 * kept as written.
 */
export function translateApar(text: string, options: AparOptions): RunFileTranslation<RunSpec> {
  const diagnostics: TranslationDiagnostic[] = [];
  const report = (
    line: number,
    severity: TranslationDiagnostic['severity'],
    kind: TranslationDiagnostic['kind'],
    message: string,
  ) => diagnostics.push({ path: at(line), severity, kind, message });
  const tokens = (() => {
    try {
      return new Tokens(tokenize(text));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      report(error.line, 'error', 'invalid', error.message);
      return undefined;
    }
  })();
  if (!tokens) return { value: undefined, diagnostics };
  try {
    const label = tokens.accept('string')?.text;
    tokens.expect('id', 'model');
    const modelToken = tokens.expect('string');
    const model = options.models(modelToken.text);
    if (!model) {
      report(modelToken.line, 'error', 'invalid', `There is no model \`${modelToken.text}\``);
      return { value: undefined, diagnostics };
    }
    const incorporates: string[] = [];
    while (tokens.accept('id', 'incorporates'))
      incorporates.push(runFileId(tokens.expect('string').text));
    const names = aparNames(model);
    let stopPeriod: number | undefined;

    /** A parameter; undefined if it is the engine's, or could not be translated. */
    const parameter = (inLink: boolean): RunParameter | undefined => {
      if (tokens.accept('symbol', '[')) {
        const parameters: RunParameter[] = [];
        while (!tokens.accept('symbol', ']')) {
          const member = parameter(true);
          if (member) parameters.push(member);
        }
        return { kind: 'link', parameters };
      }
      const nameToken = tokens.next.kind === 'string' ? tokens.take() : tokens.expect('id');
      const named =
        nameToken.kind === 'string'
          ? names.byLabel.get(nameToken.text)
          : names.byId.get(nameToken.text);
      const sweep = tokens.accept('symbol', '[') !== undefined;
      if (!sweep) tokens.expect('symbol', '=');
      const read = [readValue(tokens)];
      if (sweep) {
        for (let n = 0; n < 2; n++) {
          tokens.expect('symbol', ',');
          read.push(readValue(tokens));
        }
        tokens.expect('symbol', ']');
      }
      if (!named) {
        report(
          nameToken.line,
          'error',
          'invalid',
          `The model has no parameter \`${nameToken.text}\``,
        );
        return undefined;
      }
      if (nameToken.kind === 'string') {
        report(
          nameToken.line,
          'note',
          'moved',
          `\`"${nameToken.text}"\` is named by its label, as APar files once were`,
        );
      }
      if (named.ref === 'pausePeriod') {
        report(
          nameToken.line,
          'note',
          'dropped',
          'The pause period is dropped: a run spec has none',
        );
        return undefined;
      }
      const attribute = named.attribute;
      for (const v of read) {
        const fits =
          named.ref === 'stopPeriod' || attribute?.type === 'integer'
            ? v.kind === 'integer'
            : attribute?.type === 'real'
              ? v.kind === 'integer' || v.kind === 'real'
              : attribute?.type === 'boolean'
                ? typeof v.value === 'boolean'
                : attribute?.type === 'symbol'
                  ? v.kind === 'string'
                  : typeof v.value === 'string' &&
                    attribute?.type === 'state' &&
                    v.value in attribute.options;
        if (!fits) {
          report(
            v.line,
            'error',
            'invalid',
            `\`${nameToken.text}\` cannot take \`${String(v.value)}\``,
          );
          return undefined;
        }
        if (
          attribute?.type === 'symbol' &&
          typeof v.value === 'string' &&
          v.value.startsWith('|')
        ) {
          report(
            v.line,
            'note',
            'dropped',
            'A leading `|` stood for the project folder; it is kept as written',
          );
        }
      }
      if (named.ref === 'stopPeriod') {
        if (sweep || inLink) {
          report(
            nameToken.line,
            'error',
            'unsupported',
            'The stop period cannot be swept or linked',
          );
        } else if (stopPeriod === undefined) {
          stopPeriod = read[0]!.value as number;
        }
        return undefined;
      }
      if (sweep) {
        if (attribute?.type !== 'integer' && attribute?.type !== 'real') {
          report(
            nameToken.line,
            'error',
            'invalid',
            `\`${nameToken.text}\` is not numeric, so it cannot be swept`,
          );
          return undefined;
        }
        const [start, end, increment] = read.map((v) => v.value as number);
        return {
          kind: 'sweep',
          attribute: named.ref,
          start: start!,
          end: end!,
          increment: increment!,
        };
      }
      return { kind: 'single', attribute: named.ref, value: read[0]!.value };
    };

    const parameters: RunParameter[] = [];
    while (!tokens.is('end')) {
      const translated = parameter(false);
      if (translated) parameters.push(translated);
    }
    const spec: RunSpec = {
      schemaVersion: RUN_SPEC_SCHEMA_VERSION,
      id: options.id ?? 'run',
      ...(label !== undefined && { label }),
      model: model.id,
      ...(incorporates.length > 0 && { incorporates }),
      ...(stopPeriod !== undefined && { stopPeriod }),
      ...(parameters.length > 0 && { parameters }),
    };
    return { value: spec, diagnostics };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    report(error.line, 'error', 'invalid', error.message);
    return { value: undefined, diagnostics };
  }
}

// ──────────────────────────────── ATest ────────────────────────────────

export interface AtestOptions {
  /** The run test's ID. Default: `test`. Translating a file, its name without the extension. */
  readonly id?: string;
  /** Finds the run spec the test names (or, naming none, the one with its ID), by its file name as written. */
  readonly runSpecs: (uri: string) => RunSpec | undefined;
  /** Finds a model by its ID. */
  readonly models: (id: string) => Model | undefined;
}

const MEASURES: Readonly<Record<string, Measure>> = {
  Count: 'count',
  Average: 'average',
  Sum: 'sum',
  Minimum: 'minimum',
  Maximum: 'maximum',
};

/** Every agent of a model, at any depth, with its path from the root scape. */
function agentsOf(model: Model): [string, NonNullable<Model['agents']>[string]][] {
  const found: [string, NonNullable<Model['agents']>[string]][] = [];
  const visit = (agents: Model['agents'], prefix: string) => {
    for (const [id, agent] of Object.entries(agents ?? {})) {
      found.push([`${prefix}${id}`, agent]);
      if (agent.kind === 'scape') visit(agent.agents, `${prefix}${id}.`);
    }
  };
  visit(model.agents, '');
  return found;
}

/**
 * Translates the text of an `.atest` file to a run test. Names are resolved as
 * AMP's `ATestScopeProvider` resolved them: agents, their attributes and the
 * options of a state, each by its ID capitalized (`Count(Individual.Status=Dead)`).
 * A test that names no run spec runs the one with its own ID, as in AMP, and
 * the translation writes it out.
 */
export function translateAtest(text: string, options: AtestOptions): RunFileTranslation<RunTest> {
  const diagnostics: TranslationDiagnostic[] = [];
  const report = (
    line: number,
    severity: TranslationDiagnostic['severity'],
    kind: TranslationDiagnostic['kind'],
    message: string,
  ) => diagnostics.push({ path: at(line), severity, kind, message });
  const id = options.id ?? 'test';
  try {
    const tokens = new Tokens(tokenize(text));
    const label = tokens.accept('string')?.text;
    const description = tokens.accept('desc')?.text;
    const test: RunTest = {
      schemaVersion: RUN_SPEC_SCHEMA_VERSION,
      id,
      ...(label !== undefined && { label }),
      ...(description !== undefined && { description }),
    };
    if (tokens.accept('id', 'contains')) {
      const contains: string[] = [];
      while (tokens.is('string')) contains.push(runFileId(tokens.take().text));
      tokens.expect('end');
      return { value: { ...test, contains }, diagnostics };
    }
    if (tokens.is('end')) return { value: test, diagnostics };
    const testsToken = tokens.accept('id', 'tests') && tokens.expect('string');
    const runSpecUri = testsToken ? testsToken.text : `${id}.apar`;
    const runSpec = options.runSpecs(runSpecUri);
    const line = testsToken ? testsToken.line : 1;
    if (!testsToken) report(1, 'note', 'defaulted', `Names no run spec, so it runs \`${id}\``);
    const model = runSpec && options.models(runSpec.model);
    if (!runSpec || !model) {
      report(line, 'error', 'invalid', `There is no run spec \`${runSpecUri}\` with a model`);
      return { value: undefined, diagnostics };
    }
    const agents = agentsOf(model);
    const constraints: Constraint[] = [];
    do {
      const measureToken = tokens.expect('id');
      const measure = MEASURES[measureToken.text];
      if (!measure)
        throw new SyntaxError(`\`${measureToken.text}\` is not a measure`, measureToken.line);
      tokens.expect('symbol', '(');
      const agentToken = tokens.expect('id');
      tokens.expect('symbol', '.');
      const attributeToken = tokens.expect('id');
      const qualifierToken = tokens.accept('symbol', '=') && tokens.expect('id');
      tokens.expect('symbol', ')');
      tokens.expect('symbol', '=');
      tokens.expect('symbol', '[');
      const min = readValue(tokens);
      tokens.expect('symbol', ',');
      const max = readValue(tokens);
      tokens.expect('symbol', ']');
      const found = agents.filter(
        ([path]) => capitalize(path.split('.').at(-1)!) === agentToken.text,
      );
      if (found.length !== 1) {
        report(
          agentToken.line,
          'error',
          'invalid',
          found.length > 1
            ? `More than one agent is called \`${agentToken.text}\``
            : `The model has no agent \`${agentToken.text}\``,
        );
        continue;
      }
      const [agentPath, agent] = found[0]!;
      const attribute = Object.entries(agent.attributes ?? {}).find(
        ([attributeId, a]) => !a.immutable && capitalize(attributeId) === attributeToken.text,
      );
      if (!attribute) {
        report(
          attributeToken.line,
          'error',
          'invalid',
          `\`${agentToken.text}\` has no attribute \`${attributeToken.text}\``,
        );
        continue;
      }
      const [attributeId, decl] = attribute;
      let qualifier: string | undefined;
      if (qualifierToken) {
        qualifier =
          decl.type === 'state'
            ? Object.keys(decl.options).find((option) => capitalize(option) === qualifierToken.text)
            : undefined;
        if (qualifier === undefined) {
          report(
            qualifierToken.line,
            'error',
            'invalid',
            `\`${attributeToken.text}\` has no option \`${qualifierToken.text}\``,
          );
          continue;
        }
      }
      if (typeof min.value !== 'number' || typeof max.value !== 'number') {
        report(min.line, 'error', 'invalid', 'A constraint is between two numbers');
        continue;
      }
      constraints.push({
        measure,
        agent: agentPath,
        attribute: attributeId,
        ...(qualifier !== undefined && { qualifier }),
        min: min.value,
        max: max.value,
      });
    } while (!tokens.is('end'));
    return { value: { ...test, runSpec: runSpec.id, constraints }, diagnostics };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    report(error.line, 'error', 'invalid', error.message);
    return { value: undefined, diagnostics };
  }
}
