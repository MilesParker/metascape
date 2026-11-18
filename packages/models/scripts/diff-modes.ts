import { writeFileSync } from 'node:fs';
import { compileModel, generationReport, traceRun } from '@metascape/spec';
import { catalog } from '../src';
import { formatSourceOf } from '../src/amp/metaabm';
const [match = '', periods = '5', dump] = process.argv.slice(2);
for (const family of catalog)
  for (const model of family.models) {
    const source = formatSourceOf(model);
    if (!source || !model.name.includes(match)) continue;
    const gen = compileModel(source.model, { ...source.options, execution: 'generated' });
    const report = generationReport(gen)!;
    console.log(model.name, 'interpreted acts:', report.interpreted);
    if (dump)
      for (const [f, s] of report.sources) writeFileSync(`${dump}/${f.replace(/\//g, '_')}.js`, s);
    const a = traceRun(compileModel(source.model, source.options), {
      seed: 1,
      periods: Number(periods),
    });
    const b = traceRun(gen, { seed: 1, periods: Number(periods) });
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      const la = a[i]!.split('\n'),
        lb = b[i]!.split('\n');
      const j = la.findIndex((l, k) => l !== lb[k]);
      console.log(
        `period ${i}, line ${j}:\n  interpreted ${la[j]?.slice(0, 300)}\n  generated   ${lb[j]?.slice(0, 300)}`,
      );
      break;
    }
  }
