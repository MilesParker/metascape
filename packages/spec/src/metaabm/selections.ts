// SPDX-License-Identifier: EPL-2.0
//
// Writing out the selection an attribute is read from (D7 in
// docs/metamodel-review.md). The interpreter reads an attribute that names no
// selection from the act's own selection, and the checker rejects a read from
// a selection whose agent lacks the attribute. Where a translated model reads
// so, the translation names the selection to read from, as the generators
// would have read it.
import { actsOf } from '../metamodel/model-index';
import type { Act, ActId, Model, Scape, Value } from '../metamodel/types';

/** A read whose selection the translation wrote out. */
export interface WrittenSelection {
  /** The agent whose acts these are, as its path ('' for the root scape), then `#style` for a style's. */
  readonly owner: string;
  /** The act's path within its acts. */
  readonly act: string;
  /** Where the value is in the act: `parameter`, `agentCount` or `inputs.N`. */
  readonly where: string;
  readonly message: string;
}

interface OwnerEntry {
  readonly kind: 'agent' | 'scape' | 'space';
  readonly attributes: ReadonlySet<string>;
}

type FlowAct = Exclude<Act, { kind: 'group' }>;

const ROOTS = new Set([
  'rule',
  'schedule',
  'build',
  'initialize',
  'watch',
  'derive',
  'diffuse',
  'perform',
]);

const join = (prefix: string, id: string) => (prefix === '' ? id : `${prefix}.${id}`);

/**
 * Names the selection of every attribute read whose act's own selection is of
 * an agent without the attribute, in place, and says what it wrote. A set's
 * parameter is read from the root act's selection if its agent has the
 * attribute (`selfrom(ASet)` in the generators); any other value from the
 * nearest selection upstream whose agent has it. A read with no such
 * selection is left for the checker to report.
 */
export function writeOutSelections(model: Model): WrittenSelection[] {
  const owners = new Map<string, OwnerEntry>();
  const actables: { owner: string; agent: string; acts: Record<ActId, Act> }[] = [];
  const visitScape = (scape: Model | Scape, ref: string) => {
    owners.set(ref, { kind: 'scape', attributes: new Set(Object.keys(scape.attributes ?? {})) });
    if (scape.acts) actables.push({ owner: ref, agent: ref, acts: scape.acts });
    for (const [id, space] of Object.entries(scape.spaces ?? {})) {
      owners.set(join(ref, id), {
        kind: 'space',
        attributes: new Set(Object.keys(space.attributes ?? {})),
      });
    }
    for (const [id, agent] of Object.entries(scape.agents ?? {})) {
      const agentRef = join(ref, id);
      if (agent.kind === 'scape') visitScape(agent, agentRef);
      else {
        owners.set(agentRef, {
          kind: 'agent',
          attributes: new Set(Object.keys(agent.attributes ?? {})),
        });
        if (agent.acts) actables.push({ owner: agentRef, agent: agentRef, acts: agent.acts });
      }
      for (const [styleId, style] of Object.entries(agent.styles ?? {})) {
        if (style.acts)
          actables.push({ owner: `${agentRef}#${styleId}`, agent: agentRef, acts: style.acts });
      }
    }
  };
  visitScape(model, '');

  const cellAgents = new Map<string, string>();
  for (const { acts } of actables) {
    for (const [, act] of actsOf(acts)) {
      if (act.kind === 'buildGrid' && act.fillAgent !== undefined)
        cellAgents.set(act.space, act.fillAgent);
    }
  }

  const written: WrittenSelection[] = [];
  for (const actable of actables) {
    const acts = new Map<string, FlowAct>(actsOf(actable.acts));
    const sources = new Map<string, string[]>();
    for (const [id, act] of acts) {
      for (const target of act.targets ?? [])
        sources.set(target, [...(sources.get(target) ?? []), id]);
    }
    const agentOf = (id: ActId): string | undefined => {
      const act = acts.get(id);
      if (!act) return undefined;
      if (ROOTS.has(act.kind)) return actable.agent;
      if (act.kind === 'select')
        return act.agent ?? (act.space !== undefined ? cellAgents.get(act.space) : undefined);
      if (act.kind === 'create' || act.kind === 'load') return act.agent;
      return undefined;
    };
    /** The selections upstream of an act, nearest first. */
    const upstream = (id: ActId): string[] => {
      const found: string[] = [];
      const seen = new Set<string>([id]);
      let layer = [id];
      while (layer.length > 0) {
        const next: string[] = [];
        for (const at of layer) {
          for (const source of sources.get(at) ?? []) {
            if (seen.has(source)) continue;
            seen.add(source);
            next.push(source);
            if (agentOf(source) !== undefined) found.push(source);
          }
        }
        layer = next;
      }
      return found;
    };

    for (const [id, act] of acts) {
      const own = 'selected' in act ? act.selected : undefined;
      if (own === undefined) continue;
      const reads: [Value, string][] = [];
      if (act.kind === 'set') reads.push([act.parameter, 'parameter']);
      if ((act.kind === 'create' || act.kind === 'load') && act.agentCount)
        reads.push([act.agentCount, 'agentCount']);
      if (act.kind === 'query' || act.kind === 'evaluate') {
        act.inputs?.forEach((input, index) => {
          if (!('multiValue' in input)) reads.push([input, `inputs.${index}`]);
        });
      }
      for (const [value, where] of reads) {
        if (!('attribute' in value) || value.selected !== undefined) continue;
        const dot = value.attribute.lastIndexOf('.');
        const ownerRef = dot < 0 ? '' : value.attribute.slice(0, dot);
        const owner = owners.get(ownerRef);
        if (!owner || owner.kind !== 'agent') continue;
        const ownAgent = agentOf(own);
        if (ownAgent === undefined || ownAgent === ownerRef) continue;
        const candidates = upstream(id).filter((selection) => agentOf(selection) === ownerRef);
        const root =
          act.kind === 'set'
            ? candidates.find((selection) => ROOTS.has(acts.get(selection)!.kind))
            : undefined;
        const chosen = root ?? candidates[0];
        if (chosen === undefined) continue;
        value.selected = chosen;
        written.push({
          owner: actable.owner,
          act: id,
          where,
          message: `\`${value.attribute}\` is not an attribute of \`${ownAgent}\`, the agents of the act's own selection. It is read from \`${chosen}\`, ${
            root !== undefined
              ? "the root act's selection, as the generators read a set's parameter"
              : 'the nearest selection upstream whose agents have it'
          }, and the translation names it.`,
        });
      }
    }
  }
  return written;
}
