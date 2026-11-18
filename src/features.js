// Dashboard extras that need data rather than CSS. They call Canvas's own
// REST API with the session you're already logged in with; nothing leaves
// your Canvas site.
'use strict';

(function () {
  if (SC.notCanvas) return;

  async function api(path) {
    const url = location.origin + path;
    const opts = { credentials: 'include', headers: { Accept: 'application/json' } };
    let res = await fetch(url, opts);
    // Firefox: if the extension-context request went out without the session
    // cookie, retry as the page itself.
    if (!res.ok && typeof content !== 'undefined' && content.fetch) res = await content.fetch(url, opts);
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return JSON.parse((await res.text()).replace(/^while\(1\);/, ''));
  }

  const onDashboard = () => !!document.getElementById('DashboardCard_Container') ||
    !!document.getElementById('dashboard');

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  const courseIdFrom = href => (/\/courses\/(\d+)/.exec(href || '') || [])[1];

  function cardCourseId(card) {
    const link = card.querySelector('a.ic-DashboardCard__link, a[href*="/courses/"]');
    return link && courseIdFrom(link.getAttribute('href'));
  }

  // ---- hidden classes ---------------------------------------------------

  function cardName(card) {
    const t = card.querySelector('.ic-DashboardCard__header-title');
    return (t && t.textContent.trim()) || card.getAttribute('aria-label') || '';
  }

  async function hideCourse(id, name) {
    const s = await SC.load();
    if (s.hidden.some(h => h.id === id)) return;
    await SC.save({ hidden: s.hidden.concat({ id, name }) }); // storage change re-runs run()
  }

  function paintHidden(hidden, onDash) {
    if (onDash) {
      for (const card of document.querySelectorAll('.ic-DashboardCard')) {
        const id = cardCourseId(card);
        if (!id) continue;
        card.classList.toggle('sc-hidden', hidden.has(id));
        if (card.querySelector('.sc-hide')) continue;
        const b = el('button', 'sc-hide', 'Hide');
        b.type = 'button';
        b.title = 'Hide this class (bring it back from the shittyCanvas menu)';
        b.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          hideCourse(id, cardName(card));
        });
        (card.querySelector('.ic-DashboardCard__header') || card).appendChild(b);
      }
    }
    // The Courses tray in the left-hand nav, on every page.
    for (const a of document.querySelectorAll('#nav-tray-portal a[href*="/courses/"]')) {
      const id = courseIdFrom(a.getAttribute('href'));
      const li = a.closest('li');
      if (id && li) li.classList.toggle('sc-hidden', hidden.has(id));
    }
  }

  function unpaintHidden() {
    clear('.sc-hide');
    for (const n of document.querySelectorAll('.sc-hidden')) n.classList.remove('sc-hidden');
  }

  // ---- grades on dashboard cards --------------------------------------

  let gradesPromise = null;

  function loadGrades() {
    if (!gradesPromise) {
      gradesPromise = api('/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=100')
        .then(courses => {
          const map = new Map();
          for (const c of courses) {
            const e = (c.enrollments || []).find(x => x.type === 'student');
            if (!e || e.computed_current_score == null) continue;
            map.set(String(c.id), { score: e.computed_current_score, letter: e.computed_current_grade });
          }
          return map;
        })
        .catch(e => { console.warn('[shittyCanvas] grades:', e); return new Map(); });
    }
    return gradesPromise;
  }

  async function paintGrades() {
    const cards = document.querySelectorAll('.ic-DashboardCard');
    if (!cards.length) return;
    const grades = await loadGrades();
    for (const card of cards) {
      if (card.querySelector('.sc-grade')) continue;
      const id = cardCourseId(card);
      const g = id && grades.get(id);
      if (!g) continue;
      const pill = el('a', 'sc-grade', `${g.score}%${g.letter ? ' · ' + g.letter : ''}`);
      pill.href = `/courses/${id}/grades`;
      pill.title = 'Current grade (open grades)';
      (card.querySelector('.ic-DashboardCard__header') || card).appendChild(pill);
    }
  }

  // ---- "due soon" panel -----------------------------------------------

  let dueItems = null;
  let dueLoading = false;
  let dueFailed = false;
  let dueKey = null; // which hidden set the rendered list was filtered with

  const SVG = 'http://www.w3.org/2000/svg';
  const DAY = 864e5;
  const RING_WINDOW = 7 * DAY; // a full ring means a week or more to go

  // "40m", "5h", "3d"
  function shortLeft(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return m + 'm';
    const h = Math.round(m / 60);
    return h < 48 ? h + 'h' : Math.round(h / 24) + 'd';
  }

  function urgency(it) {
    if (it.missing) return 'missing';
    const left = it.date - Date.now();
    return left < DAY ? 'soon' : left < 3 * DAY ? 'near' : 'later';
  }

  function svg(tag, attrs) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  // Countdown ring: drains as the deadline gets closer.
  function ring(it) {
    const left = it.date - Date.now();
    const frac = it.missing ? 1 : Math.min(1, Math.max(0.04, left / RING_WINDOW));
    const c = 2 * Math.PI * 13;
    const s = svg('svg', { viewBox: '0 0 32 32', class: 'sc-ring', 'aria-hidden': 'true' });
    s.append(
      svg('circle', { cx: 16, cy: 16, r: 13, class: 'sc-ring__track' }),
      svg('circle', { cx: 16, cy: 16, r: 13, class: 'sc-ring__bar',
        'stroke-dasharray': `${(c * frac).toFixed(1)} ${c.toFixed(1)}`, transform: 'rotate(-90 16 16)' })
    );
    const t = svg('text', { x: 16, y: 16, class: 'sc-ring__label', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    t.textContent = it.missing ? '!' : shortLeft(left);
    s.append(t);
    return s;
  }

  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const fmtShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

  function groupLabel(it) {
    if (it.missing) return 'Missing';
    const diff = Math.round((startOfDay(it.date) - startOfDay(Date.now())) / DAY);
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : fmtDay.format(it.date);
  }

  async function loadDue() {
    const start = new Date(Date.now() - 2 * DAY).toISOString();
    const end = new Date(Date.now() + 14 * DAY).toISOString();
    const [items, colors] = await Promise.all([
      api(`/api/v1/planner/items?start_date=${start}&end_date=${end}&per_page=100`),
      api('/api/v1/users/self/colors').catch(() => ({}))
    ]);
    const courseColors = (colors && colors.custom_colors) || {};
    return items
      .filter(it => it.plannable && it.plannable_date)
      .filter(it => ['assignment', 'quiz', 'discussion_topic'].includes(it.plannable_type))
      .filter(it => !(it.submissions && (it.submissions.submitted || it.submissions.graded)))
      .filter(it => !(it.planner_override && it.planner_override.marked_complete))
      .map(it => ({
        title: it.plannable.title || 'Untitled',
        course: it.context_name || '',
        courseId: it.course_id != null ? String(it.course_id) : null,
        color: it.course_id != null ? courseColors['course_' + it.course_id] : null,
        url: it.html_url || '#',
        date: new Date(it.plannable_date),
        missing: !!(it.submissions && it.submissions.missing)
      }))
      .filter(it => it.missing || it.date > Date.now())
      .sort((a, b) => a.date - b.date);
  }

  // One span per letter. Plain text unless a skin styles .sc-ransom
  // (Persona 5 turns it into a ransom-note title).
  function ransom(tag, cls, text) {
    const h = el(tag, cls);
    h.setAttribute('aria-label', text);
    for (const ch of text) {
      const s = el('span', ch === ' ' ? 'sc-ransom sc-ransom--sp' : 'sc-ransom', ch);
      s.setAttribute('aria-hidden', 'true');
      h.appendChild(s);
    }
    return h;
  }

  function renderDue(host, hidden) {
    // Things can tick past their deadline while the page sits open.
    const items = dueItems
      .filter(it => !hidden.has(it.courseId) && (it.missing || it.date > Date.now()))
      .slice(0, 12);

    const box = el('section', 'sc-due');
    const head = el('div', 'sc-due__head');
    head.appendChild(ransom('h2', 'sc-due__title', 'Due soon'));
    head.appendChild(el('span', 'sc-due__count', String(items.length)));
    const missing = items.filter(it => it.missing).length;
    const today = items.filter(it => !it.missing && groupLabel(it) === 'Today').length;
    if (missing) head.appendChild(el('span', 'sc-due__chip sc-due__chip--missing', `${missing} missing`));
    if (today) head.appendChild(el('span', 'sc-due__chip sc-due__chip--soon', `${today} today`));
    box.appendChild(head);

    if (!items.length) box.appendChild(el('p', 'sc-due__empty', 'Nothing due in the next two weeks. 🎉'));

    let group = null;
    for (const it of items) {
      const label = groupLabel(it);
      if (label !== group) {
        group = label;
        box.appendChild(el('h3', 'sc-due__day' + (it.missing ? ' sc-due__day--missing' : ''), label));
      }
      const row = el('a', `sc-due__item sc-due__item--${urgency(it)}`);
      row.href = it.url;
      row.title = `${it.title}\nDue ${fmtDay.format(it.date)}, ${fmtTime.format(it.date)}`;
      row.appendChild(ring(it));

      const text = el('span', 'sc-due__text');
      text.appendChild(el('span', 'sc-due__name', it.title));
      if (it.course) {
        const course = el('span', 'sc-due__course', it.course);
        if (it.color) course.style.setProperty('--sc-course', it.color);
        text.appendChild(course);
      }
      row.appendChild(text);

      row.appendChild(el('span', 'sc-due__time', it.missing ? fmtShort.format(it.date) : fmtTime.format(it.date)));
      box.appendChild(row);
    }
    host.prepend(box);
  }

  async function paintDue(hidden) {
    const host = document.getElementById('right-side');
    const key = [...hidden].sort().join(',');
    if (!host || (host.querySelector('.sc-due') && key === dueKey)) return;
    if (!dueItems) {
      if (dueLoading || dueFailed) return;
      dueLoading = true;
      try { dueItems = await loadDue(); }
      catch (e) { dueFailed = true; console.warn('[shittyCanvas] due list:', e); return; }
      finally { dueLoading = false; }
    }
    const old = host.querySelector('.sc-due');
    if (old && key === dueKey) return;
    if (old) old.remove();
    dueKey = key;
    renderDue(host, hidden);
  }

  // Keep the countdowns current while the dashboard sits open.
  setInterval(() => {
    if (!document.querySelector('.sc-due')) return;
    dueKey = null; // forces a re-render on the next run()
    run();
  }, 60000);

  // ---- wiring ----------------------------------------------------------

  function clear(selector) {
    for (const n of document.querySelectorAll(selector)) n.remove();
  }

  function run() {
    const s = SC.settings;
    const active = s.enabled && !SC.notCanvas;
    const on = active && onDashboard();
    const hidden = new Set(s.hidden.map(h => String(h.id)));
    if (active) paintHidden(hidden, on); else unpaintHidden();
    if (on && s.cardGrades) paintGrades(); else clear('.sc-grade');
    if (on && s.dueList) paintDue(hidden); else clear('.sc-due');
  }

  // Canvas renders the dashboard with React after load and re-renders it at
  // will, so keep re-applying (every step above is a no-op when already done).
  let pending = null;
  new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; run(); }, 250);
  }).observe(document.body, { childList: true, subtree: true });

  SC.onSettings(run);
  run();
})();
