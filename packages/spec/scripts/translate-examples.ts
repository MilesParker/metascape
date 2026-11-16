// SPDX-License-Identifier: EPL-2.0
//
// Translates the AMP examples in examples/escape from their `.metaabm` files
// and writes the model (`Name.model.json`) and the diagnostics of the
// translation (`Name.diagnostics.json`) beside each. The `.metaabm` files are
// the source of truth; the JSON is generated.
//
//   npm run translate-examples          write the files
//   npm run translate-examples -- --check   fail if the files are out of date
/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTranslation } from '../src/metaabm/render';

const directory = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'examples', 'escape');
const check = process.argv.includes('--check');
let stale = 0;

for (const file of readdirSync(directory)
  .filter((name) => name.endsWith('.metaabm'))
  .sort()) {
  const name = file.slice(0, -'.metaabm'.length);
  const rendered = renderTranslation(readFileSync(join(directory, file), 'utf8'));
  if (rendered.model === undefined) {
    console.error(`${file} could not be translated: see ${name}.diagnostics.json`);
    stale++;
  }
  const outputs: [string, string | undefined][] = [
    [`${name}.model.json`, rendered.model],
    [`${name}.diagnostics.json`, rendered.diagnostics],
  ];
  for (const [output, text] of outputs) {
    if (text === undefined) continue;
    const path = join(directory, output);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    if (current === text) continue;
    if (check) {
      console.error(`${output} is out of date.`);
      stale++;
    } else {
      writeFileSync(path, text);
      console.log(`Wrote ${output}`);
    }
  }
}

if (check && stale > 0) {
  console.error('Run `npm run translate-examples` to update the translated examples.');
  process.exit(1);
}
