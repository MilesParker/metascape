# Epidemic (AMP)

Epidemic spread through individuals on a grid, ported from the Eclipse Agent Modeling Platform (AMP) example models `Epidemic.metaabm`, `EpidemicContact.metaabm`, `EpidemicPlague.metaabm` and `EpidemicRegional.metaabm` (project `org.eclipse.amp.amf.examples.escape`), plus the hand-written `EpidemicPeriods.java`.

Individuals move around a bounded 40 x 100 Moore grid (one per cell). Each has a disease state (susceptible, exposed, asymptomatic infectious, symptomatic infectious, recovered, dead). Infectious individuals pick one random neighbouring individual per period and may infect it. Exposure, the asymptomatic period and the symptomatic period have random lengths; at the end of the infection an individual dies with the case mortality rate, otherwise recovers.

- Authors: Miles Parker.
- Copyright (Epidemic, Contact, Plague; verbatim from the model description): "Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed."
- `EpidemicRegional.metaabm` has no description or copyright statement. Its files carry "Copyright (c) Metascape LLC and others, made available under the Eclipse Public License".
- Background (not the model's citation): the descriptions say "For some background on the general approach, see Joshua M. Epstein. 'Generative Social Science'. 2006. Princeton." That is: Epstein, J. M. (2006). Generative Social Science. Princeton University Press.
- Licence of this port: EPL-2.0.

## Models

| Model                              | Source                     | Differences from `Epidemic (AMP)`                                                                     |
| ---------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Epidemic (AMP)`                   | `Epidemic.metaabm`         | 1500 individuals, initial infection 0.05                                                              |
| `Epidemic (AMP): Contact`          | `EpidemicContact.metaabm`  | initial infection 0.005; a directed contact network records who infected whom                         |
| `Epidemic (AMP): Plague`           | `EpidemicPlague.metaabm`   | 0 individuals; 30 fleas and 40 rats on the same grid; flea range 3                                    |
| `Epidemic (AMP): Regional`         | `EpidemicRegional.metaabm` | 4 cities of 300 individuals (20 x 50 grids) on a wrapped 2 x 2 map, with migration; exposure 12 to 48 |
| `Epidemic (AMP): Regional Periods` | `EpidemicPeriods.java`     | 100 cities on a 40 x 4 map, migration 0.0005, stops at period 3000                                    |

## Legacy classes

| Legacy class                                                                            | New model or shared file        | Status                                                         |
| --------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| `name.milesparker.epi.Epidemic`                                                         | `epidemic.ts`, `single-city.ts` | ported                                                         |
| `name.milesparker.epi.Individual`, `StatusEnum`                                         | `disease.ts`                    | ported (shared by all variants)                                |
| `name.milesparker.epi.contact.Epidemic`, `Individual`, `StatusEnum`                     | `contact.ts`                    | ported; logic folded into shared code                          |
| `name.milesparker.epi.plague.Epidemic`, `Individual`, `StatusEnum`                      | `plague.ts`                     | ported; individual folded into shared code                     |
| `name.milesparker.epi.plague.Flea`, `Rat`                                               | `plague.ts`                     | ported                                                         |
| `name.milesparker.epi.region.Region`                                                    | `regional.ts`                   | ported                                                         |
| `name.milesparker.epi.region.City`, `CommunityInfectionStatusEnum`                      | `regional.ts`                   | ported                                                         |
| `name.milesparker.epi.region.Individual`, `StatusEnum`                                  | `regional.ts`, `disease.ts`     | ported (shares the disease rules)                              |
| `name.milesparker.epi.region.Place`, `RegionalLocation`                                 | `regional.ts` (`MapCell`)       | folded into shared code                                        |
| `name.milesparker.epi.region.EpidemicPeriods`                                           | `regional.ts`                   | ported (file output not ported)                                |
| `*Style2D*`, `*Provider`, `*Adapter*`, `*3D` classes                                    | view specs in each model        | not ported: UI only                                            |
| `params/*.apar` (EpiBase, EpiHighTransmission, EpiLowTransmission, regional parameters) | none                            | not ported: parameter sets, not models (`StopPeriod=500` etc.) |

## How the AMP act graphs were read

The `.metaabm` files hold the rules as a graph of acts (selects, queries, sets, moves, watch). The plain Epidemic's generated Java under `escape/srcgen` is an empty skeleton, so the meaning of the acts was taken from the working generated Ascape code of the Contact, Plague and Regional variants and the `examples.ascape` Epidemic. In particular:

- A `Select` of neighbours with queries picks ONE random neighbouring occupant (`findRandomNeighbor`), then the remaining queries are tests on it. A `Select` of a location with `available` and `neighbor` picks one random free neighbouring cell.
- `AAll` is and, `AAny` is or. `timeNow` is the period, which is `sim.tick` (period 0 is initialization; the first rules run at period 1).
- The `Watch` on `status` runs after every assignment to `status`.
- Each scape runs rule by rule over its members in random order (`RULE_ORDER`), as the generated code sets it. Initial rules run rule by rule too: Initialize Location for all, then Initialize State for all.
- Moore neighbourhood, non-periodic city grids (`Array2DEuclidian` neighbours are the eight adjacent cells).

## Deviations and kept oddities

- The sibling `examples.ascape` project has an older Epidemic with other defaults (250 individuals, exposure 15 to 24). The `escape` `.metaabm` is the authority and is what is ported.
- Individuals beyond the number of cells are created but never placed on the grid; they take no part (the original would fail on a missing host cell).
- `periodsperDay` is a parameter as in the original, but no rule uses it.
- Kept: transmission compares the random draw with the infection probability of the neighbour being infected, not of the infectious individual. Dead individuals stay on their cell and block it. Only symptomatic individuals stop moving; asymptomatic ones still move. All period tests are by equality with the current period, as written.
- Kept (Regional): the first individual to run Initialize State decides which city is the origin; only that city can start infected. A city's status changes from origin to "infections observed" when someone in it first shows symptoms after an asymptomatic period; symptoms after no asymptomatic period do not change it (as in the generated code).
- Contact: the contact network is the engine `Network`, which refuses self-links and repeated links. The original adds both (its initial step links each initially exposed individual to every exposed one, itself included). The network only feeds the view and the `contacts` series (link count).
- Plague: fleas and rats do not affect the disease in the AMP model. With the default 0 individuals nothing is infected. A flea looks for the nearest rat within range (Euclidean distance rounded to whole cells, as Ascape's `Array2DEuclidian`, ties broken at random) and steps one cell toward it if that cell is free. Creatures are placed in the order individuals, fleas, rats.
- Regional: the neighbours of a city on the wrapped 2 x 2 map are the distinct other cities (the engine never lists a cell twice). Ascape's periodic Moore list may repeat cells on such a small torus, which would weight migration; that was not checked. A migrating individual is replaced by a copy in the new city (the engine cannot move an agent between scapes without it lingering in the old one), so its id changes. The cities run one after another in creation order. Cities beyond the number of regional cells stand nowhere and have no neighbours. The AMP `City` attributes (`individualCount`, `mapWidth`, `mapHeight`) are exposed as parameters named `individualCount`, `mapWidth`, `mapHeight`; the City attribute `periodsperDay` (unused) is omitted.
- Regional Periods: the original writes data files to a fixed path; that is not ported. The stop period 3000 is kept.
- The description of the AMP model says "succeptible"; the text here says susceptible (and "there are" for "their are").
- No Java random sequence is reproduced; runs are deterministic per seed.
