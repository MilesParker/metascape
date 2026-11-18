// SPDX-License-Identifier: EPL-2.0
//
// A record of a run, period by period, for telling whether two executions of
// a model (interpreted and generated, docs/codegen.md) do the same thing.
import {
  Graph,
  LocatedAgent,
  RootScape,
  type Agent,
  type Model as EngineModel,
} from '@metascape/engine';

/** One line per agent of every scape: its id, whether it lives, where it is, its values and links. */
function stateOf(root: RootScape): string {
  const lines: string[] = [];
  for (const scape of root.scapes) {
    const graph = scape.space instanceof Graph ? (scape.space as Graph<Agent>) : undefined;
    lines.push(`# ${scape.name} ${scape.members.length}`);
    for (const member of scape.members) {
      const values = (member as { values?: unknown }).values;
      const at = member instanceof LocatedAgent ? `${member.x},${member.y}` : '';
      const links = graph ? graph.neighbors(member).map((other) => other.id) : '';
      lines.push(
        `${member.id} ${member.alive ? 1 : 0} ${at} ${JSON.stringify(values ?? null)} ${links}`,
      );
    }
  }
  return lines.join('\n');
}

/**
 * Runs a model from a seed and records, after building and after each
 * period, every series' latest value and the state of every agent. Two
 * executions of a model that mean the same give equal records.
 */
export function traceRun(
  model: EngineModel,
  options: { readonly seed: number; readonly periods: number },
): string[] {
  const root = new RootScape(model, { seed: options.seed });
  const record = () =>
    `period ${root.period}\n${root.data.series
      .map((series) => `${series.id}=${root.data.latest(series.id)}`)
      .join(' ')}\n${stateOf(root)}`;
  const trace = [record()];
  for (let i = 0; i < options.periods && root.iterate(); i++) trace.push(record());
  if (root.stopped) trace.push(`stopped: ${root.stopReason ?? ''}`);
  return trace;
}
