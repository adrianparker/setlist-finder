/**
 * Matches tracks from Spotify search results to a specific song using intelligent preference logic
 * Preference order: Live versions > Studio versions, Most recent release date
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

    this.logger.debug(`Matching ${spotifyTracks.length} Spotify track(s) for: ${artistName} - ${songName}`);

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

    this.logger.debug(`Found ${artistMatches.length} track(s) with matching artist name`);

    // Step 2: Separate live and studio versions
    const liveVersions = artistMatches.filter(track => this.isLiveAlbum(track.album.name));
    const studioVersions = artistMatches.filter(track => !this.isLiveAlbum(track.album.name));

    this.logger.debug(`Live versions: ${liveVersions.length}, Studio versions: ${studioVersions.length}`);

    // Step 3: Prefer live versions
    const candidateTracks = liveVersions.length > 0 ? liveVersions : studioVersions;

    // Step 4: Sort by release date (most recent first)
    const sorted = this.sortByReleaseDate(candidateTracks);
    const bestMatch = sorted[0];

    const matchType = liveVersions.length > 0 ? 'live' : 'studio';
    const releaseDate = bestMatch.album.releaseDate || 'unknown date';
    this.logger.debug(`Selected ${matchType} version: "${bestMatch.album.name}" (${releaseDate})`);

    return bestMatch;
  }

  /**
   * Check if an album name indicates a live recording
   * @private
   */
  isLiveAlbum(albumName) {
    if (!albumName) return false;
    const liveIndicators = ['live', 'concert', 'live album', 'live at', 'live from'];
    return liveIndicators.some(indicator => albumName.toLowerCase().includes(indicator));
  }

  /**
   * Sort tracks by release date, most recent first
   * @private
   */
  sortByReleaseDate(tracks) {
    return tracks.sort((a, b) => {
      const dateA = new Date(a.album.releaseDate || '0000-01-01').getTime();
      const dateB = new Date(b.album.releaseDate || '0000-01-01').getTime();
      return dateB - dateA; // Most recent first
    });
  }
}
