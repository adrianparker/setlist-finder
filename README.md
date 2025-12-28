# Setlist Finder

A command-line application that finds a setlist.

## Features

- Search for artists by name using the MusicBrainz API
- Comprehensive logging of all API calls
- Date-based log files stored in `logs/` directory
- Professional CLI interface with Commander.js
- Test coverage with Mocha

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

## Usage

### Search for an Artist

```bash
npm start search Portishead
```

### Example Output

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

All API calls are logged to both console and local files:

- **Location**: `logs/` directory
- **Format**: `YYYY-MM-DD.log` (one file per day)
- **Content**: Timestamps, log levels, and API request/response details

## Technology Stack

- **Runtime**: Node.js
- **CLI Framework**: Commander.js
- **Testing**: Mocha + Chai + Sinon
- **API**: MusicBrainz Web API

## MusicBrainz API

This application uses the [MusicBrainz Web API](https://musicbrainz.org/doc/MusicBrainz_API) to search for artist information.

## License

MIT