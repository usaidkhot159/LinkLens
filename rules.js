/* LinkLens — rule engine. Each check inspects the parsed URL and returns findings that say
 * WHAT was noticed, WHY it matters, and HOW MANY points it adds. These are warning signals, not proof. */
(function (g) {
  'use strict';
  const LL = (g.LinkLens = g.LinkLens || {});
  const C = LL.config;
  const W = C.weights;

  const shorteners = new Set(C.shorteners);
  const riskyTlds = new Set(C.riskyTlds);
  const riskyExt = new Set(C.riskyExtensions);
  const safeTokens = new Set(C.safeTokens);

  function finding(id, category, title, detail, points, severity, evidence) {
    const sev = severity || (points >= 20 ? 'danger' : points > 0 ? 'warn' : 'info');
    return { id: id, category: category, severity: sev, title: title, detail: detail, points: points, evidence: evidence || [] };
  }

  function tokens(text) {
    return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  function unique(list) {
    return Array.from(new Set(list));
  }

  /* Optimal string alignment distance (insert, delete, substitute, swap neighbours). */
  function editDistance(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) {
      d[i] = [i];
    }
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }

  /* Short brand names must match a whole token; longer ones may be embedded (paypalsecure). */
  function matchesBrand(token, brand) {
    if (token === brand.name) return true;
    return brand.name.length >= 6 && token.indexOf(brand.name) !== -1;
  }

  function isOfficial(registeredDomain, brand) {
    return brand.domains.indexOf(registeredDomain) !== -1;
  }

  function officialBrandFor(registeredDomain) {
    return C.brands.find(function (b) { return isOfficial(registeredDomain, b); }) || null;
  }

  /* Variants of a token with digits and letter pairs swapped back to the letters they imitate. */
  function leetVariants(token) {
    const map = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't' };
    let base = '';
    for (const ch of token) base += map[ch] || ch;
    const asL = base.replace(/1/g, 'l');
    const asI = base.replace(/1/g, 'i');
    const list = [asL, asI, asL.replace(/rn/g, 'm'), asL.replace(/vv/g, 'w')];
    return unique(list).filter(function (v) { return v !== token; });
  }

  /* ---------- Scripts (alphabets) ---------- */
  const SCRIPT_TESTS = [
    ['Latin', /\p{Script=Latin}/u],
    ['Cyrillic', /\p{Script=Cyrillic}/u],
    ['Greek', /\p{Script=Greek}/u],
    ['Armenian', /\p{Script=Armenian}/u]
  ];

  function scriptsOf(label) {
    const found = new Set();
    for (const ch of label) {
      for (let i = 0; i < SCRIPT_TESTS.length; i++) {
        if (SCRIPT_TESTS[i][1].test(ch)) {
          found.add(SCRIPT_TESTS[i][0]);
          break;
        }
      }
    }
    return found;
  }

  /* ---------- Rule groups ---------- */

  function connectionRules(p, out) {
    if (p.scheme === 'https') {
      out.push(finding('https', 'Connection', 'URL uses HTTPS',
        'The address specifies HTTPS, which encrypts traffic between you and the server. It does not prove the site is trustworthy: attackers can obtain HTTPS certificates too.', 0, 'info'));
    } else {
      out.push(finding('noHttps', 'Connection', 'Link does not use HTTPS (' + p.scheme.toUpperCase() + ')',
        'Without HTTPS, anything you type could be read or changed on the way. Sites that ask for sign-ins or payments almost always use HTTPS.', W.noHttps, 'warn'));
    }
    if (p.assumedScheme) {
      out.push(finding('assumedScheme', 'Connection', 'No scheme was given',
        'The text did not start with http:// or https://, so LinkLens assumed https:// in order to analyze it.', 0, 'info'));
    }
  }

  function hostTypeRules(p, out) {
    if (p.isIP) {
      const extra = p.ipObfuscated ? ' The address was also written in a disguised numeric form (' + p.originalHost + ').' : '';
      out.push(finding('ipHost', 'Domain', 'Raw IP address instead of a domain name',
        'The link points to ' + p.hostname + ' directly rather than a named website. Legitimate services rarely ask you to sign in at a bare IP address.' + extra,
        W.ipHost, 'danger', [p.hostname]));
    }
    if (p.hasCredentials) {
      out.push(finding('credentials', 'Domain', 'Text before "@" can disguise the real destination',
        'Everything before the @ sign is a username, not the website. The real host is ' + p.hostname + '. Attackers use this so the start of the link looks like a trusted name.',
        W.credentials, 'danger', [(p.username + (p.password ? ':' + p.password : '')) + '@']));
    }
    if (C.shorteners.indexOf(p.registeredDomain) !== -1) {
      out.push(finding('shortener', 'Domain', 'URL shortening service',
        p.registeredDomain + ' is a link shortener, so the final destination is hidden until you open it. Use a link-expander or ask the sender for the full address.',
        W.shortener, 'warn', [p.registeredDomain]));
    }
    if (p.platform) {
      out.push(finding('platform', 'Domain', 'Free hosting platform (' + p.platform + ')',
        'Anyone can create a subdomain on ' + p.platform + ', so the name in front of it is chosen by whoever owns that page, not by the platform.', 0, 'info', [p.platform]));
    }
    const official = !p.isIP && officialBrandFor(p.registeredDomain);
    if (official && !p.hasCredentials && !p.hasIdn) {
      out.push(finding('knownDomain', 'Domain', 'Registered domain matches a well-known service',
        p.registeredDomain + ' is listed as an official domain of ' + official.name + '. Well-known domains can still host content that users or attackers have uploaded, so this is a good sign but not a guarantee.',
        0, 'good', [p.registeredDomain]));
    }
  }

  function impersonationRules(p, out) {
    if (p.isIP) return;
    const subTokens = tokens(p.subdomain);
    const sldTokens = tokens(p.sld);
    const allTokens = unique(subTokens.concat(sldTokens));
    const flagged = [];
    const flaggedNames = new Set();

    C.brands.forEach(function (brand) {
      if (isOfficial(p.registeredDomain, brand)) return;
      const inSub = subTokens.find(function (t) { return matchesBrand(t, brand); });
      const inSld = sldTokens.find(function (t) { return matchesBrand(t, brand); });
      if (inSub) flagged.push({ brand: brand.name, where: 'subdomain' });
      else if (inSld) flagged.push({ brand: brand.name, where: 'domain' });
      if (inSub || inSld) flaggedNames.add(brand.name);
    });

    if (flagged.length) {
      const subs = flagged.filter(function (f) { return f.where === 'subdomain'; });
      const names = unique(flagged.map(function (f) { return f.brand; }));
      if (subs.length) {
        out.push(finding('brandSubdomain', 'Impersonation', 'Misleading subdomain: brand name placed before another domain',
          'The name "' + subs[0].brand + '" appears in the subdomain, but the registered domain is ' + p.registeredDomain + '. Attackers put a trusted name at the front so the link looks familiar at a glance. Always verify the registered domain, which is the part right before the ending.',
          W.brandSubdomain, 'danger', names));
      } else {
        out.push(finding('brandInDomain', 'Impersonation', 'Potentially misleading domain',
          'The domain name contains "' + flagged[0].brand + '" but the registered domain is ' + p.registeredDomain + ', which is not an official ' + flagged[0].brand + ' domain. Verify the actual registered domain before trusting it.',
          W.brandInDomain, 'danger', names));
      }
    }

    // Digits and letter pairs that imitate letters
    const substHits = [];
    allTokens.forEach(function (token) {
      if (!/[0-9]|rn|vv/.test(token)) return;
      leetVariants(token).forEach(function (variant) {
        C.brands.forEach(function (brand) {
          if (flaggedNames.has(brand.name) || isOfficial(p.registeredDomain, brand)) return;
          if (matchesBrand(variant, brand) && !matchesBrand(token, brand)) {
            substHits.push({ token: token, brand: brand.name });
            flaggedNames.add(brand.name);
          }
        });
      });
    });
    if (substHits.length) {
      const h = substHits[0];
      out.push(finding('charSubstitution', 'Impersonation', 'Look-alike digits or letter pairs',
        '"' + h.token + '" imitates "' + h.brand + '" by swapping letters for similar-looking digits or letter pairs (for example 1 for l, 0 for o, or rn for m).',
        W.charSubstitution, 'danger', unique(substHits.map(function (x) { return x.token + ' ≈ ' + x.brand; }))));
    }

    // Misspellings of well-known names
    const typoHits = [];
    allTokens.forEach(function (token) {
      if (token.length < 5 || safeTokens.has(token)) return;
      C.brands.forEach(function (brand) {
        if (brand.name.length < 6 || flaggedNames.has(brand.name) || isOfficial(p.registeredDomain, brand)) return;
        if (token === brand.name) return;
        const dist = editDistance(token, brand.name);
        const allowed = brand.name.length >= 9 ? 2 : 1;
        if (dist >= 1 && dist <= allowed) typoHits.push({ token: token, brand: brand.name, dist: dist });
      });
    });
    if (typoHits.length) {
      const h = typoHits[0];
      out.push(finding('typosquat', 'Impersonation', 'Possible misspelling of a well-known name',
        '"' + h.token + '" is ' + (h.dist === 1 ? 'one character' : h.dist + ' characters') + ' away from "' + h.brand + '". Lookalike domains rely on small typos that are easy to miss.',
        W.typosquat, 'danger', unique(typoHits.map(function (x) { return x.token + ' ≈ ' + x.brand; }))));
      typoHits.forEach(function (x) { flaggedNames.add(x.brand); });
    }

    // "bank.com" typed into the subdomain
    if (p.subdomain && /(^|\.)[a-z0-9-]+\.(com|net|org|co|in|io|gov|edu)(\.|$)/.test(p.subdomain)) {
      out.push(finding('domainInSub', 'Impersonation', 'Domain-like text inside the subdomain',
        'The part before the real domain contains something that looks like another web address (' + p.subdomain + '). The real destination is ' + p.registeredDomain + '.',
        W.domainInSub, 'warn', [p.subdomain]));
    }

    // Brand name only in the path
    const pathLower = (p.decodedPath || '').toLowerCase();
    const pathBrands = C.brands.filter(function (brand) {
      return brand.name.length >= 5 && pathLower.indexOf(brand.name) !== -1 && !isOfficial(p.registeredDomain, brand) && !flaggedNames.has(brand.name);
    });
    if (pathBrands.length) {
      out.push(finding('brandInPath', 'Impersonation', 'Brand name appears only in the path',
        'The path mentions "' + pathBrands[0].name + '", but the site itself is ' + p.registeredDomain + '. Anything after the domain is chosen freely by the site owner.',
        W.brandInPath, 'warn', pathBrands.map(function (b) { return b.name; })));
    }
  }

  function characterRules(p, out) {
    if (p.isIP) return;
    if (p.invalidPunycode) {
      out.push(finding('idn', 'Characters', 'Malformed internationalized hostname',
        'A label starts with "xn--" but could not be decoded as valid Punycode. Treat the address with extra care.', W.idn, 'warn'));
    }
    if (!p.hasIdn) return;

    out.push(finding('idn', 'Characters', 'Internationalized (Unicode) hostname',
      'The hostname is stored as Punycode (' + p.hostname + ') and displays as "' + p.unicodeHostname + '". Unicode hostnames can contain characters that look like ordinary letters.',
      W.idn, 'warn', [p.hostname, p.unicodeHostname]));

    // Mixed alphabets within one label
    const mixed = [];
    p.unicodeHostname.split('.').forEach(function (label) {
      const scripts = scriptsOf(label);
      const odd = Array.from(scripts).filter(function (s) { return s !== 'Latin'; });
      if (scripts.size > 1 && odd.length) mixed.push({ label: label, scripts: Array.from(scripts) });
    });
    if (mixed.length) {
      const hits = LL.confusables.findIn(mixed.map(function (m) { return m.label; }).join(''));
      const chars = hits.map(function (h) { return '"' + h.char + '" (' + h.code + ', ' + h.script + ') looks like Latin "' + h.looksLike + '"'; });
      out.push(finding('mixedScript', 'Characters', 'Mixed alphabets inside one name',
        'The label "' + mixed[0].label + '" mixes ' + mixed[0].scripts.join(' and ') + ' letters. Real names almost never do this, but impersonation domains often do.',
        W.mixedScript, 'danger', chars.length ? chars : mixed[0].scripts));
    }

    // Do look-alike characters reveal a well-known name?
    const skeleton = LL.confusables.skeleton(p.unicodeHostname);
    if (skeleton !== p.unicodeHostname && /^[a-z0-9.-]+$/.test(skeleton)) {
      const sp = LL.parser.splitHost(skeleton);
      const target = C.brands.find(function (brand) {
        return isOfficial(sp.registeredDomain, brand) ||
          tokens(sp.subdomain + '.' + sp.sld).some(function (t) { return matchesBrand(t, brand); });
      });
      if (target) {
        out.push(finding('confusable', 'Characters', 'Look-alike characters imitate a known name',
          'Replacing the look-alike characters turns this hostname into "' + skeleton + '", which resembles ' + target.name + '. This is a classic homograph trick.',
          W.confusable, 'danger', [skeleton]));
      }
    }
  }

  function wordingRules(p, out) {
    if (p.isIP || officialBrandFor(p.registeredDomain)) return;
    const host = p.unicodeHostname.toLowerCase();
    const pathText = (p.decodedPath + ' ' + p.query).toLowerCase();
    const hostHits = C.keywords.filter(function (k) { return host.indexOf(k) !== -1; });
    const pathHits = C.keywords.filter(function (k) { return pathText.indexOf(k) !== -1; });

    if (hostHits.length) {
      const pts = Math.min(hostHits.length * W.keywordsHost, C.caps.keywordsHost);
      out.push(finding('keywordsHost', 'Structure', 'Sensitive wording inside the hostname',
        'The hostname contains ' + hostHits.map(function (k) { return '"' + k + '"'; }).join(', ') + '. Words like these are often used to make an unrelated domain feel official. Check the registered domain (' + p.registeredDomain + ').',
        pts, 'warn', hostHits));
    }
    if (pathHits.length) {
      const pts = Math.min(pathHits.length * W.keywordsPath, C.caps.keywordsPath);
      out.push(finding('keywordsPath', 'Structure', 'Account-action wording in the path or query',
        'The path or query contains ' + pathHits.map(function (k) { return '"' + k + '"'; }).join(', ') + '. Many real sites use these words too, so this is a minor signal on its own.',
        pts, 'warn', pathHits));
    }
    if (hostHits.length && pathHits.length) {
      out.push(finding('lureCombo', 'Structure', 'Sign-in style wording in both host and path',
        'Both the hostname and the path push you toward an account step. Together this is a common pattern in credential-harvesting links.',
        W.lureCombo, 'warn'));
    }
  }

  function structureRules(p, out) {
    if (!p.isIP && p.subLabels.length >= 3) {
      out.push(finding('deepSubdomain', 'Structure', 'Unusually deep subdomain nesting',
        'There are ' + p.subLabels.length + ' subdomain labels in front of ' + p.registeredDomain + '. Deep nesting can bury the real domain at the end of a long hostname.',
        W.deepSubdomain, 'warn', [p.subdomain]));
    }
    if (!p.isIP && p.hostname.length > 40) {
      out.push(finding('longHost', 'Structure', 'Very long hostname',
        'The hostname is ' + p.hostname.length + ' characters long. Padding is a common way to push the real domain out of sight.', W.longHost, 'warn'));
    }
    const hyphens = (p.hostname.match(/-/g) || []).length;
    if (hyphens >= 3) {
      out.push(finding('manyHyphens', 'Structure', 'Many hyphens in the hostname',
        'The hostname contains ' + hyphens + ' hyphens. Throwaway lookalike domains often chain words together this way.', W.manyHyphens, 'warn'));
    }
    const tld = p.labels[p.labels.length - 1];
    if (!p.isIP && riskyTlds.has(tld)) {
      out.push(finding('riskyTld', 'Structure', 'Domain ending often abused',
        '".' + tld + '" endings are cheap and widely abused. Many legitimate sites use them as well, so treat this as context rather than proof.', W.riskyTld, 'warn', ['.' + tld]));
    }
    if (p.port) {
      out.push(finding('oddPort', 'Structure', 'Non-standard port (' + p.port + ')',
        'The link names an explicit port. Public consumer websites normally use the default web ports and do not show one.', W.oddPort, 'warn', [p.port]));
    }
    if (p.href.length > 150) {
      out.push(finding('longUrl', 'Structure', 'Very long URL',
        'The full address is ' + p.href.length + ' characters. Long links can bury the part that matters.', W.longUrl, 'warn'));
    }
    const encoded = ((p.path + p.query).match(/%[0-9a-f]{2}/gi) || []).length;
    if (encoded >= 5) {
      out.push(finding('heavyEncoding', 'Structure', 'Heavy percent-encoding',
        'The path or query contains ' + encoded + ' encoded sequences (like %2F). Encoding can disguise what the link really contains.', W.heavyEncoding, 'warn'));
    }
    const embedded = p.params.filter(function (q) { return /^(https?:)?\/\//i.test(q.value) || /^https?%3a/i.test(q.value); });
    const rawQuery = p.query.toLowerCase();
    if (embedded.length || /https?%3a%2f%2f/.test(rawQuery) || /(\/|=)https?:\/\//i.test(p.decodedPath)) {
      out.push(finding('embeddedUrl', 'Structure', 'Another web address is embedded in the link',
        'The link carries a second URL, which can mean a redirect that forwards you to a different site after the first one loads.',
        W.embeddedUrl, 'warn', embedded.map(function (q) { return q.name + '=' + q.value; })));
    }
    const lastSegment = (p.path.split('/').pop() || '').toLowerCase();
    const ext = lastSegment.indexOf('.') !== -1 ? lastSegment.split('.').pop() : '';
    if (ext && riskyExt.has(ext)) {
      out.push(finding('riskyFile', 'Structure', 'Link points to a downloadable file (.' + ext + ')',
        'Opening this link may download an executable, installer or archive. Only download files from sources you trust.', W.riskyFile, 'danger', ['.' + ext]));
    }
  }

  function reputationRules(p, ctx, out) {
    const rep = ctx.reputation;
    const provider = (rep && rep.provider) || 'a reputation service';
    if (rep && rep.status === 'match') {
      const threats = Array.isArray(rep.threats) && rep.threats.length ? rep.threats.join(', ') : 'unspecified threat';
      out.push(finding('threatMatch', 'Intelligence', 'Listed by ' + provider, 'The service reported this address as: ' + threats + '. Do not open it.', W.threatMatch, 'danger', Array.isArray(rep.threats) ? rep.threats : []));
    } else if (rep && rep.status === 'clean') {
      out.push(finding('reputationClean', 'Intelligence', 'Not listed by ' + provider,
        'The address was not found in the service\'s lists. New malicious pages are often not listed yet, so this is not a guarantee of safety.', 0, 'info'));
    } else if (rep && rep.status === 'error') {
      out.push(finding('reputationError', 'Intelligence', 'Reputation check failed',
        (rep.message || 'The reputation server could not be reached.') + ' The score below uses only the built-in checks.', 0, 'info'));
    } else {
      out.push(finding('noReputation', 'Intelligence', 'No live reputation result',
        'This address was not checked against a live threat-intelligence service, so the result only reflects the structure of the link. Enable the optional server check to add it.', 0, 'info'));
    }
  }

  /* Run every rule group and return the list of findings. */
  function run(p, ctx) {
    const out = [];
    connectionRules(p, out);
    hostTypeRules(p, out);
    impersonationRules(p, out);
    characterRules(p, out);
    wordingRules(p, out);
    structureRules(p, out);
    reputationRules(p, ctx || {}, out);
    const scored = out.filter(function (f) { return f.points > 0; });
    if (!scored.length) {
      out.unshift(finding('clean', 'Summary', 'No common warning patterns found',
        'None of the built-in checks fired for this address. That lowers, but does not remove, the chance that it is harmful.', 0, 'good'));
    }
    return out;
  }

  LL.rules = { run: run, editDistance: editDistance, leetVariants: leetVariants, tokens: tokens };
})(typeof window !== 'undefined' ? window : globalThis);
