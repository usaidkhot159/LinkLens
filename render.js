/* LinkLens — rendering. Builds the report DOM with textContent only (never innerHTML),
 * so nothing from a pasted link can inject markup. */
(function (g) {
  'use strict';
  const LL = (g.LinkLens = g.LinkLens || {});

  /* ---------- tiny DOM helpers ---------- */
  function applyProps(node, props) {
    Object.keys(props || {}).forEach(function (key) {
      const v = props[key];
      if (v == null || v === false) return;
      if (key === 'class') node.setAttribute('class', v);
      else if (key === 'text') node.textContent = v;
      else if (key.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(key.slice(2).toLowerCase(), v);
      else node.setAttribute(key, v === true ? '' : String(v));
    });
  }

  function appendKids(node, kids) {
    kids.forEach(function (kid) {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) appendKids(node, kid);
      else node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
  }

  function h(tag, props) {
    const node = document.createElement(tag);
    applyProps(node, props);
    appendKids(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }

  function s(tag, props) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    applyProps(node, props);
    appendKids(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }

  const SEVERITY = {
    danger: { label: 'Strong signal', order: 0 },
    warn: { label: 'Warning', order: 1 },
    info: { label: 'Note', order: 2 },
    good: { label: 'Good sign', order: 3 }
  };

  /* ---------- gauge ---------- */
  function gauge(score, band) {
    const arc = 'M 20 110 A 90 90 0 0 1 200 110';
    const fill = s('path', {
      d: arc, pathLength: '100', class: 'gauge-fill band-' + band.id + (score === 0 ? ' is-empty' : ''),
      'stroke-dasharray': '100', 'stroke-dashoffset': '100'
    });
    const svg = s('svg', {
      viewBox: '0 0 220 130', class: 'gauge', role: 'img',
      'aria-label': 'Risk score ' + score + ' out of 100: ' + band.label
    },
    s('path', { d: arc, pathLength: '100', class: 'gauge-track' }),
    fill,
    s('text', { x: '110', y: '94', class: 'gauge-score', 'text-anchor': 'middle' }, String(score)),
    s('text', { x: '110', y: '114', class: 'gauge-max', 'text-anchor': 'middle' }, 'out of 100'));
    const go = function () { fill.setAttribute('stroke-dashoffset', String(100 - score)); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { requestAnimationFrame(go); });
    else go();
    return svg;
  }

  /* ---------- domain breakdown ---------- */
  function segment(cls, text, title) {
    return h('span', { class: 'seg ' + cls, title: title }, text);
  }

  function anatomyBar(p) {
    const parts = [segment('seg-scheme', p.scheme + '://', 'Scheme')];
    if (p.hasCredentials) {
      parts.push(segment('seg-user', p.username + (p.password ? ':' + p.password : '') + '@', 'Username part (ignored for routing)'));
    }
    if (p.isIP) {
      parts.push(segment('seg-domain', p.hostname, 'IP address'));
    } else {
      if (p.subdomain) parts.push(segment('seg-sub', p.subdomain + '.', 'Subdomain'));
      parts.push(segment('seg-domain', p.registeredDomain, 'Registered domain: this is who controls the site'));
    }
    if (p.port) parts.push(segment('seg-port', ':' + p.port, 'Port'));
    if (p.path && p.path !== '/') parts.push(segment('seg-path', p.path, 'Path'));
    else if (p.path === '/') parts.push(segment('seg-path', '/', 'Path'));
    if (p.query) parts.push(segment('seg-query', p.query, 'Query parameters'));
    if (p.hash) parts.push(segment('seg-hash', p.hash, 'Fragment'));
    return h('div', { class: 'anatomy-bar', role: 'img', 'aria-label': 'URL shown in colored parts' }, parts);
  }

  function legend() {
    const items = [
      ['seg-scheme', 'Scheme'], ['seg-sub', 'Subdomain'], ['seg-domain', 'Registered domain'],
      ['seg-path', 'Path'], ['seg-query', 'Query'], ['seg-hash', 'Fragment']
    ];
    return h('ul', { class: 'legend' }, items.map(function (i) {
      return h('li', null, h('span', { class: 'dot ' + i[0] }), i[1]);
    }));
  }

  function row(label, valueNode, meaning) {
    return h('tr', null,
      h('th', { scope: 'row' }, label),
      h('td', { class: 'mono-cell' }, valueNode),
      h('td', { class: 'meaning' }, meaning));
  }

  function code(text) {
    return h('code', null, text);
  }

  function anatomyTable(p) {
    const rows = [];
    rows.push(row('Scheme', code(p.scheme), p.scheme === 'https' ? 'Encrypted connection.' : 'Not an encrypted HTTPS connection.'));
    if (p.hasCredentials) rows.push(row('Username part', code(p.username + (p.password ? ':' + p.password : '') + '@'), 'Not the website. It is ignored when deciding where the link goes.'));
    rows.push(row('Hostname', code(p.hostname), 'The server this link connects to.'));
    if (p.hasIdn) rows.push(row('Shown as (Unicode)', code(p.unicodeHostname), 'How some browsers may display the name. Check for look-alike characters.'));
    if (!p.isIP) {
      rows.push(row('Subdomain', p.subdomain ? code(p.subdomain) : h('span', { class: 'none' }, 'none'), 'Chosen by the owner of the registered domain, so it can say anything.'));
      rows.push(row('Registered domain', code(p.registeredDomain), 'Who actually controls this site. This is the part to verify.'));
      rows.push(row('Public suffix', code(p.suffix), 'The ending (approximate: LinkLens uses a short built-in list).'));
    }
    rows.push(row('Port', p.port ? code(p.port) : h('span', { class: 'none' }, 'default'), p.port ? 'An explicit, non-default port.' : 'The standard port for this scheme.'));
    rows.push(row('Path', code(p.path), 'Which page on the site. The site owner can choose this freely.'));
    const paramNode = p.params.length
      ? h('ul', { class: 'param-list' }, p.params.map(function (q) {
        return h('li', null, code(q.name), h('span', { class: 'eq' }, ' = '), code(q.value === '' ? '(empty)' : q.value));
      }))
      : h('span', { class: 'none' }, 'none');
    rows.push(row('Query parameters', paramNode, 'Extra data sent to the page. Redirect targets sometimes hide here.'));
    rows.push(row('Fragment', p.hash ? code(p.hash) : h('span', { class: 'none' }, 'none'), 'Stays in your browser and is not sent to the server.'));
    return h('div', { class: 'table-wrap' }, h('table', { class: 'anatomy-table' },
      h('caption', { class: 'sr-only' }, 'Parts of the URL'),
      h('tbody', null, rows)));
  }

  function destinationCallout(p) {
    const label = p.isIP ? 'IP address' : 'Registered domain';
    return h('div', { class: 'destination' },
      h('span', { class: 'destination-label' }, 'This link actually points to'),
      h('strong', { class: 'destination-value' }, p.registeredDomain),
      h('span', { class: 'destination-note' }, label + ' — verify this part, not the words in front of it.'));
  }

  /* ---------- findings ---------- */
  function findingCard(f) {
    const sev = SEVERITY[f.severity] || SEVERITY.info;
    const chips = (f.evidence || []).slice(0, 6).map(function (e) { return h('code', { class: 'chip-code' }, e); });
    return h('li', { class: 'finding sev-' + f.severity },
      h('div', { class: 'finding-head' },
        h('span', { class: 'sev-badge' }, sev.label),
        h('span', { class: 'finding-cat' }, f.category),
        h('span', { class: 'finding-points', title: 'Points added to the score' }, f.points > 0 ? '+' + f.points : '0 pts')),
      h('h4', { class: 'finding-title' }, f.title),
      h('p', { class: 'finding-detail' }, f.detail),
      chips.length ? h('div', { class: 'finding-evidence' }, chips) : null);
  }

  function findingsList(findings) {
    const sorted = findings.slice().sort(function (a, b) {
      const sa = (SEVERITY[a.severity] || SEVERITY.info).order;
      const sb = (SEVERITY[b.severity] || SEVERITY.info).order;
      return sa - sb || b.points - a.points;
    });
    return h('ul', { class: 'findings' }, sorted.map(findingCard));
  }

  /* ---------- score breakdown ---------- */
  function scoreBreakdown(result) {
    if (!result.breakdown.length) {
      return h('p', { class: 'muted' }, 'No indicators added points, so the total is 0.');
    }
    const rows = result.breakdown.map(function (b) {
      return h('li', { class: 'bd-row' },
        h('span', { class: 'bd-title' }, b.title),
        h('span', { class: 'bd-bar' }, h('span', { class: 'bd-fill', style: 'width:' + Math.min(100, b.points) + '%' })),
        h('span', { class: 'bd-points' }, '+' + b.points));
    });
    return h('div', null,
      h('ul', { class: 'bd-list' }, rows),
      h('p', { class: 'bd-total' },
        'Total: ' + result.rawTotal + ' points' + (result.capped ? ', capped at 100' : ''),
        ' → ', h('strong', null, result.score + ' / 100')));
  }

  /* ---------- plain-text report ---------- */
  function reportToText(result) {
    const lines = [];
    lines.push('LinkLens report');
    lines.push('URL: ' + result.parsed.href);
    lines.push('Score: ' + result.score + '/100 — ' + result.band.label);
    lines.push('Registered domain: ' + result.parsed.registeredDomain);
    lines.push('');
    lines.push('Findings:');
    result.findings.forEach(function (f) {
      lines.push('- [' + (f.points > 0 ? '+' + f.points : '0') + '] ' + f.title + ': ' + f.detail);
    });
    lines.push('');
    lines.push('Note: the score is an estimate, not a guarantee. A low score can still be a malicious link, and a high score does not prove that it is.');
    return lines.join('\n');
  }

  /* ---------- full report ---------- */
  function renderReport(result, opts) {
    const p = result.parsed;
    const o = opts || {};
    const counts = { danger: 0, warn: 0, info: 0, good: 0 };
    result.findings.forEach(function (f) { counts[f.severity] = (counts[f.severity] || 0) + 1; });

    const hero = h('section', { class: 'report-hero band-card band-' + result.band.id, 'aria-labelledby': 'report-title' },
      h('div', { class: 'hero-gauge' }, gauge(result.score, result.band)),
      h('div', { class: 'hero-text' },
        h('p', { class: 'eyebrow' }, 'Analysis report'),
        h('h2', { id: 'report-title', class: 'verdict' }, result.band.label),
        h('p', { class: 'hero-summary' }, result.summary),
        h('p', { class: 'hero-url mono' }, p.href),
        h('div', { class: 'hero-meta' },
          h('span', { class: 'pill pill-danger' }, counts.danger + ' strong'),
          h('span', { class: 'pill pill-warn' }, counts.warn + ' warnings'),
          h('span', { class: 'pill pill-info' }, counts.info + ' notes'),
          h('span', { class: 'pill pill-good' }, counts.good + ' good signs')),
        h('div', { class: 'hero-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { if (o.onCopy) o.onCopy(reportToText(result)); } }, 'Copy report'),
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { if (o.onAgain) o.onAgain(); } }, 'Check another link'))));

    const disclaimer = h('aside', { class: 'disclaimer', role: 'note' },
      h('strong', null, 'Read this as a signal, not a verdict. '),
      'The score is an estimate. A link with a low score can still be malicious, and a high score does not prove that it is. LinkLens never opens the link; it only reads the text of the address.' +
      (result.reputationChecked ? '' : ' No live reputation service was consulted for this result.'));

    return h('div', { class: 'report' },
      hero,
      h('section', { class: 'panel', 'aria-labelledby': 'anatomy-title' },
        h('h3', { id: 'anatomy-title', class: 'panel-title' }, 'Domain breakdown'),
        destinationCallout(p),
        anatomyBar(p),
        legend(),
        anatomyTable(p)),
      h('section', { class: 'panel', 'aria-labelledby': 'findings-title' },
        h('h3', { id: 'findings-title', class: 'panel-title' }, 'Why this result?'),
        h('p', { class: 'panel-sub' }, 'Every warning is explained, and every point is accounted for.'),
        findingsList(result.findings)),
      h('section', { class: 'panel', 'aria-labelledby': 'score-title' },
        h('h3', { id: 'score-title', class: 'panel-title' }, 'How the score was calculated'),
        scoreBreakdown(result)),
      disclaimer);
  }

  /* ---------- comparison of two saved scans ---------- */
  function scanColumn(label, e) {
    const band = LL.bandFor(e.score);
    return h('div', { class: 'cmp-col band-card band-' + band.id },
      h('p', { class: 'eyebrow' }, label),
      h('p', { class: 'cmp-score' }, String(e.score), h('span', null, ' / 100')),
      h('p', { class: 'cmp-band' }, band.label),
      h('p', { class: 'mono cmp-url' }, e.href),
      h('p', { class: 'muted' }, new Date(e.time).toLocaleString()));
  }

  function renderComparison(a, b) {
    const mapA = new Map(a.findings.map(function (f) { return [f.id, f]; }));
    const mapB = new Map(b.findings.map(function (f) { return [f.id, f]; }));
    const onlyA = a.findings.filter(function (f) { return !mapB.has(f.id); });
    const onlyB = b.findings.filter(function (f) { return !mapA.has(f.id); });
    const both = a.findings.filter(function (f) { return mapB.has(f.id); });
    const delta = b.score - a.score;
    const deltaText = delta === 0 ? 'Both scans have the same score.'
      : 'Scan B scores ' + Math.abs(delta) + ' point' + (Math.abs(delta) === 1 ? '' : 's') + (delta > 0 ? ' higher' : ' lower') + ' than scan A.';

    function list(title, items) {
      return h('div', { class: 'cmp-list' },
        h('h4', null, title + ' (' + items.length + ')'),
        items.length
          ? h('ul', null, items.map(function (f) {
            return h('li', null, h('span', { class: 'finding-points' }, f.points > 0 ? '+' + f.points : '0'), ' ', f.title);
          }))
          : h('p', { class: 'muted' }, 'Nothing here.'));
    }

    return h('section', { class: 'panel compare', 'aria-labelledby': 'compare-title' },
      h('h3', { id: 'compare-title', class: 'panel-title' }, 'Comparison'),
      h('p', { class: 'panel-sub' }, deltaText),
      h('div', { class: 'cmp-grid' }, scanColumn('Scan A', a), scanColumn('Scan B', b)),
      h('div', { class: 'cmp-lists' },
        list('Only in A', onlyA), list('In both', both), list('Only in B', onlyB)));
  }

  LL.dom = { h: h, s: s };
  LL.render = {
    renderReport: renderReport,
    renderComparison: renderComparison,
    reportToText: reportToText,
    gauge: gauge
  };
})(typeof window !== 'undefined' ? window : globalThis);
