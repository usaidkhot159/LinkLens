/* LinkLens — Learn Mode: short lessons and a quiz. All examples use reserved or fictional domains. */
(function (g) {
  'use strict';
  const LL = (g.LinkLens = g.LinkLens || {});

  const lessons = [
    {
      title: 'Reading a URL from right to left',
      summary: 'The part that decides who controls a site is the registered domain, just before the ending.',
      example: 'https://login.shop.example.com/cart?id=7',
      points: [
        'Start at the ending (.com) and move left one label: example.com is the registered domain.',
        'Everything to its left (login.shop) is a subdomain the owner can name freely.',
        'Everything after the first single slash (/cart?id=7) is chosen by the site, not by anyone else.'
      ]
    },
    {
      title: 'Phishing',
      summary: 'Phishing tricks you into handing over passwords, codes or payments by imitating someone you trust.',
      example: 'Subject: Your account will be suspended in 24 hours. Verify now: https://secure-account.example-login.com/verify',
      points: [
        'Urgency, threats and prizes are pressure tactics, not proof of anything.',
        'Go to the service by typing its address yourself or using its official app, not through the message.',
        'Never share one-time codes. Real support will not ask for them.'
      ]
    },
    {
      title: 'Spoofing and look-alike domains',
      summary: 'Spoofing makes something look like it comes from a trusted source. Look-alike domains do it with spelling tricks.',
      example: 'paypa1.example  →  digit 1 instead of letter l\nrnicrosoft.example  →  "rn" instead of "m"',
      points: [
        'Typos, swapped letters and digits that resemble letters are the most common tricks.',
        'Unicode letters from other alphabets can look identical to Latin ones (homographs).',
        'A brand name in a subdomain (brand.com.example.net) does not mean the brand owns the site.'
      ]
    },
    {
      title: 'Suspicious redirects',
      summary: 'A redirect forwards you from one address to another. Attackers use them to hide the final destination.',
      example: 'https://news.example.com/go?url=https://collect.example/form',
      points: [
        'A second address inside the query (url=, next=, redirect=) can send you somewhere unexpected.',
        'Open redirects on trusted sites make a harmful link look trustworthy at first glance.',
        'If a link carries another full web address, stop and check where it leads.'
      ]
    },
    {
      title: 'URL shorteners',
      summary: 'Shorteners are convenient, but they hide the destination until you click.',
      example: 'https://bit.ly/3AbCdEf',
      points: [
        'The short code reveals nothing about where it goes.',
        'Use a link-expander service or ask the sender for the full address.',
        'Be extra careful with shortened links in unexpected messages.'
      ]
    },
    {
      title: 'HTTPS is not a safety badge',
      summary: 'HTTPS means the connection is encrypted. It says nothing about who runs the site.',
      example: 'https://secure-account.example-login.com/verify  →  HTTPS, still a lookalike pattern',
      points: [
        'Free certificates make HTTPS easy for anyone, including attackers.',
        'Treat the padlock as the minimum, not as a reason to trust.',
        'The missing padlock on a sign-in page is still a reason to stop.'
      ]
    }
  ];

  const questions = [
    {
      q: 'A page uses HTTPS and shows a padlock. What does that tell you?',
      options: ['The site is safe to trust', 'The connection is encrypted, but the site could still be malicious', 'The site was checked by a security company', 'The site belongs to a real business'],
      answer: 1,
      explain: 'HTTPS encrypts traffic between you and the server. Attackers can get HTTPS certificates too, so it says nothing about who runs the site.'
    },
    {
      q: 'Which hostname really belongs to the owner of example.com?',
      options: ['example.com.login-check.net', 'login.example.com', 'example.com-login.net', 'login-example.com'],
      answer: 1,
      explain: 'Read from the right: login.example.com ends in example.com, so its registered domain is example.com. The other options are registered under login-check.net, example.com-login.net or login-example.com.'
    },
    {
      q: 'You receive a shortened link in an unexpected message. What is the safest first step?',
      options: ['Click it quickly to see where it goes', 'Expand it with a preview tool or ask the sender for the full address', 'Forward it to friends to check', 'Ignore the shortener and trust the message text'],
      answer: 1,
      explain: 'A shortened link hides its destination. Expanding it first, or asking for the full link, lets you inspect where it leads before you open it.'
    },
    {
      q: 'What is the risk of a hostname like "аpple.com", where the first letter is Cyrillic?',
      options: ['None, it is the same as apple.com', 'It can look identical to a real name while pointing to a different site', 'Browsers always block it', 'It only works on mobile devices'],
      answer: 1,
      explain: 'This is a homograph attack: characters from another alphabet look the same as Latin letters, so the address can pass for a trusted name while belonging to someone else.'
    },
    {
      q: 'An email says your account will be closed in 24 hours unless you verify it. What does the urgency suggest?',
      options: ['The company is being careful', 'A common pressure tactic used in phishing', 'The link must be legitimate', 'You should reply with your password'],
      answer: 1,
      explain: 'Urgency and threats are classic pressure tactics. Go to the service yourself, by typing its address or using its app, instead of using the link in the message.'
    },
    {
      q: 'In https://www.shop.example.co.uk/offers, which part tells you who controls the site?',
      options: ['https', 'www.shop', 'example.co.uk', '/offers'],
      answer: 2,
      explain: 'The registered domain is example.co.uk (the name plus its public ending). The subdomain www.shop and the path /offers can be chosen freely by whoever controls that domain.'
    },
    {
      q: 'Where does https://www.paypal.com@collect.example/login actually go?',
      options: ['www.paypal.com', 'collect.example', 'Both, one after the other', 'It depends on your browser'],
      answer: 1,
      explain: 'Everything before the @ is treated as a username. The real host is collect.example, which is why this trick is used to make a link look familiar.'
    },
    {
      q: 'A link scores 8 out of 100. What is the correct way to read it?',
      options: ['It is guaranteed safe', 'It showed few warning signs, but it could still be harmful', 'It was verified by a threat database', 'It is certainly safe if it uses HTTPS'],
      answer: 1,
      explain: 'A score is an estimate based on patterns. A low score means fewer warning signs were found, not that the link is proven safe.'
    }
  ];

  function scoreQuiz(chosen) {
    let total = 0;
    questions.forEach(function (q, i) {
      if (chosen[i] === q.answer) total++;
    });
    return total;
  }

  function lessonCard(l) {
    const h = LL.dom.h;
    return h('details', { class: 'lesson' },
      h('summary', null, h('span', { class: 'lesson-title' }, l.title), h('span', { class: 'lesson-sum' }, l.summary)),
      h('div', { class: 'lesson-body' },
        h('pre', { class: 'lesson-example' }, h('code', null, l.example)),
        h('ul', null, l.points.map(function (t) { return h('li', null, t); }))));
  }

  /* Build the quiz widget. callbacks.onFinish(score) lets the app remember a best score. */
  function quizWidget(callbacks, best) {
    const h = LL.dom.h;
    const root = h('div', { class: 'quiz panel' });
    let index = 0;
    let chosen = [];
    let answered = false;

    function draw() {
      root.textContent = '';
      if (index >= questions.length) {
        const score = scoreQuiz(chosen);
        if (callbacks && callbacks.onFinish) callbacks.onFinish(score);
        const message = score === questions.length ? 'Perfect score. You can read links like a pro.'
          : score >= 6 ? 'Strong result. Review the explanations for the ones you missed.'
          : 'A good start. Open the lessons above and try again.';
        root.append(
          h('p', { class: 'eyebrow' }, 'Quiz complete'),
          h('p', { class: 'quiz-score' }, score + ' / ' + questions.length),
          h('p', null, message),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { index = 0; chosen = []; answered = false; draw(); } }, 'Try again'));
        return;
      }
      const q = questions[index];
      answered = false;
      const feedback = h('div', { class: 'quiz-feedback', 'aria-live': 'polite' });
      const next = h('button', { type: 'button', class: 'btn btn-primary', hidden: true, onclick: function () { index++; draw(); } }, index === questions.length - 1 ? 'See result' : 'Next question');
      const buttons = q.options.map(function (text, i) {
        const btn = h('button', { type: 'button', class: 'quiz-option', onclick: function () {
          if (answered) return;
          answered = true;
          chosen[index] = i;
          buttons.forEach(function (b, bi) {
            b.disabled = true;
            if (bi === q.answer) b.classList.add('is-correct');
            else if (bi === i) b.classList.add('is-wrong');
          });
          feedback.textContent = (i === q.answer ? 'Correct. ' : 'Not quite. ') + q.explain;
          feedback.className = 'quiz-feedback ' + (i === q.answer ? 'ok' : 'bad');
          next.hidden = false;
          next.focus();
        } }, h('span', { class: 'opt-letter' }, String.fromCharCode(65 + i)), h('span', null, text));
        return btn;
      });
      root.append(
        h('div', { class: 'quiz-top' },
          h('p', { class: 'eyebrow' }, 'Question ' + (index + 1) + ' of ' + questions.length),
          best ? h('p', { class: 'muted' }, 'Best: ' + best() + ' / ' + questions.length) : null),
        h('div', { class: 'quiz-progress', role: 'presentation' }, h('span', { style: 'width:' + (index / questions.length * 100) + '%' })),
        h('h4', { class: 'quiz-q' }, q.q),
        h('div', { class: 'quiz-options' }, buttons),
        feedback,
        next);
    }

    draw();
    return root;
  }

  function mount(container, callbacks, best) {
    const h = LL.dom.h;
    container.textContent = '';
    container.append(
      h('section', { 'aria-labelledby': 'lessons-title' },
        h('h3', { id: 'lessons-title', class: 'panel-title' }, 'Lessons'),
        h('p', { class: 'panel-sub' }, 'Six short ideas that cover most deceptive links. Open one to read it.'),
        h('div', { class: 'lessons' }, lessons.map(lessonCard))),
      h('section', { 'aria-labelledby': 'quiz-title' },
        h('h3', { id: 'quiz-title', class: 'panel-title' }, 'Test yourself'),
        h('p', { class: 'panel-sub' }, 'Eight questions. You get an explanation after each answer.'),
        quizWidget(callbacks, best)));
  }

  LL.learn = { lessons: lessons, questions: questions, scoreQuiz: scoreQuiz, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
