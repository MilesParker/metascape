// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.cv.Citizen, CitizenBlueGreen, Cop (with CellOccupant and Agent behaviour from org.ascape.model).
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { Occupant, type Cell, type GridScape } from '@metascape/engine';
import { findNearest, forEachWithin } from './vision';

/** Citizen states. */
export const QUIESCENT = 1;
export const ACTIVE = 2;
export const IN_JAIL = -1;

/** Group codes of Model II citizens (legacy values: green 1, blue 2). */
export const GREEN = 1;
export const BLUE = 2;

/** Java's `Integer.MAX_VALUE`: a jail term that never ends. */
export const NEVER_RELEASED = 2147483647;

/**
 * The arrest probability modifier: k is set so that the probability of arrest
 * is 0.9 if only this agent is active and one cop is present.
 */
const K = -Math.log(0.1);

/** Fixed settings of a run, read by the agents. */
export interface CvSettings {
  readonly width: number;
  readonly height: number;
  readonly initialPopulationDensity: number;
  readonly initialCopDensity: number;
  readonly copVision: number;
  readonly citizenVision: number;
  readonly legitimacy: number;
  readonly activeThreshold: number;
  readonly jailTerm: number;
  /** Model II only. */
  readonly fissionProbability: number;
  readonly deathAge: number;
  readonly initialBlueLegitimacy: number;
  readonly initialGreenLegitimacy: number;
  readonly evaporation: number;
}

/** The state of a run that the agents share and that rules or runs may change. */
export class CvWorld {
  legitimacy: number;
  targetCopDensity: number;
  /** Kills during the current tick, reset after each tick's data sample. */
  killsByBlue = 0;
  killsByGreen = 0;
  blueDistrust = 0;
  greenDistrust = 0;
  blueLegitimacy: number;
  greenLegitimacy: number;

  constructor(
    readonly grid: GridScape<Cell>,
    readonly settings: CvSettings,
  ) {
    this.legitimacy = settings.legitimacy;
    this.targetCopDensity = settings.initialCopDensity;
    this.blueLegitimacy = settings.initialBlueLegitimacy;
    this.greenLegitimacy = settings.initialGreenLegitimacy;
  }
}

/** Base of agents standing on the lattice (legacy `CellOccupant`). */
export class LatticeOccupant extends Occupant<Cell> {
  constructor(protected readonly world: CvWorld) {
    super();
  }

  /** Try one random neighboring cell; move only if it is free (legacy `randomWalk`). */
  randomWalk(): void {
    const here = this.cell;
    if (!here) throw new Error('Random walk called on an agent with no location');
    const candidate = this.random.pick(here.neighbors);
    if (candidate.isAvailable) this.moveTo(candidate);
  }

  /** Move to a uniformly chosen unoccupied cell, or die if there is none. */
  moveToRandomLocation(): void {
    const target = this.world.grid.randomAvailableCell();
    if (target) this.moveTo(target);
    else this.die();
  }
}

/** A cop: arrests an active citizen in view, then walks randomly. */
export class Cop extends LatticeOccupant {
  /** Jail the nearest active citizen within cop vision and move to its cell. */
  patrol(): void {
    const here = this.cell;
    if (!here) return;
    const target = findNearest(
      this.world.grid,
      here,
      false,
      this.world.settings.copVision,
      (cell) => {
        const o = cell.occupant;
        return o instanceof Citizen && o.state === ACTIVE;
      },
      this.world.grid.random,
    );
    if (target) {
      (target.occupant as Citizen).capture();
      this.moveTo(target);
    }
  }
}

/** A citizen with a fixed hardship and risk aversion who may turn active. */
export class Citizen extends LatticeOccupant {
  state = QUIESCENT;
  hardship = 0;
  riskAversion = 0;
  age = 0;
  jailTermsLeft = 0;
  oldHome: Cell | undefined;
  protected inherited = false;

  override initialize(): void {
    if (this.inherited) return;
    this.hardship = this.random.float();
    this.riskAversion = this.random.float();
    // Age is random up to the maximum age.
    this.age = this.random.int(0, this.world.settings.deathAge + 1);
  }

  override randomWalk(): void {
    if (this.state !== IN_JAIL) super.randomWalk();
  }

  get isInJail(): boolean {
    return this.state === IN_JAIL;
  }

  get grievance(): number {
    return (
      this.hardship * (1.0 - this.world.legitimacy) * (1.0 - this.world.settings.activeThreshold)
    );
  }

  /** Cops and active citizens within vision, counted in one pass. */
  protected tally(): { cops: number; active: number } {
    const tally = { cops: 0, active: 0 };
    const here = this.cell;
    if (!here) return tally;
    forEachWithin(this.world.grid, here, false, this.world.settings.citizenVision, (cell) => {
      const o = cell.occupant;
      if (o instanceof Cop) tally.cops++;
      else if (o instanceof Citizen && o.state === ACTIVE) tally.active++;
    });
    return tally;
  }

  /**
   * The estimated probability of arrest. As in the legacy code, cops / (active + 1)
   * is an integer division (both counts are Java ints).
   */
  get probabilityArrestEstimate(): number {
    const { cops, active } = this.tally();
    return 1 - Math.pow(Math.E, -K * Math.trunc(cops / (active + 1)));
  }

  get riskCalculation(): number {
    return this.probabilityArrestEstimate * this.riskAversion;
  }

  /** Release the citizen when the jail term is over. */
  checkJail(): void {
    if (!this.isInJail) return;
    this.jailTermsLeft--;
    if (this.jailTermsLeft <= 0) {
      this.state = QUIESCENT;
      const home = this.oldHome;
      const spot = home
        ? findNearest(
            this.world.grid,
            home,
            true,
            16.0,
            (c) => c.isAvailable,
            this.world.grid.random,
          )
        : undefined;
      if (spot) this.moveTo(spot);
      else this.moveToRandomLocation();
    }
  }

  protected decideStateOn(n: number): void {
    this.state = n > this.world.settings.activeThreshold ? ACTIVE : QUIESCENT;
  }

  decideState(): void {
    if (!this.isInJail) this.decideStateOn(this.grievance - this.riskCalculation);
  }

  /** Jailed for a random term up to the jail term; steps off the lattice. */
  capture(): void {
    this.state = IN_JAIL;
    const term = this.world.settings.jailTerm;
    this.jailTermsLeft = term !== NEVER_RELEASED ? this.random.int(0, term + 1) : term;
    this.oldHome = this.cell;
    this.leave();
  }

  metabolism(): void {
    this.age++;
  }

  deathCondition(): boolean {
    return this.age > this.world.settings.deathAge;
  }

  death(): void {
    if (this.deathCondition()) this.die();
  }

  fissionCondition(): boolean {
    return this.random.float() < this.world.settings.fissionProbability;
  }

  fissioning(): void {
    if (this.fissionCondition()) this.fission();
  }

  protected copyTo(child: Citizen): void {
    child.state = this.state;
    child.hardship = this.hardship;
    child.riskAversion = this.riskAversion;
    child.jailTermsLeft = this.jailTermsLeft;
    child.oldHome = this.oldHome;
    child.age = 0;
    child.inherited = true;
  }

  protected createChild(): Citizen {
    return new Citizen(this.world);
  }

  /** A clone appears on a random free neighboring cell, if there is one. */
  fission(): void {
    const here = this.cell;
    if (!here) return;
    const free = here.neighbors.filter((n) => n.isAvailable);
    if (free.length === 0) return;
    const child = this.createChild();
    this.copyTo(child);
    this.scape.add(child);
    child.moveTo(this.random.pick(free));
  }
}

/** A Model II citizen belonging to the green or the blue group. */
export class CitizenBlueGreen extends Citizen {
  group = GREEN;

  override initialize(): void {
    const inherited = this.inherited;
    super.initialize();
    if (!inherited) this.group = this.random.int(1, 3);
  }

  protected override createChild(): Citizen {
    return new CitizenBlueGreen(this.world);
  }

  protected override copyTo(child: Citizen): void {
    super.copyTo(child);
    (child as CitizenBlueGreen).group = this.group;
  }

  get otherGroup(): number {
    return this.group === BLUE ? GREEN : BLUE;
  }

  private isOtherGroup(cell: Cell): boolean {
    const o = cell.occupant;
    return o instanceof CitizenBlueGreen && o.group === this.otherGroup;
  }

  /** Active only if a member of the other group is in view. */
  protected override decideStateOn(n: number): void {
    if (n > this.world.settings.activeThreshold) {
      this.state = ACTIVE;
      let other = 0;
      const here = this.cell;
      if (here) {
        forEachWithin(this.world.grid, here, false, this.world.settings.citizenVision, (c) => {
          if (this.isOtherGroup(c)) other++;
        });
      }
      if (other === 0) this.state = QUIESCENT;
    } else {
      this.state = QUIESCENT;
    }
  }

  /** Arrest-or-retaliation estimate: `(cops + 0.5 * other group) / (active + 1)`, real division. */
  get probabilityArrestOrRetaliationEstimate(): number {
    let cops = 0;
    let active = 0;
    let other = 0;
    const here = this.cell;
    if (here) {
      forEachWithin(this.world.grid, here, false, this.world.settings.citizenVision, (c) => {
        const o = c.occupant;
        if (o instanceof Cop) cops++;
        else if (o instanceof Citizen) {
          if (o.state === ACTIVE) active++;
          if (this.isOtherGroup(c)) other++;
        }
      });
    }
    return 1 - Math.pow(Math.E, -K * ((cops + 0.5 * other) / (active + 1)));
  }

  decideStateWithRetaliation(): void {
    if (!this.isInJail) {
      this.decideStateOn(
        this.grievance - this.probabilityArrestOrRetaliationEstimate * this.riskAversion,
      );
    }
  }

  /** An active citizen kills the nearest other-group citizen in view and takes its place. */
  attackOther(): void {
    const here = this.cell;
    if (this.state !== ACTIVE || !here) return;
    const target = findNearest(
      this.world.grid,
      here,
      false,
      this.world.settings.citizenVision,
      (c) => this.isOtherGroup(c),
      this.world.grid.random,
    );
    if (target) {
      if (this.group === BLUE) this.world.killsByBlue++;
      else this.world.killsByGreen++;
      (target.occupant as Citizen).die();
      this.moveTo(target);
    }
  }
}
