/* ============================================================
   URC Arrangementsportal · felles klientbibliotek
   Brukes av alle sider og verktøy. Lastes i <head>.
   ============================================================ */
(function () {
  'use strict';

  // ---- Konfigurasjon: fyll inn etter at Supabase-prosjektet er opprettet ----
  const SUPABASE_URL = 'https://imusgggkhhizaqlszgln.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdXNnZ2draGhpemFxbHN6Z2xuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MDM1MTUsImV4cCI6MjEwOTE3OTUxNX0.vxL3pIuIuPjjfBOsFHhxkZ4Q1zsVoQQWZLNDpcAtalU'; // offentlig nøkkel, sikkerheten ligger i RLS
  // ---------------------------------------------------------------------------

  const TOOLS = {
    lopssimulator: {
      name: 'Løpssimulator',
      lede: 'Puljer, starttider og flyt',
      desc: 'Simuler løpsdagen minutt for minutt: Puljer, starttider, rotasjon mellom etappene og krysningspunkter i løypa.',
      roles: ['admin', 'arrangor', 'partner']
    },
    arrangementskalkulator: {
      name: 'Arrangementskalkulator',
      lede: 'Økonomi og fordeling',
      desc: 'Kostnader, inntekter og fordeling mellom klubben og URC. Se overskudd, break-even og dugnadsbehov ved ulike deltakertall.',
      roles: ['admin', 'arrangor']
    },
    arenarigg: {
      name: 'Arenarigg',
      lede: 'Stadion og soner',
      desc: 'Nærkart over arenaen med start og mål, tidtakingssoner, løperflyt mellom etapper, sperringer, sekretariat og speaker.',
      roles: ['admin', 'arrangor', 'partner'],
      soon: true
    }
  };
  const ROLE_LABEL = { admin: 'URC-admin', arrangor: 'Arrangør', partner: 'Partner' };
  const STATUS_LABEL = { planlegging: 'Planlegging', bekreftet: 'Bekreftet', gjennomfort: 'Gjennomført', arkivert: 'Arkivert' };

  const qs = new URLSearchParams(location.search);
  const FILE = location.protocol === 'file:';
  const DEMO = FILE || !SUPABASE_URL || !SUPABASE_ANON_KEY;
  const IN_TOOL = /\/verktoy\//.test(location.pathname) || document.documentElement.hasAttribute('data-portal-tool');

  // Skjul innhold til tilgang er sjekket
  document.documentElement.classList.add('portal-loading');
  const earlyCss = document.createElement('style');
  earlyCss.textContent = 'html.portal-loading body>*:not(.pbar):not(.portal-msg){visibility:hidden}';
  document.head.appendChild(earlyCss);

  // ---------- Hjelpere ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('urcportal:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('urcportal:' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Dato ikke satt';
  const fmtStamp = ts => {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    const t = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? 'i dag ' + t : d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) + ' ' + t;
  };
  const daysTo = d => d ? Math.ceil((new Date(d + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 864e5) : null;

  // ---------- Lenker (fungerer både på Vercel og som lokal fil) ----------
  const base = () => (FILE && IN_TOOL ? '../' : FILE ? '' : '/');
  function page(name) { return FILE ? base() + (name || 'index') + '.html' : '/' + (name || ''); }
  function href(slug, tool) {
    if (!slug) return page('arrangementer');
    if (FILE) return base() + (tool ? 'verktoy/' + tool + '.html?e=' + slug : 'arrangement.html?e=' + slug);
    return '/' + slug + (tool ? '/' + tool : '');
  }
  function currentSlug() {
    if (qs.get('e')) return qs.get('e');
    const seg = location.pathname.split('/').filter(Boolean);
    return seg[0] && !/\.html$/.test(seg[0]) && seg[0] !== 'verktoy' ? decodeURIComponent(seg[0]) : null;
  }

  // ============================================================
  // Backend: Supabase eller demomodus (localStorage)
  // ============================================================
  let sb = null;
  if (!DEMO && window.supabase) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
  }
  const must = ({ data, error }) => { if (error) throw error; return data; };

  const demo = {
    role() { return ['admin', 'arrangor', 'partner'].includes(qs.get('rolle')) ? qs.get('rolle') : store.get('demo-role', 'admin'); },
    events() {
      return store.get('demo-events', [{ id: 'demo-lm27', slug: 'lm27', name: 'Løpernes Mester 2027', venue: 'Granåsen, Trondheim', event_date: '2027-08-14', status: 'planlegging', tools: Object.keys(TOOLS) }]);
    },
    tool(evId, tool) { return store.get('demo-tool:' + evId + ':' + tool, null); },
    setTool(evId, tool, row) { store.set('demo-tool:' + evId + ':' + tool, row); },
    members(evId) { return store.get('demo-members:' + evId, []); },
    setMembers(evId, list) { store.set('demo-members:' + evId, list); }
  };
  if (DEMO && qs.get('rolle')) store.set('demo-role', demo.role());

  const api = {
    async user() {
      if (DEMO) return { email: 'demo@urcsports.no' };
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.user : null;
    },
    async canLogin(email) {
      if (DEMO) return true;
      return must(await sb.rpc('portal_can_login', { p_email: email }));
    },
    async sendLink(email, next) {
      if (DEMO) return true;
      const ok = await api.canLogin(email);
      if (!ok) return false;
      must(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + (next || '/arrangementer'), shouldCreateUser: true } }));
      return true;
    },
    async signOut() { if (sb) await sb.auth.signOut(); },
    async isAdmin() {
      if (DEMO) return demo.role() === 'admin';
      return !!must(await sb.rpc('is_admin'));
    },
    async events() {
      if (DEMO) { const r = demo.role(); return demo.events().map(e => ({ ...e, role: r })); }
      const user = await api.user();
      const [evs, admin, mem] = await Promise.all([
        sb.from('events').select('*').order('event_date', { ascending: true, nullsFirst: false }).then(must),
        api.isAdmin(),
        sb.from('event_members').select('event_id,role').eq('email', user.email.toLowerCase()).then(must)
      ]);
      return evs.map(e => ({ ...e, role: admin ? 'admin' : (mem.find(m => m.event_id === e.id) || {}).role }));
    },
    async event(slug) {
      if (DEMO) { const e = demo.events().find(x => x.slug === slug); return e ? { ...e, role: demo.role() } : null; }
      const e = must(await sb.from('events').select('*').eq('slug', slug).maybeSingle());
      if (!e) return null;
      e.role = must(await sb.rpc('event_role', { eid: e.id }));
      return e;
    },
    async createEvent(ev) {
      if (DEMO) { const list = demo.events(); const e = { id: 'demo-' + ev.slug, status: 'planlegging', tools: Object.keys(TOOLS), ...ev }; list.push(e); store.set('demo-events', list); return e; }
      return must(await sb.from('events').insert(ev).select().single());
    },
    async updateEvent(id, patch) {
      if (DEMO) { const list = demo.events().map(e => e.id === id ? { ...e, ...patch } : e); store.set('demo-events', list); return; }
      must(await sb.from('events').update(patch).eq('id', id));
    },
    async toolMeta(evId) {
      if (DEMO) return Object.keys(TOOLS).map(t => { const r = demo.tool(evId, t); return r && { tool: t, locked: r.locked, updated_at: r.updated_at, updated_by: r.updated_by }; }).filter(Boolean);
      return must(await sb.from('tool_state').select('tool,locked,updated_at,updated_by').eq('event_id', evId));
    },
    async loadTool(evId, tool) {
      if (DEMO) return demo.tool(evId, tool);
      return must(await sb.from('tool_state').select('state,locked,updated_at,updated_by').eq('event_id', evId).eq('tool', tool).maybeSingle());
    },
    async saveTool(evId, tool, state) {
      if (DEMO) { const r = demo.tool(evId, tool) || {}; demo.setTool(evId, tool, { ...r, state, updated_at: new Date().toISOString(), updated_by: 'demo@urcsports.no' }); return; }
      must(await sb.from('tool_state').upsert({ event_id: evId, tool, state }, { onConflict: 'event_id,tool' }));
    },
    async setLock(evId, tool, locked) {
      if (DEMO) { const r = demo.tool(evId, tool); if (r) demo.setTool(evId, tool, { ...r, locked }); return; }
      must(await sb.from('tool_state').update({ locked }).eq('event_id', evId).eq('tool', tool));
    },
    async loadInternal(evId) {
      if (DEMO) return store.get('demo-internal:' + evId, null);
      const r = must(await sb.from('calc_internal').select('state').eq('event_id', evId).maybeSingle());
      return r ? r.state : null;
    },
    async saveInternal(evId, state) {
      if (DEMO) { store.set('demo-internal:' + evId, state); return; }
      must(await sb.from('calc_internal').upsert({ event_id: evId, state }, { onConflict: 'event_id' }));
    },
    async history(evId, tool) {
      if (DEMO) return [];
      return must(await sb.from('tool_state_history').select('id,changed_at,changed_by').eq('event_id', evId).eq('tool', tool).order('changed_at', { ascending: false }).limit(15));
    },
    async restore(evId, tool, histId) {
      const h = must(await sb.from('tool_state_history').select('state').eq('id', histId).single());
      must(await sb.from('tool_state').update({ state: h.state }).eq('event_id', evId).eq('tool', tool));
    },
    async members(evId) {
      if (DEMO) return demo.members(evId);
      return must(await sb.from('event_members').select('*').eq('event_id', evId).order('role').order('email'));
    },
    async addMember(evId, m) {
      const row = { event_id: evId, email: m.email.trim().toLowerCase(), role: m.role, name: m.name || null, org: m.org || null };
      if (DEMO) { const l = demo.members(evId).filter(x => x.email !== row.email); l.push(row); demo.setMembers(evId, l); return; }
      must(await sb.from('event_members').upsert(row, { onConflict: 'event_id,email' }));
    },
    async removeMember(evId, email) {
      if (DEMO) { demo.setMembers(evId, demo.members(evId).filter(x => x.email !== email)); return; }
      must(await sb.from('event_members').delete().eq('event_id', evId).eq('email', email));
    },
    subscribe(evId, cb) {
      if (DEMO || !sb) return () => {};
      const ch = sb.channel('ts-' + evId).on('postgres_changes', { event: '*', schema: 'public', table: 'tool_state', filter: 'event_id=eq.' + evId }, p => cb(p.new || {})).subscribe();
      return () => sb.removeChannel(ch);
    }
  };

  // ============================================================
  // Felles UI
  // ============================================================
  const LOGO = `<img class="urc-logo" src="${base()}assets/img/urc-logo.svg" alt="URC" width="36" height="36">`;
  // Favicon
  (function () { const l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = base() + 'assets/img/urc-logo.svg'; document.head.appendChild(l); })();

  async function requireUser() {
    const u = await api.user();
    if (u) return u;
    const next = location.pathname + location.search;
    location.replace(page('logg-inn') + '?neste=' + encodeURIComponent(next));
    return new Promise(() => {});
  }
  function ready() { document.documentElement.classList.remove('portal-loading'); }
  function message(title, text, link) {
    ready();
    document.body.innerHTML = `<div class="portal-msg"><div class="pm-card"><div class="pm-logo">${LOGO}</div><h1>${esc(title)}</h1><p>${text}</p>${link ? `<a class="pm-btn" href="${link.href}">${esc(link.label)}</a>` : ''}</div></div>`;
  }
  function demoBanner() {
    if (!DEMO) return '';
    const r = demo.role();
    const sel = ['admin', 'arrangor', 'partner'].map(x => `<option value="${x}"${x === r ? ' selected' : ''}>${ROLE_LABEL[x]}</option>`).join('');
    return `<div class="pdemo"><b>Demomodus:</b> Supabase er ikke koblet til. Data lagres kun i denne nettleseren. <label>Vis som <select id="pdemoRole">${sel}</select></label></div>`;
  }
  function bindDemo(root) {
    const s = (root || document).querySelector('#pdemoRole');
    if (s) s.addEventListener('change', () => { store.set('demo-role', s.value); const u = new URL(location.href); u.searchParams.delete('rolle'); location.href = u.toString(); });
  }

  // ---------- Verktøylinje i verktøyene ----------
  const BAR_CSS = `
.pbar{--pb-bg:#081221;--pb-line:#1e3a5f;--pb-fg:#e8f0e8;--pb-mu:#8fa3b8;--pb-sage:#a8c5a0;--pb-gold:#f5a623;
  position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;min-height:46px;padding:6px max(16px,env(safe-area-inset-left,0px));
  background:var(--pb-bg);border-bottom:1px solid var(--pb-line);color:var(--pb-fg);font:500 13px/1.3 Barlow,system-ui,sans-serif;box-sizing:border-box}
.pbar a{color:inherit;text-decoration:none}
.pbar .pb-logo{display:flex;align-items:center;gap:10px;color:var(--pb-fg)}
.pbar .pb-logo .urc-logo{height:30px;width:30px;display:block}
.pbar .pb-crumb{display:flex;align-items:center;gap:8px;min-width:0;font-family:"Barlow Condensed",sans-serif;font-weight:600;font-size:15px;letter-spacing:.06em;text-transform:uppercase}
.pbar .pb-crumb a{color:var(--pb-mu)} .pbar .pb-crumb a:hover{color:var(--pb-fg)}
.pbar .pb-crumb i{color:#3a5778;font-style:normal}
.pbar .pb-sp{flex:1}
.pbar .pb-role{border:1px solid var(--pb-line);border-radius:99px;padding:2px 9px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--pb-sage)}
.pbar .pb-status{display:flex;align-items:center;gap:6px;color:var(--pb-mu);font-size:12px;white-space:nowrap}
.pbar .pb-status::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--dot,#5fd39a)}
.pbar .pb-status[data-s=pending]{--dot:#f5a623}.pbar .pb-status[data-s=saving]{--dot:#f5a623}
.pbar .pb-status[data-s=error]{--dot:#ff5a5f;color:#ff8a8d}.pbar .pb-status[data-s=view]{--dot:#5e7590}
.pbar .pb-user{color:var(--pb-mu);font-size:12px}
.pbar .pb-btn{appearance:none;background:transparent;border:1px solid var(--pb-line);color:var(--pb-fg);border-radius:6px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer}
.pbar .pb-btn:hover{border-color:var(--pb-sage)}
.pnote{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:9px max(16px,env(safe-area-inset-left,0px));background:#2a2210;border-bottom:1px solid #5a4416;color:#f3dca8;font:500 13px/1.4 Barlow,system-ui,sans-serif}
.pnote[hidden]{display:none}
.pnote .pb-btn{appearance:none;background:#f5a623;border:0;color:#0d1b2e;border-radius:6px;padding:5px 11px;font:600 12px Barlow,sans-serif;cursor:pointer}
.pnote .pb-btn.ghost{background:transparent;border:1px solid #8a6a26;color:#f3dca8}
.pdemo{padding:8px 16px;background:#13283f;border-bottom:1px solid #29496f;color:#c9d6e3;font:13px/1.4 Barlow,system-ui,sans-serif}
.pdemo select{width:auto!important;margin-left:6px;background:#0f2035;color:#e8f0e8;border:1px solid #29496f;border-radius:4px;padding:2px 6px;font:inherit}
.portal-msg{min-height:100vh;display:grid;place-items:center;padding:24px;background:#0b1626;color:#e8f0e8;font-family:Barlow,system-ui,sans-serif}
.pm-card{max-width:440px;text-align:center}
.pm-logo .urc-logo{height:56px;width:56px;display:inline-block}
.pm-card h1{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;font-size:30px;margin:16px 0 8px}
.pm-card p{color:#8fa3b8;margin:0 0 20px}
.pm-btn{display:inline-block;background:#a8c5a0;color:#0b1626;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none}
@media (max-width:640px){.pbar .pb-user{display:none}}
@media print{.pbar,.pnote,.pdemo{display:none!important}}`;

  function injectBarCss() {
    if (document.getElementById('pbar-css')) return;
    const s = document.createElement('style'); s.id = 'pbar-css'; s.textContent = BAR_CSS; document.head.appendChild(s);
  }

  function mountBar(ev, tool, user) {
    injectBarCss();
    const wrap = document.createElement('div');
    wrap.className = 'pbar-wrap';
    wrap.innerHTML = demoBanner() + `
      <div class="pbar" role="navigation" aria-label="Portal">
        <a class="pb-logo" href="${page('arrangementer')}" title="Alle arrangementer">${LOGO}</a>
        <div class="pb-crumb"><a href="${href(ev.slug)}">${esc(ev.name)}</a><i>/</i><span>${esc(TOOLS[tool].name)}</span></div>
        <span class="pb-sp"></span>
        <span class="pb-role">${esc(ROLE_LABEL[ev.role] || '')}</span>
        <span class="pb-status" id="pbStatus" data-s="ok">Klar</span>
        <span class="pb-user">${esc(user.email)}</span>
      </div>
      <div class="pnote" id="pbNote" hidden></div>`;
    // Full bredde uavhengig av verktøyets body-padding
    const cs = getComputedStyle(document.body);
    wrap.style.margin = `-${cs.paddingTop} -${cs.paddingRight} ${parseFloat(cs.paddingTop) ? '16px' : '0'} -${cs.paddingLeft}`;
    document.body.prepend(wrap);
    bindDemo(wrap);
    return {
      status(s, text) { const el = wrap.querySelector('#pbStatus'); el.dataset.s = s; el.textContent = text; },
      note(html, actions) {
        const n = wrap.querySelector('#pbNote');
        if (!html) { n.hidden = true; n.innerHTML = ''; return; }
        n.innerHTML = `<span>${html}</span>` + (actions || []).map((a, i) => `<button class="pb-btn${a.ghost ? ' ghost' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('');
        n.querySelectorAll('button').forEach(b => b.onclick = () => actions[+b.dataset.i].run());
        n.hidden = false;
      }
    };
  }

  // ---------- Start et verktøy ----------
  async function bootTool(tool) {
    try {
      const user = await requireUser();
      const slug = currentSlug();
      const ev = slug && await api.event(slug);
      if (!ev || !ev.role) return message('Ingen tilgang', 'Fant ikke arrangementet, eller du har ikke tilgang til det.', { href: page('arrangementer'), label: 'Til dine arrangementer' });
      if (!TOOLS[tool].roles.includes(ev.role)) return message('Ingen tilgang', 'Rollen din har ikke tilgang til dette verktøyet.', { href: href(ev.slug), label: 'Tilbake til arrangementet' });
      const isAdmin = ev.role === 'admin';
      const row = await api.loadTool(ev.id, tool);
      const internal = isAdmin && tool === 'arrangementskalkulator' ? await api.loadInternal(ev.id) : undefined;
      const locked = !!(row && row.locked);
      const readOnly = ev.role === 'partner' || (locked && !isAdmin);
      const bar = mountBar(ev, tool, user);
      document.title = TOOLS[tool].name + ' · ' + ev.name;

      // Lagring med forsinkelse
      let last = row ? JSON.stringify(row.state) : null, pending = null, timer = null, paused = false, iTimer = null, iPending = null;
      const okText = () => readOnly ? (ev.role === 'partner' ? 'Visning: Endringer lagres ikke' : 'Låst av URC: Endringer lagres ikke')
        : row && row.updated_at ? 'Lagret ' + fmtStamp(row.updated_at) : 'Ikke lagret ennå';
      bar.status(readOnly ? 'view' : 'ok', okText());

      async function flush() {
        timer = null;
        if (pending == null || pending === last) return;
        const snap = pending;
        bar.status('saving', 'Lagrer …');
        try {
          await api.saveTool(ev.id, tool, JSON.parse(snap));
          last = snap; if (pending === snap) pending = null;
          bar.status('ok', 'Lagret ' + fmtStamp(new Date().toISOString()));
        } catch (e) {
          bar.status('error', 'Kunne ikke lagre');
          bar.note('Endringene ble ikke lagret: ' + esc(e.message || e), [{ label: 'Prøv igjen', run: () => { bar.note(''); flush(); } }]);
        }
      }
      // Første kall kommer fra verktøyets egen oppstart: brukes som utgangspunkt, lagres ikke
      let baselined = false, iBaselined = false;
      function save(state) {
        const j = JSON.stringify(state);
        if (!baselined) { baselined = true; last = j; return; }
        if (readOnly || paused) return;
        if (j === last) return;
        pending = j;
        bar.status('pending', 'Ulagrede endringer');
        clearTimeout(timer); timer = setTimeout(flush, 1200);
      }
      let lastI = internal ? JSON.stringify(internal) : null;
      function saveInternal(state) {
        if (!isAdmin) return;
        const j = JSON.stringify(state);
        if (!iBaselined) { iBaselined = true; lastI = j; return; }
        if (j === lastI || j === iPending) return;
        iPending = j;
        clearTimeout(iTimer);
        iTimer = setTimeout(async () => {
          const snap = iPending; iTimer = null;
          try { await api.saveInternal(ev.id, JSON.parse(snap)); lastI = snap; if (iPending === snap) iPending = null; }
          catch (e) { bar.status('error', 'Intern lagring feilet'); }
        }, 1200);
      }
      window.addEventListener('beforeunload', e => {
        if ((pending && pending !== last) || iPending) { flush(); e.preventDefault(); e.returnValue = ''; }
      });

      // Varsel når andre endrer
      api.subscribe(ev.id, rowNew => {
        if (rowNew.tool !== tool || !rowNew.updated_by || rowNew.updated_by === (user.email || '').toLowerCase()) return;
        if (JSON.stringify(rowNew.state) === last) return;
        paused = true; clearTimeout(timer);
        bar.status('pending', 'Endret av andre');
        bar.note(`<b>${esc(rowNew.updated_by)}</b> endret ${esc(TOOLS[tool].name.toLowerCase())} ${esc(fmtStamp(rowNew.updated_at))}. Last inn for å se endringene.`, [
          { label: 'Last inn på nytt', run: () => { pending = null; location.reload(); } },
          { label: 'Behold mine og overskriv', ghost: true, run: () => { paused = false; last = JSON.stringify(rowNew.state); bar.note(''); if (pending) flush(); else bar.status('ok', 'Klar'); } }
        ]);
      });

      if (locked && !isAdmin && ev.role !== 'partner') bar.note('URC har låst dette verktøyet. Du kan prøve ut endringer, men de lagres ikke.');

      window.PORTAL = {
        event: ev, role: ev.role, isAdmin, readOnly, user,
        state: row ? row.state : null,
        internal,
        save, saveInternal,
        status: bar.status, note: bar.note,
        demo: DEMO
      };
      runDeferred();
      ready();
    } catch (e) {
      console.error(e);
      message('Noe gikk galt', esc(e.message || e), { href: page('arrangementer'), label: 'Til dine arrangementer' });
    }
  }

  function runDeferred() {
    document.querySelectorAll('script[type="text/x-portal-tool"]').forEach(old => {
      const s = document.createElement('script');
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
  }

  const ICONS = {
    lopssimulator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 2.2M9.5 2.8h5M12 2.8V6M18.6 6.2l1.4-1.4"/></svg>',
    arrangementskalkulator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="M19.5 4.5 16 8l-2.5-2.5L9 10" opacity=".55"/></svg>',
    arenarigg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/><circle cx="12" cy="11" r="1.6" fill="currentColor" stroke="none"/></svg>'
  };

  const shy = s => esc(s).replace('Arrangements', 'Arrangements&shy;');
  window.Portal = { shy, ICONS, api, TOOLS, ROLE_LABEL, STATUS_LABEL, DEMO, LOGO, esc, fmtDate, fmtStamp, daysTo, page, href, currentSlug, requireUser, ready, message, demoBanner, bindDemo, bootTool, store };
})();
