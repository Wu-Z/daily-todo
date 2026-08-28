/**
 * daily-todo 后端 API 服务（单用户免登录，Token 鉴权）
 *
 * 功能：
 *   - GET  /api/health            健康检查
 *   - GET  /api/state             拉取云端数据（需要 Token）
 *   - PUT  /api/state             保存云端数据（需要 Token）
 *   - GET  /api/push/keys         返回 VAPID 公钥（前端订阅推送用）
 *   - POST /api/push/subscribe    保存浏览器推送订阅
 *   - POST /api/sync              同步未来提醒计划（定时推送用）
 *   - POST /api/unsubscribe       清除订阅与计划
 *
 * 数据持久化：DATA_FILE（JSON，原子写入）；重启不丢数据。
 * 定时推送：每 60 秒检查一次提醒计划，到点（含提前量）通过 Web Push 推送。
 *
 * 环境变量（见 .env.example）：
 *   PORT, TOKEN, DATA_FILE, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_ENABLED
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

/* ---------- 配置：优先环境变量，其次 ./config.json ---------- */
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(__dirname, 'config.json');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { /* 无配置文件则用默认值 */ }

const PORT = process.env.PORT || cfg.port || 8787;
const TOKEN = process.env.TOKEN || cfg.token || 'change-me';
const DATA_FILE = process.env.DATA_FILE || cfg.dataFile || path.join(__dirname, 'data.json');
const PUSH_ENABLED = process.env.PUSH_ENABLED !== undefined ? process.env.PUSH_ENABLED !== 'false' : (cfg.pushEnabled !== false);
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || cfg.vapidPublicKey || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || cfg.vapidPrivateKey || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || cfg.vapidSubject || 'mailto:you@example.com';

if (PUSH_ENABLED && (!VAPID_PUBLIC || !VAPID_PRIVATE)) {
  console.error('推送已启用但缺少 VAPID 密钥：请运行 `npm run keys` 并配置环境变量（或设 PUSH_ENABLED=false 关闭推送）');
  process.exit(1);
}
if (PUSH_ENABLED) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

/* ---------- 数据存取（JSON 文件，原子写入） ---------- */
let state = { items: [], days: {} };
function load() {
  try { state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { state = { items: [], days: {} }; }
}
function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DATA_FILE);
}
load();

/* ---------- 推送订阅与提醒计划（内存，重启后 App 会自动重新同步） ---------- */
let subscription = null;
let reminders = [];           // [{id,text,time,timeMin,leadMin,quad,date,sent}]

/* ---------- 工具 ---------- */
function bodyParser(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
function authOk(req) {
  const h = req.headers['authorization'] || '';
  const q = (req.url.split('?')[1] || '').match(/token=([^&]+)/);
  const t = h.startsWith('Bearer ') ? h.slice(7) : (q ? q[1] : '');
  if (!t) return false;
  const a = Buffer.from(String(TOKEN)), b = Buffer.from(String(t));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
function nowMin() { return Date.now() / 60000; }

/* ---------- 推送 ---------- */
async function sendPush(payload) {
  if (!PUSH_ENABLED || !subscription) return;
  try { await webpush.sendNotification(subscription, JSON.stringify(payload)); }
  catch (e) {
    console.error('推送失败（订阅可能失效）:', e.message);
    subscription = null;
  }
}
setInterval(async () => {
  if (!PUSH_ENABLED) return;
  const m = nowMin();
  const due = reminders.filter(r => !r.sent && m >= r.timeMin - r.leadMin && m <= r.timeMin + 1);
  if (!due.length) return;
  const buckets = {};
  due.forEach(r => { (buckets[r.time] = buckets[r.time] || []).push(r); });
  for (const [at, list] of Object.entries(buckets)) {
    await sendPush({
      title: '⏰ ' + at.slice(11) + ' 待办提醒',
      body: list.map(r => r.text).join('\n'),
      items: list.map(r => ({ id: r.id, date: r.date })),
      tk: at.slice(0, 10),
    });
    list.forEach(r => { r.sent = true; });
  }
  reminders = reminders.filter(r => m <= r.timeMin + 60);
}, 60000);

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res) => {
  cors(res);
  const url = req.url.split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (req.method === 'GET' && url === '/api/health') {
      return json(res, 200, { ok: true, app: 'daily-todo', items: state.items.length, reminders: reminders.length });
    }
    if (url.startsWith('/api/') && !authOk(req)) {
      return json(res, 401, { error: 'unauthorized' });
    }
    if (req.method === 'GET' && url === '/api/state') {
      return json(res, 200, state);
    }
    if (req.method === 'PUT' && url === '/api/state') {
      const b = await bodyParser(req);
      if (!b || !Array.isArray(b.items) || typeof b.days !== 'object') return json(res, 400, { error: 'invalid state' });
      state = { items: b.items, days: b.days };
      try { save(); return json(res, 200, { ok: true, items: state.items.length }); }
      catch (e) { return json(res, 500, { error: 'write failed: ' + e.message }); }
    }
    if (req.method === 'GET' && url === '/api/push/keys') {
      return json(res, 200, { publicKey: VAPID_PUBLIC, enabled: PUSH_ENABLED });
    }
    if (req.method === 'POST' && url === '/api/push/subscribe') {
      const b = await bodyParser(req);
      if (!b.subscription || !b.subscription.endpoint) return json(res, 400, { error: 'subscription 缺失' });
      subscription = b.subscription;
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url === '/api/sync') {
      const b = await bodyParser(req);
      if (!Array.isArray(b.reminders)) return json(res, 400, { error: 'reminders 应为数组' });
      reminders = b.reminders
        .filter(r => r.time && r.id)
        .map(r => {
          const t = new Date(r.time.replace(' ', 'T'));
          return {
            id: String(r.id), text: r.text || '', time: r.time,
            timeMin: t.getTime() / 60000,
            leadMin: r.leadMin == null ? 10 : Number(r.leadMin),
            quad: r.quad || 'Q2', date: r.date || r.time.slice(0, 10), sent: false,
          };
        })
        .filter(r => !isNaN(r.timeMin));
      return json(res, 200, { ok: true, count: reminders.length });
    }
    if (req.method === 'POST' && url === '/api/unsubscribe') {
      subscription = null; reminders = [];
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log('daily-todo API 已启动: http://localhost:' + PORT);
  console.log('推送:', PUSH_ENABLED ? '开' : '关（PUSH_ENABLED=false）');
  if (PUSH_ENABLED) console.log('VAPID Public Key:', VAPID_PUBLIC);
});
