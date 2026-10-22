/* LinkLens — scoring. Adds up the points from every finding, caps the total at 100,
 * and maps it to a documented label. The score is an estimate, never a verdict. */
(function (g) {
  'use strict';
  const LL = (g.LinkLens = g.LinkLens || {});
  const C = LL.config;

  function bandFor(score) {
    const s = Math.max(0, Math.min(100, Math.round(score)));
    return C.bands.find(function (b) { return s >= b.min && s <= b.max; });
  }

  function computeScore(findings) {
    let total = 0;
    const breakdown = [];
    findings.forEach(function (f) {
      if (f.points > 0) {
        total += f.points;
        breakdown.push({ id: f.id, title: f.title, points: f.points });
      }
    });
    breakdown.sort(function (a, b) { return b.points - a.points; });
    const score = Math.min(100, total);
    return { score: score, rawTotal: total, capped: total > 100, band: bandFor(score), breakdown: breakdown };
  }

  const SUMMARIES = {
    low: 'Few or none of the built-in warning signs were found. That is encouraging, but it does not prove the link is safe.',
    some: 'Some patterns that are common in deceptive links were found. Check the details below before you open or sign in.',
    high: 'Several strong warning signs were found. Avoid entering passwords or payment details unless you can verify the destination another way.',
    'very-high': 'Many strong warning signs were found together. Treat this link as dangerous until you have verified it through a trusted route.'
  };

  /* Analyze text input. opts.reputation may carry an optional threat-intelligence result. */
  function analyze(input, opts) {
    const parsed = LL.parser.parse(input);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const findings = LL.rules.run(parsed, opts || {});
    const s = computeScore(findings);
    return {
      ok: true,
      parsed: parsed,
      findings: findings,
      score: s.score,
      rawTotal: s.rawTotal,
      capped: s.capped,
      band: s.band,
      breakdown: s.breakdown,
      summary: SUMMARIES[s.band.id],
      reputationChecked: !!(opts && opts.reputation && (opts.reputation.status === 'clean' || opts.reputation.status === 'match')),
      analyzedAt: Date.now()
    };
  }

  LL.bandFor = bandFor;
  LL.computeScore = computeScore;
  LL.analyze = analyze;
})(typeof window !== 'undefined' ? window : globalThis);
