// SPDX-License-Identifier: EPL-2.0
//
// Zod schemas for run specs, run tests (ported from AMP's APar and ATest; see
// ./types.ts) and curation (../curation/types.ts).
import { z } from 'zod';
import {
  CURATION_SCHEMA_VERSION,
  type Chart,
  type ChartSeries,
  type Curation,
} from '../curation/types';
import { formatPath, ModelFormatError } from '../metamodel/schema';
import type { Diagnostic } from '../metamodel/types';
import {
  RUN_SPEC_SCHEMA_VERSION,
  type Constraint,
  type Measure,
  type Measurement,
  type RunParameter,
  type RunSpec,
  type RunTest,
} from './types';

const ID_PART = '[A-Za-z_][A-Za-z0-9_]*';
const id = z
  .string()
  .regex(
    new RegExp(`^${ID_PART}$`),
    'An ID starts with a letter or underscore, then letters, digits and underscores',
  );
const path = z
  .string()
  .regex(
    new RegExp(`^${ID_PART}(\\.${ID_PART})*$`),
    'A reference is a path of IDs separated by dots, such as city.width',
  );
const finite = z.number().refine(Number.isFinite, 'A finite number');

const runParameter: z.ZodType<RunParameter> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('single'),
      attribute: path,
      value: z.union([z.boolean(), finite, z.string()]),
    }),
    z.strictObject({
      kind: z.literal('sweep'),
      attribute: path,
      start: finite,
      end: finite,
      increment: finite.refine((n) => n !== 0, 'An increment is not zero'),
    }),
    z.strictObject({ kind: z.literal('link'), parameters: z.array(runParameter) }),
  ]),
);

const measure: z.ZodType<Measure> = z.enum(['count', 'average', 'sum', 'minimum', 'maximum']);

const measurementShape = {
  measure,
  agent: path,
  attribute: id.optional(),
  qualifier: z.union([id, z.boolean()]).optional(),
};
const measurementSchema: z.ZodType<Measurement> = z.strictObject(measurementShape);

const constraint: z.ZodType<Constraint> = z.strictObject({
  ...measurementShape,
  min: finite,
  max: finite,
});

export const runSpecSchema: z.ZodType<RunSpec> = z.strictObject({
  schemaVersion: z.literal(RUN_SPEC_SCHEMA_VERSION),
  id,
  label: z.string().optional(),
  model: id,
  incorporates: z.array(id).optional(),
  stopPeriod: z.number().int('A stop period is a whole number').optional(),
  stopWhen: z.array(constraint).optional(),
  parameters: z.array(runParameter).optional(),
});

export const runTestSchema: z.ZodType<RunTest> = z.strictObject({
  schemaVersion: z.literal(RUN_SPEC_SCHEMA_VERSION),
  id,
  label: z.string().optional(),
  description: z.string().optional(),
  runSpec: id.optional(),
  constraints: z.array(constraint).optional(),
  contains: z.array(id).optional(),
});

const chartSeries: z.ZodType<ChartSeries> = z.strictObject({
  ...measurementShape,
  label: z.string().optional(),
});

const chart: z.ZodType<Chart> = z.strictObject({
  title: z.string(),
  series: z.array(chartSeries).min(1, 'A chart has at least one series'),
  yMin: finite.optional(),
  yMax: finite.optional(),
  yLabel: z.string().optional(),
});

export const curationSchema: z.ZodType<Curation> = z.strictObject({
  schemaVersion: z.literal(CURATION_SCHEMA_VERSION),
  model: id,
  measures: z.array(measurementSchema).optional(),
  charts: z.array(chart).optional(),
});

function parseWith<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const diagnostics: Diagnostic[] = result.error.issues.map((issue) => ({
    path: formatPath(issue.path),
    severity: 'error',
    message: issue.message,
  }));
  throw new ModelFormatError(diagnostics);
}

/** Validates the structure of a run spec, throwing a `ModelFormatError` that lists every problem. */
export const parseRunSpec = (input: unknown): RunSpec => parseWith(runSpecSchema, input);
/** Validates the structure of a run test, throwing a `ModelFormatError` that lists every problem. */
export const parseRunTest = (input: unknown): RunTest => parseWith(runTestSchema, input);
/** Validates the structure of a curation, throwing a `ModelFormatError` that lists every problem. */
export const parseCuration = (input: unknown): Curation => parseWith(curationSchema, input);
