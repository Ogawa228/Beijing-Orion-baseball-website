const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const projectPath = path.join(root, 'project.config.json');
const appPath = path.join(root, 'miniprogram/app.json');
const devtoolsCli = process.env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function exists(file) {
  return fs.existsSync(file);
}

function checkDevtoolsCli() {
  assert(exists(devtoolsCli), `微信开发者工具 CLI 不存在：${devtoolsCli}`);
  const res = spawnSync(devtoolsCli, ['--help'], { encoding: 'utf8' });
  assert(res.status === 0, `微信开发者工具 CLI 无法运行：${res.stderr || res.stdout}`);
  const help = `${res.stdout || ''}\n${res.stderr || ''}`;
  ['open', 'preview', 'upload', 'build-npm'].forEach(cmd => {
    assert(help.includes(cmd), `微信开发者工具 CLI 缺少 ${cmd} 命令`);
  });
  return devtoolsCli;
}

function checkMiniprogramCiPackage() {
  const pkgPath = require.resolve('miniprogram-ci/package.json', { paths: [root] });
  const pkg = readJson(pkgPath);
  assert(pkg.version, 'miniprogram-ci package.json 缺少版本号');
  return pkg.version;
}

function checkProjectConfig() {
  assert(exists(projectPath), '缺少 project.config.json');
  assert(exists(appPath), '缺少 miniprogram/app.json');
  const project = readJson(projectPath);
  const app = readJson(appPath);
  assert(project.appid === 'wx8ad6ccfa1b8f040a', `project.config.json AppID 不符合当前小程序：${project.appid || '(empty)'}`);
  assert(project.miniprogramRoot === 'miniprogram/', 'project.config.json miniprogramRoot 必须是 miniprogram/');
  assert(project.compileType === 'miniprogram', 'project.config.json compileType 必须是 miniprogram');
  assert(Array.isArray(app.pages) && app.pages.length > 0, 'app.json pages 不能为空');
  assert(app.lazyCodeLoading !== 'requiredComponents', '当前微信开发者工具会把 requiredComponents 下的深层新增页面误报为 WXML file not found，暂不启用 lazyCodeLoading');
  ['chooseLocation', 'getLocation'].forEach(api => {
    assert((app.requiredPrivateInfos || []).includes(api), `app.json 必须声明 ${api}`);
  });
  assert(!(app.requiredPrivateInfos || []).includes('getFuzzyLocation'), '微信 CI 要求 getLocation 与 getFuzzyLocation 互斥，精确定位上传路线不得声明 getFuzzyLocation');
  assert(app.permission?.['scope.userLocation']?.desc, 'app.json 必须声明 scope.userLocation.desc');
  return { project, app };
}

function checkPages(app) {
  app.pages.forEach(page => {
    const pageBase = path.join(root, 'miniprogram', page);
    ['.js', '.wxml'].forEach(ext => {
      assert(exists(`${pageBase}${ext}`), `页面缺少 ${ext}：${page}`);
    });
  });
}

function checkCloudConfig() {
  const config = fs.readFileSync(path.join(root, 'miniprogram/utils/config.js'), 'utf8');
  const request = fs.readFileSync(path.join(root, 'miniprogram/utils/request.js'), 'utf8');
  [
    'cloudEnv',
    'cloudService',
    'cloudResourceAppid',
    'prod-d5gtkxdyu7263e95b',
    'express-knlw',
    'wx7dce60930ee10898',
  ].forEach(token => {
    assert(config.includes(token), `miniprogram/utils/config.js 缺少 ${token}`);
  });
  [
    'new cloud.Cloud',
    'resourceAppid',
    'resourceEnv',
    'callContainer',
    'X-WX-SERVICE',
    'Authorization',
  ].forEach(token => {
    assert(request.includes(token), `miniprogram/utils/request.js 缺少 ${token}`);
  });
}

function checkUploadKeyIfConfigured() {
  const keyPath = process.env.WECHAT_MINIPROGRAM_UPLOAD_PRIVATE_KEY_PATH;
  if (!keyPath) return '未配置上传私钥；本检查不会上传或预览';
  const resolved = path.resolve(root, keyPath);
  assert(exists(resolved), `上传私钥路径不存在：${resolved}`);
  const stat = fs.statSync(resolved);
  assert((stat.mode & 0o077) === 0, `上传私钥权限应为 600 或更严格：${resolved}`);
  return `上传私钥存在且权限受限：${resolved}`;
}

function main() {
  const cli = checkDevtoolsCli();
  const ciVersion = checkMiniprogramCiPackage();
  const { app } = checkProjectConfig();
  checkPages(app);
  checkCloudConfig();
  const keyStatus = checkUploadKeyIfConfigured();
  console.log('Mini program CI precheck passed');
  console.log(`- DevTools CLI: ${cli}`);
  console.log(`- miniprogram-ci: ${ciVersion}`);
  console.log(`- pages: ${app.pages.length}`);
  console.log(`- upload key: ${keyStatus}`);
  console.log('- upload/preview: skipped by design; require explicit approval before use');
}

main();
