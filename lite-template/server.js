const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { createLLMClient } = require('./helper/llm-client');
const { extractJSON } = require('./helper/json-extractor');
const { assemblePrompt: sharedAssemblePrompt } = require('./helper/prompt-assembler');
const { generateWidgetScript } = require('./helper/widget-generator');
const { validateApiKey } = require('./middleware/auth');
const { extractSearchTerms } = require('./helper/analytics');
const { initFormSubmission, isFormSubmissionEnabled, sendFormHome } = require('./helper/form-submission');
const client = require('prom-client');
require('dotenv').config();

// ============================================
// Prometheus Metrics Setup
// Exposes /metrics endpoint for Grafana/Prometheus
// ============================================
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestsTotal = new client.Counter({
    name: 'mojulo_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'path', 'status'],
    registers: [register]
});

const httpRequestDuration = new client.Histogram({
    name: 'mojulo_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register]
});

const conversationsTotal = new client.Gauge({
    name: 'mojulo_conversations_total',
    help: 'Total number of conversations',
    registers: [register]
});

const turnsTotal = new client.Gauge({
    name: 'mojulo_turns_total',
    help: 'Total number of conversation turns',
    registers: [register]
});

const ragChunksLoaded = new client.Gauge({
    name: 'mojulo_rag_chunks_loaded',
    help: 'Number of RAG document chunks loaded',
    registers: [register]
});

const botUp = new client.Gauge({
    name: 'mojulo_up',
    help: 'Whether the bot is healthy (1 = up, 0 = down)',
    registers: [register]
});

const llmRequestsTotal = new client.Counter({
    name: 'mojulo_llm_requests_total',
    help: 'Total number of LLM requests',
    labelNames: ['status'],
    registers: [register]
});

const storageUsedBytes = new client.Gauge({
    name: 'mojulo_storage_used_bytes',
    help: 'Storage space used in bytes',
    registers: [register]
});

const storageTotalBytes = new client.Gauge({
    name: 'mojulo_storage_total_bytes',
    help: 'Total storage space in bytes',
    registers: [register]
});

const databaseSizeBytes = new client.Gauge({
    name: 'mojulo_database_size_bytes',
    help: 'SQLite database file size in bytes',
    registers: [register]
});

// ============================================
// Log Capture System
// Captures console output for /api/logs endpoint
// ============================================
const MAX_LOG_LINES = 1000;
const logBuffer = [];

function captureLog(level, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        // Handle Error objects specially - they don't serialize with JSON.stringify
        if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack || ''}`;
        }
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }).join(' ');

    logBuffer.push({
        timestamp,
        level,
        message,
        instance: process.env.HOSTNAME || 'local'
    });

    // Keep buffer size limited
    while (logBuffer.length > MAX_LOG_LINES) {
        logBuffer.shift();
    }
}

// Store original console methods
const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console)
};

// Override console methods to capture logs
console.log = (...args) => { captureLog('info', args); originalConsole.log(...args); };
console.error = (...args) => { captureLog('error', args); originalConsole.error(...args); };
console.warn = (...args) => { captureLog('warn', args); originalConsole.warn(...args); };
console.info = (...args) => { captureLog('info', args); originalConsole.info(...args); };
console.debug = (...args) => { captureLog('debug', args); originalConsole.debug(...args); };

// Config loaded at startup (not module init)
let config = null;

const app = express();
const PORT = process.env.PORT || 3000;

// Trust first proxy (K8s ingress/load balancer) for correct client IP in rate limiting
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Prometheus HTTP request tracking middleware
app.use((req, res, next) => {
    // Skip metrics endpoint to avoid recursion
    if (req.path === '/metrics') {
        return next();
    }

    const start = process.hrtime();

    res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(start);
        const duration = seconds + nanoseconds / 1e9;

        // Normalize path to avoid high cardinality (group dynamic segments)
        let normalizedPath = req.path;
        // Replace UUIDs and numeric IDs with placeholder
        normalizedPath = normalizedPath.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
        normalizedPath = normalizedPath.replace(/\/\d+/g, '/:id');

        httpRequestsTotal.inc({
            method: req.method,
            path: normalizedPath,
            status: res.statusCode
        });

        httpRequestDuration.observe(
            { method: req.method, path: normalizedPath },
            duration
        );
    });

    next();
});

// Serve index.html with injected config
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, './client/index.html');
    let html = fs.readFileSync(indexPath, 'utf-8');

    // Replace the title tag with the config name
    html = html.replace(/<title>.*?<\/title>/, `<title>${config.config.name}</title>`);

    // Load form structure if isForm is enabled
    const configToInject = { ...config.config };
    if (config.config.isForm && config.config.formStructure) {
        const formStructurePath = path.join(__dirname, config.config.formStructure);
        configToInject.formStructure = JSON.parse(fs.readFileSync(formStructurePath, 'utf-8'));
    }

    // Load calendar config if isCalendar is enabled
    if (config.config.isCalendar) {
        const calendarConfigPath = path.join(__dirname, 'config/calendarConfig.json');
        if (fs.existsSync(calendarConfigPath)) {
            configToInject.calendarConfig = JSON.parse(fs.readFileSync(calendarConfigPath, 'utf-8')).calendarConfig;
        }
    }

    // Load triage routes if file exists. The file is the raw routes array,
    // mirroring how formFormat.json holds the raw form structure.
    const triageRoutesPath = path.join(__dirname, 'config/triageRoutes.json');
    if (fs.existsSync(triageRoutesPath)) {
        configToInject.triageRoutes = JSON.parse(fs.readFileSync(triageRoutesPath, 'utf-8'));
        console.log('Injected triageRoutes count:', configToInject.triageRoutes?.length || 0);
    }

    // Optical Read: ship the field list to the client so it can render the
    // read-only display after extraction without a second round trip.
    if (config.config.isOpticalRead && opticalReadFields) {
        configToInject.opticalReadFields = opticalReadFields;
    }

    // Inject config as a global variable before other scripts
    const configScript = `<script>window.__INITIAL_CONFIG__ = ${JSON.stringify(configToInject)};</script>`;
    html = html.replace('</head>', `${configScript}\n</head>`);

    res.send(html);
});

// Serve other static files normally
app.use(express.static(path.join(__dirname, './client')));

let llmClient = null;
let cachedInstructions = null;
let ragInstance = null;
// Optical Read field list, loaded once at startup like instructions.txt.
// Null when the protocol is not enabled. The /api/extract endpoint and the
// frontend's __INITIAL_CONFIG__ both read from here.
let opticalReadFields = null;

// Initialize database
// Use absolute /data path in Docker (mounted volume); relative ./data for local dev
const dbPath = process.env.DOCKER_RUN === 'true'
  ? '/data/conversation.db'
  : './data/conversation.db';

// Ensure the database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Create tables on startup
db.exec(`
    CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_prompt TEXT NOT NULL,
        full_prompt TEXT,
        llm_response TEXT,
        machine_state TEXT,
        rag_context TEXT,
        content_hash TEXT NOT NULL,
        chain_hash TEXT NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS form_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        form_data TEXT NOT NULL,
        schema_fingerprint TEXT,
        is_complete INTEGER NOT NULL DEFAULT 1,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        webhook_status TEXT,
        webhook_error TEXT,
        metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_form_submissions_convo
        ON form_submissions(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_at
        ON form_submissions(submitted_at);
`);

// Backfill: artifacts created before the metadata column existed need an
// ALTER TABLE. SQLite has no IF NOT EXISTS for ADD COLUMN, so probe first.
{
    const cols = db.prepare("PRAGMA table_info(form_submissions)").all();
    if (!cols.some((c) => c.name === 'metadata')) {
        db.exec('ALTER TABLE form_submissions ADD COLUMN metadata TEXT');
    }
}

// Federated hashing columns (v1.5 + v1.6).
//   handoff_hash: sender's tip-of-chain at handoff time, stored on the FIRST
//   turn of a receiver's conversation only. Verify uses it as the seed instead
//   of '0' so cross-bot continuity replays deterministically.
//   event_type: NULL for chat turns, 'handoff' for outbound triage click events
//   recorded on the sender. Chain math is uniform across both kinds.
{
    const cols = db.prepare('PRAGMA table_info(turns)').all();
    if (!cols.some((c) => c.name === 'handoff_hash')) {
        db.exec('ALTER TABLE turns ADD COLUMN handoff_hash TEXT');
    }
    if (!cols.some((c) => c.name === 'event_type')) {
        db.exec('ALTER TABLE turns ADD COLUMN event_type TEXT');
    }
}

// Prepare insert statements for reuse
const insertTurn = db.prepare(`
    INSERT INTO turns (conversation_id, turn, user_prompt, full_prompt, llm_response, machine_state, rag_context, content_hash, chain_hash, handoff_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Handoff events store empty strings for user_prompt/llm_response because the
// existing schema declares user_prompt NOT NULL and SQLite can't drop the
// constraint without a full table rebuild. The hash is computed against the
// same values that get stored, so verify stays deterministic.
const insertHandoffEvent = db.prepare(`
    INSERT INTO turns (conversation_id, turn, user_prompt, full_prompt, llm_response, machine_state, rag_context, content_hash, chain_hash, event_type)
    VALUES (?, ?, '', NULL, '', ?, NULL, ?, ?, 'handoff')
`);

const insertFormSubmission = db.prepare(`
    INSERT INTO form_submissions
        (conversation_id, form_data, schema_fingerprint, is_complete, webhook_status, webhook_error, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// Computed once at startup in app.listen() once config is loaded.
let formSchemaFingerprint = null;

// Rate limiting
const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later'
});

// Validate UUID v4 format (matches crypto.randomUUID() output)
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidConversationId(id) {
    return typeof id === 'string' && UUID_V4_REGEX.test(id);
}

// Handoff chain hash: 64 lowercase hex chars (SHA-256 hex digest output).
// Validated on both client and server; server-side check is authoritative.
const HANDOFF_HASH_REGEX = /^[0-9a-f]{64}$/;
function isValidHandoffHash(h) {
    return typeof h === 'string' && HANDOFF_HASH_REGEX.test(h);
}

// Highest turn number on a conversation, regardless of event_type. Handoff
// events extend past chat turns, so /handoff uses this to stay monotonic.
function getLastTurnNumber(conversationId) {
    const row = db.prepare(
        'SELECT MAX(turn) AS turn FROM turns WHERE conversation_id = ?'
    ).get(conversationId);
    return row?.turn ?? null;
}

// Aggressive limiter for /handoff. Beacon traffic is fire-and-forget and
// abuse-attractive (forged conversation IDs would just write empty rows we
// can't verify against any sender), so cap tighter than chat.
const handoffLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: 'Too many handoff events, please try again later'
});

// /api/extract carries a base64 image inside a JSON body. The default
// express.json() limit (100kb) is way too small. We cap at ~7MB raw, which
// covers a 5MB image after base64 inflation (1.37×) plus the small JSON
// envelope. The 5MB image cap itself is enforced after parsing.
const extractJsonParser = express.json({ limit: '7mb' });
const extractLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many extraction requests, please try again later'
});

// 5MB raw image cap. Enforced post-parse against the decoded byte length so
// padded-base64 tricks can't slip past.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// Chat endpoint
app.post('/chat', chatLimiter, async (req, res) => {
    try {
        let { prompt, turn, conversationId, handoffHash, includeHistory = true } = req.body;

        // Accept incoming conversationId only if it is a well-formed UUID v4
        // (e.g. correlation ID passed from a triage handoff). Otherwise mint a new one.
        if (!conversationId || !isValidConversationId(conversationId)) {
            conversationId = crypto.randomUUID();
        }

        // Validated handoff seed: only honored on the first turn of a fresh
        // conversation (where the local chain is empty). Stale handoff hashes
        // arriving on an already-extended chain are ignored.
        const validHandoffHash = isValidHandoffHash(handoffHash) ? handoffHash : null;

        // Load conversation history if this is a continuing conversation
        let conversationHistory = null;
        if (conversationId && includeHistory) {
            conversationHistory = getConversationHistory(conversationId);
        }

        const { result, ragSources, expandedQuery } = await sharedAssemblePrompt({
            userPrompt: prompt,
            instructions: cachedInstructions,
            ragInstance,
            llmClient,
            conversationHistory,
        });
        llmRequestsTotal.inc({ status: 'success' });
        console.log('STREAM - LLM Response:', result.response);
        console.log('STREAM - Response length:', result.response?.length);

        // Try to extract JSON, fallback to a synthesized envelope if extraction fails.
        // Runtime counts turns; the envelope no longer carries `turn`.
        const computedTurn = turn + 1;
        let satiJson;
        try {
            satiJson = extractJSON(result.response);
        } catch (error) {
            console.error('JSON extraction failed, using fallback response structure:', error.message);

            // Conversational responses that don't follow the expected JSON format
            // land here. We synthesize the canonical nested envelope and preserve
            // any prior form state so the user doesn't lose progress.
            const fallbackAnswer = result.response || "I apologize, but I encountered an error processing my response.";

            // Recover the prior form.fields from the last turn's machine_state.
            // Read the new shape first, fall back to the legacy flat `formTracker`
            // for rows persisted before the unflatten migration.
            let lastFormFields = {};
            if (conversationHistory && conversationHistory.length > 0) {
                const lastTurn = conversationHistory[conversationHistory.length - 1];
                try {
                    const lastState = JSON.parse(lastTurn.machine_state || '{}');
                    lastFormFields = lastState.form?.fields ?? lastState.formTracker ?? {};
                } catch (e) {
                    console.log('Could not parse last form state');
                }
            }

            satiJson = {
                answer: fallbackAnswer,
                suggestions: [],
                form: {
                    fields: lastFormFields,
                    remaining: 0,
                    complete: false,
                },
            };

            console.log('Fallback response created');
        }

        const trace = result.trace;
        if (expandedQuery) {
            trace.expandedQuery = expandedQuery;
        }

        // Generate hashes
        const contentHash = hashTurnContent(
            computedTurn,
            prompt,
            result.response,
            JSON.stringify(satiJson)
        );
        // First-turn fallback: if local chain is empty AND a valid handoff hash
        // was provided, descend from the sender's tip. Subsequent turns ignore
        // any stale handoffHash on the request.
        const localTip = getLastChainHash(conversationId);
        const previousChainHash = localTip || validHandoffHash || null;
        const persistedHandoffHash = localTip ? null : validHandoffHash;
        const chainHash = createChainHash(contentHash, previousChainHash);

        insertTurn.run(
            conversationId,
            computedTurn,
            prompt,
            null,
            result.response,
            JSON.stringify(satiJson),
            ragSources ? JSON.stringify(ragSources) : null,
            contentHash,
            chainHash,
            persistedHandoffHash
        );

        const hashMsg = `Chain: ${chainHash}`;

        // Send response. `chainHash` is exposed explicitly so the client can
        // forward it to a downstream bot via triage handoff URL — the legacy
        // hashMsg string is kept for the existing log UI.
        res.json({ response: satiJson, conversationId, trace, hashMsg, chainHash, sources: ragSources });

    } catch (e) {
        llmRequestsTotal.inc({ status: 'error' });
        console.error('Chat error:', e.message, e.stack);
        res.status(500).json({ error: e.message || 'Internal server error' });
    }
})

// Optical Read extraction endpoint. Conceptually Turn 1 of a two-turn
// conversation: the user uploads, the model reads, the chain locks. Whatever
// happens next (edit, submit, abandon) is downstream and chained separately.
//
// Input  : { conversationId?, fileName, mime, base64 }
// Output : { answer, extraction: { fields, confidence, notes, showUploadButton },
//            conversationId, chainHash }
//
// Hashing: content_hash includes sha256(imageBytes), so the chain is
// tamper-evident over the source artifact, not just the prose response. The
// row's user_prompt is set to a sentinel string and the actual prompt the
// model saw is stored in full_prompt — same pattern as /chat.
app.post('/api/extract', extractLimiter, extractJsonParser, async (req, res) => {
    try {
        if (!opticalReadFields || opticalReadFields.length === 0) {
            return res.status(400).json({ error: 'Optical Read is not configured for this bot' });
        }

        let { conversationId, fileName, mime, base64 } = req.body || {};

        if (!mime || !ALLOWED_IMAGE_MIMES.has(mime)) {
            return res.status(400).json({ error: 'Unsupported image type. Use PNG, JPEG, or WebP.' });
        }
        if (typeof base64 !== 'string' || base64.length === 0) {
            return res.status(400).json({ error: 'base64 image data is required' });
        }

        // Strip data: URL prefix if the client forgot to. Decode and check the
        // raw byte length against the cap.
        const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
        let imageBuffer;
        try {
            imageBuffer = Buffer.from(cleaned, 'base64');
        } catch (e) {
            return res.status(400).json({ error: 'Invalid base64 payload' });
        }
        if (imageBuffer.length === 0) {
            return res.status(400).json({ error: 'Empty image payload' });
        }
        if (imageBuffer.length > MAX_IMAGE_BYTES) {
            return res.status(413).json({ error: `Image exceeds ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB cap` });
        }

        if (!conversationId || !isValidConversationId(conversationId)) {
            conversationId = crypto.randomUUID();
        }

        // Compose the user prompt deterministically so the hash chain stays
        // reproducible. The cartridge in instructions.txt already explains the
        // protocol — this is just the per-turn data envelope.
        const fieldList = JSON.stringify(opticalReadFields, null, 2);
        const userPrompt =
            `Extract the configured fields from this image. ` +
            `Return one entry per idName under extraction.fields, empty string when missing.\n\n` +
            `Field list:\n${fieldList}`;

        const conversationHistory = getConversationHistory(conversationId);
        const result = await llmClient.generate(
            cachedInstructions,
            userPrompt,
            '', // No RAG context for extraction — the prior is in the model.
            conversationHistory,
            { base64: cleaned, mime }
        );
        llmRequestsTotal.inc({ status: 'success' });

        // Parse the response. extractJSON handles fenced blocks; fall back to a
        // best-effort empty envelope (canonical nested shape) if it can't.
        let parsed;
        try {
            parsed = extractJSON(result.response);
        } catch (e) {
            console.error('Optical Read JSON parse failed:', e.message);
            parsed = {
                answer: 'Could not read the image. Please try a clearer upload.',
                extraction: { fields: {}, showUploadButton: true },
            };
        }

        // Read the new nested shape first; fall back to legacy flat fields so
        // any provider that hasn't followed the cartridge's nested instruction
        // still parses cleanly. Backward-compat read at one place.
        const rawFields = parsed.extraction?.fields ?? parsed.extractedFields ?? {};
        const rawConfidence = parsed.extraction?.confidence ?? parsed.extractionConfidence;
        const rawNotes = parsed.extraction?.notes ?? parsed.extractionNotes;
        const rawShowUpload = parsed.extraction?.showUploadButton ?? parsed.showUploadButton;

        // Defense in depth: only retain idNames that the artifact actually
        // configured. Stops a hallucinated key from leaking into Turn 2.
        const allowedIds = new Set(opticalReadFields.map((f) => f.idName));
        const cleanedExtracted = {};
        for (const id of allowedIds) {
            const v = rawFields?.[id];
            cleanedExtracted[id] = typeof v === 'string' ? v : '';
        }

        // Confidence signal — narrow to the three allowed labels and treat
        // anything else as 'medium' (the model occasionally answers "okay" or
        // "good" instead of one of the enum values).
        const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low']);
        const confRaw = (rawConfidence || '').toString().trim().toLowerCase();
        const extractionConfidence = ALLOWED_CONFIDENCE.has(confRaw) ? confRaw : 'medium';
        const extractionNotes = typeof rawNotes === 'string' ? rawNotes : '';

        const turn = (getLastTurnNumber(conversationId) ?? 0) + 1;

        // Hash inputs include the image's sha256 so verify covers the source
        // bytes, not just the model output. machineState carries the canonical
        // nested envelope plus optical-read provenance metadata; full_prompt
        // holds the assembled text the model saw.
        const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
        const showUploadButton = rawShowUpload === true || rawShowUpload === 'true';
        const envelope = {
            answer: typeof parsed.answer === 'string' ? parsed.answer : '',
            extraction: {
                fields: cleanedExtracted,
                confidence: extractionConfidence,
                notes: extractionNotes,
                showUploadButton,
            },
        };
        const machineState = JSON.stringify({
            ...envelope,
            source: 'optical_read',
            imageHash,
            imageMime: mime,
            imageBytes: imageBuffer.length,
            fileName: typeof fileName === 'string' ? fileName : null,
        });
        // Sentinel for user_prompt: the chain hashes "<imageHash>" so a
        // tampered image breaks verification even when the prose response is
        // unchanged. The full prompt stays in full_prompt for replay.
        const userPromptSentinel = `[optical_read image: ${imageHash}]`;
        const contentHash = hashTurnContent(
            turn,
            userPromptSentinel,
            result.response,
            machineState
        );
        const previousChainHash = getLastChainHash(conversationId);
        const chainHash = createChainHash(contentHash, previousChainHash);

        insertTurn.run(
            conversationId,
            turn,
            userPromptSentinel,
            userPrompt,
            result.response,
            machineState,
            null,
            contentHash,
            chainHash,
            null
        );

        res.json({
            answer: envelope.answer,
            extraction: envelope.extraction,
            conversationId,
            chainHash,
            trace: result.trace,
        });
    } catch (e) {
        llmRequestsTotal.inc({ status: 'error' });
        console.error('Extract error:', e.message, e.stack);
        res.status(500).json({ error: e.message || 'Internal server error' });
    }
});

// Handoff event endpoint: triage card click on the sender. Records the routing
// transition as a chained event row so the sender's tamper-evident chain
// captures *that* the user routed away. Fired via navigator.sendBeacon — the
// response body is not consumed by the client (delivery is best-effort across
// page unload), but we return JSON for manual replay/debugging.
app.post('/handoff', handoffLimiter, (req, res) => {
    try {
        const { conversationId, deploymentId, starterPrompt, targetUrl } = req.body || {};
        if (!isValidConversationId(conversationId)) {
            return res.status(400).json({ error: 'Invalid conversationId' });
        }
        // Reject handoffs on conversations that don't exist locally — those
        // would be empty chains rooted at a forged event, which is just noise.
        const lastTurnNumber = getLastTurnNumber(conversationId);
        if (lastTurnNumber == null) {
            return res.status(404).json({ error: 'Unknown conversation' });
        }

        const turn = lastTurnNumber + 1;
        const machineState = JSON.stringify({
            eventType: 'handoff',
            deploymentId: typeof deploymentId === 'string' ? deploymentId : null,
            starterPrompt: typeof starterPrompt === 'string' ? starterPrompt : null,
            targetUrl: typeof targetUrl === 'string' ? targetUrl : null,
            timestamp: Date.now()
        });
        // Hash with the same sentinel values the row stores ('' for prompts).
        // Verify recomputes against stored values, so they must match here.
        const contentHash = hashTurnContent(turn, '', '', machineState);
        const previousChainHash = getLastChainHash(conversationId);
        const chainHash = createChainHash(contentHash, previousChainHash);

        insertHandoffEvent.run(
            conversationId,
            turn,
            machineState,
            contentHash,
            chainHash
        );

        res.json({ chainHash, turn });
    } catch (e) {
        console.error('Handoff error:', e.message, e.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Hash the content of this turn
function hashTurnContent(turn, userPrompt, llmResponse, machineState) {
    const content = JSON.stringify({
        turn,
        userPrompt,
        llmResponse,
        machineState
    });
    return crypto.createHash('sha256').update(content).digest('hex');
}

// Create chain hash linking to previous turn
function createChainHash(contentHash, previousChainHash) {
    const combined = contentHash + (previousChainHash || '0');
    return crypto.createHash('sha256').update(combined).digest('hex');
}

// Get the last chain hash from database
function getLastChainHash(conversationId) {
    const lastTurn = db.prepare(
        'SELECT chain_hash FROM turns WHERE conversation_id = ? ORDER BY turn DESC LIMIT 1'
    ).get(conversationId);
    return lastTurn ? lastTurn.chain_hash : null;
}

// Shared verification logic
function verifyConversation(conversationId = null) {
    const query = conversationId
        ? 'SELECT id, turn, conversation_id, user_prompt, llm_response, machine_state, content_hash, chain_hash, handoff_hash, event_type FROM turns WHERE conversation_id = ? ORDER BY turn ASC'
        : 'SELECT id, turn, conversation_id, user_prompt, llm_response, machine_state, content_hash, chain_hash, handoff_hash, event_type FROM turns ORDER BY conversation_id, turn ASC';

    const stmt = db.prepare(query);
    const turns = conversationId ? stmt.all(conversationId) : stmt.all();

    if (turns.length === 0) {
        return { valid: true, totalTurns: 0, message: 'No turns to verify' };
    }

    // Track chain per conversation
    const chainMap = new Map();
    let isValid = true;
    let invalidCount = 0;

    for (const turn of turns) {
        // First turn of a conversation seeds from handoff_hash if present
        // (cross-bot continuity), else null (native start). Subsequent turns
        // chain off the previous row in this conversation.
        const prevHash = chainMap.get(turn.conversation_id)
            || turn.handoff_hash
            || null;

        // Verify content hash
        const expectedContentHash = hashTurnContent(
            turn.turn,
            turn.user_prompt,
            turn.llm_response,
            turn.machine_state
        );
        const contentValid = expectedContentHash === turn.content_hash;

        // Verify chain hash
        const expectedChainHash = createChainHash(turn.content_hash, prevHash);
        const chainValid = expectedChainHash === turn.chain_hash;

        if (!contentValid || !chainValid) {
            isValid = false;
            invalidCount++;
        }

        chainMap.set(turn.conversation_id, turn.chain_hash);
    }

    return {
        valid: isValid,
        totalTurns: turns.length,
        invalidTurns: invalidCount,
        conversationsVerified: chainMap.size
    };
}

// Verify all conversations
app.get('/verify', (req, res) => {
    res.json(verifyConversation());
});

// Verify specific conversation
app.get('/verify/:conversationId', (req, res) => {
    const { conversationId } = req.params;
    res.json(verifyConversation(conversationId));
});

// API: Export conversations as JSON download (protected)
// NOTE: Must be registered before /api/conversations/:conversationId to avoid "export" matching as a conversationId
app.get('/api/conversations/export', validateApiKey, (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Build WHERE clause for optional date filtering
        let havingConditions = [];
        let params = [];

        if (startDate) {
            havingConditions.push('MIN(timestamp) >= ?');
            params.push(startDate.replace('T', ' '));
        }
        if (endDate) {
            havingConditions.push('MIN(timestamp) <= ?');
            params.push(endDate.replace('T', ' '));
        }

        const havingClause = havingConditions.length > 0
            ? `HAVING ${havingConditions.join(' AND ')}`
            : '';

        // Get all matching conversation IDs
        const conversations = db.prepare(`
            SELECT conversation_id, MIN(timestamp) as started_at, MAX(timestamp) as last_activity, COUNT(*) as turn_count
            FROM turns
            GROUP BY conversation_id
            ${havingClause}
            ORDER BY started_at DESC
        `).all(...params);

        // Fetch full turns for each conversation
        const getTurns = db.prepare(`
            SELECT turn, timestamp, user_prompt, llm_response, machine_state, rag_context, event_type, handoff_hash
            FROM turns
            WHERE conversation_id = ?
            ORDER BY turn ASC
        `);

        const exported = conversations.map(conv => ({
            conversationId: conv.conversation_id,
            startedAt: conv.started_at,
            lastActivity: conv.last_activity,
            turnCount: conv.turn_count,
            turns: getTurns.all(conv.conversation_id).map(t => ({
                turn: t.turn,
                timestamp: t.timestamp,
                userPrompt: t.user_prompt,
                llmResponse: t.llm_response,
                machineState: t.machine_state,
                ragContext: t.rag_context,
                eventType: t.event_type,
                handoffHash: t.handoff_hash
            }))
        }));

        const filename = `conversations-export-${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(exported);
    } catch (error) {
        console.error('Error exporting conversations:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// API: Get specific conversation by ID (protected)
app.get('/api/conversations/:conversationId', validateApiKey, (req, res) => {
    try {
        const { conversationId } = req.params;
        
        // Get all turns for this conversation
        const turns = db.prepare(`
            SELECT
                id,
                conversation_id,
                turn,
                timestamp,
                user_prompt,
                llm_response,
                machine_state,
                rag_context,
                content_hash,
                chain_hash,
                event_type,
                handoff_hash
            FROM turns
            WHERE conversation_id = ?
            ORDER BY turn ASC
        `).all(conversationId);
        
        if (turns.length === 0) {
            return res.status(404).json({ 
                error: 'Not found',
                message: `Conversation ${conversationId} not found` 
            });
        }
        
        // Verify integrity of this conversation
        const verification = verifyConversation(conversationId);
        
        res.json({
            conversationId,
            turnCount: turns.length,
            turns,
            verification
        });
    } catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// API: Get common search terms from user prompts (protected)
app.get('/api/conversation-metadata/search-terms', validateApiKey, (req, res) => {
    try {
        const { startDate, endDate, lastActivityStart, lastActivityEnd, limit, minLength, ngramSize } = req.query;

        // Build WHERE clause for time filtering
        let whereConditions = [];
        let params = [];

        if (startDate || endDate) {
            let dateFilters = [];
            if (startDate) {
                dateFilters.push('MIN(timestamp) >= ?');
                params.push(startDate.replace('T', ' '));
            }
            if (endDate) {
                dateFilters.push('MIN(timestamp) <= ?');
                params.push(endDate.replace('T', ' '));
            }
            whereConditions.push(`conversation_id IN (
                SELECT conversation_id FROM turns
                GROUP BY conversation_id
                HAVING ${dateFilters.join(' AND ')}
            )`);
        }

        if (lastActivityStart || lastActivityEnd) {
            let activityFilters = [];
            if (lastActivityStart) {
                activityFilters.push('MAX(timestamp) >= ?');
                params.push(lastActivityStart.replace('T', ' '));
            }
            if (lastActivityEnd) {
                activityFilters.push('MAX(timestamp) <= ?');
                params.push(lastActivityEnd.replace('T', ' '));
            }
            whereConditions.push(`conversation_id IN (
                SELECT conversation_id FROM turns
                GROUP BY conversation_id
                HAVING ${activityFilters.join(' AND ')}
            )`);
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // Fetch all user prompts
        const prompts = db.prepare(`
            SELECT user_prompt
            FROM turns
            ${whereClause}
        `).all(...params).map(row => row.user_prompt);

        // Extract and count terms
        const terms = extractSearchTerms(prompts, {
            ngramSize: parseInt(ngramSize) || 1,
            minLength: parseInt(minLength) || 3,
            limit: parseInt(limit) || 50
        });

        // Build time range info if filters were applied
        let timeRange = null;
        if (startDate || endDate || lastActivityStart || lastActivityEnd) {
            timeRange = {
                startDate: startDate || null,
                endDate: endDate || null,
                lastActivityStart: lastActivityStart || null,
                lastActivityEnd: lastActivityEnd || null
            };
        }

        res.json({
            terms,
            totalPrompts: prompts.length,
            ngramSize: parseInt(ngramSize) || 1,
            minLength: parseInt(minLength) || 3,
            timeRange
        });
    } catch (error) {
        console.error('Error extracting search terms:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// API: Get conversation metadata with optional time filtering (protected)
app.get('/api/conversation-metadata', validateApiKey, (req, res) => {
    try {
        const { startDate, endDate, lastActivityStart, lastActivityEnd } = req.query;

        // Build WHERE clause for time filtering
        let whereConditions = [];
        let params = [];

        // Build subquery for filtering conversations by start date
        if (startDate || endDate) {
            let dateFilters = [];
            if (startDate) {
                dateFilters.push('MIN(timestamp) >= ?');
                params.push(startDate.replace('T', ' '));
            }
            if (endDate) {
                dateFilters.push('MIN(timestamp) <= ?');
                params.push(endDate.replace('T', ' '));
            }
            whereConditions.push(`conversation_id IN (
                SELECT conversation_id FROM turns
                GROUP BY conversation_id
                HAVING ${dateFilters.join(' AND ')}
            )`);
        }

        // Build subquery for filtering by last activity date
        if (lastActivityStart || lastActivityEnd) {
            let activityFilters = [];
            if (lastActivityStart) {
                activityFilters.push('MAX(timestamp) >= ?');
                params.push(lastActivityStart.replace('T', ' '));
            }
            if (lastActivityEnd) {
                activityFilters.push('MAX(timestamp) <= ?');
                params.push(lastActivityEnd.replace('T', ' '));
            }
            whereConditions.push(`conversation_id IN (
                SELECT conversation_id FROM turns
                GROUP BY conversation_id
                HAVING ${activityFilters.join(' AND ')}
            )`);
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // Count total conversations
        const totalConversations = db.prepare(`
            SELECT COUNT(DISTINCT conversation_id) as count
            FROM turns
            ${whereClause}
        `).get(...params).count;

        // Count form completes (conversations with at least one turn where the
        // form-gathering protocol marked completion). Reads the new nested
        // shape first, falls back to the legacy flat field for rows persisted
        // before the envelope unflatten migration. Self-healing as new turns
        // accumulate.
        const formCompletes = db.prepare(`
            SELECT COUNT(DISTINCT conversation_id) as count
            FROM turns
            ${whereClause}
            ${whereConditions.length > 0 ? 'AND' : 'WHERE'} COALESCE(
                json_extract(machine_state, '$.form.complete'),
                json_extract(machine_state, '$.isComplete')
            ) = 1
        `).get(...params).count;

        // Count total messages (turns = user messages). Exclude handoff event
        // rows so the metric reflects user/LLM exchanges, not routing markers.
        const totalMessages = db.prepare(`
            SELECT COUNT(*) as count
            FROM turns
            ${whereClause}
            ${whereConditions.length > 0 ? 'AND' : 'WHERE'} event_type IS NULL
        `).get(...params).count;

        // Form starts = total conversations (in a form-enabled bot, all conversations are form starts)
        const formStarts = totalConversations;

        // Build time range info if filters were applied
        let timeRange = null;
        if (startDate || endDate || lastActivityStart || lastActivityEnd) {
            timeRange = {
                startDate: startDate || null,
                endDate: endDate || null,
                lastActivityStart: lastActivityStart || null,
                lastActivityEnd: lastActivityEnd || null
            };
        }

        res.json({
            totalConversations,
            formStarts,
            formCompletes,
            totalMessages,
            timeRange,
            isFormEnabled: config.config.isForm || false
        });
    } catch (error) {
        console.error('Error fetching conversation metadata:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// API: Get all conversations with pagination, search, and date filtering (protected)
app.get('/api/conversations', validateApiKey, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const { startDate, endDate, conversationId } = req.query;

        // If no search params provided, return only the total count (prevent accidental full load)
        const hasSearchParams = startDate || endDate || conversationId;
        if (!hasSearchParams) {
            const totalResult = db.prepare(
                'SELECT COUNT(DISTINCT conversation_id) as total FROM turns'
            ).get();
            return res.json({
                conversations: [],
                pagination: { limit, offset, total: totalResult.total, returned: 0, hasMore: false, nextOffset: null }
            });
        }

        // Build WHERE and HAVING clauses for filtering
        let whereConditions = [];
        let havingConditions = [];
        let whereParams = [];
        let havingParams = [];

        if (conversationId) {
            whereConditions.push('conversation_id LIKE ?');
            whereParams.push(`%${conversationId}%`);
        }

        if (startDate) {
            havingConditions.push('MIN(timestamp) >= ?');
            havingParams.push(startDate.replace('T', ' '));
        }
        if (endDate) {
            havingConditions.push('MIN(timestamp) <= ?');
            havingParams.push(endDate.replace('T', ' '));
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';
        const havingClause = havingConditions.length > 0
            ? `HAVING ${havingConditions.join(' AND ')}`
            : '';

        // Get unique conversations with their metadata
        const conversations = db.prepare(`
            SELECT
                conversation_id,
                MIN(timestamp) as started_at,
                MAX(timestamp) as last_activity,
                COUNT(*) as turn_count,
                MAX(turn) as max_turn
            FROM turns
            ${whereClause}
            GROUP BY conversation_id
            ${havingClause}
            ORDER BY last_activity DESC
            LIMIT ? OFFSET ?
        `).all(...whereParams, ...havingParams, limit, offset);

        // Get total count for pagination with same filters
        const countResult = db.prepare(`
            SELECT COUNT(*) as total FROM (
                SELECT conversation_id
                FROM turns
                ${whereClause}
                GROUP BY conversation_id
                ${havingClause}
            )
        `).get(...whereParams, ...havingParams);

        const total = countResult.total;
        const hasMore = offset + conversations.length < total;

        res.json({
            conversations,
            pagination: {
                limit,
                offset,
                total,
                returned: conversations.length,
                hasMore,
                nextOffset: hasMore ? offset + limit : null
            }
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Helper: shape a form_submissions row for API responses.
function shapeFormSubmission(row) {
    let formData = {};
    try {
        formData = row.form_data ? JSON.parse(row.form_data) : {};
    } catch {
        formData = { _raw: row.form_data };
    }
    let metadata = null;
    if (row.metadata) {
        try {
            metadata = JSON.parse(row.metadata);
        } catch {
            metadata = { _raw: row.metadata };
        }
    }
    return {
        id: row.id,
        conversationId: row.conversation_id,
        formData,
        metadata,
        schemaFingerprint: row.schema_fingerprint,
        isComplete: row.is_complete === 1,
        submittedAt: row.submitted_at,
        webhookStatus: row.webhook_status,
        webhookError: row.webhook_error,
    };
}

// Helper: build WHERE clause + params from /api/forms query string.
function buildFormSubmissionsQuery(req) {
    const conditions = [];
    const params = [];

    if (req.query.conversationId) {
        conditions.push('conversation_id = ?');
        params.push(req.query.conversationId);
    }
    if (req.query.startDate) {
        conditions.push('submitted_at >= ?');
        params.push(String(req.query.startDate).replace('T', ' '));
    }
    if (req.query.endDate) {
        conditions.push('submitted_at <= ?');
        params.push(String(req.query.endDate).replace('T', ' '));
    }

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    if (limit > 1000) limit = 1000;

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params, limit };
}

// API: List form submissions (protected).
app.get('/api/forms', validateApiKey, (req, res) => {
    try {
        const { where, params, limit } = buildFormSubmissionsQuery(req);
        const rows = db.prepare(`
            SELECT * FROM form_submissions
            ${where}
            ORDER BY submitted_at DESC, id DESC
            LIMIT ?
        `).all(...params, limit);

        const total = db.prepare('SELECT COUNT(*) AS n FROM form_submissions').get().n;

        res.json({
            submissions: rows.map(shapeFormSubmission),
            count: rows.length,
            total,
        });
    } catch (error) {
        console.error('Error fetching form submissions:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// API: Export form submissions as CSV (protected).
// UTF-8 BOM is prepended for Excel compatibility with non-Latin field values.
app.get('/api/forms/export', validateApiKey, (req, res) => {
    try {
        const { where, params, limit } = buildFormSubmissionsQuery(req);
        const rows = db.prepare(`
            SELECT * FROM form_submissions
            ${where}
            ORDER BY submitted_at DESC, id DESC
            LIMIT ?
        `).all(...params, limit);

        const submissions = rows.map(shapeFormSubmission);

        // Stable column order: prefer formStructure field IDs, then any extra
        // keys that appear in the data (e.g. repeatable section indices).
        const orderedFieldIds = [];
        if (config?.config?.isForm && config.config.formStructure) {
            try {
                const formStructurePath = path.join(__dirname, config.config.formStructure);
                const formStructure = JSON.parse(fs.readFileSync(formStructurePath, 'utf-8'));
                for (const section of formStructure.sections || []) {
                    for (const f of section.fields || []) {
                        if (f.id) orderedFieldIds.push(f.id);
                    }
                    for (const f of section.prototype?.fields || []) {
                        if (f.id) orderedFieldIds.push(f.id);
                    }
                }
            } catch (err) {
                console.warn(`Could not read formStructure for CSV header: ${err.message}`);
            }
        }
        const seen = new Set(orderedFieldIds);
        for (const s of submissions) {
            for (const k of Object.keys(s.formData || {})) {
                if (!seen.has(k)) {
                    orderedFieldIds.push(k);
                    seen.add(k);
                }
            }
        }

        const metaCols = ['id', 'conversation_id', 'submitted_at', 'webhook_status', 'webhook_error', 'schema_fingerprint'];
        const headers = [...metaCols, ...orderedFieldIds];

        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '';
            let s = typeof val === 'object' ? JSON.stringify(val) : String(val);
            if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
                s = `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        const lines = [headers.map(escapeCsv).join(',')];
        for (const s of submissions) {
            const row = [
                s.id,
                s.conversationId,
                s.submittedAt,
                s.webhookStatus,
                s.webhookError,
                s.schemaFingerprint,
                ...orderedFieldIds.map((id) => s.formData?.[id]),
            ];
            lines.push(row.map(escapeCsv).join(','));
        }

        const filename = `form-submissions-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        // UTF-8 BOM so Excel renders CJK/Thai/Arabic field values correctly.
        res.write('\uFEFF');
        res.end(lines.join('\n'));
    } catch (error) {
        console.error('Error exporting form submissions:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// API: Fetch a single form submission by id (protected).
app.get('/api/forms/:id', validateApiKey, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: 'Invalid id' });
        }
        const row = db.prepare('SELECT * FROM form_submissions WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(shapeFormSubmission(row));
    } catch (error) {
        console.error('Error fetching form submission:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// API: Get application logs (protected)
app.get('/api/logs', validateApiKey, (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 200;

        // Return the most recent logs up to the requested limit
        const logs = logBuffer.slice(-lines);

        res.json({
            logs,
            totalAvailable: logBuffer.length,
            maxBufferSize: MAX_LOG_LINES
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// API: Get volume storage info and conversation stats (protected)
app.get('/api/storage', validateApiKey, (req, res) => {
    try {
        const dataPath = process.env.DOCKER_RUN === 'true' ? '/data' : './data';

        // Get volume disk usage
        let volume;
        try {
            const stats = fs.statfsSync(dataPath);
            const totalBytes = stats.bsize * stats.blocks;
            const availableBytes = stats.bsize * stats.bavail;
            const usedBytes = totalBytes - availableBytes;
            volume = {
                totalBytes,
                usedBytes,
                availableBytes,
                usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100 * 10) / 10 : 0
            };
        } catch {
            volume = null;
        }

        // Get SQLite database file size
        let database;
        try {
            const dbStats = fs.statSync(dbPath);
            database = { fileSizeBytes: dbStats.size };
        } catch {
            database = { fileSizeBytes: 0 };
        }

        // Get conversation and turn counts
        const conversationCount = db.prepare(
            'SELECT COUNT(DISTINCT conversation_id) as total FROM turns'
        ).get();
        const turnCount = db.prepare(
            'SELECT COUNT(*) as total FROM turns'
        ).get();

        res.json({
            volume,
            database,
            conversations: {
                totalConversations: conversationCount.total,
                totalTurns: turnCount.total
            },
            autoExtend: {
                thresholdPercent: 80,
                incrementGb: 1,
                limitGb: 10
            }
        });
    } catch (error) {
        console.error('Error fetching storage info:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

function getConversationHistory(conversationId, maxTurns = null) {
    // Skip handoff event rows — they have no user_prompt/llm_response and
    // would surface as empty exchanges in the LLM context window.
    const query = maxTurns
        ? 'SELECT turn, user_prompt, llm_response FROM turns WHERE conversation_id = ? AND event_type IS NULL ORDER BY turn ASC LIMIT ?'
        : 'SELECT turn, user_prompt, llm_response FROM turns WHERE conversation_id = ? AND event_type IS NULL ORDER BY turn ASC';

    const stmt = db.prepare(query);
    return maxTurns ? stmt.all(conversationId, maxTurns) : stmt.all(conversationId);
}

app.get('/context', async (req, res) => {
    // Load form structure if isForm is enabled
    const response = { ...config.config };
    if (config.config.isForm && config.config.formStructure) {
        const formStructurePath = path.join(__dirname, config.config.formStructure);
        response.formStructure = JSON.parse(fs.readFileSync(formStructurePath, 'utf-8'));
    }
    // Load calendar config if isCalendar is enabled
    if (config.config.isCalendar) {
        const calendarConfigPath = path.join(__dirname, 'config/calendarConfig.json');
        if (fs.existsSync(calendarConfigPath)) {
            response.calendarConfig = JSON.parse(fs.readFileSync(calendarConfigPath, 'utf-8')).calendarConfig;
        }
    }
    // Load triage routes if file exists (file holds the raw array — see /index loader).
    const triageRoutesPath = path.join(__dirname, 'config/triageRoutes.json');
    if (fs.existsSync(triageRoutesPath)) {
        response.triageRoutes = JSON.parse(fs.readFileSync(triageRoutesPath, 'utf-8'));
    }
    // Optical Read field list — same shape the / route ships as
    // __INITIAL_CONFIG__.opticalReadFields. Loaded once at boot.
    if (config.config.isOpticalRead && opticalReadFields) {
        response.opticalReadFields = opticalReadFields;
    }
    res.json(response);
})

// Widget embed endpoint - generates JavaScript to inject chat widget
app.get('/widget', (req, res) => {
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const baseUrl = `${protocol}://${req.get('host')}`;
    const botName = config.config.chatDisplayName || config.config.name || 'Chat';
    const isCalendar = config.config.isCalendar || false;

    // Generate widget script
    const widgetScript = generateWidgetScript(baseUrl, botName, { isCalendar });

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.send(widgetScript);
})

app.get('/metrics', async (req, res) => {
    try {
        // Update gauge metrics before serving
        const conversationCount = db.prepare(
            'SELECT COUNT(DISTINCT conversation_id) as total FROM turns'
        ).get();
        const turnCount = db.prepare(
            'SELECT COUNT(*) as total FROM turns'
        ).get();

        conversationsTotal.set(conversationCount.total);
        turnsTotal.set(turnCount.total);
        ragChunksLoaded.set(
            ragInstance?.documentChunks?.length || ragInstance?.chunks?.length || 0
        );
        botUp.set(llmClient && db ? 1 : 0);

        // Storage metrics
        const dataPath = process.env.DOCKER_RUN === 'true' ? '/data' : './data';
        try {
            const stats = fs.statfsSync(dataPath);
            const totalBytes = stats.bsize * stats.blocks;
            const availableBytes = stats.bsize * stats.bavail;
            storageTotalBytes.set(totalBytes);
            storageUsedBytes.set(totalBytes - availableBytes);
        } catch {
            // Storage stats unavailable
        }

        // Database file size
        try {
            const dbStats = fs.statSync(dbPath);
            databaseSizeBytes.set(dbStats.size);
        } catch {
            // DB stats unavailable
        }

        res.setHeader('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (error) {
        console.error('Error generating metrics:', error);
        res.status(500).end();
    }
});

app.get('/health', (req, res) => {
    const health = {
        status: 'ok',
        timestamp: Date.now(),
        rag: ragInstance?.isLoaded || false,
        ragChunks: ragInstance?.documentChunks?.length || ragInstance?.chunks?.length || 0,
        llm: !!llmClient,
        db: !!db
    };
    res.json(health);
});

// API: Proxy webhook requests to avoid CORS issues
// Called by client when formCompletionWebhook is configured
app.post('/api/send-webhook', async (req, res) => {
    try {
        const { webhookUrl, data } = req.body;

        if (!webhookUrl || !data) {
            return res.status(400).json({ error: 'webhookUrl and data are required' });
        }

        console.log(`Proxying webhook to: ${webhookUrl}`);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            console.log(`Webhook sent successfully: ${response.status}`);
            res.json({ success: true, status: response.status });
        } else {
            const errorText = await response.text();
            console.error(`Webhook failed: ${response.status} ${errorText}`);
            res.status(response.status).json({ error: `Webhook failed: ${response.status}`, details: errorText });
        }
    } catch (error) {
        console.error('Error proxying webhook:', error);
        res.status(500).json({ error: 'Failed to send webhook', details: error.message });
    }
});

// API: Capture completed form data locally; optionally relay to control plane.
// Called by client when form collection is complete (regardless of webhook config).
app.post('/api/submit-form', async (req, res) => {
    try {
        const { conversationId, formData, metadata } = req.body;

        if (!conversationId || !formData) {
            return res.status(400).json({ error: 'conversationId and formData are required' });
        }

        let webhookStatus = 'disabled';
        let webhookError = null;

        if (isFormSubmissionEnabled()) {
            const result = await sendFormHome(conversationId, formData, metadata || {});
            webhookStatus = result.success ? 'sent' : 'failed';
            webhookError = result.success ? null : (result.error || 'unknown error');
        }

        insertFormSubmission.run(
            conversationId,
            JSON.stringify(formData),
            formSchemaFingerprint,
            1,
            webhookStatus,
            webhookError,
            metadata ? JSON.stringify(metadata) : null
        );

        res.json({
            success: true,
            captured: true,
            webhook: webhookStatus,
        });
    } catch (error) {
        console.error('Error in /api/submit-form:', error);
        res.status(500).json({ error: 'Failed to submit form' });
    }
});

app.listen(PORT, async () => {
    // 1. Load config
    const configPath = path.join(__dirname, 'config/config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log(`Loaded config for: ${config.config.name}`);

    // 2. Initialize form submission (if enabled)
    initFormSubmission(config);

    // 2a. Compute form schema fingerprint for drift detection in form_submissions
    if (config.config.isForm && config.config.formStructure) {
        try {
            const formStructurePath = path.join(__dirname, config.config.formStructure);
            const formStructureRaw = fs.readFileSync(formStructurePath, 'utf-8');
            formSchemaFingerprint = crypto
                .createHash('sha256')
                .update(formStructureRaw)
                .digest('hex')
                .slice(0, 16);
            console.log(`Form schema fingerprint: ${formSchemaFingerprint}`);
        } catch (err) {
            console.warn(`Could not compute form schema fingerprint: ${err.message}`);
        }
    }

    // 3. Merge environment variables with config (only API keys from env)
    const llmConfig = {
        ...config,
        llm: {
            ...config.llm,
            openai: {
                ...config.llm.openai,
                apiKey: process.env.OPENAI_API_KEY || config.llm.openai?.apiKey
            },
            anthropic: {
                ...config.llm.anthropic,
                apiKey: process.env.ANTHROPIC_API_KEY || config.llm.anthropic?.apiKey
            }
        }
    };

    // 4. Initialize LLM client from merged config
    llmClient = createLLMClient(llmConfig);
    console.log(`LLM Provider: ${llmConfig.llm.provider}`);

    // 5. Cache instructions
    const instructionsPath = path.join(__dirname, config.config.instructions);
    cachedInstructions = fs.readFileSync(instructionsPath, "utf-8");
    console.log(`Cached instructions`);

    // 5a. Load Optical Read field list (if enabled). Like formFormat.json,
    //     this is read once at startup and held in memory; the /api/extract
    //     endpoint reads from this cached list every turn.
    if (config.config.isOpticalRead && config.config.opticalReadFields) {
        try {
            const opticalReadPath = path.join(__dirname, config.config.opticalReadFields);
            opticalReadFields = JSON.parse(fs.readFileSync(opticalReadPath, 'utf-8'));
            console.log(`Loaded ${opticalReadFields.length} optical read field(s)`);
        } catch (err) {
            console.warn(`Optical read fields could not be loaded: ${err.message}`);
            opticalReadFields = null;
        }
    }

    // 6. Initialize Vector RAG. Loads pre-baked embeddings and embeds queries
    //    in-process via the bundled multilingual-e5-small ONNX model. Bots
    //    with neither knowledge nor triage protocols ship no embeddings and
    //    run with RAG disabled — the LLM still has the protocol cartridges,
    //    just no retrieval-augmented context.
    const embeddingsRel = config.config.rag?.embeddingsPath || './config/embeddings.json';
    const embeddingsPath = path.join(__dirname, embeddingsRel);
    if (fs.existsSync(embeddingsPath)) {
        const VectorRAG = require('./helper/vector-rag');
        const { warmup } = require('./helper/embedder-local');
        ragInstance = new VectorRAG(embeddingsPath);
        try {
            await ragInstance.initialize();
            // Warm up the ONNX model so the first user query doesn't pay the
            // ~2s cold-start cost. Failures are non-fatal — queries will
            // retry the load on demand.
            warmup().catch((err) =>
                console.error('Embedding model warmup failed:', err.message)
            );
        } catch (error) {
            console.error('Vector RAG initialization failed:', error.message);
        }
    } else {
        console.log(`No embeddings at ${embeddingsPath}, RAG disabled`);
    }

    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database initialized: conversation.db`);
});

process.on('SIGINT', () => {
    db.close();
    process.exit(0);
});

