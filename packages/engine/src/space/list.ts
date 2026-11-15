// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '../agent';
import { memberCount, Space, type FindOptions, type Geometry, type SpaceSetup } from './space';

/**
 * The plain space, and the default: the members in a row, in order of
 * joining. An agent's neighbors are the members before and after it, and
 * distance is the number of places between two members. With `periodic` the
 * row closes into a ring.
 *
 * Most scapes with a list space never ask it anything: they are collections
 * whose members find each other some other way, such as through the cells
 * they stand on.
 */
export class ListSpace<A extends Agent = Agent> extends Space<A> {
  readonly geometry: Geometry = 'list';

  #count = 0;
  #indexed: readonly A[] | undefined;
  #indexedLength = -1;
  readonly #index = new Map<A, number>();

  protected override configure(setup: SpaceSetup): void {
    const count = memberCount(setup);
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`Scape "${this.scape.name}": size must be a non-negative integer`);
    }
    this.#count = count;
  }

  /** How many members the space creates when the model is created. */
  get initialSize(): number {
    return this.#count;
  }

  populate(): void {
    for (let i = 0; i < this.#count; i++) this.scape.newAgent();
  }

  neighbors(agent: A): readonly A[] {
    return this.findWithin(agent, 1);
  }

  distance(a: A, b: A): number {
    const d = Math.abs(this.#indexOf(a) - this.#indexOf(b));
    return this.periodic ? Math.min(d, this.members.length - d) : d;
  }

  /** The members at most `distance` places away, from the farthest before to the farthest after. */
  findWithin(origin: A, distance: number, options: FindOptions<A> = {}): A[] {
    const members = this.members;
    const n = members.length;
    const at = this.#indexOf(origin);
    const reach = Math.min(Math.floor(distance), this.periodic ? Math.floor(n / 2) : n - 1);
    const found: A[] = [];
    const seen = new Set<A>();
    for (let offset = -reach; offset <= reach; offset++) {
      if (offset === 0 && !options.includeSelf) continue;
      let i = at + offset;
      if (this.periodic) i = ((i % n) + n) % n;
      else if (i < 0 || i >= n) continue;
      const other = members[i]!;
      if (seen.has(other) || (offset !== 0 && other === origin)) continue;
      if (options.condition && !options.condition(other)) continue;
      seen.add(other);
      found.push(other);
    }
    return found;
  }

  #indexOf(agent: A): number {
    const members = this.members;
    if (this.#indexed !== members || this.#indexedLength !== members.length) {
      this.#index.clear();
      for (let i = 0; i < members.length; i++) this.#index.set(members[i]!, i);
      this.#indexed = members;
      this.#indexedLength = members.length;
    }
    const index = this.#index.get(agent);
    if (index === undefined) {
      throw new Error(`Agent is not a member of scape "${this.scape.name}"`);
    }
    return index;
  }
}

/**
 * A space whose only member is its own scape. Rules added to a scape with
 * this space are executed once each iteration, on the scape itself, which is
 * how a model states a behaviour of the whole: a condition for stopping, or
 * setting up something that spans other scapes.
 *
 * A scape with this space draws from the random stream of the scape that
 * contains it, since it has no population of its own.
 */
export class Singleton<A extends Agent = Agent> extends Space<A> {
  readonly geometry: Geometry = 'singleton';

  override get extent(): readonly number[] {
    return [1];
  }

  override get fixedMembership(): boolean {
    return true;
  }

  populate(): void {}

  neighbors(): readonly A[] {
    return [];
  }

  distance(): number {
    return 0;
  }

  findWithin(origin: A, _distance: number, options: FindOptions<A> = {}): A[] {
    return options.includeSelf && (!options.condition || options.condition(origin)) ? [origin] : [];
  }
}
