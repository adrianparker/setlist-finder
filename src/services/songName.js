/**
 * Song-name helpers for searching Spotify and comparing setlist names with Spotify track names.
 * Setlist.fm names often differ from Spotify's in punctuation, brackets and apostrophes,
 * e.g. "Sweet Young Thing (Ain't Sweet No More)" vs "Sweet Young Thing Ain't Sweet No More".
 */

// Words that mark a bracketed part of a track name as a version rather than part of the title
const VERSION_WORDS = /\b(live|demo|remaster(ed)?|version|mix|edit|mono|stereo|acoustic|sessions?|take|instrumental|single|bonus|recorded|unplugged|rehearsal|outtake|\d{4})\b/i;

function straightenQuotes(text) {
  return text.replace(/[\u2018\u2019\u02bc`]/g, '\'').replace(/[\u201c\u201d]/g, '"');
}

/**
 * Tidy a song name for use in a Spotify search query: brackets, commas, question marks,
 * exclamation marks and double quotes are removed; words and apostrophes are kept.
 */
export function cleanSearchTerm(name) {
  return straightenQuotes(name || '')
    .replace(/[()[\]{}"?!,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduce a name to lower-case words for comparison: accents, apostrophes and punctuation
 * are removed, "&" becomes "and", and brackets count as spaces.
 */
export function normaliseForCompare(name) {
  return straightenQuotes(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Split a Spotify track name into the song title and its version description,
 * e.g. "If I Think - Live in Berlin 10/10/88" or "Mudride (Live)".
 * Brackets that are part of the title, such as "(Ain't Sweet No More)", are kept.
 * @returns {{title: string, version: string}}
 */
export function splitVersion(trackName) {
  const name = (trackName || '').trim();

  const dash = name.match(/^(.+?)\s+[-\u2013\u2014]\s+(.+)$/);
  if (dash) {
    return { title: dash[1].trim(), version: dash[2].trim() };
  }

  const bracket = name.match(/^(.+?)\s*[([]([^)\]]+)[)\]]$/);
  if (bracket && VERSION_WORDS.test(bracket[2])) {
    return { title: bracket[1].trim(), version: bracket[2].trim() };
  }

  return { title: name, version: '' };
}

function comparisonKeys(title) {
  const withoutBrackets = title.replace(/[([][^)\]]*[)\]]/g, ' ');
  return new Set([normaliseForCompare(title), normaliseForCompare(withoutBrackets)].filter(Boolean));
}

/**
 * Check whether a Spotify track name is the same song as a setlist song name,
 * ignoring version suffixes, punctuation and an optional bracketed part of the title.
 */
export function namesMatch(songName, trackName) {
  const songKeys = comparisonKeys(songName || '');
  const trackKeys = comparisonKeys(splitVersion(trackName).title);
  return [...songKeys].some(key => trackKeys.has(key));
}
