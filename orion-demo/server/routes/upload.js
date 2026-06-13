// /api/upload — 上传到微信云托管的对象存储（COS）
//
// 鉴权策略（按 https://developers.weixin.qq.com/.../service/cos-sdk.html 的官方推荐）：
//   ① 生产（云托管容器内）：调内网接口 `http://api.weixin.qq.com/_/cos/getauth`
//      拿临时凭证 (TmpSecretId/Key + Token + ExpiredTime)，由 cos-nodejs-sdk-v5
//      的 `getAuthorization` 回调注入 — **完全免密钥**
//   ② 本地开发：从 `.env` 读 `TENCENTCLOUD_SECRETID + TENCENTCLOUD_SECRETKEY`
//      （腾讯云 CAM 拿）；没配就直接 503，不进 SDK 防卡死
//
// 路由：
//   POST /api/upload (登录用户)  multipart/form-data: file=<file>, kind=<player|game|event|highlight|avatar|...>
//   返回：{ url: 'https://<bucket>.cos.<region>.myqcloud.com/<key>', cloudPath, size, contentType }
//
// 防滥用：每用户 60 秒内 ≤ 10 次（内存计数 — Cloud Run 单进程容器够用，
//        多副本场景需要换 Redis 但目前只有一个实例）

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');
const { wrap, requireAuth } = require('../middleware');

const router = express.Router();

const BUCKET = process.env.COS_BUCKET || '7072-prod-d5gtkxdyu7263e95b-1429688831';
const REGION = process.env.COS_REGION || 'ap-shanghai';
const IMAGE_EXT_RE = /^\.(jpg|jpeg|png|gif|webp|svg)$/i;
const IMAGE_MIME_RE = /^image\/(?:jpeg|png|gif|webp|svg\+xml)$/i;

// 单文件 ≤ 20 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ---------- 频次限制 ----------
const uploadLog = new Map();  // userId → number[]（时间戳秒）
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
function rateLimit(req, res, next) {
  if (!req.user) return next();  // requireAuth 之后 user 必有；这里只是防御
  const now = Date.now();
  const log = (uploadLog.get(req.user.id) || []).filter(ts => now - ts < RATE_WINDOW_MS);
  if (log.length >= RATE_MAX) {
    const retryAfter = Math.ceil((log[0] + RATE_WINDOW_MS - now) / 1000);
    return res.status(429).json({
      error: 'rate_limited',
      message: `上传太频繁了 — 1 分钟内最多 ${RATE_MAX} 次。${retryAfter} 秒后重试。`,
      retryAfter,
    });
  }
  log.push(now);
  uploadLog.set(req.user.id, log);
  // 顺手清理：> 1000 个用户时把过期窗口的清掉
  if (uploadLog.size > 1000) {
    for (const [k, v] of uploadLog) {
      if (v.every(ts => now - ts >= RATE_WINDOW_MS)) uploadLog.delete(k);
    }
  }
  next();
}

// ---------- 临时凭证缓存 ----------
let _cachedAuth = null;  // { TmpSecretId, TmpSecretKey, Token, ExpiredTime(unix seconds) }
async function fetchCosAuth() {
  const url = 'http://api.weixin.qq.com/_/cos/getauth';
  // node 18+ 自带 global fetch；加 5s timeout 防止内网异常时挂死
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`getauth HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.TmpSecretId) throw new Error(`getauth bad response: ${JSON.stringify(data).slice(0, 200)}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}
async function getCosAuth() {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedAuth && _cachedAuth.ExpiredTime > now + 60) return _cachedAuth;
  _cachedAuth = await fetchCosAuth();
  return _cachedAuth;
}

// ---------- cos client lazy init ----------
let _cos = null;
function getCos() {
  if (_cos) return _cos;
  if (process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY) {
    // 本地开发：显式 SecretId/Key
    _cos = new COS({
      SecretId: process.env.TENCENTCLOUD_SECRETID,
      SecretKey: process.env.TENCENTCLOUD_SECRETKEY,
    });
  } else {
    // 生产：异步 getAuthorization 拉云托管内网临时凭证
    _cos = new COS({
      getAuthorization: async (options, callback) => {
        try {
          const auth = await getCosAuth();
          callback({
            TmpSecretId: auth.TmpSecretId,
            TmpSecretKey: auth.TmpSecretKey,
            SecurityToken: auth.Token,
            ExpiredTime: auth.ExpiredTime,
          });
        } catch (e) {
          console.error('[upload] getCosAuth failed', e.message);
          callback({ Error: e.message });
        }
      },
    });
  }
  return _cos;
}

function isCloudRuntime() {
  return !!(
    process.env.WX_CONTEXT_KEY ||
    process.env.WX_ENV ||
    process.env.TCB_ENV ||
    process.env.CLOUD_ENV ||
    process.env.K_SERVICE
  );
}

// 本地无凭证 + 不在生产/云托管 → 直接 503（不进 SDK）
function canUpload() {
  if (process.env.NODE_ENV === 'production') return true;
  if (isCloudRuntime()) return true;
  if (process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY) return true;
  return false;
}

function sanitizeKind(kind) {
  return (kind || 'misc').replace(/[^a-z]/gi, '').slice(0, 20) || 'misc';
}

function safeImageExt(fileName, contentType) {
  const rawExt = path.extname(fileName || '').toLowerCase().slice(0, 10);
  if (IMAGE_EXT_RE.test(rawExt)) return rawExt;
  const type = String(contentType || '').toLowerCase();
  if (type === 'image/jpeg') return '.jpg';
  if (type === 'image/png') return '.png';
  if (type === 'image/gif') return '.gif';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/svg+xml') return '.svg';
  return '.bin';
}

async function uploadImageBuffer({ buffer, fileName, contentType, kind }) {
  if (!canUpload()) {
    const err = new Error('本地开发环境未配置对象存储凭证 — 头像 / 封面 / 高亮等上传功能仅云托管部署后可用');
    err.statusCode = 503;
    err.code = 'cos_not_configured';
    throw err;
  }
  const safeExt = safeImageExt(fileName, contentType);
  if (safeExt === '.bin' || (contentType && !IMAGE_MIME_RE.test(String(contentType)))) {
    const err = new Error('只支持 JPG / PNG / GIF / WEBP / SVG 图片格式');
    err.statusCode = 400;
    err.code = 'bad_filetype';
    throw err;
  }
  const ym = new Date().toISOString().slice(0, 7);
  const rand = crypto.randomBytes(8).toString('hex');
  const key = `orion/${sanitizeKind(kind)}/${ym}/${rand}${safeExt}`;

  const cos = getCos();
  try {
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
      }, (err, data) => err ? reject(err) : resolve(data));
    });
  } catch (e) {
    console.error('[upload] putObject failed', e.message || e);
    const err = new Error(e.message || String(e));
    err.statusCode = 500;
    err.code = 'upload_failed';
    throw err;
  }

  return {
    url: `https://${BUCKET}.tcb.qcloud.la/${key}`,
    cloudPath: key,
    size: buffer.length,
    contentType,
  };
}

// ---------- 路由 ----------
router.post('/', requireAuth, rateLimit, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file', message: '没收到文件' });
  try {
    const uploaded = await uploadImageBuffer({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      kind: req.body.kind,
    });
    res.json(uploaded);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.code || 'upload_failed', message: e.message || String(e) });
  }
}));

router.post('/base64', requireAuth, rateLimit, wrap(async (req, res) => {
  const body = req.body || {};
  const fileName = String(body.fileName || '').trim();
  const contentType = String(body.contentType || '').trim();
  const data = String(body.fileBase64 || '').replace(/^data:image\/[a-z0-9+.-]+;base64,/i, '').replace(/\s+/g, '');
  if (!fileName || !data) return res.status(400).json({ error: 'bad_request', message: 'fileName / fileBase64 必填' });
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) return res.status(400).json({ error: 'empty_file', message: '图片文件为空' });
  if (buffer.length > 12 * 1024 * 1024) {
    return res.status(413).json({ error: 'file_too_large', message: '图片不能超过 12MB' });
  }
  try {
    const uploaded = await uploadImageBuffer({
      buffer,
      fileName,
      contentType,
      kind: body.kind,
    });
    res.json(uploaded);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.code || 'upload_failed', message: e.message || String(e) });
  }
}));

module.exports = router;
