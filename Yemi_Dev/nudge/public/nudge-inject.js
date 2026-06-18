/*
 * nudge-inject.js  --  Nudge guided-overlay copilot (injectable, "real websites" build)
 *
 * WHAT THIS IS
 *   A self-contained, dependency-free, classic (non-module) vanilla-JS IIFE that turns
 *   ANY webpage into a Nudge-guided page when injected. It draws a glowing ring, an
 *   animated ghost cursor, and an instruction tooltip over the REAL element the user
 *   should interact with next, then advances as the user follows along.
 *
 * HOW IT IS LOADED
 *   Bookmarklet (one line in a browser bookmark):
 *     javascript:(function(){var s=document.createElement('script');
 *       s.src='https://YOUR-HOST/nudge-inject.js';document.body.appendChild(s);})();
 *   Or injected directly in tests via Playwright (page.addScriptTag / addInitScript).
 *
 * SAFETY
 *   - Everything is wrapped in a try/catch IIFE so it never throws into the host page.
 *   - All of Nudge's UI lives in a Shadow DOM, isolated from the host site's CSS.
 *   - Re-injection just re-opens the existing task bar instead of double-injecting.
 *
 * OPTIONAL AI BRAIN
 *   Set window.__NUDGE_API to a URL before/after injecting. When present, Nudge POSTs
 *   {task, marks, history} and uses {instruction, index} if returned. Heuristic otherwise.
 */
(function () {
  'use strict';
  try {
    // ---- Re-injection guard ------------------------------------------------
    if (window.__nudge && typeof window.__nudge.open === 'function') {
      window.__nudge.open();
      return;
    }

    var Z = 2147483600; // very high z-index for the host div
    var EMBER = '#FF6B35';
    var STOP = {
      the: 1, a: 1, an: 1, to: 1, into: 1, my: 1, your: 1, our: 1, click: 1,
      on: 1, and: 1, of: 1, for: 1, in: 1, with: 1, please: 1, want: 1, i: 1,
      me: 1, this: 1, that: 1, page: 1, go: 1, get: 1, do: 1, can: 1, you: 1,
      it: 1, is: 1, at: 1, by: 1, or: 1
    };

    // ---- State -------------------------------------------------------------
    var state = {
      task: '',
      active: false,
      target: null,        // current target element
      instruction: '',
      marks: [],           // last scan
      clickedEls: [],      // elements user already actioned
      excluded: [],        // elements skipped this round
      rafId: 0,
      stepCount: 0
    };

    // ---- Shadow host + root ------------------------------------------------
    var host = document.createElement('div');
    host.setAttribute('data-nudge-host', '');
    host.style.cssText =
      'position:fixed;inset:0;pointer-events:none;margin:0;padding:0;border:0;' +
      'z-index:' + Z + ';';
    (document.documentElement || document.body).appendChild(host);

    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    var style = document.createElement('style');
    style.textContent =
      ':host{all:initial;}' +
      '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}' +
      '.nudge-bar{position:fixed;top:16px;left:50%;transform:translateX(-50%);' +
      'display:flex;align-items:center;gap:8px;pointer-events:auto;' +
      'background:#15181d;color:#f2f4f7;border:1px solid #2a2f37;border-radius:14px;' +
      'padding:8px 10px;box-shadow:0 10px 30px rgba(0,0,0,.45);max-width:92vw;}' +
      '.nudge-bar input{flex:1;min-width:220px;background:#0f1216;color:#f2f4f7;' +
      'border:1px solid #2a2f37;border-radius:9px;padding:9px 11px;font-size:14px;outline:none;}' +
      '.nudge-bar input:focus{border-color:' + EMBER + ';}' +
      '.nudge-bar input::placeholder{color:#8a93a0;}' +
      '.nudge-btn{cursor:pointer;border:0;border-radius:9px;padding:9px 12px;font-size:13px;' +
      'font-weight:600;white-space:nowrap;}' +
      '.nudge-go{background:' + EMBER + ';color:#1a1004;}' +
      '.nudge-go:hover{filter:brightness(1.08);}' +
      '.nudge-skip{background:#222831;color:#cdd3db;}' +
      '.nudge-skip:hover{background:#2b323c;}' +
      '.nudge-close{background:transparent;color:#9aa3ae;font-size:18px;line-height:1;padding:6px 8px;}' +
      '.nudge-close:hover{color:#fff;}' +
      '.nudge-status{position:fixed;top:62px;left:50%;transform:translateX(-50%);' +
      'pointer-events:none;background:rgba(15,18,22,.92);color:#cdd3db;border:1px solid #2a2f37;' +
      'border-radius:8px;padding:5px 10px;font-size:12px;max-width:92vw;text-align:center;' +
      'box-shadow:0 6px 18px rgba(0,0,0,.35);}' +
      '.nudge-overlay{position:fixed;inset:0;pointer-events:none;overflow:visible;}' +
      '.nudge-ring{position:fixed;border:2px solid ' + EMBER + ';border-radius:10px;' +
      'box-shadow:0 0 0 3px rgba(255,107,53,.25),0 0 22px 6px rgba(255,107,53,.55);' +
      'transition:top .18s ease,left .18s ease,width .18s ease,height .18s ease;' +
      'animation:nudgePulse 1.4s ease-in-out infinite;}' +
      '@keyframes nudgePulse{0%,100%{box-shadow:0 0 0 3px rgba(255,107,53,.22),0 0 18px 5px rgba(255,107,53,.45);}' +
      '50%{box-shadow:0 0 0 5px rgba(255,107,53,.32),0 0 30px 10px rgba(255,107,53,.7);}}' +
      '.nudge-cursor{position:fixed;width:30px;height:30px;pointer-events:none;' +
      'transition:transform .35s cubic-bezier(.22,1,.36,1);' +
      'filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));z-index:2;}' +
      '.nudge-tip{position:fixed;max-width:280px;pointer-events:none;background:#15181d;' +
      'color:#f2f4f7;border:1px solid ' + EMBER + ';border-radius:10px;padding:9px 12px;' +
      'font-size:13px;line-height:1.35;box-shadow:0 10px 26px rgba(0,0,0,.5);' +
      'transition:top .18s ease,left .18s ease;z-index:3;}' +
      '.nudge-tip b{color:' + EMBER + ';}' +
      '.nudge-hidden{display:none !important;}';
    root.appendChild(style);

    // ---- Task bar ----------------------------------------------------------
    var bar = document.createElement('div');
    bar.className = 'nudge-bar';

    var input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('placeholder', 'What do you want to do on this page?');

    var goBtn = document.createElement('button');
    goBtn.className = 'nudge-btn nudge-go';
    goBtn.textContent = 'Guide me';

    var skipBtn = document.createElement('button');
    skipBtn.className = 'nudge-btn nudge-skip';
    skipBtn.textContent = 'Skip';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'nudge-btn nudge-close';
    closeBtn.setAttribute('aria-label', 'Close Nudge');
    closeBtn.innerHTML = '&#215;'; // multiplication sign (close glyph)

    bar.appendChild(input);
    bar.appendChild(goBtn);
    bar.appendChild(skipBtn);
    bar.appendChild(closeBtn);
    root.appendChild(bar);

    var statusEl = document.createElement('div');
    statusEl.className = 'nudge-status nudge-hidden';
    root.appendChild(statusEl);

    // ---- Guidance overlay --------------------------------------------------
    var overlay = document.createElement('div');
    overlay.className = 'nudge-overlay nudge-hidden';

    var ring = document.createElement('div');
    ring.className = 'nudge-ring';

    var cursor = document.createElement('div');
    cursor.className = 'nudge-cursor';
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24" width="30" height="30" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 13.5 L19 13.5 Z" ' +
      'fill="#ffffff" stroke="#15181d" stroke-width="1.2" stroke-linejoin="round"/></svg>';

    var tip = document.createElement('div');
    tip.className = 'nudge-tip';

    overlay.appendChild(ring);
    overlay.appendChild(cursor);
    overlay.appendChild(tip);
    root.appendChild(overlay);

    // ---- Helpers -----------------------------------------------------------
    function setStatus(msg) {
      statusEl.textContent = msg || '';
      if (msg) statusEl.classList.remove('nudge-hidden');
      else statusEl.classList.add('nudge-hidden');
    }

    function isVisible(el) {
      try {
        var st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) {
          return false;
        }
        var r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        // within or near the viewport (allow generous off-screen margin)
        var vw = window.innerWidth || document.documentElement.clientWidth;
        var vh = window.innerHeight || document.documentElement.clientHeight;
        if (r.bottom < -vh || r.top > vh * 2) return false;
        if (r.right < -vw || r.left > vw * 2) return false;
        return true;
      } catch (e) {
        return false;
      }
    }

    function labelFor(el) {
      var candidates = [
        el.getAttribute && el.getAttribute('aria-label'),
        el.getAttribute && el.getAttribute('placeholder'),
        el.innerText,
        el.value,
        el.getAttribute && el.getAttribute('name'),
        el.getAttribute && el.getAttribute('title')
      ];
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (c && String(c).trim()) {
          var t = String(c).replace(/\s+/g, ' ').trim();
          return t.length > 80 ? t.slice(0, 80) : t;
        }
      }
      return '';
    }

    function roleFor(el) {
      var explicit = el.getAttribute && el.getAttribute('role');
      if (explicit) return explicit.toLowerCase();
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'input') {
        var ty = (el.getAttribute('type') || 'text').toLowerCase();
        return 'input:' + ty;
      }
      if (tag === 'textarea') return 'textbox';
      if (tag === 'select') return 'select';
      return tag || 'element';
    }

    function scanInteractive() {
      var sel = 'a[href], button, input:not([type=hidden]), textarea, select, ' +
        '[role=button], [role=link], [role=textbox], [role=searchbox], ' +
        '[role=menuitem], [onclick], [tabindex]:not([tabindex="-1"])';
      var nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch (e) {
        nodes = [];
      }
      var seen = [];
      var marks = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || seen.indexOf(el) !== -1) continue;
        // skip our own UI (it lives in shadow DOM, but be safe)
        if (el === host || (host.contains && host.contains(el))) continue;
        if (!isVisible(el)) continue;
        seen.push(el);
        var label = labelFor(el);
        marks.push({
          el: el,
          label: label,
          role: roleFor(el),
          rect: el.getBoundingClientRect()
        });
      }
      return marks;
    }

    function tokenize(s) {
      var out = [];
      var parts = String(s || '').toLowerCase().split(/[^a-z0-9]+/);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p && p.length > 1 && !STOP[p]) out.push(p);
      }
      return out;
    }

    function area(rect) {
      return Math.max(0, rect.width) * Math.max(0, rect.height);
    }

    // Heuristic relevance ranker. No network needed.
    function scoreMark(mark, taskTokens, taskRaw) {
      var label = (mark.label || '').toLowerCase();
      var labelTokens = tokenize(label);
      var score = 0;

      // strong: token overlap between task and label
      for (var i = 0; i < taskTokens.length; i++) {
        var tk = taskTokens[i];
        for (var j = 0; j < labelTokens.length; j++) {
          if (labelTokens[j] === tk) { score += 6; }
          else if (labelTokens[j].indexOf(tk) !== -1 || tk.indexOf(labelTokens[j]) !== -1) { score += 2; }
        }
        // also reward raw substring of the token in the label
        if (tk.length > 2 && label.indexOf(tk) !== -1) score += 1;
      }

      var role = mark.role || '';
      var name = (mark.el.getAttribute && (mark.el.getAttribute('name') || '')) || '';
      var phType = ((mark.el.getAttribute && (mark.el.getAttribute('placeholder') || '')) + ' ' + role + ' ' + name).toLowerCase();

      // search intent
      if (/\bsearch\b|\bfind\b|\blook up\b/.test(taskRaw)) {
        if (role.indexOf('input') === 0 || role === 'textbox' || role === 'searchbox') {
          if (phType.indexOf('search') !== -1 || name.toLowerCase() === 'q' || role === 'searchbox' || role === 'input:search') {
            score += 10;
          } else {
            score += 3;
          }
        }
      }

      // sign in / log in intent
      if (/\bsign ?in\b|\blog ?in\b|\blogin\b|\bsign ?up\b|\bregister\b/.test(taskRaw)) {
        if (role === 'button' || role === 'link') {
          if (/sign ?in|log ?in|login|sign ?up|register/.test(label)) score += 9;
        }
      }

      // next / continue / submit intent
      if (/\bnext\b|\bcontinue\b|\bsubmit\b|\bproceed\b/.test(taskRaw)) {
        if (role === 'button' || role === 'input:submit') {
          if (/next|continue|submit|proceed/.test(label)) score += 8;
        }
      }

      // generic intent: typing / writing -> favor text inputs
      if (/\btype\b|\benter\b|\bwrite\b|\bfill\b|\bemail\b|\bname\b|\bpassword\b/.test(taskRaw)) {
        if (role.indexOf('input') === 0 || role === 'textbox') score += 2;
      }

      // demote already-clicked elements
      if (state.clickedEls.indexOf(mark.el) !== -1) score -= 100;
      if (state.excluded.indexOf(mark.el) !== -1) score -= 100;

      return score;
    }

    function prominenceScore(mark) {
      // fallback ranker when nothing matches the task
      var role = mark.role || '';
      var base = 0;
      if (role === 'button' || role === 'input:submit') base = 3;
      else if (role === 'link') base = 1.5;
      else if (role.indexOf('input') === 0 || role === 'textbox') base = 1;
      var a = area(mark.rect);
      if (state.clickedEls.indexOf(mark.el) !== -1) base -= 100;
      if (state.excluded.indexOf(mark.el) !== -1) base -= 100;
      return base * 1000 + Math.min(a, 200000) / 1000;
    }

    function heuristicPlan(task, marks) {
      var taskRaw = String(task || '').toLowerCase();
      var taskTokens = tokenize(task);
      var best = null, bestScore = 0;
      for (var i = 0; i < marks.length; i++) {
        var s = scoreMark(marks[i], taskTokens, taskRaw);
        if (s > bestScore) { bestScore = s; best = marks[i]; }
      }
      if (best && bestScore > 0) {
        var lbl = best.label || '(this element)';
        return { el: best.el, instruction: 'Click "' + lbl + '"' };
      }
      // fallback: most prominent button/link
      var fb = null, fbScore = -Infinity;
      for (var k = 0; k < marks.length; k++) {
        var ps = prominenceScore(marks[k]);
        if (ps > fbScore) { fbScore = ps; fb = marks[k]; }
      }
      if (fb) {
        return { el: fb.el, instruction: 'Best guess - click here' };
      }
      return null;
    }

    // Optional AI brain. Returns a Promise that resolves to {el, instruction} or null.
    function aiPlan(task, marks) {
      return new Promise(function (resolve) {
        var api = window.__NUDGE_API;
        if (!api) { resolve(null); return; }
        try {
          var payload = {
            task: task,
            marks: marks.map(function (m) { return { label: m.label, role: m.role }; }),
            history: state.clickedEls.map(function (el) { return labelFor(el); })
          };
          var done = false;
          var to = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 4000);
          fetch(api, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function (r) { return r.json(); }).then(function (data) {
            if (done) return;
            done = true; clearTimeout(to);
            if (data && typeof data.index === 'number' && marks[data.index]) {
              resolve({
                el: marks[data.index].el,
                instruction: data.instruction || ('Click "' + (marks[data.index].label || '') + '"')
              });
            } else {
              resolve(null);
            }
          }).catch(function () { if (!done) { done = true; clearTimeout(to); resolve(null); } });
        } catch (e) {
          resolve(null);
        }
      });
    }

    function plan(task, marks) {
      // Try AI brain first (graceful), fall back to heuristic.
      return aiPlan(task, marks).then(function (ai) {
        if (ai && ai.el) return ai;
        return heuristicPlan(task, marks);
      }).catch(function () {
        return heuristicPlan(task, marks);
      });
    }

    // ---- Overlay positioning ----------------------------------------------
    function positionOverlay() {
      if (!state.active || !state.target) return;
      var el = state.target;
      if (!el.isConnected) { advance(); return; }
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { return; }
      var pad = 4;
      ring.style.top = (r.top - pad) + 'px';
      ring.style.left = (r.left - pad) + 'px';
      ring.style.width = (r.width + pad * 2) + 'px';
      ring.style.height = (r.height + pad * 2) + 'px';

      // ghost cursor eases to element center
      var cx = r.left + r.width / 2 - 6;
      var cy = r.top + r.height / 2 - 4;
      cursor.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';

      // tooltip near the element (below if room, else above)
      tip.innerHTML = '<b>Nudge</b> &nbsp;' + escapeHtml(state.instruction);
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var vw = window.innerWidth || document.documentElement.clientWidth;
      var tipTop = r.bottom + 12;
      var tipRect = tip.getBoundingClientRect();
      var th = tipRect.height || 48;
      var tw = tipRect.width || 240;
      if (tipTop + th > vh - 8) tipTop = Math.max(8, r.top - th - 12);
      var tipLeft = r.left;
      if (tipLeft + tw > vw - 8) tipLeft = Math.max(8, vw - tw - 8);
      tip.style.top = tipTop + 'px';
      tip.style.left = tipLeft + 'px';
    }

    function escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function rafLoop() {
      if (!state.active) return;
      positionOverlay();
      state.rafId = window.requestAnimationFrame(rafLoop);
    }

    function showOverlay() {
      overlay.classList.remove('nudge-hidden');
      if (!state.rafId) state.rafId = window.requestAnimationFrame(rafLoop);
    }

    function hideOverlay() {
      overlay.classList.add('nudge-hidden');
      if (state.rafId) { window.cancelAnimationFrame(state.rafId); state.rafId = 0; }
    }

    // ---- Flow --------------------------------------------------------------
    function pointAt(result) {
      if (!result || !result.el) {
        state.target = null;
        setStatus('No matching element found. Try rephrasing the task.');
        hideOverlay();
        return;
      }
      state.target = result.el;
      state.instruction = result.instruction || 'Click here';
      state.stepCount += 1;
      setStatus('Step ' + state.stepCount + ': ' + state.instruction);
      // scroll into view once when first targeted
      try {
        var r = result.el.getBoundingClientRect();
        var vh = window.innerHeight || document.documentElement.clientHeight;
        if (r.top < 0 || r.bottom > vh) {
          result.el.scrollIntoView({ block: 'center' });
        }
      } catch (e) { /* ignore */ }
      showOverlay();
      positionOverlay();
    }

    function planAndPoint() {
      if (!state.task) return;
      setStatus('Looking for the next step...');
      state.marks = scanInteractive();
      plan(state.task, state.marks).then(function (result) {
        pointAt(result);
      }).catch(function () {
        pointAt(heuristicPlan(state.task, state.marks));
      });
    }

    function startGuiding() {
      var t = (input.value || '').trim();
      if (!t) { input.focus(); return; }
      state.task = t;
      state.active = true;
      state.clickedEls = [];
      state.excluded = [];
      state.stepCount = 0;
      planAndPoint();
    }

    // user followed the nudge -> advance to next target
    function advance() {
      state.excluded = []; // reset skip-exclusions for the new step
      setTimeout(planAndPoint, 250);
    }

    function skip() {
      if (state.target) {
        state.excluded.push(state.target);
        state.stepCount = Math.max(0, state.stepCount - 1);
      }
      planAndPoint();
    }

    // capture-phase click listener on the host page
    function onDocClick(e) {
      if (!state.active || !state.target) return;
      try {
        var hit = e.target && e.target.closest ? e.target.closest('*') : e.target;
        // match if the click landed on (or inside) the current target
        if (state.target.contains && state.target.contains(e.target)) {
          if (state.clickedEls.indexOf(state.target) === -1) state.clickedEls.push(state.target);
          advance();
        } else if (hit === state.target) {
          if (state.clickedEls.indexOf(state.target) === -1) state.clickedEls.push(state.target);
          advance();
        }
      } catch (err) { /* ignore */ }
    }

    function onScrollResize() { positionOverlay(); }

    // ---- Teardown ----------------------------------------------------------
    function destroy() {
      try {
        state.active = false;
        hideOverlay();
        document.removeEventListener('click', onDocClick, true);
        window.removeEventListener('scroll', onScrollResize, true);
        window.removeEventListener('resize', onScrollResize, true);
        if (host && host.parentNode) host.parentNode.removeChild(host);
      } catch (e) { /* ignore */ }
      try { delete window.__nudge; } catch (e2) { window.__nudge = undefined; }
    }

    function open() {
      try {
        host.style.display = '';
        bar.classList.remove('nudge-hidden');
        input.focus();
      } catch (e) { /* ignore */ }
    }

    // ---- Wire up events ----------------------------------------------------
    goBtn.addEventListener('click', startGuiding);
    skipBtn.addEventListener('click', skip);
    closeBtn.addEventListener('click', destroy);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); startGuiding(); }
      if (e.key === 'Escape') { e.preventDefault(); destroy(); }
    });

    document.addEventListener('click', onDocClick, true);
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize, true);

    // ---- Public handle -----------------------------------------------------
    window.__nudge = {
      open: open,
      destroy: destroy,
      start: function (task) { if (task) { input.value = task; } startGuiding(); },
      scan: scanInteractive,
      plan: function (task) { return plan(task || state.task, scanInteractive()); },
      _state: state
    };

    // focus the input on first inject
    open();
  } catch (err) {
    // never throw into the host page
    try { if (window.console && console.warn) console.warn('[nudge] init failed:', err); } catch (e) {}
  }
})();
