// CPS Calculator 1.6.0 — defensive init + verbose logs
(function(){
// ---- UI helpers (tabs, factors, activity, config) ----
const UI = { history: [] };


function wireRecalc(client, mapping, settings){
  const btn = document.getElementById('recalcBtn');
  if (!btn) return;
  const run = async () => {
    try {
      btn.disabled = true;
      btn.setAttribute('aria-busy','true');
      setStatus('Recalculating…','warn');
      await refresh(client, mapping, settings);
    } catch(e){
      dlog('recalc:FAIL', e && e.message ? e.message : e);
      setStatus('Recalc failed','err');
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      // refresh() sets Ready when successful; don't override here.
    }
  };
  btn.addEventListener('click', run);
  // Optional: allow Cmd/Ctrl+R (when focus is inside the app iframe)
  window.addEventListener('keydown', (e)=>{
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='r'){
      e.preventDefault();
      run();
    }
  });
}

function renderFactors(f){
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set('f-impact-val', f.impactVal ?? '—');     set('f-impact-pts', `+${f.impactPts||0}`);
  set('f-priority-val', f.priority ?? '—');    set('f-priority-pts', `+${f.urgencyPts||0}`);
  set('f-time-val', f.timeLabel ?? '—');       set('f-time-pts', `+${f.timePts||0}`);
  set('f-security-val', f.securityVal ?? '—'); set('f-security-pts', `+${f.securityPts||0}`);
  set('f-override-val', f.overrideVal ?? '—'); set('f-override-pts', `+${f.overridePts||0}`);
}
function pushActivity(entry){
  UI.history.unshift(entry);
  UI.history = UI.history.slice(0, 12);
  const el = document.getElementById('activity');
  if (!el) return;
  el.innerHTML = UI.history.map(e=>`<li><strong>${e.cps}</strong> — ${e.detail} <span class="muted">(${e.at})</span></li>`).join('');
}
function renderConfig(mapping, settings){
  const pri = document.getElementById('priorityConfig');
  if (pri) pri.innerHTML = `
    <li>Urgent: <strong>${Number(settings.priority_points_urgent)||12}</strong></li>
    <li>High: <strong>${Number(settings.priority_points_high)||8}</strong></li>
    <li>Normal: <strong>${Number(settings.priority_points_normal)||4}</strong></li>
    <li>Low: <strong>${Number(settings.priority_points_low)||0}</strong></li>`;
  const grp = document.getElementById('groupsConfig');
  const v = s => (s||'—');
  if (grp) grp.innerHTML = `
    <li>Impact: ${v(settings.impact_allowed_groups)}</li>
    <li>Security flag: ${v(settings.security_flag_allowed_groups)}</li>
    <li>Manager override: ${v(settings.manager_override_allowed_groups)}</li>`;
}
 // ensure we don't leak globals
  const STATE = { last: { impactVal: undefined, securityVal: undefined, overrideVal: undefined } };
  const DIAG = () => document.getElementById('diag');
  function dlog(...args){
    try{
      console.log('[CPS]', ...args);
      const el = DIAG();
      if (el){
        el.textContent += args.map(a => typeof a==='object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
        el.scrollTop = el.scrollHeight;
      }
    }catch(_){}
  }

  function setStatus(text, type){
    const pill = document.getElementById('statusPill');
    if (!pill) return;
    pill.textContent = text;
    pill.classList.remove('status-ok','status-warn','status-err');
    if (type==='ok') pill.classList.add('status-ok');
    if (type==='warn') pill.classList.add('status-warn');
    if (type==='err') pill.classList.add('status-err');
  }

  function autoResize(client){
    try{
      const h = Math.min(900, Math.max(220, document.documentElement.scrollHeight));
      client.invoke('resize', { height: h + 'px' });
    }catch(e){}
  }

  function parseOverride(val){
    if (!val) return 0;
    const m = String(val).match(/(\d+)/);
    const n = m ? parseInt(m[1],10) : 0;
    return (n>=1 && n<=5) ? n : 0;
  }

  const DEFAULT_IMPACT_OPTIONS = [
  { name: 'High', value: 'cps_impact_high' },
  { name: 'Medium', value: 'cps_impact_medium' },
  { name: 'Low', value: 'cps_impact_low' }
];

function timeOpenPoints(createdAtISO){
    const days = (Date.now() - new Date(createdAtISO).getTime()) / 86400000;
    if (days > 7) return 6;
    if (days >= 3) return 4;
    if (days >= 1) return 2;
    return 0;
  }

  function pointsFromDropdown(selectedValue, fieldOptions){
  // First: tag-aware shortcut so we don't wait for options
  const v = String(selectedValue || '');
  if (/impact.*high/i.test(v))   return 12;
  if (/impact.*medium/i.test(v)) return 8;
  if (/impact.*low/i.test(v))    return 4;

  // Fallback: index by provided options
  if (!Array.isArray(fieldOptions)) return 0;
  const idx = fieldOptions.findIndex(o => o.value === selectedValue);
  if (idx < 0) return 0;
  return [12,8,4][Math.min(idx,2)];
}

  async function getAllTicketFields(client){
    let url = '/api/v2/ticket_fields.json?per_page=100', all=[];
    while (url){
      const page = await client.request({ url, type: 'GET' });
      all.push(...(page.ticket_fields || []));
      url = page.next_page ? (new URL(page.next_page).pathname + new URL(page.next_page).search) : null;
    }
    return all;
  }

  function findDropdownByTagPrefix(fields, prefix){
    return fields.find(f =>
      (f.type === 'tagger' || f.type === 'multiselect') &&
      Array.isArray(f.custom_field_options) &&
      f.custom_field_options.some(o => String(o.value||'').startsWith(prefix))
    );
  }

  async function getRequirementId(client, key){
    try{
      const res = await client.get(`requirement:${key}`);
      return res && res.id ? res.id : null;
    }catch(_){ return null; }
  }

  async function getCF(client, id){
    const obj = await client.get(`ticket.customField:custom_field_${id}`);
    return obj[`ticket.customField:custom_field_${id}`];
  }
  async function setCF(client, id, value){
    await client.set(`ticket.customField:custom_field_${id}`, value);
  }

async function serverWriteCps(client, cpsFieldId, cpsValue){
  try{
    const t = await client.get('ticket.id');
    const ticketId = t['ticket.id'];
    await client.request({
      url: `/api/v2/tickets/${ticketId}.json`,
      type: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({
        ticket: { custom_fields: [{ id: cpsFieldId, value: cpsValue }] }
      })
    });
  }catch(e){
    try{
      const el=document.getElementById('diag');
      if(el){ el.textContent += 'serverWriteCps error: ' + (e && e.message ? e.message : String(e)) + '\n'; }
    }catch(_){}
  }
}


function wireFieldChangeListeners(client, mapping, settings){
  const handle = async (id, e) => {
    const ov = {};
    if (id === mapping.impactFieldId) ov.impactVal = e.newValue;
    if (id === mapping.securityFieldId) ov.securityVal = e.newValue;
    if (id === mapping.overrideFieldId) ov.overrideVal = e.newValue;
    await refresh(client, mapping, settings, ov);
  };
  try{
    if (mapping.impactFieldId){
      client.on(`ticket.custom_field_${mapping.impactFieldId}.changed`, (e)=>handle(mapping.impactFieldId, e));
    }
    if (mapping.securityFieldId){
      client.on(`ticket.custom_field_${mapping.securityFieldId}.changed`, (e)=>handle(mapping.securityFieldId, e));
    }
    if (mapping.overrideFieldId){
      client.on(`ticket.custom_field_${mapping.overrideFieldId}.changed`, (e)=>handle(mapping.overrideFieldId, e));
    }
  }catch(err){
    console.warn("wireFieldChangeListeners error", err);
  }
}

  async function mapFields(client){
    dlog('mapFields:start');
    const all = await getAllTicketFields(client);
    // Try robust detection first
    let impactId = (findDropdownByTagPrefix(all, 'cps_impact_') || {}).id;
    let overrideId = (findDropdownByTagPrefix(all, 'cps_override_') || {}).id;
    let securityId = (all.find(f => f.type==='checkbox' && f.tag==='cps_security_flag') || {}).id;
    let cpsId = (all.find(f => f.type==='integer' && ((f.title||'').toLowerCase().includes('cps'))) || {}).id;

    // Requirements fallback
    impactId  = impactId  || await getRequirementId(client, 'cps_impact');
    overrideId= overrideId|| await getRequirementId(client, 'cps_override');
    securityId= securityId|| await getRequirementId(client, 'cps_security');
    cpsId     = cpsId     || await getRequirementId(client, 'cps_score');

    // Last resort by title
    function byTitle(t){ return (all.find(f => (f.title||'').toLowerCase()===t) || {}).id; }
    impactId  = impactId  || byTitle('impact') || byTitle('cps impact');
    securityId= securityId|| byTitle('cps security flag');
    overrideId= overrideId|| byTitle('cps manager override');
    cpsId     = cpsId     || byTitle('cps') || byTitle('customer priority score');

    // Options for impact
    let impactOpts = DEFAULT_IMPACT_OPTIONS;
  if (impactId){
    const f = all.find(x => x.id === impactId);
    if (f && Array.isArray(f.custom_field_options) && f.custom_field_options.length) {
      impactOpts = f.custom_field_options;
    }
  }

    const mapping = { impactFieldId: impactId, securityFieldId: securityId, overrideFieldId: overrideId, cpsFieldId: cpsId, impactOpts };
    dlog('mapFields:result', mapping);
    return mapping;
  }

  async function refresh(client, mapping, settings, overrides){
    dlog('refresh:start', { overrides });
    if (!mapping.impactFieldId || !mapping.cpsFieldId){
      setStatus('Missing core fields', 'warn');
      return;
    }
    let [impactValRaw, securityValRaw, overrideValRaw, createdAtObj, prioObj] = await Promise.all([
      overrides && ('impactVal' in overrides) ? overrides.impactVal : getCF(client, mapping.impactFieldId),
      overrides && ('securityVal' in overrides) ? overrides.securityVal : (mapping.securityFieldId ? getCF(client, mapping.securityFieldId) : false),
      overrides && ('overrideVal' in overrides) ? overrides.overrideVal : (mapping.overrideFieldId ? getCF(client, mapping.overrideFieldId) : null),
      client.get('ticket.createdAt'),
      client.get('ticket.priority')
    ]);

    // Fallback to last-known if any are undefined/null
    if (impactValRaw == null) impactValRaw = STATE.last.impactVal;
    if (securityValRaw == null) securityValRaw = STATE.last.securityVal;
    if (overrideValRaw == null) overrideValRaw = STATE.last.overrideVal;

    const createdAt = createdAtObj['ticket.createdAt'];
    const priority = prioObj['ticket.priority'] || null;

    const priorityPoints = {
      urgent: Number((settings && settings.priority_points_urgent) || 12),
      high:   Number((settings && settings.priority_points_high) || 8),
      normal: Number((settings && settings.priority_points_normal) || 4),
      low:    Number((settings && settings.priority_points_low) || 0)
    };

    dlog('refresh:values', {impactValRaw, priority, securityValRaw, overrideValRaw});
    const urgencyPts = priority ? (priorityPoints[priority] ?? 0) : 0;
    dlog('impactOpts:length', Array.isArray(mapping.impactOpts) ? mapping.impactOpts.length : 'n/a');
    const impactPts  = pointsFromDropdown(impactValRaw, mapping.impactOpts);
    const timePts    = timeOpenPoints(createdAt);
    const secTrue = (securityValRaw === true) || String(securityValRaw).toLowerCase() === 'yes';
    const securityPts= secTrue ? 4 : 0;
    const override   = parseOverride(overrideValRaw);
    const cps = impactPts + urgencyPts + timePts + securityPts + override;

    const current = await getCF(client, mapping.cpsFieldId);
    if (current !== cps){
      dlog('refresh:write', { prev: current, next: cps });
      await setCF(client, mapping.cpsFieldId, cps);
    await serverWriteCps(client, mapping.cpsFieldId, cps);
    }else{
      dlog('refresh:write:skip', { unchanged: current });
    }

    STATE.last = { impactVal: impactValRaw, securityVal: securityValRaw, overrideVal: overrideValRaw };
    document.getElementById('score').textContent = String(cps);
    try {
      const prObj = await client.get('ticket.priority');
      const priorityVal = prObj['ticket.priority'];
      renderFactors({
        impactVal: STATE.last && STATE.last.impactVal,
        impactPts: (typeof impactPts !== 'undefined' ? impactPts : (r && r.impactPts) || 0),
        priority: priorityVal || null,
        urgencyPts: (typeof urgencyPts !== 'undefined' ? urgencyPts : (r && r.urgencyPts) || 0),
        timeLabel: `${(typeof timePts !== 'undefined' ? timePts : (r && r.timePts) || 0)} pts`,
        timePts: (typeof timePts !== 'undefined' ? timePts : (r && r.timePts) || 0),
        securityVal: (STATE.last && STATE.last.securityVal) ? 'Yes' : 'No',
        securityPts: (typeof securityPts !== 'undefined' ? securityPts : (r && r.securityPts) || 0),
        overrideVal: (STATE.last && STATE.last.overrideVal) ? String(STATE.last.overrideVal) : '0',
        overridePts: (typeof override !== 'undefined' ? override : (r && r.override) || 0)
      });
      pushActivity({ cps: (typeof cps !== 'undefined' ? cps : (r && r.cps)), detail: document.getElementById('detail').textContent, at: (new Date()).toLocaleTimeString() });
    } catch(_) {}

    document.getElementById('lastRun').textContent = `Last run: ${(new Date()).toLocaleString()}`;
    setStatus('Ready','ok');
  }

  window.addEventListener('error', (e)=>dlog('window.error', e.message||e));
  window.addEventListener('unhandledrejection', (e)=>dlog('promise.reject', e.reason ? (e.reason.message||String(e.reason)) : 'unknown'));

  document.addEventListener('DOMContentLoaded', async function(){
    try{
      // Early stamp
      if (DIAG()) DIAG().textContent += '[CPS] dom:ready\n';

      // SDK
      let client;
      try { client = ZAFClient.init(); dlog('sdk:init'); }
      catch(e){ dlog('sdk:init:FAIL', e && e.message ? e.message : e); setStatus('SDK failed','err'); return; }

      // Resize observers
      try{
        const ro = new ResizeObserver(()=>autoResize(client));
        ro.observe(document.body);
        const mo = new MutationObserver(()=>autoResize(client));
        mo.observe(document.body, {childList:true,subtree:true,attributes:true,characterData:true});
        autoResize(client);
      }catch(_){}

      // Settings & user
      let settings={}, user;
      try{
        const meta = await client.metadata();
        settings = meta && meta.settings || {};
        dlog('sdk:metadata:ok');
      }catch(e){ dlog('sdk:metadata:FAIL', e && e.message ? e.message : e); setStatus('Metadata error','err'); }
      try{
        user = (await client.get('currentUser')).currentUser;
        dlog('sdk:currentUser', { id: user && user.id, role: user && user.role });
      }catch(e){ dlog('sdk:currentUser:FAIL', e && e.message ? e.message : e); setStatus('User read error','err'); }

      // Map
      const mapping = await mapFields(client);
    try{ renderConfig(mapping, settings); }catch(_){}
      wireFieldChangeListeners(client, mapping, settings);

      
      wireRecalc(client, mapping, settings);
// Listeners
      const deb = (fn, ms=100)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
      const debRefresh = deb(()=>refresh(client, mapping, settings), 80);

      client.on('ticket.custom_field_changed', async (e)=>{
        const id = Number(String(e && e.id || '').replace('custom_field_', ''));
        if ([mapping.impactFieldId, mapping.securityFieldId, mapping.overrideFieldId].includes(id)){
          const ov = {};
          if (id === mapping.impactFieldId) ov.impactVal = e.newValue;
          if (id === mapping.securityFieldId) ov.securityVal = e.newValue;
          if (id === mapping.overrideFieldId) ov.overrideVal = e.newValue;
          await refresh(client, mapping, settings, ov);
        } else {
          debRefresh();
        }
      });
      client.on('ticket.priority.changed', ()=>debRefresh());
      client.on('ticket.updated', ()=>debRefresh()); // cache-aware refresh
      client.on('app.activated', ()=>debRefresh());

      // Initial
      await refresh(client, mapping, settings);
    }catch(e){
      dlog('init:FAIL', e && e.message ? e.message : e);
      setStatus('Initialization error','err');
    }

    // Watchdog
    setTimeout(()=>{
      const el = DIAG();
      if (el && !/sdk:init|mapFields:start|refresh:start/.test(el.textContent)){
        el.textContent += 'watchdog: no progress after 2000ms\n';
        setStatus('Waiting for Zendesk data…','warn');
      }
    }, 2000);
  });
})();