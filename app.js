// دفترچه‌ی من — داشبورد شخصی روژان.
// همه‌ی داده‌ها رمزنگاری‌شده‌اند (AES-GCM 256). کلید فقط در لینک شخصی روژان است
// (بعد از # — این بخش هیچ‌وقت به سرور فرستاده نمی‌شود) و روی دستگاه خودش نگه داشته می‌شود.
// نظرها و تأییدها با توکن خود روژان در مخزن خصوصی استودیو ثبت می‌شوند تا Claude آن‌ها را بخواند.

const OWNER = 'rojansabouni1387-tech';
const INBOX_REPO = 'rojan-content-studio';
const INBOX_DIR = 'دفترچه/صندوق';
const LS = { key: 'daftarche.key', token: 'daftarche.token', sent: 'daftarche.sent' };
const PLAN_START = Date.UTC(2026, 8, 26); // شنبه ۴ مهر ۱۴۰۵
const DAY = 86400000;

const SECTIONS = [
  { id: 'news', full: 'خبرهای روز', short: 'خبرها' },
  { id: 'instagram', full: 'تولید محتوای اینستا', short: 'اینستا' },
  { id: 'linkedin', full: 'لینکدین', short: 'لینکدین' },
  { id: 'progress', full: 'جدول پیشرفت', short: 'پیشرفت' },
  { id: 'article', full: 'مقاله', short: 'مقاله' },
];

const CATS = [
  ['trend', 'ترندها'],
  ['designers', 'طراحان و مدیران خلاق'],
  ['shows', 'فشن‌شوها و کلکسیون‌ها'],
  ['business', 'صنعت و کسب‌وکار'],
  ['culture', 'فرش قرمز و فرهنگ'],
  ['controversy', 'حواشی'],
  ['iran', 'ایران و منطقه'],
];
// رنگ هر بستر — با اعتبارسنج رنگ نمودار چک شده (رنگ‌کوری و کنتراست روی سفید)
const PLATFORMS = {
  instagram: { name: 'اینستاگرام', color: '#c9507f' },
  linkedin: { name: 'لینکدین', color: '#2a78d6' },
  article: { name: 'مقاله', color: '#4a3aa7' },
};
const ACTIVITY_PATH = 'دفترچه/فعالیت.json';
const TOTAL_WEEKS = 13;
const catName = (id) => (CATS.find((c) => c[0] === id) || [, 'دیگر'])[1];

let KEY = null;
let manifest = null;
const cache = new Map();
const state = { newsDate: null, newsCat: 'all' };

/* ───────── ابزارها ───────── */

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v; // فقط برای خروجی md() که خودش escape می‌کند
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// replaceChildren آرایه را باز نمی‌کند و undefined را متن می‌کند؛ این یکی می‌کند
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
}

function b64ToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* حالت خصوصی مرورگر */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

async function load(file) {
  if (cache.has(file)) return cache.get(file);
  const res = await fetch('data/' + file, { cache: file === 'manifest.enc' ? 'no-store' : 'default' });
  if (!res.ok) throw new Error('fetch ' + res.status);
  const buf = b64ToBytes((await res.text()).trim());
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, KEY, buf.slice(12));
  const data = JSON.parse(new TextDecoder().decode(plain));
  if (file !== 'manifest.enc') cache.set(file, data);
  return data;
}

function tehranToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
// تاریخ شمسی را از تکه‌ها می‌سازد تا ترتیب و ویرگول در همه‌ی مرورگرها یکی باشد: «سه‌شنبه ۳۱ شهریور ۱۴۰۵»
function faDate(iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { ...opts, timeZone: 'UTC' }).formatToParts(new Date(iso + 'T12:00:00Z'));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return ['weekday', 'day', 'month', 'year'].map(get).filter(Boolean).join(' ');
}
function faTime(iso) {
  return new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
const faNum = (n) => new Intl.NumberFormat('fa-IR').format(n);
function weekOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - PLAN_START) / (7 * DAY)) + 1;
}
function igDays(week) {
  const start = PLAN_START + (week - 1) * 7 * DAY;
  const offsets = week <= 2 ? [0, 4] : [0, 2, 4]; // دو هفته‌ی اول: شنبه و چهارشنبه
  return offsets.map((o) => new Date(start + o * DAY).toISOString().slice(0, 10));
}

let toastTimer = 0;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('کپی شد');
}

function getSent() {
  try { return JSON.parse(store.get(LS.sent) || '{}'); } catch { return {}; }
}
function markSent(id, data) {
  const s = getSent();
  s[id] = { ...data, at: new Date().toISOString() };
  store.set(LS.sent, JSON.stringify(s));
}

/* ───────── فرستادن به Claude (صندوق در مخزن خصوصی استودیو) ───────── */

async function sendInbox(item) {
  const token = store.get(LS.token);
  if (!token) {
    openSettings(true);
    throw new Error('no-token');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${INBOX_DIR}/${stamp}-${item.kind}.json`;
  const url = `https://api.github.com/repos/${OWNER}/${INBOX_REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({
      message: `دفترچه: ${item.kind} — ${item.target || ''}`,
      content: utf8ToB64(JSON.stringify({ ...item, sentAt: new Date().toISOString() }, null, 2)),
    }),
  });
  if (!res.ok) throw new Error(String(res.status));
}

async function send(item, sentId, okMsg) {
  try {
    await sendInbox(item);
    markSent(sentId, { kind: item.kind, text: item.text || '' });
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    if (e.message !== 'no-token') toast(e.message === '401' ? 'اتصال منقضی شده؛ از «اتصال» دوباره وصل کن' : 'فرستاده نشد؛ اینترنت را چک کن و دوباره بزن');
    return false;
  }
}

/* ───────── markdown ساده و امن (برای متن مقاله) ───────── */

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
}
function md(src) {
  let out = '';
  let para = [];
  let list = null;
  const flushP = () => { if (para.length) { out += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  const flushL = () => { if (list) { out += `<${list.t}>` + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + `</${list.t}>`; list = null; } };
  for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
    const l = raw.trim();
    let m;
    if (!l) { flushP(); flushL(); continue; }
    if ((m = l.match(/^(#{2,3})\s+(.*)$/))) { flushP(); flushL(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
    if ((m = l.match(/^[-*]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^>\s?(.*)$/))) { flushP(); flushL(); out += '<blockquote>' + inline(m[1]) + '</blockquote>'; continue; }
    flushL();
    para.push(l);
  }
  flushP();
  flushL();
  return out;
}

/* ───────── تکه‌های مشترک ───────── */

function statusPill(s) {
  const map = {
    ready: ['آماده', 'rose'], recorded: ['ضبط شد', 'ok'], published: ['منتشر شد', 'ok'],
    approved: ['تأیید شد', 'ok'], posted: ['منتشر شد', 'ok'], draft: ['پیش‌نویس', ''], revised: ['بازنویسی شد', 'rose'],
  };
  const [t, c] = map[s] || [s || 'آماده', 'rose'];
  return h('span', { class: 'pill ' + c, text: t });
}

function newsStatusClass(s) {
  if (/تأیید/.test(s)) return 'ok';
  if (/ادعا|شایعه/.test(s)) return 'warn';
  return '';
}

function sourcesEl(list) {
  if (!list || !list.length) return null;
  return h('div', { class: 'sources' },
    h('span', { text: 'منبع:' }),
    list.map((s) => h('span', null,
      s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.outlet || 'لینک' }) : s.outlet,
      s.date ? '، ' + s.date : '')));
}

function copyBtn(text, label = 'کپی') {
  return h('button', { class: 'btn small', type: 'button', onclick: () => copy(text) }, label);
}

function block(title, text, cls, withCopy) {
  if (!text) return null;
  return h('div', { class: 'block' },
    h('div', { class: 'block-h' }, h('h4', { text: title }), withCopy && copyBtn(text)),
    h('div', { class: cls, text }));
}

function empty(msg) {
  return h('div', { class: 'empty' }, h('div', { class: 'ring', 'aria-hidden': 'true' }), h('p', { text: msg }));
}

function header(eyebrow, title, sub, extra) {
  return [
    h('div', { class: 'mobile-top' }, h('span', { class: 'mk' }, h('i', { 'aria-hidden': 'true' }), 'دفترچه‌ی من')),
    h('div', { class: 'head-row' },
      h('div', null, h('div', { class: 'eyebrow', text: eyebrow }), h('h1', { class: 'page-h', text: title }), sub && h('p', { class: 'page-sub', text: sub })),
      extra || null),
  ];
}

function commentBox(target, section, placeholder) {
  const sentId = 'cm-' + target;
  const ta = h('textarea', { placeholder, rows: '3' });
  const sent = getSent()[sentId];
  const note = h('div', { class: 'sent', text: sent ? 'آخرین نظرت فرستاده شد ✓' : '' });
  const btn = h('button', {
    class: 'btn rose', type: 'button',
    onclick: async () => {
      const text = ta.value.trim();
      if (!text) { toast('اول نظرت را بنویس'); ta.focus(); return; }
      btn.disabled = true;
      if (await send({ kind: 'comment', section, target, text }, sentId, 'نظرت فرستاده شد')) {
        ta.value = '';
        note.textContent = 'فرستاده شد ✓ — متن با نظرت بازنویسی می‌شود';
      }
      btn.disabled = false;
    },
  }, 'ارسال نظر');
  return h('div', { class: 'comment-box', hidden: true }, ta, h('div', { class: 'actions', style: 'margin-top:0' }, btn, note));
}

/* ───────── خبرهای روز ───────── */

async function viewNews(root) {
  const days = manifest.entries.filter((e) => e.type === 'news').sort((a, b) => b.date.localeCompare(a.date));
  if (!days.length) {
    root.append(...header('استودیو تولید محتوا', 'خبرهای روز'), h('div', { class: 'sec' }, empty('اولین گزارش خبری فردا صبح اینجا می‌آید.')));
    return;
  }
  const entry = days.find((d) => d.date === state.newsDate) || days[0];
  const pick = days.length > 1 && h('select', {
    class: 'pick', 'aria-label': 'انتخاب روز',
    onchange: (e) => { state.newsDate = e.target.value; state.newsCat = 'all'; route(); },
  }, days.map((d) => h('option', { value: d.date, selected: d.date === entry.date || null, text: faDate(d.date) })));

  const data = await load(entry.file);
  const sub = faDate(entry.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
    (data.updatedAt ? ' — به‌روزشده ساعت ' + faTime(data.updatedAt) : '');
  root.append(...header('فقط خبرهای داغ و تازه', 'خبرهای روز', sub, pick));

  const items = data.items || [];
  const important = items.filter((i) => i.important);
  if (important.length) {
    root.append(h('div', { class: 'sec' },
      h('div', { class: 'sec-h' }, h('h2', { text: 'مهم‌ترین‌های امروز' }), h('span', { class: 'rule' })),
      h('div', { class: 'top-news' }, important.map((i) => h('a', {
        class: 'tn', href: '#n-' + i.id, style: 'text-decoration:none',
        onclick: (e) => { e.preventDefault(); state.newsCat = 'all'; renderNewsList(); document.getElementById('n-' + i.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      }, h('b', { text: i.title }), h('span', { text: catName(i.category) }))))));
  }

  const present = CATS.filter(([id]) => items.some((i) => i.category === id));
  const chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'دسته‌ها' });
  const list = h('div');
  function renderNewsList() {
    fill(chips,
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(state.newsCat === 'all'), onclick: () => { state.newsCat = 'all'; renderNewsList(); } }, 'همه', h('small', { text: faNum(items.length) })),
      present.map(([id, name]) => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(state.newsCat === id),
        onclick: () => { state.newsCat = id; renderNewsList(); },
      }, name, h('small', { text: faNum(items.filter((i) => i.category === id).length) }))));
    const groups = (state.newsCat === 'all' ? present : present.filter(([id]) => id === state.newsCat));
    list.replaceChildren(...groups.map(([id, name]) => h('div', { class: 'sec' },
      h('div', { class: 'sec-h' }, h('h2', { text: name }), h('span', { class: 'rule' })),
      items.filter((i) => i.category === id).map(newsCard))));
  }
  root.append(h('div', { class: 'sec' }, chips), list);
  renderNewsList();

  if (data.note || (data.unavailable && data.unavailable.length)) {
    root.append(h('p', { class: 'news-note', text: [data.note, data.unavailable && data.unavailable.length ? 'سایت‌هایی که باز نشدند: ' + data.unavailable.join('، ') : ''].filter(Boolean).join(' ') }));
  }
}

function newsCard(it) {
  return h('article', { class: 'card' + (it.important ? ' important' : ''), id: 'n-' + it.id },
    h('div', { class: 'meta' },
      it.important && h('span', { class: 'pill rose', text: 'مهم' }),
      it.fresh && h('span', { class: 'pill rose', text: 'تازه' }),
      it.status && h('span', { class: 'pill ' + newsStatusClass(it.status), text: it.status }),
      it.confidence && h('span', { class: 'pill', text: 'اطمینان: ' + it.confidence })),
    h('h3', { text: it.title }),
    h('p', { class: 'summary', text: it.summary }),
    it.why && h('p', { class: 'why' }, h('b', { text: 'چرا مهم است: ' }), it.why),
    sourcesEl(it.sources));
}

/* ───────── تولید محتوای اینستا ───────── */

async function viewInstagram(root) {
  await loadActivity().catch(() => null);
  const all = manifest.entries.filter((e) => e.type === 'instagram').sort((a, b) => a.date.localeCompare(b.date));
  const today = tehranToday();
  const week = Math.max(1, weekOf(today));
  const days = igDays(week);
  const byDate = Object.fromEntries(all.map((e) => [e.date, e]));
  const current = await Promise.all(days.filter((d) => byDate[d]).map((d) => load(byDate[d].file)));

  root.append(...header('ضبط، کپشن، هشتگ', 'تولید محتوای اینستا',
    `هفته‌ی ${faNum(week)} — ${days.map((d) => faDate(d, { weekday: 'long' })).join('، ')}`));

  // ── نظر روژان درباره‌ی مطالب این هفته
  const fb = h('div', { class: 'feedback sec' },
    h('h2', { text: 'نظر روژان درباره‌ی مطالب این هفته' }),
    h('p', { class: 'fb-sub', text: 'هر نظری بنویسی، متن همان روز با نظرت بازنویسی می‌شود و برای هفته‌های بعد هم یادم می‌ماند.' }),
    days.map((date) => {
      const e = byDate[date];
      const data = e && current.find((c) => c.date === date);
      const sentId = 'fb-' + date;
      const sent = getSent()[sentId];
      const ta = h('textarea', { rows: '2', disabled: !e, placeholder: e ? 'نظرت درباره‌ی متن این روز…' : 'متن این روز صبح همان روز آماده می‌شود' });
      const note = h('div', { class: 'sent', text: sent ? 'فرستاده شد ✓' : '' });
      const btn = h('button', {
        class: 'btn rose', type: 'button', disabled: !e,
        onclick: async () => {
          const text = ta.value.trim();
          if (!text) { toast('اول نظرت را بنویس'); ta.focus(); return; }
          btn.disabled = true;
          if (await send({ kind: 'comment', section: 'instagram', target: e.id, date, text }, sentId, 'نظرت فرستاده شد')) {
            ta.value = '';
            note.textContent = 'فرستاده شد ✓ — متن با نظرت بازنویسی می‌شود';
          }
          btn.disabled = false;
        },
      }, 'ارسال');
      return h('div', { class: 'fb-row' },
        h('div', { class: 'day' }, h('b', { text: faDate(date) }), h('span', { text: data ? data.topic : '—' })),
        h('div', null, ta, note),
        btn);
    }));
  root.append(fb);

  // ── متن‌های کامل این هفته
  const sec = h('div', { class: 'sec' });
  if (current.length) current.forEach((d) => sec.append(igCard(d)));
  else sec.append(empty(today < '2026-09-26'
    ? 'برنامه از شنبه ۴ مهر شروع می‌شود. متن اولین ویدیو همان روز صبح اینجا آماده است.'
    : 'متن ویدیوی بعدی صبح روز ضبط اینجا آماده می‌شود.'));
  root.append(sec);

  // ── هفته‌های تمام‌شده: فقط یک خط، با امکان باز کردن و گرفتن فایل
  const past = [...new Set(all.map((e) => weekOf(e.date)))].filter((w) => w < week).sort((a, b) => b - a);
  if (past.length) {
    root.append(h('div', { class: 'archive' },
      h('div', { class: 'sec-h' }, h('h2', { text: 'هفته‌های قبل' }), h('span', { class: 'rule' })),
      past.map((w) => {
        const inner = h('div', { class: 'sec' });
        const det = h('details', null,
          h('summary', null, h('span', { text: `تولید محتوای اینستا — هفته‌ی ${faNum(w)}` })),
          inner);
        det.addEventListener('toggle', async () => {
          if (!det.open || inner.childElementCount) return;
          const ws = await Promise.all(all.filter((e) => weekOf(e.date) === w).map((e) => load(e.file)));
          inner.append(h('div', { class: 'actions', style: 'margin-top:0;margin-bottom:12px' },
            h('button', { class: 'btn small', type: 'button', onclick: () => downloadWeek(w, ws) }, 'فایل متن‌های این هفته')),
            ws.map(igCard));
        });
        return det;
      })));
  }
}

function igCard(d) {
  const onscreenText = (d.onscreen || []).map((o) => o.text).join('\n');
  return h('article', { class: 'card day-card', id: 'ig-' + d.date },
    h('div', { class: 'day-h' },
      h('span', { class: 'when', text: faDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' }) }),
      h('div', { class: 'pills' },
        h('span', { class: 'pill', text: d.format || 'ریلز' }),
        d.duration && h('span', { class: 'pill', text: d.duration }),
        statusPill(d.status))),
    h('h3', { text: d.topic }),
    d.why && h('p', { class: 'why', text: d.why }),
    block('متنی که جلوی دوربین می‌گویی — حفظ کن', d.script, 'say', true),
    (d.onscreen || []).length && h('div', { class: 'block' },
      h('div', { class: 'block-h' }, h('h4', { text: 'متن روی ویدیو' }), copyBtn(onscreenText)),
      h('ol', { class: 'onscreen' }, d.onscreen.map((o) => h('li', null, h('span', { class: 't', text: o.time }), h('span', { text: o.text }))))),
    block('کپشن', d.caption_fa, 'caption', true),
    block('English caption', d.caption_en, 'caption ltr', true),
    (d.hashtags || []).length && h('div', { class: 'block' },
      h('div', { class: 'block-h' }, h('h4', { text: 'هشتگ‌ها' }), copyBtn(d.hashtags.join(' '))),
      h('div', { class: 'tags' }, d.hashtags.map((t) => h('span', { text: t })))),
    block('برای ضبط', d.notes, 'caption', false),
    (d.sources || []).length && h('details', { class: 'more' }, h('summary', { text: 'منابع' }), sourcesEl(d.sources)),
    postButtons(d, 'instagram'));
}

function downloadWeek(w, entries) {
  const txt = entries.map((e) => [
    `— ${faDate(e.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} —`,
    `موضوع: ${e.topic}`, '',
    'متنی که جلوی دوربین می‌گویی:', e.script || '', '',
    'متن روی ویدیو:', ...(e.onscreen || []).map((o) => `${o.time}: ${o.text}`), '',
    'کپشن:', e.caption_fa || '', '', e.caption_en || '', '',
    (e.hashtags || []).join(' '),
  ].join('\n')).join('\n\n\n');
  const url = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' }));
  const a = h('a', { href: url, download: `instagram-week-${w}.txt` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ───────── لینکدین ───────── */

async function viewLinkedin(root) {
  await loadActivity().catch(() => null);
  const entries = manifest.entries.filter((e) => e.type === 'linkedin').sort((a, b) => b.date.localeCompare(a.date));
  root.append(...header('تحلیلی‌تر از همه‌جا', 'لینکدین', 'پست‌های آماده؛ تأیید کن یا نظرت را بگو.'));
  const sec = h('div', { class: 'sec' });
  if (!entries.length) sec.append(empty('اولین پست لینکدین سه‌شنبه ۷ مهر صبح اینجا آماده می‌شود.'));
  for (const e of entries) sec.append(liCard(await load(e.file)));
  root.append(sec);
}

// متن + هشتگ را یکی می‌کند — همین رشته کپی می‌شود و همین توی لینکدین باز می‌شود،
// یعنی چیزی که می‌رود توی باکس، همان چیزی است که پست می‌شود.
function liPayload(text, hashtags) {
  return hashtags && hashtags.length ? text + '\n\n' + hashtags.join(' ') : text;
}
function liOpenUrl(text, hashtags) {
  return 'https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(liPayload(text, hashtags));
}

// یک بلوک زبان با دو دکمه‌ی خودش: «کپی متن آماده» و «باز کردن لینکدین» — هر دو
// متن + هشتگ را با هم می‌برند، برای همین بعد از باز شدن فقط دکمه‌ی Post لازم است.
function liTextBlock(title, text, hashtags, cls) {
  if (!text) return null;
  return h('div', { class: 'block' },
    h('div', { class: 'block-h' },
      h('h4', { text: title }),
      h('div', { class: 'block-actions' },
        copyBtn(liPayload(text, hashtags), 'کپی متن آماده'),
        h('a', { class: 'btn small', href: liOpenUrl(text, hashtags), target: '_blank', rel: 'noopener noreferrer' }, 'باز کردن لینکدین'))),
    h('div', { class: cls, text }));
}

function liCard(p) {
  const box = commentBox(p.id, 'linkedin', 'چه چیزی را دوست نداشتی یا باید عوض شود؟');
  const actions = postButtons(p, 'linkedin', () => [
    h('button', { class: 'btn', type: 'button', onclick: () => { box.hidden = !box.hidden; if (!box.hidden) box.querySelector('textarea').focus(); } }, 'نظر روژان'),
  ]);
  return h('article', { class: 'card' },
    h('div', { class: 'meta' }, h('span', { class: 'pill', text: faDate(p.date) }), statusPill(p.status), p.lang === 'bi' && h('span', { class: 'pill', text: 'دوزبانه' })),
    h('h3', { text: p.title }),
    p.angle && h('p', { class: 'why', text: p.angle }),
    liTextBlock('متن فارسی — این را اول پست کن', p.text_fa, p.hashtags, 'post'),
    liTextBlock('English — post second', p.text_en, p.hashtags, 'post ltr'),
    (p.hashtags || []).length && h('div', { class: 'block' }, h('div', { class: 'tags' }, p.hashtags.map((t) => h('span', { text: t })))),
    sourcesEl(p.sources),
    actions,
    box);
}

/* ───────── مقاله ───────── */

async function viewArticle(root) {
  const entries = manifest.entries.filter((e) => e.type === 'article').sort((a, b) => b.date.localeCompare(a.date));
  root.append(...header('برای بخش «مقاله‌ها»ی سایتت', 'مقاله', 'هر جمعه؛ تأیید کن تا روی سایت برود.'));
  const sec = h('div', { class: 'sec' });
  if (!entries.length) sec.append(empty('اولین مقاله جمعه ۱۷ مهر اینجا آماده می‌شود.'));
  for (const e of entries) sec.append(arCard(await load(e.file)));
  root.append(sec);
}

function arCard(a) {
  const sent = getSent();
  const approved = ['approved', 'published'].includes(a.status) || sent['ap-' + a.id];
  const body = h('div', { class: 'md' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  function show(lang) {
    fill(tabs,
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(lang === 'fa'), onclick: () => show('fa') }, 'فارسی'),
      a.body_en && h('button', { type: 'button', role: 'tab', 'aria-selected': String(lang === 'en'), onclick: () => show('en') }, 'English'));
    body.className = 'md' + (lang === 'en' ? ' ltr' : '');
    body.innerHTML = md(lang === 'en' ? a.body_en : a.body_fa);
  }
  show('fa');
  const box = commentBox(a.id, 'article', 'نظرت درباره‌ی این مقاله…');
  const actions = h('div', { class: 'actions' },
    approved
      ? h('span', { class: 'pill ok', text: a.status === 'published' ? 'روی سایت منتشر شد' : 'تأیید شد — منتشر می‌شود' })
      : h('button', {
        class: 'btn primary', type: 'button',
        onclick: async (ev) => {
          const b = ev.currentTarget;
          if (!confirm('این مقاله برای انتشار روی سایت تأیید شود؟')) return;
          b.disabled = true;
          if (await send({ kind: 'approve', section: 'article', target: a.id }, 'ap-' + a.id, 'تأیید شد')) b.replaceWith(h('span', { class: 'pill ok', text: 'تأیید شد — منتشر می‌شود' }));
          else b.disabled = false;
        },
      }, 'تأیید برای انتشار'),
    h('button', { class: 'btn', type: 'button', onclick: () => { box.hidden = !box.hidden; } }, 'نظر روژان'));
  return h('article', { class: 'card' },
    h('div', { class: 'meta' }, h('span', { class: 'pill', text: faDate(a.date) }), statusPill(a.status)),
    h('h3', { text: a.title_fa }),
    a.summary_fa && h('p', { class: 'summary', text: a.summary_fa }),
    a.seo && h('div', { class: 'seo' },
      a.seo.slug && h('span', null, h('b', { text: 'آدرس: ' }), h('span', { class: 'ltr', text: '/articles/' + a.seo.slug + '/' })),
      a.seo.description && h('span', null, h('b', { text: 'توضیح گوگل: ' }), a.seo.description),
      (a.seo.keywords || []).length && h('span', null, h('b', { text: 'کلیدواژه‌ها: ' }), a.seo.keywords.join('، '))),
    h('details', { class: 'more' }, h('summary', { text: 'متن کامل مقاله' }), h('div', { style: 'margin-top:12px' }, tabs), body),
    sourcesEl(a.sources),
    actions,
    box);
}

/* ───────── فعالیت روژان (تأیید، پست شد، آمار) — در مخزن خصوصی استودیو ───────── */

let activity = null;
let activitySha = null;

function ghHeaders() {
  return { Authorization: 'Bearer ' + store.get(LS.token), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}
function activityUrl() {
  return `https://api.github.com/repos/${OWNER}/${INBOX_REPO}/contents/${ACTIVITY_PATH.split('/').map(encodeURIComponent).join('/')}`;
}
function b64ToUtf8(b64) {
  return new TextDecoder().decode(b64ToBytes(b64.replace(/\s/g, '')));
}

async function loadActivity(force) {
  if (!store.get(LS.token)) return null;
  if (activity && !force) return activity;
  const res = await fetch(activityUrl() + '?ref=main', { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 404) {
    activity = { posts: {}, stats: {}, followers: [] };
    activitySha = null;
    return activity;
  }
  if (!res.ok) throw new Error(String(res.status));
  const j = await res.json();
  activity = JSON.parse(b64ToUtf8(j.content));
  activity.posts = activity.posts || {};
  activity.stats = activity.stats || {};
  activity.followers = activity.followers || [];
  activitySha = j.sha;
  return activity;
}

async function saveActivity(mutate, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await loadActivity(attempt > 0);
    mutate(activity);
    const res = await fetch(activityUrl(), {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({ message, content: utf8ToB64(JSON.stringify(activity, null, 2)), sha: activitySha || undefined }),
    });
    if (res.ok) {
      activitySha = (await res.json()).content.sha;
      return;
    }
    if (res.status !== 409 && res.status !== 422) throw new Error(String(res.status));
  }
  throw new Error('conflict');
}

async function act(mutate, message, okMsg) {
  if (!store.get(LS.token)) {
    openSettings(true);
    return false;
  }
  try {
    await saveActivity(mutate, message);
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    activity = null; // دفعه‌ی بعد از نو خوانده شود
    toast(e.message === '401' ? 'اتصال منقضی شده؛ از «اتصال» دوباره وصل کن' : 'ثبت نشد؛ اینترنت را چک کن و دوباره بزن');
    return false;
  }
}

function postState(entry) {
  const a = (activity && activity.posts[entry.id]) || {};
  return {
    approved: !!(a.approvedAt || getSent()['ap-' + entry.id] || ['approved', 'posted', 'published'].includes(entry.status)),
    postedAt: a.postedAt || (['posted', 'published'].includes(entry.status) ? entry.date + 'T12:00:00Z' : null),
  };
}

// دکمه‌های «تأیید متن» و «پست شد» — کنار هر متن اینستاگرام و لینکدین
function postButtons(entry, platform, extra = () => []) {
  const wrap = h('div', { class: 'actions' });
  const render = () => {
    const st = postState(entry);
    fill(wrap,
      st.approved
        ? h('span', { class: 'pill ok', text: 'متن تأیید شد ✓' })
        : h('button', {
          class: 'btn', type: 'button',
          onclick: async (ev) => {
            const b = ev.currentTarget;
            b.disabled = true;
            const ok = await send({ kind: 'approve', section: platform, target: entry.id }, 'ap-' + entry.id, null);
            if (ok) await act((A) => { A.posts[entry.id] = { ...(A.posts[entry.id] || {}), platform, date: entry.date, approvedAt: new Date().toISOString() }; }, `تأیید متن ${entry.id}`, 'متن تأیید شد');
            render();
          },
        }, 'تأیید متن'),
      st.postedAt
        ? h('span', { class: 'pill ok', text: 'پست شد ✓ ' + faDate(st.postedAt.slice(0, 10), { day: 'numeric', month: 'long' }) })
        : h('button', {
          class: 'btn primary', type: 'button',
          onclick: async (ev) => {
            const b = ev.currentTarget;
            if (!confirm(platform === 'instagram' ? 'این ویدیو را پست کردی؟' : 'این پست را منتشر کردی؟')) return;
            b.disabled = true;
            const ok = await act((A) => { A.posts[entry.id] = { ...(A.posts[entry.id] || {}), platform, date: entry.date, postedAt: new Date().toISOString() }; }, `پست شد ${entry.id}`, 'ثبت شد — در جدول پیشرفت آمد');
            if (ok) render(); else b.disabled = false;
          },
        }, platform === 'instagram' ? 'ویدیو پست شد' : 'پست شد'),
      extra());
  };
  render();
  return wrap;
}

/* ───────── برنامه و شمارش ───────── */

// روزهای انتشار هر بستر (هفته‌ی ۱ و ۲ سبک‌تر؛ اولین مقاله جمعه‌ی هفته‌ی ۲)
function platformsOn(iso) {
  const w = weekOf(iso);
  if (w < 1 || w > TOTAL_WEEKS) return [];
  const light = w <= 2;
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay(); // ۶ شنبه، ۰ یکشنبه، ... ۵ جمعه
  return {
    6: ['instagram'],
    0: [],
    1: light ? [] : ['instagram', 'linkedin'],
    2: ['linkedin'],
    3: ['instagram'],
    4: ['linkedin'],
    5: w === 1 ? [] : ['article'],
  }[dow];
}
function weekDates(week) {
  const start = PLAN_START + (week - 1) * 7 * DAY;
  return [...Array(7)].map((_, i) => new Date(start + i * DAY).toISOString().slice(0, 10));
}
function plannedIn(week, platform) {
  return weekDates(week).filter((d) => platformsOn(d).includes(platform)).length;
}
function postedList() {
  const out = [];
  const seen = new Set();
  if (activity) {
    for (const [id, a] of Object.entries(activity.posts)) {
      if (a.postedAt && a.date && a.platform) { out.push({ id, ...a }); seen.add(id); }
    }
  }
  for (const e of manifest.entries) {
    if (e.type === 'article' && e.status === 'published' && !seen.has(e.id)) out.push({ id: e.id, platform: 'article', date: e.date, postedAt: e.date });
  }
  return out;
}

/* ───────── نمودار: ابزارهای کوچک ───────── */

const NS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
// ستون با سر گرد ۴px و پایه‌ی صاف
function colPath(x, y, w, y0) {
  const r = Math.min(4, w / 2, y0 - y);
  return `M${x},${y0}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y0}Z`;
}
function tipEl() {
  let t = document.getElementById('tip');
  if (!t) { t = h('div', { id: 'tip', class: 'tip', role: 'tooltip' }); document.body.append(t); }
  return t;
}
// راهنمای شناور: اول مقدار (پررنگ)، بعد توضیح
function bindTip(el, lines) {
  const show = (x, y) => {
    const t = tipEl();
    fill(t, lines.map((l, i) => h('div', { class: 'tip-row' },
      l.color && h('i', { style: 'background:' + l.color }),
      i === 0 ? h('b', { text: l.text }) : h('span', { text: l.text }))));
    t.style.display = 'block';
    t.style.left = Math.min(window.innerWidth - t.offsetWidth - 8, Math.max(8, x - t.offsetWidth / 2)) + 'px';
    t.style.top = Math.max(8, y - t.offsetHeight - 14) + 'px';
  };
  const hide = () => { tipEl().style.display = 'none'; };
  el.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
  el.addEventListener('pointerleave', hide);
  el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); show(r.left + r.width / 2, r.top); });
  el.addEventListener('blur', hide);
  el.setAttribute('tabindex', '0');
}
function legend(items) {
  return h('div', { class: 'legend' }, items.map((it) => h('span', null, h('i', { class: it.dash ? 'dash' : '', style: '--c:' + it.color }), it.name)));
}

/* ───────── جدول پیشرفت ───────── */

async function viewProgress(root) {
  await loadActivity().catch(() => null);
  const today = tehranToday();
  const week = Math.min(TOTAL_WEEKS, Math.max(1, weekOf(today)));
  root.append(...header('آمار و برنامه', 'جدول پیشرفت', 'از شنبه ۴ مهر ۱۴۰۵ تا جمعه ۴ دی — ۱۳ هفته'));

  // ── برنامه‌ی هفته (شنبه تا جمعه)
  const posts = postedList();
  const done = (iso, p) => posts.some((x) => x.date === iso && x.platform === p);
  root.append(h('div', { class: 'sec' },
    h('div', { class: 'sec-h' }, h('h2', { text: 'برنامه‌ی هفته' }), h('span', { class: 'rule' }), h('span', { class: 'fine', text: `هفته‌ی ${faNum(week)} از ${faNum(TOTAL_WEEKS)}` })),
    h('div', { class: 'sched', role: 'table', 'aria-label': 'برنامه‌ی هفته، شنبه تا جمعه' },
      weekDates(week).map((iso) => {
        const ps = platformsOn(iso);
        return h('div', { class: 'sched-day' + (iso === today ? ' today' : ''), role: 'row' },
          h('div', { class: 'sd-h', role: 'rowheader' }, h('b', { text: faDate(iso, { weekday: 'long' }) }), h('span', { text: faDate(iso, { day: 'numeric', month: 'long' }) })),
          h('div', { class: 'sd-b', role: 'cell' },
            ps.length
              ? ps.map((p) => h('span', { class: 'plat' + (done(iso, p) ? ' is-done' : '') }, h('i', { style: 'background:' + PLATFORMS[p].color, 'aria-hidden': 'true' }), PLATFORMS[p].name, done(iso, p) && h('b', { class: 'tick-ok', text: ' ✓', 'aria-label': 'انجام شد' })))
              : h('span', { class: 'rest', text: 'استراحت' })));
      })),
    week <= 2 && h('p', { class: 'fine', style: 'margin-top:10px', text: 'دو هفته‌ی اول سبک‌تر است. از هفته‌ی ۳ (شنبه ۱۸ مهر) برنامه کامل می‌شود: اینستاگرام شنبه، دوشنبه و چهارشنبه؛ لینکدین دوشنبه، سه‌شنبه و پنجشنبه؛ مقاله جمعه.' })));

  if (!activity) {
    root.append(h('div', { class: 'sec feedback' },
      h('h2', { text: 'برای ثبت و دیدن آمار، اول «اتصال» را روشن کن' }),
      h('p', { class: 'fb-sub', text: 'دکمه‌های «پست شد» و آمار هر پست بعد از اتصال کار می‌کنند و روی گوشی و کامپیوتر یکی می‌شوند.' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => openSettings(false) }, 'اتصال'))));
  }

  // ── عددهای اصلی
  const thisWeekPlanned = Object.keys(PLATFORMS).reduce((n, p) => n + plannedIn(week, p), 0);
  const thisWeekDone = posts.filter((x) => weekOf(x.date) === week).length;
  const ig = (activity && activity.followers.filter((f) => f.instagram)) || [];
  const lastIg = ig.length ? ig[ig.length - 1].instagram : null;
  const rates = Object.entries((activity && activity.stats) || {})
    .filter(([id, st]) => id.startsWith('ig-') && st.views > 0 && st.saves != null)
    .map(([, st]) => st.saves / st.views);
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  root.append(h('div', { class: 'sec tiles' },
    tile('این هفته', `${faNum(thisWeekDone)} از ${faNum(thisWeekPlanned)}`, 'پست انجام‌شده'),
    tile('کل پست‌ها', faNum(posts.length), 'از شروع برنامه'),
    tile('فالوور اینستاگرام', lastIg ? faNum(lastIg) : '—', 'هدف: ' + faNum(8000)),
    tile('میانگین نرخ ذخیره', avgRate != null ? faNum(Math.round(avgRate * 1000) / 10) + '٪' : '—', 'ذخیره تقسیم بر بازدید')));

  // ── پست‌ها در هر هفته (ستونی)
  root.append(h('div', { class: 'sec card chart-card' },
    h('h2', { class: 'chart-h', text: 'پست‌های انجام‌شده در هر هفته' }),
    h('p', { class: 'fine', text: 'روی هر ستون بزن تا ببینی از چند پست برنامه، چند تا انجام شده.' }),
    legend(Object.values(PLATFORMS)),
    weeklyChart(posts, week)));

  // ── فالوور اینستاگرام تا هدف ۸٬۰۰۰
  root.append(h('div', { class: 'sec card chart-card' },
    h('h2', { class: 'chart-h', text: 'فالوورهای اینستاگرام تا هدف ۸٬۰۰۰' }),
    legend([{ name: 'فالوور واقعی', color: PLATFORMS.instagram.color }, { name: 'مسیر هدف', color: '#898781', dash: true }]),
    followersChart(ig),
    followersForm()));

  // ── بازدید ویدیوها
  root.append(h('div', { class: 'sec card chart-card' },
    h('h2', { class: 'chart-h', text: 'بازدید هر ویدیوی اینستاگرام' }),
    viewsBars()));

  // ── آمار هر پست (جدول)
  root.append(statsTable());
}

function tile(label, value, sub) {
  return h('div', { class: 'tile' }, h('span', { class: 'tile-l', text: label }), h('b', { class: 'tile-v', text: value }), h('span', { class: 'tile-s', text: sub }));
}

function weeklyChart(posts, current) {
  const W = 660, H = 230, padR = 36, padL = 8, padT = 12, padB = 38;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const keys = Object.keys(PLATFORMS);
  const counts = {};
  for (let w = 1; w <= TOTAL_WEEKS; w++) counts[w] = Object.fromEntries(keys.map((k) => [k, posts.filter((x) => x.platform === k && weekOf(x.date) === w).length]));
  const maxY = Math.max(3, ...Object.values(counts).flatMap((c) => Object.values(c)));
  const y = (v) => padT + plotH - (v / maxY) * plotH;
  const band = plotW / TOTAL_WEEKS;
  const bw = Math.min(12, (band - 12) / 3);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'تعداد پست‌های انجام‌شده در هر هفته، به تفکیک بستر' });
  for (let v = 0; v <= maxY; v++) {
    svg.append(sv('line', { x1: padL, x2: padL + plotW, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' }));
    svg.append(sv('text', { x: W - padR + 8, y: y(v) + 4, class: 'tick', 'text-anchor': 'start' }, faNum(v)));
  }
  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    // هفته‌ی ۱ سمت راست (جهت خواندن فارسی)
    const bx = padL + plotW - w * band;
    if (w === current) svg.append(sv('rect', { x: bx + 1, y: padT, width: band - 2, height: plotH, class: 'now', rx: 6 }));
    const gx = bx + (band - (bw * 3 + 4)) / 2;
    keys.slice().reverse().forEach((k, i) => {
      const v = counts[w][k];
      const x = gx + i * (bw + 2);
      if (v > 0) svg.append(sv('path', { d: colPath(x, y(v), bw, y(0)), fill: PLATFORMS[k].color }));
      const hit = sv('rect', { x: x - 1, y: padT, width: bw + 2, height: plotH, class: 'hit' });
      bindTip(hit, [
        { text: `${faNum(v)} از ${faNum(plannedIn(w, k))}` },
        { text: PLATFORMS[k].name, color: PLATFORMS[k].color },
        { text: `هفته‌ی ${faNum(w)}` },
      ]);
      svg.append(hit);
    });
    svg.append(sv('text', { x: bx + band / 2, y: H - padB + 18, class: 'tick' + (w === current ? ' tick-now' : ''), 'text-anchor': 'middle' }, faNum(w)));
  }
  svg.append(sv('text', { x: padL + plotW / 2, y: H - 4, class: 'tick', 'text-anchor': 'middle' }, 'هفته'));
  return h('div', { class: 'chart-wrap' }, svg);
}

function followersChart(ig) {
  const W = 660, H = 240, padR = 62, padL = 8, padT = 14, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const d0 = PLAN_START, d1 = PLAN_START + (TOTAL_WEEKS * 7 - 1) * DAY;
  const t = (iso) => (Date.parse(iso + 'T00:00:00Z') - d0) / (d1 - d0);
  const x = (iso) => padL + plotW - Math.max(0, Math.min(1, t(iso))) * plotW; // شروع سمت راست
  const vals = ig.map((f) => f.instagram);
  const lo = Math.floor(Math.min(4000, ...vals) / 1000) * 1000;
  const hi = Math.ceil(Math.max(8000, ...vals) / 1000) * 1000;
  const yv = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'فالوورهای اینستاگرام در برابر مسیر هدف' });
  for (let v = lo; v <= hi; v += 1000) {
    svg.append(sv('line', { x1: padL, x2: padL + plotW, y1: yv(v), y2: yv(v), class: v === lo ? 'axis' : 'grid' }));
    svg.append(sv('text', { x: W - padR + 16, y: yv(v) + 4, class: 'tick', 'text-anchor': 'start' }, faNum(v)));
  }
  // مسیر هدف: ۴٬۰۰۰ → ۴٬۸۰۰ (هفته‌ی ۴) → ۶٬۱۰۰ (هفته‌ی ۸) → ۸٬۰۰۰ (هفته‌ی ۱۳)
  const target = [['2026-09-26', 4000], ['2026-10-23', 4800], ['2026-11-20', 6100], ['2026-12-25', 8000]];
  svg.append(sv('polyline', { points: target.map(([d, v]) => `${x(d)},${yv(v)}`).join(' '), class: 'target' }));
  target.slice(1).forEach(([d, v]) => {
    const c = sv('circle', { cx: x(d), cy: yv(v), r: 4, class: 'target-dot' });
    bindTip(c, [{ text: faNum(v) }, { text: 'هدف ' + faDate(d, { day: 'numeric', month: 'long' }), color: '#898781' }]);
    svg.append(c);
  });
  [['2026-09-26', 'مهر'], ['2026-10-23', 'آبان'], ['2026-11-22', 'آذر'], ['2026-12-22', 'دی']].forEach(([d, m]) =>
    svg.append(sv('text', { x: x(d), y: H - 8, class: 'tick', 'text-anchor': 'middle' }, m)));
  if (ig.length) {
    const pts = ig.map((f) => [x(f.date), yv(f.instagram)]);
    if (pts.length > 1) svg.append(sv('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: 'actual', stroke: PLATFORMS.instagram.color }));
    ig.forEach((f, i) => {
      const c = sv('circle', { cx: pts[i][0], cy: pts[i][1], r: 4.5, fill: PLATFORMS.instagram.color, class: 'dot' });
      bindTip(c, [{ text: faNum(f.instagram) + ' فالوور' }, { text: faDate(f.date, { day: 'numeric', month: 'long' }), color: PLATFORMS.instagram.color }]);
      svg.append(c);
    });
    const lp = pts[pts.length - 1];
    svg.append(sv('text', { x: lp[0] - 8, y: lp[1] - 10, class: 'val', 'text-anchor': 'end' }, faNum(ig[ig.length - 1].instagram)));
  }
  return h('div', { class: 'chart-wrap' }, svg,
    !ig.length && h('p', { class: 'fine', style: 'margin-top:6px', text: 'هنوز عددی ثبت نشده. هر هفته تعداد فالوورت را پایین همین نمودار بنویس.' }));
}

function followersForm() {
  const igIn = h('input', { type: 'number', inputmode: 'numeric', min: '0', placeholder: 'مثلاً ۴۱۲۰', 'aria-label': 'فالوور اینستاگرام' });
  const liIn = h('input', { type: 'number', inputmode: 'numeric', min: '0', placeholder: 'اختیاری', 'aria-label': 'دنبال‌کننده‌ی لینکدین' });
  const btn = h('button', {
    class: 'btn rose', type: 'button',
    onclick: async () => {
      const igv = parseInt(igIn.value, 10);
      const liv = parseInt(liIn.value, 10);
      if (!(igv > 0)) { toast('عدد فالوور اینستاگرام را بنویس'); igIn.focus(); return; }
      btn.disabled = true;
      const date = tehranToday();
      const ok = await act((A) => {
        A.followers = A.followers.filter((f) => f.date !== date);
        A.followers.push({ date, instagram: igv, linkedin: liv > 0 ? liv : null });
        A.followers.sort((a, b) => a.date.localeCompare(b.date));
      }, `فالوور ${date}`, 'ثبت شد');
      btn.disabled = false;
      if (ok) route();
    },
  }, 'ثبت امروز');
  return h('div', { class: 'num-form' },
    h('label', null, h('span', { text: 'فالوور اینستاگرام امروز' }), igIn),
    h('label', null, h('span', { text: 'لینکدین' }), liIn),
    btn);
}

function viewsBars() {
  const rows = manifest.entries
    .filter((e) => e.type === 'instagram')
    .map((e) => ({ e, st: activity && activity.stats[e.id] }))
    .filter((r) => r.st && r.st.views > 0)
    .sort((a, b) => a.e.date.localeCompare(b.e.date));
  if (!rows.length) return h('p', { class: 'fine', text: 'بعد از اینکه آمار اولین ویدیو را در جدول پایین بنویسی، اینجا نمودارش می‌آید.' });
  const max = Math.max(...rows.map((r) => r.st.views));
  return h('div', { class: 'hbars' }, rows.map(({ e, st }) => {
    const bar = h('div', { class: 'hb-track' }, h('div', { class: 'hb-fill', style: `width:${Math.max(2, (st.views / max) * 100)}%;background:${PLATFORMS.instagram.color}` }));
    const row = h('div', { class: 'hb-row' },
      h('span', { class: 'hb-l', text: faDate(e.date, { day: 'numeric', month: 'long' }) }),
      bar,
      h('span', { class: 'hb-v', text: faNum(st.views) }));
    bindTip(row, [
      { text: faNum(st.views) + ' بازدید' },
      { text: `ذخیره ${faNum(st.saves || 0)} — اشتراک ${faNum(st.shares || 0)}`, color: PLATFORMS.instagram.color },
    ]);
    return row;
  }));
}

function statsTable() {
  const entries = manifest.entries.filter((e) => e.type === 'instagram' || e.type === 'linkedin').sort((a, b) => b.date.localeCompare(a.date));
  const wrap = h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h2', { text: 'آمار هر پست' }), h('span', { class: 'rule' })));
  if (!entries.length) {
    wrap.append(empty('بعد از اولین پست، اینجا آمارش را می‌نویسی: بازدید، لایک، ذخیره، اشتراک و کامنت.'));
    return wrap;
  }
  const FIELDS = {
    instagram: [['views', 'بازدید'], ['likes', 'لایک'], ['saves', 'ذخیره'], ['shares', 'اشتراک'], ['comments', 'کامنت'], ['follows', 'فالوور جدید']],
    linkedin: [['views', 'دیده‌شدن'], ['likes', 'واکنش'], ['comments', 'کامنت'], ['shares', 'بازنشر']],
  };
  for (const e of entries) {
    const platform = e.type;
    const st = (activity && activity.stats[e.id]) || {};
    const inputs = {};
    const row = h('div', { class: 'stat-row' },
      h('div', { class: 'sr-h' },
        h('span', { class: 'plat' }, h('i', { style: 'background:' + PLATFORMS[platform].color, 'aria-hidden': 'true' }), PLATFORMS[platform].name),
        h('b', { text: faDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' }) }),
        st.views > 0 && st.saves != null && platform === 'instagram' && h('span', { class: 'pill', text: 'نرخ ذخیره ' + faNum(Math.round((st.saves / st.views) * 1000) / 10) + '٪' })),
      h('div', { class: 'sr-f' }, FIELDS[platform].map(([k, label]) => {
        inputs[k] = h('input', { type: 'number', inputmode: 'numeric', min: '0', value: st[k] != null ? String(st[k]) : null, 'aria-label': label });
        return h('label', null, h('span', { text: label }), inputs[k]);
      })),
      h('button', {
        class: 'btn small', type: 'button',
        onclick: async (ev) => {
          const b = ev.currentTarget;
          const vals = {};
          for (const [k, el] of Object.entries(inputs)) if (el.value !== '') vals[k] = Math.max(0, parseInt(el.value, 10) || 0);
          b.disabled = true;
          const ok = await act((A) => { A.stats[e.id] = { ...(A.stats[e.id] || {}), ...vals, updatedAt: new Date().toISOString() }; }, `آمار ${e.id}`, 'آمار ثبت شد');
          b.disabled = false;
          if (ok) route();
        },
      }, 'ثبت آمار'));
    wrap.append(row);
  }
  return wrap;
}

/* ───────── اتصال (توکن گیت‌هاب برای فرستادن نظرها) ───────── */

function openSettings(needed) {
  let dlg = document.getElementById('settings');
  if (!dlg) {
    const input = h('input', { type: 'password', autocomplete: 'off', placeholder: 'github_pat_…', 'aria-label': 'کد اتصال' });
    dlg = h('dialog', { id: 'settings' },
      h('h2', { text: 'اتصال برای فرستادن نظرها' }),
      h('p', { class: 'why-needed', text: '' }),
      h('p', { text: 'کد اتصال را یک بار روی هر دستگاه اینجا بگذار. فقط روی همین دستگاه نگه داشته می‌شود.' }),
      h('ol', { class: 'steps' },
        h('li', null, 'در گیت‌هاب وارد حسابت شو و ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener noreferrer' }, 'این صفحه'), ' را باز کن.'),
        h('li', { text: 'اسم: «دفترچه». تاریخ انقضا: یک سال.' }),
        h('li', { text: 'Repository access ← Only select repositories ← rojan-content-studio' }),
        h('li', { text: 'Permissions ← Repository permissions ← Contents ← Read and write' }),
        h('li', { text: 'دکمه‌ی Generate token را بزن، کدی را که با github_pat_ شروع می‌شود کپی کن و اینجا بگذار.' })),
      input,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { const v = input.value.trim(); if (!v) return; store.set(LS.token, v); input.value = ''; dlg.close(); toast('وصل شد'); renderFoot(); } }, 'ذخیره'),
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'بستن'),
        h('button', { class: 'link-btn', type: 'button', onclick: () => { if (confirm('کلید و اتصال از روی این دستگاه پاک شود؟')) { store.del(LS.key); store.del(LS.token); location.hash = ''; location.reload(); } } }, 'پاک کردن از این دستگاه')));
    document.body.append(dlg);
  }
  dlg.querySelector('.why-needed').textContent = needed ? 'برای فرستادن نظر و تأیید، این دستگاه هنوز وصل نیست.' : '';
  dlg.showModal();
}

/* ───────── قاب، منو و مسیرها ───────── */

function currentSection() {
  const s = new URLSearchParams(location.hash.slice(1)).get('s');
  return SECTIONS.some((x) => x.id === s) ? s : 'news';
}
function hashFor(s) {
  const p = new URLSearchParams(location.hash.slice(1));
  p.set('s', s);
  return '#' + p.toString();
}

function badgeFor(id) {
  const sent = getSent();
  if (id === 'linkedin') return manifest.entries.filter((e) => e.type === 'linkedin' && e.status === 'ready' && !sent['ap-' + e.id]).length;
  if (id === 'instagram') return manifest.entries.filter((e) => e.type === 'instagram' && e.date === tehranToday() && !sent['ap-' + e.id]).length;
  if (id === 'article') return manifest.entries.filter((e) => e.type === 'article' && ['ready', 'draft', 'revised'].includes(e.status) && !sent['ap-' + e.id]).length;
  return 0;
}

function renderFoot() {
  const foot = document.querySelector('.rail-foot');
  if (!foot) return;
  const connected = !!store.get(LS.token);
  foot.replaceChildren(
    h('div', { class: 'who' }, h('span', { class: 'av', text: 'ر' }),
      h('div', null, h('b', { text: 'روژان صابونی' }), h('span', { text: manifest.updatedAt ? 'به‌روزرسانی: ' + faDate(manifest.updatedAt.slice(0, 10), { day: 'numeric', month: 'long' }) + '، ' + faTime(manifest.updatedAt) : '' }))),
    h('button', { class: 'link-btn', type: 'button', onclick: () => openSettings(false) }, connected ? 'اتصال: وصل ✓' : 'اتصال برای فرستادن نظرها'));
}

function renderShell() {
  const app = document.getElementById('app');
  app.replaceChildren(h('div', { class: 'shell' },
    h('nav', { class: 'rail', 'aria-label': 'بخش‌های دفترچه' },
      h('div', { class: 'mark' }, h('i', { class: 'ring', 'aria-hidden': 'true' }), h('div', null, h('b', { text: 'دفترچه‌ی من' }), h('span', { text: 'استودیو تولید محتوا' }))),
      h('div', { class: 'nav' },
        h('div', { class: 'nav-lbl', text: 'استودیو تولید محتوا' }),
        h('span', { class: 'nav-dot', 'aria-hidden': 'true' }),
        SECTIONS.map((s) => {
          const n = badgeFor(s.id);
          return h('a', { href: hashFor(s.id), 'data-nav': s.id },
            h('span', { class: 'full', text: s.full }), h('span', { class: 'short', text: s.short }),
            n ? h('span', { class: 'badge', text: faNum(n) }) : null);
        })),
      h('div', { class: 'rail-foot' })),
    h('main', { class: 'main' }, h('div', { class: 'wrap', id: 'view' }))));
  renderFoot();
  window.addEventListener('resize', () => { dotPos = null; moveDot(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveDot(false));
}

// نقطه‌ی صورتی منو — مثل سایت دوره‌ها، با یک پرش کوچک به گزینه‌ی تازه می‌رود
let dotPos = null;
let dotRaf = 0;
function dotTarget() {
  const nav = document.querySelector('.nav');
  const a = nav && nav.querySelector('a[aria-current="page"]');
  if (!a) return null;
  const n = nav.getBoundingClientRect();
  const r = a.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(nav).getPropertyValue('--pad')) || 12;
  const row = getComputedStyle(nav).flexDirection === 'row';
  return row ? { x: r.left + r.width / 2 - n.left - 4, y: r.top - n.top - 2, row } : { x: r.right - n.left - pad - 4, y: r.top + r.height / 2 - n.top, row };
}
function moveDot(hop) {
  const dot = document.querySelector('.nav-dot');
  if (!dot) return;
  cancelAnimationFrame(dotRaf);
  const from = dotPos;
  const t0 = performance.now();
  const still = !from || !hop || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(now) {
    const to = dotTarget();
    if (!to) return;
    const t = Math.min(1, (now - t0) / 560);
    const p = { x: to.x, y: to.y };
    if (!still) {
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      p.x = from.x + (to.x - from.x) * k;
      p.y = from.y + (to.y - from.y) * k;
      const lift = Math.min(18, 6 + Math.hypot(to.x - from.x, to.y - from.y) * 0.12) * Math.sin(Math.PI * t);
      if (to.row) p.y -= lift; else p.x += lift;
    }
    dotPos = p;
    dot.style.transform = `translate(${p.x}px,${p.y}px)`;
    dot.style.visibility = 'visible';
    if (t < 1) dotRaf = requestAnimationFrame(frame);
  }
  dotRaf = requestAnimationFrame(frame);
}

const VIEWS = { news: viewNews, instagram: viewInstagram, linkedin: viewLinkedin, progress: viewProgress, article: viewArticle };
let routeSeq = 0;

async function route() {
  const s = currentSection();
  document.querySelectorAll('.nav a').forEach((a) => {
    a.href = hashFor(a.dataset.nav);
    if (a.dataset.nav === s) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  moveDot(true);
  const view = document.getElementById('view');
  const seq = ++routeSeq;
  const fresh = h('div');
  try {
    await VIEWS[s](fresh);
  } catch (e) {
    console.error(e);
    fresh.replaceChildren(empty('این بخش باز نشد. صفحه را دوباره باز کن.'));
  }
  if (seq !== routeSeq) return;
  view.replaceChildren(...fresh.childNodes);
  window.scrollTo(0, 0);
}

function renderLock(wrongKey) {
  document.getElementById('app').replaceChildren(h('div', { class: 'lock' }, h('div', null,
    h('div', { class: 'ring', 'aria-hidden': 'true' }),
    h('h1', { text: 'دفترچه‌ی من' }),
    h('p', { text: wrongKey ? 'کلید این دستگاه با دفترچه نمی‌خواند. دفترچه را با لینک شخصی‌ات باز کن.' : 'این دفترچه قفل است و فقط با لینک شخصی روژان باز می‌شود.' }),
    wrongKey && h('div', { class: 'actions', style: 'justify-content:center' },
      h('button', { class: 'btn', type: 'button', onclick: () => { store.del(LS.key); location.hash = ''; location.reload(); } }, 'پاک کردن کلید')))));
}

async function start() {
  const params = new URLSearchParams(location.hash.slice(1));
  let raw = params.get('k');
  if (raw) store.set(LS.key, raw);
  else raw = store.get(LS.key);
  const locked = (wrong) => {
    renderLock(wrong);
    // اگر لینک شخصی در همین صفحه باز شد (فقط # عوض شد)، دوباره امتحان کن
    window.addEventListener('hashchange', start, { once: true });
  };
  if (!raw || !window.crypto || !crypto.subtle) return locked(false);
  try {
    KEY = await crypto.subtle.importKey('raw', b64ToBytes(raw), 'AES-GCM', false, ['decrypt']);
    manifest = await load('manifest.enc');
  } catch (e) {
    console.error(e);
    return locked(true);
  }
  renderShell();
  window.addEventListener('hashchange', route);
  route();
}

start();
