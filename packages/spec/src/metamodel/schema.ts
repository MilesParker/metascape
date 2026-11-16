// SPDX-License-Identifier: EPL-2.0
//
// Zod schemas for the Metascape model format, which is derived from the
// MetaABM metamodel (see ./types.ts for its provenance).
import { z } from 'zod';
import {
  MODEL_SCHEMA_VERSION,
  type Act,
  type Agent,
  type Attribute,
  type AttributeType,
  type BorderRule,
  type Diagnostic,
  type Extension,
  type Input,
  type Library,
  type LibraryFunction,
  type Model,
  type Named,
  type Neighborhood,
  type Prototype,
  type PrototypeType,
  type RootGroup,
  type Scape,
  type ShapeType,
  type Space,
  type StateOption,
  type Style,
  type Value,
  type ValueLayer,
} from './types';

/*
 * Each schema is annotated with the type it validates, so the compiler checks
 * that the schemas and the types in ./types.ts agree.
 */

const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ID_PART = '[A-Za-z_][A-Za-z0-9_]*';

const id = z
  .string()
  .regex(
    ID_PATTERN,
    'An ID starts with a letter or underscore, then letters, digits and underscores',
  );
const attributeRef = z
  .string()
  .regex(
    new RegExp(`^${ID_PART}\\.${ID_PART}$`),
    'An attribute is written owner.attribute, such as bug.energy',
  );
const optionRef = z
  .string()
  .regex(
    new RegExp(`^${ID_PART}\\.${ID_PART}\\.${ID_PART}$`),
    'An option is written owner.attribute.option, such as person.status.infected',
  );

const named = {
  label: z.string().optional(),
  pluralLabel: z.string().optional(),
  description: z.string().optional(),
};
const namedSchema: z.ZodType<Named> = z.strictObject(named);

const attributeType: z.ZodType<AttributeType> = z.enum(['boolean', 'integer', 'real', 'symbol']);
const literalValue = z.union([z.boolean(), z.number(), z.string()]);
const shapeType: z.ZodType<ShapeType> = z.enum(['point', 'line', 'polygon']);

const extension: z.ZodType<Extension> = z.looseObject({ kind: z.string().min(1) });

// ─────────────────────────── Attributes ───────────────────────────

const attributeBase = {
  ...named,
  gatherData: z.boolean().optional(),
  units: z.string().optional(),
  immutable: z.boolean().optional(),
  derived: z.boolean().optional(),
  extensions: z.array(extension).optional(),
};

const stateOption: z.ZodType<StateOption> = namedSchema;

const attribute: z.ZodType<Attribute> = z.discriminatedUnion('type', [
  z.strictObject({
    ...attributeBase,
    type: z.enum(['boolean', 'integer', 'real', 'symbol']),
    default: literalValue.optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.strictObject({
    ...attributeBase,
    type: z.literal('state'),
    options: z.record(id, stateOption).refine((options) => Object.keys(options).length > 0, {
      message: 'A state attribute has at least one option',
    }),
    defaultOption: id.optional(),
  }),
]);
const attributes = z.record(id, attribute).optional();

// ───────────────────────────── Spaces ─────────────────────────────

const borderRule: z.ZodType<BorderRule> = z.enum(['periodic', 'sticky']);
const neighborhood: z.ZodType<Neighborhood> = z.enum(['euclidean', 'moore', 'vonNeumann']);
const dimensional = {
  ...named,
  attributes,
  dimensions: z.array(id).min(1, 'A space has at least one dimension'),
  borderRule: borderRule.optional(),
};

const space: z.ZodType<Space> = z.discriminatedUnion('kind', [
  z.strictObject({ ...dimensional, kind: z.literal('continuous') }),
  z.strictObject({
    ...dimensional,
    kind: z.literal('grid'),
    neighborhood,
    multiOccupant: z.boolean().optional(),
  }),
  z.strictObject({
    ...named,
    attributes,
    kind: z.literal('network'),
    directed: z.boolean().optional(),
  }),
  z.strictObject({ ...named, attributes, kind: z.literal('geography') }),
]);

const valueLayer: z.ZodType<ValueLayer> = namedSchema;

// ───────────────────────────── Values ─────────────────────────────

const value: z.ZodType<Value> = z.union([
  z.strictObject({ attribute: attributeRef, selected: id.optional() }),
  z.strictObject({ option: optionRef }),
  z.strictObject({ evaluate: id }),
  z.strictObject({ literal: literalValue, type: attributeType.optional() }),
]);

const input: z.ZodType<Input> = z.union([
  value,
  z.strictObject({ multiValue: z.array(attributeRef) }),
]);

// ────────────────────────────── Acts ──────────────────────────────

const flow = { ...named, targets: z.array(id).optional() };
const selectedFlow = { ...flow, selected: id };
const root = { ...flow, space: id.optional() };
const buildSpace = {
  ...selectedFlow,
  agents: z.array(id).optional(),
  space: id,
  attributes: z.array(attributeRef).optional(),
};
const sink = { ...selectedFlow, function: id, inputs: z.array(input).optional() };

const act: z.ZodType<Act> = z.discriminatedUnion('kind', [
  z.strictObject({
    ...named,
    kind: z.literal('group'),
    members: z.record(
      id,
      z.lazy(() => act),
    ),
  }),
  z.strictObject({ ...root, kind: z.literal('rule') }),
  z.strictObject({
    ...root,
    kind: z.literal('schedule'),
    start: z.number().optional(),
    interval: z.number().optional(),
    priority: z.number().optional(),
    pick: z.number().optional(),
  }),
  z.strictObject({ ...root, kind: z.literal('build') }),
  z.strictObject({ ...root, kind: z.literal('initialize') }),
  z.strictObject({ ...root, kind: z.literal('watch'), attribute: attributeRef }),
  z.strictObject({ ...root, kind: z.literal('derive'), attribute: attributeRef }),
  z.strictObject({
    ...root,
    kind: z.literal('diffuse'),
    diffused: attributeRef,
    diffusionRate: attributeRef.optional(),
    evaporationRate: attributeRef.optional(),
  }),
  z.strictObject({ ...root, kind: z.literal('perform') }),
  z.strictObject({
    ...selectedFlow,
    kind: z.literal('select'),
    agent: id.optional(),
    space: id.optional(),
  }),
  z.strictObject({
    ...selectedFlow,
    kind: z.literal('create'),
    agent: id,
    space: id.optional(),
    agentCount: value.optional(),
    shape: shapeType.optional(),
  }),
  z.strictObject({
    ...selectedFlow,
    kind: z.literal('load'),
    agent: id,
    space: id.optional(),
    agentCount: value.optional(),
    sourceURL: z.string(),
    shape: shapeType.optional(),
  }),
  z.strictObject({ ...sink, kind: z.literal('query') }),
  z.strictObject({ ...sink, kind: z.literal('evaluate') }),
  z.strictObject({ ...selectedFlow, kind: z.enum(['all', 'any', 'none']) }),
  z.strictObject({
    ...selectedFlow,
    kind: z.literal('set'),
    attribute: attributeRef,
    parameter: value,
  }),
  z.strictObject({ ...selectedFlow, kind: z.literal('move'), destination: id }),
  z.strictObject({ ...selectedFlow, kind: z.literal('leave') }),
  z.strictObject({ ...selectedFlow, kind: z.literal('die') }),
  z.strictObject({
    ...selectedFlow,
    kind: z.literal('connect'),
    destination: id,
    within: id,
    directed: z.boolean().optional(),
  }),
  z.strictObject({ ...selectedFlow, kind: z.literal('disconnect'), within: id }),
  z.strictObject({
    ...selectedFlow,
    kind: z.literal('replace'),
    destination: id,
    within: id,
    directed: z.boolean().optional(),
  }),
  z.strictObject({ ...selectedFlow, kind: z.literal('cause'), result: id }),
  z.strictObject({
    ...flow,
    kind: z.literal('method'),
    selected: id.optional(),
    body: z.string().optional(),
  }),
  z.strictObject({ ...buildSpace, kind: z.literal('buildGrid'), fillAgent: id.optional() }),
  z.strictObject({ ...buildSpace, kind: z.literal('buildSpace') }),
  z.strictObject({ ...buildSpace, kind: z.literal('buildNetwork') }),
  z.strictObject({ ...buildSpace, kind: z.literal('buildGeography') }),
]);

const rootGroup: z.ZodType<RootGroup> = z.strictObject({
  ...named,
  id,
  members: z.record(id, act),
});

// ───────────────────────────── Styles ─────────────────────────────

const styleBase = { ...named, acts: rootGroup.optional() };
const style: z.ZodType<Style> = z.discriminatedUnion('kind', [
  z.strictObject({ ...styleBase, kind: z.literal('2d') }),
  z.strictObject({ ...styleBase, kind: z.literal('3d') }),
  z.strictObject({ ...styleBase, kind: z.literal('shape'), shape: shapeType }),
]);

// ────────────────────────── Agents and scapes ──────────────────────────

const agentBase = {
  ...named,
  attributes,
  acts: rootGroup.optional(),
  styles: z.record(id, style).optional(),
  extensions: z.array(extension).optional(),
};

const scapeBase = {
  ...agentBase,
  agents: z
    .record(
      id,
      z.lazy(() => member),
    )
    .optional(),
  spaces: z.record(id, space).optional(),
  valueLayers: z.record(id, valueLayer).optional(),
};

/** An agent, or a scape within a scape. */
const member: z.ZodType<Agent | Scape> = z.discriminatedUnion('kind', [
  z.strictObject({ ...agentBase, kind: z.literal('agent') }),
  z.strictObject({ ...scapeBase, kind: z.literal('scape') }),
]);

/** Validates the structure of a model. Use {@link parseModel} for friendlier errors. */
export const modelSchema: z.ZodType<Model> = z.strictObject({
  ...scapeBase,
  schemaVersion: z.literal(MODEL_SCHEMA_VERSION),
  id,
  language: z.literal('typescript'),
});

// ──────────────────────────── Functions ────────────────────────────

const prototypeType: z.ZodType<PrototypeType> = z.enum([
  'boolean',
  'integer',
  'real',
  'symbol',
  'numeric',
  'generic',
]);

const prototype: z.ZodType<Prototype> = z.strictObject({
  ...named,
  type: prototypeType,
  optional: z.boolean().optional(),
  multiple: z.boolean().optional(),
});

const functionBase = { ...named, inputs: z.record(id, prototype).optional() };

const libraryFunction: z.ZodType<LibraryFunction> = z.discriminatedUnion('kind', [
  z.strictObject({ ...functionBase, kind: z.literal('operator'), symbol: z.string().optional() }),
  z.strictObject({
    ...functionBase,
    kind: z.literal('logicalOperator'),
    symbol: z.string().optional(),
  }),
  z.strictObject({
    ...functionBase,
    kind: z.literal('genericFunction'),
    output: prototype.optional(),
  }),
  z.strictObject({ ...functionBase, kind: z.literal('genericLogical') }),
]);

/** Validates the structure of a function library. */
export const librarySchema: z.ZodType<Library> = z.strictObject({
  ...named,
  functions: z.record(id, libraryFunction).optional(),
  subs: z
    .record(
      id,
      z.lazy(() => librarySchema),
    )
    .optional(),
});

// ──────────────────────────── Parsing ────────────────────────────

/** Thrown by {@link parseModel} when input does not fit the format. */
export class ModelFormatError extends Error {
  override readonly name = 'ModelFormatError';
  constructor(readonly diagnostics: readonly Diagnostic[]) {
    super(
      `The model has ${diagnostics.length} problem${diagnostics.length === 1 ? '' : 's'}:\n` +
        diagnostics.map((d) => `  ${d.path || '(model)'}: ${d.message}`).join('\n'),
    );
  }
}

/** Writes a path as `agents.bug.acts.members.rule.targets[0]`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let text = '';
  for (const part of path) {
    text += typeof part === 'number' ? `[${part}]` : text ? `.${String(part)}` : String(part);
  }
  return text;
}

function structuralDiagnostics(error: z.ZodError): Diagnostic[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    severity: 'error',
    message: issue.message,
  }));
}

/**
 * Validates the structure of untrusted input, returning it typed as a
 * {@link Model} or throwing a {@link ModelFormatError} that lists every
 * problem. This checks shape only; `checkModel` checks meaning.
 */
export function parseModel(input: unknown): Model {
  const result = modelSchema.safeParse(input);
  if (result.success) return result.data;
  throw new ModelFormatError(structuralDiagnostics(result.error));
}

/** Like {@link parseModel}, for a function library. */
export function parseLibrary(input: unknown): Library {
  const result = librarySchema.safeParse(input);
  if (result.success) return result.data;
  throw new ModelFormatError(structuralDiagnostics(result.error));
}

/** The JSON Schema of the format, for editors and other tools. */
export function modelJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(modelSchema, { unrepresentable: 'any' }) as Record<string, unknown>;
}
