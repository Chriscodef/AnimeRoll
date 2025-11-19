const { addonBuilder } = require('stremio-addon-sdk');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const manifest = require('./manifest.json');

const TMDB_API_KEY = '40053dd5e221eea2948a2143f297b48f';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const builder = new addonBuilder({
  id: manifest.id,
  version: manifest.version,
  name: manifest.name,
  resources: manifest.resources,
  types: manifest.types,
  catalogs: manifest.catalogs
});

// Simple in-memory cache to map item id -> original URL (helps meta/stream handlers)
const urlCache = new Map();

// Helpers to fetch and parse HTML with proper headers and retry
async function fetchHTML(url, retries = 3) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://www.google.com/',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers, timeout: 15000 });
      if (!res.ok) {
        console.error(`fetchHTML: HTTP ${res.status} for ${url}`);
        if (attempt === retries) return null;
        continue;
      }
      const text = await res.text();
      // Check for Cloudflare or challenge pages
      if (text.includes('Cloudflare') || text.includes('Just a moment') || text.includes('Checking your browser')) {
        console.error(`fetchHTML: Cloudflare challenge detected for ${url}`);
        if (attempt === retries) return null;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
        continue;
      }
      return cheerio.load(text);
    } catch (err) {
      console.error(`fetchHTML attempt ${attempt} error for ${url}:`, err.message);
      if (attempt === retries) return null;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
    }
  }
  return null;
}

// Normalize an item into a Stremio meta preview
function makeMetaPreview({ id, type = 'series', name, slug, poster, description, url }) {
  return {
    id: id || `${type}:${slug}`,
    type,
    name,
    poster: poster || '',
    overview: description || '',
    extra: { url }
  };
}

// Extract probable video URLs from arbitrary HTML text, prioritizing iframes
function extractVideoURLsFromHTML(html) {
  const urls = new Set();
  try {
    // Prioritize iframe src attributes (common for embedded players)
    const iframeRe = /<iframe[^>]*src=["']([^"']+)["']/gi;
    let m;
    while ((m = iframeRe.exec(html)) !== null) {
      urls.add(m[1]);
    }

    // regex for common video file types and HLS
    const re = /https?:\/\/[^\s'\"<>]+?(?:\.m3u8|\.mp4|\.webm|\.mkv)(?:\?[^'\"\s<>]*)?/ig;
    while ((m = re.exec(html)) !== null) {
      urls.add(m[0]);
    }
    // also look for sources in src attributes without extension (some hosts proxy streams)
    const srcRe = /src=["']([^"']+)["']/ig;
    while ((m = srcRe.exec(html)) !== null) {
      const s = m[1];
      if (/m3u8|mp4|webm|mkv/i.test(s) || /player|cdn|stream/i.test(s)) urls.add(s);
    }
  } catch (e) {
    // ignore
  }
  // Filter out non-video URLs like JS files
  const filtered = Array.from(urls).filter(url => {
    return !/\.js(\?|$)/i.test(url) && !/cloudflare-static/i.test(url) && !/rocket-loader/i.test(url);
  });
  return filtered;
}

// Scraper for animesdrive.blog - tries to get recent posts from homepage or search results
async function scrapeAnimesDrive(limit = 30, search = null) {
  const base = search ? `https://animesdrive.blog/?s=${encodeURIComponent(search)}` : 'https://animesdrive.blog/';
  const $ = await fetchHTML(base);
  if (!$) return [];
  const items = [];
  // try several common post selectors (WordPress-like themes)
  const postSelectors = ['article', '.post', '.entry', '.post-item', '.blog-post'];
  let foundEls = $();
  postSelectors.forEach(sel => { foundEls = foundEls.add($(sel)); });

  // find article links
  foundEls.each((i, el) => {
    if (items.length >= limit) return;
    const a = $(el).find('h2 a, .entry-title a, a').first();
    const href = a && a.attr ? a.attr('href') : null;
    const title = $(el).find('h2, h1, .entry-title').first().text().trim() || (a && a.attr('title')) || (a && a.text && a.text().trim()) || '';
    if (!href || !title) return;
    if (search && !title.toLowerCase().includes(search.toLowerCase())) return;
    const imgEl = $(el).find('img').first();
    const img = imgEl && imgEl.attr ? (imgEl.attr('src') || imgEl.attr('data-src') || '') : '';
    const slug = href.replace(/https?:\/\//, '').replace(/[\W]+/g, '-');
    const id = `animesdrive:${slug}`;
    items.push(makeMetaPreview({ id, name: title, slug, poster: img, url: href }));
    // cache URL for meta/stream lookup
    urlCache.set(id, href);
  });
  // fallback: links in .entry-content
  if (items.length === 0) {
    $('a').each((i, el) => {
      if (items.length >= limit) return;
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !text) return;
      if (!href.includes('/')) return;
      if (search && !text.toLowerCase().includes(search.toLowerCase())) return;
      const slug = href.replace(/https?:\/\//, '').replace(/[\W]+/g, '-');
      const id = `animesdrive:${slug}`;
      items.push(makeMetaPreview({ id, name: text, slug, poster: '', url: href }));
      urlCache.set(id, href);
    });
  }
  if (items.length === 0 && !search) {
    // fallback sample item so catalog is not completely empty (helps debugging)
    const sampleId = 'animesdrive:sample-item';
    items.push(makeMetaPreview({ id: sampleId, name: 'Sample Anime (AnimesDrive)', slug: 'sample-item', poster: '', url: base }));
    urlCache.set(sampleId, base);
  }
  console.log(`scrapeAnimesDrive: returning ${items.length} items`);
  return items.slice(0, limit);
}

// Scraper for anroll.net - recent posts
async function scrapeAnroll(limit = 30, search = null) {
  const base = search ? `https://www.anroll.net/?s=${encodeURIComponent(search)}` : 'https://www.anroll.net/';
  const $ = await fetchHTML(base);
  if (!$) return [];
  const items = [];
  // posts often in article or .post
  const postSelectors = ['article', '.post', '.post-item', '.entry', '.blog-post'];
  let foundEls = $();
  postSelectors.forEach(sel => { foundEls = foundEls.add($(sel)); });
  foundEls.each((i, el) => {
    if (items.length >= limit) return;
    const a = $(el).find('h2 a, .entry-title a, a').first();
    const href = a && a.attr ? a.attr('href') : null;
    const title = $(el).find('h2, h1, .entry-title').first().text().trim() || (a && a.attr('title')) || (a && a.text && a.text().trim()) || '';
    if (!href || !title) return;
    if (search && !title.toLowerCase().includes(search.toLowerCase())) return;
    const imgEl = $(el).find('img').first();
    const img = imgEl && imgEl.attr ? (imgEl.attr('src') || imgEl.attr('data-src') || '') : '';
    const slug = href.replace(/https?:\/\//, '').replace(/[\W]+/g, '-');
    const id = `anroll:${slug}`;
    items.push(makeMetaPreview({ id, name: title, slug, poster: img, url: href }));
    urlCache.set(id, href);
  });
  // fallback: links
  if (items.length === 0) {
    $('a').each((i, el) => {
      if (items.length >= limit) return;
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !text) return;
      if (search && !text.toLowerCase().includes(search.toLowerCase())) return;
      const slug = href.replace(/https?:\/\//, '').replace(/[\W]+/g, '-');
      const id = `anroll:${slug}`;
      items.push(makeMetaPreview({ id, name: text, slug, poster: '', url: href }));
      urlCache.set(id, href);
    });
  }
  if (items.length === 0) {
    const sampleId = 'anroll:sample-item';
    items.push(makeMetaPreview({ id: sampleId, name: 'Sample Anime (Anroll)', slug: 'sample-item', poster: '', url: base }));
    urlCache.set(sampleId, base);
  }
  console.log(`scrapeAnroll: returning ${items.length} items`);
  return items.slice(0, limit);
}

// Fetch TMDB popular anime TV shows
async function fetchTMDBPopularAnime(limit = 50) {
  try {
    const url = `${TMDB_BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&with_genres=16&sort_by=popularity.desc&page=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.results) return [];
    const items = data.results.slice(0, limit).map(show => {
      const id = `tmdb:${show.id}`;
      const poster = show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : '';
      return makeMetaPreview({
        id,
        name: show.name,
        slug: show.id.toString(),
        poster,
        description: show.overview,
        url: `https://www.themoviedb.org/tv/${show.id}`
      });
    });
    console.log(`fetchTMDBPopularAnime: returning ${items.length} items`);
    return items;
  } catch (err) {
    console.error('fetchTMDBPopularAnime error', err.message);
    return [];
  }
}

// Fetch TMDB meta for a TV show
async function fetchTMDBMeta(id) {
  try {
    const tmdbId = id.split(':')[1];
    const url = `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    const show = await res.json();
    if (!show.id) return null;
    const poster = show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : '';
    const background = show.backdrop_path ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` : poster;
    return {
      id,
      type: 'series',
      name: show.name,
      description: show.overview,
      poster,
      background,
      genres: show.genres ? show.genres.map(g => g.name) : [],
      releaseInfo: show.first_air_date ? show.first_air_date.substring(0, 4) : '',
      imdbRating: show.vote_average ? show.vote_average.toString() : '',
      runtime: show.episode_run_time && show.episode_run_time.length > 0 ? show.episode_run_time[0].toString() : '',
      extra: { tmdbId: show.id }
    };
  } catch (err) {
    console.error('fetchTMDBMeta error', err.message);
    return null;
  }
}

// Catalog handler
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  try {
    const search = extra && extra.search;
    if (id === 'animesdrive:catalog:latest' || id === 'animesdrive:latest') {
      const metas = await scrapeAnimesDrive(50, search);
      console.log(`Catalog ${id} returned ${metas.length} metas`);
      return Promise.resolve({ metas });
    }
    if (id === 'anroll:catalog:latest' || id === 'anroll:latest') {
      const metas = await scrapeAnroll(50, search);
      console.log(`Catalog ${id} returned ${metas.length} metas`);
      return Promise.resolve({ metas });
    }
    if (id === 'tmdb:catalog:popular') {
      const metas = await fetchTMDBPopularAnime(50);
      console.log(`Catalog ${id} returned ${metas.length} metas`);
      return Promise.resolve({ metas });
    }
    return Promise.resolve({ metas: [] });
  } catch (err) {
    console.error('Catalog handler error', err.message);
    return Promise.resolve({ metas: [] });
  }
});

// Meta handler: fetch additional details from the article page or TMDB
builder.defineMetaHandler(async ({ type, id }) => {
  try {
    // id format: site:slug
    const [site, ...rest] = id.split(':');
    const slug = rest.join(':');
    if (site === 'tmdb') {
      const meta = await fetchTMDBMeta(id);
      return Promise.resolve({ meta });
    }
    let url;
    if (site === 'animesdrive') {
      // try cached URL first
      url = urlCache.get(id);
      if (!url) {
        // Reconstruct URL from ID if cache miss
        const reconstructedUrl = `https://animesdrive.blog/${slug}`;
        console.log(`Meta handler: reconstructing URL for ${id} -> ${reconstructedUrl}`);
        url = reconstructedUrl;
      }
    } else if (site === 'anroll') {
      url = urlCache.get(id);
      if (!url) {
        // Reconstruct URL from ID if cache miss
        const reconstructedUrl = `https://www.anroll.net/${slug}`;
        console.log(`Meta handler: reconstructing URL for ${id} -> ${reconstructedUrl}`);
        url = reconstructedUrl;
      }
    }
    if (!url) {
      console.warn(`Meta handler: no URL found for id=${id}`);
      return Promise.resolve({ meta: null });
    }
    const $ = await fetchHTML(url);
    if (!$) return Promise.resolve({ meta: null });
    const html = $.html();
    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || $('.entry-content p').first().text().trim() || $('p').first().text().trim();
    const poster = $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || '';
    const background = poster;

    // try to collect episode links (common patterns)
    const episodeLinks = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href) return;
      // heuristic: link text contains 'epis' or 'ep' or 'cap' or 'episode'
      if (/epis|ep\b|cap|episode|capitulo/i.test(text) || /episodio|episode|capitulo/i.test(href)) {
        episodeLinks.push({ title: text || href, url: href });
      }
    });

    const possibleVideos = extractVideoURLsFromHTML(html);

    const meta = {
      id,
      type: type || 'series',
      name: title || slug,
      description: description || '',
      poster,
      background,
      extra: { url, episodeLinks, possibleVideos }
    };
    return Promise.resolve({ meta });
  } catch (err) {
    console.error('Meta handler error', err.message);
    return Promise.resolve({ meta: null });
  }
});

// Helper function to get streams from a URL
async function getStreamsFromUrl(url) {
  if (!url) return [];
  const $ = await fetchHTML(url);
  if (!$) return [{ externalUrl: url }];

  const html = $.html();
  const sources = [];

  // video tags and source elements
  $('video').each((i, v) => {
    const src = $(v).attr('src');
    if (src) sources.push({ url: src });
    $(v).find('source').each((j, s) => {
      const ss = $(s).attr('src');
      if (ss) sources.push({ url: ss });
    });
  });

  // iframe embeds
  $('iframe').each((i, el) => {
    const src = $(el).attr('src');
    if (src) sources.push({ url: src, iframe: true });
  });

  // find urls via regex
  const extracted = extractVideoURLsFromHTML(html);
  extracted.forEach(u => sources.push({ url: u }));

  // dedupe
  const seen = new Set();
  const uniq = [];
  sources.forEach(s => {
    if (!s.url) return;
    if (seen.has(s.url)) return;
    seen.add(s.url);
    uniq.push(s);
  });

  if (uniq.length > 0) {
    const streams = uniq.map(s => {
      // if iframe, return externalUrl; otherwise return url
      if (s.iframe) return { title: 'Embedded player', externalUrl: s.url };
      // try to coerce relative URLs to absolute
      if (s.url && s.url.startsWith('//')) s.url = 'https:' + s.url;
      else if (s.url && s.url.startsWith('/')) {
        try {
          s.url = new URL(s.url, url).href;
        } catch (e) {
          console.error('URL construction error', s.url, url);
        }
      }
      return { url: s.url };
    });
    return streams;
  }

  return [{ externalUrl: url }];
}

// Stream handler: try to find direct video src or provide externalUrl to the page, or search scrapers for TMDB titles
builder.defineStreamHandler(async ({ type, id }) => {
  try {
    const [site, ...rest] = id.split(':');
    const slug = rest.join(':');
    if (site === 'tmdb') {
      // For TMDB items, fetch the title from TMDB and search in scrapers
      const meta = await fetchTMDBMeta(id);
      if (!meta) return Promise.resolve({ streams: [] });
      const title = meta.name;
      // Search in animesdrive and anroll for the title
      const animesdriveItems = await scrapeAnimesDrive(100, title);
      const anrollItems = await scrapeAnroll(100, title);
      const allItems = [...animesdriveItems, ...anrollItems];
      // For each matching item, get its streams
      const streams = [];
      for (const item of allItems) {
        const itemStreams = await getStreamsFromUrl(item.extra.url);
        streams.push(...itemStreams);
      }
      // If no streams found, return externalUrl to TMDB page
      if (streams.length === 0) {
        return Promise.resolve({ streams: [{ externalUrl: `https://www.themoviedb.org/tv/${slug}` }] });
      }
      return Promise.resolve({ streams });
    }
    let items = [];
    if (site === 'animesdrive') items = await scrapeAnimesDrive(200);
    if (site === 'anroll') items = await scrapeAnroll(200);
    const found = items.find(it => it.id === id);
    const url = found && found.extra && found.extra.url;
    const streams = await getStreamsFromUrl(url);
    return Promise.resolve({ streams });
  } catch (err) {
    console.error('Stream handler error', err.message);
    return Promise.resolve({ streams: [] });
  }
});

module.exports = builder.getInterface();
