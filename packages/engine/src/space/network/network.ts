// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '../../agent';

export interface NetworkOptions {
  /** True if a link from `a` to `b` is not also a link from `b` to `a`. Default false. */
  readonly directed?: boolean;
}

/**
 * A graph of links between agents. The agents live in ordinary scapes; the
 * network only records who is linked to whom.
 *
 * Links to or from an agent that is no longer alive are never reported and
 * are pruned the next time they are met. Neighbors come back in the order the
 * links were created, so iteration is deterministic.
 */
export class Network<A extends Agent = Agent> {
  readonly directed: boolean;

  readonly #out = new Map<A, Set<A>>();
  readonly #in = new Map<A, Set<A>>();

  constructor(options: NetworkOptions = {}) {
    this.directed = options.directed ?? false;
  }

  /**
   * Links `a` to `b` (and `b` to `a` if undirected). Returns false, changing
   * nothing, for a self-link, an existing link, or a dead agent.
   */
  connect(a: A, b: A): boolean {
    if (a === b || !a.alive || !b.alive) return false;
    if (this.#out.get(a)?.has(b)) return false;
    this.#add(a, b);
    if (!this.directed) this.#add(b, a);
    return true;
  }

  /** Removes the link from `a` to `b` (both ways if undirected). Returns whether one existed. */
  disconnect(a: A, b: A): boolean {
    this.#sweep(a);
    this.#sweep(b);
    if (!this.#out.get(a)?.has(b)) return false;
    this.#remove(a, b);
    if (!this.directed) this.#remove(b, a);
    return true;
  }

  /** Whether `a` is linked to `b`. */
  isConnected(a: A, b: A): boolean {
    this.#sweep(a);
    this.#sweep(b);
    return this.#out.get(a)?.has(b) ?? false;
  }

  /** The agents `a` links to, in order of link creation. */
  neighbors(a: A): A[] {
    this.#sweep(a);
    return [...(this.#out.get(a) ?? [])];
  }

  /** The agents that link to `a`, in order of link creation. Same as `neighbors` if undirected. */
  inNeighbors(a: A): A[] {
    this.#sweep(a);
    return [...(this.#in.get(a) ?? [])];
  }

  /** The number of agents `a` links to. For a directed network this is the out-degree. */
  degree(a: A): number {
    this.#sweep(a);
    return this.#out.get(a)?.size ?? 0;
  }

  /** Every link as `[from, to]`; each undirected link appears once. */
  *edges(): IterableIterator<[A, A]> {
    const finished = new Set<A>();
    for (const from of [...this.#out.keys()]) {
      this.#sweep(from);
      for (const to of this.#out.get(from) ?? []) {
        if (this.directed || !finished.has(to)) yield [from, to];
      }
      finished.add(from);
    }
  }

  /** The number of links; each undirected link counts once. */
  get edgeCount(): number {
    return [...this.edges()].length;
  }

  /** Removes every link to and from `a`. */
  disconnectAll(a: A): void {
    for (const b of this.#out.get(a) ?? []) this.#in.get(b)?.delete(a);
    for (const b of this.#in.get(a) ?? []) this.#out.get(b)?.delete(a);
    this.#out.delete(a);
    this.#in.delete(a);
  }

  /** Removes every link. */
  clear(): void {
    this.#out.clear();
    this.#in.clear();
  }

  /** Agents reachable from `a` in at most `hops` links, in breadth-first order, excluding `a`. */
  within(a: A, hops: number): A[] {
    const result: A[] = [];
    if (!a.alive) return result;
    const seen = new Set<A>([a]);
    let frontier = [a];
    for (let depth = 0; depth < hops && frontier.length > 0; depth++) {
      const next: A[] = [];
      for (const node of frontier) {
        for (const other of this.neighbors(node)) {
          if (seen.has(other)) continue;
          seen.add(other);
          result.push(other);
          next.push(other);
        }
      }
      frontier = next;
    }
    return result;
  }

  /** The fewest links from `a` to `b`, or `Infinity` if `b` cannot be reached. */
  distance(a: A, b: A): number {
    const path = this.shortestPath(a, b);
    return path ? path.length - 1 : Infinity;
  }

  /** A shortest path from `a` to `b`, including both ends, or `undefined` if there is none. */
  shortestPath(a: A, b: A): A[] | undefined {
    if (!a.alive || !b.alive) return undefined;
    if (a === b) return [a];
    const parent = new Map<A, A>();
    const seen = new Set<A>([a]);
    let frontier = [a];
    while (frontier.length > 0) {
      const next: A[] = [];
      for (const node of frontier) {
        for (const other of this.neighbors(node)) {
          if (seen.has(other)) continue;
          seen.add(other);
          parent.set(other, node);
          if (other === b) {
            const path = [b];
            for (let at = b; at !== a;) {
              at = parent.get(at) as A;
              path.push(at);
            }
            return path.reverse();
          }
          next.push(other);
        }
      }
      frontier = next;
    }
    return undefined;
  }

  #add(from: A, to: A): void {
    let out = this.#out.get(from);
    if (!out) this.#out.set(from, (out = new Set()));
    out.add(to);
    let incoming = this.#in.get(to);
    if (!incoming) this.#in.set(to, (incoming = new Set()));
    incoming.add(from);
  }

  #remove(from: A, to: A): void {
    this.#out.get(from)?.delete(to);
    this.#in.get(to)?.delete(from);
  }

  /** Drops links of `a` itself, and of any dead agent among its neighbors. */
  #sweep(a: A): void {
    if (!a.alive) {
      this.disconnectAll(a);
      return;
    }
    for (const set of [this.#out.get(a), this.#in.get(a)]) {
      if (!set) continue;
      for (const other of [...set]) if (!other.alive) this.disconnectAll(other);
    }
  }
}
