// SPDX-License-Identifier: EPL-2.0
import { RootScape, type TimeSeriesViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family as demographicPd } from './demographic-pd';
import { family as epidemic } from './epidemic';
import { family as heatbugs } from './heatbugs';
import { family as markets } from './markets';
import { family as stupidModel } from './stupid-model';
import { family as wikiExample } from './wiki-example';

const models = [stupidModel, wikiExample, heatbugs, demographicPd, epidemic, markets].flatMap(
  (family) => family.models,
);

describe('the AMP models, from their MetaABM originals', () => {
  it.each(models.map((model) => [model.name, model] as const))(
    '%s runs, and its charts show series it records',
    (_, model) => {
      const root = new RootScape(model, { seed: 1 });
      root.run(10);
      const recorded = new Set(root.data.series.map((series) => series.id));
      for (const view of model.views?.(root) ?? []) {
        for (const id of (view as TimeSeriesViewSpec).series) expect(recorded, id).toContain(id);
      }
    },
  );

  it('StupidModel 5 bugs grow by what they eat', () => {
    const model = stupidModel.models.find((found) => found.name === 'StupidModel 5')!;
    const root = new RootScape(model, { seed: 1 });
    root.run(10);
    const mean = root.data.latest('bug.size.mean');
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThanOrEqual(10 * 0.2);
  });
});
