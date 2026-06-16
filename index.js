/**
 * ⚔️ 챗틀로얄 v3.0
 * 원형 런처 UI — 코어 원 + 위성 노드 방사형 펼침
 * Requires: 챗씨부인상담소 (character_lab roster)
 */

import { event_types } from '../../../events.js';
import {
    COMBAT_PROFILE_SYSTEM, COMBAT_PROFILE_USER,
    COMBAT_FINAL_SYSTEM, COMBAT_FINAL_USER,
    LOADING_STEPS, CONDITION_CHIPS, REPORT_SECTIONS,
} from './prompts.js';

const MODULE_NAME = 'chatl_royal';
const SCOUTER_KEY = 'character_lab';

// ═══════════════════════════════════════════
// 설정 / 상태
// ═══════════════════════════════════════════
const defaultSettings = {
    records: [],
    selectedProfileName: null,
    maxTokens: 4000,
    theme: 'dark',
    coreBottom: 80,
    coreRight: 24,
};

let state = {
    isOpen:           false,
    selectedFighters: [],
    openPanel:        null,   // 'roster' | 'settings' | 'records' | null
};

// ═══════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════
function getSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[MODULE_NAME])
        ctx.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    const s = ctx.extensionSettings[MODULE_NAME];
    for (const k of Object.keys(defaultSettings))
        if (s[k] === undefined) s[k] = structuredClone(defaultSettings[k]);
    return s;
}
function save() { SillyTavern.getContext().saveSettingsDebounced(); }
function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getTotal(c) { return Object.values(c.stats||{}).reduce((a,b)=>a+b,0); }
function avatarHue(n) { return [...n].reduce((a,c)=>a+c.charCodeAt(0),0)%360; }
function filterPhone(t) {
    return (t||'').replace(/<phone_trigger[^>]*>[\s\S]*?<\/phone_trigger>/gi,'').trim();
}
function getRoster() {
    return SillyTavern.getContext().extensionSettings?.[SCOUTER_KEY]?.roster || [];
}
function getTheme() { return getSettings().theme || 'dark'; }

// ═══════════════════════════════════════════
// 아바타
// ═══════════════════════════════════════════
function resolveAvatar(name) {
    const ctx = SillyTavern.getContext();
    const st  = (ctx.characters||[]).find(c=>c.name===name);
    if (st?.avatar) return `/thumbnail?type=avatar&file=${encodeURIComponent(st.avatar)}`;
    const personas = ctx.powerUserSettings?.personas||{};
    const pe = Object.entries(personas).find(([,n])=>n===name);
    if (pe) return `/thumbnail?type=persona&file=${encodeURIComponent(pe[0])}`;
    return null;
}

function makeAvatarEl(name, gender, size=52) {
    const url = resolveAvatar(name);
    const hue = avatarHue(name);
    const gc  = gender==='female'?'#ff66bb':'#4499ff';
    const ini = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const div = document.createElement('div');
    div.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:2.5px solid ${gc};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.32)}px;font-weight:900;color:hsl(${hue},55%,65%);font-family:monospace;background:var(--cr-node-bg)`;
    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        img.onerror = () => { div.removeChild(img); div.textContent = ini; };
        div.appendChild(img);
    } else {
        div.textContent = ini;
    }
    return div;
}

// ═══════════════════════════════════════════
// AI 호출
// ═══════════════════════════════════════════
async function callAI(userPrompt, systemPrompt) {
    const ctx   = SillyTavern.getContext();
    const s     = getSettings();
    const pName = s.selectedProfileName;
    if (pName && ctx.ConnectionManagerRequestService) {
        const profiles = ctx.extensionSettings?.['connectionManager']?.profiles||[];
        const profile  = profiles.find(p=>p.name===pName);
        if (profile) {
            const content  = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
            const response = await ctx.ConnectionManagerRequestService.sendRequest(
                profile.id, [{role:'user',content}], s.maxTokens||4000,
                {stream:false,extractData:true,includePreset:true,includeInstruct:false}
            );
            let raw='';
            if (typeof response==='string') raw=response;
            else if (typeof response?.content==='string') raw=response.content;
            else if (response?.choices?.[0]?.message?.content) raw=response.choices[0].message.content;
            else if (response?.content?.[0]?.text) raw=response.content[0].text;
            return filterPhone(raw);
        }
    }
    const result = await ctx.generateRaw({systemPrompt:systemPrompt||undefined,prompt:userPrompt});
    return filterPhone(result||'');
}

// ═══════════════════════════════════════════
// 프롬프트 빌더
// ═══════════════════════════════════════════
function fillTpl(tpl, vars) {
    return tpl.replace(/\{\{(\w+)\}\}/g, (_,k) => vars[k]??'');
}

function buildProfilePrompt(char) {
    const p   = char.parsed||{};
    const raw = p.raw||[p.appearance,p.personality,p.traits].filter(Boolean).join('\n');
    return fillTpl(COMBAT_PROFILE_USER, {
        name:     char.name,
        gender:   char.gender==='female'?'Female':'Male',
        age:      p.age||'Unknown',
        job:      p.job||'Unknown',
        location: p.location||'Unknown',
        stats:    Object.entries(char.stats||{}).map(([k,v])=>`${k}=${v}`).join(' '),
        sheet:    raw.slice(0,1800),
    });
}

function buildFinalPrompt(fighters, profiles, condition) {
    const block = fighters.map((f,i) => {
        const pr    = profiles[i];
        const stats = Object.entries(f.stats||{}).map(([k,v])=>`    ${k}: ${v}`).join('\n');
        return `━━━ FIGHTER ${i+1}: ${f.name} ━━━
[Stats]\n${stats}\n  TOTAL: ${getTotal(f)}\n
[Combat Profile]
• Species:        ${pr.species||'—'}
• Physique:       ${pr.physique||'—'}
• Job (Combat):   ${pr.job_combat||'—'}
• Experience:     ${pr.experience||'—'}
• Skills:         ${pr.skills||'—'}
• World Setting:  ${pr.worldsetting||'—'}
• Strengths:      ${pr.strengths||'—'}
• Weaknesses:     ${pr.weaknesses||'—'}
• Psychology:     ${pr.psychology||'—'}
• Background:     ${pr.background_factors||'—'}
• Power Ceiling:  ${pr.power_ceiling||'—'}
• Anti-Synergy:   ${pr.anti_synergy||'—'}`;
    }).join('\n\n');

    return fillTpl(COMBAT_FINAL_USER, {
        condition:    condition||'기본 대결. 특별한 제약 없음.',
        fighterCount: fighters.length,
        fighters:     block,
    });
}

// ═══════════════════════════════════════════
// 로딩
// ═══════════════════════════════════════════
function showLoading(msg) {
    let el = document.getElementById('cr-loading');
    if (!el) {
        el = document.createElement('div');
        el.id = 'cr-loading';
        el.className = `cr-${getTheme()}`;
        el.innerHTML = `
            <div style="position:relative;width:32px;height:32px;flex-shrink:0">
                <svg viewBox="0 0 60 60" style="width:32px;height:32px;animation:cr-spin 1.2s linear infinite">
                    <circle cx="30" cy="30" r="24" fill="none" stroke="var(--cr-border)" stroke-width="4"/>
                    <circle cx="30" cy="30" r="24" fill="none" stroke="var(--cr-accent)" stroke-width="4" stroke-dasharray="40 110" stroke-linecap="round"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px">⚔️</div>
            </div>
            <div style="flex:1">
                <div id="cr-loading-msg" style="font-size:11px;color:var(--cr-accent);font-family:'Press Start 2P',monospace;letter-spacing:1px">${msg||''}</div>
                <div style="display:flex;gap:4px;margin-top:6px"><div class="cr-dot"></div><div class="cr-dot"></div><div class="cr-dot"></div></div>
            </div>`;
        document.body.appendChild(el);
    }
    updateLoadingMsg(msg);
}
function hideLoading() {
    const el = document.getElementById('cr-loading');
    if (!el) return;
    el.style.opacity='0'; el.style.transition='opacity 0.3s';
    setTimeout(()=>el.remove(), 300);
}
function updateLoadingMsg(msg) {
    if (!msg) return;
    const m = document.getElementById('cr-loading-msg');
    if (!m) return;
    m.style.opacity='0';
    setTimeout(()=>{ if(m){ m.textContent=msg; m.style.opacity='1'; m.style.transition='opacity 0.3s'; }}, 200);
}

// ═══════════════════════════════════════════
// 배틀 실행
// ═══════════════════════════════════════════
async function runBattle(condition) {
    const fighters = [...state.selectedFighters];
    showLoading('SCANNING FIGHTERS...');
    try {
        const profiles = [];
        for (let i=0; i<fighters.length; i++) {
            updateLoadingMsg(`PROFILING ${fighters[i].name.toUpperCase()}... (${i+1}/${fighters.length})`);
            try {
                const raw    = await callAI(buildProfilePrompt(fighters[i]), COMBAT_PROFILE_SYSTEM);
                const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
                profiles.push(parsed);
            } catch {
                const p = fighters[i].parsed||{};
                profiles.push({ species:'인간', physique:p.appearance||'—', job_combat:p.job||'—',
                    experience:'불명', skills:p.traits||'—', worldsetting:'현대 현실',
                    strengths:'—', weaknesses:'—', psychology:p.personality||'—',
                    background_factors:'—', power_ceiling:'—', anti_synergy:'—' });
            }
        }
        updateLoadingMsg('RUNNING SIMULATION...');
        const resultText = await callAI(buildFinalPrompt(fighters,profiles,condition), COMBAT_FINAL_SYSTEM);
        hideLoading();

        const wm     = resultText.match(/【최종 승자:\s*(.+?)\s*\(승률\s*(\d+)%\)】/);
        const winner  = wm?wm[1].trim():'???';
        const winRate = wm?parseInt(wm[2]):null;

        const record = {
            id: `cr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            fighters: fighters.map(f=>({id:f.id,name:f.name,gender:f.gender,total:getTotal(f)})),
            profiles, condition: condition||'기본 대결',
            winner, winRate, resultText,
            createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g,'.'),
        };
        const s = getSettings();
        s.records.unshift(record);
        if (s.records.length>50) s.records.length=50;
        save();

        openResultPanel(record);
    } catch(e) {
        hideLoading();
        toastr.error(`Battle failed: ${e.message}`);
    }
}

// ═══════════════════════════════════════════
// 결과 패널
// ═══════════════════════════════════════════
function openResultPanel(record) {
    document.getElementById('cr-result-panel')?.remove();

    const panel = document.createElement('div');
    panel.id    = 'cr-result-panel';
    panel.className = `cr-${getTheme()}`;

    const fighterNames = record.fighters.map(f=>f.name).join(' VS ');
    const wm     = (record.resultText||'').match(/【최종 승자:\s*(.+?)\s*\(승률\s*(\d+)%\)】/);
    const winner  = wm?wm[1].trim():record.winner||'???';
    const winRate = wm?wm[2]:record.winRate||'??';

    let sectionsHtml = '';
    for (const sec of REPORT_SECTIONS) {
        const rx = new RegExp(`${sec.icon}[^\\n]*【${sec.key}】([\\s\\S]*?)(?=⚔️|🧮|⚖️|🏆|$)`,'u');
        const m  = (record.resultText||'').match(rx);
        sectionsHtml += `
            <div class="cr-section-header">${sec.icon} ${sec.key}</div>
            <div style="color:var(--cr-text);font-size:14px;line-height:2;white-space:pre-wrap;word-break:break-word;margin-bottom:8px">${esc(m?m[1].trim():'—')}</div>`;
    }

    panel.innerHTML = `
        <div class="cr-panel-header" id="cr-result-drag">
            <span style="font-size:18px">📜</span>
            <div class="cr-panel-title">BATTLE REPORT</div>
            <button class="cr-panel-close" id="cr-result-close">✕</button>
        </div>
        <div class="cr-panel-body">
            <div style="font-size:11px;color:var(--cr-text-dim);margin-bottom:14px;line-height:2;font-family:system-ui">${esc(fighterNames)}<br><span style="font-size:10px">${esc((record.condition||'').slice(0,60))}</span></div>
            <div class="cr-winner-banner">🏆 WINNER: ${esc(winner)} (${winRate}%)</div>
            ${sectionsHtml}
        </div>
        <div class="cr-panel-resize" id="cr-result-resize">⇲</div>`;

    document.body.appendChild(panel);
    makeDraggable(panel, document.getElementById('cr-result-drag'));
    makeResizable(panel, document.getElementById('cr-result-resize'));
    document.getElementById('cr-result-close')?.addEventListener('click', ()=>panel.remove());
}

// ═══════════════════════════════════════════
// 상황 입력 패널
// ═══════════════════════════════════════════
function showConditionPanel() {
    document.getElementById('cr-condition-panel')?.remove();

    const panel = document.createElement('div');
    panel.id    = 'cr-condition-panel';
    panel.className = `cr-${getTheme()}`;

    const chips = CONDITION_CHIPS.map(c=>
        `<span class="cr-chip" data-v="${esc(c)}">${esc(c)}</span>`
    ).join('');

    panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="font-family:'Press Start 2P',monospace;font-size:10px;color:var(--cr-accent);letter-spacing:1px">⚔️ 배틀 조건</span>
            <button id="cr-cond-close" style="background:none;border:none;cursor:pointer;color:var(--cr-text-dim);font-size:16px;margin-left:auto;line-height:1;padding:0">✕</button>
        </div>
        <div style="margin-bottom:10px;line-height:2.2">${chips}</div>
        <textarea id="cr-cond-ta" rows="3" placeholder="예: 좁은 골목 야간 칼싸움&#10;예: 법정 최후변론 대결&#10;예: 전면전 — 각자 100명 병력&#10;(비워두면 기본 대결)"></textarea>
        <div style="display:flex;gap:8px;margin-top:12px">
            <button class="cr-btn cr-btn-ghost" id="cr-cond-cancel" style="flex:1">취소</button>
            <button class="cr-btn cr-btn-primary" id="cr-cond-go" style="flex:2">⚔️ FIGHT!</button>
        </div>`;

    document.body.appendChild(panel);

    panel.querySelectorAll('.cr-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const ta = document.getElementById('cr-cond-ta');
            if (ta) ta.value = ta.value ? ta.value+', '+chip.dataset.v : chip.dataset.v;
        });
    });

    const close = () => panel.remove();
    document.getElementById('cr-cond-close')?.addEventListener('click', close);
    document.getElementById('cr-cond-cancel')?.addEventListener('click', close);
    document.getElementById('cr-cond-go')?.addEventListener('click', async () => {
        const cond = document.getElementById('cr-cond-ta')?.value.trim()||'';
        close();
        await runBattle(cond);
    });
}

// ═══════════════════════════════════════════
// 플로팅 패널 생성 (로스터 / 설정 / 기록)
// ═══════════════════════════════════════════
function makePanel(id, title, bodyHtml, opts={}) {
    document.getElementById(id)?.remove();

    const s = getSettings();
    // 코어 위치 기반으로 패널 위치 계산
    const coreEl = document.getElementById('cr-core');
    const coreRect = coreEl?.getBoundingClientRect();
    const top  = opts.top  ?? (coreRect ? Math.max(20, coreRect.top - 400) : 80);
    const right = opts.right ?? 100;

    const panel = document.createElement('div');
    panel.id        = id;
    panel.className = `cr-panel cr-${getTheme()}`;
    panel.style.cssText = `top:${top}px;right:${right}px;width:${opts.width||360}px;max-height:${opts.maxH||500}px`;

    panel.innerHTML = `
        <div class="cr-panel-header" id="${id}-drag">
            <span style="font-size:16px">${opts.icon||'📋'}</span>
            <div class="cr-panel-title">${title}</div>
            <button class="cr-panel-close" data-close="${id}">✕</button>
        </div>
        <div class="cr-panel-body" id="${id}-body">${bodyHtml}</div>
        <div class="cr-panel-resize" id="${id}-resize">⇲</div>`;

    document.body.appendChild(panel);
    makeDraggable(panel, document.getElementById(`${id}-drag`));
    makeResizable(panel, document.getElementById(`${id}-resize`));

    panel.querySelector(`[data-close="${id}"]`)?.addEventListener('click', () => {
        panel.remove();
        if (state.openPanel === opts.panelKey) state.openPanel = null;
    });

    return panel;
}

// ─── 로스터 패널 ─────────────────────────
function openRosterPanel() {
    const roster   = getRoster();
    const fighters = state.selectedFighters;

    const STAT_META = {
        charm:    { label:'🌹', color:'#ff66bb' },
        presence: { label:'👑', color:'#ffaa00' },
        desire:   { label:'🔥', color:'#ff3388' },
        wit:      { label:'🧠', color:'#aa44ff' },
        aura:     { label:'⚡', color:'#4499ff' },
    };

    const cardsHtml = roster.length===0
        ? `<div style="text-align:center;padding:20px;color:var(--cr-text-dim);font-size:13px;font-family:system-ui">챗씨부인에서 캐릭터를 먼저 등록하세요</div>`
        : roster.map(char => {
            const sel = !!fighters.find(f=>f.id===char.id);
            const hue = avatarHue(char.name);
            const gc  = char.gender==='female'?'#ff66bb':'#4499ff';
            const ini = char.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
            const url = resolveAvatar(char.name);
            const avStyle = `width:42px;height:42px;border-radius:50%;overflow:hidden;border:2px solid ${gc};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;background:var(--cr-node-bg);color:hsl(${hue},55%,65%);font-family:monospace`;
            const avInner = url
                ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
                : ini;
            const bars = Object.entries(char.stats||{}).map(([k,v])=>`
                <div class="cr-stat-row">
                    <div class="cr-stat-icon">${STAT_META[k]?.label||k}</div>
                    <div class="cr-stat-track"><div class="cr-stat-fill" style="width:${v}%;background:${STAT_META[k]?.color||'var(--cr-accent)'}"></div></div>
                    <div class="cr-stat-val">${v}</div>
                </div>`).join('');
            return `<div class="cr-char-card ${sel?'selected':''}" data-id="${char.id}">
                <div style="${avStyle}">${avInner}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:700;color:${sel?'var(--cr-text-bright)':'var(--cr-text)'};margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(char.name)}</div>
                    ${bars}
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:16px;font-weight:900;color:${sel?'var(--cr-accent)':'var(--cr-text-dim)'};font-family:'Press Start 2P',monospace">${getTotal(char)}</div>
                    ${sel?`<div style="font-size:9px;color:var(--cr-accent);margin-top:4px">✓ 선택됨</div>`:''}
                </div>
            </div>`;
        }).join('');

    const panel = makePanel('cr-roster-panel', 'FIGHTERS', cardsHtml, {
        icon:'⚔️', panelKey:'roster', width:380, maxH:560,
    });

    // 카드 클릭
    panel.querySelectorAll('.cr-char-card').forEach(card => {
        card.addEventListener('click', () => {
            const id   = card.dataset.id;
            const char = getRoster().find(c=>c.id===id);
            if (!char) return;
            const idx  = state.selectedFighters.findIndex(f=>f.id===id);
            if (idx>=0) state.selectedFighters.splice(idx,1);
            else state.selectedFighters.push(char);
            // 카드 UI 즉시 업데이트
            card.classList.toggle('selected', state.selectedFighters.some(f=>f.id===id));
            renderNodes();
        });
    });

    state.openPanel = 'roster';
}

// ─── 설정 패널 ───────────────────────────
function openSettingsPanel() {
    const ctx      = SillyTavern.getContext();
    const s        = getSettings();
    const profiles = ctx.extensionSettings?.['connectionManager']?.profiles||[];
    const saved    = s.selectedProfileName||'';
    const profOpts = [`<option value="">현재 연결 그대로</option>`,
        ...profiles.map(p=>`<option value="${esc(p.name)}" ${p.name===saved?'selected':''}>${esc(p.name)}</option>`)
    ].join('');
    const theme    = getTheme();

    const bodyHtml = `
        <div class="cr-setting-row">
            <div class="cr-setting-label">Connection Profile</div>
            <select id="cr-prof-sel" class="cr-setting-select">${profOpts}</select>
        </div>
        <div class="cr-setting-row">
            <div class="cr-setting-label">Max Tokens</div>
            <input id="cr-tok" type="number" min="500" max="16000" step="500" value="${s.maxTokens||4000}" class="cr-setting-input">
        </div>
        <div class="cr-setting-row">
            <div class="cr-setting-label">테마</div>
            <div style="display:flex;gap:8px">
                <button class="cr-btn ${theme==='dark'?'cr-btn-primary':'cr-btn-ghost'}" id="cr-theme-dark" style="flex:1">🌙 다크</button>
                <button class="cr-btn ${theme==='light'?'cr-btn-primary':'cr-btn-ghost'}" id="cr-theme-light" style="flex:1">☀️ 라이트</button>
            </div>
        </div>
        <div class="cr-setting-row" style="font-size:11px;color:var(--cr-text-dim);font-family:system-ui;line-height:1.8">※ 배틀 = 파이터수 × 프로파일 호출 + 최종 1회</div>
        <button class="cr-btn cr-btn-danger" id="cr-clear-recs" style="width:100%">🗑 기록 전체 삭제</button>`;

    const panel = makePanel('cr-settings-panel', 'SETTINGS', bodyHtml, {
        icon:'⚙️', panelKey:'settings', width:320, maxH:420,
    });

    document.getElementById('cr-prof-sel')?.addEventListener('change', e => {
        const s2=getSettings(); s2.selectedProfileName=e.target.value||null; save();
        toastr.success(e.target.value?`Profile: "${e.target.value}"`:'현재 연결 사용');
    });
    document.getElementById('cr-tok')?.addEventListener('change', e => {
        const s2=getSettings(); s2.maxTokens=parseInt(e.target.value)||4000; save();
    });
    document.getElementById('cr-theme-dark')?.addEventListener('click', () => {
        const s2=getSettings(); s2.theme='dark'; save();
        applyTheme('dark'); panel.remove(); openSettingsPanel();
    });
    document.getElementById('cr-theme-light')?.addEventListener('click', () => {
        const s2=getSettings(); s2.theme='light'; save();
        applyTheme('light'); panel.remove(); openSettingsPanel();
    });
    document.getElementById('cr-clear-recs')?.addEventListener('click', async () => {
        const {Popup,POPUP_RESULT}=SillyTavern.getContext();
        const ok=await Popup.show.confirm('기록 삭제','배틀 기록을 전부 삭제할까요?');
        if (ok===POPUP_RESULT.AFFIRMATIVE) {
            const s2=getSettings(); s2.records=[]; save();
            toastr.success('기록 삭제됨');
        }
    });

    state.openPanel = 'settings';
}

// ─── 기록 패널 ───────────────────────────
function openRecordsPanel() {
    const records = getSettings().records;

    const bodyHtml = records.length===0
        ? `<div style="text-align:center;padding:20px;color:var(--cr-text-dim);font-size:13px;font-family:system-ui">배틀 기록이 없습니다</div>`
        : records.map(r=>`
            <div class="cr-record-card" data-id="${r.id}">
                <div style="flex:1;min-width:0">
                    <div style="font-size:11px;color:var(--cr-gold);font-family:'Press Start 2P',monospace;letter-spacing:0.5px;margin-bottom:3px">🏆 ${esc(r.winner)}${r.winRate?` (${r.winRate}%)`:''}
                    </div>
                    <div style="font-size:11px;color:var(--cr-text-dim);font-family:system-ui">${esc(r.fighters.map(f=>f.name).join(' VS '))}</div>
                    <div style="font-size:10px;color:var(--cr-text-dim);margin-top:2px;font-family:system-ui">${esc((r.condition||'').slice(0,40))}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;gap:4px;align-items:flex-end">
                    <div style="font-size:10px;color:var(--cr-text-dim);font-family:system-ui">${esc(r.createdAt||'')}</div>
                    <button class="cr-btn cr-btn-ghost cr-del-rec" data-id="${r.id}" style="font-size:11px;padding:3px 8px">🗑</button>
                </div>
            </div>`).join('');

    const panel = makePanel('cr-records-panel', 'RECORDS', bodyHtml, {
        icon:'📜', panelKey:'records', width:380, maxH:500,
    });

    panel.querySelectorAll('.cr-record-card').forEach(card => {
        card.addEventListener('click', e => {
            if (e.target.closest('.cr-del-rec')) return;
            const rec = getSettings().records.find(r=>r.id===card.dataset.id);
            if (rec) openResultPanel(rec);
        });
    });
    panel.querySelectorAll('.cr-del-rec').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const s=getSettings(); s.records=s.records.filter(r=>r.id!==btn.dataset.id); save();
            btn.closest('.cr-record-card')?.remove();
        });
    });

    state.openPanel = 'records';
}

// ═══════════════════════════════════════════
// 위성 노드 렌더
// ═══════════════════════════════════════════
const STATIC_NODES = [
    { key:'roster',   icon:'⚔️',  label:'파이터\n선택',    size:54, color:'var(--cr-border-bright)' },
    { key:'fight',    icon:'🔥',  label:'FIGHT',           size:58, color:'var(--cr-accent)' },
    { key:'records',  icon:'📜',  label:'기록',            size:46, color:'var(--cr-border)' },
    { key:'settings', icon:'⚙️',  label:'설정',            size:46, color:'var(--cr-border)' },
    { key:'theme',    icon:'🌙',  label:'테마',            size:46, color:'var(--cr-border)' },
];

function renderNodes() {
    // 기존 노드 / 캔버스 제거
    document.querySelectorAll('.cr-node').forEach(n=>n.remove());
    const oldCanvas = document.getElementById('cr-lines');
    if (oldCanvas) oldCanvas.remove();

    if (!state.isOpen) return;

    const coreEl   = document.getElementById('cr-core');
    if (!coreEl) return;
    const coreRect = coreEl.getBoundingClientRect();
    const cx       = coreRect.left + coreRect.width/2;
    const cy       = coreRect.top  + coreRect.height/2;

    // 캔버스 연결선
    const canvas = document.createElement('canvas');
    canvas.id    = 'cr-lines';
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:8998';
    document.body.appendChild(canvas);
    const ctx2 = canvas.getContext('2d');

    const fighters = state.selectedFighters;

    // 파이터 노드 (선택된 캐릭터들) — 위쪽 반원 배치
    const fighterAngleStart = -150;
    const fighterAngleStep  = fighters.length>1 ? 120/(fighters.length-1) : 0;
    const fighterRadius     = 110;

    fighters.forEach((f, i) => {
        const angleDeg = fighters.length===1
            ? -90
            : fighterAngleStart + i*fighterAngleStep;
        const angle = angleDeg * Math.PI/180;
        const tx = cx + fighterRadius*Math.cos(angle);
        const ty = cy + fighterRadius*Math.sin(angle);

        const node = document.createElement('div');
        node.className = 'cr-node selected';
        const size = 58;
        node.style.cssText = `width:${size}px;height:${size}px;left:${tx - size/2}px;top:${ty - size/2}px`;

        const av = makeAvatarEl(f.name, f.gender, size-8);
        av.style.borderRadius = '50%';
        node.appendChild(av);

        const label = document.createElement('div');
        label.className = 'cr-node-label';
        label.style.cssText = `position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:10px;white-space:nowrap;color:var(--cr-accent)`;
        label.textContent = f.name;
        node.appendChild(label);

        node.dataset.fighterId = f.id;
        node.title = `${f.name} — 클릭하면 선택 해제`;
        node.addEventListener('click', () => {
            state.selectedFighters = state.selectedFighters.filter(x=>x.id!==f.id);
            renderNodes();
        });

        document.body.appendChild(node);
        animateNodeIn(node, cx, cy, tx, ty);

        // 연결선
        drawLine(ctx2, cx, cy, tx, ty, 'rgba(255,153,0,0.25)');
    });

    // 정적 노드들 — 아래쪽/옆쪽 배치
    // fight: 아래, roster: 왼쪽위, records: 왼쪽, settings: 오른쪽, theme: 오른쪽위
    const staticPositions = [
        { key:'roster',   angle:-135, r:100 },
        { key:'fight',    angle: 270, r:110 },
        { key:'records',  angle:-200, r:95  },
        { key:'settings', angle:  45, r:95  },
        { key:'theme',    angle: -40, r:100 },
    ];

    staticPositions.forEach(({key, angle, r}) => {
        const meta = STATIC_NODES.find(n=>n.key===key);
        if (!meta) return;

        const rad = angle * Math.PI/180;
        const tx  = cx + r*Math.cos(rad);
        const ty  = cy + r*Math.sin(rad);

        // 화면 밖으로 나가면 안으로 당기기
        const size = meta.size;
        const clampedTx = Math.max(size/2+4, Math.min(window.innerWidth-size/2-4, tx));
        const clampedTy = Math.max(size/2+4, Math.min(window.innerHeight-size/2-4, ty));

        const node = document.createElement('div');
        node.className = `cr-node cr-${key}-node`;
        node.style.cssText = `width:${size}px;height:${size}px;left:${clampedTx-size/2}px;top:${clampedTy-size/2}px;border-color:${meta.color};flex-direction:column;gap:2px`;
        node.innerHTML = `
            <div style="font-size:${key==='fight'?22:18}px">${meta.icon}</div>
            ${key==='fight' && fighters.length>=2
                ? `<div style="font-family:'Press Start 2P',monospace;font-size:7px;color:var(--cr-accent);letter-spacing:1px">FIGHT!</div>`
                : `<div class="cr-node-label" style="position:static;transform:none;font-size:9px;max-width:52px">${meta.label}</div>`}`;

        if (key==='fight' && fighters.length>=2) {
            node.style.borderColor = 'var(--cr-accent)';
            node.style.boxShadow   = '0 0 16px var(--cr-accent-dim)';
        }

        node.addEventListener('click', () => onStaticNode(key));
        document.body.appendChild(node);
        animateNodeIn(node, cx, cy, clampedTx, clampedTy);

        // 연결선 (fight만 강조)
        const lineColor = key==='fight' && fighters.length>=2
            ? 'rgba(255,153,0,0.4)'
            : 'rgba(255,153,0,0.15)';
        drawLine(ctx2, cx, cy, clampedTx, clampedTy, lineColor);
    });
}

function drawLine(ctx, x1, y1, x2, y2, color) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
}

function animateNodeIn(node, cx, cy, tx, ty) {
    const ox = (cx - tx) * 0.7;
    const oy = (cy - ty) * 0.7;
    node.style.setProperty('--ox', `${ox}px`);
    node.style.setProperty('--oy', `${oy}px`);
    node.style.setProperty('--tx', '0px');
    node.style.setProperty('--ty', '0px');
    node.style.animation = 'cr-pop-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards';
}

function onStaticNode(key) {
    if (key==='fight') {
        if (state.selectedFighters.length<2) {
            toastr.warning('파이터 2명 이상 선택하세요'); return;
        }
        showConditionPanel();
    } else if (key==='roster') {
        if (state.openPanel==='roster') { document.getElementById('cr-roster-panel')?.remove(); state.openPanel=null; }
        else openRosterPanel();
    } else if (key==='settings') {
        if (state.openPanel==='settings') { document.getElementById('cr-settings-panel')?.remove(); state.openPanel=null; }
        else openSettingsPanel();
    } else if (key==='records') {
        if (state.openPanel==='records') { document.getElementById('cr-records-panel')?.remove(); state.openPanel=null; }
        else openRecordsPanel();
    } else if (key==='theme') {
        const s = getSettings();
        s.theme = s.theme==='dark'?'light':'dark'; save();
        applyTheme(s.theme);
        renderNodes();
    }
}

// ═══════════════════════════════════════════
// 테마 적용
// ═══════════════════════════════════════════
function applyTheme(theme) {
    const core = document.getElementById('cr-core');
    if (core) { core.classList.remove('cr-dark','cr-light'); core.classList.add(`cr-${theme}`); }
    document.querySelectorAll('.cr-panel,.cr-node,#cr-condition-panel,#cr-result-panel,#cr-loading').forEach(el => {
        el.classList.remove('cr-dark','cr-light'); el.classList.add(`cr-${theme}`);
    });
    const themeNode = document.querySelector('.cr-theme-node');
    if (themeNode) themeNode.querySelector('div')?.textContent === theme==='dark'?'🌙':'☀️';
}

// ═══════════════════════════════════════════
// 코어 생성
// ═══════════════════════════════════════════
function createCore() {
    if (document.getElementById('cr-core')) return;

    const s    = getSettings();
    const core = document.createElement('div');
    core.id    = 'cr-core';
    core.className = `cr-${getTheme()}`;
    core.innerHTML = '⚔️';
    core.style.bottom = `${s.coreBottom||80}px`;
    core.style.right  = `${s.coreRight||24}px`;
    document.body.appendChild(core);

    // 코어 드래그
    makeDraggableCore(core);

    core.addEventListener('click', () => {
        state.isOpen = !state.isOpen;
        core.classList.toggle('open', state.isOpen);
        core.innerHTML = state.isOpen ? '✕' : '⚔️';
        if (!state.isOpen) {
            document.querySelectorAll('.cr-node').forEach(n=>n.remove());
            document.getElementById('cr-lines')?.remove();
            // 열린 패널들 닫기
            ['cr-roster-panel','cr-settings-panel','cr-records-panel','cr-condition-panel'].forEach(id=>{
                document.getElementById(id)?.remove();
            });
            state.openPanel = null;
        } else {
            renderNodes();
        }
    });
}

// ─── 코어 드래그 (fixed position 조정) ───
function makeDraggableCore(el) {
    let dragging=false, startX, startY, startBottom, startRight;
    el.addEventListener('mousedown', e => {
        dragging=true; startX=e.clientX; startY=e.clientY;
        startBottom=parseInt(el.style.bottom)||80;
        startRight =parseInt(el.style.right)||24;
        document.body.style.userSelect='none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newRight  = Math.max(0, Math.min(window.innerWidth-70,  startRight  - dx));
        const newBottom = Math.max(0, Math.min(window.innerHeight-70, startBottom - dy));
        el.style.right  = newRight+'px';
        el.style.bottom = newBottom+'px';
        if (state.isOpen) renderNodes(); // 노드 위치 업데이트
    });
    document.addEventListener('mouseup', e => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect='';
        const s=getSettings();
        s.coreRight  = parseInt(el.style.right)||24;
        s.coreBottom = parseInt(el.style.bottom)||80;
        save();
    });
}

// ═══════════════════════════════════════════
// 드래그 / 리사이즈 (패널용)
// ═══════════════════════════════════════════
function makeDraggable(panel, handle) {
    let drag=false,sx,sy,sl,st;
    const go=(cx,cy)=>{ drag=true; sx=cx; sy=cy; const r=panel.getBoundingClientRect(); sl=r.left; st=r.top; panel.style.right='auto'; document.body.style.userSelect='none'; };
    const mv=(cx,cy)=>{ if(!drag)return; panel.style.left=Math.max(0,sl+cx-sx)+'px'; panel.style.top=Math.max(0,st+cy-sy)+'px'; };
    const up=()=>{ drag=false; document.body.style.userSelect=''; };
    handle.addEventListener('mousedown',e=>{ if(e.target.closest('button'))return; go(e.clientX,e.clientY); });
    document.addEventListener('mousemove',e=>mv(e.clientX,e.clientY));
    document.addEventListener('mouseup',up);
}

function makeResizable(panel, handle) {
    let r=false,rx,ry,rw,rh;
    handle.addEventListener('mousedown',e=>{ r=true; rx=e.clientX; ry=e.clientY; rw=panel.offsetWidth; rh=panel.offsetHeight; document.body.style.userSelect='none'; e.preventDefault(); });
    document.addEventListener('mousemove',e=>{ if(!r)return; panel.style.width=Math.max(280,rw+e.clientX-rx)+'px'; panel.style.height=Math.max(200,rh+e.clientY-ry)+'px'; });
    document.addEventListener('mouseup',()=>{ r=false; document.body.style.userSelect=''; });
}

// ═══════════════════════════════════════════
// 초기화
// ═══════════════════════════════════════════
export async function onActivate() {
    console.log(`[${MODULE_NAME}] activate`);

    const s = getSettings();

    // 확장 설정 패널
    const ctx      = SillyTavern.getContext();
    const profiles = ctx.extensionSettings?.['connectionManager']?.profiles||[];
    const saved    = s.selectedProfileName||'';
    const profOpts = profiles.map(p=>`<option value="${esc(p.name)}" ${p.name===saved?'selected':''}>${esc(p.name)}</option>`).join('');

    if (!document.getElementById('cr-ext-settings')) {
        const html=`<div class="inline-drawer" id="cr-ext-settings">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>⚔️ 챗틀로얄</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div style="padding:8px;display:flex;flex-direction:column;gap:8px">
                    <div style="font-size:0.82rem;color:var(--SmartThemeBodyColor,#ccc)">Connection Profile</div>
                    <select id="cr-ext-prof" class="text_pole" style="width:100%">
                        <option value="">현재 연결 그대로</option>${profOpts}
                    </select>
                    <div style="font-size:0.76rem;color:var(--SmartThemeQuoteColor,#aaa)">챗씨부인에 캐릭터가 등록되어 있어야 합니다</div>
                </div>
            </div>
        </div>`;
        const t=document.getElementById('extensions_settings2')??document.getElementById('extensions_settings');
        t?.insertAdjacentHTML('beforeend',html);
        document.getElementById('cr-ext-prof')?.addEventListener('change',e=>{
            const s2=getSettings(); s2.selectedProfileName=e.target.value||null; save();
            toastr.success(e.target.value?`Profile: "${e.target.value}"`:'현재 연결 사용');
        });
    }

    // 툴바 버튼
    if (!document.getElementById('cr-wand-btn')) {
        const btn = document.createElement('div');
        btn.id = 'cr-wand-btn';
        btn.title = '챗틀로얄';
        btn.style.cssText = 'cursor:pointer;padding:4px 8px;display:flex;align-items:center;gap:5px;font-size:13px';
        btn.innerHTML = '<span>⚔️</span><span style="font-size:12px">챗틀로얄</span>';
        btn.addEventListener('click', () => {
            if (!document.getElementById('cr-core')) createCore();
            setTimeout(() => document.getElementById('cr-core')?.click(), 50);
        });
        const tb = document.getElementById('extensionsMenu') ?? document.getElementById('top-bar');
        tb?.appendChild(btn);
    }

    createCore();

    document.addEventListener('keydown', e => {
        if (e.key==='Escape' && state.isOpen) {
            document.getElementById('cr-core')?.click();
        }
    });

    console.log(`[${MODULE_NAME}] ready`);
}

jQuery(async () => {
    const ctx = SillyTavern.getContext();
    ctx.eventSource.on(event_types.APP_READY, async () => { await onActivate(); });
});
