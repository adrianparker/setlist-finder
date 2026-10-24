import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SEARCH_CACHE_PATH = path.join(__dirname, '../../.spotify-search-cache.json');
export const DEFAULT_MAX_AGE_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

/**
 * A local file cache of Spotify search results, so re-running a command does not repeat
 * the same searches and run into Spotify's rate limits. Entries expire after maxAgeDays,
 * so newly released recordings are picked up eventually.
 */
export class SearchCache {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.filePath = options.filePath || process.env.SPOTIFY_SEARCH_CACHE_PATH || DEFAULT_SEARCH_CACHE_PATH;
    this.maxAgeMs = (options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * DAY_MS;
    this.entries = this.load();
  }

  static key(query) {
    return String(query).trim().toLowerCase();
  }

  load() {
    let raw;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch {
      return {};
    }
    try {
      return JSON.parse(raw).entries || {};
    } catch (err) {
      this.logger.warn(`Ignoring unreadable Spotify search cache ${this.filePath}: ${err.message}`);
      return {};
    }
  }

  isFresh(entry) {
    return entry && Date.now() - entry.cachedAt < this.maxAgeMs;
  }

  /**
   * @returns {Array|undefined} cached results, or undefined when missing or expired
   */
  get(query) {
    const entry = this.entries[SearchCache.key(query)];
    return this.isFresh(entry) ? entry.results : undefined;
  }

  /**
   * Store results and save the cache file straight away, so an interrupted run keeps them
   */
  set(query, results) {
    this.entries[SearchCache.key(query)] = { cachedAt: Date.now(), results };
    this.entries = Object.fromEntries(Object.entries(this.entries).filter(([, entry]) => this.isFresh(entry)));
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ entries: this.entries }));
  }
}
