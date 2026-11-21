import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MailPreview from './MailPreview';

describe('MailPreview', () => {
  it('does not follow links while composing', () => {
    const { container } = render(
      <MailPreview subject="Test" html={'<p><a href="https://example.com">Link</a></p>'} />,
    );
    const link = container.querySelector('a');
    expect(link).not.toBeNull();

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
  });
});
