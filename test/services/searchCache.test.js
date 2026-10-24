import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SearchCache } from '../../src/services/searchCache.js';

describe('SearchCache', () => {
  let tmpDir;
  let cachePath;
  let clock;
  let logger;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-cache-test-'));
    cachePath = path.join(tmpDir, 'cache.json');
    clock = sinon.useFakeTimers(new Date('2026-10-25T00:00:00Z'));
    logger = { info: sinon.stub(), debug: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return undefined for a query not in the cache', () => {
    const cache = new SearchCache(logger, { filePath: cachePath });
    expect(cache.get('artist:Mudhoney track:Mudride')).to.be.undefined;
  });

  it('should return stored results, including an empty result', () => {
    const cache = new SearchCache(logger, { filePath: cachePath });
    cache.set('artist:Mudhoney track:Mudride', [{ id: 't1' }]);
    cache.set('artist:Mudhoney track:Nothing', []);

    expect(cache.get('artist:Mudhoney track:Mudride')).to.deep.equal([{ id: 't1' }]);
    expect(cache.get('artist:Mudhoney track:Nothing')).to.deep.equal([]);
  });

  it('should ignore case and surrounding spaces in the query', () => {
    const cache = new SearchCache(logger, { filePath: cachePath });
    cache.set('artist:Mudhoney track:Mudride', [{ id: 't1' }]);

    expect(cache.get('  ARTIST:mudhoney TRACK:mudride ')).to.deep.equal([{ id: 't1' }]);
  });

  it('should keep results across runs by saving them to the file', () => {
    new SearchCache(logger, { filePath: cachePath }).set('q', [{ id: 't1' }]);

    expect(new SearchCache(logger, { filePath: cachePath }).get('q')).to.deep.equal([{ id: 't1' }]);
  });

  it('should treat results older than the time limit as missing', () => {
    const cache = new SearchCache(logger, { filePath: cachePath, maxAgeDays: 7 });
    cache.set('q', [{ id: 't1' }]);

    clock.tick(6 * 24 * 3600 * 1000);
    expect(cache.get('q')).to.deep.equal([{ id: 't1' }]);
    clock.tick(2 * 24 * 3600 * 1000);
    expect(cache.get('q')).to.be.undefined;
  });

  it('should drop expired entries when saving', () => {
    const cache = new SearchCache(logger, { filePath: cachePath, maxAgeDays: 7 });
    cache.set('old', [{ id: 'a' }]);
    clock.tick(8 * 24 * 3600 * 1000);
    cache.set('new', [{ id: 'b' }]);

    const saved = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    expect(Object.keys(saved.entries)).to.deep.equal(['new']);
  });

  it('should start empty, with a warning, when the file is unreadable', () => {
    fs.writeFileSync(cachePath, '{ not json');

    const cache = new SearchCache(logger, { filePath: cachePath });

    expect(cache.get('q')).to.be.undefined;
    expect(logger.warn.calledWithMatch('Ignoring unreadable Spotify search cache')).to.be.true;
  });

  it('should start empty without a warning when there is no file yet', () => {
    const cache = new SearchCache(logger, { filePath: cachePath });

    expect(cache.get('q')).to.be.undefined;
    expect(logger.warn.called).to.be.false;
  });
});
