/**
 * LeadBlast - Backend Server
 * Express + Playwright automated form submission engine
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { parse as csvParse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { EventEmitter } from 'events';
import { campaignRunner } from './src/campaignRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check (required by Railway / Render / Fly.io) ────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date().toISOString() });
});

// Multer for CSV/XLSX upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// ── In-memory campaign state ────────────────────────────────
const campaigns = new Map();   // campaignId → { status, results, emitter, leads, config }
let campaignCounter = 0;

// ── Routes ──────────────────────────────────────────────────

/**
 * POST /api/upload
 * Upload CSV or XLSX, returns parsed rows + detected columns
 */
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    let rows = [];

    if (ext === '.csv') {
      rows = csvParse(req.file.buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    }

    if (!rows.length) return res.status(400).json({ error: 'File is empty or unreadable' });

    const columns = Object.keys(rows[0]);

    // Auto-detect common column mappings
    const autoMap = {};
    const patterns = {
      company: /company|business|org|organization|firm/i,
      website: /website|url|site|domain|web/i,
      contact: /contact|name|person|first|last/i,
      email:   /email|e-mail|mail/i,
      phone:   /phone|tel|mobile|cell/i,
    };
    for (const [field, re] of Object.entries(patterns)) {
      autoMap[field] = columns.find(c => re.test(c)) || null;
    }

    res.json({ rows, columns, autoMap, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/campaign/start
 * Kick off a campaign. Returns campaignId for SSE streaming.
 */
app.post('/api/campaign/start', async (req, res) => {
  const { leads, columnMap, senderDetails, messageTemplate, concurrency = 2 } = req.body;

  if (!leads?.length)  return res.status(400).json({ error: 'No leads provided' });
  if (!columnMap?.website) return res.status(400).json({ error: 'Website column mapping required' });
  if (!senderDetails?.email) return res.status(400).json({ error: 'Sender email required' });

  const id = `campaign_${++campaignCounter}_${Date.now()}`;
  const emitter = new EventEmitter();

  campaigns.set(id, {
    id,
    status: 'running',
    results: [],
    emitter,
    leads,
    config: { columnMap, senderDetails, messageTemplate, concurrency },
    startedAt: new Date().toISOString(),
    stoppedAt: null,
  });

  res.json({ campaignId: id, total: leads.length });

  // Run asynchronously
  campaignRunner(id, campaigns, emitter).catch(err => {
    emitter.emit('log', { type: 'error', message: 'Fatal error: ' + err.message });
    emitter.emit('done', { error: err.message });
  });
});

/**
 * GET /api/campaign/:id/stream
 * Server-Sent Events stream for real-time progress
 */
app.get('/api/campaign/:id/stream', (req, res) => {
  const campaign = campaigns.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Replay already-stored results for late connections
  campaign.results.forEach(r => send('result', r));

  const onLog    = data => send('log', data);
  const onResult = data => send('result', data);
  const onDone   = data => { send('done', data); res.end(); };

  campaign.emitter.on('log', onLog);
  campaign.emitter.on('result', onResult);
  campaign.emitter.on('done', onDone);

  req.on('close', () => {
    campaign.emitter.off('log', onLog);
    campaign.emitter.off('result', onResult);
    campaign.emitter.off('done', onDone);
  });
});

/**
 * POST /api/campaign/:id/stop
 */
app.post('/api/campaign/:id/stop', (req, res) => {
  const campaign = campaigns.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  campaign.stopRequested = true;
  campaign.status = 'stopped';
  res.json({ ok: true });
});

/**
 * GET /api/campaign/:id/report
 * Full report JSON for download/export
 */
app.get('/api/campaign/:id/report', (req, res) => {
  const campaign = campaigns.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });

  const results = campaign.results;
  const success = results.filter(r => r.status === 'success');
  const failed  = results.filter(r => r.status === 'failed');
  const noform  = results.filter(r => r.status === 'noform');

  res.json({
    campaignId: campaign.id,
    startedAt:  campaign.startedAt,
    finishedAt: campaign.finishedAt || null,
    summary: {
      total:      results.length,
      success:    success.length,
      failed:     failed.length,
      noform:     noform.length,
      successRate: results.length ? Math.round(success.length / results.length * 100) + '%' : '0%',
    },
    results,
  });
});

/**
 * GET /api/campaign/:id/report/csv
 * Download report as CSV
 */
app.get('/api/campaign/:id/report/csv', (req, res) => {
  const campaign = campaigns.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });

  const rows = campaign.results.map(r => ({
    Company:        r.company,
    Website:        r.url,
    Status:         r.status,
    Note:           r.note,
    'Fields Found': (r.fieldsFound || []).join(' | '),
    'Time Taken':   r.duration ? r.duration + 'ms' : '',
    Timestamp:      r.timestamp,
  }));

  const ws  = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="leadblast_report_${campaign.id}.csv"`);
  res.send(csv);
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 LeadBlast server running at http://localhost:${PORT}`);
  console.log(`   Frontend UI: http://localhost:${PORT}`);
  console.log(`   API base:    http://localhost:${PORT}/api\n`);
});
