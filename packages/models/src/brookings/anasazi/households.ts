// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.aa.HouseholdBase, HouseholdAggregate,
// HouseholdGreedy, HouseholdDisaggregate, Person, PersonClan, FindMateRule, ClanFindMateRule.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.

/**
 * The agents of the Artificial Anasazi models: households that farm maize
 * and settle near water, and, in the disaggregated variants, the people who
 * make up households, marry and found new ones.
 */
import { Agent, type Scape } from '@metascape/engine';
import { intInclusive, javaInt, realInRange } from './java-random';
import {
  Farm,
  randomClan,
  type Clan,
  type FarmingHousehold,
  type Location,
  type LongHouseValley,
  type Settlement,
  type ValleyParameters,
} from './valley';

/** The model parameters households read (the legacy `LHV` bean properties). */
export interface HouseholdParameters extends ValleyParameters {
  readonly baseNutritionNeed: number;
  readonly householdMinNutritionNeed: number;
  readonly householdMaxNutritionNeed: number;
  readonly minFertilityAge: number;
  readonly maxFertilityAge: number;
  readonly minFertilityEndsAge: number;
  readonly maxFertilityEndsAge: number;
  readonly minDeathAge: number;
  readonly maxDeathAge: number;
  readonly minFertility: number;
  readonly maxFertility: number;
  readonly maizeGiftToChild: number;
  readonly waterSourceDistance: number;
  readonly yearsOfStock: number;
  readonly householdMinInitialAge: number;
  readonly householdMaxInitialAge: number;
  readonly householdMinInitialCorn: number;
  readonly householdMaxInitialCorn: number;
}

/** Extra parameters of the disaggregated models (`LHVDisaggregate`). */
export interface PersonParameters extends HouseholdParameters {
  readonly personMinInitialAge: number;
  readonly personMaxInitialAge: number;
}

/** What households and people share within one run. */
export interface HouseholdContext<P extends HouseholdParameters = HouseholdParameters> {
  readonly world: LongHouseValley;
  readonly parameters: P;
  households(): Scape<HouseholdBase>;
  people(): Scape<Person>;
}

/** A location of low erosion (`Location.LOW_EROSION`). */
function lowErosion(location: Location): boolean {
  return location.onMap && location.environmentZone.hydrology <= 0.0;
}

/** Value of a location as extra farmland (`HouseholdBase.BEST_FARM`). */
function bestFarm(location: Location): number {
  return location.isFree ? location.baseYield : 0.0;
}

/**
 * The common household behaviour (`HouseholdBase`): finding farmland and a
 * settlement site near water, harvesting and storing maize, moving when the
 * expected harvest falls short.
 */
export abstract class HouseholdBase extends Agent implements FarmingHousehold {
  readonly context: HouseholdContext;
  farms: Farm[] = [];
  settlement: Settlement | null = null;
  lastHarvest = 0;
  fertilityAge = 0;
  deathAge = 0;
  fertilityEndsAge = 0;
  fertility = 0;
  /**
   * Maize by age, newest first. The last slot holds the oldest maize while
   * stocks are aged and is consumed first, but is not counted in the stocks.
   */
  agedCornStocks: number[] = [];
  clan: Clan | null = null;

  constructor(context: HouseholdContext) {
    super();
    this.context = context;
  }

  get parameters(): HouseholdParameters {
    return this.context.parameters;
  }

  get world(): LongHouseValley {
    return this.context.world;
  }

  override initialize(): void {
    const p = this.parameters;
    this.agedCornStocks = new Array<number>(p.yearsOfStock + 1).fill(0);
    for (let i = 0; i < this.agedCornStocks.length - 1; i++) {
      this.agedCornStocks[i] = intInclusive(
        this.random,
        p.householdMinInitialCorn,
        p.householdMaxInitialCorn,
      );
    }
    this.lastHarvest = 0;
    this.farms = [];
    this.settlement = null;
    this.clan = null;
    this.fertilityAge = intInclusive(this.random, p.minFertilityAge, p.maxFertilityAge);
    this.deathAge = intInclusive(this.random, p.minDeathAge, p.maxDeathAge);
    this.fertilityEndsAge = intInclusive(this.random, p.minFertilityEndsAge, p.maxFertilityEndsAge);
    this.fertility = realInRange(this.random, p.minFertility, p.maxFertility);
  }

  /** Maize needed per year. */
  abstract get nutritionNeed(): number;

  /** How many farms the household can work. */
  abstract get numAdults(): number;

  /** Rule "Death": dies if the death condition holds. */
  death(): void {
    if (this.deathCondition()) this.perish();
  }

  deathCondition(): boolean {
    return false;
  }

  /** Rule "Fissioning": fissions if the fission condition holds. */
  fissioning(): void {
    if (this.fissionCondition()) this.fission();
  }

  fissionCondition(): boolean {
    return false;
  }

  fission(): void {}

  /** Rule "Movement": moves if the movement condition holds. */
  movement(): void {
    if (this.movementCondition()) this.move();
  }

  protected addFarm(): Farm {
    const farm = new Farm(this);
    this.farms.push(farm);
    return farm;
  }

  /** Maize stored, excluding the holding slot. */
  get totalCornStocks(): number {
    let total = 0;
    for (let i = 0; i < this.parameters.yearsOfStock; i++) total += this.agedCornStocks[i]!;
    return total;
  }

  get estimateNextYearCorn(): number {
    return this.totalCornStocks + this.lastHarvest;
  }

  /** Joins the settlement at a location, founding one if there is none. */
  occupy(location: Location): void {
    if (location.settlement === null) location.createSettlement();
    this.settlement = location.settlement;
    this.settlement!.add(this);
  }

  /** Gives up all farms and leaves the settlement. */
  leave(): void {
    this.leaveAllFarms();
    if (this.settlement !== null) {
      this.settlement.remove(this);
      this.settlement = null;
    }
  }

  /** The settlement-site condition (`find_settlement_rule`). */
  isSettlementSite(location: Location): boolean {
    return (
      location.onMap &&
      location.farm === null &&
      (location.clan === null || location.clan === this.clan) &&
      this.world.hasWithin(location, lowErosion, true, 1.0)
    );
  }

  /**
   * Takes the best farmland left in the valley, then settles at the nearest
   * suitable site to the nearest water within the water source distance
   * (`HouseholdBase.findFarmAndSettlement`). Locations passed over are made
   * available again, except when the valley has no productive land left.
   */
  findFarmAndSettlement(): void {
    const world = this.world;
    const farmsSearched: Location[] = [];
    while (this.farms.length === 0) {
      const farmLocation = world.removeBestLocation();
      if (farmLocation === null) {
        // Legacy: returns without restoring the locations already searched.
        return;
      }
      if (farmLocation.baseYield > 0) {
        if (farmLocation.clan === null || farmLocation.clan === this.clan) {
          const nearestWater = world.findNearestWater(
            farmLocation,
            this.parameters.waterSourceDistance,
          );
          if (nearestWater !== null) {
            if (this.settlement !== null) {
              this.settlement.remove(this);
              this.settlement = null;
            }
            this.addFarm().occupy(farmLocation);
            const site = world.findNearest(
              nearestWater,
              (location) => this.isSettlementSite(location),
              true,
              Number.MAX_VALUE,
            );
            if (site === null) throw new Error('Unexpected model condition in household');
            this.occupy(site);
            if (!this.findFarmsForNutritionalNeed()) {
              this.leave();
              farmsSearched.push(farmLocation);
              break;
            }
          } else {
            farmsSearched.push(farmLocation);
          }
        } else {
          farmsSearched.push(farmLocation);
        }
      } else {
        farmsSearched.push(farmLocation);
        break;
      }
    }
    for (const unused of farmsSearched) unused.makeAvailable();
  }

  leaveAllFarms(): void {
    for (const farm of this.farms) farm.leave();
    this.farms = [];
  }

  /**
   * Adds farms near the settlement, one per adult, until their base yields
   * cover the nutrition need; false if that is not possible.
   */
  findFarmsForNutritionalNeed(): boolean {
    const need = this.nutritionNeed;
    let adultCount = 0;
    const adults = this.numAdults;
    let currentEstimate = 0;
    for (const farm of this.farms) {
      currentEstimate = javaInt(currentEstimate + farm.location!.baseYield);
      adultCount++;
    }
    for (;;) {
      if (currentEstimate >= need) return true;
      adultCount++;
      if (adultCount > adults) return false;
      const settlementLocation = this.settlement?.location;
      if (!settlementLocation) throw new Error('Household without a settlement looked for farms');
      const best = this.world.findMaximumWithin(
        settlementLocation,
        bestFarm,
        false,
        this.parameters.waterSourceDistance,
      );
      if (best !== null && best.isFree && best.baseYield > 0.0) {
        this.addFarm().occupy(best);
        currentEstimate = javaInt(currentEstimate + best.baseYield);
      } else {
        return false;
      }
    }
  }

  /** Gives a share of every year's stock to a new household. */
  giveMaizeGift(recipient: HouseholdBase): void {
    const gift = this.parameters.maizeGiftToChild;
    for (let i = 0; i < this.agedCornStocks.length - 1; i++) {
      recipient.agedCornStocks[i] = javaInt(this.agedCornStocks[i]! * gift);
      this.agedCornStocks[i] = javaInt(this.agedCornStocks[i]! * (1.0 - gift));
    }
  }

  /** Eats `amount`, oldest maize first; returns the shortfall. */
  consumeCorn(amount: number): number {
    let remaining = amount;
    for (let i = this.parameters.yearsOfStock; i >= 0; i--) {
      if (this.agedCornStocks[i]! >= remaining) {
        this.agedCornStocks[i]! -= remaining;
        return 0;
      }
      remaining -= this.agedCornStocks[i]!;
      this.agedCornStocks[i] = 0;
    }
    return remaining;
  }

  /** Harvests up to one farm per adult and ages the stocks. */
  metabolism(): void {
    this.lastHarvest = 0;
    let adultCount = 0;
    const adults = this.numAdults;
    for (const farm of this.farms) {
      this.lastHarvest = javaInt(this.lastHarvest + farm.location!.findRandomYield());
      adultCount++;
      if (adultCount >= adults) break;
    }
    for (let i = this.parameters.yearsOfStock - 1; i >= 0; i--) {
      this.agedCornStocks[i + 1] = this.agedCornStocks[i]!;
    }
    this.agedCornStocks[0] = this.lastHarvest;
  }

  movementCondition(): boolean {
    if (this.estimateNextYearCorn < this.nutritionNeed) {
      if (!this.findFarmsForNutritionalNeed()) {
        this.world.counts.movements++;
        return true;
      }
      return false;
    }
    return false;
  }

  /** Leaves and looks for new land; a household that finds none leaves the valley. */
  move(): void {
    this.leave();
    this.findFarmAndSettlement();
    if (this.farms.length === 0 || this.settlement === null) {
      this.perish();
      this.world.counts.departures++;
    }
  }

  /** `HouseholdBase.die`: leaves the households scape, its farms and its settlement. */
  perish(): void {
    if (!this.alive) throw new Error('Tried to kill an agent not a memeber of its Scape.');
    this.die();
    this.leave();
  }
}

/** A household treated as a single unit of typical size (`HouseholdAggregate`). */
export class HouseholdAggregate extends HouseholdBase {
  age = 0;
  nutritionNeedValue = 0;
  nutritionNeedRemaining = 0;

  override initialize(): void {
    super.initialize();
    const p = this.parameters;
    this.age = intInclusive(this.random, p.householdMinInitialAge, p.householdMaxInitialAge);
    this.nutritionNeedValue = intInclusive(
      this.random,
      p.householdMinNutritionNeed,
      p.householdMaxNutritionNeed,
    );
  }

  get nutritionNeed(): number {
    return this.nutritionNeedValue;
  }

  get numAdults(): number {
    return 1;
  }

  override metabolism(): void {
    super.metabolism();
    this.age++;
    this.nutritionNeedRemaining = this.consumeCorn(this.nutritionNeedValue);
  }

  /** Creates the household a fission produces. */
  protected createChild(): HouseholdAggregate {
    return new HouseholdAggregate(this.context);
  }

  override fission(): void {
    const child = this.createChild();
    this.context.households().add(child);
    child.age = 0;
    this.giveMaizeGift(child);
    child.move();
    // "For now, record fissions regardless of successful move to match C++ code".
    this.world.counts.fissions++;
  }

  override deathCondition(): boolean {
    if (this.nutritionNeedRemaining > 0) {
      this.world.counts.deathsStarvation++;
      return true;
    }
    if (this.age > this.deathAge) {
      this.world.counts.deathsOldAge++;
      return true;
    }
    return false;
  }

  override fissionCondition(): boolean {
    return (
      this.age > this.fertilityAge &&
      this.age <= this.fertilityEndsAge &&
      this.random.float() < this.fertility
    );
  }
}

/**
 * `HouseholdGreedy`: an aggregate household meant to claim buffer farms
 * around its farm. The claiming code is commented out in the legacy source,
 * so its buffer is always empty and it behaves exactly like
 * {@link HouseholdAggregate}, except that its children are greedy too.
 */
export class HouseholdGreedy extends HouseholdAggregate {
  /** Always empty, as in the legacy code. */
  readonly bufferFarms: Farm[] = [];

  protected override createChild(): HouseholdAggregate {
    return new HouseholdGreedy(this.context);
  }

  override leave(): void {
    super.leave();
    for (const farm of this.bufferFarms) farm.leave();
  }
}

/** A household made of individual people (`HouseholdDisaggregate`). */
export class HouseholdDisaggregate extends HouseholdBase {
  readonly members: Person[] = [];

  override initialize(): void {
    this.members.length = 0;
    super.initialize();
  }

  /**
   * `HouseholdDisaggregate.createScape`: a random clan, a mother and a father
   * of reproductive age, married, and three children.
   */
  createMembers(): void {
    const p = this.context.parameters;
    const people = this.context.people();
    this.clan = randomClan(this.random);
    const mom = people.add(new Person(this.context));
    mom.setHousehold(this);
    mom.age = intInclusive(this.random, p.minFertilityAge, p.minDeathAge);
    mom.female = true;
    const dad = people.add(new Person(this.context));
    dad.setHousehold(this);
    dad.age = intInclusive(this.random, p.minFertilityAge, p.minDeathAge);
    dad.female = false;
    dad.setMate(mom);
    mom.setMate(dad);
    for (let i = 0; i < 3; i++) {
      const child = people.add(new Person(this.context));
      child.setHousehold(this);
      child.age = intInclusive(this.random, 0, p.minFertilityAge);
    }
  }

  addMember(person: Person): void {
    this.members.push(person);
  }

  /** Removes a member; an emptied household dies. */
  removeMember(person: Person): boolean {
    const index = this.members.indexOf(person);
    if (index < 0) return false;
    this.members.splice(index, 1);
    if (this.members.length === 0 && this.alive) this.perish();
    return true;
  }

  /** Everyone still in the household dies with it. */
  override perish(): void {
    for (const person of [...this.members]) person.perish();
    if (this.alive) {
      super.perish();
      this.world.counts.householdsDisbanded++;
    }
  }

  get nutritionNeed(): number {
    let total = 0;
    for (const person of this.members) total += person.nutritionNeed;
    return javaInt(total);
  }

  /** Always 6 in the legacy code (the member count is commented out). */
  get numAdults(): number {
    return 6;
  }
}

/** A person (`Person` as specialised by `PersonClan`, the only kind ever created). */
export class Person extends Agent {
  readonly context: HouseholdContext<PersonParameters>;
  age = 0;
  female = false;
  headOfHousehold = false;
  mate: Person | null = null;
  household: HouseholdDisaggregate | null = null;
  nutritionNeedRemaining = 0;

  constructor(context: HouseholdContext) {
    super();
    this.context = context as HouseholdContext<PersonParameters>;
  }

  override initialize(): void {
    const p = this.context.parameters;
    this.age = intInclusive(this.random, p.personMinInitialAge, p.personMaxInitialAge);
    this.female = this.random.float() < 0.5;
    this.household = null;
    this.mate = null;
    this.headOfHousehold = false;
    this.nutritionNeedRemaining = 0;
  }

  /** Full adult need above the minimum fertility age; children need 20% rising to 100%. */
  get nutritionNeed(): number {
    const p = this.context.parameters;
    if (this.age > p.minFertilityAge) return p.baseNutritionNeed;
    const fraction = Math.fround(Math.fround(this.age) / Math.fround(p.minFertilityAge));
    return javaInt(Math.fround(p.baseNutritionNeed) * (0.2 + 0.8 * fraction));
  }

  metabolism(): void {
    if (!this.household || !this.household.members.includes(this)) {
      throw new Error('Internal Error: Agent not in household');
    }
    this.age++;
  }

  leave(): void {
    if (this.household !== null && !this.household.removeMember(this)) {
      throw new Error("Internal Error: Agent Couldn't be deleted");
    }
    this.household = null;
  }

  /** `Person.die`. */
  perish(): void {
    this.context.world.counts.deaths++;
    if (this.mate !== null) {
      this.mate.setMate(null);
      this.setMate(null);
    }
    this.leave();
    this.die();
  }

  /** Rule "Death". */
  death(): void {
    if (this.deathCondition()) this.perish();
  }

  /**
   * Age-specific mortality. Age is incremented by metabolism before this
   * runs, so the infant bracket (age below 1) is never reached.
   */
  deathCondition(): boolean {
    if (this.nutritionNeedRemaining > 0) {
      this.context.world.counts.deathsStarvation++;
      return true;
    }
    const age = this.age;
    const draw = (): number => Math.fround(this.random.float());
    if (age < 1) return draw() < 0.233;
    if (age < 5) return draw() < 0.14 / 4.0;
    if (age < 15) return draw() < 0.166 / 10.0;
    if (age < 25) return draw() < 0.247 / 10.0;
    if (age < 45) return draw() < 0.362 / 20.0;
    return true;
  }

  /** Rule "Fissioning": a married woman may give birth. */
  fissioning(): void {
    if (this.fissionCondition()) this.fission();
  }

  /** Births per married woman by age, doubled because the table counts female births only. */
  fissionCondition(): boolean {
    if (this.mate === null || !this.female) return false;
    const age = this.age;
    const draw = (): number => Math.fround(this.random.float());
    if (age < this.context.parameters.minFertilityAge) return false;
    if (age < 20) return draw() < 0.047 * 2.0;
    if (age < 30) return draw() < 0.128 * 2.0;
    if (age < 35) return draw() < 0.104 * 2.0;
    if (age < 40) return draw() < 0.072 * 2.0;
    if (age < 45) return draw() < 0.03 * 2.0;
    return false;
  }

  fission(): void {
    const child = this.context.people().add(new Person(this.context));
    child.setHousehold(this.household!);
    child.age = 0;
    this.context.world.counts.births++;
  }

  /** Unmarried women past the minimum fertility age who never headed a household may marry. */
  householdCondition(): boolean {
    return (
      this.mate === null &&
      !this.headOfHousehold &&
      this.female &&
      this.age > this.context.parameters.minFertilityAge
    );
  }

  /** Rule "Form Household". */
  householdFormation(): void {
    if (this.householdCondition()) this.formHousehold();
  }

  /** A man this woman may marry (`ClanFindMateRule`): unmarried, adult, of another clan and household. */
  isEligibleMate(candidate: Person): boolean {
    return (
      candidate.mate === null &&
      !candidate.female &&
      candidate.age > this.context.parameters.minFertilityAge &&
      candidate.household!.clan !== this.household!.clan &&
      candidate.household !== this.household
    );
  }

  /**
   * `PersonClan.formHousehold`: marries a random eligible man and founds a
   * new household of her clan, which takes a maize gift from her old
   * household and looks for land. The woman's own head-of-household flag is
   * not set (her mate is assigned directly), as in the legacy code.
   */
  formHousehold(): void {
    const candidates = this.context.people().filter((other) => this.isEligibleMate(other));
    if (candidates.length === 0) return;
    const oldHousehold = this.household!;
    const mate = this.random.pick(candidates);
    this.mate = mate;
    mate.setMate(this);
    this.context.world.counts.householdsFormed++;
    const newHousehold = new HouseholdDisaggregate(this.context);
    this.context.households().add(newHousehold);
    newHousehold.clan = oldHousehold.clan;
    mate.setHousehold(newHousehold);
    this.setHousehold(newHousehold);
    oldHousehold.giveMaizeGift(newHousehold);
    newHousehold.move();
  }

  setMate(mate: Person | null): void {
    if (mate !== null) this.headOfHousehold = true;
    this.mate = mate;
  }

  setHousehold(household: HouseholdDisaggregate): void {
    this.leave();
    this.household = household;
    household.addMember(this);
  }
}
