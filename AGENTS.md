# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube Bulk URL Scraper is a Chrome extension (Manifest v3) that extracts video URLs from YouTube search results pages via auto-scrolling. The UI is French-localized.

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
   UI layer          DOM extraction on YouTube
```

**Message flow:**
1. User clicks "Lancer l'extraction" in popup
2. popup.js sends `{action: "SCRAPE_URLS", limit: 50}` to content.js
3. content.js auto-scrolls, extracts from `ytd-video-renderer` elements
4. Returns `{success, videos: [{url, title, dateText, timestamp}]}`

**content.js** runs only on `*://*.youtube.com/results*` (search pages). It:
- Queries `ytd-video-renderer` elements for video data
- Auto-scrolls with 1.5s intervals until limit reached or no new content (3 consecutive attempts)
- Parses French/English relative dates ("il y a 2 jours") to timestamps for sorting
- Deduplicates by URL, returns newest-first

**popup.js** handles UI state, validates the page is a YouTube search, and manages clipboard copy.

## Key Implementation Details

- Date parsing supports French (`il y a`, `jours`, `semaines`) and English (`ago`, `days`, `weeks`)
- URLs are cleaned by stripping query params after first `&`
- "No change" detection: stops scrolling after 3 scroll cycles with no new videos
- Manifest v3 with minimal permissions: `activeTab`, `scripting`
