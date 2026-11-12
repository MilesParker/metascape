// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.GAS_Base, GAS_SpiceBase (settings),
// CommoditySource, CommodityStock.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type { GridScape, Scape, Simulation } from '@metascape/engine';
import type { SugarAgent } from './agents';
import type { SugarCell } from './cells';

/** The settings `GAS_Base` keeps on the root scape and agents read at initialization. */
export interface SugarSettings {
  /** Topology parameter of the sugar peaks (`sugarMoundness`). */
  readonly sugarMoundness: number;
  readonly minVision: number;
  readonly maxVision: number;
  readonly minSugarMetabolism: number;
  readonly maxSugarMetabolism: number;
  readonly minInitialSugar: number;
  readonly maxInitialSugar: number;
  readonly minDeathAge: number;
  readonly maxDeathAge: number;
  /** Size of the agent scape at setup (`GAS_Base.scapeSetup` sets it to 400). */
  readonly initialPopulation: number;
}

/** The extra settings of `GAS_SpiceBase`. */
export interface SpiceSettings {
  /** Topology parameter of the spice peaks (`spiceMoundness`). */
  readonly spiceMoundness: number;
  readonly minSpiceMetabolism: number;
  readonly maxSpiceMetabolism: number;
  readonly minInitialSpice: number;
  readonly maxInitialSpice: number;
}

/**
 * What the legacy agents reach through `getRoot()`: the settings, the sugar
 * lattice, the agent scape and a few values Java kept in static fields.
 */
export class SugarscapeWorld {
  readonly sim: Simulation;
  readonly settings: SugarSettings;
  readonly spice: SpiceSettings | undefined;
  /** The sugar lattice (`sugarscape` in the legacy code). Set by the builder. */
  grid!: GridScape<SugarCell>;
  /** The agent scape (`agents`). Set by the builder. */
  agents!: Scape<SugarAgent>;
  /** `PollutableSugarCell.maxPollution`: one value shared by all cells (a Java static). */
  maxPollution = 1;
  /** `CulturalSexualAgent.tagLength` (a Java static set by `GAS_III_6`). */
  tagLength = 0;

  constructor(sim: Simulation, settings: SugarSettings, spice?: SpiceSettings) {
    this.sim = sim;
    this.settings = settings;
    this.spice = spice;
    checkRange('vision', settings.minVision, settings.maxVision);
    checkRange('sugar metabolism', settings.minSugarMetabolism, settings.maxSugarMetabolism);
    checkRange('initial sugar', settings.minInitialSugar, settings.maxInitialSugar);
    checkRange('death age', settings.minDeathAge, settings.maxDeathAge);
    if (spice) {
      checkRange('spice metabolism', spice.minSpiceMetabolism, spice.maxSpiceMetabolism);
      checkRange('initial spice', spice.minInitialSpice, spice.maxInitialSpice);
    }
  }

  /** The spice settings; throws in a model without spice. */
  spiceSettings(): SpiceSettings {
    if (!this.spice) throw new Error('This Sugarscape model has no spice');
    return this.spice;
  }
}

function checkRange(what: string, low: number, high: number): void {
  // Java's randomInRange(low, high) throws when low > high.
  if (low > high) throw new RangeError(`Sugarscape: minimum ${what} exceeds the maximum`);
}

/** `CommoditySource`: a renewable commodity (sugar or spice) on a cell. */
export class CommoditySource {
  capacity = 0;
  quantity = 0;

  /** Grows back by `epsilon`, up to capacity. */
  growBackEpsilon(epsilon: number): void {
    if (this.quantity < this.capacity) {
      this.quantity += epsilon;
      if (this.quantity > this.capacity) this.quantity = this.capacity;
    }
  }

  /** Grows back by one unit, up to capacity. */
  growBack1(): void {
    this.growBackEpsilon(1);
  }

  /** Grows back to capacity at once. */
  growBackInf(): void {
    if (this.quantity < this.capacity) this.quantity = this.capacity;
  }

  /** Takes everything there is. */
  takeQuantity(): number {
    const taken = this.quantity;
    this.quantity = 0;
    return taken;
  }
}

/** `CommodityStock`: an agent's holding of a commodity. */
export class CommodityStock {
  stock = 0;

  putStock(more: number): void {
    this.stock += more;
  }

  reduceStock(less: number): void {
    this.stock -= less;
  }

  /** Takes everything there is. */
  takeAll(): number {
    const taken = this.stock;
    this.stock = 0;
    return taken;
  }

  /** Takes `amount`; throws if the stock is smaller, as the legacy code does. */
  takeStock(amount: number): number {
    if (amount > this.stock) {
      throw new Error('Tried to take more stock from an agent than agent had.');
    }
    this.stock -= amount;
    return amount;
  }
}
