# Epidemic (AMP)

Epidemic spread through individuals on a grid, from the Eclipse Agent Modeling Platform (AMP) example models `Epidemic.metaabm`, `EpidemicContact.metaabm`, `EpidemicPlague.metaabm` and `EpidemicRegional.metaabm` (project `org.eclipse.amp.amf.examples.escape`).

Individuals move around a bounded Moore grid, one per cell. Each has a disease state (susceptible, exposed, asymptomatic infectious, symptomatic infectious, recovered, dead). Infectious individuals may infect a neighbouring individual. Exposure, the asymptomatic period and the symptomatic period have random lengths; at the end of the infection an individual dies with the case mortality rate, otherwise recovers.

- Authors: Miles Parker.
- Copyright (Epidemic, Contact, Plague; verbatim from the model description): "Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed."
- `EpidemicRegional.metaabm` has no description or copyright statement. It carries "Copyright (c) Metascape LLC and others, made available under the Eclipse Public License".
- Background (not the model's citation): the descriptions say "For some background on the general approach, see Joshua M. Epstein. 'Generative Social Science'. 2006. Princeton." That is: Epstein, J. M. (2006). Generative Social Science. Princeton University Press.
- Licence: EPL-2.0.

## Where the models come from

Each model is its `.metaabm` file, translated into the model format (`packages/spec/examples/escape/*.model.json`) and run by the format's interpreter.

| Model                      | File                       | Differences from `Epidemic (AMP)`                                             |
| -------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `Epidemic (AMP)`           | `Epidemic.metaabm`         |                                                                               |
| `Epidemic (AMP): Contact`  | `EpidemicContact.metaabm`  | a directed contact network records who infected whom                          |
| `Epidemic (AMP): Plague`   | `EpidemicPlague.metaabm`   | no individuals by default; fleas and rats on the same grid                    |
| `Epidemic (AMP): Regional` | `EpidemicRegional.metaabm` | cities, each a grid of individuals, on a wrapped regional map, with migration |

The charts show the individuals by status, which the originals gather. The Regional model has no chart yet: its individuals live in the cities, which are nested scapes, and the interpreter does not collect statistics of nested scapes' populations.

The earlier code ports had a fifth model, "Regional Periods", from `EpidemicPeriods.java`: a hand-written Java subclass of the Regional model with other parameter values and a stop period of 3000. It has no `.metaabm` original, so it is gone; its parameter values belong in a run spec (R24 in `docs/metamodel-review.md`).

The AMP projects also hold parameter files (`params/*.apar`: EpiBase, EpiHighTransmission, EpiLowTransmission and regional ones). They are run specs, not models, and wait for R24 as well.
