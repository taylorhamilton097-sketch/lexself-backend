/**
 * ClearStand client auth helper.
 *
 * Drop this script on any page that makes authenticated fetch() calls to
 * /api/... — it wraps window.fetch to automatically handle the three
 * session-ending 401 codes introduced in Session 2:
 *
 *   SESSION_SUPERSEDED — signed in elsewhere, this device was kicked
 *   PASSWORD_CHANGED   — password changed, all tokens invalidated
 *   TOKEN_INVALID      — tampered / expired token (legacy behaviour)
 *
 * On any of these, we clear the token and show a full-page modal explaining
 * what happened, with a button to sign in again.
 *
 * Usage: <script src="/js/auth-client.js" defer></script>
 * Include BEFORE any page script that calls fetch for /api endpoints.
 */
(function () {
  'use strict';

  const TOKEN_KEYS = ['clearstand_token', 'token', 'authToken']; // tolerant of legacy keys

  function clearAllTokens() {
    TOKEN_KEYS.forEach((k) => {
      try { localStorage.removeItem(k); } catch (_) {}
      try { sessionStorage.removeItem(k); } catch (_) {}
    });
  }

  let modalShown = false;

  function showKickModal(kind) {
    if (modalShown) return;
    modalShown = true;

    const titles = {
      SESSION_SUPERSEDED: 'Signed out on another device',
      PASSWORD_CHANGED:   'Password changed',
      TOKEN_INVALID:      'Session expired',
    };
    const bodies = {
      SESSION_SUPERSEDED:
        'You were signed out because this account signed in on another device. ' +
        'ClearStand accounts are limited to two active devices at a time. ' +
        'If this wasn\u2019t you, please change your password right away.',
      PASSWORD_CHANGED:
        'The password on this account was changed. For your security, all other ' +
        'devices have been signed out. Please sign in again.',
      TOKEN_INVALID:
        'Your session has expired. Please sign in again to continue.',
    };

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:999999',
      'background:rgba(13,27,42,.72)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:20px', 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'background:#fff', 'border-radius:8px', 'max-width:480px', 'width:100%',
      'padding:28px 28px 24px', 'box-shadow:0 20px 60px rgba(0,0,0,.3)',
      'color:#0D1B2A',
    ].join(';');

    const h = document.createElement('h2');
    h.textContent = titles[kind] || 'Signed out';
    h.style.cssText = 'margin:0 0 12px;font-size:20px;font-weight:600;color:#0D1B2A;';

    const p = document.createElement('p');
    p.textContent = bodies[kind] || bodies.TOKEN_INVALID;
    p.style.cssText = 'margin:0 0 20px;font-size:14px;line-height:1.5;color:#344;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';

    const signIn = document.createElement('button');
    signIn.type = 'button';
    signIn.textContent = 'Sign in again';
    signIn.style.cssText = [
      'background:#2E86C1', 'color:#fff', 'border:0', 'border-radius:6px',
      'padding:10px 18px', 'font-size:14px', 'font-weight:600', 'cursor:pointer',
    ].join(';');
    signIn.addEventListener('click', () => {
      window.location.href = '/register?mode=signin';
    });

    const pwLink = document.createElement('a');
    pwLink.textContent = 'Change password';
    pwLink.href = '/account#security';
    pwLink.style.cssText = [
      'align-self:center', 'color:#2E86C1', 'font-size:13px',
      'text-decoration:underline', 'margin-left:6px',
    ].join(';');

    btnRow.appendChild(signIn);
    if (kind === 'SESSION_SUPERSEDED') btnRow.appendChild(pwLink);

    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(btnRow);
    overlay.appendChild(card);

    if (document.body) {
      document.body.appendChild(overlay);
      setTimeout(() => signIn.focus(), 50);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(overlay);
        setTimeout(() => signIn.focus(), 50);
      });
    }
  }

  // Peek at a 401 response without consuming its body for the caller.
  async function peekBody(res) {
    try {
      const clone = res.clone();
      const data = await clone.json();
      return data || {};
    } catch (_) { return {}; }
  }

  const KICK_CODES = new Set(['SESSION_SUPERSEDED', 'PASSWORD_CHANGED', 'TOKEN_INVALID']);

  const origFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const res = await origFetch(input, init);
    try {
      if (res && res.status === 401) {
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        // Only intercept API calls — leave page loads and third-party calls alone.
        if (/\/api\//.test(url)) {
          const body = await peekBody(res);
          if (body && KICK_CODES.has(body.code)) {
            clearAllTokens();
            showKickModal(body.code);
          }
        }
      }
    } catch (_) { /* never let this wrapper throw */ }
    return res;
  };

  // Expose a manual trigger for testing: window.__clearstandForceKick('SESSION_SUPERSEDED')
  window.__clearstandForceKick = showKickModal;
})();
