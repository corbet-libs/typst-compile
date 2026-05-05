# Typst Compile Service

Koyeb-hosted HTTP renderer for headless CareerVector flows. Browser users use
client-side Typst WASM; MCP/agent paths call this service when they need a PDF
or server-side measurement.

## Endpoints

- `POST /compile` with `{ "source": "...", "format": "pdf" }` returns PDF bytes.
- `POST /compile` with `{ "source": "...", "format": "svg" }` returns `{ svg, pages }`.
- `POST /measure` with `{ items, format }` returns line counts keyed by item ID.
- `GET /health` returns compiler, queue, and cache stats.

## Caching

The service keeps Typst warm and uses bounded in-memory caches:

- `COMPILE_CACHE_MAX_ENTRIES` default `32`
- `COMPILE_CACHE_MAX_BYTES` default `67108864`
- `MEASURE_CACHE_MAX_ENTRIES` default `128`

Set a cache limit to `0` to disable that cache.

`/compile` is cached by exact source and output format. `/measure` is cached by
the generated measurement source plus caller item IDs and order, because the
response object is keyed by those IDs.

Final PDFs are still compiled as one canonical Typst document. Do not split and
stitch server PDFs unless Typst semantics for counters, references, and global
layout state are explicitly preserved.

## Validation

Run before deploying:

```sh
npm run check
npm test
```
