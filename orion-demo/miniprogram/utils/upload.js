// 统一的高可用图片上传:
//   ① 压缩(限宽 1280 + 质量 78,对齐网页端质量)
//   ② 主通道 wx.uploadFile multipart 直传 /api/upload —— 绕过云托管 callContainer 的请求体大小限制,
//      大图也能稳定上传,不再出 "cloud callContainer" 错误
//   ③ 兜底 callContainer base64 上传 /api/upload/base64 —— 当 uploadFile 合法域名未配/网络异常时自动降级
//      (压缩后体积已很小,callContainer 通常也能过)
// 两通道都失败才抛错。所有页面统一走 uploadImage(),不再各自复制上传代码。
const { ORION_CONFIG } = require('./config');
const session = require('./session');
const api = require('./request');

function inferContentType(name) {
  const n = String(name || '').toLowerCase();
  if (/\.png(?:\?|$)/.test(n)) return 'image/png';
  if (/\.gif(?:\?|$)/.test(n)) return 'image/gif';
  if (/\.webp(?:\?|$)/.test(n)) return 'image/webp';
  if (/\.svg(?:\?|$)/.test(n)) return 'image/svg+xml';
  return 'image/jpeg';
}

// 压缩对齐网页端:1280px 宽 + 质量 78;旧基础库不支持 compressedWidth 时退回只压质量,再失败用原图
function compressImage(src) {
  return new Promise(resolve => {
    if (!src || !wx.compressImage) {
      resolve(src);
      return;
    }
    wx.compressImage({
      src,
      quality: 78,
      compressedWidth: 1280,
      success: res => resolve((res && res.tempFilePath) || src),
      fail: () => {
        wx.compressImage({
          src,
          quality: 78,
          success: r => resolve((r && r.tempFilePath) || src),
          fail: () => resolve(src),
        });
      },
    });
  });
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: res => resolve(res.data || ''),
      fail: reject,
    });
  });
}

// 主通道:HTTPS multipart 直传,带 Bearer 鉴权;后端 /api/upload 用 multer 接收
function uploadViaHttp(filePath, kind, fileName) {
  return new Promise((resolve, reject) => {
    if (!wx.uploadFile || !ORION_CONFIG.httpBase) {
      reject(new Error('uploadFile 不可用'));
      return;
    }
    const token = session.getSession();
    wx.uploadFile({
      url: `${ORION_CONFIG.httpBase}/api/upload`,
      filePath,
      name: 'file',
      formData: { kind: kind || 'misc' },
      header: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 60000,
      success: res => {
        const status = res.statusCode || 200;
        let data = {};
        try { data = JSON.parse(res.data || '{}'); } catch (_) { data = {}; }
        if (status >= 400 || !data.url) {
          reject(new Error(data.message || `上传失败 ${status}`));
          return;
        }
        resolve(data);
      },
      fail: err => reject(new Error((err && err.errMsg) || '上传请求失败')),
    });
  });
}

// 兜底:callContainer base64
async function uploadViaContainer(filePath, kind, fileName) {
  const fileBase64 = await readFileBase64(filePath);
  return api.post('/upload/base64', {
    kind: kind || 'misc',
    fileName,
    contentType: inferContentType(fileName),
    fileBase64,
  });
}

// 高可用图片上传:返回 { url, cloudPath, size, contentType }
async function uploadImage(file, kind, fallbackPrefix) {
  const rawPath = (file && (file.tempFilePath || file.path)) || '';
  if (!rawPath) throw new Error('没有选择图片');
  const fileName = (file && file.name) || rawPath.split('/').pop() || `${fallbackPrefix || 'image'}-${Date.now()}.jpg`;
  const filePath = await compressImage(rawPath);
  try {
    return await uploadViaHttp(filePath, kind, fileName);
  } catch (httpErr) {
    // 直传通道不可用(合法域名未配置 / 网络异常)时降级到 callContainer base64
    return await uploadViaContainer(filePath, kind, fileName);
  }
}

module.exports = { uploadImage, compressImage, readFileBase64, inferContentType };
