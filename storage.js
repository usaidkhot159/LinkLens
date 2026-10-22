/* LinkLens — local storage for scan history and settings.
 * Everything stays in this browser. Falls back to memory if localStorage is blocked. */
(function (g) {
  'use strict';
  const LL = (g.LinkLens = g.LinkLens || {});

  const KEY_HISTORY = 'linklens.history.v1';
  const KEY_SETTINGS = 'linklens.settings.v1';
  const memory = {};

  const DEFAULT_SETTINGS = {
    theme: null,
    saveHistory: true,
    useReputation: false,
    reputationEndpoint: '/api/reputation',
    bestQuiz: 0
  };

  function backend() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const probe = '__linklens_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }

  function read(key, fallback) {
    try {
      const store = backend();
      const raw = store ? store.getItem(key) : memory[key];
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    const raw = JSON.stringify(value);
    try {
      const store = backend();
      if (store) store.setItem(key, raw);
      else memory[key] = raw;
    } catch (e) {
      memory[key] = raw;
    }
  }

  function loadHistory() {
    const list = read(KEY_HISTORY, []);
    return Array.isArray(list) ? list : [];
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* Save a compact copy of a finished analysis. Returns the stored entry. */
  function addScan(result) {
    const entry = {
      id: makeId(),
      time: result.analyzedAt || Date.now(),
      input: result.parsed.input,
      href: result.parsed.href,
      host: result.parsed.registeredDomain,
      score: result.score,
      bandId: result.band.id,
      bandLabel: result.band.label,
      findings: result.findings.map(function (f) {
        return { id: f.id, title: f.title, points: f.points, severity: f.severity };
      })
    };
    const limit = (LL.config && LL.config.historyLimit) || 50;
    const list = [entry].concat(loadHistory()).slice(0, limit);
    write(KEY_HISTORY, list);
    return entry;
  }

  function removeScan(id) {
    write(KEY_HISTORY, loadHistory().filter(function (e) { return e.id !== id; }));
  }

  function clearHistory() {
    write(KEY_HISTORY, []);
  }

  function loadSettings() {
    const saved = read(KEY_SETTINGS, {});
    return Object.assign({}, DEFAULT_SETTINGS, saved && typeof saved === 'object' ? saved : {});
  }

  function saveSettings(settings) {
    write(KEY_SETTINGS, settings);
  }

  LL.storage = {
    loadHistory: loadHistory,
    addScan: addScan,
    removeScan: removeScan,
    clearHistory: clearHistory,
    loadSettings: loadSettings,
    saveSettings: saveSettings
  };
})(typeof window !== 'undefined' ? window : globalThis);
