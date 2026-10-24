import { parseSetlistSongs } from './setlistParser.js';

/**
 * Find the setlist actually played at a show: the artist's setlist.fm setlist with songs
 * on the show date, optionally narrowed to a city.
 * @param {Object} deps - { setlistClient, logger }
 * @param {string} artistMbid - MusicBrainz artist ID
 * @param {string} date - show date as YYYYMMDD
 * @param {string|null} city - optional city name
 * @returns {Promise<Object|null>} the setlist, or null if none with songs has been posted yet
 */
export async function findShowSetlist({ setlistClient, logger }, artistMbid, date, city = null) {
  const eventDate = `${date.slice(6, 8)}-${date.slice(4, 6)}-${date.slice(0, 4)}`;
  const data = await setlistClient.searchSetlistsByArtistOnDate(artistMbid, eventDate, city || null);

  const withSongs = (data.setlist || []).filter(setlist => parseSetlistSongs(setlist).some(song => !song.isTape));
  if (withSongs.length > 1) {
    const shows = withSongs.map(s => `${s.venue?.name}, ${s.venue?.city?.name}`).join('; ');
    logger.warn(`Found ${withSongs.length} shows on ${eventDate} (${shows}); using the first. Use --city to choose another.`);
  }
  return withSongs[0] || null;
}
