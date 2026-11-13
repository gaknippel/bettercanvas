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
      const link = card.querySelector('a.ic-DashboardCard__link, a[href*="/courses/"]');
      const id = link && (/\/courses\/(\d+)/.exec(link.getAttribute('href')) || [])[1];
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

  function relative(date) {
    const mins = Math.round((date - Date.now()) / 60000);
    if (mins < 0) return 'overdue';
    if (mins < 60) return `in ${mins} min`;
    if (mins < 60 * 24) return `in ${Math.round(mins / 60)} h`;
    const days = Math.round(mins / (60 * 24));
    return days === 1 ? 'tomorrow' : `in ${days} days`;
  }

  async function loadDue() {
    const start = new Date(Date.now() - 2 * 864e5).toISOString();
    const end = new Date(Date.now() + 14 * 864e5).toISOString();
    const items = await api(`/api/v1/planner/items?start_date=${start}&end_date=${end}&per_page=100`);
    return items
      .filter(it => it.plannable && it.plannable_date)
      .filter(it => ['assignment', 'quiz', 'discussion_topic'].includes(it.plannable_type))
      .filter(it => !(it.submissions && (it.submissions.submitted || it.submissions.graded)))
      .filter(it => !(it.planner_override && it.planner_override.marked_complete))
      .map(it => ({
        title: it.plannable.title || 'Untitled',
        course: it.context_name || '',
        url: it.html_url || '#',
        date: new Date(it.plannable_date),
        missing: !!(it.submissions && it.submissions.missing)
      }))
      .filter(it => it.missing || it.date > Date.now())
      .sort((a, b) => a.date - b.date)
      .slice(0, 12);
  }

  function renderDue(host) {
    const box = el('section', 'sc-due');
    box.appendChild(el('h2', 'sc-due__title', 'Due soon'));
    if (!dueItems.length) box.appendChild(el('p', 'sc-due__empty', 'Nothing due in the next two weeks.'));
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    for (const it of dueItems) {
      const row = el('a', 'sc-due__item' + (it.missing ? ' sc-due__item--missing' : ''));
      row.href = it.url;
      row.appendChild(el('span', 'sc-due__name', it.title));
      row.appendChild(el('span', 'sc-due__meta',
        `${it.course ? it.course + ' · ' : ''}${it.missing ? 'missing' : relative(it.date)} · ${fmt.format(it.date)}`));
      box.appendChild(row);
    }
    host.prepend(box);
  }

  async function paintDue() {
    const host = document.getElementById('right-side');
    if (!host || host.querySelector('.sc-due')) return;
    if (!dueItems) {
      if (dueLoading || dueFailed) return;
      dueLoading = true;
      try { dueItems = await loadDue(); }
      catch (e) { dueFailed = true; console.warn('[shittyCanvas] due list:', e); return; }
      finally { dueLoading = false; }
    }
    if (!host.querySelector('.sc-due')) renderDue(host);
  }

  // ---- wiring ----------------------------------------------------------

  function clear(selector) {
    for (const n of document.querySelectorAll(selector)) n.remove();
  }

  function run() {
    const s = SC.settings;
    const on = s.enabled && !SC.notCanvas && onDashboard();
    if (on && s.cardGrades) paintGrades(); else clear('.sc-grade');
    if (on && s.dueList) paintDue(); else clear('.sc-due');
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
