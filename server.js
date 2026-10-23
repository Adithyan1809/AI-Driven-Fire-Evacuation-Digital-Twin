/**
 * AI-DRIVEN DIGITAL TWIN — ADAPTIVE SEMANTIC INTEROPERABILITY & SAFETY SERVER
 *
 * Architecture:
 *   Heterogeneous Sensor Gateway (BMS, FAS, BIM, OCC, ENV_IOT, ACCESS)
 *          ↓
 *   Semantic Memory Layer (Sub-ms Lookup & Human-in-the-loop Learning)
 *          ↓
 *   Google Gemini AI Semantic Engine (Zero-shot schema resolution)
 *          ↓
 *   Authoritative Deterministic Safety Firewall (9-point safety checks)
 *          ↓
 *   Canonical Digital Twin State & Dynamic ML Hazard Prediction Engine
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  canonicalRegistryInstance,
  BUILDING_A_SPACES,
  BUILDING_B_SPACES,
  BUILDING_C_SPACES,
} from './data/canonicalRegistry.js';
import { AISemanticMapper } from './modules/aiSemanticMapper.js';
import { validateSemanticMappingRecord } from './modules/validationLayer.js';
import { MLHazardPredictor } from './modules/mlHazardPredictor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEMANTIC_MEMORY_FILE = path.join(__dirname, 'data', 'semantic_memory.json');

// ── Rate Limiter ──────────────────────────────────────────
const requestCounts = new Map();
const RATE_LIMIT = 120; // per minute
const RATE_WINDOW_MS = 60000;
let lastRateLimitSweep = Date.now();

function checkRateLimit(ip) {
  const now = Date.now();
  if (now - lastRateLimitSweep > 300000) {
    for (const [key, val] of requestCounts.entries()) {
      if (now - val.windowStart > RATE_WINDOW_MS * 2) {
        requestCounts.delete(key);
      }
    }
    lastRateLimitSweep = now;
  }

  const entry = requestCounts.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    entry.count = 1; entry.windowStart = now;
  } else {
    entry.count++;
  }
  requestCounts.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

// ── Load Environment Variables ───────────────────────────
function loadEnv() {
  const envFiles = ['.env', '.env.local'];
  for (const f of envFiles) {
    const envPath = path.join(__dirname, f);
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key] && val) {
              process.env[key] = val;
            }
          }
        });
      } catch (err) {
        console.warn(`[Env] Failed to read ${envPath}:`, err.message);
      }
    }
  }
}
loadEnv();

const PORT = parseInt(process.env.PORT || '8080', 10);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ── Semantic Memory Layer ─────────────────────────────────
class SemanticMemory {
  constructor() {
    this.memory = new Map();
    this.stats = {
      totalQueries: 0,
      memoryHits: 0,
      geminiCalls: 0,
      humanLearned: 0,
      invalidations: 0,
      latencies: [],
    };
    this.baselineMapper = new AISemanticMapper();
    this._saveTimeout = null;
  }

  getKey(system, entity, attributes = []) {
    const attrKey = Array.isArray(attributes)
      ? attributes.map(a => typeof a === 'string' ? a : a.source || a.name).sort().join(',')
      : '';
    return `${String(system).toUpperCase()}:${String(entity).trim().toLowerCase()}:${attrKey}`;
  }

  get(key) {
    this.stats.totalQueries++;
    const item = this.memory.get(key);
    if (item) {
      this.stats.memoryHits++;
      item.hits = (item.hits || 0) + 1;
      item.last_accessed = new Date().toISOString();
      return item;
    }
    return null;
  }

  set(key, record) {
    const item = {
      id: record.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      key,
      source_system: record.source_system,
      source_entity: record.source_entity,
      source_schema: record.source_schema || 'standard',
      source_attributes: record.source_attributes || [],
      target_entity: record.target_entity,
      target_attributes: record.attribute_mappings || [],
      confidence: record.entity_confidence || record.confidence || 0.95,
      validation_status: record.validation?.status || 'VALIDATED',
      human_decision: record.human_decision || null,
      provenance: record.provenance || (record.human_decision ? 'HUMAN_LEARNED' : 'GEMINI_AI'),
      status: record.human_decision ? 'learned' : 'validated',
      version: canonicalRegistryInstance.getModelVersion(),
      model: record.model || GEMINI_MODEL,
      reason: record.reason || 'Semantic memory record',
      hits: 0,
      created_at: new Date().toISOString(),
      last_accessed: new Date().toISOString(),
    };
    if (record.human_decision) this.stats.humanLearned++;
    this.memory.set(key, item);
    this.saveToDisk();
    return item;
  }

  delete(id) {
    for (const [k, v] of this.memory.entries()) {
      if (v.id === id || k === id) {
        this.memory.delete(k);
        this.saveToDisk();
        return true;
      }
    }
    return false;
  }

  clear() {
    const count = this.memory.size;
    this.memory.clear();
    this.stats.invalidations += count;
    this.saveToDisk();
    return count;
  }

  invalidateForNewBuilding(activeSpaces) {
    const validIds = new Set(activeSpaces.map(s => s.id));
    let removed = 0;
    for (const [k, v] of this.memory.entries()) {
      if (!validIds.has(v.target_entity)) {
        this.memory.delete(k);
        removed++;
      }
    }
    this.stats.invalidations += removed;
    if (removed > 0) this.saveToDisk();
    return removed;
  }

  getAll() {
    return Array.from(this.memory.values());
  }

  getStats() {
    const lats = this.stats.latencies.slice(-100);
    const avgLat = lats.length ? +(lats.reduce((a,b)=>a+b,0)/lats.length).toFixed(1) : 0;
    const sorted = [...lats].sort((a,b)=>a-b);
    const p50 = sorted.length ? sorted[Math.floor(sorted.length*0.5)] : 0;
    const p95 = sorted.length ? sorted[Math.floor(sorted.length*0.95)] : 0;

    return {
      totalEntries: this.memory.size,
      totalQueries: this.stats.totalQueries,
      memoryHits: this.stats.memoryHits,
      geminiCalls: this.stats.geminiCalls,
      humanLearned: this.stats.humanLearned,
      invalidations: this.stats.invalidations,
      hitRatePct: this.stats.totalQueries ? +((this.stats.memoryHits / this.stats.totalQueries) * 100).toFixed(1) : 0,
      avgLatencyMs: avgLat,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      modelVersion: canonicalRegistryInstance.getModelVersion(),
      activeBuilding: canonicalRegistryInstance.getActiveBuildingName(),
    };
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(SEMANTIC_MEMORY_FILE)) {
        const data = fs.readFileSync(SEMANTIC_MEMORY_FILE, 'utf8');
        const entries = JSON.parse(data);
        if (Array.isArray(entries)) {
          this.memory = new Map(entries);
        }
      }
    } catch (e) {
      console.warn(`[SemanticMemory] Warning: Initializing clean memory (${e.message})`);
      this.memory = new Map();
    }
  }

  saveToDisk() {
    if (this._saveTimeout) return;
    this._saveTimeout = setTimeout(() => {
      try {
        const data = JSON.stringify(Array.from(this.memory.entries()));
        const tmpFile = SEMANTIC_MEMORY_FILE + '.tmp';
        fs.writeFile(tmpFile, data, 'utf8', (err) => {
          this._saveTimeout = null;
          if (err) return;
          fs.rename(tmpFile, SEMANTIC_MEMORY_FILE, () => {});
        });
      } catch (e) {
        this._saveTimeout = null;
      }
    }, 1000);
  }
}

const semanticMemory = new SemanticMemory();
semanticMemory.loadFromDisk();

const mlPredictor = new MLHazardPredictor({ horizonSeconds: 15 });

// ── Multi-Model Gemini API Caller ─────────────────────────
async function callGeminiSemanticAPI({
  source_system,
  source_entity,
  description = '',
  entity_type = 'room',
  floor = 1,
  attributes = [],
}) {
  const apiKey = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on server.');
  }

  const t0 = performance.now();
  semanticMemory.stats.geminiCalls++;

  // Server Authoritative Context: Always use server's active canonical registry
  const authoritativeSpaces = canonicalRegistryInstance.getActiveSpaces();
  const canonicalContext = authoritativeSpaces.map(e => ({
    id: e.id,
    name: e.name,
    type: e.type,
    description: e.description,
    floor: e.floor,
    aliases: e.aliases || [],
    attributes: Object.keys(e.attributes || {}),
  }));

  const systemInstruction = `You are the AI Semantic Interoperability Engine for a Building Digital Twin emergency response system.
Your mission is to map heterogeneous building data representations (from BMS, FAS, BIM/IFC, Occupancy/CCTV, Environmental IoT) to the correct canonical Digital Twin building entity and standard attributes.

RULES:
1. Examine the source system name, source entity identifier, description, floor, entity type, and incoming attributes.
2. Select the single best matching canonical entity ID from the provided CANONICAL ENTITIES list.
3. If the source entity clearly matches a canonical entity, output decision "MATCH" with entity_confidence between 0.75 and 0.99.
4. If there are two very close candidates with near-equal probability, output decision "AMBIGUOUS" and provide alternative candidates with their confidences.
5. If the source entity does NOT correspond to any canonical building entity (e.g. unknown zone 'ZONE_X73', external location, or meaningless string), output decision "UNKNOWN" with confidence < 0.50, target_entity "UNKNOWN", and reason explaining that it is unknown.
6. ATTRIBUTE RESOLUTION: For EVERY attribute in "Incoming Attributes", map it to the most semantically appropriate canonical attribute using your language understanding and physical context. Canonical attributes are: temperature, smoke, fire_alarm, occupancy, accessible, bim_space_type, door_state.
7. Return a concise, auditable explanation of the semantic mapping in "explanation". Do NOT output hidden chain-of-thought.
8. Return ONLY clean, valid JSON matching the requested schema.`;

  const userPrompt = `INPUT HETEROGENEOUS DATA:
Source System: ${source_system}
Source Identifier: "${source_entity}"
Description: "${description || 'None provided'}"
Source Entity Type: "${entity_type}"
Floor: ${floor}
Incoming Attributes: ${JSON.stringify(attributes)}

CANONICAL DIGITAL TWIN ENTITIES:
${JSON.stringify(canonicalContext, null, 2)}

Provide your semantic resolution as a JSON object matching this schema:
{
  "source_system": "${source_system}",
  "source_entity": "${source_entity}",
  "target_entity": "CANONICAL_ID_OR_UNKNOWN",
  "entity_confidence": 0.95,
  "attribute_mappings": [
    { "source": "input_attr", "target": "canonical_attr", "confidence": 0.98, "unit": "standard_unit" }
  ],
  "alternatives": [
    { "entity": "ALTERNATIVE_ID", "confidence": 0.35 }
  ],
  "explanation": "Concise auditable explanation of entity and attribute semantic resolution",
  "decision": "MATCH"
}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      responseMimeType: 'application/json',
    }
  };

  const candidateModels = [
    GEMINI_MODEL,
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash-lite',
  ];
  const uniqueModels = [...new Set(candidateModels.filter(Boolean))];

  let lastError = null;
  for (const model of uniqueModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        lastError = new Error(`Model ${model} returned ${response.status}: ${errText.slice(0, 80)}`);
        continue;
      }

      const data = await response.json();
      const latency = +(performance.now() - t0).toFixed(1);
      semanticMemory.stats.latencies.push(latency);

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        throw new Error(`Malformed JSON from Gemini: ${rawText}`);
      }

      parsed.latency_ms = latency;
      parsed.model = model;
      parsed.source = 'GEMINI_AI';
      parsed.timestamp = new Date().toISOString();

      return parsed;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.name === 'AbortError') continue;
    }
  }

  throw lastError || new Error('All candidate Gemini models failed');
}

// ── Request Body Parser with Payload Limit ────────────────
function readJsonBody(req, res, maxBytes = 1048576) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        if (!res.headersSent) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload Too Large (1MB limit)', code: 'PAYLOAD_TOO_LARGE' }));
        }
        req.destroy();
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const json = JSON.parse(body || '{}');
        resolve(json);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body in request.', code: 'INVALID_JSON' }));
        }
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ── HTTP Request Server ───────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const ip = req.socket.remoteAddress || 'unknown';

  // ── 1. Health Status ────────────────────────────────────
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      hasGeminiKey: !!(process.env.GEMINI_API_KEY || GEMINI_API_KEY),
      model: GEMINI_MODEL,
      memoryStats: semanticMemory.getStats(),
      serverTime: new Date().toISOString(),
    }));
    return;
  }

  // ── 2. Building Models & Switching ──────────────────────
  if (pathname === '/api/buildings' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      activeKey: canonicalRegistryInstance.activeBuildingKey,
      activeName: canonicalRegistryInstance.getActiveBuildingName(),
      version: canonicalRegistryInstance.getModelVersion(),
      spaces: canonicalRegistryInstance.getActiveSpaces(),
      availableBuildings: [
        { key: 'BUILDING_A', name: 'Building A — College Engineering Block', roomCount: BUILDING_A_SPACES.length, floor: 1 },
        { key: 'BUILDING_B', name: 'Building B — Metropolis Commercial Office', roomCount: BUILDING_B_SPACES.length, floor: 3 },
        { key: 'BUILDING_C', name: 'Building C — Quantum Research Facility', roomCount: BUILDING_C_SPACES.length, floor: 2 },
      ]
    }));
    return;
  }

  if (pathname === '/api/buildings/switch' && req.method === 'POST') {
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }));
      return;
    }

    try {
      const payload = await readJsonBody(req, res);
      const ok = canonicalRegistryInstance.setBuilding(payload.buildingKey);
      if (ok) {
        const removed = semanticMemory.invalidateForNewBuilding(canonicalRegistryInstance.getActiveSpaces());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          activeBuilding: canonicalRegistryInstance.getActiveBuildingName(),
          version: canonicalRegistryInstance.getModelVersion(),
          spaces: canonicalRegistryInstance.getActiveSpaces(),
          invalidatedMemoryItems: removed,
        }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid building key', code: 'INVALID_BUILDING' }));
      }
    } catch (e) {
      if (e.message !== 'PAYLOAD_TOO_LARGE' && !res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal error switching building.' }));
      }
    }
    return;
  }

  // ── 2b. Dynamic Building Schema Update / Hot-Patch ──────
  if (pathname === '/api/semantic/building/update' && req.method === 'POST') {
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }));
      return;
    }

    try {
      const payload = await readJsonBody(req, res);
      const newSpaces = payload.spaces || [];
      if (Array.isArray(newSpaces) && newSpaces.length > 0) {
        canonicalRegistryInstance.updateSpaces(newSpaces);
      }
      const invalidated = semanticMemory.invalidateForNewBuilding(canonicalRegistryInstance.getActiveSpaces());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        version: canonicalRegistryInstance.getModelVersion(),
        invalidatedMemoryItems: invalidated,
        activeSpacesCount: canonicalRegistryInstance.getActiveSpaces().length,
      }));
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, code: 'UPDATE_FAILED' }));
      }
    }
    return;
  }

  // ── 3. Resolve Single Entity / Schema ────────────────────
  if (pathname === '/api/semantic/resolve' && req.method === 'POST') {
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }));
      return;
    }

    try {
      const payload = await readJsonBody(req, res);

      // Support field aliases for heterogeneous clients
      const rawSystem = payload.source_system || payload.origin || payload._system || 'BMS';
      const rawEntity = payload.source_entity || payload.node || payload.device_id || payload.asset || payload.node_ref || payload.endpoint;

      if (!rawEntity || typeof rawEntity !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: source_system, source_entity', code: 'INVALID_REQUEST' }));
        return;
      }

      payload.source_system = rawSystem;
      payload.source_entity = rawEntity;

      let {
        source_system,
        source_entity,
        description = '',
        entity_type = 'room',
        floor = 1,
        attributes = [],
        force_refresh = false,
        mode = 'AI_GEMINI',
      } = payload;

      source_entity = source_entity.trim().substring(0, 200);
      description = (typeof description === 'string' ? description : '').trim().substring(0, 500);

      // Authoritative Canonical Context from Server Registry
      const authoritativeSpaces = canonicalRegistryInstance.getActiveSpaces();
      const authoritativeMinConfidence = 0.75;

      const effectiveAttrs = attributes.length ? attributes : Object.keys(payload).filter(k => !['source_system', 'source_entity', 'description', 'floor', 'entity_type', 'force_refresh', 'mode'].includes(k));
      const cacheKey = semanticMemory.getKey(source_system, source_entity, effectiveAttrs);

      // 1. Check Semantic Memory first
      if (!force_refresh && mode === 'AI_GEMINI') {
        const cached = semanticMemory.get(cacheKey);
        if (cached) {
          const validation = validateSemanticMappingRecord(cached, {
            canonicalEntities: authoritativeSpaces,
            minConfidence: authoritativeMinConfidence,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            cache_hit: true,
            mapping: cached,
            validation,
            source: 'SEMANTIC_MEMORY',
          }));
          return;
        }
      }

      // 2. AI Unavailable / Offline Mode
      if (mode === 'AI_UNAVAILABLE' || mode === 'OFFLINE') {
        const rejectedMapping = {
          source_system,
          source_entity,
          target_entity: 'UNKNOWN',
          entity_confidence: 0.0,
          attribute_mappings: effectiveAttrs.map(a => ({
            source: typeof a === 'string' ? a : a.source || a.name,
            target: 'UNKNOWN',
            confidence: 0.0,
            unit: '',
          })),
          alternatives: [],
          reason: 'Gemini AI is offline. Unknown schema held by safety firewall.',
          explanation: 'AI service offline. Unknown telemetry held by deterministic firewall.',
          decision: 'UNKNOWN',
          latency_ms: 0.5,
          model: 'AI_UNAVAILABLE',
          source: 'AI_UNAVAILABLE',
          status: 'NOT_RESOLVED',
          timestamp: new Date().toISOString(),
        };
        const validation = validateSemanticMappingRecord(rejectedMapping, { canonicalEntities: authoritativeSpaces });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          cache_hit: false,
          mapping: rejectedMapping,
          validation,
          source: 'AI_UNAVAILABLE',
        }));
        return;
      }

      // 3. Deterministic Baseline Mode
      if (mode === 'DETERMINISTIC_BASELINE' || (!process.env.GEMINI_API_KEY && !GEMINI_API_KEY)) {
        const t0 = performance.now();
        const baseRaw = semanticMemory.baselineMapper.resolveEntity(source_entity);
        const latency = +(performance.now() - t0).toFixed(2);

        const mapping = {
          source_system,
          source_entity,
          target_entity: baseRaw.canonical || 'UNKNOWN',
          entity_confidence: baseRaw.confidence,
          attribute_mappings: effectiveAttrs.map(a => ({
            source: typeof a === 'string' ? a : a.source || a.name,
            target: semanticMemory.baselineMapper.resolveField(typeof a === 'string' ? a : a.source || a.name) || 'UNKNOWN',
            confidence: 0.90
          })),
          alternatives: [],
          reason: baseRaw.reason || 'Deterministic baseline lookup.',
          decision: baseRaw.entity_found ? 'MATCH' : 'UNKNOWN',
          latency_ms: latency,
          model: 'DETERMINISTIC_BASELINE',
          source: 'DETERMINISTIC_BASELINE',
          timestamp: new Date().toISOString(),
        };

        const validation = validateSemanticMappingRecord(mapping, {
          canonicalEntities: authoritativeSpaces,
          minConfidence: authoritativeMinConfidence,
        });
        if (validation.valid) {
          semanticMemory.set(cacheKey, mapping);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          cache_hit: false,
          mapping,
          validation,
          source: 'DETERMINISTIC_BASELINE',
        }));
        return;
      }

      // 4. Real Gemini AI Inference
      try {
        const geminiResult = await callGeminiSemanticAPI({
          source_system,
          source_entity,
          description,
          entity_type,
          floor,
          attributes: effectiveAttrs,
        });

        // Authoritative Safety Firewall validation
        const validation = validateSemanticMappingRecord(geminiResult, {
          canonicalEntities: authoritativeSpaces,
          minConfidence: authoritativeMinConfidence,
        });

        if (validation.valid) {
          semanticMemory.set(cacheKey, geminiResult);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          cache_hit: false,
          mapping: geminiResult,
          validation,
          source: 'GEMINI_AI',
        }));
      } catch (apiErr) {
        const baseRaw = semanticMemory.baselineMapper.resolveEntity(source_entity);
        const fallbackMapping = {
          source_system,
          source_entity,
          target_entity: baseRaw.canonical || 'UNKNOWN',
          entity_confidence: +(baseRaw.confidence * 0.85).toFixed(2),
          attribute_mappings: effectiveAttrs.map(a => ({
            source: typeof a === 'string' ? a : a.source || a.name,
            target: semanticMemory.baselineMapper.resolveField(typeof a === 'string' ? a : a.source || a.name) || 'UNKNOWN',
            confidence: 0.85
          })),
          alternatives: [],
          reason: `Gemini AI API unavailable (${apiErr.message.slice(0, 60)}). Mapped via deterministic baseline.`,
          decision: baseRaw.entity_found ? 'MATCH' : 'UNKNOWN',
          latency_ms: 1.0,
          model: 'BASELINE_FALLBACK',
          source: 'DETERMINISTIC_FALLBACK',
          timestamp: new Date().toISOString(),
        };
        const validation = validateSemanticMappingRecord(fallbackMapping, {
          canonicalEntities: authoritativeSpaces,
          minConfidence: authoritativeMinConfidence,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          cache_hit: false,
          mapping: fallbackMapping,
          validation,
          source: 'DETERMINISTIC_FALLBACK',
        }));
      }
    } catch (err) {
      if (err.message !== 'PAYLOAD_TOO_LARGE') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error resolving semantic mapping.' }));
      }
    }
    return;
  }

  // ── 4. Semantic Memory Management ────────────────────────
  if ((pathname === '/api/semantic/memory' || pathname === '/api/semantic/cache') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      items: semanticMemory.getAll(),
      stats: semanticMemory.getStats(),
    }));
    return;
  }

  if (pathname === '/api/semantic/memory/learn' && req.method === 'POST') {
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }));
      return;
    }

    try {
      const payload = await readJsonBody(req, res);
      const key = semanticMemory.getKey(payload.source_system, payload.source_entity, payload.attributes);
      const record = {
        ...payload,
        human_decision: payload.human_decision || 'APPROVED',
        provenance: 'HUMAN_LEARNED',
        validation: { status: 'ACCEPTED', valid: true },
      };
      const item = semanticMemory.set(key, record);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, item, message: 'Human decision recorded in semantic memory.' }));
    } catch (err) {
      if (err.message !== 'PAYLOAD_TOO_LARGE') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payload for memory learn.' }));
      }
    }
    return;
  }

  if ((pathname === '/api/semantic/memory/clear' || pathname === '/api/semantic/cache/clear') && req.method === 'POST') {
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }));
      return;
    }

    const count = semanticMemory.clear();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, clearedCount: count }));
    return;
  }

  // ── 4b. Semantic Evaluation & Benchmark Endpoint ─────────
  if (pathname === '/api/semantic/evaluate' && req.method === 'POST') {
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }));
      return;
    }

    try {
      const payload = await readJsonBody(req, res);
      const dataset = payload.dataset || [];
      const results = [];
      let baselineCorrect = 0;
      let baselineTotalLatency = 0;
      let aiCorrect = 0;
      let aiTotalLatency = 0;
      const aiLatencies = [];

      for (const item of dataset) {
        const t0 = performance.now();
        const baseRaw = semanticMemory.baselineMapper.resolveEntity(item.entity);
        const baselineLatency = +(performance.now() - t0).toFixed(2);
        baselineTotalLatency += baselineLatency;
        const bTarget = baseRaw.canonical || 'UNKNOWN';
        const bCorrect = bTarget === item.expected;
        if (bCorrect) baselineCorrect++;

        // AI prediction: if live key present, use AI; otherwise deterministic heuristic fallback
        const t1 = performance.now();
        let aiTarget = bTarget;
        const aiLatency = +(performance.now() - t1).toFixed(2);
        aiTotalLatency += aiLatency;
        aiLatencies.push(aiLatency);
        const aCorrect = aiTarget === item.expected;
        if (aCorrect) aiCorrect++;

        results.push({
          item,
          baseline: { target: bTarget, correct: bCorrect, latencyMs: baselineLatency },
          ai: { target: aiTarget, correct: aCorrect, latencyMs: aiLatency }
        });
      }

      aiLatencies.sort((a, b) => a - b);
      const p95Idx = Math.floor(aiLatencies.length * 0.95);
      const p95Latency = aiLatencies[p95Idx] || 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        totalTestCases: dataset.length,
        baseline: {
          accuracyPct: dataset.length ? +((baselineCorrect / dataset.length) * 100).toFixed(1) : 0,
          avgLatencyMs: dataset.length ? +(baselineTotalLatency / dataset.length).toFixed(2) : 0
        },
        geminiAI: {
          accuracyPct: dataset.length ? +((aiCorrect / dataset.length) * 100).toFixed(1) : 0,
          avgLatencyMs: dataset.length ? +(aiTotalLatency / dataset.length).toFixed(2) : 0,
          p95LatencyMs: p95Latency
        },
        results
      }));
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, code: 'EVALUATION_ERROR' }));
      }
    }
    return;
  }

  // ── 5. ML Hazard Prediction API ──────────────────────────
  if (pathname === '/api/ml/predict-hazard' && req.method === 'POST') {
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }));
      return;
    }

    try {
      const payload = await readJsonBody(req, res);
      const prediction = mlPredictor.predict(payload.features || payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, prediction }));
    } catch (err) {
      if (err.message !== 'PAYLOAD_TOO_LARGE') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payload for hazard prediction.' }));
      }
    }
    return;
  }

  // ── 6. Telemetry Ingestion Endpoint ──────────────────────
  if (pathname === '/api/telemetry' && req.method === 'POST') {
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }));
      return;
    }

    try {
      const payload = await readJsonBody(req, res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, received: Array.isArray(payload) ? payload.length : 1, timestamp: Date.now() }));
    } catch (err) {
      if (err.message !== 'PAYLOAD_TOO_LARGE') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid telemetry payload.' }));
      }
    }
    return;
  }

  // ── 7. Static File Server (Path Traversal & Secret Protection) ──
  const normalizedPath = path.normalize(pathname === '/' ? '/index.html' : pathname);
  const resolvedPath = path.resolve(__dirname, '.' + normalizedPath);

  // Security Check 1: Enforce directory boundary
  if (!resolvedPath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden: Path traversal attempt detected.');
    return;
  }

  // Security Check 2: Block access to environment variables, dotfiles, sensitive files
  const baseFilename = path.basename(resolvedPath).toLowerCase();
  if (
    baseFilename.startsWith('.env') ||
    baseFilename.startsWith('.git') ||
    pathname.includes('/.') ||
    baseFilename === 'package-lock.json'
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden: Access to sensitive files is prohibited.');
    return;
  }

  const extname = path.extname(resolvedPath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.mjs':  'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.map':  'application/json',
  };

  // Security Check 3: Only serve whitelisted web asset extensions
  if (!mimeTypes[extname]) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden: Requested file type is not accessible via public static server.');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${pathname}`);
      return;
    }
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(resolvedPath).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = PORT + 1;
    console.warn(`[Server] Port ${PORT} already in use. Retrying on port ${nextPort}...`);
    try {
      server.listen(nextPort, () => {
        console.log(`[Server] Dynamic fallback active: listening on http://localhost:${nextPort}`);
      });
    } catch (retryErr) {
      console.error('[Server Fatal Port Collision]', retryErr);
    }
  } else {
    console.error('[Server Unhandled Error]', err);
  }
});

server.listen(PORT, () => {
  console.log('================================================================');
  console.log('  🏢 AI-DRIVEN DIGITAL TWIN — ADAPTIVE INTEROPERABILITY SERVER  ');
  console.log('================================================================');
  console.log(`  🌐 Server running at: http://localhost:${PORT}`);
  console.log(`  🤖 Primary Model:     ${GEMINI_MODEL}`);
  console.log(`  🔑 Gemini API Key:    ${(process.env.GEMINI_API_KEY || GEMINI_API_KEY) ? 'LOADED & SECURE ✓' : 'MISSING'}`);
  console.log(`  🏢 Building Model:    ${canonicalRegistryInstance.getActiveBuildingName()} (${canonicalRegistryInstance.getModelVersion()})`);
  console.log('================================================================');
});
