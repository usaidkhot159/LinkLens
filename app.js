/* LinkLens — application wiring: navigation, form, history view, learn and about views. */
(function () {
  'use strict';
  const LL = window.LinkLens;
  const h = LL.dom.h;
  const $ = function (sel, root) { return (root || document).querySelector(sel); };

  const VIEWS = ['analyze', 'history', 'learn', 'about'];
  const state = { settings: LL.storage.loadSettings(), selected: [], learnMounted: false, toastTimer: null };

  /* ---------- helpers ---------- */
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function saveSettings() {
    LL.storage.saveSettings(state.settings);
  }

  function copyText(text) {
    const done = function () { toast('Report copied to clipboard'); };
    const fallback = function () {
      const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;top:0;left:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy. Select the text manually.'); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* ---------- theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f3ee' : '#15181e');
  }

  function initTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current);
    $('#theme-toggle').addEventListener('click', function () {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      state.settings.theme = next;
      saveSettings();
      applyTheme(next);
    });
  }

  /* ---------- navigation ---------- */
  function showView(name, opts) {
    if (VIEWS.indexOf(name) === -1) name = 'analyze';
    VIEWS.forEach(function (v) {
      $('#view-' + v).hidden = v !== name;
    });
    document.querySelectorAll('.tab').forEach(function (tab) {
      const active = tab.dataset.view === name;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    if (name === 'history') renderHistory();
    if (name === 'learn') mountLearn();
    if (name === 'about') renderAbout();
    if (!opts || !opts.keepHash) {
      if (location.hash !== '#/' + name) history.replaceState(null, '', '#/' + name);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function initNav() {
    const tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { showView(tab.dataset.view); });
      tab.addEventListener('keydown', function (e) {
        let target = null;
        if (e.key === 'ArrowRight') target = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft') target = tabs[(i - 1 + tabs.length) % tabs.length];
        if (target) { e.preventDefault(); target.focus(); showView(target.dataset.view); }
      });
    });
    window.addEventListener('hashchange', function () {
      showView(location.hash.replace('#/', ''), { keepHash: true });
    });
    showView(location.hash.replace('#/', ''), { keepHash: true });
  }

  /* ---------- reputation (optional, server side) ---------- */
  function fetchReputation(href) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 8000);
    return fetch(state.settings.reputationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: href }),
      signal: ctrl.signal
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) return { status: 'error', message: body.error || 'The server answered with status ' + res.status + '.' };
        if (body.status === 'unconfigured') return { status: 'error', message: 'The server has no Safe Browsing API key configured.' };
        return body;
      });
    }).catch(function (err) {
      return { status: 'error', message: err && err.name === 'AbortError' ? 'The reputation server took too long to answer.' : 'The reputation server could not be reached.' };
    }).then(function (result) {
      clearTimeout(timer);
      return result;
    });
  }

  /* ---------- analyze view ---------- */
  function setError(message) {
    $('#input-error').textContent = message || '';
    $('#url-input').setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function runAnalysis(raw) {
    setError('');
    const pre = LL.parser.parse(raw);
    if (!pre.ok) {
      setError(pre.error);
      $('#report-root').textContent = '';
      return Promise.resolve();
    }
    const btn = $('#analyze-btn');
    btn.disabled = true;
    btn.textContent = 'Analyzing…';

    const repPromise = state.settings.useReputation ? fetchReputation(pre.href) : Promise.resolve(undefined);
    return repPromise.then(function (reputation) {
      const result = LL.analyze(raw, { reputation: reputation });
      const root = $('#report-root');
      root.textContent = '';
      root.append(LL.render.renderReport(result, {
        onCopy: copyText,
        onAgain: function () { const input = $('#url-input'); input.select(); input.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      }));
      if (state.settings.saveHistory) {
        LL.storage.addScan(result);
        updateHistoryBadge();
      }
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Analyze URL';
    }, function () {
      btn.disabled = false;
      btn.textContent = 'Analyze URL';
      setError('Something went wrong while analyzing that link. Please try again.');
    });
  }

  function initAnalyze() {
    const input = $('#url-input');
    $('#analyze-form').addEventListener('submit', function (e) {
      e.preventDefault();
      runAnalysis(input.value);
    });
    input.addEventListener('input', function () { if ($('#input-error').textContent) setError(''); });

    const list = $('#sample-list');
    LL.config.samples.forEach(function (sample) {
      list.append(h('button', {
        type: 'button', class: 'chip', title: sample.url,
        onclick: function () { input.value = sample.url; runAnalysis(sample.url); }
      }, sample.label));
    });

    const save = $('#opt-save');
    save.checked = !!state.settings.saveHistory;
    save.addEventListener('change', function () { state.settings.saveHistory = save.checked; saveSettings(); });

    const rep = $('#opt-rep');
    const note = $('#rep-note');
    rep.checked = !!state.settings.useReputation;
    note.hidden = !rep.checked;
    rep.addEventListener('change', function () {
      state.settings.useReputation = rep.checked;
      note.hidden = !rep.checked;
      saveSettings();
    });
  }

  /* ---------- history view ---------- */
  function updateHistoryBadge() {
    const n = LL.storage.loadHistory().length;
    const badge = $('#history-count');
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }

  function updateCompareButton() {
    $('#compare-btn').disabled = state.selected.length !== 2;
  }

  function renderHistory() {
    const list = LL.storage.loadHistory();
    const root = $('#history-root');
    root.textContent = '';
    state.selected = state.selected.filter(function (id) { return list.some(function (e) { return e.id === id; }); });
    $('#compare-root').textContent = '';
    $('#clear-history').disabled = list.length === 0;

    if (!list.length) {
      root.append(h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'No scans saved yet'),
        h('p', { class: 'muted' }, 'Analyze a link with "Save scans to local history" switched on and it will appear here.'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { showView('analyze'); } }, 'Analyze a link')));
      updateCompareButton();
      updateHistoryBadge();
      return;
    }

    const ul = h('ul', { class: 'history-list' });
    list.forEach(function (entry) {
      const band = LL.bandFor(entry.score);
      const checkbox = h('input', {
        type: 'checkbox', id: 'sel-' + entry.id, 'aria-label': 'Select this scan for comparison',
        onchange: function (e) {
          if (e.target.checked) {
            if (state.selected.length >= 2) { e.target.checked = false; toast('You can compare two scans at a time.'); return; }
            state.selected.push(entry.id);
          } else {
            state.selected = state.selected.filter(function (id) { return id !== entry.id; });
          }
          updateCompareButton();
        }
      });
      checkbox.checked = state.selected.indexOf(entry.id) !== -1;
      ul.append(h('li', { class: 'history-item' },
        h('div', { class: 'hi-check' }, checkbox),
        h('div', { class: 'hi-score band-' + band.id }, h('strong', null, String(entry.score)), h('span', null, band.label)),
        h('div', { class: 'hi-main' },
          h('p', { class: 'mono hi-url' }, entry.href),
          h('p', { class: 'muted' }, entry.host + ' · ' + new Date(entry.time).toLocaleString() + ' · ' + entry.findings.filter(function (f) { return f.points > 0; }).length + ' scored indicators')),
        h('div', { class: 'hi-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () {
            $('#url-input').value = entry.input;
            showView('analyze');
            runAnalysis(entry.input);
          } }, 'Re-analyze'),
          h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: function () {
            LL.storage.removeScan(entry.id);
            renderHistory();
            toast('Scan deleted');
          } }, 'Delete'))));
    });
    root.append(ul);
    updateCompareButton();
    updateHistoryBadge();
  }

  function initHistory() {
    $('#compare-btn').addEventListener('click', function () {
      if (state.selected.length !== 2) return;
      const list = LL.storage.loadHistory();
      const a = list.find(function (e) { return e.id === state.selected[0]; });
      const b = list.find(function (e) { return e.id === state.selected[1]; });
      if (!a || !b) return;
      const root = $('#compare-root');
      root.textContent = '';
      root.append(LL.render.renderComparison(a, b));
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#clear-history').addEventListener('click', function () {
      if (!LL.storage.loadHistory().length) return;
      if (window.confirm('Delete all saved scans from this browser? This cannot be undone.')) {
        LL.storage.clearHistory();
        state.selected = [];
        renderHistory();
        toast('History deleted');
      }
    });
    updateHistoryBadge();
  }

  /* ---------- learn view ---------- */
  function mountLearn() {
    if (state.learnMounted) return;
    state.learnMounted = true;
    LL.learn.mount($('#learn-root'), {
      onFinish: function (score) {
        if (score > (state.settings.bestQuiz || 0)) {
          state.settings.bestQuiz = score;
          saveSettings();
        }
      }
    }, function () { return state.settings.bestQuiz || 0; });
  }

  /* ---------- about view ---------- */
  function renderAbout() {
    const root = $('#about-root');
    if (root.childElementCount) return;
    const C = LL.config;

    const bands = h('div', { class: 'bands' }, C.bands.map(function (b) {
      return h('div', { class: 'band-card band-' + b.id },
        h('strong', null, b.min + '–' + b.max),
        h('span', null, b.label));
    }));

    const groups = {};
    C.indicators.forEach(function (i) { (groups[i.category] = groups[i.category] || []).push(i); });
    const tables = Object.keys(groups).map(function (cat) {
      return h('section', { class: 'panel' },
        h('h3', { class: 'panel-title' }, cat),
        h('div', { class: 'table-wrap' }, h('table', { class: 'indicator-table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Indicator'), h('th', { scope: 'col' }, 'What it means'), h('th', { scope: 'col', class: 'num' }, 'Points'))),
          h('tbody', null, groups[cat].map(function (i) {
            return h('tr', null,
              h('th', { scope: 'row' }, i.title),
              h('td', { class: 'meaning' }, i.description),
              h('td', { class: 'num' }, (i.perItem ? 'up to ' : '+') + i.points));
          })))));
    });

    root.append(
      h('section', { class: 'panel' },
        h('h3', { class: 'panel-title' }, 'Score labels'),
        bands,
        h('p', { class: 'panel-sub' }, 'A score is an estimate, not a guarantee. A URL with a low score can still be malicious, and a high score does not prove that it is.')),
      ...tables,
      h('section', { class: 'panel' },
        h('h3', { class: 'panel-title' }, 'What LinkLens does not do'),
        h('ul', { class: 'plain-list' },
          h('li', null, 'It never opens, fetches or follows the link. It only reads the text of the address.'),
          h('li', null, 'It cannot see the page content, so it cannot tell whether the page itself is a fake.'),
          h('li', null, 'It uses a short built-in list of well-known names, not a full threat database.'),
          h('li', null, 'Live reputation checks are optional, run on your own server, and send the link to the provider you configure.'))));
  }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    $('#app-version').textContent = LL.config.version;
    initTheme();
    initAnalyze();
    initHistory();
    initNav();
  });
})();
