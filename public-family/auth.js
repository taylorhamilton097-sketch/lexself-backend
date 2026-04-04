/**
 * LexSelf Auth + Billing — shared client module
 * Include this in both family and criminal frontends.
 * 
 * Usage:
 *   const auth = new LexSelfAuth({ product: 'family', apiBase: '/api' });
 *   await auth.init();
 *   if (!auth.user) auth.showLogin();
 */

class LexSelfAuth {
  constructor({ product = 'criminal', apiBase = '/api', onLogin, onLogout, onUsageUpdate } = {}) {
    this.product = product;
    this.apiBase = apiBase;
    this.token   = localStorage.getItem('ls_tok') || null;
    this.user    = null;
    this.usage   = null;
    this.onLogin  = onLogin  || (() => {});
    this.onLogout = onLogout || (() => {});
    this.onUsageUpdate = onUsageUpdate || (() => {});
  }

  // ── API ──
  async _fetch(method, path, body, rawBody = false) {
    const headers = {};
    if (!rawBody) headers['Content-Type'] = 'application/json';
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const r = await fetch(this.apiBase + path, {
      method,
      headers,
      body: body ? (rawBody ? body : JSON.stringify(body)) : undefined,
    });
    if (r.status === 401) { this._handleLogout(); return null; }
    return r.json();
  }

  // ── INIT ──
  async init() {
    if (!this.token) return false;
    try {
      const d = await this._fetch('GET', `/auth/me?product=${this.product}`);
      if (d?.user) {
        this.user  = d.user;
        this.usage = d.usage;
        this.onLogin(this.user, this.usage);
        this.onUsageUpdate(this.usage);
        return true;
      }
    } catch(e) {}
    this.token = null;
    localStorage.removeItem('ls_tok');
    return false;
  }

  // ── AUTH ──
  async register(email, password, name) {
    const d = await this._fetch('POST', '/auth/register', { email, password, name, product: this.product });
    if (d?.token) this._handleLogin(d);
    return d;
  }

  async login(email, password) {
    const d = await this._fetch('POST', '/auth/login', { email, password });
    if (d?.token) this._handleLogin(d);
    return d;
  }

  _handleLogin(data) {
    this.token = data.token;
    this.user  = data.user;
    localStorage.setItem('ls_tok', this.token);
    this.refreshUsage();
    this.onLogin(this.user, this.usage);
  }

  logout() {
    this._handleLogout();
  }

  _handleLogout() {
    this.token = null;
    this.user  = null;
    this.usage = null;
    localStorage.removeItem('ls_tok');
    this.onLogout();
  }

  // ── USAGE ──
  async refreshUsage() {
    const d = await this._fetch('GET', `/auth/me?product=${this.product}`);
    if (d?.usage) {
      this.usage = d.usage;
      this.onUsageUpdate(this.usage);
    }
    return this.usage;
  }

  // ── PROFILE ──
  async loadProfile() {
    const d = await this._fetch('GET', `/auth/profile?product=${this.product}`);
    return d?.profile || {};
  }

  async saveProfile(profile) {
    return this._fetch('POST', `/auth/profile?product=${this.product}`, { profile });
  }

  // ── BILLING ──
  async checkout(planKey) {
    const d = await this._fetch('POST', '/billing/checkout', { planKey });
    if (d?.url) window.location.href = d.url;
    return d;
  }

  async openPortal() {
    const d = await this._fetch('POST', '/billing/portal');
    if (d?.url) window.location.href = d.url;
    return d;
  }

  async getPlans() {
    return this._fetch('GET', '/billing/plans');
  }

  // ── LIMIT HELPERS ──
  canChat() {
    if (!this.usage) return true; // allow if unknown
    const { used, limit } = this.usage.chat;
    if (limit === null || limit === Infinity) return true;
    return used < limit;
  }

  canAnalyse() {
    if (!this.usage) return true;
    const { used, limit, hasOneTime } = this.usage.analysis;
    if (hasOneTime) return true;
    if (limit === null || limit === Infinity) return true;
    return used < limit;
  }

  hasProduct(product) {
    if (!this.user) return false;
    return this.user.products === 'both' || this.user.products === product;
  }

  // ── LIMIT ERROR HANDLER ──
  handleLimitError(code) {
    const msgs = {
      wrong_product:          `Your current plan does not include LexSelf ${this.product === 'family' ? 'Family' : 'Criminal'}.`,
      free_chat_exhausted:    "You've used all 10 free chat messages. Upgrade to continue.",
      daily_chat_limit:       "You've reached your 50 daily chat messages. Upgrade to Complete for unlimited.",
      free_analysis_exhausted:"You've used your free disclosure analysis. Upgrade to continue.",
      monthly_analysis_limit: "You've used all 3 analyses this month. Upgrade to Complete for unlimited.",
    };
    return msgs[code] || 'You have reached your plan limit.';
  }
}

// Export for both module and browser environments
if (typeof module !== 'undefined') module.exports = LexSelfAuth;
else window.LexSelfAuth = LexSelfAuth;
