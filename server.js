/*
@graph
kind: implementation
nodes:
  - typst-compile-server
summary: "Stateful HTTP server keeping the ctypst WASM runtime warm with embedded fonts. Serialises compiles through compileQueue and tracks active/queued counters for /health. Bounded compileCache configured via env."
symbols:
  - init
  - withCompilerLock
  - HttpError
links:
  idea:
    - typst-compile-service
  implementation:
    - typst-compile-cache
    - typst-compile-service-pkg
@endgraph
*/
/**
 * Typst Compile Service — server-side PDF/SVG rendering.
 *
 * Keeps the Typst WASM compiler warm in memory. Fonts load once at startup
 * from the shared @corbet-labs/ctypst package (the single source tree for
 * document font bytes) via the proper loadFonts API (same as client-side)
 * for correct PDF embedding.
 *
 * Endpoints:
 *   POST /compile  — { source, format?: "svg"|"pdf" } → compiled output
 *   GET  /health   — 200 OK (alias /healthz for cockpit probe convention)
 */

const http = require('http');
const { compileCacheKey, readPositiveInt } = require('./cache');

const { Ctypst } = require('@corbet-labs/ctypst/wasm/nodejs/ctypst.js');

let ct = null;
let initPromise = null;
let compileQueue = Promise.resolve();
let activeCompiles = 0;
let queuedCompiles = 0;

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 1024 * 1024);
const COMPILE_CACHE_MAX_ENTRIES = readPositiveInt('COMPILE_CACHE_MAX_ENTRIES', 32);
const COMPILE_CACHE_MAX_BYTES = readPositiveInt('COMPILE_CACHE_MAX_BYTES', 64 * 1024 * 1024);
let compileCacheBytes = 0;
const compileCache = new Map();

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function init() {
    if (ct) return;
    if (initPromise) { await initPromise; return; }

    initPromise = (async () => {
        console.log('[typst] Opening ctypst runtime...');
        const start = Date.now();

        ct = new Ctypst();

        console.log(`[typst] Ready in ${Date.now() - start}ms`);
    })();

    await initPromise;
}

function withCompilerLock(fn) {
    queuedCompiles += 1;
    const run = compileQueue.then(async () => {
        queuedCompiles -= 1;
        activeCompiles += 1;
        try {
            return await fn();
        } finally {
            activeCompiles -= 1;
        }
    });
    compileQueue = run.catch(() => {});
    return run;
}

function estimateJsonCompileBytes(body) {
    return Buffer.byteLength(body.svg || '', 'utf8') + 128;
}

function getCompileCache(key) {
    const hit = compileCache.get(key);
    if (!hit) return null;
    compileCache.delete(key);
    compileCache.set(key, hit);
    return hit;
}

function setCompileCache(key, entry) {
    if (COMPILE_CACHE_MAX_ENTRIES === 0 || COMPILE_CACHE_MAX_BYTES === 0) return;
    if (entry.bytes > COMPILE_CACHE_MAX_BYTES) return;
    const existing = compileCache.get(key);
    if (existing) {
        compileCacheBytes -= existing.bytes;
        compileCache.delete(key);
    }
    compileCache.set(key, entry);
    compileCacheBytes += entry.bytes;
    while (compileCache.size > COMPILE_CACHE_MAX_ENTRIES || compileCacheBytes > COMPILE_CACHE_MAX_BYTES) {
        const oldestKey = compileCache.keys().next().value;
        if (!oldestKey) break;
        const oldest = compileCache.get(oldestKey);
        compileCacheBytes -= oldest?.bytes || 0;
        compileCache.delete(oldestKey);
    }
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        let settled = false;

        const fail = (err) => {
            if (settled) return;
            settled = true;
            reject(err);
            req.destroy();
        };

        req.on('data', chunk => {
            total += chunk.length;
            if (total > MAX_BODY_BYTES) {
                return fail(new HttpError(413, `Request body too large; max ${MAX_BODY_BYTES} bytes`));
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (settled) return;
            settled = true;
            try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
            catch { reject(new Error('Invalid JSON')); }
        });
        req.on('error', err => {
            if (settled) return;
            settled = true;
            reject(err);
        });
    });
}

async function handleCompile(req, res) {
    try {
        const { source, format = 'svg' } = await parseBody(req);
        if (!source || typeof source !== 'string') return send(res, 400, { error: 'Missing "source" in body' });
        if (format !== 'svg' && format !== 'pdf') return send(res, 400, { error: 'format must be "svg" or "pdf"' });

        const cacheKey = compileCacheKey(source, format);
        const cached = getCompileCache(cacheKey);
        if (cached) {
            if (cached.kind === 'pdf') {
                return sendPdf(res, cached.body, 'hit');
            }
            return send(res, 200, cached.body, { 'X-CV-Compile-Cache': 'hit' });
        }

        const output = await withCompilerLock(async () => {
            await init();
            let document;
            try {
                document = ct.compile(source, '{}');
            } catch (e) {
                return { kind: 'json', status: 422, body: { error: 'Compilation failed', diagnostics: [String(e?.message ?? e)] } };
            }

            if (format === 'pdf') {
                let pdf;
                try {
                    pdf = Buffer.from(document.pdf());
                } catch (e) {
                    return { kind: 'json', status: 422, body: { error: 'PDF export failed', diagnostics: [String(e?.message ?? e)] } };
                }
                setCompileCache(cacheKey, { kind: 'pdf', body: pdf, bytes: pdf.byteLength });
                return { kind: 'pdf', body: pdf, cacheStatus: 'miss' };
            }

            let svg;
            try {
                svg = document.svg_merged(0);
            } catch (e) {
                return { kind: 'json', status: 422, body: { error: 'SVG export failed', diagnostics: [String(e?.message ?? e)] } };
            }
            const body = { svg, pages: document.page_count() };
            setCompileCache(cacheKey, { kind: 'json', body, bytes: estimateJsonCompileBytes(body) });
            return { kind: 'json', status: 200, body, cacheStatus: 'miss' };
        });

        if (output.kind === 'pdf') {
            return sendPdf(res, output.body, output.cacheStatus);
        }
        return send(res, output.status, output.body, output.cacheStatus ? { 'X-CV-Compile-Cache': output.cacheStatus } : {});
    } catch (e) {
        if (e instanceof HttpError) {
            return send(res, e.status, { error: e.message });
        }
        send(res, 500, { error: e.message });
    }
}

function send(res, status, data, extraHeaders = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...extraHeaders,
    });
    res.end(JSON.stringify(data));
}

function sendPdf(res, pdf, cacheStatus) {
    res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Access-Control-Allow-Origin': '*',
        'X-CV-Compile-Cache': cacheStatus,
    });
    res.end(pdf);
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        return res.end();
    }

    try {
        if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
            return send(res, 200, {
                status: 'ok',
                compiler: !!ct,
                activeCompiles,
                queuedCompiles,
                cacheEntries: compileCache.size,
                cacheBytes: compileCacheBytes,
            });
        }
        if (req.method === 'POST' && req.url === '/compile') {
            return await handleCompile(req, res);
        }
        send(res, 404, { error: 'Not found' });
    } catch (e) {
        console.error('[typst] Error:', e);
        send(res, 500, { error: e.message });
    }
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`[typst] Listening on :${PORT}`);
    init().catch(e => console.error('[typst] Init failed:', e));
});
