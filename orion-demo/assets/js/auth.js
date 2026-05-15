/* Shared auth + nav behavior. Include AFTER db.js on every page.
   Single source of truth for:
   1. buildNav(activeKey)        — unified nav bar with role-based visibility
   2. ensureAuthModal()          — auto-injects login/register modal into any page
   3. openModal/closeModal       — global modal controls (work on every page)
   4. handleLogin/handleRegister — form handlers for the auto-injected modal
   5. requireAuth(role)          — redirect guard for protected pages
*/

// ---- Shared nav builder ----
// Auto-builds a consistent nav bar. Call buildNav(activeKey) once per page.
// activeKey: 'home' | 'events' | 'players' | 'games' | 'hof' | 'contact' | 'admin' | 'dashboard'
window.buildNav = function(activeKey) {
  const I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12L12 4l9 8"/><path d="M5 10v10h4v-6h6v6h4V10"/></svg>',
    events: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    players: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.866 3.134-7 7-7s7 3.134 7 7"/><circle cx="17" cy="7" r="3"/><path d="M22 19c0-2.2-1.8-4-4-4h-1"/></svg>',
    games: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M4.5 8.5c4-1 10 .5 13 3.5M4 15.5c4 1 10-.5 13-3.5M9.5 3.3c1 3 1 9-1 15M15 3.3c-1 3-1 9 1 15"/></svg>',
    hof: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9h12v1a6 6 0 0 1-12 0V9z"/><path d="M6 9V4h12v5M8 21h8M12 15v6"/><path d="M18 5h3v2a3 3 0 0 1-3 3M6 5H3v2a3 3 0 0 0 3 3"/></svg>',
    contact: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    ranking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/><path d="M10 9l1.2 1 1.6-2 1.2 1"/></svg>',
    login: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    join: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.866 3.134-7 7-7h1"/><path d="M19 8v6M16 11h6"/></svg>',
  };
  const items = [
    { key:'home',    href:'index.html',          label:'首页' },
    { key:'players', href:'players.html',        label:'球员' },
    { key:'events',  href:'events.html',         label:'活动' },
    { key:'games',   href:'games.html',          label:'比赛' },
    { key:'ranking', href:'ranking.html',        label:'积分榜' },
    { key:'hof',     href:'hall-of-fame.html',   label:'名人堂' },
    { key:'contact', href:'index.html#contact',  label:'联系' },
  ];
  const html = `
    <div class="nav-inner">
      <a class="brand" href="index.html">
        <img src="assets/img/logo.jpg" alt="Orion">
        <div class="brand-name">
          <span class="brand-cn">北京猎户座</span>
          <span class="brand-en">BEIJING ORION</span>
        </div>
      </a>
      <div class="nav-auth">
        <span class="nav-hello" data-auth="authed"><span class="nav-hello-prefix">你好，</span><span id="navUserName"></span></span>
        <button class="btn-nav ghost nav-iconbtn" data-auth="authed" onclick="logout()" title="退出登录">
          <span class="nav-icon">${I.logout}</span>
          <span class="nav-label">退出</span>
        </button>
        <button class="btn-nav ghost nav-iconbtn" data-auth="guest" onclick="openModal('login')">
          <span class="nav-icon">${I.login}</span>
          <span class="nav-label">登录</span>
        </button>
        <button class="btn-nav nav-iconbtn" data-auth="guest" onclick="openModal('register')">
          <span class="nav-icon">${I.join}</span>
          <span class="nav-label">加入我们</span>
        </button>
      </div>
      <div class="nav-links">
        ${items.map(it => `
          <a class="nav-item${activeKey===it.key?' active':''}" href="${it.href}" data-nav="${it.key}">
            <span class="nav-icon">${I[it.key]}</span>
            <span class="nav-label">${it.label}</span>
          </a>
        `).join('')}
        <a class="nav-item admin-link${activeKey==='admin'?' active':''}" href="admin.html" data-auth="admin" data-nav="admin">
          <span class="nav-icon">${I.admin}</span>
          <span class="nav-label">管理后台</span>
        </a>
        <a class="nav-item${activeKey==='dashboard'?' active':''}" href="dashboard.html" data-auth="player" data-nav="dashboard">
          <span class="nav-icon">${I.dashboard}</span>
          <span class="nav-label">我的面板</span>
        </a>
      </div>
    </div>
  `;
  const nav = document.querySelector('nav.nav');
  if (nav) {
    nav.classList.remove('auth-ready');
    nav.innerHTML = html;
  }
  if (typeof renderAuthNav === 'function') renderAuthNav();
};

// Toast helper
(function(){
  if (!document.getElementById('toastWrap')) {
    const w = document.createElement('div');
    w.className='toast-wrap';w.id='toastWrap';
    document.body.appendChild(w);
  }
})();
function toast(msg, type='info'){
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className='toast '+type;
  t.textContent=msg;
  wrap.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(400px)';t.style.transition='all .3s';},2600);
  setTimeout(()=>t.remove(),3000);
}
window.toast = toast;

// Apply nav visibility based on current user
async function renderAuthNav(){
  // 等 db.preload() 完成（拿到 currentUser）
  if (window.dbReady) await window.dbReady();
  const u = DB.currentUser();
  const adminLinks = document.querySelectorAll('[data-auth="admin"]');
  const playerLinks = document.querySelectorAll('[data-auth="player"]');
  const guestLinks = document.querySelectorAll('[data-auth="guest"]');
  const authedLinks = document.querySelectorAll('[data-auth="authed"]');

  adminLinks.forEach(el => el.style.display = (u && u.role==='admin') ? '' : 'none');
  playerLinks.forEach(el => el.style.display = (u && u.role==='player') ? '' : 'none');
  guestLinks.forEach(el => el.style.display = u ? 'none' : '');
  authedLinks.forEach(el => el.style.display = u ? '' : 'none');

  const nameEl = document.getElementById('navUserName');
  if (nameEl) nameEl.textContent = u ? u.displayName : '';
  const nav = document.querySelector('nav.nav');
  if (nav) nav.classList.add('auth-ready');
}
window.renderAuthNav = renderAuthNav;
document.addEventListener('DOMContentLoaded', renderAuthNav);

async function logout(){
  await DB.logout();
  toast('已退出','success');
  setTimeout(()=>window.location.href='index.html',500);
}
window.logout = logout;

// 忘记密码 — 当前项目无邮件服务，走管理员手动重置流程
window.showForgotPwdHint = function() {
  const err = document.getElementById('loginErr');
  if (err) {
    err.innerHTML = '请联系管理员重置密码<br>📧 邮箱 <a href="mailto:357188292@qq.com" style="color:var(--gold-bright);text-decoration:underline">357188292@qq.com</a> · 或加任意一位负责人微信';
    err.style.color = 'var(--text-dim)';
    err.style.fontSize = '12px';
    err.style.lineHeight = '1.7';
  }
};

// Require role — redirect if not authorized
async function requireAuth(role){
  if (window.dbReady) await window.dbReady();
  const u = DB.currentUser();
  if (!u) { toast('请先登录','error'); setTimeout(()=>window.location.href='index.html',800); return null; }
  if (role && u.role !== role) { toast('权限不足','error'); setTimeout(()=>window.location.href='index.html',800); return null; }
  return u;
}
window.requireAuth = requireAuth;

// ============================================================
// Global auth modal — auto-injected into every page that loads auth.js.
// Before this, only index.html had the modal HTML inline so clicking
// "登录 / 加入我们" on any other page was silently broken.
// ============================================================
window.ensureAuthModal = function ensureAuthModal(){
  if (document.getElementById('authModal')) return; // already present
  const modal = document.createElement('div');
  modal.className = 'modal-mask';
  modal.id = 'authModal';
  modal.innerHTML = `
    <div class="modal">
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="modal-tabs">
        <button class="modal-tab active" data-mtab="login">登录</button>
        <button class="modal-tab" data-mtab="register">注册</button>
      </div>
      <!-- Login -->
      <div data-mpanel="login">
        <h3>欢迎回到猎户座</h3>
        <p class="modal-sub">输入邮箱与密码继续 · 还没有账号？点击右上角"加入我们"</p>
        <form class="form" onsubmit="handleLogin(event)" style="margin-top:0">
          <div class="field">
            <label>邮箱</label>
            <input type="email" id="loginEmail" required placeholder="you@example.com">
          </div>
          <div class="field">
            <label>密码</label>
            <div class="pwd-wrap">
              <input type="password" id="loginPwd" required placeholder="••••••••">
              <button type="button" class="pwd-toggle" onclick="togglePwd('loginPwd',this)" aria-label="显示密码">👁</button>
            </div>
          </div>
          <div class="captcha-row">
            <div class="field"><label>验证码</label><input type="text" id="loginCap" required placeholder="请输入" maxlength="4" style="text-transform:uppercase"></div>
            <div class="captcha-img" id="captcha1" onclick="refreshCaptcha('captcha1')">A8K2</div>
          </div>
          <div class="field err" id="loginErr"></div>
          <button type="submit" class="btn">登录</button>
          <div style="margin-top:10px;text-align:center;font-size:12px;color:var(--text-mute)">
            <a href="#" onclick="event.preventDefault();showForgotPwdHint()" style="color:var(--gold-bright);text-decoration:none;border-bottom:1px dashed rgba(228,199,122,.4)">忘记密码？</a>
          </div>
        </form>
      </div>
      <!-- Register -->
      <div data-mpanel="register" style="display:none">
        <h3>加入北京猎户座</h3>
        <p class="modal-sub">注册即可签到 · 训练满 8 次（80 积分）自动升级正式队员，或联系管理员获得绑定码立即升级</p>
        <form class="form" onsubmit="handleRegister(event)" style="margin-top:0">
          <div class="field">
            <label>昵称</label>
            <input type="text" id="regName" required placeholder="任意昵称（不需真实姓名）" minlength="2" maxlength="20">
            <div class="hint">2-20 个字符，可任意填。绑定球员档案后，公开页面（球员墙、排行榜）显示档案的真实姓名，你的昵称只在「我的面板」可见。</div>
          </div>
          <div class="field">
            <label>邮箱</label>
            <input type="email" id="regEmail" required placeholder="you@example.com">
            <div class="err" id="regEmailErr"></div>
          </div>
          <div class="field">
            <label>密码</label>
            <div class="pwd-wrap">
              <input type="password" id="regPwd" required placeholder="至少 8 位，包含字母和数字" minlength="8">
              <button type="button" class="pwd-toggle" onclick="togglePwd('regPwd',this)" aria-label="显示密码">👁</button>
            </div>
            <div class="pwd-strength">
              <div class="pwd-bar" id="pb1"></div><div class="pwd-bar" id="pb2"></div>
              <div class="pwd-bar" id="pb3"></div><div class="pwd-bar" id="pb4"></div>
            </div>
            <div class="hint" id="pwdHint">密码强度：— · 点击 👁 可查看明文</div>
          </div>
          <div class="field">
            <label>确认密码</label>
            <div class="pwd-wrap">
              <input type="password" id="regPwd2" required placeholder="再次输入密码">
              <button type="button" class="pwd-toggle" onclick="togglePwd('regPwd2',this)" aria-label="显示密码">👁</button>
            </div>
            <div class="err" id="regPwd2Err"></div>
          </div>
          <div class="captcha-row">
            <div class="field"><label>验证码</label><input type="text" id="regCap" required placeholder="请输入" maxlength="4" style="text-transform:uppercase"></div>
            <div class="captcha-img" id="captcha2" onclick="refreshCaptcha('captcha2')">M5X9</div>
          </div>
          <div class="field err" id="regErr"></div>
          <button type="submit" class="btn">注册账号</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Click outside to close
  modal.addEventListener('click', e => { if (e.target.id === 'authModal') closeModal(); });

  // Tab switching
  modal.querySelectorAll('.modal-tab').forEach(t => {
    t.addEventListener('click', () => switchMTab(t.dataset.mtab));
  });

  // Live email-taken check
  const regEmail = modal.querySelector('#regEmail');
  if (regEmail) regEmail.addEventListener('blur', e => {
    const v = e.target.value;
    const err = modal.querySelector('#regEmailErr');
    err.textContent = (v && DB.findUserByEmail(v)) ? '该邮箱已被注册' : '';
  });

  // Live password strength
  const regPwd = modal.querySelector('#regPwd');
  if (regPwd) regPwd.addEventListener('input', e => {
    const s = pwdScore(e.target.value);
    const labels = ['—','弱','一般','较强','很强'];
    modal.querySelector('#pwdHint').textContent = '密码强度：' + labels[s];
    for (let i = 1; i <= 4; i++) {
      const bar = modal.querySelector('#pb'+i);
      bar.className = 'pwd-bar' + (i <= s ? ' s'+s : '');
    }
  });

  // Confirm password live check
  const regPwd2 = modal.querySelector('#regPwd2');
  if (regPwd2) regPwd2.addEventListener('input', e => {
    const err = modal.querySelector('#regPwd2Err');
    err.textContent = e.target.value && e.target.value !== regPwd.value ? '两次密码不一致' : '';
  });
};

// ----- Global modal control helpers -----
window.openModal = function(which){
  ensureAuthModal();
  document.getElementById('authModal').classList.add('open');
  switchMTab(which || 'login');
  // 验证码初始值在 HTML 里写死（"A8K2"/"M5X9"）只是占位符；
  // 每次打开 modal 都要刷一次成真随机码，否则用户每次看到的都是同一组
  if (typeof window.refreshCaptcha === 'function') {
    window.refreshCaptcha('captcha1');
    window.refreshCaptcha('captcha2');
  }
};
window.closeModal = function(){
  const m = document.getElementById('authModal');
  if (m) m.classList.remove('open');
};
function switchMTab(key){
  document.querySelectorAll('#authModal .modal-tab').forEach(t => t.classList.toggle('active', t.dataset.mtab === key));
  document.querySelectorAll('#authModal [data-mpanel]').forEach(p => p.style.display = p.dataset.mpanel === key ? '' : 'none');
  // 切 tab 时给即将显示的那个 panel 的验证码刷新一次（防止 admin 切回时还看到旧码）
  if (typeof window.refreshCaptcha === 'function') {
    window.refreshCaptcha(key === 'register' ? 'captcha2' : 'captcha1');
  }
}
window.switchMTab = switchMTab;

window.refreshCaptcha = function(id){
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  const el = document.getElementById(id);
  if (el) el.textContent = s;
};

window.togglePwd = function(inputId, btn){
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
  btn.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
};

// 密码强度评分（0-4）：
//   1 分：长度 ≥ 8
//   1 分：同时包含字母和数字（最低门槛）
//   1 分：同时包含大小写字母（加分项）
//   1 分：含特殊符号（加分项）
//   1 分：长度 ≥ 12（加分项）
// 注册门槛 ≥ 2 → 等价于「8 位 + 字母 + 数字」（最易记的安全门槛）
function pwdScore(p){
  let s = 0;
  if (p.length >= 8) s++;
  const hasLetter = /[a-zA-Z]/.test(p);
  const hasDigit  = /\d/.test(p);
  const hasUpper  = /[A-Z]/.test(p);
  const hasLower  = /[a-z]/.test(p);
  const hasSymbol = /[^a-zA-Z\d]/.test(p);
  if (hasLetter && hasDigit) s++;
  if (hasUpper && hasLower)  s++;
  if (hasSymbol)             s++;
  if (p.length >= 12)        s++;
  return Math.min(s, 4);
}
window.pwdScore = pwdScore;

window.handleLogin = async function(e){
  e.preventDefault();
  const err = document.getElementById('loginErr');
  err.textContent = '';
  const cap = document.getElementById('loginCap').value.toUpperCase();
  const expected = document.getElementById('captcha1').textContent;
  if (cap !== expected) { err.textContent = '验证码错误'; refreshCaptcha('captcha1'); return; }
  try {
    const u = await DB.login(
      document.getElementById('loginEmail').value,
      document.getElementById('loginPwd').value
    );
    toast('登录成功，欢迎 ' + u.displayName, 'success');
    closeModal();
    // 拉新 cache（特别是 bind_codes 在 admin 登录后需要）
    await DB.reload();
    setTimeout(() => {
      if (u.role === 'admin') window.location.href = 'admin.html';
      else window.location.href = 'dashboard.html';
    }, 600);
  } catch (ex) {
    err.textContent = ex.message;
    refreshCaptcha('captcha1');
  }
};

window.handleRegister = async function(e){
  e.preventDefault();
  const err = document.getElementById('regErr');
  err.textContent = '';
  const cap = document.getElementById('regCap').value.toUpperCase();
  const expected = document.getElementById('captcha2').textContent;
  if (cap !== expected) { err.textContent = '验证码错误'; refreshCaptcha('captcha2'); return; }
  const pwd = document.getElementById('regPwd').value;
  const pwd2 = document.getElementById('regPwd2').value;
  if (pwd !== pwd2) { err.textContent = '两次密码不一致'; return; }
  if (pwdScore(pwd) < 2) { err.textContent = '密码强度不足，至少包含字母和数字'; return; }
  try {
    await DB.register({
      email: document.getElementById('regEmail').value,
      password: pwd,
      displayName: document.getElementById('regName').value
    });
    toast('注册成功！你现在是「试训队员」，参加 8 次训练自动升正式 ★', 'success');
    closeModal();
    setTimeout(() => window.location.href = 'dashboard.html', 1200);
  } catch (ex) {
    err.textContent = ex.message;
    refreshCaptcha('captcha2');
  }
};

// Auto-inject the modal as soon as the DOM is ready so buttons work everywhere.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureAuthModal, { once: true });
} else {
  ensureAuthModal();
}

// ============================================================
// Online status heartbeat — every 30s update lastActiveAt for the logged-in
// user, so other pages can show 在线/最近/离线 dot via DB.getPlayerOnlineStatus.
// 仅 localStorage demo：跨设备/跨浏览器看不到对方实时状态（要等接后端）。
// ============================================================
(function startHeartbeat(){
  let timer = null;
  function tick() {
    if (DB.currentUser()) DB.heartbeat();
  }
  function start() {
    if (timer) return;
    tick();
    timer = setInterval(tick, 30 * 1000);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  // 页面可见时跑，不可见时停（避免后台 tab 浪费）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
  // 关闭/刷新时不主动写 offline——让阈值自然过期，更省事
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
