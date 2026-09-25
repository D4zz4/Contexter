import { describe, expect, it } from 'vitest';
import { prepareYouTubeCookies } from './youtube-cookies';

describe('optional YouTube cookies', () => {
  it('retains only YouTube cookies, including HttpOnly entries', () => {
    const input = '# Netscape HTTP Cookie File\n#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tprivate\n.example.com\tTRUE\t/\tTRUE\t0\tOTHER\tsecret';
    const result = prepareYouTubeCookies(input);
    expect(result).toContain('#HttpOnly_.youtube.com');
    expect(result).not.toContain('example.com');
    expect(result).not.toContain('secret');
  });

  it('rejects arbitrary files and files without YouTube cookies', () => {
    expect(() => prepareYouTubeCookies('not cookies')).toThrow('Netscape');
    expect(() => prepareYouTubeCookies('# HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t0\tOTHER\tsecret')).toThrow('keine YouTube-Cookies');
  });
});
