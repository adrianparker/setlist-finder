import fs from 'fs';

/**
 * Load and validate a song-list file, e.g. a predicted setlist.
 * Format: { "artist": "Mudhoney", "title": "...", "songs": [{ "name": "...", "note": "..." }] }
 * Songs may also be plain strings.
 * @param {string} filePath - path to the JSON file
 * @returns {{artist: string, title: string, songs: Array<{name: string, note: string}>}}
 */
export function loadSongList(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read song list "${filePath}": ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Song list "${filePath}" is not valid JSON: ${err.message}`);
  }

  return parseSongList(data, filePath);
}

/**
 * Validate and normalise song-list data
 * @param {Object} data - parsed song-list JSON
 * @param {string} source - name used in error messages
 */
export function parseSongList(data, source = 'song list') {
  const artist = typeof data?.artist === 'string' ? data.artist.trim() : '';
  if (!artist) {
    throw new Error(`${source}: "artist" is required`);
  }

  if (!Array.isArray(data.songs) || data.songs.length === 0) {
    throw new Error(`${source}: "songs" must be a non-empty array`);
  }

  const songs = data.songs.map((song, index) => {
    const name = typeof song === 'string' ? song : song?.name;
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error(`${source}: song ${index + 1} has no name`);
    }
    const note = typeof song === 'object' && typeof song.note === 'string' ? song.note.trim() : '';
    return { name: name.trim(), note };
  });

  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : `${artist} setlist`;

  return { artist, title, songs };
}
