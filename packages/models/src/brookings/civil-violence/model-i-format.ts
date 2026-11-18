// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Civil Violence Model I (Epstein 2002) written in the model format, beside the coded port in
// `model-i.ts`: the model is `CivilViolenceI.model.json`, and Runs 1 to 5 of the paper are run specs.
import { parseRunSpec, type Curation, type RunSpec } from '@metascape/spec';
import { fromMetaabm } from '../../amp/metaabm';
import source from './CivilViolenceI.model.json';

const model = 'civilViolenceI';
const set = (attribute: string, value: number | boolean) =>
  ({ kind: 'single', attribute, value }) as const;
const run = (
  id: string,
  label: string,
  parameters: ReturnType<typeof set>[],
  incorporates?: string[],
) =>
  parseRunSpec({
    schemaVersion: 1,
    id,
    label,
    model,
    parameters,
    ...(incorporates && { incorporates }),
  });

/** Runs 1 to 5 of the paper, which the legacy code made into one class each. */
export const civilViolenceIRuns: RunSpec[] = [
  run('run1', 'Run 1', [set('legitimacy', 0.89), set('citizensMove', false)]),
  run('run2', 'Run 2', [
    set('copVision', 7),
    set('citizenVision', 7),
    set('legitimacy', 0.82),
    set('jailTerm', 30),
  ]),
  run('runs345', 'Runs 3-5 (base)', [
    set('copVision', 7),
    set('citizenVision', 7),
    set('initialCopDensity', 0.074),
    set('jailTerm', 2147483647),
    set('legitimacy', 0.9),
  ]),
  run('run3', 'Run 3', [set('legitimacyErosion', 0.01)], ['runs345']),
  run('run4', 'Run 4', [set('legitimacyCutPeriod', 75), set('legitimacyCut', 0.65)], ['runs345']),
  run(
    'run5',
    'Run 5',
    [set('legitimacy', 0.8), set('initialCopDensity', 0.06), set('copDensityStep', 0.001)],
    ['runs345'],
  ),
];

const count = (state: string) =>
  ({ measure: 'count', agent: 'citizen', attribute: 'state', qualifier: state }) as const;

const curation: Curation = {
  schemaVersion: 1,
  model,
  charts: [
    {
      title: 'Population Chart',
      series: [count('active'), count('quiescent'), count('jailed')],
    },
    {
      title: 'Measures Chart',
      series: [
        { measure: 'average', agent: 'citizen', attribute: 'grievance' },
        { measure: 'average', agent: 'citizen', attribute: 'riskAversion' },
      ],
    },
  ],
};

/** Model I of Civil Violence as a format model; the coded `cvModelI` is its counterpart. */
export const cvModelIFormat = fromMetaabm(source, {
  name: 'Civil Violence: Model I (format)',
  provenance: {
    authors: 'Joshua M. Epstein',
    citation:
      'Epstein, J. M. (2002). Modeling civil violence: An agent-based computational approach. PNAS, 99(suppl. 3), 7243-7250.',
    portedFrom: 'Ascape 5.6.1, edu.brook.cv.paper.CVModelI',
    copyright:
      'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.',
  },
  curation,
  runSpecs: civilViolenceIRuns,
});
