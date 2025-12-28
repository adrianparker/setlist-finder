# Setlist Finder

A command-line application that finds a setlist.

## Features

Search for setlists by first finding the artist, then narrowing with city if known.

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

## Usage

### Search for a Setlist

This is the key usage of the application.

```bash
npm start setlist
```

#### Example Output

```bash
$ npm start setlist

Enter artist name: Anthrax
Found artist: Anthrax
  MBID: b616d6f0-ec1f-4c69-8a79-12a97ece7372

Enter a city (optional): Wellington
Found 1 setlist(s):

1. 22-08-1990
   Venue: Wellington Town Hall, Wellington, New Zealand
   Setlist ID: 4bd11b46
```

### Search for an Artist MBID

Finds the MusicBrainz ID for the artist that best natches your artist search term. 

```bash
npm start search <artist>
```

#### Example Output

```bash
$ npm start search Portishead

✓ Found artist: Portishead
  MBID: 8f6bd1e4-4e85-44e6-b2f4-48302a0b86a9
```

### Help

```bash
npm start -- --help
```

## Development

### Run Tests

```bash
npm test
```

### Watch Tests (auto-rerun on file changes)

```bash
npm run test:watch
```

## Logging

API calls are logged to local files:

- **City**: `logs/` directory
- **Format**: `YYYY-MM-DD.log` (one file per day)
- **Content**: Timestamps, log levels, and API request/response details

## Technology Stack

- **Runtime**: Node.js
- **CLI Framework**: Commander.js
- **Testing**: Mocha + Chai + Sinon
- **API**: MusicBrainz Web API and Setlist.fm Web API

## Setlist.fm API

This application uses the Setlist.fm Web API to find setlists for artists (by MusicBrainz artist MBID) and to retrieve setlist details.

- Authentication: provide your API key in .env as SETLISTFM_API_KEY. Requests must include the x-api-key header and an Accept header for JSON:
```text
x-api-key: your_setlistfm_api_key_here
Accept: application/json
```
- Common endpoints used:
  - GET /rest/1.0/search/setlists — search setlists (accepts artistMbid and city query params)
  - GET /rest/1.0/setlist/{setlistId} — get a single setlist's details
- Notes:
  - The app first resolves an artist to a MusicBrainz MBID, then queries Setlist.fm using that MBID and an optional city filter.
  - Respect Setlist.fm rate limits and cache or log responses where appropriate (see Logging section).
- Docs: https://api.setlist.fm/docs/1.0/index.html

## MusicBrainz API

This application uses the [MusicBrainz Web API](https://musicbrainz.org/doc/MusicBrainz_API) to search for artist information.

## License

MIT