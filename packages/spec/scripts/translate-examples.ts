// SPDX-License-Identifier: EPL-2.0
//
// Translates the AMP examples in examples/escape from their `.metaabm` files
// and writes the model (`Name.model.json`) and the diagnostics of the
// translation (`Name.diagnostics.json`) beside each; then their run files, the
// `.apar` files in params/ to run specs (`Name.run.json`) and the `.atest`
// files in tests/ to run tests (`Name.test.json`), each with its diagnostics.
// The AMP files are the source of truth; the JSON is generated. Methods
// ported by hand from Java are implemented in `Name.methods.ts` beside the
// model; the translation marks them as provided and holds no code for them.
//
//   npm run translate-examples          write the files
//   npm run translate-examples -- --check   fail if the files are out of date
/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleMethods } from '../examples/escape/methods';
import { runFileId, translateApar, translateAtest } from '../src/metaabm/apar';
import { renderTranslation } from '../src/metaabm/render';
import type { Model } from '../src/metamodel/types';
import type { RunSpec } from '../src/runspec/types';

const directory = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'examples', 'escape');
const check = process.argv.includes('--check');
let stale = 0;

/** Writes a file, or in a check, counts it if it is out of date. */
function output(folder: string, name: string, text: string): void {
  const path = join(folder, name);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  if (current === text) return;
  if (check) {
    console.error(`${name} is out of date.`);
    stale++;
  } else {
    writeFileSync(path, text);
    console.log(`Wrote ${name}`);
  }
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const filesIn = (folder: string, extension: string): string[] =>
  readdirSync(folder)
    .filter((name) => name.endsWith(extension))
    .sort();

const models = new Map<string, Model>();

for (const file of filesIn(directory, '.metaabm')) {
  const name = file.slice(0, -'.metaabm'.length);
  const rendered = renderTranslation(readFileSync(join(directory, file), 'utf8'), {
    methods: exampleMethods[name] ?? {},
  });
  if (rendered.model === undefined) {
    console.error(`${file} could not be translated: see ${name}.diagnostics.json`);
    stale++;
  }
  if (rendered.model !== undefined) {
    output(directory, `${name}.model.json`, rendered.model);
    models.set(name, JSON.parse(rendered.model) as Model);
  }
  output(directory, `${name}.diagnostics.json`, rendered.diagnostics);
}

const params = join(directory, 'params');
const specs = new Map<string, RunSpec>();
for (const file of filesIn(params, '.apar')) {
  const name = runFileId(file);
  const translation = translateApar(readFileSync(join(params, file), 'utf8'), {
    id: name,
    models: (uri) => models.get(runFileId(uri)),
  });
  if (translation.value === undefined) {
    console.error(`${file} could not be translated: see ${name}.diagnostics.json`);
    stale++;
  } else {
    specs.set(name, translation.value);
    output(params, `${name}.run.json`, json(translation.value));
  }
  output(params, `${name}.diagnostics.json`, json(translation.diagnostics));
}

const tests = join(directory, 'tests');
for (const file of filesIn(tests, '.atest')) {
  const name = runFileId(file);
  const translation = translateAtest(readFileSync(join(tests, file), 'utf8'), {
    id: name,
    runSpecs: (uri) => specs.get(runFileId(uri)),
    models: (id) => [...models.values()].find((model) => model.id === id),
  });
  if (translation.value === undefined) {
    console.error(`${file} could not be translated: see ${name}.diagnostics.json`);
    stale++;
  } else {
    output(tests, `${name}.test.json`, json(translation.value));
  }
  output(tests, `${name}.diagnostics.json`, json(translation.diagnostics));
}

if (check && stale > 0) {
  console.error('Run `npm run translate-examples` to update the translated examples.');
  process.exit(1);
}
