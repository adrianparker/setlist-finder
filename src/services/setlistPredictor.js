import { parseSetlistSongs } from './setlistParser.js';
import { normaliseForCompare } from './songName.js';

export const DEFAULT_SOURCE_SHOWS = 5;
export const DEFAULT_MAX_PAGES = 5;

/**
 * Convert a setlist.fm event date (dd-MM-yyyy) to a sortable YYYYMMDD string
 * @returns {string|null} YYYYMMDD, or null if the date is not recognised
 */
export function setlistDateToSortable(eventDate) {
  const match = String(eventDate ?? '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}${match[2]}${match[1]}` : null;
}

function hasSongs(setlist) {
  return parseSetlistSongs(setlist).some(song => !song.isTape);
}

/**
 * Find the most recent setlists with songs dated before a show, newest first.
 * Pages through the artist's setlists on setlist.fm (newest first) until enough are found.
 * @param {Object} deps - { setlistClient, logger }
 * @param {string} artistMbid - MusicBrainz artist ID
 * @param {string} showDate - show date as YYYYMMDD; only earlier setlists are used
 * @param {number} count - number of setlists wanted
 * @param {number} maxPages - most setlist.fm result pages to read
 */
export async function findSourceSetlists({ setlistClient, logger }, artistMbid, showDate, count = DEFAULT_SOURCE_SHOWS, maxPages = DEFAULT_MAX_PAGES) {
  const found = [];

  for (let page = 1; page <= maxPages && found.length < count; page++) {
    let data;
    try {
      data = await setlistClient.searchSetlistsByArtist(artistMbid, null, page);
    } catch (err) {
      // setlist.fm answers 404 when a page is past the last result
      if (page > 1 && /\b404\b/.test(err.message)) break;
      throw err;
    }

    for (const setlist of data.setlist || []) {
      const date = setlistDateToSortable(setlist.eventDate);
      if (!date || date >= showDate) continue;
      if (!hasSongs(setlist)) {
        logger.debug(`Skipping setlist ${setlist.id} (${setlist.eventDate}): no songs listed`);
        continue;
      }
      found.push(setlist);
      if (found.length === count) break;
    }

    const total = data.total ?? 0;
    const perPage = data.itemsPerPage ?? 20;
    if (page * perPage >= total) break;
  }

  return found;
}

function describeFrequency(timesPlayed, showCount) {
  return timesPlayed === showCount ? 'every show' : `${timesPlayed} of ${showCount}`;
}

function relativePosition(index, length) {
  return length > 1 ? index / (length - 1) : 0;
}

/**
 * Predict a setlist from earlier setlists: every song played, ordered by its average
 * relative position in the set, with songs mostly played in the encore placed last.
 * Relative positions (0 = first, 1 = last) stop short or incomplete setlists distorting the order.
 * @param {Array} setlists - setlist.fm setlists, newest first
 * @returns {{songs: Array<{name, note, timesPlayed, encore}>, showCount: number, sources: Array}}
 */
export function predictSetlist(setlists) {
  const stats = new Map();

  setlists.forEach((setlist, showIndex) => {
    const songs = parseSetlistSongs(setlist).filter(song => !song.isTape);
    const sections = {
      main: songs.filter(song => !song.isEncoreSet),
      encore: songs.filter(song => song.isEncoreSet)
    };

    for (const [section, list] of Object.entries(sections)) {
      list.forEach((song, index) => {
        const key = normaliseForCompare(song.songName);
        if (!key) return;
        if (!stats.has(key)) {
          // Setlists are newest first, so the first spelling seen is the most recent
          stats.set(key, { name: song.songName, shows: new Set(), main: [], encore: [], lastShowIndex: showIndex });
        }
        const entry = stats.get(key);
        entry.shows.add(showIndex);
        entry[section].push(relativePosition(index, list.length));
      });
    }
  });

  const showCount = setlists.length;
  const average = values => values.reduce((sum, v) => sum + v, 0) / values.length;

  const songs = [...stats.values()].map(entry => {
    const encore = entry.encore.length > entry.main.length;
    const positions = encore ? entry.encore : entry.main;
    const timesPlayed = entry.shows.size;
    const frequency = describeFrequency(timesPlayed, showCount);
    return {
      name: entry.name,
      note: encore ? `encore - ${frequency}` : frequency,
      timesPlayed,
      encore,
      position: average(positions),
      lastShowIndex: entry.lastShowIndex
    };
  });

  songs.sort((a, b) =>
    (a.encore - b.encore) ||
    (a.position - b.position) ||
    (b.timesPlayed - a.timesPlayed) ||
    (a.lastShowIndex - b.lastShowIndex) ||
    a.name.localeCompare(b.name));

  return {
    songs: songs.map(({ name, note, timesPlayed, encore }) => ({ name, note, timesPlayed, encore })),
    showCount,
    sources: setlists.map(setlist => ({
      id: setlist.id,
      eventDate: setlist.eventDate,
      venue: setlist.venue?.name || 'Unknown venue',
      city: setlist.venue?.city?.name || 'Unknown city',
      songCount: parseSetlistSongs(setlist).filter(song => !song.isTape).length
    }))
  };
}
