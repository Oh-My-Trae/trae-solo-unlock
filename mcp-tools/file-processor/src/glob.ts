/**
 * Minimal glob pattern matcher for file filtering.
 * Supports: *, **, ?, [abc], {a,b}
 */
export namespace glob {

  /**
   * Convert a glob pattern to a RegExp.
   */
  function globToRegex(pattern: string): RegExp {
    let regexStr = '';
    let i = 0;

    while (i < pattern.length) {
      const ch = pattern[i];

      if (ch === '*' && pattern[i + 1] === '*') {
        // ** matches any path including separators
        if (pattern[i + 2] === '/') {
          regexStr += '(?:.+/)?';
          i += 3;
        } else {
          regexStr += '.*';
          i += 2;
        }
      } else if (ch === '*') {
        // * matches anything except path separator
        regexStr += '[^/]*';
        i++;
      } else if (ch === '?') {
        regexStr += '[^/]';
        i++;
      } else if (ch === '[') {
        // Character class
        const end = pattern.indexOf(']', i);
        if (end !== -1) {
          regexStr += pattern.slice(i, end + 1);
          i = end + 1;
        } else {
          regexStr += '\\[';
          i++;
        }
      } else if (ch === '{') {
        // Brace expansion {a,b,c}
        const end = pattern.indexOf('}', i);
        if (end !== -1) {
          const content = pattern.slice(i + 1, end);
          const options = content.split(',').join('|');
          regexStr += `(?:${options})`;
          i = end + 1;
        } else {
          regexStr += '\\{';
          i++;
        }
      } else if ('.+^${}()|[]\\'.includes(ch)) {
        regexStr += '\\' + ch;
        i++;
      } else {
        regexStr += ch;
        i++;
      }
    }

    return new RegExp(`^${regexStr}$`);
  }

  /**
   * Test if a file path matches a glob pattern.
   */
  export function match(pattern: string, filePath: string): boolean {
    const regex = globToRegex(pattern);
    return regex.test(filePath.replace(/\\/g, '/'));
  }
}
