// SPDX-License-Identifier: EPL-2.0
//
// Milliseconds per period of format models, interpreted and generated, beside
// the coded ports where there are any (docs/codegen.md). Run with
// `npx tsx packages/models/scripts/bench-format.ts [periods] [seeds] [--profile]`.
import { RootScape, type Model } from '@metascape/engine';
import { compileModel, parseModel, type CompileOptions } from '@metascape/spec';
import heatbugsSource from '@metascape/spec/examples/escape/Heatbugs.model.json';
import classesSource from '../src/brookings/classes/ClassesModelOne.model.json';
import { classesModelOne } from '../src/brookings/classes/models';
import civilViolenceSource from '../src/brookings/civil-violence/CivilViolenceI.model.json';
import { cvModelI } from '../src/brookings/civil-violence/model-i';
import sugarscapeSource from '../src/brookings/sugarscape/SugarscapeII1.model.json';
import { gasII1 } from '../src/brookings/sugarscape/chapter-2';
import { heatbugs } from '../src/heatbugs/heatbugs';

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const periods = Number(args[0] ?? 100);
const seeds = Number(args[1] ?? 3);
const warmup = 10;

const cases: { name: string; source: unknown; coded?: Model }[] = [
  { name: 'Civil Violence I', source: civilViolenceSource, coded: cvModelI as Model },
  { name: 'Sugarscape II-1', source: sugarscapeSource, coded: gasII1 as Model },
  { name: 'Classes Model One', source: classesSource, coded: classesModelOne as Model },
  // The coded Heatbugs is Ascape's, not a port of AMP's: a rough comparison only.
  { name: 'Heatbugs (AMP)', source: heatbugsSource, coded: heatbugs as Model },
];

/** Mean ms per period after warm-up, over the seeds. */
function time(model: Model): number {
  let total = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const root = new RootScape(model, { seed });
    root.run(warmup);
    const start = performance.now();
    root.run(periods);
    total += (performance.now() - start) / periods;
  }
  return total / seeds;
}

const compile = (source: unknown, execution?: string) =>
  compileModel(parseModel(source), { execution } as CompileOptions) as Model;

const rows: string[] = [];
for (const { name, source, coded } of cases) {
  const interpreted = time(compile(source, 'interpreted'));
  let generated: number | undefined;
  try {
    generated = time(compile(source, 'generated'));
  } catch (error) {
    console.error(`${name}: generated execution failed: ${(error as Error).message}`);
  }
  const port = coded ? time(coded) : undefined;
  const f = (n: number | undefined) => (n === undefined ? '-' : n.toFixed(3));
  const ratio = (a: number | undefined, b: number | undefined) =>
    a === undefined || b === undefined ? '-' : (a / b).toFixed(1);
  rows.push(
    `| ${name} | ${f(interpreted)} | ${f(generated)} | ${f(port)} | ${ratio(interpreted, port)} | ${ratio(generated, port)} | ${ratio(interpreted, generated)} |`,
  );
}
console.log(`ms per period, ${periods} periods after ${warmup}, mean of ${seeds} seeds`);
console.log(
  '| model | interpreted | generated | coded | interpreted / coded | generated / coded | speed-up |',
);
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const row of rows) console.log(row);
