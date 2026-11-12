// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.firms.Model1, Employee, Firm, UtilityFunction.
// The golden-section search is a port of org.ascape.util.Function.maximize, which Employee relies on.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Agent,
  colors,
  defineModel,
  gradient,
  GridScape,
  gridView,
  histogramView,
  int,
  Scape,
  timeSeriesView,
  Cell,
} from '@metascape/engine';

/** Economy of scale factor (legacy `UtilityFunction.sigma`). */
const SIGMA = 1;
/** Exponent of the economy of scale (legacy `UtilityFunction.beta`). */
const BETA = 2;
/** Neighbourhood size used to find comparison firms (legacy `nFriends`); the radius is half of it. */
const N_FRIENDS = 2;

const TAU = (1 + Math.sqrt(5)) / 2;
const SECT_LARGE = TAU - 1;
const SECT_SMALL = 1 - SECT_LARGE;
const RESOLUTION = 0.01;

/** Output of a firm as a function of total effort (legacy `UtilityFunction.output`). */
export function output(effort: number): number {
  return effort + SIGMA * Math.pow(effort, BETA);
}

/** An employee's utility for an effort level, given the firm it would work in (legacy `UtilityFunction`). */
export class UtilityFunction {
  /** Preference for income (inversely, for leisure). */
  theta = 0;
  baseSize = 0;
  baseEffort = 0;

  solveFor(e: number): number {
    return (
      Math.pow(output(this.baseEffort + e) / (this.baseSize + 1), this.theta) *
      Math.pow(1 - e, 1 - this.theta)
    );
  }

  /**
   * Golden-section search for the effort in [0, 1] with the highest utility
   * (legacy `Function.maximize`, ported step by step, including its
   * bookkeeping of the two probe values).
   */
  maximize(): number {
    let x1 = 0.0;
    let x2 = SECT_SMALL;
    let x3 = SECT_LARGE;
    let x4 = 1.0;
    let f2 = 0.0;
    let f3 = 0.0;
    let gap = 1.0;
    while (gap > RESOLUTION) {
      f2 = this.solveFor(x2);
      f3 = this.solveFor(x3);
      if (f2 < f3) {
        const gap1 = x3 - x2;
        const gap2 = x4 - x3;
        x1 = x2;
        if (gap1 > gap2) {
          x2 = x3 - gap1 * SECT_SMALL;
          f2 = this.solveFor(x2);
          gap = gap1;
        } else {
          x2 = x3;
          x3 = x2 + gap2 * SECT_SMALL;
          f2 = f3;
          f3 = this.solveFor(x2);
          gap = gap2;
        }
      } else {
        const gap1 = x2 - x1;
        const gap2 = x3 - x2;
        x4 = x3;
        if (gap1 > gap2) {
          x3 = x2;
          x2 = x3 - gap1 * SECT_SMALL;
          f2 = this.solveFor(x2);
          gap = gap1;
        } else {
          x3 = x2 + gap2 * SECT_SMALL;
          f2 = f3;
          f3 = this.solveFor(x2);
          gap = gap2;
        }
      }
    }
    return f2 > f3 ? x2 : x3;
  }
}

/** A firm: a group of employees whose total effort produces output with increasing returns. */
export class Firm extends Agent {
  readonly employees: Employee[] = [];
  age = 0;
  lpEffort = 0;
  lpSize = 1;
  /** Fixed display slot, as in the legacy fixed-position firm views; -1 when not placed. */
  slot = -1;

  constructor(private readonly world?: FirmsWorld) {
    super();
  }

  /** Frees the display slot of a dissolved firm. */
  override removed(): void {
    const slots = this.world?.slots;
    if (slots && this.slot >= 0 && slots[this.slot] === this) slots[this.slot] = undefined;
  }

  get size(): number {
    return this.employees.length;
  }

  /** Total effort of the employees. */
  effort(): number {
    let result = 0;
    for (const e of this.employees) result += e.effort();
    return result;
  }

  get avgEffort(): number {
    return this.size > 0 ? this.effort() / this.size : 0;
  }

  get avgOutput(): number {
    return this.size > 0 ? this.output() / this.size : 0;
  }

  output(): number {
    return output(this.effort());
  }

  hire(employee: Employee): void {
    this.employees.push(employee);
  }

  /** Removes an employee; the firm dissolves when it has none left. */
  terminate(employee: Employee): void {
    const index = this.employees.indexOf(employee);
    if (index < 0) throw new Error('Employee not member of firm attempting to leave.');
    this.employees.splice(index, 1);
    if (this.employees.length === 0) this.die();
  }

  /** Passive per-tick bookkeeping (legacy `Firm.iterate`). */
  iterate(): void {
    this.age++;
    this.lpEffort = this.effort();
    this.lpSize = this.size;
  }
}

/** The firms of a run, kept in the order they were formed. */
export interface FirmsWorld {
  readonly firms: Scape<Firm>;
  /** Display slots, one per possible firm; a firm keeps its slot until it dissolves. */
  readonly slots: (Firm | undefined)[];
}

/** An employee with a work preference who joins, leaves and founds firms to maximize utility. */
export class Employee extends Agent {
  readonly utility = new UtilityFunction();
  firm!: Firm;
  /** Effort in the current period. */
  cpEffort = 0;
  /** Effort in the last period. */
  lpEffort = 0;

  constructor(private readonly world: FirmsWorld) {
    super();
  }

  override initialize(): void {
    this.utility.theta = Math.abs(this.random.float());
    this.cpEffort = this.utility.theta;
    this.firm = formFirm(this.world, this);
  }

  effort(): number {
    return this.cpEffort;
  }

  /**
   * The other firms next to this employee's firm in the order firms were
   * formed: the previous and the next, wrapping around, or all others when
   * there are three firms or fewer (legacy `findWithin` on a list space).
   */
  comparisonFirms(): Firm[] {
    const all = this.world.firms.members;
    const n = all.length;
    const rank = all.indexOf(this.firm);
    const radius = Math.floor(N_FRIENDS / 2);
    if (n > radius * 2 + 1) {
      return [all[(rank - 1 + n) % n]!, all[(rank + 1) % n]!];
    }
    return all.filter((_, i) => i !== rank);
  }

  iterate(): void {
    const comparison = this.comparisonFirms();
    const proposed = this.maximizeUtilityForEffortAndOptions(comparison);
    if (proposed === CURRENT_FIRM) return;
    if (proposed === NEW_FIRM) this.formNewFirm();
    else this.join(comparison[proposed]!);
  }

  private maximizeUtilityForEffortAndOptions(comparison: readonly Firm[]): number {
    const u = this.utility;
    this.lpEffort = this.cpEffort;
    // The employee does not count itself when assessing last period's effort.
    u.baseEffort = this.firm.effort() - this.effort();
    u.baseSize = this.firm.size - 1;
    let currentEffort = u.maximize();
    let bestUtility = u.solveFor(currentEffort);
    this.cpEffort = currentEffort;
    let proposed = CURRENT_FIRM;

    u.baseEffort = 0;
    u.baseSize = 0;
    currentEffort = u.maximize();
    let currentUtility = u.solveFor(currentEffort);
    if (currentUtility > bestUtility) {
      bestUtility = currentUtility;
      this.cpEffort = currentEffort;
      proposed = NEW_FIRM;
    }

    for (let i = 0; i < comparison.length; i++) {
      u.baseEffort = comparison[i]!.effort();
      u.baseSize = comparison[i]!.size;
      currentEffort = u.maximize();
      currentUtility = u.solveFor(currentEffort);
      if (currentUtility > bestUtility) {
        bestUtility = currentUtility;
        this.cpEffort = currentEffort;
        proposed = i;
      }
    }
    return proposed;
  }

  join(firm: Firm): void {
    this.firm.terminate(this);
    this.firm = firm;
    firm.hire(this);
  }

  private formNewFirm(): void {
    this.cpEffort = this.utility.theta;
    this.firm.terminate(this);
    this.firm = formFirm(this.world, this);
  }
}

const CURRENT_FIRM = -2;
const NEW_FIRM = -1;

/** Founds a firm with a single employee (legacy `Firm.form`). */
function formFirm(world: FirmsWorld, employee: Employee): Firm {
  const firm = world.firms.add(new Firm(world));
  firm.hire(employee);
  firm.lpSize = 1;
  firm.lpEffort = employee.effort();
  const slot = world.slots.indexOf(undefined);
  if (slot >= 0) {
    world.slots[slot] = firm;
    firm.slot = slot;
  } else {
    firm.slot = world.slots.length;
    world.slots.push(firm);
  }
  return firm;
}

const maxOf = (firms: readonly Firm[], pick: (f: Firm) => number): number => {
  let max = 0;
  for (const f of firms) max = Math.max(max, pick(f));
  return max;
};

/** The Emergence of Firms model (legacy `Model1`). */
export const firmsModel = defineModel({
  name: 'Emergence of Firms',
  description:
    'Employees choose how hard to work and which firm to work in, comparing their own firm, a new firm of their own and the neighbouring firms. Because output has local increasing returns, firms form and grow into a skewed, power-law-like size distribution without any central coordination.',
  provenance: {
    authors: 'Robert L. Axtell',
    citation:
      'Axtell, R. L. (1999). The emergence of firms in a population of agents: Local increasing returns, unstable Nash equilibria, and power law size distributions. Brookings Institution, Center on Social and Economic Dynamics, Working Paper No. 3.',
    portedFrom: 'Ascape 5.6.1, edu.brook.firms.Model1',
    copyright:
      'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.',
    note: 'The legacy firm views (columns of firms in fixed slots, coloured by average effort or output) are drawn as grids of firms in slot order and in order of age.',
  },
  parameters: {
    employees: int(500, {
      min: 2,
      max: 5000,
      label: 'Employees',
      description:
        'Number of employees. Fixed at 500 in the legacy model; one twentieth of them act in each tick.',
    }),
  },
  build(sim) {
    const n = sim.parameters.employees;
    const firms = sim.addScape(new Scape<Firm>({ name: 'firms', order: 'sequential' }));
    const world: FirmsWorld = { firms, slots: [] };
    firms.addRule('Iterate', (firm) => firm.iterate());
    const employees = sim.addScape(
      new Scape<Employee>({
        name: 'employees',
        size: n,
        create: () => new Employee(world),
        activations: Math.floor(n / 20),
        sampling: 'tour',
      }),
    );
    employees.addRule('Iterate', (employee) => employee.iterate());

    sim.data.count(firms, 'firms');
    sim.data.measure(firms, 'firm size', (f) => f.size, {
      statistics: ['mean', 'max', 'stdDev'],
    });
    sim.data.measure(firms, 'firm unit output', (f) => f.avgOutput, {
      statistics: ['mean', 'min', 'max'],
    });
    sim.data.measure(employees, 'effort', (e) => e.effort(), { statistics: ['mean'] });
    sim.data.distribution(firms, 'firm sizes', (f) => f.size, {
      bins: 25,
      min: 1,
      max: Math.max(26, Math.floor(n / 5) + 1),
    });

    const side = Math.ceil(Math.sqrt(n));
    const grid = sim.addScape(
      new GridScape<Cell>({
        name: 'firm slots',
        width: side,
        height: side,
        wrap: false,
        neighborhood: 'vonNeumann',
      }),
    );
    const effortColor = gradient(colors.white, colors.blue);
    const outputColor = gradient(colors.red, colors.green);
    let maxTick = -1;
    let maxUnit = 0;
    const unitMax = (): number => {
      if (maxTick !== sim.tick) {
        maxTick = sim.tick;
        maxUnit = maxOf(firms.members, (f) => f.avgOutput);
      }
      return maxUnit;
    };
    const bySlot = (cell: Cell): Firm | undefined => world.slots[cell.y * side + cell.x];
    const byAge = (cell: Cell): Firm | undefined => firms.members[cell.y * side + cell.x];
    const effort = (f: Firm | undefined): number => (f ? effortColor(f.avgEffort) : colors.white);
    const unit = (f: Firm | undefined): number => {
      if (!f) return colors.white;
      const max = unitMax();
      return outputColor(max > 0 ? f.avgOutput / max : 0);
    };
    sim.addView(
      gridView<Cell>({
        title: 'Firm Effort',
        grid,
        background: colors.white,
        cellColor: (c) => effort(bySlot(c)),
      }),
    );
    sim.addView(
      gridView<Cell>({
        title: 'Firm Output',
        grid,
        background: colors.white,
        cellColor: (c) => unit(bySlot(c)),
      }),
    );
    sim.addView(
      gridView<Cell>({
        title: 'Firm Effort by Age',
        grid,
        background: colors.white,
        cellColor: (c) => effort(byAge(c)),
      }),
    );
    sim.addView(
      gridView<Cell>({
        title: 'Firms Output by Age',
        grid,
        background: colors.white,
        cellColor: (c) => unit(byAge(c)),
      }),
    );
    sim.addView(
      histogramView({ title: 'Firm sizes', distribution: 'firm sizes', color: colors.teal }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Firms and their size',
        series: ['firms', 'firm size.mean', 'firm size.max'],
        yMin: 0,
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Effort and unit output',
        series: ['effort.mean', 'firm unit output.mean', 'firm unit output.max'],
        yMin: 0,
      }),
    );
  },
});
