/**
 * Typst Compile Service — server-side PDF/SVG rendering.
 *
 * Keeps the Typst WASM compiler warm in memory. Fonts loaded once at startup.
 * Each compile is just document processing — no cold start per request.
 *
 * Endpoints:
 *   POST /compile  — { source, format?: "svg"|"pdf" } → compiled output
 *   POST /measure  — { items: [{ id, typst }], format? } → { id: lineCount }
 *   GET  /health   — 200 OK
 */

const http = require('http');

// Lazy-loaded compiler (initialized on first request)
let compiler = null;
let renderer = null;
let initPromise = null;

const FONT_DIR = __dirname + '/fonts';

async function init() {
    if (compiler) return;
    if (initPromise) { await initPromise; return; }

    initPromise = (async () => {
        console.log('[typst] Loading WASM compiler...');
        const start = Date.now();

        const typstTs = await import('@myriaddreamin/typst.ts');
        compiler = typstTs.createTypstCompiler();
        await compiler.init();

        renderer = typstTs.createTypstRenderer();
        await renderer.init();

        // Load fonts as virtual files via mapShadow (same API as client-side)
        const fs = require('fs');
        const fontFiles = fs.readdirSync(FONT_DIR).filter(f => f.endsWith('.ttf') || f.endsWith('.woff2'));
        for (const fontFile of fontFiles) {
            const data = fs.readFileSync(`${FONT_DIR}/${fontFile}`);
            compiler.mapShadow(`/fonts/${fontFile}`, new Uint8Array(data));
        }

        console.log(`[typst] Ready in ${Date.now() - start}ms, ${fontFiles.length} fonts loaded`);
    })();

    await initPromise;
}

// Parse request body
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { reject(new Error('Invalid JSON')); }
        });
    });
}

// Compile Typst source to SVG or PDF
async function handleCompile(req, res) {
    await init();
    const { source, format = 'svg' } = await parseBody(req);
    if (!source) return send(res, 400, { error: 'Missing "source" in body' });

    try {
        compiler.addSource('/main.typ', source);
        const fmt = format === 'pdf' ? 'pdf' : 'vector';
        const { result, diagnostics } = await compiler.compile({ mainFilePath: '/main.typ', format: fmt });

        if (!result) {
            const errors = diagnostics?.filter(d => d.severity === 'error').map(d => d.message) || ['Compilation failed'];
            return send(res, 422, { error: 'Compilation failed', diagnostics: errors });
        }

        if (format === 'pdf') {
            res.writeHead(200, { 'Content-Type': 'application/pdf' });
            res.end(Buffer.from(result));
        } else {
            const svg = await renderer.renderSvg({ artifactContent: result, format: 'vector' });
            send(res, 200, { svg, pages: svg.split('</svg>').length - 1 });
        }
    } catch (e) {
        send(res, 500, { error: e.message });
    }
}

// Measure line counts (same logic as client-side ruler)
async function handleMeasure(req, res) {
    await init();
    const { items, format } = await parseBody(req);
    if (!Array.isArray(items)) return send(res, 400, { error: 'Missing "items" array' });

    try {
        // Build ruler source: reference line + one page per item
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
            'X', // reference line
        ];

        for (const item of items) {
            lines.push('', '#pagebreak()', item.typst);
        }

        const source = lines.join('\n');
        compiler.addSource('/ruler.typ', source);
        const { result } = await compiler.compile({ mainFilePath: '/ruler.typ', format: 'vector' });
        if (!result) return send(res, 422, { error: 'Ruler compilation failed' });

        const svg = await renderer.renderSvg({ artifactContent: result, format: 'vector' });
        const heights = parseSvgHeights(svg);
        const refHeight = heights[0] || 1;

        const measured = {};
        for (let i = 0; i < items.length; i++) {
            const pageHeight = heights[i + 1];
            measured[items[i].id] = pageHeight !== undefined
                ? Math.max(1, Math.round(pageHeight / refHeight))
                : 1;
        }

        send(res, 200, measured);
    } catch (e) {
        send(res, 500, { error: e.message });
    }
}

function parseSvgHeights(svg) {
    const heights = [];
    const re = /height="([^"]+)pt"/g;
    let m;
    while ((m = re.exec(svg)) !== null) {
        heights.push(parseFloat(m[1]));
    }
    return heights;
}

function send(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
}

// Router
const server = http.createServer(async (req, res) => {
    // CORS preflight
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
            return send(res, 200, { status: 'ok', compiler: !!compiler });
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
    // Pre-warm: initialize compiler on startup
    init().catch(e => console.error('[typst] Init failed:', e));
});
