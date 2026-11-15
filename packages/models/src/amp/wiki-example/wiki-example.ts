// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model WikiExample.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  type Array2D,
  Array2DMoore,
  CellOccupant,
  defineModel,
  gridView,
  HostCell,
  int,
  real,
  rgb,
  Scape,
  stat,
  timeSeriesView,
} from '@metascape/engine';

/** A block of the city: one cell of the grid. */
export class Block extends HostCell {}

/** An individual: it has an age and wealth, and moves next to someone of its own age. */
export class Individual extends CellOccupant<Block> {
  age = 0;
  readonly vision = 5;
  wealth = 0;

  constructor(
    private readonly city: Array2D<Block>,
    private readonly maximumAge: number,
  ) {
    super();
  }

  /** The "Initial State" initial rule: a random age below `maximumAge` and a random wealth in [0, 1). */
  initialState(): void {
    this.age = this.random.int(0, this.maximumAge);
    this.wealth = this.random.float();
  }

  /** The "Initial Movement" initial rule: a random available block. */
  initialMovement(): void {
    const block = this.city.findRandomAvailable();
    if (block) this.moveTo(block);
  }

  /**
   * The "Find Partner" rule: pick, at random, an individual of the same age within `vision`
   * and move to a random free block next to that partner.
   */
  findPartner(): void {
    const here = this.hostCell;
    if (!here) return;
    const partners: Individual[] = [];
    for (const block of this.city.findWithin(here, this.vision)) {
      const other = block.occupant;
      if (other instanceof Individual && other.age === this.age) partners.push(other);
    }
    if (partners.length === 0) return;
    const partner = this.random.pick(partners);
    const partnerBlock = partner.hostCell;
    if (!partnerBlock) return;
    const free = partnerBlock.neighbors.filter((block) => block.isAvailable);
    if (free.length > 0) this.moveTo(this.random.pick(free));
  }
}

/** Whether an individual has a same-aged individual on a neighbouring block. (Not in the original.) */
function hasSameAgeNeighbor(individual: Individual): boolean {
  return individual.neighboringOccupants().some((o) => (o as Individual).age === individual.age);
}

/** The Wiki example of the AMP examples set. */
export const wikiExample = defineModel({
  name: 'Wiki Example',
  description:
    'Individuals of random ages scattered over a bounded city grid each period move next to a randomly chosen individual of the same age within their vision, so same-aged individuals gradually cluster together.',
  provenance: {
    portedFrom: 'Eclipse AMP, WikiExample.metaabm',
    copyright:
      'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License',
    note: 'The sources name no author or publication for this model. The "Same-age neighbours" chart is an addition of this port.',
  },
  parameters: {
    individualCount: int(50, {
      min: 0,
      max: 2000,
      label: 'Individual Count',
      description: 'The number of individuals to create.',
    }),
    maximumAge: int(10, {
      min: 1,
      max: 100,
      label: 'Maximum Age',
      description: 'Ages are drawn from 0 up to, but not including, this value.',
    }),
    maximumWealth: real(0, {
      min: 0,
      max: 0,
      label: 'Maximum Wealth',
      description:
        'No act of the original model reads this value (wealth is a draw in [0, 1)), so it has no effect.',
    }),
    width: int(20, {
      min: 3,
      max: 200,
      label: 'Width',
      description: 'The horizontal extent of the city.',
    }),
    height: int(20, {
      min: 3,
      max: 200,
      label: 'Height',
      description: 'The vertical extent of the city.',
    }),
  },

  build(root) {
    const p = root.parameters;
    const city = root.add(
      new Scape<Block>({
        name: 'City',
        space: new Array2DMoore<Block>(),
        extent: [p.width, p.height],
        periodic: false,
        prototypeAgent: () => new Block(),
        executionOrder: 'byRule',
      }),
    );
    const people = root.add(
      new Scape<Individual>({
        name: 'Individuals',
        size: p.individualCount,
        executionOrder: 'byRule',
        prototypeAgent: () => new Individual(city.space as Array2D<Block>, p.maximumAge),
      }),
    );
    people.addInitialRule('Initial State', (i) => i.initialState());
    people.addInitialRule('Initial Movement', (i) => i.initialMovement());
    people.addRule('Find Partner', (i) => i.findPartner());

    people.addStatCollector(stat.count('Individuals Population'));
    people.addStatCollector(
      stat.measure('Same-age neighbour', (i) => (hasSameAgeNeighbor(i) ? 1 : 0), {
        statistics: ['mean'],
      }),
    );

    root.addView(
      gridView<Block, Individual>({
        title: 'City',
        scape: city,
        cellColor: () => rgb(235, 235, 235),
        occupantColor: (i) => rgb(Math.floor(i.wealth * 255), 255, 255),
        occupantShape: 'circle',
        legend: [
          { color: rgb(255, 255, 255), label: 'Wealthiest individual', mark: 'agent' },
          { color: rgb(0, 255, 255), label: 'Poorest individual', mark: 'agent' },
          { color: rgb(235, 235, 235), label: 'Block' },
        ],
      }),
    );
    root.addView(
      timeSeriesView({
        title: 'Individuals with a same-age neighbour',
        series: ['Same-age neighbour.mean'],
        yMin: 0,
        yMax: 1,
      }),
    );
    root.addView(
      timeSeriesView({ title: 'Population', series: ['Individuals Population'], yMin: 0 }),
    );
  },
});
