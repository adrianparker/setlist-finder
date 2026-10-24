# Setlist Finder

A command-line application that finds a setlist, then makes a Spotify playlist of it.

## Features

- Search for setlists on setlist.fm by artist, narrowed by city if known, and turn one into a Spotify playlist.
- Build a Spotify playlist from your own song-list file, such as a predicted setlist for an upcoming show.
- Matching prefers live versions over studio versions, and original releases over reissues, compilations, remasters and demos.
- Playlists are created in your own Spotify account after a one-time browser sign-in.

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd setlist-finder
```

2. Install dependencies:
```bash
npm install
```

3. Copy the example environment file to a new `.env` file:

```bash
cp .env.example .env
```

4. Open `.env` and set your [Setlist.fm API key](https://api.setlist.fm/docs/1.0/index.html).

```
SETLISTFM_API_KEY=your_setlistfm_api_key_here
```

5. Create a Spotify app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), then set its client ID and secret in `.env`.

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

6. In the dashboard, open your app's **Settings**, add this **Redirect URI** exactly, and save:

```
http://127.0.0.1:8888/callback
```

Spotify does not accept `localhost` as a redirect URI, so it must be `127.0.0.1`. To use a different port or path, set `SPOTIFY_REDIRECT_URI` in `.env` to the same value you register.

Apps in Spotify's Development Mode only work for the app owner and up to 5 users added under **User Management**, and the owner needs an active Spotify Premium subscription.

7. Sign in to Spotify once, so playlists can be created in your account:

```bash
npm start login
```

## Usage

### Sign in to Spotify

```bash
npm start login
```

Your browser opens Spotify's sign-in page. After you approve access, Spotify sends the browser back to `http://127.0.0.1:8888/callback` and the terminal reports `Spotify sign-in complete.`

Some browsers refuse to open a plain `http` address. Safari with HTTPS-Only enabled shows "Safari Can't Open the Page", for example. If that happens, copy the full address from the browser's address bar and paste it into the terminal when asked.

Sign-in tokens are stored in `.spotify-token.json` in the project folder. The file is readable only by you and ignored by git. Access is refreshed automatically, so you normally sign in only once. The app asks only for permission to create and change your playlists (`playlist-modify-public` and `playlist-modify-private`).

To remove the stored tokens:

```bash
npm start logout
```

If you are not signed in when a playlist is about to be created, the sign-in starts automatically.

### Build a playlist from a song-list file

```bash
npm start playlist -- --file examples/mudhoney-predicted-2026-10.json --date 20261029 --performer Mudhoney
```

| Option | Description |
|---|---|
| `-f, --file <path>` | Song-list JSON file (required) |
| `-d, --date <YYYYMMDD>` | Date of the performance, used in the playlist title (required) |
| `-p, --performer <name>` | Band or artist name for the playlist title and description (required) |
| `--private` | Make the playlist private (default: public) |
| `--dry-run` | Match the songs and print the table without signing in or creating a playlist |

The playlist is titled `YYYYMMDD performer - predicted setlist`, e.g. `20261029 Mudhoney - predicted setlist`. Its description is `The most likely setlist for Mudhoney for their upcoming show.` Tracks are added in the order of the file. Songs with no match are left out.

The song-list file names the artist to search for and the songs in order. Each song can have a note:

```json
{
  "artist": "Mudhoney",
  "title": "Mudhoney predicted setlist (from AU tour, 16-22 Oct 2026)",
  "songs": [
    { "name": "If I Think", "note": "every show (opener)" },
    { "name": "Sweet Young Thing (Ain't Sweet No More)", "note": "2 of 4" },
    "Touch Me I'm Sick"
  ]
}
```

Song names can be written as they appear on setlist.fm. Brackets, apostrophes and punctuation such as `?` are handled when searching and comparing.

#### Example Output

```bash
$ npm start playlist -- --file examples/mudhoney-predicted-2026-10.json --date 20261029 --performer Mudhoney --dry-run

[info]: Loaded 30 song(s) by Mudhoney from examples/mudhoney-predicted-2026-10.json
[info]: Matching songs with Spotify...

#    Song                                Type      Spotify track                       Album                                 Year
---  ----------------------------------  --------  ----------------------------------  ------------------------------------  ----
 1   If I Think                          LIVE      If I Think - Live in Berlin 10/...  Superfuzz Bigmuff (Deluxe Edition)    1988
 2   Get Into Yours                      LIVE      Get Into Yours - Live in Europe     LiE (Live in Europe)                  2018
 3   Move Under                          STUDIO    Move Under                          Plastic Eternity                      2023
...
30   In 'n' Out of Grace                 LIVE      In 'N' Out Of Grace                 Live At El Sol                        2009

30 songs: 12 live, 18 studio, 0 not matched

[info]: Dry run: no playlist created. Title would be "20261029 Mudhoney - predicted setlist"; description "The most likely setlist for Mudhoney for their upcoming show."
```

Without `--dry-run`, the command signs in first, then matches, creates the playlist, and finishes with its URL:

```bash
[info]: Playlist "20261029 Mudhoney - predicted setlist" created (public) with 30 track(s)
[info]: URL: https://open.spotify.com/playlist/...
```

### Search for a Setlist

```bash
npm start setlist
```

You are asked for an artist and, optionally, a city. The first setlist found is matched to Spotify and the same table is printed. You are then asked whether to create a playlist. The playlist date comes from the setlist's event date, and the performer from its artist. This command is interactive, so run it in a terminal rather than piping input to it.

#### Example Output

```bash
$ npm start setlist

Enter artist name: Mudhoney
[info]: Selected Mudhoney MBID: e675295a-1efe-4247-aa3b-53b78d0cdffc
Enter a city (optional): Sydney
[info]: Found 20 setlist(s):
[info]: 1. 22-10-2026 Venue: The Factory Theatre, Sydney, Australia Setlist ID: 137ee1d5
...
[info]: Matching 21 setlist song(s) with Spotify...

#    Song                                Type      Spotify track                       Album                                 Year
...
21 songs: 10 live, 11 studio, 0 not matched

Create Spotify playlist "20261022 Mudhoney - predicted setlist"? (y/N): y
```

### Search for an Artist MBID

Finds the MusicBrainz ID for the artist that best matches your artist search term.

```bash
npm start search <artist>
```

#### Example Output

```bash
$ npm start search Portishead

[info]: Searching for artist: Portishead
[info]: Chosen artist: Portishead
[info]: MBID: 8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11
```

### Help

```bash
npm start -- --help
```

## How songs are matched

For each song, the app searches Spotify with `artist:<artist> track:<song>`, plus a second search with `live` added, and merges the results. Then it:

1. Keeps tracks by the same artist (exact, case-insensitive), so covers by other artists are never picked.
2. Keeps tracks that are the same song. Case, punctuation, apostrophes and version suffixes such as `- Remastered` are ignored.
3. Prefers live versions. A track counts as live when its album name or its version suffix says so, e.g. "Live At El Sol", "Get Into Yours - Live in Europe" or "Mudride (Live)". "Live" inside a song title, as in "Live Forever", does not count.
4. Prefers original releases over reissues, compilations, deluxe or expanded editions, remasters and demos. These are used only when no other version exists.
5. Picks the most recent live release, or the earliest studio release (the album the song first appeared on).

Spotify only knows release dates, not recording dates, and reissues often carry misleading dates. That is why step 4 comes before the date.

## Development

### Run Tests

```bash
npm test
```

The tests mock all API calls and don't need a `.env` file.

### Watch Tests (auto-rerun on file changes)

```bash
npm run test:watch
```

## Logging

API calls are logged to local files:

- **Location**: `logs/` directory
- **Format**: `YYYY-MM-DD.log` (one file per day)
- **Content**: Timestamps, log levels, and API request/response details

## Technology Stack

- **Runtime**: Node.js
- **CLI Framework**: Commander.js
- **Testing**: Mocha + Chai + Sinon
- **API**: MusicBrainz Web API, Setlist.fm Web API, Spotify Web API

## Setlist.fm API

This application uses the Setlist.fm Web API to find setlists for artists (by MusicBrainz artist MBID) and to retrieve setlist details.

- Authentication: provide your API key in .env as SETLISTFM_API_KEY. Requests must include the x-api-key header and an Accept header for JSON:
```text
x-api-key: your_setlistfm_api_key_here
Accept: application/json
```
- Common endpoints used:
  - GET /rest/1.0/search/setlists: search setlists (accepts artistMbid and city query params)
  - GET /rest/1.0/setlist/{setlistId}: get a single setlist's details
- Notes:
  - The app first resolves an artist to a MusicBrainz MBID, then queries Setlist.fm using that MBID and an optional city filter.
  - Respect Setlist.fm rate limits and cache or log responses where appropriate (see Logging section).
- Docs: https://api.setlist.fm/docs/1.0/index.html

## MusicBrainz API

This application uses the [MusicBrainz Web API](https://musicbrainz.org/doc/MusicBrainz_API) to search for artist information.

## Spotify API

The app uses two kinds of Spotify access:

- **Searching** uses the Client Credentials flow with `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`. No user sign-in is needed.
- **Creating playlists** needs a user token, from the [Authorization Code with PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow). A temporary server on `127.0.0.1:8888` receives the browser redirect. The tokens are stored in `.spotify-token.json` and refreshed automatically.

Endpoints used:

- `GET /v1/search?type=track`: up to 10 results per request (the Development Mode limit), paged with `offset`
- `POST /v1/me/playlists`: create a playlist in the signed-in user's account
- `POST /v1/playlists/{id}/items`: add tracks in order, up to 100 per request

These follow Spotify's [February 2026 Web API changes](https://developer.spotify.com/documentation/web-api/references/changes/february-2026). Those changes replaced `POST /users/{id}/playlists` and `/playlists/{id}/tracks`, and lowered the search limit.

Optional `.env` settings:

```
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
SPOTIFY_TOKEN_PATH=/path/to/spotify-token.json
```

## License

MIT
