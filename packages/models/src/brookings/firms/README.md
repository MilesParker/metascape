# Emergence of Firms

Axtell's model: employees choose an effort level and a firm to work in, by comparing their current firm, founding a new one, and the neighbouring firms, under local increasing returns to scale. Firms form and a skewed size distribution emerges. Ported from Ascape 5.6.1 (`edu.brook.firms`), BSD licensed, copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others. This port is EPL-2.0.

Citation: Axtell, R. L. (1999). The emergence of firms in a population of agents: Local increasing returns, unstable Nash equilibria, and power law size distributions. Brookings Institution, Center on Social and Economic Dynamics, Working Paper No. 3.

| legacy class                                      | new model or shared file                | status                                                                                            |
| ------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Model1                                            | Emergence of Firms (`firms.ts`)         | ported                                                                                            |
| Employee                                          | `firms.ts` (`Employee`)                 | folded into shared code                                                                           |
| Firm                                              | `firms.ts` (`Firm`)                     | folded into shared code                                                                           |
| UtilityFunction                                   | `firms.ts` (`UtilityFunction`)          | folded into shared code                                                                           |
| Function (org.ascape.util, golden-section search) | `firms.ts` (`UtilityFunction.maximize`) | folded into shared code                                                                           |
| ProfitFirm                                        | -                                       | not ported: not reachable from Model1 (the only launched class); also uses unseeded `Math.random` |
| Worker                                            | -                                       | not ported: not reachable from Model1 (it adds a rule only in its own `scapeCreated`, never run)  |

## Views

Legacy `FixedStretchyView`s show firms as columns in fixed slots (or with gaps removed, oldest first) coloured by average effort (white to blue) or average output relative to the maximum (red to green). They are four `gridView`s of one grid: Firm Effort and Firm Output list firms by fixed slot, "by Age" views pack firms in order of formation. Column height (firm size) is not drawn; size is in the histogram `Firm sizes` (values above the range go in the last bin) and the time series.

## Deviations and kept legacy behaviour

- `employees` (500) is a parameter; legacy fixed it. One twentieth act per tick, chosen without replacement (legacy partial tour).
- Comparison firms: Ascape's list space returns the previous and next firm in order of formation, wrapping around, or all others if there are three or fewer firms. Ported that way (the "friends" option, off in the legacy code, is not ported).
- Kept: `Function.maximize` golden-section search is ported line by line, including its odd bookkeeping of probe values.
- Kept: an employee who founds a new firm resets effort to its preference theta, not the maximized effort.
- Initial firms are created in employee order, so the firm order starts as the employee order.
- Random streams differ from Java; runs are deterministic per seed.
