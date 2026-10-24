# Setlist Finder

A command-line application that gives you one Spotify playlist for each gig you're going to.

Once you have tickets, run `gig` with the performer and the date. Before the show, it predicts the setlist from the performer's most recent shows on setlist.fm. Re-run it as the tour goes on and newer setlists are posted, and the same playlist is updated. After the show, it switches the playlist to the setlist actually played. Re-run it over the next few days as setlist.fm corrections arrive.

## Features

- One playlist per show. It is renamed from "predicted setlist" to "actual setlist" in place, keeping the same Spotify playlist.
- Predictions use every song from the performer's last 5 shows, in the order they were usually played, with encores last.
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

Sign-in tokens are stored in `.spotify-token.json` in the project folder. The file is readable only by you and ignored by git. Access is refreshed automatically, so you normally sign in only once. 

To remove the stored tokens:

```bash
npm start logout
```

If you are not signed in when a playlist is about to be created or updated, the sign-in starts automatically. The app asks for permission to create and change your playlists and to read your private playlists (`playlist-modify-public`, `playlist-modify-private`, `playlist-read-private`). The read permission lets `gig` find a private show playlist again.

### Make or update the playlist for a gig

```bash
npm start gig -- --performer Mudhoney --date 20261029
```

| Option | Description |
|---|---|
| `-p, --performer <name>` | Band or artist name (required) |
| `-d, --date <YYYYMMDD>` | Date of the show (required) |
| `-c, --city <name>` | City of the show. Used after the date has passed, to pick the right setlist if the performer played more than once that day |
| `-s, --shows <count>` | Number of recent setlists to predict from (default 5) |
| `--private` | Make the playlist private. Without it, a new playlist is public and an existing one keeps its visibility |
| `--dry-run` | Match the songs and print the table without signing in or changing any playlist |

What happens depends on the date:

- **Today or a future date:** the setlist is predicted from the performer's last 5 setlists on setlist.fm that are dated before the show and have songs listed. Every song from those shows is included, ordered by where it was usually played, with encore songs last. The playlist is titled `20261029 Mudhoney - predicted setlist`, with the description `The most likely setlist for Mudhoney for their upcoming show.`
- **A past date:** the setlist actually played, from setlist.fm, in the order played. The playlist is titled `20261029 Mudhoney - actual setlist`, with a description naming the venue, e.g. `The setlist Mudhoney played at The Factory Theatre, Sydney on 22 Oct 2026.` If no setlist has been posted yet, the existing playlist is left as it is (or a prediction is created if there is none) and you are told to try again later.

Each show has one playlist. It is found in your Spotify playlists by a title starting with `YYYYMMDD Performer -`, so it is found whether it is still predicted or already actual. It is created if missing. Otherwise it is updated in place, and it keeps the same Spotify playlist:

- The title and description change only when they differ, e.g. when the show has happened.
- The tracks are replaced only when the matched tracks or their order changed. Tracks you added or reordered by hand are overwritten.
- If nothing changed, nothing is written and you see `is already up to date`.

If any Spotify search fails, the playlist is not changed. If Spotify's rate limit is hit, the command stops and tells you when to try again.

#### Example Output

```bash
$ npm start gig -- --performer Mudhoney --date 20261029

[info]: Chosen artist: Mudhoney
[info]: Predicting from 5 show(s): 22-10-2026 The Factory Theatre, Sydney (21 songs); 21-10-2026 Felons Barrel Room, Sydney (21 songs); 20-10-2026 Volta, Ballarat (21 songs); 18-10-2026 Theatre Royal, Castlemaine (21 songs); 16-10-2026 The Thornbury Theatre, Melbourne (14 songs)
[info]: Matching 30 song(s) with Spotify...

#    Song                                Type      Spotify track                       Album                                 Year  Played
---  ----------------------------------  --------  ----------------------------------  ------------------------------------  ----  ----------------------
 1   If I Think                          LIVE      If I Think - Live in Berlin 10/...  Superfuzz Bigmuff (Deluxe Edition)    1988  4 of 5
 2   Get Into Yours                      LIVE      Get Into Yours - Live in Europe     LiE (Live in Europe)                  2018  every show
 3   Move Under                          STUDIO    Move Under                          Plastic Eternity                      2023  1 of 5
...
30   In 'n' Out of Grace                 LIVE      In 'N' Out Of Grace                 Live At El Sol                        2009  encore - every show

30 songs: 12 live, 18 studio, 0 not matched

[info]: Found existing playlist "20261029 Mudhoney - predicted setlist" (ID: 5OVdjRKG61mDlt7EJPpzHA)
[info]: Playlist "20261029 Mudhoney - predicted setlist" is already up to date
[info]: URL: https://open.spotify.com/playlist/5OVdjRKG61mDlt7EJPpzHA
```

Spotify search results are kept in `.spotify-search-cache.json` in the project folder for 7 days. Re-running `gig` therefore searches Spotify only for songs it hasn't seen recently, which keeps it within Spotify's rate limits. The file is ignored by git. Delete it to force fresh searches.

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

## How setlists are predicted

1. Take the performer's most recent setlists on setlist.fm dated before the show, skipping any with no songs listed yet (5 by default; change with `--shows`).
2. Include every song played at those shows. Intro tapes are left out, and names that differ only in punctuation count as one song.
3. Give each song its average position in the set, measured from 0 (first) to 1 (last), so a short or incomplete setlist doesn't distort the order. Songs mostly played in the encore go at the end.
4. Break ties by how often the song was played, then by how recently.

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
- Endpoint used: `GET /rest/1.0/search/setlists`
  - With `artistMbid` and `p` (page): the artist's setlists, newest first, 20 per page, to find the shows to predict from
  - With `artistMbid`, `date` (dd-MM-yyyy) and optionally `cityName`: the setlist for a show that has happened
- Notes:
  - The app first resolves an artist to a MusicBrainz MBID, then queries Setlist.fm using that MBID.
  - Requests are spaced 2.5 seconds apart to stay within setlist.fm's rate limit.
  - Respect Setlist.fm rate limits and cache or log responses where appropriate (see Logging section).
- Docs: https://api.setlist.fm/docs/1.0/index.html

## MusicBrainz API

This application uses the [MusicBrainz Web API](https://musicbrainz.org/doc/MusicBrainz_API) to search for artist information. MusicBrainz allows about one request per second and answers 503 when that is exceeded; the app retries after 1, 2 and 4 seconds.

## Spotify API

The app uses two kinds of Spotify access:

- **Searching** uses the Client Credentials flow with `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`. No user sign-in is needed.
- **Creating and updating playlists** needs a user token, from the [Authorization Code with PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow). A temporary server on `127.0.0.1:8888` receives the browser redirect. The tokens are stored in `.spotify-token.json` and refreshed automatically.

Endpoints used:

- `GET /v1/search?type=track`: up to 10 results per request (the Development Mode limit), paged with `offset`
- `POST /v1/me/playlists`: create a playlist in the signed-in user's account
- `POST /v1/playlists/{id}/items`: add tracks in order, up to 100 per request
- `PUT /v1/playlists/{id}/items`: replace a playlist's tracks, keeping its ID
- `PUT /v1/playlists/{id}`: rename a playlist and change its description
- `GET /v1/playlists/{id}/items`: read a playlist's tracks, to see whether they changed
- `GET /v1/me/playlists` and `GET /v1/me`: find the show's playlist among the playlists you own

Rate limits: Spotify answers HTTP 429 with a `Retry-After` wait. Waits of up to 10 seconds are retried automatically. Development Mode apps can be told to wait many hours after too many requests; the command then stops at once and tells you when to try again. The search cache keeps re-runs well below the limit.

These follow Spotify's [February 2026 Web API changes](https://developer.spotify.com/documentation/web-api/references/changes/february-2026). Those changes replaced `POST /users/{id}/playlists` and `/playlists/{id}/tracks`, and lowered the search limit.

Optional `.env` settings:

```
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
SPOTIFY_TOKEN_PATH=/path/to/spotify-token.json
SPOTIFY_SEARCH_CACHE_PATH=/path/to/spotify-search-cache.json
```

## License

MIT
