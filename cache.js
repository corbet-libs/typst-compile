const crypto = require('crypto');

function readPositiveInt(name, fallback, env = process.env) {
    const raw = Number(env[name]);
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}

function hashParts(parts) {
    const hash = crypto.createHash('sha256');
    for (const part of parts) {
        const value = String(part ?? '');
        hash.update(String(value.length));
        hash.update(':');
        hash.update(value);
        hash.update('\0');
    }
    return hash.digest('hex');
}

function compileCacheKey(source, outputFormat) {
    const normalizedSource = String(source ?? '');
    return `${outputFormat}:${normalizedSource.length}:${hashParts([normalizedSource])}`;
}

function measureCacheKey(source, items) {
    const normalizedSource = String(source ?? '');
    const ids = Array.isArray(items) ? items.map((item) => String(item?.id ?? '')) : [];
    return `measure:${normalizedSource.length}:${ids.length}:${hashParts([normalizedSource, ...ids])}`;
}

module.exports = {
    compileCacheKey,
    measureCacheKey,
    readPositiveInt,
};
