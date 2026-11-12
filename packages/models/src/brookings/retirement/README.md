# Retirement

Coordination in transient social networks: a population of people aged 50 to 100 decides when to retire. A few are rational and retire as soon as they are eligible, a few retire at random (probability one half per year once eligible), and most imitate: they retire once at least half of the eligible, living people in their social network have retired (and at least one has). People are reborn at the oldest age, with a new strategy and a new network.

Citation: Axtell, R. L., & Epstein, J. M. (1999). Coordination in transient social networks: An agent-based computational model of the timing of retirement. In H. J. Aaron (Ed.), Behavioral Dimensions of Retirement Economics. Brookings Institution Press. (Also Russell Sage Foundation, as the legacy About text states.) The Java version was implemented by Miles Parker from a C++ model by Robert Axtell.

Collection: Brookings Institution models (from Ascape). Licence: BSD (`LICENSES/brookings-models-license.txt`), ported under EPL-2.0.

| legacy class                                                   | new model or shared file                             | status                                      |
| -------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| `Population`                                                   | `population.ts` (`population`)                       | ported                                      |
| `Person`                                                       | `person.ts` (`Person`)                               | folded into shared code                     |
| `PopulationCoupled`                                            | `population-coupled.ts` (`populationCoupled`)        | ported (behaves as `Population`, see below) |
| `PersonCoupled` (package-private, in `PopulationCoupled.java`) | none                                                 | not ported: dead code in the legacy model   |
| `PopulationSmallWorld`                                         | `population-small-world.ts` (`populationSmallWorld`) | ported                                      |
| `PersonSmallWorld`                                             | `person.ts` (`Person`, small-world network)          | folded into shared code                     |

## Execution order

`Population.java` notes that the result depends on by-rule versus by-agent execution: with by-agent execution (agents age asynchronously) retirement often starts from the youngest cohorts; with by-rule execution the reported behaviour is obtained. The legacy choice, by rule (`RULE_ORDER`; the by-agent line is commented out), is kept: every person does `metabolism` before anyone does `iterate`. The engine option is `schedule: 'byRule'`.

## Mapping notes

- The lattice is a 100 x 51 wrapped grid (cohort size 100, one row per age 50..100). Rows are not re-assigned; the row holding the youngest age moves up by one after every tick (the legacy `scapeIterated`), and a person's age is reset from its row on rebirth. The legacy relative view that rotates the display is not available: the grid view shows rows as stored.
- Ascape shuffles the visiting order for the random `iterate` rule and keeps creation order for `metabolism`. The engine shuffles once per tick for all rules. Metabolism of one person does not depend on any other, so this changes nothing in distribution.
- `Population` networks: 10 to 25 people drawn with replacement from random columns in rows within a random 0..5 of the person's own row (rows wrap), never oneself. `PopulationSmallWorld`: the 24 cells within chebyshev distance 2 on the torus. In Ascape this comes from `Array2DSmallWorld` with radius 2 and a random edge ratio of 0 (never set), so no links are rewired. `PopulationSmallWorld.calculateNeighbors` on the scape is never called by Ascape and is not ported.
- Views: grid coloured as the legacy `Person.getColor` (rational magenta, random yellow, imitators blue working, red retired, white dead), counts of working, retired and dead, the retired share of eligible living people, retired by strategy, and a histogram of the ages of the retired. The legacy model has no chart; these are the main statistics.
- Parameters: the legacy bean properties with setters: `retirementEligibilityAge` (65), `fractionRational` (0.10), `fractionRandom` (0.05), and for the two random-network models `minNetworkSize` (10) and `maxNetworkSize` (25). `PopulationSmallWorld` has no network size. As in Java, rational + random above 1 is an error (raised when the model is built), and so is a maximum network size below the minimum.

## Deviations and kept legacy behaviour

- Kept: `Population.createScape` calls `setPrototypeAgent(new Person())` after `PopulationCoupled`'s constructor installed `PersonCoupled`, so the coupled person class is never used. `PopulationCoupled` therefore behaves exactly as `Population`, and its `fractionCoupled` property has no effect (so it is not a parameter). The `PersonCoupled` code itself would not work if it ran (it casts a space to a scape, and its second loop never executes because it loops up to the list's current size). A test checks that the coupled model reproduces the plain model run for run.
- Kept: people reborn at age 100 are re-initialized with the age of their row at the moment of rebirth, which is still 100, and the youngest row shifts only after the tick. So age 100 is held for two ticks, and the reborn person is first eligible and working at age 100, and is reborn again one tick later.
- Kept: everyone starts WORKING regardless of age, so all older people are eligible at the start and retirement begins at once. Death is detected by age equality (`age == deathAge`) as well as at initialization.
- Kept: status DEAD persons keep their network and are only reborn by ageing past 100. Dead and retired people are counted in the same grid.
- Kept: imitators count only eligible, non-dead network members as the sample but count every retired network member in the poll.
- Not ported: the commented-out age-colouring features, call-order colouring and network drawing.
- Random streams differ from Java's; runs are deterministic per seed only.
