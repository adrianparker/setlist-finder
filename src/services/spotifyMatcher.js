import { namesMatch, splitVersion } from './songName.js';

// Whole words only, so "Alive" or "Deliverance" are not mistaken for live recordings
const LIVE_WORDS = /\b(live|concert|unplugged)\b/i;

// Album names that mark a reissue or compilation rather than the original release,
// including year ranges such as "The Reprise Recordings 1992-1998"
const REISSUE_ALBUM = /\b(deluxe|expanded|edition|anniversary|remaster(ed)?|reissue|best of|greatest|collection|anthology)\b|\b\d{4}\s*[-\u2013]\s*\d{4}\b/i;

// Track versions that are not the released recording of the song
const NON_ORIGINAL_VERSION = /\b(remaster(ed)?|demo|alternate|rough|outtake|rehearsal|instrumental)\b/i;

/**
 * Matches tracks from Spotify search results to a specific song.
 * Preference order: live versions over studio versions; within each, original releases
 * over reissues, compilations, remasters and demos; then the most recent live release,
 * or the earliest studio release (the album the song first appeared on).
 */
export class SpotifyMatcher {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Find the best matching track from search results
   * @param {Array} spotifyTracks - Array of track objects from Spotify API
   * @param {string} songName - Original song name from setlist for logging
   * @param {string} artistName - Original artist name from setlist for logging
   * @returns {Object|null} Best matching track object or null if no match found
   */
  findBestMatch(spotifyTracks, songName, artistName) {
    if (!spotifyTracks || spotifyTracks.length === 0) {
      this.logger.debug(`No Spotify tracks to match for ${artistName} - ${songName}`);
      return null;
    }

    // Step 1: Filter by artist name match (case-insensitive)
    const artistMatches = spotifyTracks.filter(track => {
      return track.artists.some(artist => 
        artist.name.toLowerCase() === artistName.toLowerCase()
      );
    });

    if (artistMatches.length === 0) {
      this.logger.debug(`No artist name matches for ${artistName} - ${songName}`);
      return null;
    }

    // Step 2: Keep only tracks that are this song, ignoring punctuation and version suffixes
    const nameMatches = artistMatches.filter(track => namesMatch(songName, track.name));

    if (nameMatches.length === 0) {
      this.logger.debug(`No track name matches for ${artistName} - ${songName}`);
      return null;
    }

    // Step 3: Separate live and studio versions
    const liveVersions = nameMatches.filter(track => this.isLive(track));
    const studioVersions = nameMatches.filter(track => !this.isLive(track));

    // Step 4: Prefer live versions
    const isLiveMatch = liveVersions.length > 0;
    const candidateTracks = isLiveMatch ? liveVersions : studioVersions;

    // Step 5: Prefer original releases; use reissues only when nothing else exists.
    // Release dates on reissues are unreliable, so this comes before the date.
    const originals = candidateTracks.filter(track => !this.isReissue(track));
    const pool = originals.length > 0 ? originals : candidateTracks;

    // Step 6: Newest live recording, but the first studio release of the song
    const sorted = this.sortByReleaseDate(pool, isLiveMatch ? 'newest' : 'oldest');
    const bestMatch = sorted[0];

    const matchType = isLiveMatch ? 'Live' : 'Studio';
    const releaseDate = bestMatch.album.releaseDate || 'unknown date';
    const reissueNote = originals.length === 0 ? ', reissue only' : '';
    this.logger.debug(`${matchType} version: "${bestMatch.album.name}" (${releaseDate}${reissueNote})`);

    return bestMatch;
  }

  /**
   * Check whether a matched track is a live recording, from its album name or
   * the version part of its track name (e.g. "Song - Live in Europe", "Song (Live)").
   * "Live" in the song title itself, as in "Live Forever", does not count.
   * @param {Object} track - track object from SpotifyClient.searchTracks
   */
  isLive(track) {
    if (this.isLiveAlbum(track?.album?.name)) return true;
    const { version } = splitVersion(track?.name);
    return LIVE_WORDS.test(version);
  }

  /**
   * Check whether a track comes from a reissue or compilation, or is a remaster, demo
   * or other non-original version of the song
   * @param {Object} track - track object from SpotifyClient.searchTracks
   */
  isReissue(track) {
    const albumName = track?.album?.name || '';
    if (REISSUE_ALBUM.test(albumName) || track?.album?.albumType === 'compilation') return true;
    const { version } = splitVersion(track?.name);
    return NON_ORIGINAL_VERSION.test(version);
  }

  /**
   * Check if an album name indicates a live recording
   * @private
   */
  isLiveAlbum(albumName) {
    if (!albumName) return false;
    return LIVE_WORDS.test(albumName);
  }

  /**
   * Sort tracks by release date; tracks with no usable date always sort last
   * @param {Array} tracks - tracks to sort (sorted in place)
   * @param {string} order - 'newest' or 'oldest' first
   * @private
   */
  sortByReleaseDate(tracks, order = 'newest') {
    const time = track => {
      const value = new Date(track.album.releaseDate || '').getTime();
      return Number.isNaN(value) ? null : value;
    };
    return tracks.sort((a, b) => {
      const dateA = time(a);
      const dateB = time(b);
      if (dateA === null || dateB === null) return (dateA === null) - (dateB === null);
      return order === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }
}
