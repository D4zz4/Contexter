import { describe, expect, it } from 'vitest';
import { translateUi } from './i18n';

describe('UI language', () => {
  it('keeps German labels unchanged', () => {
    expect(translateUi('  Papierkorb  ', 'de')).toBe('  Papierkorb  ');
  });

  it('translates labels and preserves spacing', () => {
    expect(translateUi('  Papierkorb  ', 'en')).toBe('  Trash  ');
    expect(translateUi('Quelle hinzugefügt.', 'en')).toBe('Source added.');
  });

  it('does not alter unknown or user-authored content', () => {
    expect(translateUi('My custom notebook', 'en')).toBe('My custom notebook');
  });
});
