// SPDX-License-Identifier: EPL-2.0
//
// Generates JavaScript for the flows of an agent's root acts (docs/codegen.md).
// It works from the interpreter's own analysis of the acts (../flows.ts: the
// order flows run in, the regions of selects, their exits, the gates), and
// emits what the interpreter's closures would do, so the two mean the same:
//
// - The frames of a flow become blocks of code. A selection bound on a path is
//   a local variable of the block that binds it, and a value remembered on a
//   frame a variable of that block, so the interpreter's search up the frames
//   becomes a test of the variables of the enclosing blocks, worked out here.
// - Each act reached on a path is written out where it is reached, as the
//   interpreter fires it once for each arrival.
// - The tests of a selection's candidates are written out as one expression
//   per exit, in the order and with the short cuts of the interpreter's.
//
// A root act whose flow uses what is not generated yet is left to the
// interpreter, and the reason kept (`Behaviour.interpretedBecause`).
import type { Agent } from '@metascape/engine';
import type { Behaviour, Exit, Node, Unit } from '../flows';
import { coreFunctions } from '../functions';
import type { AgentInfo, AttributeInfo, ScapeInfo, SpaceInfo } from '../model-index';
import type { RunState } from '../runtime';
import type { ActId, Input, SelectAct, Value } from '../types';
import {
  boolean,
  code,
  Emitter,
  join,
  local,
  name,
  number,
  string,
  textOf,
  type Code,
  type LocalKind,
} from './emit';
import { HELPERS } from './helpers';
import { PURE_IMPLEMENTATIONS, TEMPLATES } from './templates';

type FlowAct = Node['act'];
type Run = (agent: Agent, state: RunState) => void;

/** Why an act is not generated. */
class NotGenerated extends Error {}

/** How many acts one root act's generated flow may write out before it is left to the interpreter. */
const MAX_ACTS_WRITTEN = 5000;

/** A frame of the interpreter, as a block of generated code. */
interface Scope {
  readonly parent: Scope | undefined;
  readonly kind: 'root' | 'select' | 'create' | 'arrival' | 'candidate';
  /** The act whose selection the frame binds. */
  readonly select: ActId;
  /** The variable holding the agent it binds. */
  readonly agent: Code;
  /** For a select, the exit that chose the agent. */
  readonly exit: Exit | undefined;
  readonly id: number;
  /** The variables of values remembered on this frame, by key. */
  readonly memo: Map<string, Code>;
  /**
   * The keys whose variables may have been set by the code written so far,
   * and those certainly set. Code is written in the order it runs, and a
   * frame's own code has no branches except gates (see #units), so this is
   * known as each piece is written.
   */
  readonly maybe: Set<string>;
  readonly surely: Set<string>;
}

/**
 * Generates the root acts of a behaviour and makes them the behaviour's
 * generated runs. `file` names the generated source (model ID, then agent
 * path). Returns the source, or undefined if nothing was generated.
 */
export function generateBehaviour(
  behaviour: Behaviour,
  file: readonly string[],
): string | undefined {
  const emitter = new Emitter();
  const self = emitter.constant(behaviour, 'k', 'behaviour');
  const functions: { id: ActId; fn: Code; body: Code }[] = [];
  let count = 0;
  for (const node of behaviour.nodes.values()) {
    if (node.role !== 'root') continue;
    try {
      const generator = new FlowGenerator(behaviour, emitter);
      const fn = name('r', node.id, count++);
      functions.push({ id: node.id, fn, body: generator.root(node, fn) });
    } catch (error) {
      if (!(error instanceof NotGenerated)) throw error;
      behaviour.interpretedBecause.set(node.id, error.message);
    }
  }
  if (functions.length === 0) return undefined;
  const body = code`const N = H.num;
const U = H.U;
const B = ${self};
${functions.map((f) => f.body)}
return new Map([
${functions.map((f) => code`  [${string(f.id)}, ${f.fn}],\n`)}]);`;
  let runs: Map<ActId, Run>;
  const source = emitter.source(body, file);
  try {
    runs = emitter.build<Map<ActId, Run>>(body, file, HELPERS);
  } catch (error) {
    // A page whose Content-Security-Policy forbids `new Function` runs the interpreter.
    for (const f of functions) {
      behaviour.interpretedBecause.set(f.id, `the code could not be made: ${String(error)}`);
    }
    return undefined;
  }
  for (const [id, run] of runs) behaviour.generated.set(id, run);
  return source;
}

class FlowGenerator {
  #scopes = 0;
  #locals = 0;
  #written = 0;

  constructor(
    readonly behaviour: Behaviour,
    readonly emitter: Emitter,
  ) {}

  // ─────────────────────────────── Roots ───────────────────────────────

  root(node: Node, fn: Code): Code {
    const scope = this.#scope(undefined, 'root', node.id, code`Self`, undefined);
    const body = this.#units(node.units, scope);
    return code`function ${fn}(Self, S) {
  const R = Self.random;
${this.#declarations(scope)}${body}}
`;
  }

  // ─────────────────────────────── Scopes ───────────────────────────────

  #scope(
    parent: Scope | undefined,
    kind: Scope['kind'],
    select: ActId,
    agent: Code,
    exit: Exit | undefined,
  ): Scope {
    return {
      parent,
      kind,
      select,
      agent,
      exit,
      id: this.#scopes++,
      memo: new Map(),
      maybe: new Set(),
      surely: new Set(),
    };
  }

  #local(kind: LocalKind): Code {
    return local(kind, this.#locals++);
  }

  /** The declarations of the values remembered on a frame, unset. */
  #declarations(scope: Scope): Code {
    const names = [...scope.memo.values()];
    return names.length === 0 ? code`` : code`let ${join(names, code` = U, `)} = U;\n`;
  }

  /** The variable of a value remembered on a frame. */
  #memo(scope: Scope, key: 'e' | 'q', node: Node): Code {
    const at = `${key}:${node.id}`;
    let found = scope.memo.get(at);
    if (!found) {
      found = name(key === 'e' ? 'm' : 'q', node.id, scope.id);
      scope.memo.set(at, found);
    }
    return found;
  }

  /** The nearest frame binding a selection. */
  #find(scope: Scope, select: ActId): Scope | undefined {
    for (let at: Scope | undefined = scope; at; at = at.parent) {
      if (at.select === select) return at;
    }
    return undefined;
  }

  /** The agent a selection is bound to on this path. */
  #agentOf(scope: Scope, select: ActId): Code {
    return this.#find(scope, select)?.agent ?? code`H.unbound(${string(select)})`;
  }

  #rootOf(scope: Scope): Scope {
    let at = scope;
    while (at.parent) at = at.parent;
    return at;
  }

  // ─────────────────────────────── Constants ───────────────────────────────

  #agentType(info: AgentInfo): Code {
    return this.emitter.constant(info, 't', info.path);
  }

  #space(info: SpaceInfo): Code {
    return this.emitter.constant(info, 's', info.path);
  }

  #attribute(info: AttributeInfo): Code {
    return this.emitter.constant(info, 'a', info.ref);
  }

  #owner(info: AttributeInfo): Code {
    return info.owner.kind === 'space'
      ? this.#space(info.owner as SpaceInfo)
      : this.#agentType(info.owner as AgentInfo);
  }

  // ─────────────────────────────── Units ───────────────────────────────

  /** What a flow goes on to from one arrival, as the interpreter's `runUnits`. */
  #units(units: readonly Unit[], scope: Scope): Code {
    let arrival: Scope | undefined;
    const parts = units.map((unit) => {
      if (unit.kind === 'fire') return this.#fire(unit.target, scope);
      arrival ??= this.#scope(scope, 'arrival', scope.select, scope.agent, scope.exit);
      const predicate = this.#predicate(unit.gate, arrival);
      // What the acts after a gate set is not surely set past the gate.
      const surely = new Set(arrival.surely);
      const after = unit.after.map((target) => this.#fire(target, arrival!));
      arrival.surely.clear();
      for (const key of surely) arrival.surely.add(key);
      return code`if (${predicate}) {\n${after}}\n`;
    });
    if (!arrival) return code`${parts}`;
    return code`{\n${this.#declarations(arrival)}${parts}}\n`;
  }

  #fire(node: Node, scope: Scope): Code {
    if (++this.#written > MAX_ACTS_WRITTEN) {
      throw new NotGenerated(`its flow reaches more than ${MAX_ACTS_WRITTEN} acts`);
    }
    switch (node.role) {
      case 'select':
        return this.#select(node, scope);
      case 'create':
        return this.#create(node, scope);
      case 'statement':
        return this.#statement(node, scope);
      default:
        throw new NotGenerated(`a flow reaches a ${node.act.kind} act as a statement`);
    }
  }

  // ─────────────────────────────── Values ───────────────────────────────

  #read(attribute: AttributeInfo, bound: Code): Code {
    const a = this.#attribute(attribute);
    const owner = this.#owner(attribute);
    if (attribute.owner.kind === 'agent') {
      if (attribute.decl.derived) return code`S.read(H.self(${bound}, ${owner}), ${a})`;
      return code`H.readOwn(S, ${bound}, ${owner}, ${a}, ${number(attribute.index)})`;
    }
    const holder = code`H.holderFor(${bound}, ${owner}, S)`;
    if (attribute.decl.derived && attribute.owner.kind !== 'space') {
      return code`S.read(${holder}, ${a})`;
    }
    return code`H.read(S, ${holder}, ${a}, ${number(attribute.index)})`;
  }

  #holder(attribute: AttributeInfo, bound: Code): Code {
    const owner = this.#owner(attribute);
    return attribute.owner.kind === 'agent'
      ? code`H.self(${bound}, ${owner})`
      : code`H.holderFor(${bound}, ${owner}, S)`;
  }

  /** A value read on a path, as the interpreter's `#value`. */
  #value(value: Value, selected: ActId, scope: Scope): Code {
    const index = this.behaviour.index;
    if ('attribute' in value) {
      const attribute = index.attribute(value.attribute);
      return this.#read(attribute, this.#agentOf(scope, value.selected ?? selected));
    }
    if ('option' in value) return string(value.option.slice(value.option.lastIndexOf('.') + 1));
    if ('evaluate' in value) {
      const node = this.behaviour.nodes.get(value.evaluate);
      if (!node) throw new NotGenerated(`no act \`${value.evaluate}\``);
      return this.#evaluated(node, scope);
    }
    if ('constant' in value) {
      const constant = this.behaviour.constants.get(value.constant);
      if (!constant) throw new NotGenerated(`no constant \`${value.constant}\``);
      return this.emitter.datum(constant.value);
    }
    return this.emitter.datum(value.literal);
  }

  #input(input: Input, selected: ActId, scope: Scope): Code {
    if (!('multiValue' in input)) return this.#value(input, selected, scope);
    const bound = this.#agentOf(scope, selected);
    const index = this.behaviour.index;
    return code`[${join(
      input.multiValue.map((ref) => this.#read(index.attribute(ref), bound)),
      code`, `,
    )}]`;
  }

  /** The value of an evaluate on a path: remembered if it has fired, else worked out now (and remembered). */
  #evaluated(node: Node, scope: Scope): Code {
    const key = `e:${node.id}`;
    // The frames up the path that may hold the value, nearest first, up to one that surely does.
    const chain: Code[] = [];
    for (let at: Scope | undefined = scope; at; at = at.parent) {
      // A candidate's frame is the candidate's alone, and what is worked out
      // on it is pure (see #call), so it need not be remembered there.
      if (at.kind === 'candidate') continue;
      if (at.surely.has(key)) {
        let expression = this.#memo(at, 'e', node);
        for (let i = chain.length - 1; i >= 0; i--) {
          expression = code`(${chain[i]!} !== U ? ${chain[i]!} : ${expression})`;
        }
        return expression;
      }
      if (at.maybe.has(key)) chain.push(this.#memo(at, 'e', node));
    }
    const value = this.#call(node, scope);
    let expression = value;
    if (scope.kind !== 'candidate') {
      expression = code`(${this.#memo(scope, 'e', node)} = ${value})`;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      expression = code`(${chain[i]!} !== U ? ${chain[i]!} : ${expression})`;
    }
    if (scope.kind !== 'candidate') scope.maybe.add(key);
    return expression;
  }

  /** A query's or evaluate's call on a path, as the interpreter's `#call`. */
  #call(node: Node, scope: Scope): Code {
    const act = node.act as Extract<FlowAct, { kind: 'query' | 'evaluate' }>;
    const entry = this.behaviour.functions.get(act.function);
    if (!entry) throw new NotGenerated(`no implementation of function \`${act.function}\``);
    if (entry.impl.kind === 'spatial') return this.#spatialValue(node, scope);
    if (act.function === 'original' && entry.impl === coreFunctions.original) {
      return this.#original(act.inputs?.[0], act.selected, scope);
    }
    const core = Object.hasOwn(coreFunctions, act.function)
      ? coreFunctions[act.function]
      : undefined;
    const isCore = core !== undefined && entry.impl === core;
    const template = isCore ? TEMPLATES.get(act.function) : undefined;
    const inputs = act.inputs ?? [];
    const pure = isCore && (template ? !template.random : PURE_IMPLEMENTATIONS.has(act.function));
    if (scope.kind === 'candidate' && !pure) {
      throw new NotGenerated(
        `a selection tests its candidates with \`${act.function}\`, which is not pure`,
      );
    }
    let info;
    try {
      info = this.behaviour.callInfo(node);
    } catch (error) {
      throw new NotGenerated(String(error));
    }
    const args = inputs.map((input) => this.#input(input, act.selected, scope));
    if (template && template.arity === args.length) return template.emit(args, info);
    if (isCore && act.function === 'randomState' && args.length <= 1) {
      const options = info.optionsOf(info.inputs[0]?.type ?? 'none');
      if (options && options.length > 0) {
        const pick = code`R.pick(${this.emitter.constant(options, 'k', node.id, 'options')})`;
        return args.length === 0 ? pick : code`(${args[0]!}, ${pick})`;
      }
    }
    const call = this.emitter.constant(this.behaviour.compiledCall(node), 'f', node.id);
    return code`${call}([${join(args, code`, `)}], { random: R, period: S.period, style: S.style })`;
  }

  /** `original`: the value an attribute had when its agent started. */
  #original(input: Input | undefined, selected: ActId, scope: Scope): Code {
    if (!input) return code`0`;
    if (!('attribute' in input)) return this.#input(input, selected, scope);
    const attribute = this.behaviour.index.attribute(input.attribute);
    const holder = this.#holder(attribute, this.#agentOf(scope, input.selected ?? selected));
    return code`H.original(S, ${holder}, ${this.#attribute(attribute)})`;
  }

  /** A spatial function used for its value outside a selection, as the interpreter's `#spatialValue`. */
  #spatialValue(node: Node, scope: Scope): Code {
    const act = node.act as Extract<FlowAct, { kind: 'query' | 'evaluate' }>;
    const entry = this.behaviour.functions.get(act.function);
    const term = entry?.impl.kind === 'spatial' ? entry.impl.term : 'distance';
    const selection = this.behaviour.nodes.get(act.selected);
    if (!selection) throw new NotGenerated(`no act \`${act.selected}\``);
    const selectAct = selection.act.kind === 'select' ? selection.act : undefined;
    const spaceId =
      selectAct?.space ?? ('space' in selection.act ? selection.act.space : undefined);
    const spaceInfo =
      spaceId !== undefined
        ? (this.behaviour.index.owners.get(spaceId) as SpaceInfo | undefined)
        : undefined;
    const bound = this.#agentOf(scope, selection.id);
    const origin = selectAct ? this.#agentOf(scope, selectAct.selected) : code`undefined`;
    const inputs = act.inputs ?? [];
    const used = term === 'within' || term === 'lineOfSight' ? 1 : term === 'location2D' ? 2 : 0;
    const args: Code[] = [];
    for (let i = 0; i < 2; i++) {
      const input = inputs[i];
      args.push(i < used && input ? this.#input(input, act.selected, scope) : code`undefined`);
    }
    const space = spaceInfo ? this.#space(spaceInfo) : code`undefined`;
    return code`H.spatialValue(${string(term)}, S, ${bound}, ${origin}, ${space}, ${args[0]!}, ${args[1]!})`;
  }

  /**
   * A set's parameter, as the interpreter's `#setParameter`: an attribute of
   * an agent with no selection named is read from the root act's agent if it
   * holds the attribute.
   */
  #setParameter(value: Value, selected: ActId, scope: Scope): Code {
    const getter = this.#value(value, selected, scope);
    if (!('attribute' in value) || value.selected !== undefined) return getter;
    const attribute = this.behaviour.index.attribute(value.attribute);
    if (attribute.owner.kind !== 'agent') return getter;
    const root = this.#rootOf(scope).agent;
    const owner = this.#owner(attribute);
    return code`(H.isHolder(${root}) && ${root}.info === ${owner} ? S.read(${root}, ${this.#attribute(attribute)}) : ${getter})`;
  }

  // ─────────────────────────────── Gates ───────────────────────────────

  /** Whether a frame reaches a query or logic act outside a region, as the interpreter's `#framePredicate`. */
  #predicate(node: Node, scope: Scope): Code {
    const sources = node.sources.map((source) => this.#sourcePredicate(source, scope));
    const reached = sources.length === 0 ? code`false` : code`(${join(sources, code` || `)})`;
    switch (node.act.kind) {
      case 'query': {
        const key = `q:${node.id}`;
        const q = this.#memo(scope, 'q', node);
        const call = this.#call(node, scope);
        const known = scope.maybe.has(key);
        scope.maybe.add(key);
        return known
          ? code`(${reached} && (${q} !== U ? ${q} : (${q} = ${call})) === true)`
          : code`(${reached} && (${q} = ${call}) === true)`;
      }
      case 'all':
        return sources.length === 0 ? code`true` : code`(${join(sources, code` && `)})`;
      case 'any':
        return reached;
      default:
        return code`!${reached}`;
    }
  }

  #sourcePredicate(source: Node, scope: Scope): Code {
    const region = source.region;
    if (region && source !== region.select) {
      // Reached if the agent the select is bound to was chosen at or past this node.
      const exit = this.#find(scope, region.select.id)?.exit;
      return boolean(exit !== undefined && exit.upstream.has(source));
    }
    if (source.role === 'control') return this.#predicate(source, scope);
    return code`true`;
  }

  // ─────────────────────────────── Selections ───────────────────────────────

  #select(node: Node, scope: Scope): Code {
    const act = node.act as SelectAct;
    const region = node.region!;
    const spaceInfo =
      act.space !== undefined
        ? (this.behaviour.index.owners.get(act.space) as SpaceInfo | undefined)
        : undefined;
    const origin = this.#local('O');
    const space = this.#local('Sp');
    const exits = region.exits.map((exit, i) => this.#exit(node, exit, i, scope, origin, space));
    return code`{
S.looked();
const ${origin} = ${this.#agentOf(scope, act.selected)};
const ${space} = ${spaceInfo ? code`H.spaceAround(${origin}, ${this.#space(spaceInfo)}, S)` : code`undefined`};
${exits}}
`;
  }

  #exit(node: Node, exit: Exit, position: number, scope: Scope, origin: Code, space: Code): Code {
    const e = this.emitter.constant(exit, 'e', node.id, position);
    const from = this.#local('From');
    const onGrid = this.#local('H');
    const found = this.#local('Found');
    const candidate = this.#local('C');
    const select = node.id;
    const thunk = (input: Input | undefined) =>
      input ? code`() => N(${this.#input(input, select, scope)})` : code`undefined`;
    const at = exit.at
      ? code`() => [N(${this.#input(exit.at[0], select, scope)}), N(${this.#input(exit.at[1], select, scope)})]`
      : code`undefined`;
    const candidates = this.#hasSpace(node)
      ? code`H.exitCandidates(${e}, ${space}, ${origin}, ${from}, ${this.#rootOf(scope).agent}, S, ${thunk(exit.radius)}, ${thunk(exit.sight)}, ${at})`
      : exit.type
        ? code`H.populationOf(${this.#agentType(exit.type)}, ${origin}, S)`
        : code`[]`;
    const testScope = this.#scope(scope, 'candidate', select, candidate, exit);
    const tests: Code[] = exit.filters.map(({ node: member, implied }) => {
      const test = this.#onCandidate(member, exit, testScope, origin, space, from);
      return implied ? code`(${onGrid} || ${test})` : test;
    });
    const logic = this.#logicOnCandidate(exit.node, exit, testScope, origin, space, from);
    if (logic) tests.push(logic);
    const passes = tests.length === 0 ? code`true` : join(tests, code` && `);
    const gridTest = exit.filters.some((filter) => filter.implied)
      ? code`const ${onGrid} = H.searchesGrid(${e}, ${space}, ${origin}, ${from});
`
      : code``;
    const excluded = (skip: Code) =>
      exit.locating && !exit.includeSelf
        ? code`if (${origin} !== undefined) {
  if (${candidate} === ${origin}) ${skip};
${exit.here ? code`` : code`  if (${candidate} === ${from}) ${skip};\n`}}
`
        : code``;
    const choose = this.#choose(node, exit, scope, found, origin, space);
    const scan = code`for (const ${candidate} of ${candidates}) {
if (!${candidate}.alive) continue;
${excluded(code`continue`)}if (${passes}) ${found}.push(${candidate});
}
`;
    // The nearest of a grid's cells: searched outward by rank, as the interpreter's `choose`.
    const search = exit.ranked
      ? code`let ${found};
if (H.searchesRanks(${e}, ${space}, ${from})) {
${found} = H.nearestCells(${space}, ${from}, (${candidate}) => {
if (!${candidate}.alive) return false;
${excluded(code`return false`)}return ${passes};
});
} else {
${found} = [];
${scan}}
`
      : code`const ${found} = [];
${scan}`;
    return code`{
const ${from} = H.locate(${space}, ${origin});
${gridTest}${search}${choose}}
`;
  }

  /** Whether a select names a space (without one, it chooses from the population). */
  #hasSpace(node: Node): boolean {
    return (node.act as SelectAct).space !== undefined;
  }

  /** What a query asks of a candidate, as the interpreter's `#queryOnCandidate`. */
  #onCandidate(
    member: Node,
    exit: Exit,
    scope: Scope,
    origin: Code,
    space: Code,
    from: Code,
  ): Code {
    const act = member.act as Extract<FlowAct, { kind: 'query' }>;
    const term = this.behaviour.termOf(member);
    const candidate = scope.agent;
    if (term === undefined) return code`(${this.#call(member, scope)} === true)`;
    const input = (i: number) => {
      const found = act.inputs?.[i];
      return code`N(${found ? this.#input(found, act.selected, scope) : code`undefined`})`;
    };
    const includeSelf = boolean(exit.includeSelf);
    switch (term) {
      case 'neighbor':
        return code`H.isNeighbor(${space}, ${origin}, ${from}, ${includeSelf}, ${candidate})`;
      case 'within':
        return code`H.isWithin(${space}, ${origin}, ${candidate}, ${input(0)})`;
      case 'lineOfSight':
        return code`H.isInLine(${space}, ${origin}, ${from}, ${includeSelf}, ${candidate}, ${input(0)})`;
      case 'here':
        return code`H.isHere(${space}, ${origin}, ${from}, ${candidate})`;
      case 'available':
        return code`H.isAvailable(${candidate})`;
      case 'location2D': {
        const x = input(0);
        return code`H.isAt(${space}, ${candidate}, ${x}, ${input(1)})`;
      }
      default:
        return code`true`;
    }
  }

  /** What the queries that are not spatial, and the logic acts, of a region ask of a candidate, as `#logicOnCandidate`. */
  #logicOnCandidate(
    node: Node,
    exit: Exit,
    scope: Scope,
    origin: Code,
    space: Code,
    from: Code,
  ): Code | undefined {
    const region = exit.region;
    if (node === region.select) return undefined;
    const sources = node.sources
      .map((source) => this.#logicOnCandidate(source, exit, scope, origin, space, from))
      .filter((source): source is Code => source !== undefined);
    const reached =
      sources.length === 0
        ? undefined
        : sources.length === 1
          ? sources[0]!
          : code`(${join(sources, code` || `)})`;
    switch (node.act.kind) {
      case 'query': {
        if (this.behaviour.isSpatial(node)) return reached;
        const own = this.#onCandidate(node, exit, scope, origin, space, from);
        return reached ? code`(${own} && ${reached})` : own;
      }
      case 'all':
        return sources.length === 0 ? undefined : code`(${join(sources, code` && `)})`;
      case 'any':
      case 'evaluate':
        return reached;
      default:
        return reached ? code`!${reached}` : undefined;
    }
  }

  /** Chooses from the candidates found, and runs the exit's flow for each agent chosen. */
  #choose(node: Node, exit: Exit, scope: Scope, found: Code, origin: Code, space: Code): Code {
    const run = (agent: Code) => {
      const child = this.#scope(scope, 'select', node.id, agent, exit);
      const body = this.#units(exit.units, child);
      return code`if (${agent}.alive) {\n${this.#declarations(child)}${body}}\n`;
    };
    const chosen = name('x', node.id, this.#scopes);
    const pickFrom = (list: Code) =>
      exit.every
        ? code`for (const ${chosen} of ${list}) {\n${run(chosen)}}\n`
        : code`if (${list}.length !== 0) {\nconst ${chosen} = R.pick(${list});\n${run(chosen)}}\n`;
    if (exit.cardinality === 'one' || exit.cardinality === 'all') return pickFrom(found);
    const candidate = this.#local('C');
    const testScope = this.#scope(scope, 'candidate', node.id, candidate, exit);
    let score: Code;
    if (exit.cardinality === 'nearest') {
      score = code`(${space} && ${origin} ? (${space}.distance(${origin}, ${candidate}) ?? Infinity) : Infinity)`;
    } else {
      const sign = exit.cardinality === 'minimize' ? code`1` : code`-1`;
      const value = exit.score ? this.#input(exit.score, node.id, testScope) : code`undefined`;
      score = code`(${sign} * N((${value}) ?? 0))`;
    }
    const best = this.#local('Best');
    const ties = this.#local('Ties');
    const value = this.#local('Value');
    return code`if (${found}.length !== 0) {
let ${best} = Infinity;
let ${ties} = [];
for (const ${candidate} of ${found}) {
const ${value} = ${score};
if (${value} < ${best}) {
${best} = ${value};
${ties} = [${candidate}];
} else if (${value} === ${best}) ${ties}.push(${candidate});
}
${pickFrom(ties)}}
`;
  }

  #create(node: Node, scope: Scope): Code {
    const act = node.act as Extract<FlowAct, { kind: 'create' }>;
    const type = this.behaviour.index.owners.get(act.agent) as AgentInfo | undefined;
    if (!type) throw new NotGenerated(`no agent \`${act.agent}\``);
    const n = this.#local('N');
    const count = act.agentCount
      ? code`Math.trunc(N(${this.#value(act.agentCount, act.selected, scope)}))`
      : code`1`;
    if (!type.context) return code`${count};\n`;
    const t = this.#agentType(type);
    const context = this.emitter.constant(type.context as ScapeInfo, 't', type.context.path);
    const where = this.#local('Sp');
    const i = this.#local('I');
    const agent = name('x', node.id, this.#scopes);
    const child = this.#scope(scope, 'create', node.id, agent, undefined);
    const body = this.#units(node.units, child);
    return code`{
const ${n} = ${count};
if (${n} > 0) {
const ${where} = H.instancesOf(${this.#agentOf(scope, act.selected)}, ${context}, S)[0];
if (${where}) for (let ${i} = 0; ${i} < ${n}; ${i}++) {
const ${agent} = S.create(${t}, ${where});
if (!${agent}) break;
{
${this.#declarations(child)}${body}}
if (H.isHolder(${agent}) && S.keepsOriginals) ${agent}.originals = [...${agent}.values];
}
}
}
`;
  }

  // ─────────────────────────────── Statements ───────────────────────────────

  #statement(node: Node, scope: Scope): Code {
    const act = node.act;
    const index = this.behaviour.index;
    const after = () => this.#units(node.units, scope);
    switch (act.kind) {
      case 'evaluate': {
        const value = this.#local('Value');
        const call = this.#call(node, scope);
        const memo = this.#memo(scope, 'e', node);
        scope.maybe.add(`e:${node.id}`);
        scope.surely.add(`e:${node.id}`);
        const capture =
          node.targets.length === 0
            ? code`if (S.capture && ${value} !== undefined) S.capture.value = ${value};\n`
            : code``;
        return code`{
const ${value} = ${call};
${memo} = ${value};
${capture}${after()}}
`;
      }
      case 'set': {
        const attribute = index.attribute(act.attribute);
        const value = this.#local('Value');
        const holder = this.#local('H');
        const parameter = this.#setParameter(act.parameter, act.selected, scope);
        return code`{
const ${value} = ${parameter};
const ${holder} = ${this.#holder(attribute, this.#agentOf(scope, act.selected))};
S.write(${holder}, ${this.#attribute(attribute)}, ${value});
${after()}}
`;
      }
      case 'move': {
        const destination = this.#find(scope, act.destination);
        const move = destination
          ? code`H.move(${this.#agentOf(scope, act.selected)}, ${destination.agent}, ${boolean(destination.exit?.toward ?? false)}, ${boolean(destination.exit?.away ?? false)}, S);\n`
          : code``;
        return code`${move}${after()}`;
      }
      case 'leave': {
        const space = this.behaviour.leaveSpace(node);
        return code`H.leave(${this.#agentOf(scope, act.selected)}, ${space ? this.#space(space) : code`undefined`}, S);\n${after()}`;
      }
      case 'die':
        return code`H.die(${this.#agentOf(scope, act.selected)}, S);\n${after()}`;
      case 'connect':
      case 'replace':
      case 'disconnect': {
        const network = index.owners.get(act.within) as SpaceInfo | undefined;
        if (!network) throw new NotGenerated(`no network \`${act.within}\``);
        const directed = act.kind === 'disconnect' ? true : (act.directed ?? true);
        const destination =
          act.kind === 'disconnect'
            ? code`undefined`
            : this.#agentOf(scope, (act as Extract<FlowAct, { destination: ActId }>).destination);
        return code`H.link(${string(act.kind)}, ${this.#agentOf(scope, act.selected)}, ${this.#space(network)}, ${boolean(directed)}, S, () => ${destination});\n${after()}`;
      }
      case 'cause': {
        const agent = this.#local('C');
        return code`{
const ${agent} = ${this.#agentOf(scope, act.selected)};
S.trigger(${string(`\`${node.id}\``)}, () => B.run(${string(act.result)}, ${agent}, S));
${after()}}
`;
      }
      case 'method': {
        const runner = this.behaviour.methodRunner(node);
        const agent =
          act.selected !== undefined
            ? this.#agentOf(scope, act.selected)
            : this.#rootOf(scope).agent;
        const call = runner
          ? code`${this.emitter.constant(runner, 'p', node.id)}(${agent}, S, R);\n`
          : code``;
        return code`${call}${after()}`;
      }
      default:
        // Builders: the spaces are made before the build acts run.
        return after();
    }
  }
}

/** The text of generated code, for tests. */
export { textOf };
