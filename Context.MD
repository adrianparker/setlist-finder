# Project Context for LLM

## 🧠 Overview

This project is building a **command-line application** using **Node.js** that:

- Runs on **macOS**, but should retain **OS independence**.
- Accepts an **artist name** input from the user.
- Uses the **MusicBrainz API** to return the **MusicBrainz artist ID (mbid)** for the given name.
- All API calls use **JSON** responses.

## 📡 MusicBrainz API

The application will interact with the **MusicBrainz Web API**:

- The API is a **RESTful web service** to access the **MusicBrainz music metadata database**.  
- Responses can be returned as **JSON** by specifying the appropriate format (`fmt=json` or `Accept: application/json`).
- To find an artist's MBID when only the name is provided, the app should **search the artist resource** with a query using the artist name.

## 🧪 JSON Format

When calling the MusicBrainz API:

- By default, the API returns XML.
- To receive JSON, the request must either include:
  - `fmt=json` as a query parameter, **or**
  - `Accept: application/json` in the request headers.

## 🔍 Handling Artist Input

- Your application should **prompt the user for an artist name**.
- If the input is **insufficient or ambiguous**, ask a **clarifying question** to refine the search (e.g., ask for more details or alternate spellings).
- After searching the MusicBrainz API for the artist, parse the results to:
  - Identify the best matching artist,
  - And extract the **MusicBrainz artist ID (mbid)**.

## 📘 MusicBrainz API Documentation

Developers should reference the official API docs at:

https://musicbrainz.org/doc/MusicBrainz_API

This contains details on search endpoints, parameters, rate limits, and how JSON versus XML responses work.

---

## 🛠️ Technical Stack & Requirements

### Language & Testing
- **Language**: JavaScript (Node.js)
- **Testing Framework**: Mocha
- **Code Style**: Professional, production-grade code with clear separation of concerns

### Logging
- **API Call Logging**: All API calls must be logged
- **Log Output**: 
  - Console output for real-time feedback
  - Local file storage with date-based file names
  - Separate log file for each calendar date
  - Log files stored in a dedicated `logs/` folder organized by date (e.g., `logs/2025-12-28.log`)

### Output
- **MBID Result**: Output the MusicBrainz artist ID to console in a user-friendly format

### Recommended CLI Approach
- Use **Commander.js** for professional CLI argument parsing and help documentation
- Structure: Modular design with separate concerns (API client, logger, CLI handler, business logic)

