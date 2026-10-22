/* LinkLens — a small table of look-alike characters (Cyrillic, Greek, Armenian, Latin variants)
 * that can imitate basic Latin letters in hostnames. Not a complete Unicode confusables table. */
(function (g) {
  'use strict';
  const LL = (g.LinkLens = g.LinkLens || {});

  /* codepoint -> [Latin look-alike, script name] */
  const map = {
    'а': ['a', 'Cyrillic'],
    'е': ['e', 'Cyrillic'],
    'о': ['o', 'Cyrillic'],
    'р': ['p', 'Cyrillic'],
    'с': ['c', 'Cyrillic'],
    'у': ['y', 'Cyrillic'],
    'х': ['x', 'Cyrillic'],
    'і': ['i', 'Cyrillic'],
    'ј': ['j', 'Cyrillic'],
    'ѕ': ['s', 'Cyrillic'],
    'һ': ['h', 'Cyrillic'],
    'ԁ': ['d', 'Cyrillic'],
    'ԛ': ['q', 'Cyrillic'],
    'ԝ': ['w', 'Cyrillic'],
    'ӏ': ['l', 'Cyrillic'],
    'ѵ': ['v', 'Cyrillic'],
    'α': ['a', 'Greek'],
    'ο': ['o', 'Greek'],
    'ρ': ['p', 'Greek'],
    'ν': ['v', 'Greek'],
    'ι': ['i', 'Greek'],
    'κ': ['k', 'Greek'],
    'υ': ['u', 'Greek'],
    'ս': ['u', 'Armenian'],
    'օ': ['o', 'Armenian'],
    'ց': ['g', 'Armenian'],
    'ո': ['n', 'Armenian'],
    'ɑ': ['a', 'Latin variant'],
    'ı': ['i', 'Latin variant']
  };

  function codePointLabel(ch) {
    return 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  }

  /* Replace look-alike characters with the Latin letters they imitate. */
  function skeleton(text) {
    let out = '';
    for (const ch of String(text)) out += map[ch] ? map[ch][0] : ch;
    return out;
  }

  /* List every look-alike character found in the text. */
  function findIn(text) {
    const hits = [];
    const seen = new Set();
    for (const ch of String(text)) {
      if (map[ch] && !seen.has(ch)) {
        seen.add(ch);
        hits.push({ char: ch, code: codePointLabel(ch), looksLike: map[ch][0], script: map[ch][1] });
      }
    }
    return hits;
  }

  LL.confusables = { map: map, skeleton: skeleton, findIn: findIn, codePointLabel: codePointLabel };
})(typeof window !== 'undefined' ? window : globalThis);
