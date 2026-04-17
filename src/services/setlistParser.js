/**
 * Parses a setlist response and extracts individual songs with metadata
 * @param {Object} setlistResponse - Response from setlist.fm API
 * @returns {Array} Array of {songName, artistName, setNumber, isTape, isEncoreSet}
 */
export function parseSetlistSongs(setlistResponse) {
  const songs = [];

  if (!setlistResponse || !setlistResponse.sets || !setlistResponse.sets.set) {
    return songs;
  }

  const artistName = setlistResponse.artist?.name || 'Unknown Artist';
  const setsArray = Array.isArray(setlistResponse.sets.set) 
    ? setlistResponse.sets.set 
    : [setlistResponse.sets.set];

  setsArray.forEach((set, setIndex) => {
    const setNumber = setIndex + 1;
    const isEncoreSet = set.encore !== undefined && set.encore !== null;
    const encoreNumber = set.encore || null;

    if (!Array.isArray(set.song)) {
      // Single song in set
      if (set.song && set.song.name) {
        songs.push({
          songName: set.song.name,
          artistName,
          setNumber,
          isEncoreSet,
          encoreNumber,
          isTape: set.song.tape === true
        });
      }
      return;
    }

    // Multiple songs in set
    set.song.forEach((song) => {
      if (song && song.name) {
        songs.push({
          songName: song.name,
          artistName,
          setNumber,
          isEncoreSet,
          encoreNumber,
          isTape: song.tape === true
        });
      }
    });
  });

  return songs;
}
