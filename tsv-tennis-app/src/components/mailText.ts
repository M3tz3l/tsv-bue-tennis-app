export type EditorNode = {
  type?: string;
  text?: string;
  content?: EditorNode[];
};

const INDENT = '  ';

const inlineText = (nodes: EditorNode[] = []): string =>
  nodes
    .map((node) => {
      if (node.type === 'text') return node.text ?? '';
      if (node.type === 'hardBreak') return '\n';
      return inlineText(node.content);
    })
    .join('');

const listItemText = (node: EditorNode, depth: number, marker: string): string => {
  const children = node.content ?? [];
  const [first, ...rest] = children;
  const firstText = first
    ? first.type === 'paragraph'
      ? inlineText(first.content)
      : blockText(first, 0).trimEnd()
    : '';

  let out = `${INDENT.repeat(depth)}${marker}${firstText}\n`;
  for (const child of rest) {
    out += blockText(child, depth + 1);
  }
  return out;
};

const blockText = (node: EditorNode, depth: number): string => {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'codeBlock':
      return `${INDENT.repeat(depth)}${inlineText(node.content)}\n`;
    case 'blockquote':
      return (node.content ?? []).map((child) => blockText(child, depth + 1)).join('');
    case 'bulletList':
      return (node.content ?? [])
        .map((child) => listItemText(child, depth, '- '))
        .join('');
    case 'orderedList':
      return (node.content ?? [])
        .map((child, index) => listItemText(child, depth, `${index + 1}. `))
        .join('');
    case 'horizontalRule':
      return `${INDENT.repeat(depth)}---\n`;
    case 'hardBreak':
      return '\n';
    default:
      if (node.content) return node.content.map((child) => blockText(child, depth)).join('');
      return node.text ?? '';
  }
};

/** Convert editor JSON to text that keeps list markers for the plain-text part. */
export function editorJsonToText(doc: EditorNode): string {
  return (doc.content ?? [])
    .map((node) => blockText(node, 0))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}
