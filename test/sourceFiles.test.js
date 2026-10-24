import { describe, it } from 'mocha';
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

describe('source files', () => {
  it('should contain no emoji, written directly or as escapes', () => {
    for (const file of jsFiles('src')) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).to.not.match(/\p{Extended_Pictographic}|\\u27(13|17)/u);
    }
  });
});
