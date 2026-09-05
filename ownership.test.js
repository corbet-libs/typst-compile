/*
@graph
kind: test
nodes:
  - typst-compile-ownership-test
summary: "Ownership guard: the page-break/SVG-height measurement endpoint stays deleted. Fails if a measure handler, builder, cache, key, or SVG-height parser is reintroduced."
links:
  implementation:
    - typst-compile-server
  suite:
    - typst-compile-cache-suite
@endgraph
*/
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// Split literals so this guard never flags its own forbidden list.
const FORBIDDEN = [
    'handle' + 'Measure',
    'buildMeasure' + 'Source',
    'getMeasure' + 'Cache',
    'setMeasure' + 'Cache',
    'measure' + 'CacheKey',
    'MEASURE' + '_CACHE',
    '/measure',
    'height="(',
    '@myriad' + 'dreamin',
];

test('measurement endpoint stays deleted', () => {
    const violations = [];
    for (const file of ['server.js', 'cache.js']) {
        const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
        for (const forbidden of FORBIDDEN) {
            if (content.includes(forbidden)) {
                violations.push(`${file} contains ${forbidden}`);
            }
        }
    }
    assert.deepEqual(violations, []);
});
