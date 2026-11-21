import { useEffect, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import {
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  NumberedListIcon,
} from '@heroicons/react/24/outline';

type MailEditorProps = {
  initialHtml: string;
  onChange: (html: string, text: string) => void;
  labelId: string;
  disabled?: boolean;
};

const contentClasses =
  'min-h-[180px] px-3 py-2.5 text-base sm:text-sm text-[var(--ink)] focus:outline-none ' +
  '[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 ' +
  '[&_a]:text-[var(--primary-text)] [&_a]:underline';

const MailEditor = ({ initialHtml, onChange, labelId, disabled = false }: MailEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Placeholder.configure({ placeholder: 'Ihre Nachricht an die Mitglieder...' }),
    ],
    content: initialHtml,
    editable: !disabled,
    editorProps: {
      attributes: {
        'aria-labelledby': labelId,
        role: 'textbox',
        'aria-multiline': 'true',
        class: contentClasses,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const toolButton = (
    label: string,
    active: boolean,
    onClick: () => void,
    icon: ReactNode,
  ) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`rounded p-1.5 transition-colors disabled:opacity-50 ${
        active
          ? 'bg-[var(--primary)]/10 text-[var(--primary-text)]'
          : 'text-[var(--muted)] hover:bg-[var(--canvas-soft)] hover:text-[var(--ink)]'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div>
      {editor && (
        <div className="flex items-center gap-1 border-b border-[var(--hairline)] bg-[var(--canvas-soft)] px-2 py-1.5">
          {toolButton(
            'Fett',
            editor.isActive('bold'),
            () => editor.chain().focus().toggleBold().run(),
            <BoldIcon className="h-4 w-4" />,
          )}
          {toolButton(
            'Kursiv',
            editor.isActive('italic'),
            () => editor.chain().focus().toggleItalic().run(),
            <ItalicIcon className="h-4 w-4" />,
          )}
          {toolButton(
            'Aufzählung',
            editor.isActive('bulletList'),
            () => editor.chain().focus().toggleBulletList().run(),
            <ListBulletIcon className="h-4 w-4" />,
          )}
          {toolButton(
            'Nummerierte Liste',
            editor.isActive('orderedList'),
            () => editor.chain().focus().toggleOrderedList().run(),
            <NumberedListIcon className="h-4 w-4" />,
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
};

export default MailEditor;
