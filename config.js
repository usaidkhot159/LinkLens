/* LinkLens — configuration: scoring weights, bands, and reference lists.
 * Everything the engine "knows" lives here so the scoring stays transparent. */
(function (g) {
  'use strict';
  const LL = (g.LinkLens = g.LinkLens || {});

  /* Points added to the score when an indicator fires. */
  const weights = {
    noHttps: 10,
    ipHost: 20,
    credentials: 25,
    shortener: 15,
    brandSubdomain: 30,
    brandInDomain: 25,
    typosquat: 25,
    charSubstitution: 25,
    idn: 15,
    mixedScript: 30,
    confusable: 30,
    keywordsHost: 8, // per distinct keyword found in the hostname
    keywordsPath: 4, // per distinct keyword found in the path or query
    lureCombo: 8,
    domainInSub: 15,
    deepSubdomain: 10,
    longHost: 8,
    manyHyphens: 8,
    riskyTld: 8,
    oddPort: 8,
    longUrl: 5,
    heavyEncoding: 6,
    embeddedUrl: 10,
    riskyFile: 15,
    brandInPath: 8,
    threatMatch: 60
  };

  /* Upper limits for indicators that can fire several times. */
  const caps = { keywordsHost: 16, keywordsPath: 8 };

  /* Human-readable catalog shown on the "How scoring works" page. */
  const indicators = [
    ['Connection', 'noHttps', 'Link does not use HTTPS', 'Unencrypted connections can be read or altered in transit.'],
    ['Domain', 'ipHost', 'Raw IP address as host', 'Legitimate services rarely ask you to sign in at a bare IP address.'],
    ['Domain', 'credentials', 'Username part before "@"', 'Text before @ is ignored for routing but can make a link look trustworthy.'],
    ['Domain', 'shortener', 'URL shortener', 'The final destination is hidden until the link is opened.'],
    ['Impersonation', 'brandSubdomain', 'Brand name used as a subdomain', 'A trusted name placed in front of an unrelated registered domain.'],
    ['Impersonation', 'brandInDomain', 'Brand name inside another domain', 'For example a brand name joined to words like "secure" or "login".'],
    ['Impersonation', 'typosquat', 'Misspelled brand name', 'One character added, removed, swapped or changed from a well-known name.'],
    ['Impersonation', 'charSubstitution', 'Look-alike digits or letter pairs', 'Digits or pairs such as 1 for l, 0 for o, or rn for m.'],
    ['Impersonation', 'domainInSub', 'Domain-like text inside the subdomain', 'Text such as "bank.com" placed before the real registered domain.'],
    ['Characters', 'idn', 'Internationalized (Unicode) hostname', 'Punycode "xn--" labels can hide look-alike characters.'],
    ['Characters', 'mixedScript', 'Mixed alphabets in one label', 'Latin letters mixed with Cyrillic, Greek or Armenian letters.'],
    ['Characters', 'confusable', 'Look-alike characters reveal a known name', 'Swapping look-alike characters yields a well-known address.'],
    ['Structure', 'keywordsHost', 'Sensitive wording in the hostname', 'Words such as login, verify or account (per word, with a cap).'],
    ['Structure', 'keywordsPath', 'Sensitive wording in the path or query', 'Lower weight, because many real sites use /login too (per word, with a cap).'],
    ['Structure', 'lureCombo', 'Account-action wording in host and path', 'Both the hostname and the path push you toward a sign-in step.'],
    ['Structure', 'deepSubdomain', 'Unusually deep subdomain nesting', 'Three or more subdomain labels can bury the real domain.'],
    ['Structure', 'longHost', 'Very long hostname', 'Hostnames over 40 characters are often padded to hide the real domain.'],
    ['Structure', 'manyHyphens', 'Many hyphens in the hostname', 'Three or more hyphens are common in throwaway look-alike domains.'],
    ['Structure', 'riskyTld', 'Domain ending often abused', 'Some endings are cheap and heavily used for abuse (many legitimate sites use them too).'],
    ['Structure', 'oddPort', 'Non-standard port', 'An explicit port is unusual for public consumer sites.'],
    ['Structure', 'longUrl', 'Very long URL', 'URLs over 150 characters can hide what matters.'],
    ['Structure', 'heavyEncoding', 'Heavy percent-encoding', 'Five or more %XX sequences can disguise what the path contains.'],
    ['Structure', 'embeddedUrl', 'Another URL inside the link', 'May indicate a redirect that sends you somewhere else.'],
    ['Structure', 'riskyFile', 'Link points to an executable or archive', 'Examples: .exe, .apk, .scr, .msi, .iso, .zip.'],
    ['Impersonation', 'brandInPath', 'Brand name only appears in the path', 'The page claims a brand, but the domain is not that brand\'s.'],
    ['Intelligence', 'threatMatch', 'Listed by a reputation service', 'Only when you enable the optional server-side check.']
  ].map(function (row) {
    const id = row[1];
    return {
      category: row[0],
      id: id,
      title: row[2],
      description: row[3],
      points: caps[id] != null ? caps[id] : weights[id],
      perItem: caps[id] != null
    };
  });

  const bands = [
    { id: 'low', min: 0, max: 24, label: 'Lower apparent risk' },
    { id: 'some', min: 25, max: 49, label: 'Some warning signs' },
    { id: 'high', min: 50, max: 74, label: 'High concern' },
    { id: 'very-high', min: 75, max: 100, label: 'Very high concern' }
  ];

  const shorteners = [
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly',
    'shorturl.at', 'tiny.cc', 'rb.gy', 't.ly', 'lnkd.in', 's.id', 'v.gd', 'bl.ink', 'soo.gd', 'clck.ru',
    'qr.ae', 'adf.ly', 'shorte.st', 'bitly.com', 'urlz.fr', 'x.co'
  ];

  const riskyTlds = [
    'zip', 'mov', 'top', 'xyz', 'click', 'country', 'gq', 'tk', 'ml', 'cf', 'ga', 'work', 'support',
    'rest', 'icu', 'buzz', 'cam', 'monster', 'quest', 'cyou', 'sbs', 'surf', 'loan', 'kim'
  ];

  const keywords = [
    'login', 'signin', 'sign-in', 'verify', 'verification', 'account', 'secure', 'security', 'update',
    'confirm', 'password', 'wallet', 'billing', 'payment', 'recover', 'unlock', 'suspended', 'validate',
    'authenticate', 'banking', 'helpdesk', 'webscr', 'invoice', 'refund'
  ];

  const riskyExtensions = ['exe', 'scr', 'msi', 'bat', 'cmd', 'apk', 'jar', 'iso', 'dmg', 'vbs', 'ps1', 'zip', 'rar', '7z'];

  /* Small subset of the Public Suffix List for common two-part endings. */
  const multiPartSuffixes = [
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.in', 'net.in',
    'org.in', 'ac.in', 'gov.in', 'co.jp', 'ne.jp', 'or.jp', 'com.br', 'com.cn', 'com.mx', 'com.tr',
    'com.sg', 'com.hk', 'co.nz', 'co.za', 'co.kr', 'com.ar', 'com.pk', 'com.ng', 'com.eg'
  ];

  /* Platforms where anyone can create a subdomain. Treated like a public suffix. */
  const platformSuffixes = [
    'github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com',
    'herokuapp.com', 'blogspot.com', 'weebly.com', 'wixsite.com', 'glitch.me', 'repl.co', 'onrender.com'
  ];

  /* Tokens that look like brand names but are ordinary words. */
  const safeTokens = ['finance', 'paypay'];

  const brands = [
    { name: 'paypal', domains: ['paypal.com', 'paypal.me'] },
    { name: 'google', domains: ['google.com', 'gmail.com', 'youtube.com', 'google.co.in', 'google.co.uk'] },
    { name: 'microsoft', domains: ['microsoft.com', 'live.com', 'office.com', 'outlook.com', 'microsoftonline.com', 'windows.com', 'bing.com', 'office365.com'] },
    { name: 'apple', domains: ['apple.com', 'icloud.com'] },
    { name: 'amazon', domains: ['amazon.com', 'amazon.in', 'amazon.co.uk', 'amazon.de', 'amazon.ca', 'amazon.com.au'] },
    { name: 'facebook', domains: ['facebook.com', 'fb.com', 'messenger.com'] },
    { name: 'instagram', domains: ['instagram.com'] },
    { name: 'netflix', domains: ['netflix.com'] },
    { name: 'linkedin', domains: ['linkedin.com'] },
    { name: 'whatsapp', domains: ['whatsapp.com', 'whatsapp.net'] },
    { name: 'dropbox', domains: ['dropbox.com'] },
    { name: 'github', domains: ['github.com', 'githubusercontent.com', 'github.io'] },
    { name: 'chase', domains: ['chase.com'] },
    { name: 'wellsfargo', domains: ['wellsfargo.com'] },
    { name: 'bankofamerica', domains: ['bankofamerica.com'] },
    { name: 'dhl', domains: ['dhl.com'] },
    { name: 'fedex', domains: ['fedex.com'] },
    { name: 'usps', domains: ['usps.com'] },
    { name: 'coinbase', domains: ['coinbase.com'] },
    { name: 'binance', domains: ['binance.com'] },
    { name: 'steam', domains: ['steampowered.com', 'steamcommunity.com'] },
    { name: 'docusign', domains: ['docusign.com', 'docusign.net'] },
    { name: 'adobe', domains: ['adobe.com'] },
    { name: 'paytm', domains: ['paytm.com'] },
    { name: 'hdfcbank', domains: ['hdfcbank.com'] },
    { name: 'icicibank', domains: ['icicibank.com'] },
    { name: 'onlinesbi', domains: ['onlinesbi.sbi', 'sbi.co.in'] }
  ];

  const samples = [
    { label: 'Fake account portal', url: 'https://secure-account.example-login.com/verify' },
    { label: 'Digit swap (paypa1)', url: 'http://paypa1-secure-login.top/signin?redirect=http://collect.example/id' },
    { label: 'Hidden brand subdomain', url: 'https://login.microsoft.com.account-verify.example.net/oauth' },
    { label: 'Unicode look-alike', url: 'https://xn--pple-43d.com/' },
    { label: 'Shortened link', url: 'https://bit.ly/3AbCdEf' },
    { label: 'Bare IP address', url: 'http://203.0.113.7/bank/login.php' },
    { label: '@ trick', url: 'https://www.paypal.com@collect.example/login' },
    { label: 'Ordinary site', url: 'https://www.wikipedia.org/' }
  ];

  LL.config = {
    appName: 'LinkLens',
    version: '1.0.0',
    maxInputLength: 2048,
    historyLimit: 50,
    weights: weights,
    caps: caps,
    indicators: indicators,
    bands: bands,
    shorteners: shorteners,
    riskyTlds: riskyTlds,
    keywords: keywords,
    riskyExtensions: riskyExtensions,
    multiPartSuffixes: multiPartSuffixes,
    platformSuffixes: platformSuffixes,
    safeTokens: safeTokens,
    brands: brands,
    samples: samples
  };
})(typeof window !== 'undefined' ? window : globalThis);
