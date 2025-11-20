const { addonBuilder } = require('stremio-addon-sdk');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const manifest = require('./manifest.json');

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

// Helpers to fetch and parse HTML with anti-block headers
async function fetchHTML(url, retries = 3) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
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

// Catalog handler
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  try {
    const search = extra && extra.search;
    if (id === 'animesdrive:catalog:latest' || id === 'animesdrive:latest') {
      const metas = await scrapeAnimesDrive(50, search);
      console.log(`Catalog ${id} returned ${metas.length} metas`);
      return Promise.resolve({ metas });
    }
    return Promise.resolve({ metas: [] });
  } catch (err) {
    console.error('Catalog handler error', err.message);
    return Promise.resolve({ metas: [] });
  }
});

// Meta handler: fetch additional details from the article page and populate videos array
builder.defineMetaHandler(async ({ type, id }) => {
  try {
    // id format: animesdrive:slug
    const [site, ...rest] = id.split(':');
    const slug = rest.join(':');

    if (site !== 'animesdrive') {
      console.warn(`Meta handler: Unsupported site ${site}`);
      return Promise.resolve({ meta: null });
    }

    let url = urlCache.get(id);
    if (!url) {
      // Reconstruct URL from ID if cache miss
      const reconstructedUrl = `https://animesdrive.blog/${slug}`;
      console.log(`Meta handler: reconstructing URL for ${id} -> ${reconstructedUrl}`);
      url = reconstructedUrl;
    }

    if (!url) {
      console.warn(`Meta handler: no URL found for id=${id}`);
      return Promise.resolve({ meta: null });
    }

    const $ = await fetchHTML(url);
    if (!$) return Promise.resolve({ meta: null });

    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || $('.entry-content p').first().text().trim() || $('p').first().text().trim();
    const poster = $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || '';
    const background = poster;

    // Extract episode links and build videos array (CRITICAL for Stremio UI)
    const videos = [];
    $('.entry-content a, article a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !text) return;

      // Regex for episode patterns: Episódio, Ep, numbers, etc.
      const epMatch = text.match(/(?:epis[oó]dio|ep|cap[ií]tulo)\s*(\d+|[IVXLCDM]+)|\b(\d{1,3})\b/i);
      if (epMatch) {
        const epNum = epMatch[1] || epMatch[2];
        // Extract the slug from the href (everything after the domain)
        const epSlug = href.replace(/https?:\/\/[^\/]+/, '').replace(/^\//, '').replace(/\/$/, '');
        const videoId = `animesdrive:${slug}:${epSlug}`;
        videos.push({
          id: videoId,
          title: text,
          episode: parseInt(epNum) || 1
        });
      }
    });

    console.log(`Meta: Encontrados ${videos.length} episódios para ${id}`);

    const meta = {
      id,
      type: type || 'series',
      name: title || slug,
      description: description || '',
      poster,
      background,
      videos: videos // CRITICAL: This makes episode buttons appear in Stremio
    };
    return Promise.resolve({ meta });
  } catch (err) {
    console.error('Meta handler error', err.message);
    return Promise.resolve({ meta: null });
  }
});

// Stream handler: navigate to episode page and extract iframe player
builder.defineStreamHandler(async ({ type, id }) => {
  try {
    const [site, animeSlug, epSlug] = id.split(':');
    if (!epSlug) {
      console.error(`Stream: ID inválido, faltando epSlug: ${id}`);
      return Promise.resolve({ streams: [] });
    }

    if (site !== 'animesdrive') {
      console.error(`Stream: Site não suportado: ${site}`);
      return Promise.resolve({ streams: [] });
    }

    // Build episode URL (DEEP LINKING: go to episode page, not anime page)
    const epUrl = `https://animesdrive.blog/${epSlug}`;
    console.log(`Stream: Acessando URL do episódio ${epUrl}`);

    const $ = await fetchHTML(epUrl);
    if (!$) return Promise.resolve({ streams: [] });

    // Prioritize iframe src (most common for embedded players)
    const iframeSrc = $('iframe').first().attr('src');
    if (iframeSrc) {
      console.log(`Stream: Encontrado iframe: ${iframeSrc}`);
      return Promise.resolve({ streams: [{ title: 'Assistir (Player)', externalUrl: iframeSrc }] });
    }

    // Last resort: external URL to the episode page
    console.log(`Stream: Nenhum iframe encontrado, retornando página do episódio`);
    return Promise.resolve({ streams: [{ title: 'Assistir', externalUrl: epUrl }] });
  } catch (err) {
    console.error('Stream handler error', err.message);
    return Promise.resolve({ streams: [] });
  }
});

module.exports = builder.getInterface();
