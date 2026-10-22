/* LinkLens — URL parser. Splits a link into the parts a person needs to read it correctly.
 * Includes a small Punycode decoder (RFC 3492) so internationalized hostnames can be shown in Unicode.
 * The link is only parsed as text. It is never opened or fetched. */
(function (g) {
  'use strict';
  const LL = (g.LinkLens = g.LinkLens || {});
  const C = LL.config;

  /* ---------- Punycode decoding ---------- */
  const BASE = 36, T_MIN = 1, T_MAX = 26, SKEW = 38, DAMP = 700, INITIAL_BIAS = 72, INITIAL_N = 128;

  function adapt(delta, numPoints, first) {
    let k = 0;
    delta = first ? Math.floor(delta / DAMP) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    for (; delta > (((BASE - T_MIN) * T_MAX) >> 1); k += BASE) {
      delta = Math.floor(delta / (BASE - T_MIN));
    }
    return Math.floor(k + ((BASE - T_MIN + 1) * delta) / (delta + SKEW));
  }

  function basicToDigit(cp) {
    if (cp >= 0x30 && cp <= 0x39) return cp - 0x16; // 0-9 -> 26-35
    if (cp >= 0x41 && cp <= 0x5a) return cp - 0x41; // A-Z -> 0-25
    if (cp >= 0x61 && cp <= 0x7a) return cp - 0x61; // a-z -> 0-25
    return BASE;
  }

  function punyDecode(input) {
    const output = [];
    let basic = input.lastIndexOf('-');
    if (basic < 0) basic = 0;
    for (let j = 0; j < basic; j++) {
      if (input.charCodeAt(j) >= 0x80) throw new RangeError('Invalid punycode input');
      output.push(input.charCodeAt(j));
    }
    let n = INITIAL_N, i = 0, bias = INITIAL_BIAS;
    for (let index = basic > 0 ? basic + 1 : 0; index < input.length; ) {
      const oldi = i;
      for (let w = 1, k = BASE; ; k += BASE) {
        if (index >= input.length) throw new RangeError('Invalid punycode input');
        const digit = basicToDigit(input.charCodeAt(index++));
        if (digit >= BASE) throw new RangeError('Invalid punycode input');
        i += digit * w;
        const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
        if (digit < t) break;
        w *= BASE - t;
      }
      const out = output.length + 1;
      bias = adapt(i - oldi, out, oldi === 0);
      n += Math.floor(i / out);
      i %= out;
      output.splice(i++, 0, n);
    }
    return String.fromCodePoint.apply(null, output);
  }

  /* Convert one hostname label to Unicode. Returns the label unchanged if it is not "xn--". */
  function labelToUnicode(label) {
    if (label.slice(0, 4).toLowerCase() !== 'xn--') return { text: label, ok: true };
    try {
      return { text: punyDecode(label.slice(4)), ok: true };
    } catch (e) {
      return { text: label, ok: false };
    }
  }

  /* ---------- Host splitting ---------- */
  const multi = new Set(C.multiPartSuffixes);
  const platforms = new Set(C.platformSuffixes);

  /* Approximate split into subdomain / registered domain / public suffix. */
  function splitHost(hostname) {
    const labels = hostname.split('.');
    let suffixLen = 1;
    const lastTwo = labels.slice(-2).join('.');
    let platform = '';
    if (labels.length >= 2 && (multi.has(lastTwo) || platforms.has(lastTwo))) {
      suffixLen = 2;
      if (platforms.has(lastTwo)) platform = lastTwo;
    }
    if (labels.length <= suffixLen) {
      return { labels: labels, subLabels: [], subdomain: '', sld: '', suffix: hostname, registeredDomain: hostname, platform: platform };
    }
    const registeredLabels = labels.slice(-(suffixLen + 1));
    const subLabels = labels.slice(0, labels.length - suffixLen - 1);
    return {
      labels: labels,
      subLabels: subLabels,
      subdomain: subLabels.join('.'),
      sld: registeredLabels[0],
      suffix: labels.slice(-suffixLen).join('.'),
      registeredDomain: registeredLabels.join('.'),
      platform: platform
    };
  }

  function safeDecode(text) {
    try {
      return decodeURIComponent(text);
    } catch (e) {
      return text;
    }
  }

  function fail(message) {
    return { ok: false, error: message };
  }

  /* ---------- Main entry point ---------- */
  function parse(raw) {
    const input = String(raw == null ? '' : raw).trim();
    if (!input) return fail('Paste a link first, then press Analyze URL.');
    if (input.length > C.maxInputLength) {
      return fail('That link is longer than ' + C.maxInputLength + ' characters, which is too long to analyze.');
    }
    if (/[\s\u0000-\u001f]/.test(input)) {
      return fail('Links cannot contain spaces or line breaks. Remove them and try again.');
    }

    const hasSlashes = /^[a-z][a-z0-9+.\-]*:\/\//i.test(input);
    const schemeMatch = input.match(/^([a-z][a-z0-9+.\-]*):/i);
    let candidate = input;
    let assumedScheme = false;

    if (!hasSlashes) {
      const looksLikeHostPort = /^[^\/?#:@]+:\d+(?:[\/?#]|$)/.test(input);
      if (schemeMatch && !looksLikeHostPort) {
        return fail('LinkLens analyzes web addresses that start with http:// or https://. "' + schemeMatch[1].toLowerCase() + ':" links are not supported.');
      }
      candidate = 'https://' + input.replace(/^\/\//, '');
      assumedScheme = true;
    }

    let u;
    try {
      u = new URL(candidate);
    } catch (e) {
      return fail('That does not look like a valid web address. Check it for typos, for example: https://example.com/page');
    }

    const scheme = u.protocol.replace(':', '');
    if (scheme !== 'http' && scheme !== 'https' && scheme !== 'ftp') {
      return fail('LinkLens analyzes web addresses that start with http:// or https://. "' + scheme + '://" links are not supported.');
    }

    const hostname = u.hostname.replace(/\.$/, '').toLowerCase();
    if (!hostname) return fail('That link has no hostname. Include a domain such as example.com.');

    const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    const isIPv6 = hostname.charAt(0) === '[';
    const isIP = isIPv4 || isIPv6;

    if (!isIP && hostname.indexOf('.') === -1 && hostname !== 'localhost') {
      return fail('"' + hostname + '" does not look like a full web address. Include a domain such as example.com.');
    }

    const hostMatch = candidate.match(/^[a-z][a-z0-9+.\-]*:\/\/(?:[^\/?#@]*@)?(\[[^\]]*\]|[^\/?#:]*)/i);
    const originalHost = hostMatch ? hostMatch[1] : '';
    const ipObfuscated = isIPv4 && originalHost !== '' && originalHost.toLowerCase() !== hostname;

    const split = isIP
      ? { labels: [hostname], subLabels: [], subdomain: '', sld: '', suffix: '', registeredDomain: hostname, platform: '' }
      : splitHost(hostname);

    let hasIdn = false;
    let invalidPunycode = false;
    const unicodeLabels = hostname.split('.').map(function (label) {
      const r = labelToUnicode(label);
      if (label.slice(0, 4) === 'xn--') hasIdn = true;
      if (!r.ok) invalidPunycode = true;
      return r.text;
    });

    const params = [];
    u.searchParams.forEach(function (value, name) {
      params.push({ name: name, value: value });
    });

    return {
      ok: true,
      input: input,
      href: u.href,
      scheme: scheme,
      assumedScheme: assumedScheme,
      hostname: hostname,
      unicodeHostname: isIP ? hostname : unicodeLabels.join('.'),
      hasIdn: hasIdn,
      invalidPunycode: invalidPunycode,
      isIPv4: isIPv4,
      isIPv6: isIPv6,
      isIP: isIP,
      ipObfuscated: ipObfuscated,
      originalHost: originalHost,
      labels: split.labels,
      subLabels: split.subLabels,
      subdomain: split.subdomain,
      sld: split.sld,
      suffix: split.suffix,
      registeredDomain: split.registeredDomain,
      platform: split.platform,
      port: u.port,
      username: u.username,
      password: u.password,
      hasCredentials: u.username !== '' || u.password !== '',
      path: u.pathname,
      decodedPath: safeDecode(u.pathname),
      query: u.search,
      params: params,
      hash: u.hash
    };
  }

  LL.parser = { parse: parse, splitHost: splitHost, punyDecode: punyDecode, labelToUnicode: labelToUnicode };
})(typeof window !== 'undefined' ? window : globalThis);
