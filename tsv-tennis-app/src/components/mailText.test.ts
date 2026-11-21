import { describe, expect, it } from 'vitest';
import { editorJsonToText, type EditorNode } from './mailText';

const paragraph = (text: string): EditorNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const listItem = (...content: EditorNode[]): EditorNode => ({
  type: 'listItem',
  content,
});

describe('editorJsonToText', () => {
  it('keeps bullet and numbered list markers', () => {
    const doc: EditorNode = {
      type: 'doc',
      content: [
        paragraph('Intro'),
        {
          type: 'bulletList',
          content: [listItem(paragraph('Punkt A')), listItem(paragraph('Punkt B'))],
        },
        {
          type: 'orderedList',
          content: [listItem(paragraph('Erster')), listItem(paragraph('Zweiter'))],
        },
      ],
    };

    expect(editorJsonToText(doc)).toBe(
      'Intro\n- Punkt A\n- Punkt B\n1. Erster\n2. Zweiter',
    );
  });

  it('indents nested lists', () => {
    const doc: EditorNode = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            listItem(paragraph('Punkt A')),
            listItem(
              paragraph('Punkt B'),
              {
                type: 'orderedList',
                content: [listItem(paragraph('Unterpunkt'))],
              },
            ),
          ],
        },
      ],
    };

    expect(editorJsonToText(doc)).toBe('- Punkt A\n- Punkt B\n  1. Unterpunkt');
  });
});
