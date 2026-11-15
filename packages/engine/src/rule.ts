// SPDX-License-Identifier: EPL-2.0
import type { Agent } from './agent';

/**
 * A behaviour iterated across the members of a scape. Rules are the only way
 * a model behaves.
 *
 * A rule with only `execute` acts immediately. A rule that also has `update`
 * is two-phase: within an iteration, `execute` runs for every agent before
 * `update` runs for any. Compute the next state in `execute` and apply it in
 * `update` to get synchronous updating that does not depend on agent order.
 *
 * A rule object may be added to more than one scape.
 */
export interface Rule<A extends Agent = Agent> {
  readonly name: string;
  /** What the rule does, in a sentence, for people reading or editing a scape's rules. */
  readonly description?: string;
  /**
   * Whether the rule needs its agents in a fresh random order. Default true.
   * A scape draws a random tour for an iteration when any of its selected
   * rules needs one, and otherwise visits its members in order of joining.
   */
  readonly randomExecution?: boolean;
  /**
   * Whether executing the rule may remove agents from the scape. Default
   * true. When no selected rule can, the scape need not check between rules
   * that each agent is still a member.
   */
  readonly causesRemoval?: boolean;
  execute(agent: A): void;
  update?(agent: A): void;
}

/** A rule installed on a scape, which can be deselected without removing it. */
export interface RuleEntry<A extends Agent = Agent> {
  readonly rule: Rule<A>;
  /**
   * 0 for the first rule of this name added to the scape, 1 for the second, and
   * so on. Fixed when the rule is added, so it still identifies the rule after
   * rules are reordered.
   */
  readonly occurrence: number;
  enabled: boolean;
}

/**
 * How rules and agents are interleaved within an iteration.
 * - `byAgent`: each agent executes all rules before the next agent starts.
 * - `byRule`: each rule is executed by all agents before the next rule starts.
 */
export type ExecutionOrder = 'byAgent' | 'byRule';

/**
 * Which members act in an iteration.
 * - `completeTour`: distinct members, each at most once.
 * - `repeatedDraw`: independent random draws, so a member may act more than
 *   once. There are as many draws as the scape's agents per iteration, or as
 *   it has members when that is not set.
 */
export type ExecutionStyle = 'completeTour' | 'repeatedDraw';

/** Options of the short form of `addRule`. */
export type RuleOptions = Pick<Rule, 'description' | 'randomExecution' | 'causesRemoval'>;

/** Turns the arguments of `addRule` and `addInitialRule` into a rule. */
export function toRule<A extends Agent>(
  ruleOrName: Rule<A> | string,
  execute?: (agent: A) => void,
  options?: RuleOptions,
): Rule<A> {
  if (typeof ruleOrName !== 'string') return ruleOrName;
  if (!execute) throw new Error(`Rule "${ruleOrName}" needs an execute function`);
  return { name: ruleOrName, ...options, execute };
}
