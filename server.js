const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./addon');

const PORT = process.env.PORT || 7000;
serveHTTP(addonInterface, { port: PORT });
console.log(`AnimeRoll add-on running at http://localhost:${PORT}/manifest.json`);
