# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube Bulk URL Scraper is a Chrome extension (Manifest v3) with two modes:
1. **Scraper mode** (search pages): Extract video URLs via auto-scrolling
2. **Transcript mode** (video pages): Extract video transcripts/subtitles

The UI is French-localized.

## Development

**No build process** - Load directly as an unpacked extension in Chrome:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory

**Testing changes:** Reload the extension in `chrome://extensions/` after modifying files. For content.js changes, also refresh the YouTube page.

## Architecture

```
popup.html/js  ←→  content.js (via chrome.runtime messaging)
     ↓                    ↓
   UI layer          DOM/data extraction on YouTube
```

**popup.js** detects page type on load and shows appropriate UI section.

### Scraper Mode (search pages)
- Action: `{action: "SCRAPE_URLS", limit: 50}`
- content.js auto-scrolls, extracts from `ytd-video-renderer` elements
- Returns `{status: "DONE", data: [{url, title, dateText, timestamp}]}`

### Transcript Mode (video pages)
- Action: `{action: "GET_TRANSCRIPT"}`
- content.js parses `ytInitialPlayerResponse` for caption track URL
- Fetches captions in JSON format, parses segments
- Returns `{success, title, language, languageName, transcript: [{timestamp, text}]}`

## Key Implementation Details

- **Date parsing**: French (`il y a`, `jours`) and English (`ago`, `days`)
- **Transcript extraction**: Prefers French subtitles, falls back to first available
- **Caption format**: Uses `fmt=json3` for structured JSON response
- **URL cleaning**: Strips query params after first `&`
- **Manifest v3** with minimal permissions: `activeTab`, `scripting`
