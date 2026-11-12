# SIR (system dynamics)

The susceptible, infected and recovered compartment model, ported from the Eclipse Agent Modeling Platform (AMP) example `SIR.metaabm` (project `org.eclipse.amp.amf.examples.sd`). It is a stock-and-flow model, not an agent model.

- Authors: W. O. Kermack and A. G. McKendrick. Citation: Kermack, W. O., & McKendrick, A. G. (1927). A contribution to the mathematical theory of epidemics. Proceedings of the Royal Society A, 115(772), 700-721. Both are as given for this port; the AMP model states neither.
- Copyright: the model has no description or copyright statement. The files carry "Copyright (c) Metascape LLC and others, made available under the Eclipse Public License".
- Licence of this port: EPL-2.0.

## The model

Stocks: SucseptiblePopulation (initial 9999), InfectedPopulation (initial 1), RecoveredPopulation (initial 0). Flows: InfectionRate = S x ContactRate x Infectivity x I / Population; RecoveryRate = I / IllnessDuration. Auxiliaries: ContactRate 0.333, Infectivity 0.2, Population 10000, IllnessDuration 84. S' = -InfectionRate, I' = InfectionRate - RecoveryRate, R' = RecoveryRate. These constants are hard-coded variables in the AMP model; here they are parameters with the same defaults.

## How the AMP version integrates

The AMP runtime (`org.eclipse.amp.axf.sd`) uses explicit Euler with step size 1 (`EulerIntegration`: value(t) = value(t-1) + integral evaluated at t-1). Each stock is seeded with its initial value at BOTH period 0 and period 1, so the series is flat for the first two samples and the first change appears at period 2. Flows and auxiliaries are computed from the stocks of the same period. This port does exactly that: the three stocks live in one agent (`Compartments`) whose rule integrates from tick 2, and every variable is a recorded `sim.data.value` series with its AMP name.

## Legacy classes

| Legacy class                                                                                                                                                                                                           | New model or shared file | Status                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `sdl.SIR.sd.SIR`                                                                                                                                                                                                       | `sir.ts` (`sir`)         | ported                                                                                   |
| `sdl.SIR.sd.sir_SD.SD` and the variable classes (`InfectedPopulation`, `SucseptiblePopulation`, `RecoveredPopulation`, `InfectionRate`, `RecoveryRate`, `ContactRate`, `Population`, `Infectivity`, `IllnessDuration`) | `sir.ts`                 | folded into shared code                                                                  |
| `sdl.SIR.sd.sir_SD.*_*` connector classes                                                                                                                                                                              | none                     | folded into shared code (they only wire variables)                                       |
| `sdl.SIR.sd.SIRAgent`                                                                                                                                                                                                  | none                     | not ported: an agent without rules; the model's `SIR Agent Count` is 0 and has no effect |
| `SIRAgentStyle2D*`, `SIRGraphicsAdapter`                                                                                                                                                                               | view specs               | not ported: UI only                                                                      |

## Notes

- Fully deterministic and independent of the seed.
- The AMP model sets no stop period; the optional `periods` parameter (0 = never) is an addition for convenience.
- Population is an independent constant, not the sum of the stocks (as in the original); with the defaults S + I + R stays 10000.
- There is no spatial view (no space); views are time series of the stocks and the flows and a bar view.
