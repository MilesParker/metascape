// SPDX-License-Identifier: EPL-2.0
//
// The part of EMF's XMI that the AMP models use: references written as paths
// (`//@agents[ID='bug']/@rootActivity/@members[ID='bugRule']`, `@options.0`)
// and `href`s into other files (`core_library.metaabm#//@attributes[ID='unit']`).
import type { XNode } from './xml';

/** Features that hold a single object: their path segment has neither an ID nor an index. */
const SINGLE = new Set(['rootActivity', 'implementation', 'literal', 'function']);
/** Features whose paths EMF writes by index although their elements have IDs. */
const INDEXED = new Set(['inputs', 'options', 'children']);

/** The path of an element in EMF style, for diagnostics: `//@agents[ID='bug']/@rootActivity`. The root is `/`. */
export function pathOf(node: XNode): string {
  const segments: string[] = [];
  for (let n: XNode | undefined = node; n?.parent; n = n.parent) {
    const feature = n.tag;
    const id = n.attrs['ID'];
    if (SINGLE.has(feature)) segments.unshift(`@${feature}`);
    else if (id !== undefined && !INDEXED.has(feature)) segments.unshift(`@${feature}[ID='${id}']`);
    else {
      const index = n.parent.children.filter((c) => c.tag === feature).indexOf(n);
      segments.unshift(`@${feature}.${index}`);
    }
  }
  return segments.length === 0 ? '/' : `/${segments.map((s) => `/${s}`).join('')}`;
}

/** Splits a list-valued reference attribute (`targets`, `agents`) into its references. */
export function splitReferences(text: string | undefined): string[] {
  return text?.match(/(?:[^\s[]|\[[^\]]*\])+/g) ?? [];
}

/** A reference into another file, such as the core library. */
export interface ExternalReference {
  /** The file name as written, such as `http://metaabm.org/core_library.metaabm`. */
  file: string;
  /** The IDs along the path, with their features: `[['library', 'coreFunctions'], ['subs', 'spatial']]`. */
  segments: [feature: string, id: string | undefined][];
}

export type Resolved =
  | { kind: 'local'; node: XNode }
  | { kind: 'external'; reference: ExternalReference }
  | { kind: 'missing' };

const SEGMENT = /^@([A-Za-z_][A-Za-z0-9_]*)(?:\[ID='([^']*)'\]|\.(\d+))?$/;

function parseSegments(
  fragment: string,
): [string, string | undefined, number | undefined][] | undefined {
  const parts = fragment.split('/').filter((p) => p.length > 0);
  const result: [string, string | undefined, number | undefined][] = [];
  for (const part of parts) {
    const match = SEGMENT.exec(part);
    if (!match) return undefined;
    result.push([match[1]!, match[2], match[3] === undefined ? undefined : Number(match[3])]);
  }
  return result;
}

/** Resolves a reference, as written in an XMI attribute or `href`, from the root element of the document. */
export function resolveReference(root: XNode, reference: string): Resolved {
  const hash = reference.indexOf('#');
  const file = hash < 0 ? '' : reference.slice(0, hash);
  const fragment = hash < 0 ? reference : reference.slice(hash + 1);
  const segments = parseSegments(fragment);
  if (!segments) return { kind: 'missing' };
  if (file !== '') {
    return {
      kind: 'external',
      reference: { file, segments: segments.map(([feature, id]) => [feature, id]) },
    };
  }
  let node = root;
  for (const [feature, id, index] of segments) {
    const candidates = node.children.filter((c) => c.tag === feature);
    const next =
      id !== undefined ? candidates.find((c) => c.attrs['ID'] === id) : candidates[index ?? 0];
    if (!next) return { kind: 'missing' };
    node = next;
  }
  return { kind: 'local', node };
}
