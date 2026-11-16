// SPDX-License-Identifier: EPL-2.0
//
// A small element tree over @xmldom/xmldom. The translation reads XMI through
// this tree, not through DOM types, so it behaves the same in Node and in the
// browser (xmldom is plain JavaScript and needs no DOM).
import { DOMParser } from '@xmldom/xmldom';

/** An XML element. Text, comments and processing instructions are dropped: XMI keeps everything in attributes. */
export interface XNode {
  /** The element name as written, with its prefix: `metaabm:SContext`, `members`. */
  readonly tag: string;
  /** Attribute values, decoded. Includes `xsi:type` and `xmlns:` declarations. */
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XNode[];
  readonly parent: XNode | undefined;
}

interface RawNode {
  nodeType: number;
  nodeName: string;
  attributes?: ArrayLike<{ name: string; value: string }>;
  childNodes?: ArrayLike<RawNode>;
}

/** Thrown when text is not well-formed XML. */
export class XmlError extends Error {
  override readonly name = 'XmlError';
}

/** Parses XML text into an element tree. Throws {@link XmlError} if it is not well formed. */
export function parseXml(text: string): XNode {
  const problems: string[] = [];
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') problems.push(message);
    },
  });
  let doc: RawNode;
  try {
    doc = parser.parseFromString(text, 'text/xml') as unknown as RawNode;
  } catch (error) {
    // xmldom throws for errors it cannot recover from, such as an undeclared prefix.
    throw new XmlError(error instanceof Error ? error.message : String(error));
  }
  const root = Array.from(doc.childNodes ?? []).find((n) => n.nodeType === 1);
  if (problems.length > 0 || !root) {
    throw new XmlError(problems[0] ?? 'The text has no root element.');
  }
  return convert(root, undefined);
}

function convert(raw: RawNode, parent: XNode | undefined): XNode {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(raw.attributes ?? [])) attrs[attr.name] = attr.value;
  const children: XNode[] = [];
  const node: XNode = { tag: raw.nodeName, attrs, children, parent };
  for (const child of Array.from(raw.childNodes ?? [])) {
    if (child.nodeType === 1) children.push(convert(child, node));
  }
  return node;
}
