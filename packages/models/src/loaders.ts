// SPDX-License-Identifier: EPL-2.0
import type { ModelFamily } from './catalog';

/**
 * Loads each family's code on demand, by family id, so that a model picker can
 * list the catalogue from metadata and fetch only the family a user opens.
 * Bundlers split each family into its own chunk.
 */
export const familyLoaders: Readonly<Record<string, () => Promise<ModelFamily>>> = {
  'metascape-examples': () => import('./originals').then((m) => m.family),
  'brookings-sugarscape': () => import('./brookings/sugarscape').then((m) => m.family),
  'brookings-anasazi': () => import('./brookings/anasazi').then((m) => m.family),
  'brookings-civil-violence': () => import('./brookings/civil-violence').then((m) => m.family),
  'brookings-norms': () => import('./brookings/norms').then((m) => m.family),
  'brookings-retirement': () => import('./brookings/retirement').then((m) => m.family),
  'brookings-classes': () => import('./brookings/classes').then((m) => m.family),
  'brookings-firms': () => import('./brookings/firms').then((m) => m.family),
  'brookings-prisoners-dilemma': () =>
    import('./brookings/prisoners-dilemma').then((m) => m.family),
  'brookings-spatial-ipd': () => import('./brookings/spatial-ipd').then((m) => m.family),
  'brookings-diffusion': () => import('./brookings/diffusion').then((m) => m.family),
  'brookings-life': () => import('./brookings/life').then((m) => m.family),
  'brookings-bb': () => import('./brookings/bb').then((m) => m.family),
  'brookings-coordination-game': () =>
    import('./brookings/coordination-game').then((m) => m.family),
  'brookings-simple': () => import('./brookings/simple').then((m) => m.family),
  'ascape-bionland': () => import('./ascape/bionland').then((m) => m.family),
  'ascape-boids': () => import('./ascape/boids').then((m) => m.family),
  'ascape-traffic': () => import('./ascape/traffic').then((m) => m.family),
  'amp-stupid-model': () => import('./amp/stupid-model').then((m) => m.family),
  'amp-wiki-example': () => import('./amp/wiki-example').then((m) => m.family),
  'amp-heatbugs': () => import('./amp/heatbugs').then((m) => m.family),
  'amp-demographic-pd': () => import('./amp/demographic-pd').then((m) => m.family),
  'amp-epidemic': () => import('./amp/epidemic').then((m) => m.family),
  'amp-markets': () => import('./amp/markets').then((m) => m.family),
  'amp-sir': () => import('./amp/sir').then((m) => m.family),
};
