/*
@graph
kind: implementation
nodes:
  - typst-compile-cache
summary: "Deterministic compile cache-key helper (sha256 over length-prefixed parts)."
symbols:
  - compileCacheKey
  - readPositiveInt
links:
  idea:
    - typst-compile-service
  implementation:
    - typst-compile-server
  test:
    - typst-compile-cache-test
@endgraph
*/
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

module.exports = {
    compileCacheKey,
    readPositiveInt,
};
