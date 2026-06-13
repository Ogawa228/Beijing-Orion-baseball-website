/* Shared auth + nav behavior. Include AFTER db.js on every page.
   Single source of truth for:
   1. buildNav(activeKey)        — unified nav bar with role-based visibility
   2. ensureAuthModal()          — auto-injects login/register modal into any page
   3. openModal/closeModal       — global modal controls (work on every page)
   4. handleLogin/handleRegister — form handlers for the auto-injected modal
   5. requireAuth(role)          — redirect guard for protected pages
*/

(function enforceHttpsForCustomDomain(){
  const host = String(window.location.hostname || '').toLowerCase();
  if (window.location.protocol === 'http:' && /^(www\.)?xn--4gsr8nf4ck7ihxnemb\.cn$/.test(host)) {
    window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`);
  }
})();

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
    nav.classList.remove('auth-ready', 'auth-state-guest', 'auth-state-authed', 'auth-state-admin', 'auth-state-player');
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

function authEscape(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Apply nav visibility based on current user
async function renderAuthNav(){
  // 等 db.preload() 完成（拿到 currentUser）
  if (window.dbReady) await window.dbReady();
  const u = DB.currentUser();
  const adminLinks = document.querySelectorAll('[data-auth="admin"]');
  const playerLinks = document.querySelectorAll('[data-auth="player"]');
  const guestLinks = document.querySelectorAll('[data-auth="guest"]');
  const authedLinks = document.querySelectorAll('[data-auth="authed"]');
  const isAdmin = !!(u && (u.adminLevel || (u.adminPermissionGroups || []).length || u.role === 'admin'));

  adminLinks.forEach(el => el.style.display = isAdmin ? '' : 'none');
  playerLinks.forEach(el => el.style.display = (u && !isAdmin) ? '' : 'none');
  guestLinks.forEach(el => el.style.display = u ? 'none' : '');
  authedLinks.forEach(el => el.style.display = u ? '' : 'none');

  const nameEl = document.getElementById('navUserName');
  if (nameEl) nameEl.textContent = u ? u.displayName : '';
  const nav = document.querySelector('nav.nav');
  if (nav) {
    nav.classList.toggle('auth-state-guest', !u);
    nav.classList.toggle('auth-state-authed', !!u);
    nav.classList.toggle('auth-state-admin', !!(u && isAdmin));
    nav.classList.toggle('auth-state-player', !!(u && !isAdmin));
    nav.dataset.authState = u ? 'authed' : 'guest';
    nav.classList.add('auth-ready');
  }
  const helloEl = document.querySelector('.nav-hello');
  if (helloEl) helloEl.title = u ? `已登录：${u.displayName}` : '';
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
  let u = DB.currentUser();
  // Login may have happened just before this page loaded while the initial
  // guest preload was still cached/in flight. Refresh once before redirecting.
  if (!u && DB.reload) {
    try {
      await DB.reload();
      u = DB.currentUser();
      if (typeof renderAuthNav === 'function') await renderAuthNav();
    } catch (_) {}
  }
  if (!u) { toast('请先登录','error'); setTimeout(()=>window.location.href='index.html',800); return null; }
  if (role === 'admin') {
    const isAdmin = !!(u.adminLevel || (u.adminPermissionGroups || []).length || u.role === 'admin');
    if (!isAdmin) { toast('权限不足','error'); setTimeout(()=>window.location.href='index.html',800); return null; }
  } else if (role && u.role !== role) {
    toast('权限不足','error'); setTimeout(()=>window.location.href='index.html',800); return null;
  }
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
        <p class="modal-sub">先选择你的身份，后续可以由管理员调整，不会影响已记录的签到和积分。</p>
        <form class="form" onsubmit="handleRegister(event)" style="margin-top:0">
          <input type="hidden" id="regMode" value="trial">
          <input type="hidden" id="regTargetPlayerId" value="">
          <div class="reg-mode-grid" role="group" aria-label="注册身份">
            <button type="button" class="reg-mode-card active" data-reg-mode="trial" onclick="setRegisterMode('trial')">
              <strong>试训队员</strong>
              <span>第一次来训练、还没有正式球员档案，选这个。注册后可以签到、累计积分，之后可申请转为正式队员。</span>
            </button>
            <button type="button" class="reg-mode-card" data-reg-mode="bind_request" onclick="setRegisterMode('bind_request')">
              <strong>绑定正式球员档案</strong>
              <span>你已经在球队正式名单里，想把账号关联到自己的真实球员数据，选这个。提交后由管理员核验。</span>
            </button>
          </div>
          <div class="reg-account-grid">
            <div class="field">
              <label>昵称</label>
              <input type="text" id="regName" required placeholder="例如：小宇" minlength="2" maxlength="20">
            </div>
            <div class="field">
              <label>邮箱</label>
              <input type="email" id="regEmail" required placeholder="you@example.com">
              <div class="err" id="regEmailErr"></div>
            </div>
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
          <div class="reg-bind-panel" id="regBindFields" style="display:none">
            <div class="reg-bind-hint">请选择你的球员档案，并填写少量核验信息。审核通过前，你仍可先作为试训账号使用。</div>
            <div class="field" style="position:relative">
              <label>目标正式球员档案</label>
              <input type="text" id="regTargetPlayerSearch" autocomplete="off" placeholder="搜索姓名 / 位置">
              <div class="hint reg-target-help">从正式名单里选择你的球员档案。选错可以取消，审核通过前仍可先作为试训账号使用。</div>
              <div id="regTargetPlayerDropdown" class="auth-search-dropdown" style="display:none"></div>
              <div id="regTargetPlayerSelected" class="hint"></div>
            </div>
            <div class="field">
              <label>队内昵称</label>
              <input type="text" id="regTeamNickname" maxlength="40" placeholder="例如：小宇 / Andy">
            </div>
            <div class="field">
              <label>微信号</label>
              <input type="text" id="regWechatId" maxlength="40" placeholder="便于管理员核验">
            </div>
            <div class="field">
              <label>其他验证信息</label>
              <textarea id="regVerifyInfo" rows="2" maxlength="240" placeholder="写一点管理员能认出你的信息"></textarea>
              <div class="hint">例如：猎户口号、认识的队友怎么称呼你、最近参加过哪次训练等。</div>
            </div>
          </div>
          <div class="captcha-row">
            <div class="field"><label>验证码</label><input type="text" id="regCap" required placeholder="请输入" maxlength="4" style="text-transform:uppercase"></div>
            <div class="captcha-img" id="captcha2" onclick="refreshCaptcha('captcha2')">M5X9</div>
          </div>
          <div class="auth-legal-panel" aria-label="注册协议与个人信息保护">
            <div class="auth-legal-head">
              <strong>协议与个人信息保护</strong>
              <span>注册前请阅读并确认。完整版本可在独立页面查阅和保存。</span>
            </div>
            <div class="auth-legal-links">
              <a href="legal.html#user-agreement" target="_blank" rel="noopener">用户协议</a>
              <a href="legal.html#privacy-policy" target="_blank" rel="noopener">隐私政策</a>
              <a href="legal.html#personal-info-rules" target="_blank" rel="noopener">个人信息处理规则</a>
            </div>
            <div class="auth-legal-public-note">球员页公开展示由正式球员本人在个人面板设置；未设置时，非正式用户看到的是档案姓名和档案照的磨砂玻璃效果。</div>
            <details class="auth-legal-detail">
              <summary>查看注册相关合规要点</summary>
              <div class="auth-legal-copy">
                <p><strong>我们会处理的信息：</strong>昵称、邮箱、密码加密摘要、登录状态、试训/正式球员身份、签到和积分；申请绑定正式档案时，还会处理目标球员档案、队内昵称、微信号和你填写的验证说明。</p>
                <p><strong>处理目的：</strong>创建账号、登录认证、展示球员档案、记录训练/比赛/积分、处理正式球员绑定申请、维护账号安全和履行法律法规要求。邮箱、微信号和验证说明不向普通访客公开。</p>
                <p><strong>球员页公开展示：</strong>正式球员可以在个人面板设置球员页对外显示的名称和头像；未设置时，非正式用户看到的是档案姓名和档案照的磨砂玻璃效果，不清晰展示真实身份。</p>
                <p><strong>你的权利：</strong>你可以申请查阅、复制、更正、补充、删除个人信息，撤回同意或注销账号。请通过网站联系邮箱或球队负责人微信提出申请。</p>
                <p><strong>未成年人：</strong>未满 14 周岁的注册、绑定或公开展示，应由监护人阅读并同意相关规则，并联系管理员完成核验。</p>
              </div>
            </details>
            <label class="auth-legal-check">
              <input type="checkbox" id="regTermsAgree">
              <span>我已阅读并同意《用户协议》《隐私政策》及《个人信息处理规则》。</span>
            </label>
            <label class="auth-legal-check">
              <input type="checkbox" id="regPersonalInfoAgree">
              <span>我单独同意网站为账号注册、球队管理、绑定审核、赛事数据展示和安全维护而处理必要个人信息；选择绑定正式球员档案时，同意提交微信号和验证说明供管理员核验。</span>
            </label>
            <label class="auth-legal-check">
              <input type="checkbox" id="regGuardianConfirm">
              <span>我确认本人已满 14 周岁；如未满 14 周岁，本次注册及个人信息处理已由监护人阅读并同意，且会联系管理员完成核验。</span>
            </label>
          </div>
          <div class="field err" id="regErr"></div>
          <button type="submit" class="btn">注册账号</button>
          <div class="auth-mini-link">
            已经在小程序注册过？
            <a href="#" onclick="event.preventDefault();openLinkEmailPanel()">用关联码绑定网页邮箱</a>
          </div>
        </form>
      </div>
      <!-- Existing mini-program account → email identity -->
      <div data-mpanel="link-email" style="display:none">
        <h3>关联网页邮箱</h3>
        <p class="modal-sub">如果你已经在小程序注册过，请输入一次性关联码。系统会给原账号增加邮箱登录，不会新建第二个试训档案。</p>
        <form class="form" onsubmit="handleLinkEmail(event)" style="margin-top:0">
          <div class="field">
            <label>一次性关联码</label>
            <input type="text" id="linkCode" required placeholder="APP-XXXXXX-XXXX" style="text-transform:uppercase;letter-spacing:.08em">
            <div class="hint">关联码 30 分钟内有效；在小程序「个人」页点“网页关联码”可自助生成，也可向管理员索取。</div>
          </div>
          <div class="field">
            <label>邮箱</label>
            <input type="email" id="linkEmail" required placeholder="you@example.com">
          </div>
          <div class="field">
            <label>网页昵称（可选）</label>
            <input type="text" id="linkName" placeholder="不填则沿用原账号昵称" maxlength="20">
          </div>
          <div class="field">
            <label>设置网页密码</label>
            <div class="pwd-wrap">
              <input type="password" id="linkPwd" required placeholder="至少 8 位，包含字母和数字" minlength="8">
              <button type="button" class="pwd-toggle" onclick="togglePwd('linkPwd',this)" aria-label="显示密码">👁</button>
            </div>
          </div>
          <div class="auth-legal-panel compact" aria-label="网页邮箱关联协议">
            <div class="auth-legal-links">
              <a href="legal.html#user-agreement" target="_blank" rel="noopener">用户协议</a>
              <a href="legal.html#privacy-policy" target="_blank" rel="noopener">隐私政策</a>
              <a href="legal.html#personal-info-rules" target="_blank" rel="noopener">个人信息处理规则</a>
            </div>
            <label class="auth-legal-check">
              <input type="checkbox" id="linkLegalAgree">
              <span>我已阅读并同意上述协议和个人信息处理规则，同意将网页邮箱作为原账号的新登录方式。</span>
            </label>
          </div>
          <div class="field err" id="linkErr"></div>
          <button type="submit" class="btn">完成关联</button>
          <button type="button" class="btn ghost" onclick="switchMTab('register')">返回注册</button>
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

  const targetSearch = modal.querySelector('#regTargetPlayerSearch');
  if (targetSearch) {
    targetSearch.addEventListener('pointerdown', e => {
      const dropdown = document.getElementById('regTargetPlayerDropdown');
      if (document.activeElement === targetSearch && isRegisterPlayerDropdownOpen(dropdown)) {
        e.preventDefault();
        targetSearch.dataset.skipDropdownClick = '1';
        hideRegisterPlayerDropdown({ blur: true });
      }
    });
    targetSearch.addEventListener('input', () => {
      const targetId = document.getElementById('regTargetPlayerId');
      const selected = document.getElementById('regTargetPlayerSelected');
      if (targetId) targetId.value = '';
      if (selected) selected.textContent = '';
      renderRegisterPlayerOptions(targetSearch.value);
    });
    targetSearch.addEventListener('focus', () => renderRegisterPlayerOptions(targetSearch.value));
    targetSearch.addEventListener('click', () => {
      if (targetSearch.dataset.skipDropdownClick) {
        delete targetSearch.dataset.skipDropdownClick;
        return;
      }
      const dropdown = document.getElementById('regTargetPlayerDropdown');
      if (!isRegisterPlayerDropdownOpen(dropdown)) renderRegisterPlayerOptions(targetSearch.value);
    });
    targetSearch.addEventListener('blur', () => {
      window.setTimeout(() => {
        const dropdown = document.getElementById('regTargetPlayerDropdown');
        if (dropdown && document.activeElement !== targetSearch && !dropdown.contains(document.activeElement)) {
          hideRegisterPlayerDropdown();
        }
      }, 0);
    });
  }
  document.addEventListener('pointerdown', e => {
    const dropdown = document.getElementById('regTargetPlayerDropdown');
    const search = document.getElementById('regTargetPlayerSearch');
    if (!dropdown || !search || !isRegisterPlayerDropdownOpen(dropdown)) return;
    if (e.target === search) return;
    if (dropdown.contains(e.target)) {
      if (e.target.closest('.auth-player-option')) return;
      hideRegisterPlayerDropdown();
      return;
    }
    hideRegisterPlayerDropdown();
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    hideRegisterPlayerDropdown({ blur: true });
  });
};

window.setRegisterMode = function(mode){
  const next = mode === 'bind_request' ? 'bind_request' : 'trial';
  const input = document.getElementById('regMode');
  if (input) input.value = next;
  document.querySelectorAll('#authModal .reg-mode-card').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.regMode === next);
  });
  const panel = document.getElementById('regBindFields');
  if (panel) panel.style.display = next === 'bind_request' ? '' : 'none';
  if (next === 'trial') {
    const targetId = document.getElementById('regTargetPlayerId');
    const targetText = document.getElementById('regTargetPlayerSearch');
    const selected = document.getElementById('regTargetPlayerSelected');
    const dropdown = document.getElementById('regTargetPlayerDropdown');
    if (targetId) targetId.value = '';
    if (targetText) targetText.value = '';
    if (selected) selected.textContent = '';
    if (dropdown) hideRegisterPlayerDropdown();
    const nick = document.getElementById('regTeamNickname');
    const wechat = document.getElementById('regWechatId');
    const verify = document.getElementById('regVerifyInfo');
    if (nick) nick.value = '';
    if (wechat) wechat.value = '';
    if (verify) verify.value = '';
  }
};

function isRegisterPlayerDropdownOpen(dropdown){
  return !!dropdown && dropdown.style.display !== 'none';
}

function hideRegisterPlayerDropdown(opts = {}){
  const dropdown = document.getElementById('regTargetPlayerDropdown');
  const search = document.getElementById('regTargetPlayerSearch');
  if (dropdown) dropdown.style.display = 'none';
  if (opts.blur && search && document.activeElement === search) search.blur();
}

function renderRegisterPlayerOptions(query = ''){
  const dropdown = document.getElementById('regTargetPlayerDropdown');
  if (!dropdown) return;
  const q = String(query || '').trim();
  const players = DB.allPlayers()
    .filter(p => DB.getPlayerLevel(p) === 'verified')
    .filter(p => DB.fuzzyMatch(q, p.name, p.number, p.position, (p.aliases || []).join(' ')))
    .slice(0, 8);
  if (!players.length) {
    dropdown.innerHTML = '<div class="auth-player-empty">没有匹配的正式球员</div>';
    dropdown.style.display = 'block';
    bindRegisterPlayerDropdownActions(dropdown);
    return;
  }
  dropdown.innerHTML = players.map(p => `
    <button type="button" class="auth-player-option" data-player-id="${authEscape(p.id)}">
      <img src="${authEscape(DB.playerPhotoUrl(p))}" alt="">
      <span>
        <strong>${authEscape(p.name)}${p.number ? ' · #'+authEscape(p.number) : ''}</strong>
        <em>${authEscape(p.position || '正式球员')}</em>
      </span>
    </button>
  `).join('');
  dropdown.style.display = 'block';
  bindRegisterPlayerDropdownActions(dropdown);
}

function bindRegisterPlayerDropdownActions(dropdown){
  dropdown.querySelectorAll('.auth-player-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = DB.getPlayerById(btn.dataset.playerId);
      if (!p) return;
      document.getElementById('regTargetPlayerId').value = p.id;
      document.getElementById('regTargetPlayerSearch').value = p.name + (p.number ? ' · #'+p.number : '');
      document.getElementById('regTargetPlayerSelected').innerHTML = `已选择 <strong style="color:var(--gold-bright)">${authEscape(p.name)}</strong>`;
      dropdown.style.display = 'none';
    });
  });
}

window.openLinkEmailPanel = function(){
  ensureAuthModal();
  document.getElementById('authModal').classList.add('open');
  switchMTab('link-email');
};

// ----- Global modal control helpers -----
window.openModal = function(which){
  ensureAuthModal();
  document.getElementById('authModal').classList.add('open');
  switchMTab(which || 'login');
  if ((which || 'login') === 'register') setRegisterMode('trial');
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
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.toggle('auth-registering', key === 'register' || key === 'link-email');
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
      if (DB.isAdminUser && DB.isAdminUser()) window.location.href = 'admin.html';
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
  const mode = document.getElementById('regMode')?.value || 'trial';
  if (pwd !== pwd2) { err.textContent = '两次密码不一致'; return; }
  if (pwdScore(pwd) < 2) { err.textContent = '密码强度不足，至少包含字母和数字'; return; }
  if (!document.getElementById('regTermsAgree')?.checked) { err.textContent = '请先阅读并同意用户协议、隐私政策和个人信息处理规则'; return; }
  if (!document.getElementById('regPersonalInfoAgree')?.checked) { err.textContent = '请确认同意必要的个人信息处理规则'; return; }
  if (!document.getElementById('regGuardianConfirm')?.checked) { err.textContent = '请确认年龄/监护人同意事项'; return; }
  const displayName = document.getElementById('regName').value.trim();
  const payload = {
    email: document.getElementById('regEmail').value,
    password: pwd,
    displayName,
    playerName: displayName,
    registrationMode: mode
  };
  if (mode === 'bind_request') {
    const targetId = document.getElementById('regTargetPlayerId').value;
    if (!targetId) { err.textContent = '请选择要绑定的正式球员档案'; return; }
    const targetPlayer = DB.getPlayerById(targetId);
    payload.bindRequest = {
      requestedPlayerId: targetId,
      realName: targetPlayer?.name || displayName,
      nickname: document.getElementById('regTeamNickname').value.trim() || payload.displayName,
      jerseyNumber: '',
      contactTail: document.getElementById('regWechatId').value.trim(),
      note: document.getElementById('regVerifyInfo').value.trim()
    };
  }
  try {
    await DB.register(payload);
    toast(mode === 'bind_request' ? '注册成功，绑定申请已提交给管理员' : '注册成功！你现在是试训队员，可以签到累计积分', 'success');
    closeModal();
    setTimeout(() => window.location.href = 'dashboard.html', 1200);
  } catch (ex) {
    err.textContent = ex.message;
    refreshCaptcha('captcha2');
  }
};

window.handleLinkEmail = async function(e){
  e.preventDefault();
  const err = document.getElementById('linkErr');
  err.textContent = '';
  const pwd = document.getElementById('linkPwd').value;
  if (pwdScore(pwd) < 2) { err.textContent = '密码强度不足，至少包含字母和数字'; return; }
  if (!document.getElementById('linkLegalAgree')?.checked) { err.textContent = '请先阅读并同意协议和个人信息处理规则'; return; }
  try {
    const u = await DB.linkEmail({
      code: document.getElementById('linkCode').value,
      email: document.getElementById('linkEmail').value,
      password: pwd,
      displayName: document.getElementById('linkName').value
    });
    toast('关联成功，欢迎 ' + u.displayName, 'success');
    closeModal();
    setTimeout(() => window.location.href = 'dashboard.html', 800);
  } catch (ex) {
    err.textContent = ex.message;
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
