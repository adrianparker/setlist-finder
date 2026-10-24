# Project Context for LLM

## 🧠 Overview

This project is building a **command-line application** using **Node.js** that:

- Runs on **macOS**, but should retain **OS independence**.
- Accepts an **artist name** input from the user.
- Uses the **MusicBrainz API** to return the **MusicBrainz artist ID (mbid)** for the given name.
- Uses the **Setlist.fm API** to retrieve setlists for the artist.
- Parses songs from setlist responses and matches them to **Spotify** for playlist data.
- All API calls use **JSON** responses.

## 📡 MusicBrainz API

The application will interact with the **MusicBrainz Web API**:

- The API is a **RESTful web service** to access the **MusicBrainz music metadata database**.  
- Responses can be returned as **JSON** by specifying the appropriate format (`fmt=json` or `Accept: application/json`).
- To find an artist's MBID when only the name is provided, the app should **search the artist resource** with a query using the artist name.

## 🎵 Setlist.fm API

The application will interact with the **Setlist.fm Web API**:

- The API is a **RESTful web service** to access setlist data for artists.
- **Base URL**: `https://api.setlist.fm/rest/1.0/`
- **Authentication**: Requires an API key passed via `x-api-key` header.
- **Response Format**: Always returns **JSON** (no format parameter needed).
- **Rate Limits**: Refer to [Setlist.fm API Documentation](https://api.setlist.fm/docs/1.0/index.html) for rate limiting details.
- **Key Endpoints**:
  - `GET /search/setlists?artistMbid={mbid}` - Search setlists by artist MusicBrainz ID
- **Documentation**: https://api.setlist.fm/docs/1.0/index.html

## 🎶 Spotify Web API

The application integrates with the **Spotify Web API** to match songs and create playlists:

- **Base URL**: `https://api.spotify.com/v1/`
- **Authentication**:
  - **Search** uses the **Client Credentials OAuth 2.0** flow (`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`); tokens are cached until expiry
  - **Playlist creation** needs a **user token** from the **Authorization Code with PKCE** flow (`SpotifyAuth`). A client-credentials token can never change a user's playlists
  - Redirect URI: `http://127.0.0.1:8888/callback` (a loopback IP literal; Spotify rejects `localhost`). A temporary local server receives the redirect; the user can also paste the redirect address into the terminal when the browser blocks `http`
  - Scopes: `playlist-modify-private playlist-modify-public`
  - Tokens are stored in `.spotify-token.json` (gitignored, mode 600) and refreshed automatically; Spotify may omit a new refresh token on refresh, so the old one is kept
- **Response Format**: Always returns **JSON**.
- **Key Endpoints** (per the February 2026 Web API changes; do not use the removed `POST /users/{id}/playlists` or `/playlists/{id}/tracks`):
  - `GET /search` - Search for tracks using field filters: `q=artist:artistName track:songName`
  - `POST /me/playlists` - Create a playlist for the signed-in user (`name`, `public`, `description`)
  - `POST /playlists/{id}/items` - Add tracks in order (`uris`, max 100 per request)
- **Search Query Parameters**:
  - `q` - Search query with field filters (required, must be URL encoded)
  - `type=track` - Specify search type (required)
  - `limit` - Maximum results per request (Development Mode: max 10, default 5); use `offset` to page
- **Removed response fields**: `popularity` is no longer returned on tracks, albums or artists
- **Development Mode**: the app owner needs Spotify Premium; at most 5 users per app
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
- **Playlist building** (`playlistBuilder`):
  - Matches songs in order, prints a table (position, song, LIVE/STUDIO/NO MATCH, Spotify track, album, year)
  - Title: `YYYYMMDD performer - predicted setlist`; description: `The most likely setlist for {performer} for their upcoming show.`
  - Creates the playlist and adds matched tracks in order; unmatched songs are skipped
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

- Your application should **prompt the user for an artist name**.
- If the input is **insufficient or ambiguous**, ask a **clarifying question** to refine the search (e.g., ask for more details or alternate spellings).
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
- **Setlists Result**: Output artist setlists to console in a user-friendly format

### Recommended CLI Approach
- Use **Commander.js** for professional CLI argument parsing and help documentation
- Structure: Modular design with separate concerns (API clients, logger, CLI handlers, business logic)
- Commands:
  - `search <artistName>` - Search for artist MBID only
  - `setlist` - Interactive mode: search for artist, then fetch and display setlists, match songs to Spotify, and optionally create a playlist
  - `playlist --file <path> --date <YYYYMMDD> --performer <name> [--private] [--dry-run]` - Build a playlist from a song-list JSON file (`{ artist, title, songs: [{ name, note }] }`)
  - `login` / `logout` - Sign in to Spotify (PKCE) or remove stored tokens

### Service Architecture

**API Client Services:**
- `MusicBrainzClient` - Searches for artists, returns MBID
- `SetlistFmClient` - Fetches setlists by artist MBID, includes rate limiting (2.5s throttle)
- `SpotifyClient` - Searches tracks on Spotify (Client Credentials flow with token caching); creates playlists and adds tracks with a user token
- `SpotifyAuth` - Spotify user sign-in with Authorization Code + PKCE, loopback callback server, token storage and refresh

**Utility & Matching Services:**
- `SetlistParser` - Extracts songs from setlist JSON responses, preserves set numbers and encore info
- `SpotifyMatcher` - Matches Spotify search results: artist and name checks, live preference, original-release preference, release-date tie-break
- `songName` - Song-name tidying and comparison helpers
- `songList` - Loads and validates song-list JSON files
- `playlistBuilder` - Shared match, table, title/description and playlist-creation steps used by the `playlist` and `setlist` commands

**Supporting Services:**
- `Logger` - Winston-based logging with console output and date-based file storage in `logs/` folder

**Environment Configuration:**
- `.env` file required with:
  - `SETLISTFM_API_KEY` - API key from setlist.fm
  - `SPOTIFY_CLIENT_ID` - Client ID from Spotify Developer Dashboard
  - `SPOTIFY_CLIENT_SECRET` - Client Secret from Spotify Developer Dashboard
  - Optional: `SPOTIFY_REDIRECT_URI` (default `http://127.0.0.1:8888/callback`), `SPOTIFY_TOKEN_PATH` (default `.spotify-token.json`)

