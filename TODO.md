# TODO: Implement TMDB as Reference Catalog for AnimeRoll

## Tasks
- [x] Update manifest.json to add TMDB catalog for series
- [x] In addon.js:
  - [x] Add TMDB API key constant
  - [x] Add function to fetch TMDB popular anime TV shows catalog
  - [x] Add function to fetch TMDB meta details for a TV show
  - [x] Modify catalog handler to include TMDB catalog
  - [x] Modify meta handler to fetch details from TMDB for TMDB IDs
  - [x] Modify stream handler to search animesdrive/anroll scrapers for TMDB item titles and return their streams
- [x] Test the addon functionality

## Progress
- Implementation completed
- Updated scrapers to support search functionality
- Improved video URL extraction to filter out non-video URLs
- Stream handler now searches scrapers for TMDB titles and aggregates streams
