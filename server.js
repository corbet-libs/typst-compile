/**
 * Typst Compile Service — server-side PDF/SVG rendering.
 *
 * Keeps the Typst WASM compiler warm in memory. Fonts loaded once at startup
 * via the proper loadFonts API (same as client-side) for correct PDF embedding.
 *
 * Endpoints:
 *   POST /compile  — { source, format?: "svg"|"pdf" } → compiled output
 *   POST /measure  — { items: [{ id, typst }], format? } → { id: lineCount }
 *   GET  /health   — 200 OK
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

let compiler = null;
let renderer = null;
let initPromise = null;
let compileQueue = Promise.resolve();
let activeCompiles = 0;
let queuedCompiles = 0;
let sourceSeq = 0;

const FONT_DIR = path.join(__dirname, 'fonts');
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 1024 * 1024);

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function init() {
    if (compiler) return;
    if (initPromise) { await initPromise; return; }

    initPromise = (async () => {
        console.log('[typst] Loading WASM compiler...');
        const start = Date.now();

        const { createTypstCompiler, createTypstRenderer, preloadRemoteFonts } = await import('@myriaddreamin/typst.ts');

        // Read font files as data URLs (preloadRemoteFonts expects URLs or data URIs)
        const fontFiles = fs.readdirSync(FONT_DIR).filter(f => f.endsWith('.ttf') || f.endsWith('.woff2'));
        const fontUrls = fontFiles.map(f => {
            const data = fs.readFileSync(path.join(FONT_DIR, f));
            const ext = path.extname(f).slice(1);
            const mime = ext === 'woff2' ? 'font/woff2' : 'font/ttf';
            return `data:${mime};base64,${data.toString('base64')}`;
        });

        compiler = createTypstCompiler();
        await compiler.init({
            beforeBuild: [preloadRemoteFonts(fontUrls, { assets: false })],
        });

        renderer = createTypstRenderer();
        await renderer.init();

        console.log(`[typst] Ready in ${Date.now() - start}ms, ${fontFiles.length} fonts loaded`);
    })();

    await initPromise;
}

function nextSourcePath(prefix) {
    sourceSeq = (sourceSeq + 1) % 1000000;
    return `/${prefix}-${Date.now()}-${sourceSeq}.typ`;
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

        const output = await withCompilerLock(async () => {
            await init();
            const mainPath = nextSourcePath('main');
            compiler.addSource(mainPath, source);

            if (format === 'pdf') {
                const { result, diagnostics } = await compiler.compile({ mainFilePath: mainPath, format: 'pdf' });
                if (!result) {
                    const errors = diagnostics?.filter(d => d.severity === 'error').map(d => d.message) || ['Compilation failed'];
                    return { kind: 'json', status: 422, body: { error: 'Compilation failed', diagnostics: errors } };
                }
                return { kind: 'pdf', body: Buffer.from(result) };
            }

            const { result, diagnostics } = await compiler.compile({ mainFilePath: mainPath, format: 'vector' });
            if (!result) {
                const errors = diagnostics?.filter(d => d.severity === 'error').map(d => d.message) || ['Compilation failed'];
                return { kind: 'json', status: 422, body: { error: 'Compilation failed', diagnostics: errors } };
            }
            const svg = await renderer.renderSvg({ artifactContent: result, format: 'vector' });
            const pageCount = (svg.match(/<svg[^>]*class="typst-page"/g) || []).length || 1;
            return { kind: 'json', status: 200, body: { svg, pages: pageCount } };
        });

        if (output.kind === 'pdf') {
            res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Access-Control-Allow-Origin': '*',
            });
            return res.end(output.body);
        }
        return send(res, output.status, output.body);
    } catch (e) {
        if (e instanceof HttpError) {
            return send(res, e.status, { error: e.message });
        }
        send(res, 500, { error: e.message });
    }
}

async function handleMeasure(req, res) {
    try {
        const { items, format } = await parseBody(req);
        if (!Array.isArray(items)) return send(res, 400, { error: 'Missing "items" array' });

        const measured = await withCompilerLock(async () => {
            await init();
            const fontSize = format?.fontSize ?? 10.5;
            const font = format?.font || 'Archivo';
            const marginLeft = format?.marginLeft ?? 15;
            const marginRight = format?.marginRight ?? 15;
            const pageSize = format?.pageSize || 'a4';
            const pageWidth = pageSize === 'us-letter' ? '215.9mm' : '210mm';

            const lines = [
                `#set page(width: ${pageWidth}, margin: (top: 0pt, bottom: 0pt, left: ${marginLeft}mm, right: ${marginRight}mm), height: auto)`,
                `#set text(font: "${font}", size: ${fontSize}pt, fill: black, top-edge: "cap-height", bottom-edge: "baseline")`,
                `#set par(leading: 0.6em, justify: false, spacing: 0pt)`,
                '#set block(above: 0pt, below: 0pt)',
                '',
                '#let cv-bullet() = box(width: 10pt)',
                '',
                'X',
            ];

            for (const item of items) {
                lines.push('', '#pagebreak()', item.typst);
            }

            const rulerPath = nextSourcePath('ruler');
            compiler.addSource(rulerPath, lines.join('\n'));
            const { result } = await compiler.compile({ mainFilePath: rulerPath, format: 'vector' });
            if (!result) return null;

            const svg = await renderer.renderSvg({ artifactContent: result, format: 'vector' });
            const heights = [];
            const re = /height="([^"]+)pt"/g;
            let m;
            while ((m = re.exec(svg)) !== null) heights.push(parseFloat(m[1]));

            const refHeight = heights[0] || 1;
            const out = {};
            for (let i = 0; i < items.length; i++) {
                const pageHeight = heights[i + 1];
                out[items[i].id] = pageHeight !== undefined
                    ? Math.max(1, Math.round(pageHeight / refHeight))
                    : 1;
            }
            return out;
        });

        if (!measured) return send(res, 422, { error: 'Ruler compilation failed' });
        send(res, 200, measured);
    } catch (e) {
        if (e instanceof HttpError) {
            return send(res, e.status, { error: e.message });
        }
        send(res, 500, { error: e.message });
    }
}

function send(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
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
        if (req.method === 'GET' && req.url === '/health') {
            return send(res, 200, {
                status: 'ok',
                compiler: !!compiler,
                activeCompiles,
                queuedCompiles,
            });
        }
        if (req.method === 'POST' && req.url === '/compile') {
            return await handleCompile(req, res);
        }
        if (req.method === 'POST' && req.url === '/measure') {
            return await handleMeasure(req, res);
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
