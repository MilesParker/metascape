// SPDX-License-Identifier: EPL-2.0
//
// Translates models written in the MetaABM metamodel (`.metaabm` files, EMF
// XMI) of the Eclipse Agent Modeling Platform into the Metascape model format
// (../metamodel/types.ts). The mapping and every decision it makes are in
// docs/metamodel-review.md; the translation is mechanical wherever the two
// metamodels correspond, and reports a diagnostic, with the XMI path of the
// element, for everything it drops, defaults or cannot translate.
import type {
  Act,
  ActId,
  Agent,
  Attribute,
  AttributeRef,
  AttributeType,
  BorderRule,
  Input,
  LiteralValue,
  Model,
  Named,
  Neighborhood,
  RootGroup,
  Scape,
  ShapeType,
  Space,
  Style,
  Value,
} from '../metamodel/types';
import { MODEL_SCHEMA_VERSION } from '../metamodel/types';
import { pathOf, resolveReference, splitReferences, type Resolved } from './xmi';
import { parseXml, XmlError, type XNode } from './xml';

/** What a diagnostic is about. */
export type TranslationKind =
  /** Something in the XMI that the format does not have, so it was left out. */
  | 'dropped'
  /** Something the XMI leaves out, which the format needs written out. */
  | 'defaulted'
  /** Something the format keeps in another place than the XMI does. */
  | 'moved'
  /** Something the format has but this translation cannot carry over (yet). */
  | 'unsupported'
  /** Something that is wrong in the XMI. */
  | 'invalid';

/**
 * Something the translation did or could not do. `note`: information was
 * dropped or defaulted as the review document decides. `warning`: worth a
 * look. `error`: the part concerned is not in the result (or, when the model
 * itself is missing, nothing is).
 */
export interface TranslationDiagnostic {
  /** The path in the XMI, in EMF style: `//@agents[ID='bug']/@rootActivity/@members[ID='bugRule']`. */
  path: string;
  severity: 'note' | 'warning' | 'error';
  kind: TranslationKind;
  message: string;
}

export interface Translation {
  /** The translated model. Missing if the model cannot be translated (see the diagnostics). */
  model: Model | undefined;
  diagnostics: TranslationDiagnostic[];
}

/**
 * Translates the text of a `.metaabm` file. Never throws for a problem in the
 * model: that is a diagnostic. The result is not checked; pass the model to
 * `checkModel`.
 */
export function translateMetaabm(text: string): Translation {
  let root: XNode;
  try {
    root = parseXml(text);
  } catch (error) {
    if (!(error instanceof XmlError)) throw error;
    return {
      model: undefined,
      diagnostics: [
        {
          path: '/',
          severity: 'error',
          kind: 'invalid',
          message: `Not well-formed XML: ${error.message}`,
        },
      ],
    };
  }
  return new Translator(root).run();
}

// ───────────────────────────── Helpers ─────────────────────────────

const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The part of a type name after its prefix: `act:ARule` is `ARule`. */
const local = (name: string) => name.slice(name.indexOf(':') + 1);

/** Drops the properties whose value is undefined, keeping the order of the rest. */
function clean<T extends object>(object: { [K in keyof T]: T[K] | undefined }): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

/** The type an element's feature has when the element has no `xsi:type`. */
const DEFAULT_TYPES: Record<string, string> = {
  agents: 'SAgent',
  attributes: 'SAttribute',
  options: 'SStateValue',
  inputs: 'AInput',
  literal: 'ALiteral',
  valueLayers: 'SValueLayer',
};

const ATTRIBUTE_TYPES: Record<string, AttributeType> = {
  BOOLEAN: 'boolean',
  INTEGER: 'integer',
  REAL: 'real',
  SYMBOL: 'symbol',
};

const NEIGHBORHOODS: Record<string, Neighborhood> = {
  EUCLIDIAN: 'euclidean',
  MOORE: 'moore',
  VON_NEUMANN: 'vonNeumann',
};

const SHAPES: Record<string, ShapeType> = { POINT: 'point', LINE: 'line', POLYGON: 'polygon' };

/** The attributes of the core library that models use as values. */
const CORE_CONSTANTS: Record<string, LiteralValue> = { true: true, false: false, zero: 0, unit: 1 };

/** The types of root act: the sources of flows. */
const ROOT_TYPES = new Set([
  'ARule',
  'ASchedule',
  'ABuild',
  'AInitialize',
  'AWatch',
  'ADerive',
  'ADiffuse',
  'APerform',
]);

/** The attributes that tell what an element is, not what it says. */
const STRUCTURAL_ATTRIBUTES = /^(ID|xsi:type|xmi:|xmlns)/;

/** Reads an element's attributes and children, remembering which it has read so the rest can be reported. */
class Reader {
  private readonly usedAttributes = new Set<string>();
  private readonly usedChildren = new Set<string>();

  constructor(
    readonly node: XNode,
    private readonly translator: Translator,
  ) {}

  attr(name: string): string | undefined {
    this.usedAttributes.add(name);
    return this.node.attrs[name];
  }

  children(tag: string): XNode[] {
    this.usedChildren.add(tag);
    return this.node.children.filter((child) => child.tag === tag);
  }

  /** A boolean attribute, which XMI leaves out when it has its default. */
  flag(name: string): boolean | undefined {
    const text = this.attr(name);
    if (text === undefined) return undefined;
    if (text === 'true') return true;
    if (text === 'false') return false;
    this.translator.report(
      this.node,
      'error',
      'invalid',
      `${name} is \`${text}\`, not true or false.`,
      name,
    );
    return undefined;
  }

  integer(name: string): number | undefined {
    const text = this.attr(name);
    if (text === undefined) return undefined;
    if (/^[-+]?\d+$/.test(text)) return Number(text);
    this.translator.report(
      this.node,
      'error',
      'invalid',
      `${name} is \`${text}\`, not an integer.`,
      name,
    );
    return undefined;
  }

  /** Reports whatever was not read: the translation does not know it. */
  finish(): void {
    for (const name of Object.keys(this.node.attrs)) {
      if (!this.usedAttributes.has(name) && !STRUCTURAL_ATTRIBUTES.test(name)) {
        this.translator.report(
          this.node,
          'warning',
          'dropped',
          `The attribute ${name} is not translated.`,
          name,
        );
      }
    }
    for (const child of this.node.children) {
      if (!this.usedChildren.has(child.tag)) {
        this.translator.report(
          child,
          'warning',
          'dropped',
          `The element ${child.tag} is not translated.`,
        );
      }
    }
  }
}

// ──────────────────────────── Translator ────────────────────────────

class Translator {
  readonly diagnostics: TranslationDiagnostic[] = [];
  /** The IDs of the acts of each agent or style, which are unique across its groups. */
  private readonly actIds = new Map<XNode, Set<string>>();
  /** Attributes with no type that are set to `true` or `false`, so that they are booleans. */
  private readonly booleans = new Set<XNode>();
  /** The agent or style an act belongs to, where that is not the one whose group holds it. */
  private readonly home = new Map<XNode, XNode>();
  /** The acts that belong to an agent or style but are held by another's group. */
  private readonly movedIn = new Map<XNode, XNode[]>();
  /** Every translated act, for the check of `sources` against `targets`. */
  private readonly acts: { node: XNode; targets: XNode[]; sources: XNode[] }[] = [];

  constructor(private readonly root: XNode) {}

  report(
    node: XNode,
    severity: TranslationDiagnostic['severity'],
    kind: TranslationKind,
    message: string,
    attribute?: string,
  ): void {
    const path = pathOf(node);
    this.diagnostics.push({
      path: attribute === undefined ? path : `${path === '/' ? '' : path}/@${attribute}`,
      severity,
      kind,
      message,
    });
  }

  run(): Translation {
    if (!this.checkExtensions(this.root))
      return { model: undefined, diagnostics: this.diagnostics };
    if (local(this.root.tag) !== 'SContext') {
      this.report(
        this.root,
        'error',
        'invalid',
        `The root element is ${this.root.tag}, not a context.`,
      );
      return { model: undefined, diagnostics: this.diagnostics };
    }
    this.findBooleans(this.root);
    this.findHomes();
    const model = this.model(this.root);
    this.checkLinks();
    return { model, diagnostics: this.diagnostics };
  }

  /**
   * Finds what the translation does not carry over at all: extensions (the
   * system dynamics model of SIR is one). A model that uses one is not
   * translated, rather than translated in part.
   */
  private checkExtensions(node: XNode): boolean {
    let clean = true;
    const prefixes = new Map<string, string>();
    for (const [name, value] of Object.entries(this.root.attrs)) {
      if (name.startsWith('xmlns:')) prefixes.set(name.slice('xmlns:'.length), value);
    }
    const visit = (n: XNode) => {
      const type = n.attrs['xsi:type'];
      const prefix = type?.includes(':') ? type.slice(0, type.indexOf(':')) : undefined;
      const namespace = prefix === undefined ? undefined : prefixes.get(prefix);
      const foreign = namespace !== undefined && !namespace.startsWith('http://metaabm.org/');
      if (n.tag === 'children' || foreign) {
        clean = false;
        this.report(
          n,
          'error',
          'unsupported',
          type === undefined
            ? `An extension (${n.tag}) of the model: extensions are not translated.`
            : `An extension of the model, \`${type}\`, from the ${namespace ?? prefix} metamodel. The system dynamics extension is not ported, so the model is not translated.`,
        );
      }
      if (!(n.tag === 'children' || foreign)) n.children.forEach(visit);
    };
    visit(node);
    return clean;
  }

  /**
   * Finds the attributes that are set to `true` or `false` by a set act. The
   * older models (the AMF test models) leave out the type of a boolean
   * attribute, because when they were saved the default type was boolean; now
   * it is integer, and an integer can't be set to `true`.
   */
  private findBooleans(node: XNode): void {
    if (this.type(node) === 'ASet' && node.tag === 'members') {
      const parameter =
        node.attrs['parameter'] ?? node.children.find((c) => c.tag === 'parameter')?.attrs['href'];
      const attribute = node.attrs['attribute'];
      const constant =
        parameter && /core_library\.metaabm#\/\/@attributes\[ID='(true|false)'\]$/.test(parameter);
      const target = attribute === undefined ? undefined : resolveReference(this.root, attribute);
      if (constant && target?.kind === 'local' && target.node.attrs['sType'] === undefined) {
        this.booleans.add(target.node);
      }
    }
    node.children.forEach((child) => this.findBooleans(child));
  }

  /**
   * Finds the acts held by the group of one agent that belong to another. A
   * flow starts at a root act and every act on it works on the root's agent,
   * but MetaABM lets the editor keep such an act in any agent's group (the
   * AMF movement test does). The format keeps an act with the agent of the
   * root its flow starts at.
   */
  private findHomes(): void {
    const isRoot = (n: XNode) => ROOT_TYPES.has(this.type(n));
    const claimed = new Map<XNode, XNode>();
    const conflicts = new Set<XNode>();
    const acts: XNode[] = [];
    const collect = (n: XNode) => {
      if (n.tag === 'members') acts.push(n);
      n.children.forEach(collect);
    };
    collect(this.root);
    for (const start of acts.filter(isRoot)) {
      const owner = this.ownerOf(start);
      const queue = [start];
      const seen = new Set<XNode>([start]);
      while (queue.length > 0) {
        const act = queue.shift()!;
        for (const reference of splitReferences(act.attrs['targets'])) {
          const resolved = resolveReference(this.root, reference);
          if (resolved.kind !== 'local' || seen.has(resolved.node)) continue;
          seen.add(resolved.node);
          queue.push(resolved.node);
          const earlier = claimed.get(resolved.node);
          if (earlier !== undefined && earlier !== owner) conflicts.add(resolved.node);
          else claimed.set(resolved.node, owner);
        }
      }
    }
    for (const act of acts) {
      const owner = claimed.get(act);
      if (owner === undefined || owner === this.ownerOf(act) || isRoot(act)) continue;
      if (conflicts.has(act)) {
        this.report(
          act,
          'error',
          'invalid',
          'The act is on flows that start in different agents, so it has no agent of its own.',
        );
        continue;
      }
      this.home.set(act, owner);
      let list = this.movedIn.get(owner);
      if (!list) this.movedIn.set(owner, (list = []));
      list.push(act);
      this.report(
        act,
        'note',
        'moved',
        `The act is held by the group of another agent, but its flow starts at a root of ${owner.attrs['ID'] ?? 'the model'}. It is an act of that agent.`,
      );
    }
  }

  /** The agent or style an act belongs to. */
  private homeOf(node: XNode): XNode {
    for (let n: XNode | undefined = node; n; n = n.parent) {
      const home = this.home.get(n);
      if (home) return home;
      if (n.tag === 'members') break;
    }
    return this.ownerOf(node);
  }

  // ───────────────────────────── IDs ─────────────────────────────

  /** The ID of an element, which must fit the format. */
  private id(node: XNode): string | undefined {
    const id = node.attrs['ID'];
    if (id === undefined) {
      this.report(node, 'error', 'invalid', `The element has no ID.`);
      return undefined;
    }
    if (!ID_PATTERN.test(id)) {
      this.report(
        node,
        'error',
        'invalid',
        `The ID \`${id}\` is not a letter or underscore followed by letters, digits and underscores.`,
        'ID',
      );
      return undefined;
    }
    return id;
  }

  private named(reader: Reader): Named {
    return clean<Named>({
      label: reader.attr('label'),
      pluralLabel: reader.attr('pluralLabel'),
      description: reader.attr('description'),
    });
  }

  private type(node: XNode): string {
    const explicit = node.attrs['xsi:type'];
    if (explicit !== undefined) return local(explicit);
    return DEFAULT_TYPES[node.tag] ?? local(node.tag);
  }

  /** Adds an element to a record by its ID, reporting an ID already taken. */
  private put<T>(record: Record<string, T>, node: XNode, value: T | undefined): void {
    const id = this.id(node);
    if (id === undefined || value === undefined) return;
    if (id in record) {
      this.report(node, 'error', 'invalid', `The ID \`${id}\` is used twice among siblings.`, 'ID');
      return;
    }
    record[id] = value;
  }

  // ───────────────────────── References ─────────────────────────

  private resolve(node: XNode, attribute: string, text: string): Resolved {
    const resolved = resolveReference(this.root, text);
    if (resolved.kind === 'missing') {
      this.report(
        node,
        'error',
        'invalid',
        `The reference \`${text}\` does not resolve.`,
        attribute,
      );
    }
    return resolved;
  }

  /** A reference that is an attribute of the element, or, for a core library constant, a child with an `href`. */
  private referenceOf(reader: Reader, name: string): string | undefined {
    const text = reader.attr(name);
    if (text !== undefined) return text;
    const child = reader.children(name)[0];
    return child?.attrs['href'];
  }

  /** The element a local reference points at, if it is one of the given tags. */
  private local(node: XNode, attribute: string, text: string, tags: string[]): XNode | undefined {
    const resolved = this.resolve(node, attribute, text);
    if (resolved.kind === 'external') {
      this.report(
        node,
        'error',
        'unsupported',
        `The reference \`${text}\` leads outside the model.`,
        attribute,
      );
      return undefined;
    }
    if (resolved.kind !== 'local') return undefined;
    const target = resolved.node;
    if (!tags.includes(target.tag) && !(target === this.root && tags.includes('root'))) {
      this.report(
        node,
        'error',
        'invalid',
        `The reference \`${text}\` is to a ${target.tag}, not to ${tags.join(' or ')}.`,
        attribute,
      );
      return undefined;
    }
    return target;
  }

  /** The agent or scape a reference points at. */
  private agentId(node: XNode, attribute: string, text: string): string | undefined {
    const target = this.local(node, attribute, text, ['agents', 'root']);
    return target && this.id(target);
  }

  private spaceId(node: XNode, attribute: string, text: string): string | undefined {
    const target = this.local(node, attribute, text, ['projections']);
    return target && this.id(target);
  }

  private agentIds(node: XNode, attribute: string, text: string | undefined): string[] | undefined {
    if (text === undefined) return undefined;
    return splitReferences(text)
      .map((reference) => this.agentId(node, attribute, reference))
      .filter((id): id is string => id !== undefined);
  }

  /** The agent, style or root scape whose acts these are. */
  private ownerOf(node: XNode): XNode {
    let n = node;
    while (n.parent && n.tag !== 'agents' && n.tag !== 'styles') n = n.parent;
    return n;
  }

  /** The act a reference points at, which must be an act of the same agent or style. */
  private actNode(node: XNode, attribute: string, text: string): XNode | undefined {
    const target = this.local(node, attribute, text, ['members']);
    if (!target) return undefined;
    if (this.homeOf(target) !== this.homeOf(node)) {
      this.report(
        node,
        'error',
        'invalid',
        `The reference \`${text}\` is to an act of another agent. Acts refer to acts of their own agent.`,
        attribute,
      );
      return undefined;
    }
    return target;
  }

  private actId(node: XNode, attribute: string, text: string | undefined): ActId | undefined {
    if (text === undefined) return undefined;
    const target = this.actNode(node, attribute, text);
    return target && this.id(target);
  }

  private actTargets(node: XNode, attribute: string, text: string | undefined): XNode[] {
    return splitReferences(text)
      .map((reference) => this.actNode(node, attribute, reference))
      .filter((target): target is XNode => target !== undefined);
  }

  private attributeNode(node: XNode, attribute: string, text: string): XNode | undefined {
    const target = this.local(node, attribute, text, ['attributes']);
    if (!target) return undefined;
    if (this.type(target) === 'SAttributeArray') {
      this.report(
        node,
        'error',
        'unsupported',
        `The reference \`${text}\` is to an array attribute. The format has no arrays.`,
        attribute,
      );
      return undefined;
    }
    return target;
  }

  /** An attribute, written `owner.attribute`. */
  private attributeRef(
    node: XNode,
    attribute: string,
    text: string | undefined,
  ): AttributeRef | undefined {
    if (text === undefined) return undefined;
    const target = this.attributeNode(node, attribute, text);
    return target && this.attributeRefOf(node, attribute, target);
  }

  private attributeRefOf(at: XNode, attribute: string, target: XNode): AttributeRef | undefined {
    const owner = target.parent;
    if (!owner || (!['agents', 'projections'].includes(owner.tag) && owner !== this.root)) {
      this.report(
        at,
        'error',
        'unsupported',
        `The attribute belongs to ${owner?.tag ?? 'nothing'}, which has no attributes in the format.`,
        attribute,
      );
      return undefined;
    }
    const ownerId = this.id(owner);
    const attributeId = this.id(target);
    return ownerId === undefined || attributeId === undefined
      ? undefined
      : `${ownerId}.${attributeId}`;
  }

  private attributeRefs(
    node: XNode,
    attribute: string,
    text: string | undefined,
  ): AttributeRef[] | undefined {
    if (text === undefined) return undefined;
    return splitReferences(text)
      .map((reference) => this.attributeRef(node, attribute, reference))
      .filter((ref): ref is AttributeRef => ref !== undefined);
  }

  // ───────────────────────────── Model ─────────────────────────────

  private model(node: XNode): Model | undefined {
    const reader = new Reader(node, this);
    const id = this.id(node);
    const named = this.named(reader);
    const content = this.scapeContent(reader);
    reader.finish();
    if (id === undefined) return undefined;
    return clean<Model>({
      schemaVersion: MODEL_SCHEMA_VERSION,
      id,
      ...named,
      language: 'typescript',
      ...content,
    });
  }

  /** What every agent has: attributes, acts and styles. */
  private agentContent(reader: Reader) {
    this.dropImplementation(reader);
    const attributes = this.attributes(reader.children('attributes'));
    const group = reader.children('rootActivity')[0];
    const styles: Record<string, Style> = {};
    for (const style of reader.children('styles')) this.put(styles, style, this.style(style));
    return {
      attributes: attributes,
      acts: group && this.rootGroup(group),
      styles: Object.keys(styles).length > 0 ? styles : undefined,
    };
  }

  /** What every scape has besides what an agent has. */
  private scapeContent(reader: Reader) {
    const agentContent = this.agentContent(reader);
    const agents: Record<string, Agent | Scape> = {};
    for (const child of reader.children('agents')) this.put(agents, child, this.agent(child));
    const spaces: Record<string, Space> = {};
    for (const child of reader.children('projections')) this.put(spaces, child, this.space(child));
    const valueLayers: Record<string, Named> = {};
    for (const child of reader.children('valueLayers')) {
      const layer = new Reader(child, this);
      this.put(valueLayers, child, this.named(layer));
      layer.finish();
    }
    for (const library of reader.children('library')) {
      this.report(
        library,
        'warning',
        'dropped',
        'A library of functions in a model is not translated.',
      );
    }
    return {
      ...agentContent,
      agents: Object.keys(agents).length > 0 ? agents : undefined,
      spaces: Object.keys(spaces).length > 0 ? spaces : undefined,
      valueLayers: Object.keys(valueLayers).length > 0 ? valueLayers : undefined,
    };
  }

  /** The Java class, package and paths of an element are for code generation, which the format leaves out. */
  private dropImplementation(reader: Reader): void {
    for (const implementation of reader.children('implementation')) {
      this.report(
        implementation,
        'note',
        'dropped',
        'The implementation (Java class and paths) is for code generation and is not translated.',
      );
    }
  }

  private agent(node: XNode): Agent | Scape | undefined {
    const reader = new Reader(node, this);
    const named = this.named(reader);
    const type = this.type(node);
    let result: Agent | Scape;
    if (type === 'SContext') {
      result = clean<Scape>({ kind: 'scape', ...named, ...this.scapeContent(reader) });
    } else {
      result = clean<Agent>({ kind: 'agent', ...named, ...this.agentContent(reader) });
    }
    reader.finish();
    return result;
  }

  // ─────────────────────────── Attributes ───────────────────────────

  private attributes(nodes: XNode[]): Record<string, Attribute> | undefined {
    const record: Record<string, Attribute> = {};
    for (const node of nodes) this.put(record, node, this.attribute(node));
    return Object.keys(record).length > 0 ? record : undefined;
  }

  private attribute(node: XNode): Attribute | undefined {
    const reader = new Reader(node, this);
    const type = this.type(node);
    const named = this.named(reader);
    if (type === 'SAttributeArray') {
      reader.attr('sType');
      reader.attr('size');
      reader.attr('defaultValue');
      const automatic = node.parent?.tag === 'projections' && node.attrs['ID'] === 'dimensions';
      this.report(
        node,
        automatic ? 'note' : 'warning',
        automatic ? 'dropped' : 'unsupported',
        automatic
          ? 'The automatic Dimensions array of a space is not translated: the space lists its size attributes as dimensions.'
          : 'The format has no array attributes, so this one is not translated.',
      );
      reader.finish();
      return undefined;
    }
    const gatherData = reader.flag('gatherData');
    const units = reader.attr('units');
    const immutable = reader.flag('immutable');
    const derived = reader.flag('derived');
    const common = {
      ...named,
      gatherData,
      units: units === '' ? undefined : units,
      immutable,
      derived,
    };
    const typeText = reader.attr('sType');
    const defaultText = reader.attr('defaultValue');
    let valueType = typeText === undefined ? 'integer' : ATTRIBUTE_TYPES[typeText];
    if (typeText === undefined && type !== 'SState') {
      if (defaultText === 'true' || defaultText === 'false') {
        valueType = 'boolean';
        this.report(
          node,
          'note',
          'defaulted',
          `No type is given. It is boolean, since its default is ${defaultText}.`,
          'sType',
        );
      } else if (this.booleans.has(node)) {
        valueType = 'boolean';
        this.report(
          node,
          'note',
          'defaulted',
          'No type is given. It is boolean, since it is set to true or false.',
          'sType',
        );
      } else {
        this.report(
          node,
          'note',
          'defaulted',
          'No type is given, so it is the default, integer.',
          'sType',
        );
      }
    }
    if (valueType === undefined) {
      this.report(
        node,
        'error',
        'invalid',
        `The type \`${typeText}\` is only for the arguments of functions: an attribute is boolean, integer, real or symbol.`,
        'sType',
      );
      valueType = 'integer';
    }
    if (type === 'SState') {
      const options: Record<string, Named> = {};
      for (const option of reader.children('options')) {
        const optionReader = new Reader(option, this);
        this.put(options, option, this.named(optionReader));
        optionReader.finish();
      }
      const optionRef = reader.attr('defaultOption');
      let defaultOption: string | undefined;
      if (optionRef !== undefined) {
        const target = this.local(node, 'defaultOption', optionRef, ['options']);
        if (target?.parent !== node && target !== undefined) {
          this.report(
            node,
            'error',
            'invalid',
            'The default option is not an option of this attribute.',
            'defaultOption',
          );
        } else if (target) {
          defaultOption = this.id(target);
          if (defaultText !== undefined && target.attrs['label'] !== defaultText) {
            this.report(
              node,
              'warning',
              'dropped',
              `The default value \`${defaultText}\` differs from the label of the default option, \`${target.attrs['label'] ?? ''}\`. The format keeps the option.`,
              'defaultValue',
            );
          }
        }
      }
      reader.finish();
      return clean<Attribute>({ type: 'state', ...common, options, defaultOption });
    }
    reader.finish();
    return clean<Attribute>({
      type: valueType,
      ...common,
      default: this.defaultValue(node, valueType, defaultText),
    });
  }

  /** The default of an attribute, which XMI stores as a string, as a literal of the attribute's type. */
  private defaultValue(
    node: XNode,
    type: AttributeType,
    text: string | undefined,
  ): LiteralValue | undefined {
    if (text === undefined || text === '') return undefined;
    const invalid = () => {
      this.report(
        node,
        'error',
        'invalid',
        `The default \`${text}\` is not a ${type}.`,
        'defaultValue',
      );
      return undefined;
    };
    switch (type) {
      case 'boolean':
        return text === 'true' ? true : text === 'false' ? false : invalid();
      case 'integer':
        return /^[-+]?\d+$/.test(text) ? Number(text) : invalid();
      case 'real':
        return text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : invalid();
      case 'symbol':
        return text;
    }
  }

  // ───────────────────────────── Spaces ─────────────────────────────

  /** The attributes of a space that hold its sizes, in order. */
  private static readonly SIZE_ATTRIBUTES = ['width', 'height', 'depth'];

  private space(node: XNode): Space | undefined {
    const reader = new Reader(node, this);
    const type = this.type(node);
    const named = this.named(reader);
    const attributes = this.attributes(reader.children('attributes'));
    this.dropImplementation(reader);
    const directed = reader.flag('directed');
    const base = { ...named };
    if (type === 'SNetwork') {
      reader.finish();
      return clean<Space>({ kind: 'network', ...base, attributes, directed });
    }
    if (type === 'SGeography') {
      reader.finish();
      return clean<Space>({ kind: 'geography', ...base, attributes });
    }
    if (type !== 'SGrid' && type !== 'SContinuousSpace') {
      this.report(node, 'error', 'unsupported', `The space type ${type} is not known.`);
      reader.finish();
      return undefined;
    }
    const dimensionality = reader.integer('dimensionality') ?? 0;
    const dimensions = node.children
      .filter((c) => c.tag === 'attributes' && this.type(c) !== 'SAttributeArray')
      .map((c) => c.attrs['ID'])
      .filter((id): id is string => id !== undefined && Translator.SIZE_ATTRIBUTES.includes(id))
      .sort(
        (a, b) => Translator.SIZE_ATTRIBUTES.indexOf(a) - Translator.SIZE_ATTRIBUTES.indexOf(b),
      );
    if (dimensions.length !== dimensionality) {
      this.report(
        node,
        'warning',
        'invalid',
        `The space has ${dimensionality} dimensions but ${dimensions.length} size attributes (${Translator.SIZE_ATTRIBUTES.join(', ')}).`,
        'dimensionality',
      );
    }
    const borderText = reader.attr('borderRule');
    let borderRule: BorderRule | undefined;
    if (borderText === 'PERIODIC') borderRule = 'periodic';
    else if (borderText === 'STICKY') borderRule = 'sticky';
    else if (borderText === 'STRICT' || borderText === 'BOUNCY') {
      borderRule = 'sticky';
      this.report(
        node,
        'note',
        'dropped',
        `The border rule ${borderText} is only in Repast. The space is sticky.`,
        'borderRule',
      );
    } else if (borderText !== undefined) {
      this.report(
        node,
        'error',
        'invalid',
        `The border rule \`${borderText}\` is not known.`,
        'borderRule',
      );
    }
    if (type === 'SContinuousSpace') {
      reader.finish();
      return clean<Space>({ kind: 'continuous', ...base, attributes, dimensions, borderRule });
    }
    const neighborhoodText = reader.attr('neighborhood');
    let neighborhood: Neighborhood = 'euclidean';
    if (neighborhoodText === undefined) {
      this.report(
        node,
        'note',
        'defaulted',
        'No neighborhood is given, so it is the default, Euclidean.',
        'neighborhood',
      );
    } else if (NEIGHBORHOODS[neighborhoodText] !== undefined) {
      neighborhood = NEIGHBORHOODS[neighborhoodText];
    } else {
      this.report(
        node,
        'error',
        'invalid',
        `The neighborhood \`${neighborhoodText}\` is not known.`,
        'neighborhood',
      );
    }
    const multiOccupant = reader.flag('multiOccupant');
    reader.finish();
    return clean<Space>({
      kind: 'grid',
      ...base,
      borderRule,
      neighborhood,
      multiOccupant,
      dimensions,
      attributes,
    });
  }

  // ───────────────────────────── Styles ─────────────────────────────

  private style(node: XNode): Style | undefined {
    const reader = new Reader(node, this);
    const type = this.type(node);
    const named = this.named(reader);
    this.dropImplementation(reader);
    const group = reader.children('rootActivity')[0];
    const acts = group && this.rootGroup(group);
    for (const attribute of reader.children('attributes')) {
      this.report(
        attribute,
        'warning',
        'dropped',
        'The attributes of a style are not translated: the format gives styles none.',
      );
    }
    let result: Style | undefined;
    if (type === 'SStyle2D') result = clean<Style>({ kind: '2d', ...named, acts });
    else if (type === 'SStyle3D') result = clean<Style>({ kind: '3d', ...named, acts });
    else if (type === 'SStyleShape') {
      const text = reader.attr('shape') ?? 'POINT';
      const shape = SHAPES[text];
      if (shape === undefined)
        this.report(node, 'error', 'invalid', `The shape \`${text}\` is not known.`, 'shape');
      result = clean<Style>({ kind: 'shape', ...named, shape: shape ?? 'point', acts });
    } else this.report(node, 'error', 'unsupported', `The style type ${type} is not known.`);
    reader.finish();
    return result;
  }

  // ─────────────────────────────── Acts ───────────────────────────────

  private rootGroup(node: XNode): RootGroup | undefined {
    const reader = new Reader(node, this);
    if (this.type(node) !== 'AGroup') {
      this.report(
        node,
        'error',
        'invalid',
        `The container of acts is a ${this.type(node)}, not a group.`,
      );
      return undefined;
    }
    const id = this.id(node);
    const named = this.named(reader);
    const members = this.members(reader, node);
    reader.finish();
    return id === undefined ? undefined : { id, ...named, members };
  }

  private members(reader: Reader, group: XNode): Record<string, Act> {
    const members: Record<string, Act> = {};
    const owner = this.ownerOf(group);
    let ids = this.actIds.get(owner);
    if (!ids) this.actIds.set(owner, (ids = new Set()));
    const add = (member: XNode) => {
      const id = this.id(member);
      if (id !== undefined && ids.has(id)) {
        this.report(
          member,
          'error',
          'invalid',
          `The act ID \`${id}\` is used twice in this agent. Acts refer to each other by ID alone.`,
          'ID',
        );
        return;
      }
      if (id !== undefined) ids.add(id);
      this.put(members, member, this.act(member));
    };
    for (const member of reader.children('members')) {
      if (!this.home.has(member)) add(member);
    }
    if (group.parent === owner) this.movedIn.get(owner)?.forEach(add);
    return members;
  }

  private act(node: XNode): Act | undefined {
    const reader = new Reader(node, this);
    const type = this.type(node);
    const named = this.named(reader);
    const sources = reader.attr('sources');
    const targetText = reader.attr('targets');
    const targetNodes = this.actTargets(node, 'targets', targetText);
    const targetIds = targetNodes
      .map((t) => this.id(t))
      .filter((id): id is string => id !== undefined);
    const targets = targetIds.length > 0 ? targetIds : undefined;
    this.acts.push({
      node,
      targets: targetNodes,
      sources: this.actTargets(node, 'sources', sources),
    });
    const result = this.actOfType(type, reader, node, named, targets);
    reader.finish();
    return result;
  }

  /** The selection an act works within, which every act but a root names. */
  private selected(reader: Reader, node: XNode): ActId | undefined {
    const text = reader.attr('selected');
    if (text === undefined) {
      this.report(
        node,
        'error',
        'invalid',
        'The act selects nothing: it has no selected.',
        'selected',
      );
      return undefined;
    }
    return this.actId(node, 'selected', text);
  }

  private actOfType(
    type: string,
    reader: Reader,
    node: XNode,
    named: Named,
    targets: ActId[] | undefined,
  ): Act | undefined {
    switch (type) {
      case 'AGroup': {
        const members = this.members(reader, node);
        return clean<Act>({ kind: 'group', ...named, members });
      }
      case 'ARule':
        return clean<Act>({ kind: 'rule', ...named, ...this.rootFields(reader, node), targets });
      case 'ABuild':
        return clean<Act>({ kind: 'build', ...named, ...this.rootFields(reader, node), targets });
      case 'AInitialize':
        return clean<Act>({
          kind: 'initialize',
          ...named,
          ...this.rootFields(reader, node),
          targets,
        });
      case 'APerform':
        return clean<Act>({ kind: 'perform', ...named, ...this.rootFields(reader, node), targets });
      case 'ASchedule': {
        const rootProperties = this.rootFields(reader, node);
        return clean<Act>({
          kind: 'schedule',
          ...named,
          ...rootProperties,
          start: reader.integer('start'),
          interval: reader.integer('interval'),
          priority: reader.integer('priority'),
          pick: reader.integer('pick'),
          targets,
        });
      }
      case 'AWatch':
      case 'ADerive': {
        const rootProperties = this.rootFields(reader, node);
        const attribute = this.attributeRef(node, 'attribute', reader.attr('attribute'));
        if (attribute === undefined) return this.missing(node, 'attribute');
        return clean<Act>({
          kind: type === 'AWatch' ? 'watch' : 'derive',
          ...named,
          ...rootProperties,
          attribute,
          targets,
        });
      }
      case 'ADiffuse': {
        const rootProperties = this.rootFields(reader, node);
        const diffused = this.attributeRef(node, 'diffused', reader.attr('diffused'));
        if (diffused === undefined) return this.missing(node, 'diffused');
        return clean<Act>({
          kind: 'diffuse',
          ...named,
          ...rootProperties,
          diffused,
          diffusionRate: this.attributeRef(node, 'diffusionRate', reader.attr('diffusionRate')),
          evaporationRate: this.attributeRef(
            node,
            'evaporationRate',
            reader.attr('evaporationRate'),
          ),
          targets,
        });
      }
      case 'ASelect': {
        const selected = this.selected(reader, node);
        const agent = reader.attr('agent');
        const space = reader.attr('space');
        const cardinality = reader.attr('for');
        if (cardinality !== undefined) this.checkCardinality(node, cardinality);
        return clean<Act>({
          kind: 'select',
          ...named,
          selected,
          agent: agent === undefined ? undefined : this.agentId(node, 'agent', agent),
          space: space === undefined ? undefined : this.spaceId(node, 'space', space),
          targets,
        });
      }
      case 'ACreateAgents':
      case 'ACreateShapedAgents':
      case 'ALoadAgents':
      case 'ALoadShapedAgents': {
        const selected = this.selected(reader, node);
        const agentText = reader.attr('agent');
        const agent = agentText === undefined ? undefined : this.agentId(node, 'agent', agentText);
        if (agent === undefined) return this.missing(node, 'agent');
        const space = reader.attr('space');
        const count = this.referenceOf(reader, 'agentCount');
        const shaped = type.includes('Shaped');
        const shapeText = shaped ? (reader.attr('shape') ?? 'POINT') : undefined;
        const common = {
          ...named,
          selected,
          agent,
          space: space === undefined ? undefined : this.spaceId(node, 'space', space),
          agentCount: count === undefined ? undefined : this.value(node, 'agentCount', count),
        };
        const shape = shapeText === undefined ? undefined : SHAPES[shapeText];
        if (shapeText !== undefined && shape === undefined) {
          this.report(
            node,
            'error',
            'invalid',
            `The shape \`${shapeText}\` is not known.`,
            'shape',
          );
        }
        if (type.startsWith('ALoad')) {
          const sourceURL = reader.attr('sourceURL');
          if (sourceURL === undefined) return this.missing(node, 'sourceURL');
          return clean<Act>({ kind: 'load', ...common, sourceURL, shape, targets });
        }
        return clean<Act>({ kind: 'create', ...common, shape, targets });
      }
      case 'AQuery':
      case 'AEvaluate': {
        const selected = this.selected(reader, node);
        const fn = this.functionId(reader, node);
        if (fn === undefined || selected === undefined) return undefined;
        const inputs = reader.children('inputs').map((input) => this.input(input, node, selected));
        return clean<Act>({
          kind: type === 'AQuery' ? 'query' : 'evaluate',
          ...named,
          selected,
          function: fn,
          inputs: inputs.length > 0 ? inputs.filter((i): i is Input => i !== undefined) : undefined,
          targets,
        });
      }
      case 'AAll':
      case 'AAny':
      case 'ANone': {
        const selected = this.selected(reader, node);
        const kind = type === 'AAll' ? 'all' : type === 'AAny' ? 'any' : 'none';
        return clean<Act>({ kind, ...named, selected, targets });
      }
      case 'ASet': {
        const selected = this.selected(reader, node);
        const attribute = this.attributeRef(node, 'attribute', reader.attr('attribute'));
        const parameterText = this.referenceOf(reader, 'parameter');
        const parameter =
          parameterText === undefined ? undefined : this.value(node, 'parameter', parameterText);
        if (attribute === undefined) return this.missing(node, 'attribute');
        if (parameter === undefined) return this.missing(node, 'parameter');
        return clean<Act>({ kind: 'set', ...named, selected, attribute, parameter, targets });
      }
      case 'AMove': {
        const selected = this.selected(reader, node);
        const destination = this.actId(node, 'destination', reader.attr('destination'));
        if (destination === undefined) return this.missing(node, 'destination');
        return clean<Act>({ kind: 'move', ...named, selected, destination, targets });
      }
      case 'ALeave':
      case 'ADie':
      case 'ADisconnect': {
        const selected = this.selected(reader, node);
        const destination = reader.attr('destination');
        if (destination !== undefined && !this.sameAs(node, destination, reader.attr('selected'))) {
          this.report(
            node,
            'warning',
            'dropped',
            `The destination of ${type === 'ADie' ? 'die' : type === 'ALeave' ? 'leave' : 'disconnect'} differs from the selection of the act. Only move has a destination.`,
            'destination',
          );
        }
        if (type === 'ADisconnect') {
          const within = this.spaceIdOf(reader, node);
          if (within === undefined) return this.missing(node, 'within');
          return clean<Act>({ kind: 'disconnect', ...named, selected, within, targets });
        }
        return clean<Act>({ kind: type === 'ADie' ? 'die' : 'leave', ...named, selected, targets });
      }
      case 'AConnect':
      case 'AReplace': {
        const selected = this.selected(reader, node);
        const destination = this.actId(node, 'destination', reader.attr('destination'));
        const within = this.spaceIdOf(reader, node);
        const directed = reader.flag('directed');
        if (destination === undefined) return this.missing(node, 'destination');
        if (within === undefined) return this.missing(node, 'within');
        return clean<Act>({
          kind: type === 'AConnect' ? 'connect' : 'replace',
          ...named,
          selected,
          destination,
          within,
          directed,
          targets,
        });
      }
      case 'ACause': {
        const selected = this.selected(reader, node);
        const result = this.actId(node, 'result', reader.attr('result'));
        if (result === undefined) return this.missing(node, 'result');
        return clean<Act>({ kind: 'cause', ...named, selected, result, targets });
      }
      case 'AMethod':
        return this.method(reader, node, named, targets);
      case 'ABuildGrid':
      case 'ABuildSpace':
      case 'ABuildNetwork':
      case 'ABuildGeography': {
        const selected = this.selected(reader, node);
        const space = this.spaceIdOf(reader, node, 'projection');
        if (space === undefined) return this.missing(node, 'projection');
        const agents = this.agentIds(node, 'agents', reader.attr('agents'));
        const attributes = this.attributeRefs(node, 'attributes', reader.attr('attributes'));
        for (const name of ['networkType', 'spaceType']) {
          if (reader.attr(name) !== undefined) {
            this.report(
              node,
              'note',
              'dropped',
              `${name} is deprecated and is not translated.`,
              name,
            );
          }
        }
        const common = { ...named, selected, agents, space, attributes };
        if (type === 'ABuildGrid') {
          const fill = reader.attr('fillAgent');
          return clean<Act>({
            kind: 'buildGrid',
            ...common,
            fillAgent: fill === undefined ? undefined : this.agentId(node, 'fillAgent', fill),
            targets,
          });
        }
        const kind =
          type === 'ABuildSpace'
            ? 'buildSpace'
            : type === 'ABuildNetwork'
              ? 'buildNetwork'
              : 'buildGeography';
        return clean<Act>({ kind, ...common, targets });
      }
      default:
        this.report(node, 'error', 'unsupported', `The act type ${type} is not known.`);
        return undefined;
    }
  }

  /** Whether two references point at the same element. */
  private sameAs(node: XNode, a: string, b: string | undefined): boolean {
    if (b === undefined) return false;
    const first = resolveReference(this.root, a);
    const second = resolveReference(this.root, b);
    return first.kind === 'local' && second.kind === 'local' && first.node === second.node;
  }

  private missing(node: XNode, attribute: string): undefined {
    this.report(
      node,
      'error',
      'invalid',
      `The act is left out: it has no usable ${attribute}.`,
      attribute,
    );
    return undefined;
  }

  /** The `within` (or `projection`) of an act that works in a network. */
  private spaceIdOf(reader: Reader, node: XNode, name = 'within'): string | undefined {
    const text = reader.attr(name);
    return text === undefined ? undefined : this.spaceId(node, name, text);
  }

  /**
   * What the root acts have in common: the agent and selection of a root are
   * its own, so they are not stored; the space is.
   */
  private rootFields(reader: Reader, node: XNode): { space: string | undefined } {
    const agentText = reader.attr('agent');
    if (agentText !== undefined) {
      const owner = this.ownerOf(node);
      const expected = owner.tag === 'styles' ? owner.parent : owner;
      const target = this.local(node, 'agent', agentText, ['agents', 'root']);
      if (target !== undefined && target !== expected) {
        this.report(
          node,
          'warning',
          'dropped',
          'The agent of this root act is not the agent that owns it. A root act is of its own agent.',
          'agent',
        );
      }
    }
    const selectedText = reader.attr('selected');
    if (selectedText !== undefined) {
      const target = this.local(node, 'selected', selectedText, ['members']);
      if (target !== undefined && target !== node) {
        this.report(
          node,
          'warning',
          'dropped',
          'The selection of this root act is not the act itself. A root act selects its own agent.',
          'selected',
        );
      }
    }
    const space = reader.attr('space');
    return { space: space === undefined ? undefined : this.spaceId(node, 'space', space) };
  }

  /** A select's `for` is obsolete (R13): the query terms decide how many agents are selected. */
  private checkCardinality(node: XNode, cardinality: string): void {
    const all = this.queriesOn(node).some((q) => q.function === 'all');
    if ((cardinality === 'ALL') !== all) {
      this.report(
        node,
        'warning',
        'dropped',
        `The selection is for ${cardinality}, which disagrees with its query terms (${all ? 'it has an all term' : 'it has no all term'}). The format takes the query terms.`,
        'for',
      );
    } else {
      this.report(
        node,
        'note',
        'dropped',
        '`for` is obsolete: the query terms decide how many agents are selected.',
        'for',
      );
    }
  }

  private queriesOn(select: XNode): { function: string | undefined }[] {
    const owner = this.ownerOf(select);
    const found: { function: string | undefined }[] = [];
    const visit = (n: XNode) => {
      if (this.type(n) === 'AQuery' && n.tag === 'members') {
        const selectedNode = resolveReference(this.root, n.attrs['selected'] ?? '');
        if (selectedNode.kind === 'local' && selectedNode.node === select) {
          found.push({
            function: functionIdOf(n.children.find((c) => c.tag === 'function')?.attrs['href']),
          });
        }
      }
      n.children.forEach(visit);
    };
    visit(owner);
    return found;
  }

  // ───────────────────────────── Methods ─────────────────────────────

  /**
   * A method's body is Java in every model there is. The format's methods are
   * TypeScript, so the Java is kept as a comment, to be ported by hand.
   */
  private method(reader: Reader, node: XNode, named: Named, targets: ActId[] | undefined): Act {
    const selectedText = reader.attr('selected');
    const selected =
      selectedText === undefined ? undefined : this.actId(node, 'selected', selectedText);
    const generate = reader.attr('generate');
    if (generate !== undefined) {
      this.report(
        node,
        'note',
        'dropped',
        '`generate` is for code generation and is not translated.',
        'generate',
      );
    }
    const java = reader.attr('body');
    let body: string | undefined;
    if (java !== undefined && java.trim() !== '') {
      const lines = java.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n');
      body = [
        '// Java, from the original model. Port it to TypeScript by hand.',
        ...lines.map((line) => `// ${line.trim()}`.trimEnd()),
      ].join('\n');
      this.report(
        node,
        'warning',
        'unsupported',
        "The body is Java, and the format's methods are TypeScript. The Java is kept as a comment, to be ported by hand.",
        'body',
      );
    }
    return clean<Act>({ kind: 'method', ...named, selected, body, targets });
  }

  // ─────────────────────── Functions and values ───────────────────────

  private functionId(reader: Reader, node: XNode): string | undefined {
    const child = reader.children('function')[0];
    const href = child?.attrs['href'];
    if (child === undefined || href === undefined) {
      this.report(node, 'error', 'invalid', 'The act has no function.');
      return undefined;
    }
    const id = functionIdOf(href);
    if (id === undefined || !href.includes('core_library.metaabm')) {
      this.report(
        child,
        'error',
        'unsupported',
        `The function \`${href}\` is not in the core library.`,
        'href',
      );
      return undefined;
    }
    return id;
  }

  /** An input of a sink: a value, read from the selection `selected` (default: the sink's own), or a multi-value. */
  private input(node: XNode, sink: XNode, sinkSelected: ActId): Input | undefined {
    const reader = new Reader(node, this);
    const selectedText = reader.attr('selected');
    const selected =
      selectedText === undefined ? undefined : this.actId(node, 'selected', selectedText);
    const literals = reader.children('literal');
    const valueText = this.referenceOf(reader, 'value');
    const text = valueText ?? (literals[0] === undefined ? undefined : pathOf(literals[0]));
    reader.finish();
    if (text === undefined) {
      this.report(node, 'error', 'invalid', 'The input has no value.');
      return undefined;
    }
    return this.valueOrMulti(node, 'value', text, { selected, own: sinkSelected }, true);
  }

  /** A value: an attribute, an option, an evaluate or a literal. */
  private value(node: XNode, attribute: string, text: string): Value | undefined {
    return this.valueOrMulti(node, attribute, text, undefined, false) as Value | undefined;
  }

  private valueOrMulti(
    node: XNode,
    attribute: string,
    text: string,
    selection: { selected: ActId | undefined; own: ActId } | undefined,
    allowMulti: boolean,
  ): Input | undefined {
    const resolved = this.resolve(node, attribute, text);
    if (resolved.kind === 'missing') return undefined;
    if (resolved.kind === 'external') {
      const [first, ...rest] = resolved.reference.segments;
      const id = first?.[0] === 'attributes' && rest.length === 0 ? first[1] : undefined;
      if (
        !resolved.reference.file.endsWith('core_library.metaabm') ||
        id === undefined ||
        !(id in CORE_CONSTANTS)
      ) {
        this.report(
          node,
          'error',
          'unsupported',
          `The value \`${text}\` is not one of the core library's constants (true, false, zero, unit).`,
          attribute,
        );
        return undefined;
      }
      const literal = CORE_CONSTANTS[id]!;
      return { literal };
    }
    const target = resolved.node;
    const reportSelection = (what: string) => {
      if (selection?.selected !== undefined && selection.selected !== selection.own) {
        this.report(
          node,
          'note',
          'dropped',
          `The input reads from another selection, which means nothing for ${what}.`,
          'selected',
        );
      }
    };
    switch (target.tag) {
      case 'attributes': {
        const ref = this.attributeRef(node, attribute, text);
        if (ref === undefined) return undefined;
        const selected =
          selection?.selected !== undefined && selection.selected !== selection.own
            ? selection.selected
            : undefined;
        return clean<Value>({ attribute: ref, selected });
      }
      case 'options': {
        reportSelection('an option');
        const attributeNode = target.parent;
        const owner = attributeNode?.parent;
        if (!attributeNode || !owner) return undefined;
        const ids = [owner, attributeNode, target].map((n) => this.id(n));
        if (ids.some((id) => id === undefined)) return undefined;
        return { option: ids.join('.') };
      }
      case 'members': {
        const type = this.type(target);
        if (type !== 'AEvaluate') {
          this.report(
            node,
            'error',
            'invalid',
            `The value is a ${type}, not an evaluate.`,
            attribute,
          );
          return undefined;
        }
        if (this.homeOf(target) !== this.homeOf(node)) {
          this.report(
            node,
            'error',
            'invalid',
            'The value is an evaluate of another agent.',
            attribute,
          );
          return undefined;
        }
        reportSelection('an evaluate');
        const id = this.id(target);
        return id === undefined ? undefined : { evaluate: id };
      }
      case 'literal': {
        reportSelection('a literal');
        return this.literal(target, node, attribute, allowMulti);
      }
      default:
        this.report(
          node,
          'error',
          'invalid',
          `The value is a ${target.tag}, which is not a value.`,
          attribute,
        );
        return undefined;
    }
  }

  private literal(
    literal: XNode,
    at: XNode,
    attribute: string,
    allowMulti: boolean,
  ): Input | undefined {
    const reader = new Reader(literal, this);
    const type = this.type(literal);
    const named = this.named(reader);
    void named;
    if (type === 'AMultiValue') {
      const values = this.attributeRefs(literal, 'values', reader.attr('values')) ?? [];
      reader.finish();
      if (!allowMulti) {
        this.report(
          at,
          'error',
          'invalid',
          'A multi-value is only an input of a function.',
          attribute,
        );
        return undefined;
      }
      return { multiValue: values };
    }
    const text = reader.attr('valueLiteral');
    reader.finish();
    if (text === undefined) {
      this.report(literal, 'error', 'invalid', 'The literal has no value.');
      return undefined;
    }
    return literalOf(text);
  }

  // ───────────────────────────── Links ─────────────────────────────

  /** `sources` is the other side of `targets`; the format keeps only `targets`, so the two must agree. */
  private checkLinks(): void {
    const byNode = new Map(this.acts.map((act) => [act.node, act]));
    for (const act of this.acts) {
      for (const target of act.targets) {
        if (byNode.get(target)?.sources.includes(act.node) === false) {
          this.report(
            act.node,
            'warning',
            'invalid',
            `Its target ${target.attrs['ID']} does not list it as a source.`,
            'targets',
          );
        }
      }
      for (const source of act.sources) {
        if (byNode.get(source)?.targets.includes(act.node) === false) {
          this.report(
            act.node,
            'warning',
            'invalid',
            `Its source ${source.attrs['ID']} does not list it as a target.`,
            'sources',
          );
        }
      }
    }
  }
}

/** The ID of a function from its `href` into the core library. */
function functionIdOf(href: string | undefined): string | undefined {
  return href && /@functions\[ID='([^']*)'\]$/.exec(href)?.[1];
}

/**
 * A literal from its text, typed as the generators type it: `true` and `false`
 * are booleans, whole numbers integers, numbers with a decimal point reals
 * (JSON numbers lose the difference between `1` and `1.0`, so reals say so),
 * and anything else a symbol.
 */
function literalOf(text: string): Value {
  if (text === 'true') return { literal: true };
  if (text === 'false') return { literal: false };
  if (/^[-+]?\d+$/.test(text)) return { literal: Number(text) };
  if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$|^[-+]?\d+[eE][-+]?\d+$/.test(text)) {
    return { literal: Number(text), type: 'real' };
  }
  return { literal: text };
}
