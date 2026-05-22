/*
@graph
kind: test
nodes:
  - typst-compile-cache-test
summary: "node:test coverage for compileCacheKey/measureCacheKey separation and readPositiveInt fallbacks (including zero meaning disabled)."
links:
  implementation:
    - typst-compile-cache
  suite:
    - typst-compile-cache-suite
@endgraph
*/
const assert = require('node:assert/strict');
const test = require('node:test');
const { compileCacheKey, measureCacheKey, readPositiveInt } = require('./cache');

test('compileCacheKey separates source and output format', () => {
    const source = '#set page(width: auto)\nHello';

    assert.equal(compileCacheKey(source, 'pdf'), compileCacheKey(source, 'pdf'));
    assert.notEqual(compileCacheKey(source, 'pdf'), compileCacheKey(source, 'svg'));
    assert.notEqual(compileCacheKey(source, 'pdf'), compileCacheKey(`${source}!`, 'pdf'));
});

test('measureCacheKey includes caller item IDs and order', () => {
    const source = '#set page(height: auto)\nX\n#pagebreak()\nSame text';

    assert.notEqual(
        measureCacheKey(source, [{ id: 'a', typst: 'Same text' }]),
        measureCacheKey(source, [{ id: 'b', typst: 'Same text' }]),
    );
    assert.notEqual(
        measureCacheKey(source, [{ id: 'a' }, { id: 'b' }]),
        measureCacheKey(source, [{ id: 'b' }, { id: 'a' }]),
    );
});

test('readPositiveInt accepts zero for disabling caches and falls back on invalid values', () => {
    assert.equal(readPositiveInt('CACHE', 12, { CACHE: '0' }), 0);
    assert.equal(readPositiveInt('CACHE', 12, { CACHE: '4.9' }), 4);
    assert.equal(readPositiveInt('CACHE', 12, { CACHE: '-1' }), 12);
    assert.equal(readPositiveInt('CACHE', 12, { CACHE: 'not-a-number' }), 12);
});
