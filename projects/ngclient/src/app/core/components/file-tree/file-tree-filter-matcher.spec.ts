import { describe, expect, it } from 'vitest';
import { globMatchesPath, regexMatchesPath } from './file-tree-filter-matcher';

describe('file tree filter matching', () => {
  describe('regular expressions', () => {
    it('matches against the complete path', () => {
      expect(regexMatchesPath('C:\\tmp\\folders\\1\\', '.*2')).toBe(false);
      expect(regexMatchesPath('C:\\tmp\\folders\\12\\', '.*2')).toBe(false);
      expect(regexMatchesPath('C:\\tmp\\folders\\123\\', '.*2')).toBe(false);
      expect(regexMatchesPath('C:\\tmp\\folders\\12', '.*2')).toBe(true);
    });

    it('preserves explicit anchors', () => {
      expect(regexMatchesPath('folder-12', '^folder-[0-9]+$')).toBe(true);
      expect(regexMatchesPath('prefix-folder-12', '^folder-[0-9]+$')).toBe(false);
    });
  });

  describe('globs', () => {
    it('matches a Windows folder with single backslashes', () => {
      const pattern = '*\\1\\';

      expect(globMatchesPath('C:\\tmp\\folders\\1\\', pattern)).toBe(true);
      expect(globMatchesPath('C:\\tmp\\folders\\12\\', pattern)).toBe(false);
      expect(globMatchesPath('C:\\tmp\\folders\\123\\', pattern)).toBe(false);
    });

    it('does not require doubled backslashes', () => {
      expect(globMatchesPath('C:\\tmp\\folders\\1\\', '*\\\\1\\\\')).toBe(false);
    });

    it('treats regular expression metacharacters as literals', () => {
      const path = 'C:\\tmp\\folders\\1\\';

      expect(globMatchesPath(path, 'C:\\t.p\\folders\\1\\')).toBe(false);
      expect(globMatchesPath(path, 'C:\\tm{1}p\\folders\\1\\')).toBe(false);
      expect(globMatchesPath(path, 'C:\\tmp\\folders\\1\\')).toBe(true);
    });

    it('supports star and single-character wildcards across the full path', () => {
      expect(globMatchesPath('C:\\tmp\\folders\\1\\', '*\\folders\\?\\')).toBe(true);
      expect(globMatchesPath('C:\\tmp\\folders\\12\\', '*\\folders\\?\\')).toBe(false);
      expect(globMatchesPath('C:\\tmp\\folders\\1\\', 'tmp\\folders\\1\\')).toBe(false);
    });
  });
});
