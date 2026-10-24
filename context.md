# Project Context for LLM

## 🧠 Overview

This project is a **command-line application** using **Node.js** that gives a user one Spotify playlist per gig they are going to:

- Runs on **macOS**, but should retain **OS independence**.
- Takes a **performer**, a **show date** (YYYYMMDD) and an optional **city** (`gig` command).
- Uses the **MusicBrainz API** to return the **MusicBrainz artist ID (mbid)** for the performer.
- Uses the **Setlist.fm API** to retrieve setlists for the artist.
- **Today or a future date**: predicts the setlist from the performer's most recent earlier setlists.
- **A past date**: uses the setlist actually played, once it is posted on setlist.fm.
- Matches songs to **Spotify** and creates or updates **one playlist per show**, keeping its Spotify ID as it changes from predicted to actual.
- All API calls use **JSON** responses.

## 📡 MusicBrainz API

The application will interact with the **MusicBrainz Web API**:

- The API is a **RESTful web service** to access the **MusicBrainz music metadata database**.  
- Responses can be returned as **JSON** by specifying the appropriate format (`fmt=json` or `Accept: application/json`).
- To find an artist's MBID when only the name is provided, the app should **search the artist resource** with a query using the artist name.
- **Rate limits**: about one request per second; MusicBrainz answers 503 (or 429) when exceeded. `MusicBrainzClient` retries these after 1s, 2s and 4s, or the `Retry-After` header.

## 🎵 Setlist.fm API

The application will interact with the **Setlist.fm Web API**:

- The API is a **RESTful web service** to access setlist data for artists.
- **Base URL**: `https://api.setlist.fm/rest/1.0/`
- **Authentication**: Requires an API key passed via `x-api-key` header.
- **Response Format**: Always returns **JSON** (no format parameter needed).
- **Rate Limits**: Refer to [Setlist.fm API Documentation](https://api.setlist.fm/docs/1.0/index.html) for rate limiting details.
- **Key Endpoints**:
  - `GET /search/setlists?artistMbid={mbid}&p={page}` - An artist's setlists, newest first, 20 per page (404 past the last page)
  - `GET /search/setlists?artistMbid={mbid}&date={dd-MM-yyyy}&cityName={city}` - An artist's setlists on one date (404 when there are none)
  - Setlists not yet filled in have no songs (`sets.set` empty); these are skipped
- **Documentation**: https://api.setlist.fm/docs/1.0/index.html

## 🎶 Spotify Web API

The application integrates with the **Spotify Web API** to match songs and create playlists:

- **Base URL**: `https://api.spotify.com/v1/`
- **Authentication**:
  - **Search** uses the **Client Credentials OAuth 2.0** flow (`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`); tokens are cached until expiry
  - **Playlist creation** needs a **user token** from the **Authorization Code with PKCE** flow (`SpotifyAuth`). A client-credentials token can never change a user's playlists
  - Redirect URI: `http://127.0.0.1:8888/callback` (a loopback IP literal; Spotify rejects `localhost`). A temporary local server receives the redirect; the user can also paste the redirect address into the terminal when the browser blocks `http`
  - Scopes: `playlist-modify-private playlist-modify-public playlist-read-private` (the last finds the user's private playlists to update them); stored tokens without all scopes trigger a new sign-in
  - Tokens are stored in `.spotify-token.json` (gitignored, mode 600) and refreshed automatically; Spotify may omit a new refresh token on refresh, so the old one is kept
- **Response Format**: Always returns **JSON**.
- **Key Endpoints** (per the February 2026 Web API changes; do not use the removed `POST /users/{id}/playlists` or `/playlists/{id}/tracks`):
  - `GET /search` - Search for tracks using field filters: `q=artist:artistName track:songName`
  - `POST /me/playlists` - Create a playlist for the signed-in user (`name`, `public`, `description`)
  - `POST /playlists/{id}/items` - Add tracks in order (`uris`, max 100 per request)
  - `PUT /playlists/{id}/items` - Replace all tracks, keeping the playlist ID (max 100; the rest are added with POST)
  - `PUT /playlists/{id}` - Change name, description and `public`
  - `GET /playlists/{id}/items` - Read tracks (each entry's track is in `item`; `track` is deprecated); own playlists only
  - `GET /me/playlists` - The user's playlists, 50 per page (playlist objects have `items`, not `tracks`)
  - `GET /me` - The user's ID, to keep only playlists they own
- **Search Query Parameters**:
  - `q` - Search query with field filters (required, must be URL encoded)
  - `type=track` - Specify search type (required)
  - `limit` - Maximum results per request (Development Mode: max 10, default 5); use `offset` to page
- **Removed response fields**: `popularity` is no longer returned on tracks, albums or artists
- **Development Mode**: the app owner needs Spotify Premium; at most 5 users per app
- **Rate limits**: HTTP 429 with `Retry-After` in seconds. Development Mode can impose waits of many hours (seen: 66214s) after too many searches. Waits of 10s or less are retried; longer ones raise `SpotifyRateLimitError` at once, and matching stops
- **Search cache**: `SearchCache` keeps search results in `.spotify-search-cache.json` (gitignored) for 7 days, keyed by query, so re-runs do not repeat searches. Only successful searches are cached
- **Headers**:
  - `Authorization: Bearer {access_token}` - Bearer token authentication
  - No `Content-Type` header for GET requests
- **Documentation**: https://developer.spotify.com/documentation/web-api
- **Setup**: Create a Spotify app at https://developer.spotify.com/dashboard to get Client ID and Secret, and register the redirect URI

### Spotify Integration Features

- **Searching** (`SpotifyClient.searchTracks`):
  - Tidies the song name (`cleanSearchTerm`): removes brackets, `?`, `!`, commas and double quotes, keeps apostrophes
  - Runs `artist:{artist} track:{song}` plus a second `... live` search, fetches a second page when a page is full, and merges results without duplicates
- **Song Matching Algorithm** (`SpotifyMatcher.findBestMatch`):
  1. **Artist matching**: case-insensitive exact match, so covers by other artists are never picked
  2. **Name matching** (`namesMatch`): ignores case, punctuation, apostrophes, accents, version suffixes (`- Live in Europe`, `(Live)`, `- Remastered`) and an optional bracketed part of the title
  3. **Live priority**: live if the album name or the track's version suffix contains the whole word "live", "concert" or "unplugged"; "live" inside the song title itself does not count
  4. **Original releases**: reissues, compilations, deluxe/expanded editions, year-range collections, remasters and demos are used only when nothing else exists (`isReissue`)
  5. **Release date**: most recent live release; earliest studio release (the original album). Unknown dates sort last
- **Setlist prediction** (`setlistPredictor`):
  - Sources: the last N (default 5) setlists with songs dated before the show, paging through setlist.fm (at most 5 pages)
  - Includes every song played at those shows; songs with differently punctuated names are merged
  - Order: average relative position in the set (0 = first, 1 = last, so short or incomplete setlists do not distort it); songs mostly played in the encore go last; ties by times played, then most recently played
  - Notes: `every show`, `3 of 5`, `encore - every show`
- **Actual setlist** (`showSetlist`): the setlist with songs on the show date, narrowed by city; if several, the first, with a warning suggesting `--city`
- **Playlist building** (`playlistBuilder`):
  - Matches songs in order, prints a table (position, song, LIVE/STUDIO/NO MATCH/ERROR, Spotify track, album, year, and a Played column when there are notes)
  - Predicted: title `YYYYMMDD performer - predicted setlist`; description `The most likely setlist for {performer} for their upcoming show.`
  - Actual: title `YYYYMMDD performer - actual setlist`; description `The setlist {performer} played at {venue}, {city} on {d Mon yyyy}.`
  - **One playlist per show**: found by title prefix `YYYYMMDD performer -` (case-insensitive) among playlists the user owns; no local state
  - Created when missing; otherwise updated in place: details only when the title, description or requested visibility differ, tracks (replaced) only when the matched tracks or their order differ. Unmatched songs are skipped
  - **Never writes from incomplete data**: a failed search is an ERROR, not a NO MATCH, and any ERROR stops the playlist from being created or changed
- **Logging**: Matched songs include album name and release date; unmatched songs logged with warnings

## 🧪 JSON Format

When calling APIs:

**MusicBrainz API:**
- By default, the API returns XML.
- To receive JSON, the request must either include:
  - `fmt=json` as a query parameter, **or**
  - `Accept: application/json` in the request headers.

**Setlist.fm API:**
- Always returns JSON responses.
- Requires `x-api-key` header with valid API key.

**Spotify API:**
- Always returns JSON responses.
- Requires `Authorization: Bearer {access_token}` header.
- Query strings must be URL encoded with `encodeURIComponent()`.

## 🔍 Handling Artist Input

- The performer is passed as a command argument (`--performer`); commands are not interactive.
- After searching the MusicBrainz API for the artist, parse the results to:
  - Identify the best matching artist,
  - Extract the **MusicBrainz artist ID (mbid)**.
- Use the MBID to query the Setlist.fm API for the artist's setlists.

## 📘 API Documentation

- **MusicBrainz API**: https://musicbrainz.org/doc/MusicBrainz_API
- **Setlist.fm API**: https://api.setlist.fm/docs/1.0/index.html

---

## 🛠️ Technical Stack & Requirements

### Language & Testing
- **Language**: JavaScript (Node.js)
- **Testing Framework**: Mocha

#### Testing
- All tests must use Mocha, Sinon, and Chai
- Do not use Vitest or other testing frameworks
- Use `sinon.stub()` for mocks and stubs
- Use Chai assertions (`expect().to.equal()`, `expect().to.deep.equal()`, etc.)
- Always clean up stubs in `afterEach()` hooks

### Code Style Guidelines
- Never use emojis in code comments or console output
- Professional, production-grade code with clear separation of concerns

### Logging
- **API Call Logging**: All API calls must be logged
- **Log Output**: 
  - Console output for real-time feedback
  - Local file storage with date-based file names
  - Separate log file for each calendar date
  - Log files stored in a dedicated `logs/` folder organized by date (e.g., `logs/2025-12-28.log`)

### Output
- **MBID Result**: Output the MusicBrainz artist ID to console in a user-friendly format
- **Gig Result**: Output the source shows, the match table, what happened to the playlist (created, updated, already up to date) and its URL

### Recommended CLI Approach
- Use **Commander.js** for professional CLI argument parsing and help documentation
- Structure: Modular design with separate concerns (API clients, logger, CLI handlers, business logic)
- Commands:
  - `gig --performer <name> --date <YYYYMMDD> [--city <name>] [--shows <n>] [--private] [--dry-run]` - Create or update the show's playlist: predicted for today or a future date, actual for a past date (until one is posted, an existing playlist is kept, or a prediction created)
  - `search <artistName>` - Search for artist MBID only
  - `login` / `logout` - Sign in to Spotify (PKCE) or remove stored tokens

### Service Architecture

**API Client Services:**
- `MusicBrainzClient` - Searches for artists, returns MBID; retries rate-limit responses
- `SetlistFmClient` - Fetches setlists by artist MBID (paged, or on one date), includes rate limiting (2.5s throttle)
- `SpotifyClient` - Searches tracks on Spotify (Client Credentials flow with token caching, optional `SearchCache`); creates, lists, renames and replaces the tracks of the user's playlists with a user token; handles 429s
- `SpotifyAuth` - Spotify user sign-in with Authorization Code + PKCE, loopback callback server, token storage and refresh

**Utility & Matching Services:**
- `SetlistParser` - Extracts songs from setlist JSON responses, preserves set numbers and encore info
- `SpotifyMatcher` - Matches Spotify search results: artist and name checks, live preference, original-release preference, release-date tie-break
- `songName` - Song-name tidying and comparison helpers
- `setlistPredictor` - Finds the source setlists and predicts a setlist from them
- `showSetlist` - Finds the setlist actually played at a show
- `playlistBuilder` - Matching, the table, titles and descriptions, and finding, creating and updating a show's playlist
- `SearchCache` - Local file cache of Spotify search results

**Supporting Services:**
- `Logger` - Winston-based logging with console output and date-based file storage in `logs/` folder

**Environment Configuration:**
- `.env` file required with:
  - `SETLISTFM_API_KEY` - API key from setlist.fm
  - `SPOTIFY_CLIENT_ID` - Client ID from Spotify Developer Dashboard
  - `SPOTIFY_CLIENT_SECRET` - Client Secret from Spotify Developer Dashboard
  - Optional: `SPOTIFY_REDIRECT_URI` (default `http://127.0.0.1:8888/callback`), `SPOTIFY_TOKEN_PATH` (default `.spotify-token.json`), `SPOTIFY_SEARCH_CACHE_PATH` (default `.spotify-search-cache.json`)

