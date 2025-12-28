# Project Context for LLM

## 🧠 Overview

This project is building a **command-line application** using **Node.js** that:

- Runs on **macOS**, but should retain **OS independence**.
- Accepts an **artist name** input from the user.
- Uses the **MusicBrainz API** to return the **MusicBrainz artist ID (mbid)** for the given name.
- Uses the **Setlist.fm API** to retrieve setlists for the artist.
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
  - `setlist` - Interactive mode: search for artist, then fetch and display setlists

