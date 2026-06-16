/**
 * ⚔️ 챗틀로얄 v2.0
 * SillyTavern Extension
 * Requires: 챗씨부인상담소 (character_lab)
 *
 * UI: H2O 분자 모형 — 중앙 코어 원에서 위성 원형 노드가 방사형으로 튀어나옴
 *     코어 뒤집기(flip) → 설정 화면
 *     테마 토글: 다크 ↔ 라이트
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
// 테마
// ═══════════════════════════════════════════
const THEMES = {
    dark: {
        bg:           '#060400',
        bgCard:       '#0d0600',
        bgPanel:      '#0a0500',
        border:       '#553300',
        borderBright: '#996600',
        text:         '#ddaa77',
        textDim:      '#775533',
        textBright:   '#ffdd99',
        accent:       '#ff9900',
        accentDim:    '#663300',
        gold:         '#ffcc00',
        coreBg:       '#110800',
        nodeBg:       '#0d0600',
        shadow:       'rgba(255,100,0,0.25)',
        resultBg:     '#050300',
        resultBorder: '#664400',
        font:         '#ddaa77',
    },
    light: {
        bg:           '#f5f0e8',
        bgCard:       '#fffdf7',
        bgPanel:      '#faf6ee',
        border:       '#c8a878',
        borderBright: '#a07040',
        text:         '#5a3a1a',
        textDim:      '#b09070',
        textBright:   '#3a2010',
        accent:       '#b85c00',
        accentDim:    '#e8c090',
        gold:         '#c07800',
        coreBg:       '#fff8ee',
        nodeBg:       '#fffdf7',
        shadow:       'rgba(160,100,0,0.18)',
        resultBg:     '#fefcf5',
        resultBorder: '#c8a878',
        font:         '#5a3a1a',
    },
};

let currentTheme = 'dark';
function C() { return THEMES[currentTheme]; }

// ═══════════════════════════════════════════
// 스탯 메타
// ═══════════════════════════════════════════
const STAT_META = {
    charm:    { label: '🌹', color: '#ff66bb' },
    presence: { label: '👑', color: '#ffaa00' },
    desire:   { label: '🔥', color: '#ff3388' },
    wit:      { label: '🧠', color: '#aa44ff' },
    aura:     { label: '⚡', color: '#4499ff' },
};

// ═══════════════════════════════════════════
// 기본 설정
// ═══════════════════════════════════════════
const defaultSettings = {
    records: [],
    selectedProfileName: null,
    maxTokens: 4000,
    theme: 'dark',
};

// ═══════════════════════════════════════════
// 상태
// ═══════════════════════════════════════════
let state = {
    isPanelOpen:     false,
    isFlipped:       false,       // 코어 flip (설정 뷰)
    selectedFighters: [],
    conditionBubble: false,       // 조건 입력 버블 표시 중
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

// ═══════════════════════════════════════════
// Scouter roster 읽기
// ═══════════════════════════════════════════
function getRoster() {
    return SillyTavern.getContext().extensionSettings?.[SCOUTER_KEY]?.roster || [];
}

// ═══════════════════════════════════════════
// 아바타 URL
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

function avatarEl(name, gender, size=54) {
    const url = resolveAvatar(name);
    const hue = avatarHue(name);
    const gc  = gender==='female'?'#ff66bb':'#4499ff';
    const ini = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const base= `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:2.5px solid ${gc};flex-shrink:0;background:${C().nodeBg};display:flex;align-items:center;justify-content:center`;
    if (url) {
        return `<div style="${base}"><img src="${url}" style="width:100%;height:100%;object-fit:cover"
            onerror="this.parentElement.innerHTML='<span style=\\'font-size:${Math.round(size*.32)}px;font-weight:900;color:hsl(${hue},55%,65%);font-family:monospace\\'>${ini}</span>'"></div>`;
    }
    return `<div style="${base};font-size:${Math.round(size*.32)}px;font-weight:900;color:hsl(${hue},55%,65%);font-family:monospace">${ini}</div>`;
}

// ═══════════════════════════════════════════
// AI 호출
// ═══════════════════════════════════════════
async function callAI(userPrompt, systemPrompt) {
    const ctx  = SillyTavern.getContext();
    const s    = getSettings();
    const pName= s.selectedProfileName;

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
    return tpl.replace(/\{\{(\w+)\}\}/g,(_,k)=>vars[k]??'');
}

function buildCombatProfilePrompt(char) {
    const p   = char.parsed||{};
    const raw = p.raw||[p.appearance,p.personality,p.traits].filter(Boolean).join('\n');
    const stats = Object.entries(char.stats||{})
        .map(([k,v])=>`${k}=${v}`).join(' ');
    return fillTpl(COMBAT_PROFILE_USER, {
        name:     char.name,
        gender:   char.gender==='female'?'Female':'Male',
        age:      p.age||'Unknown',
        job:      p.job||'Unknown',
        location: p.location||'Unknown',
        stats,
        sheet:    raw.slice(0,1800),
    });
}

function buildCombatPrompt(fighters, profiles, condition) {
    const fightersBlock = fighters.map((f,i)=>{
        const pr  = profiles[i];
        const stats = Object.entries(f.stats||{}).map(([k,v])=>`    ${k}: ${v}`).join('\n');
        return `━━━ FIGHTER ${i+1}: ${f.name} ━━━
[Stats]
${stats}
  TOTAL: ${getTotal(f)}

[Combat Profile]
• Species/Entity:          ${pr.species||'—'}
• Physique:                ${pr.physique||'—'}
• Job (Combat):            ${pr.job_combat||'—'}
• Experience:              ${pr.experience||'—'}
• Skills:                  ${pr.skills||'—'}
• World Setting:           ${pr.worldsetting||'—'}
• Strengths:               ${pr.strengths||'—'}
• Weaknesses:              ${pr.weaknesses||'—'}
• Psychology:              ${pr.psychology||'—'}
• Background Factors:      ${pr.background_factors||'—'}
• Power Ceiling:           ${pr.power_ceiling||'—'}
• Anti-Synergy:            ${pr.anti_synergy||'—'}`;
    }).join('\n\n');

    return fillTpl(COMBAT_FINAL_USER, {
        condition:    condition||'기본 대결. 특별한 제약 없음.',
        fighterCount: fighters.length,
        fighters:     fightersBlock,
    });
}

// ═══════════════════════════════════════════
// 배틀 실행
// ═══════════════════════════════════════════
async function runBattle(condition) {
    const fighters = [...state.selectedFighters];
    showLoading('SCANNING FIGHTERS...');
    try {
        // 1단계: 파이터당 combatProfile
        const profiles = [];
        for (let i=0;i<fighters.length;i++) {
            const f = fighters[i];
            updateLoadingMsg(`PROFILING ${f.name.toUpperCase()}... (${i+1}/${fighters.length})`);
            try {
                const raw    = await callAI(buildCombatProfilePrompt(f), COMBAT_PROFILE_SYSTEM);
                const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
                profiles.push(parsed);
            } catch {
                const p = f.parsed||{};
                profiles.push({
                    species:'인간', physique:p.appearance||'—', job_combat:p.job||'—',
                    experience:'불명', skills:p.traits||'—', worldsetting:'현대 현실',
                    strengths:'—', weaknesses:'—', psychology:p.personality||'—',
                    background_factors:'—', power_ceiling:'—', anti_synergy:'—',
                });
            }
        }

        // 2단계: 통합 판정
        updateLoadingMsg('RUNNING SIMULATION...');
        const resultText = await callAI(buildCombatPrompt(fighters,profiles,condition), COMBAT_FINAL_SYSTEM);
        hideLoading();

        // 승자 파싱
        const wm     = resultText.match(/【최종 승자:\s*(.+?)\s*\(승률\s*(\d+)%\)】/);
        const winner  = wm?wm[1].trim():'???';
        const winRate = wm?parseInt(wm[2]):null;

        // 기록 저장
        const record = {
            id:`cr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            fighters: fighters.map(f=>({id:f.id,name:f.name,gender:f.gender,total:getTotal(f)})),
            profiles, condition:condition||'기본 대결',
            winner, winRate, resultText,
            createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g,'.'),
        };
        const s = getSettings();
        s.records.unshift(record);
        if (s.records.length>50) s.records.length=50;
        save();

        openResultPanel(record);
        renderMolecule();

        // 승자 노드 골드 링
        setTimeout(()=>{
            document.querySelectorAll('.cr-fighter-node').forEach(node=>{
                const idx = parseInt(node.dataset.idx);
                if (state.selectedFighters[idx]?.name===winner) {
                    const ring = node.querySelector('.cr-node-ring');
                    if (ring) { ring.style.borderColor=C().gold; ring.style.boxShadow=`0 0 20px ${C().gold}cc`; }
                }
            });
        },80);

    } catch(e) {
        hideLoading();
        toastr.error(`Battle failed: ${e.message}`);
    }
}

// ═══════════════════════════════════════════
// 로딩
// ═══════════════════════════════════════════
function showLoading(msg) {
    let el = document.getElementById('cr-loading');
    if (!el) {
        el=document.createElement('div');
        el.id='cr-loading';
        el.innerHTML=`
            <div style="position:relative;width:32px;height:32px;flex-shrink:0">
                <svg viewBox="0 0 60 60" style="width:32px;height:32px;animation:cr-spin 1.2s linear infinite">
                    <circle cx="30" cy="30" r="24" fill="none" stroke="${C().border}" stroke-width="4"/>
                    <circle cx="30" cy="30" r="24" fill="none" stroke="${C().accent}" stroke-width="4" stroke-dasharray="40 110" stroke-linecap="round"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px">⚔️</div>
            </div>
            <div style="flex:1">
                <div id="cr-loading-msg" style="font-size:11px;color:${C().accent};font-family:'Press Start 2P',monospace;letter-spacing:1px">${msg||LOADING_STEPS[0]}</div>
                <div style="display:flex;gap:4px;margin-top:6px">
                    <div class="cr-dot"></div><div class="cr-dot"></div><div class="cr-dot"></div>
                </div>
            </div>`;
        el.style.cssText=`position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:${C().bgPanel}f0;border:1px solid ${C().border};border-radius:30px;z-index:10010;display:flex;align-items:center;gap:14px;padding:12px 20px;backdrop-filter:blur(8px);box-shadow:0 4px 20px ${C().shadow};min-width:280px`;
        document.body.appendChild(el);
    }
    updateLoadingMsg(msg);
    return el;
}
function hideLoading() {
    const el=document.getElementById('cr-loading');
    if (!el) return;
    el.style.opacity='0'; el.style.transition='opacity 0.3s';
    setTimeout(()=>el.remove(),300);
}
function updateLoadingMsg(msg) {
    const m=document.getElementById('cr-loading-msg');
    if (!m||!msg) return;
    m.style.opacity='0';
    setTimeout(()=>{ if(m){ m.textContent=msg; m.style.opacity='1'; m.style.transition='opacity 0.3s'; }},200);
}

// ═══════════════════════════════════════════
// 결과 패널
// ═══════════════════════════════════════════
function openResultPanel(record) {
    document.getElementById('cr-result-panel')?.remove();
    const T = C();
    const panel = document.createElement('div');
    panel.id='cr-result-panel';
    panel.style.cssText=`position:fixed;top:60px;left:20px;width:min(520px,90vw);height:82vh;background:${T.resultBg};border:2px solid ${T.resultBorder};border-radius:12px;box-shadow:0 8px 40px ${T.shadow};z-index:10005;display:flex;flex-direction:column;resize:both;overflow:hidden;min-width:300px;min-height:300px`;

    const fighterNames = record.fighters.map(f=>f.name).join(' VS ');
    const wm     = record.resultText?.match(/【최종 승자:\s*(.+?)\s*\(승률\s*(\d+)%\)】/);
    const winner  = wm?wm[1].trim():record.winner||'???';
    const winRate = wm?wm[2]:record.winRate||'??';

    // 섹션 파싱
    let sectionsHtml = '';
    for (const sec of REPORT_SECTIONS) {
        const rx = new RegExp(`${sec.icon}[^\\n]*【${sec.key}】([\\s\\S]*?)(?=⚔️|🧮|⚖️|🏆|$)`,'u');
        const m  = (record.resultText||'').match(rx);
        const content = m?m[1].trim():'—';
        sectionsHtml += `
            <div style="margin-bottom:24px">
                <div style="font-family:'Press Start 2P',monospace;font-size:10px;color:${T.accent};letter-spacing:2px;border-bottom:1px solid ${T.border};padding-bottom:6px;margin-bottom:12px">${sec.icon} ${sec.key}</div>
                <div style="color:${T.text};font-size:14px;line-height:2;white-space:pre-wrap;word-break:break-word">${esc(content)}</div>
            </div>`;
    }

    panel.innerHTML=`
        <div id="cr-result-drag" style="background:${T.bgCard};border-bottom:1px solid ${T.border};padding:12px 16px;display:flex;align-items:center;gap:10px;cursor:move;flex-shrink:0;user-select:none;border-radius:10px 10px 0 0">
            <span style="font-size:18px">📜</span>
            <div style="flex:1;font-family:'Press Start 2P',monospace;font-size:9px;color:${T.accent};letter-spacing:2px">BATTLE REPORT</div>
            <button id="cr-result-close" style="background:none;border:1px solid ${T.border};border-radius:20px;color:${T.textDim};cursor:pointer;font-size:12px;padding:3px 10px;font-family:monospace;transition:all 0.2s">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px 22px;font-family:'Noto Serif KR','Apple SD Gothic Neo',system-ui,sans-serif">
            <div style="font-family:'Press Start 2P',monospace;font-size:8px;color:${T.textDim};margin-bottom:16px;letter-spacing:1px;line-height:2">${esc(fighterNames)}<br><span style="font-size:7px">${esc((record.condition||'').slice(0,60))}</span></div>
            <div style="font-family:'Press Start 2P',monospace;font-size:11px;color:${T.gold};text-align:center;padding:16px;border:2px solid ${T.gold}66;border-radius:8px;background:${T.bgCard};letter-spacing:2px;margin-bottom:24px;animation:cr-winner-glow 2s ease-in-out infinite">
                🏆 WINNER: ${esc(winner)} (${winRate}%)
            </div>
            ${sectionsHtml}
        </div>
        <div id="cr-result-resize" style="position:absolute;bottom:0;right:0;width:22px;height:22px;cursor:se-resize;display:flex;align-items:flex-end;justify-content:flex-end;padding:4px;opacity:0.4;font-size:13px;user-select:none;color:${T.border}">⇲</div>`;

    document.body.appendChild(panel);
    makeDraggable(panel,document.getElementById('cr-result-drag'));
    makeResizable(panel,document.getElementById('cr-result-resize'));
    document.getElementById('cr-result-close')?.addEventListener('click',()=>panel.remove());
}

// ═══════════════════════════════════════════
// 상황 입력 버블 (조건 입력)
// — 메인 패널 안 하단에서 위로 올라오는 버블
// ═══════════════════════════════════════════
function showConditionBubble() {
    document.getElementById('cr-cond-bubble')?.remove();
    state.conditionBubble = true;
    const T = C();

    const bubble = document.createElement('div');
    bubble.id='cr-cond-bubble';
    bubble.style.cssText=`position:absolute;bottom:0;left:0;right:0;background:${T.bgPanel};border-top:2px solid ${T.border};border-radius:0 0 12px 12px;padding:16px;z-index:20;animation:cr-slide-up 0.25s ease-out`;

    const chips = CONDITION_CHIPS.map(c=>`<span class="cr-chip" data-v="${esc(c)}"
        style="display:inline-block;font-size:11px;padding:5px 10px;background:${T.bgCard};border:1px solid ${T.border};border-radius:20px;color:${T.text};cursor:pointer;margin:3px;transition:all 0.15s">${esc(c)}</span>`).join('');

    bubble.innerHTML=`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="font-family:'Press Start 2P',monospace;font-size:9px;color:${T.accent};letter-spacing:1px">⚔️ BATTLE CONDITION</span>
            <button id="cr-cond-close" style="background:none;border:none;cursor:pointer;color:${T.textDim};font-size:14px;margin-left:auto;line-height:1">✕</button>
        </div>
        <div style="margin-bottom:10px;line-height:2">${chips}</div>
        <textarea id="cr-cond-ta" rows="3" placeholder="직접 입력 (비워두면 기본 대결)&#10;예: 좁은 골목 야간 칼싸움. 양쪽 단도 1자루."
            style="width:100%;background:${T.bgCard};border:1px solid ${T.border};border-radius:8px;padding:10px;color:${T.text};font-size:13px;font-family:system-ui;line-height:1.7;resize:vertical;outline:none;box-sizing:border-box"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px">
            <button id="cr-cond-cancel" style="flex:1;padding:10px;background:none;border:1px solid ${T.border};border-radius:20px;color:${T.textDim};cursor:pointer;font-size:12px;font-family:system-ui">취소</button>
            <button id="cr-cond-go" style="flex:2;padding:10px;background:${T.accent};border:none;border-radius:20px;color:#fff;cursor:pointer;font-family:'Press Start 2P',monospace;font-size:9px;letter-spacing:1px;box-shadow:0 4px 12px ${T.shadow}">⚔️ FIGHT!</button>
        </div>`;

    const panel = document.getElementById('cr-panel');
    if (panel) { panel.style.position='relative'; panel.appendChild(bubble); }
    else document.body.appendChild(bubble);

    bubble.querySelectorAll('.cr-chip').forEach(chip=>{
        chip.addEventListener('mouseenter',()=>{ chip.style.borderColor=T.accent; chip.style.color=T.accent; });
        chip.addEventListener('mouseleave',()=>{ chip.style.borderColor=T.border; chip.style.color=T.text; });
        chip.addEventListener('click',()=>{
            const ta=document.getElementById('cr-cond-ta');
            if (ta) ta.value=ta.value?ta.value+', '+chip.dataset.v:chip.dataset.v;
        });
    });

    const close=()=>{ bubble.remove(); state.conditionBubble=false; };
    document.getElementById('cr-cond-close')?.addEventListener('click',close);
    document.getElementById('cr-cond-cancel')?.addEventListener('click',close);
    document.getElementById('cr-cond-go')?.addEventListener('click',async()=>{
        const cond=document.getElementById('cr-cond-ta')?.value.trim()||'';
        close();
        await runBattle(cond);
    });
}

// ═══════════════════════════════════════════
// 분자 구조 렌더
// 중앙 코어 + 위성 노드 (파이터 선택 + 빈 슬롯)
// ═══════════════════════════════════════════
function renderMolecule() {
    const content = document.getElementById('cr-molecule');
    if (!content) return;
    const T       = C();
    const roster  = getRoster();
    const fighters= state.selectedFighters;

    // 파이터 노드 렌더 (선택된 것)
    const fighterNodes = fighters.map((f,i)=>{
        const url   = resolveAvatar(f.name);
        const hue   = avatarHue(f.name);
        const gc    = f.gender==='female'?'#ff66bb':'#4499ff';
        const ini   = f.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
        const inner = url
            ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
            : `<div style="font-size:18px;font-weight:900;color:hsl(${hue},55%,65%);font-family:monospace">${ini}</div>`;
        return `<div class="cr-fighter-node cr-satellite" data-idx="${i}" data-id="${f.id}"
            style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
            <div class="cr-node-ring" style="width:62px;height:62px;border-radius:50%;border:2.5px solid ${gc};overflow:hidden;background:${T.nodeBg};display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px ${gc}55;transition:all 0.2s">
                ${inner}
            </div>
            <div style="font-size:10px;color:${T.accent};font-family:'Press Start 2P',monospace;letter-spacing:0.5px;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">${esc(f.name)}</div>
            <div style="font-size:9px;color:${T.textDim};font-family:'Press Start 2P',monospace">${getTotal(f)}</div>
        </div>`;
    }).join('');

    // 빈 슬롯 (최대 2개 표시, 로스터에서 미선택)
    const unselected = roster.filter(c=>!fighters.find(f=>f.id===c.id));
    const emptySlots = unselected.slice(0,2).map(c=>`
        <div class="cr-empty-node cr-satellite" data-id="${c.id}"
            style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;opacity:0.5">
            <div style="width:44px;height:44px;border-radius:50%;border:2px dashed ${T.border};background:${T.nodeBg};display:flex;align-items:center;justify-content:center;font-size:18px;transition:all 0.2s">➕</div>
            <div style="font-size:9px;color:${T.textDim};max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">${esc(c.name)}</div>
        </div>`).join('');

    const canFight = fighters.length >= 2;

    content.innerHTML = `
        <!-- 분자 구조 뷰 -->
        <div class="cr-molecule-view" style="display:flex;flex-direction:column;align-items:center;padding:20px 16px 10px">

            <!-- 위쪽 위성들 (파이터) -->
            <div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;min-height:90px;align-items:flex-end;margin-bottom:16px">
                ${fighterNodes || `<div style="color:${T.textDim};font-size:11px;font-family:system-ui;align-self:center">파이터를 선택하세요</div>`}
            </div>

            <!-- 연결선 (SVG) -->
            ${fighters.length>=2?`
            <div style="width:100%;height:20px;position:relative;margin-bottom:-4px">
                <svg width="100%" height="20" style="overflow:visible">
                    <line x1="30%" y1="10" x2="70%" y2="10" stroke="${T.border}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.6"/>
                    <circle cx="30%" cy="10" r="3" fill="${T.accent}" opacity="0.7"/>
                    <circle cx="70%" cy="10" r="3" fill="${T.accent}" opacity="0.7"/>
                </svg>
            </div>`:''}

            <!-- 중앙 코어 (flip 컨테이너) -->
            <div id="cr-core-container" style="perspective:800px;margin:8px 0;flex-shrink:0">
                <div id="cr-core-flipper" style="width:110px;height:110px;position:relative;transform-style:preserve-3d;transition:transform 0.6s cubic-bezier(0.4,0,0.2,1);${state.isFlipped?'transform:rotateY(180deg)':''}">

                    <!-- 앞면: 아레나 코어 -->
                    <div id="cr-core-front" style="position:absolute;inset:0;backface-visibility:hidden;border-radius:50%;background:radial-gradient(circle at 40% 35%,${T.coreBg},${T.bg});border:3px solid ${T.borderBright};box-shadow:0 0 20px ${T.shadow},inset 0 0 30px ${T.bg};display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:4px">
                        <div style="font-size:26px;filter:drop-shadow(0 0 8px ${T.accent}88)">⚔️</div>
                        <div style="font-family:'Press Start 2P',monospace;font-size:7px;color:${T.accent};letter-spacing:1px;text-align:center">챗틀로얄</div>
                        <div style="font-size:8px;color:${T.textDim}">⚙️ 설정</div>
                    </div>

                    <!-- 뒷면: 설정 -->
                    <div id="cr-core-back" style="position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(180deg);border-radius:50%;background:radial-gradient(circle at 40% 35%,${T.coreBg},${T.bg});border:3px solid ${T.accent};box-shadow:0 0 20px ${T.shadow};display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:3px">
                        <div style="font-size:22px">⚙️</div>
                        <div style="font-family:'Press Start 2P',monospace;font-size:6px;color:${T.accent};letter-spacing:1px">SETTINGS</div>
                        <div style="font-size:8px;color:${T.textDim}">← 뒤로</div>
                    </div>
                </div>
            </div>

            <!-- 아래쪽: 빈 슬롯 + FIGHT 버튼 -->
            <div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;min-height:70px;align-items:flex-start;margin-top:16px">
                ${emptySlots}
            </div>

            <!-- FIGHT 버튼 (2명 이상 선택 시) -->
            ${canFight?`
            <button id="cr-fight-btn" style="margin-top:16px;padding:13px 32px;background:${T.accent};border:none;border-radius:30px;color:#fff;font-family:'Press Start 2P',monospace;font-size:11px;letter-spacing:2px;cursor:pointer;box-shadow:0 4px 16px ${T.shadow};transition:all 0.2s;animation:cr-pulse-btn 2s ease-in-out infinite">
                ⚔️ FIGHT (${fighters.length})
            </button>`:`
            <div style="margin-top:14px;font-size:11px;color:${T.textDim};font-family:system-ui;text-align:center">
                ${fighters.length===0?'파이터 2명 이상 선택':'파이터 1명 더 선택'}
            </div>`}

            <!-- 전체 로스터 버튼 -->
            <button id="cr-roster-toggle" style="margin-top:10px;padding:7px 18px;background:none;border:1px solid ${T.border};border-radius:20px;color:${T.textDim};cursor:pointer;font-size:11px;font-family:system-ui;transition:all 0.2s">
                📋 로스터 전체보기 (${roster.length})
            </button>
        </div>

        <!-- 설정 패널 (flip 뒷면 확장) -->
        <div id="cr-settings-panel" style="display:${state.isFlipped?'block':'none'};padding:16px;border-top:1px solid ${T.border}">
            ${renderSettingsContent()}
        </div>

        <!-- 기록 섹션 -->
        <div id="cr-records-section" style="padding:0 16px 16px">
            ${renderRecordsContent()}
        </div>`;

    // 로스터 전체 목록 (토글)
    const rosterFull = document.createElement('div');
    rosterFull.id='cr-roster-full';
    rosterFull.style.cssText=`display:none;padding:0 16px 12px`;
    rosterFull.innerHTML = renderRosterList();
    content.appendChild(rosterFull);

    // 이벤트: 코어 flip
    document.getElementById('cr-core-container')?.addEventListener('click',()=>{
        state.isFlipped = !state.isFlipped;
        const flipper = document.getElementById('cr-core-flipper');
        if (flipper) flipper.style.transform = state.isFlipped?'rotateY(180deg)':'rotateY(0deg)';
        const settingsPanel = document.getElementById('cr-settings-panel');
        if (settingsPanel) settingsPanel.style.display = state.isFlipped?'block':'none';
    });

    // 이벤트: 파이터 노드 클릭 (선택 해제)
    content.querySelectorAll('.cr-fighter-node').forEach(node=>{
        node.addEventListener('click',()=>{
            const id = node.dataset.id;
            state.selectedFighters = state.selectedFighters.filter(f=>f.id!==id);
            renderMolecule();
        });
    });

    // 이벤트: 빈 슬롯 클릭 (선택)
    content.querySelectorAll('.cr-empty-node').forEach(node=>{
        node.addEventListener('click',()=>{
            const char = getRoster().find(c=>c.id===node.dataset.id);
            if (char && !state.selectedFighters.find(f=>f.id===char.id))
                state.selectedFighters.push(char);
            renderMolecule();
        });
    });

    // 이벤트: FIGHT 버튼
    document.getElementById('cr-fight-btn')?.addEventListener('click',()=>{
        if (state.selectedFighters.length<2) return;
        showConditionBubble();
    });

    // 이벤트: 로스터 전체보기
    document.getElementById('cr-roster-toggle')?.addEventListener('click',()=>{
        const rf = document.getElementById('cr-roster-full');
        if (!rf) return;
        const shown = rf.style.display==='block';
        rf.style.display = shown?'none':'block';
        const btn = document.getElementById('cr-roster-toggle');
        if (btn) btn.textContent = shown?`📋 로스터 전체보기 (${roster.length})`:'📋 로스터 접기';
        if (!shown) rf.innerHTML = renderRosterList();
    });

    // 설정 이벤트
    bindSettingsEvents();
}

// ═══════════════════════════════════════════
// 로스터 카드 목록
// ═══════════════════════════════════════════
function renderRosterList() {
    const T       = C();
    const roster  = getRoster();
    const fighters= state.selectedFighters;

    if (!roster.length)
        return `<div style="text-align:center;padding:20px;color:${T.textDim};font-size:12px;font-family:system-ui">챗씨부인에서 캐릭터를 먼저 등록하세요</div>`;

    return roster.map(char=>{
        const sel = !!fighters.find(f=>f.id===char.id);
        const hue = avatarHue(char.name);
        const gc  = char.gender==='female'?'#ff66bb':'#4499ff';
        const ini = char.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
        const url = resolveAvatar(char.name);
        const avInner = url
            ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
            : ini;
        const statBars = Object.entries(char.stats||{}).map(([k,v])=>`
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                <div style="font-size:11px;width:16px;flex-shrink:0">${STAT_META[k]?.label||k}</div>
                <div style="flex:1;height:5px;background:${T.bgPanel};border-radius:3px;overflow:hidden">
                    <div style="width:${v}%;height:100%;background:${STAT_META[k]?.color||T.accent};border-radius:3px;transition:width 0.5s"></div>
                </div>
                <div style="font-size:10px;width:22px;text-align:right;color:${T.accent};flex-shrink:0;font-weight:700">${v}</div>
            </div>`).join('');

        return `<div class="cr-roster-card" data-id="${char.id}"
            style="background:${sel?T.bgCard:T.bgPanel};border:1.5px solid ${sel?T.accent:T.border};border-radius:10px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:8px;transition:all 0.15s;${sel?`box-shadow:0 0 10px ${T.accent}33`:'' }">
            <div style="width:42px;height:42px;border-radius:50%;overflow:hidden;border:2px solid ${gc};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;background:${T.nodeBg};color:hsl(${hue},55%,65%);font-family:monospace">${avInner}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:${sel?T.textBright:T.text};margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(char.name)}</div>
                ${statBars}
            </div>
            <div style="text-align:right;flex-shrink:0">
                <div style="font-size:16px;font-weight:900;color:${sel?T.accent:T.textDim};font-family:'Press Start 2P',monospace">${getTotal(char)}</div>
                ${sel?`<div style="font-size:9px;color:${T.accent};margin-top:4px;letter-spacing:1px">✓ 선택됨</div>`:''}
            </div>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════
// 설정 내용
// ═══════════════════════════════════════════
function renderSettingsContent() {
    const T = C();
    const ctx = SillyTavern.getContext();
    const s   = getSettings();
    const profiles = ctx.extensionSettings?.['connectionManager']?.profiles||[];
    const saved    = s.selectedProfileName||'';
    const profOpts = [`<option value="">현재 연결 그대로</option>`,
        ...profiles.map(p=>`<option value="${esc(p.name)}" ${p.name===saved?'selected':''}>${esc(p.name)}</option>`)
    ].join('');

    return `
        <div style="font-family:'Press Start 2P',monospace;font-size:8px;color:${T.accent};letter-spacing:2px;margin-bottom:14px">⚙️ SETTINGS</div>
        <div style="margin-bottom:12px">
            <div style="font-size:11px;color:${T.textDim};margin-bottom:6px;font-family:system-ui">Connection Profile</div>
            <select id="cr-prof-sel" style="width:100%;background:${T.bgCard};border:1px solid ${T.border};border-radius:8px;color:${T.text};font-size:12px;padding:8px 10px;font-family:system-ui;outline:none">
                ${profOpts}
            </select>
        </div>
        <div style="margin-bottom:12px">
            <div style="font-size:11px;color:${T.textDim};margin-bottom:6px;font-family:system-ui">Max Tokens</div>
            <input id="cr-tok" type="number" min="500" max="16000" step="500" value="${s.maxTokens||4000}"
                style="width:100%;background:${T.bgCard};border:1px solid ${T.border};border-radius:8px;color:${T.text};font-size:12px;padding:8px 10px;font-family:system-ui;outline:none;box-sizing:border-box">
        </div>
        <div style="font-size:10px;color:${T.textDim};line-height:1.8;margin-bottom:12px;font-family:system-ui">※ 배틀 = 파이터수 × 프로파일 호출 + 최종 1회</div>
        <button id="cr-clear-recs" style="width:100%;background:none;border:1px solid ${T.border};border-radius:8px;padding:9px;cursor:pointer;color:${T.textDim};font-size:11px;font-family:system-ui;transition:all 0.2s">🗑 기록 전체 삭제</button>`;
}

function bindSettingsEvents() {
    document.getElementById('cr-prof-sel')?.addEventListener('change',e=>{
        const s=getSettings(); s.selectedProfileName=e.target.value||null; save();
        toastr.success(e.target.value?`Profile: "${e.target.value}"`:'현재 연결 사용');
    });
    document.getElementById('cr-tok')?.addEventListener('change',e=>{
        const s=getSettings(); s.maxTokens=parseInt(e.target.value)||4000; save();
    });
    document.getElementById('cr-clear-recs')?.addEventListener('click',async()=>{
        const {Popup,POPUP_RESULT}=SillyTavern.getContext();
        const ok=await Popup.show.confirm('기록 삭제','배틀 기록을 전부 삭제할까요?');
        if (ok===POPUP_RESULT.AFFIRMATIVE) {
            const s=getSettings(); s.records=[]; save();
            toastr.success('기록 삭제됨'); renderMolecule();
        }
    });

    // 로스터 카드 클릭 (목록 표시 중일 때)
    document.querySelectorAll('.cr-roster-card').forEach(card=>{
        card.addEventListener('click',()=>{
            const id   = card.dataset.id;
            const char = getRoster().find(c=>c.id===id);
            if (!char) return;
            const idx  = state.selectedFighters.findIndex(f=>f.id===id);
            if (idx>=0) state.selectedFighters.splice(idx,1);
            else state.selectedFighters.push(char);
            renderMolecule();
            // 로스터 다시 열기
            const rf = document.getElementById('cr-roster-full');
            if (rf?.style.display==='block') rf.innerHTML=renderRosterList();
        });
    });
}

// ═══════════════════════════════════════════
// 기록 섹션
// ═══════════════════════════════════════════
function renderRecordsContent() {
    const T       = C();
    const records = getSettings().records;
    if (!records.length) return '';

    const cards = records.slice(0,5).map(r=>`
        <div class="cr-rec" data-id="${r.id}"
            style="background:${T.bgCard};border:1px solid ${T.border};border-left:3px solid ${T.accent};border-radius:8px;padding:10px 12px;cursor:pointer;margin-bottom:6px;transition:all 0.15s;display:flex;align-items:center;gap:8px">
            <div style="flex:1;min-width:0">
                <div style="font-size:11px;color:${T.gold};font-family:'Press Start 2P',monospace;letter-spacing:0.5px;margin-bottom:3px">🏆 ${esc(r.winner)}${r.winRate?` (${r.winRate}%)`:''}
                </div>
                <div style="font-size:11px;color:${T.textDim}">${esc(r.fighters.map(f=>f.name).join(' VS '))}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <div style="font-size:10px;color:${T.textDim}">${esc(r.createdAt||'')}</div>
                <button class="cr-del-rec" data-id="${r.id}" style="margin-top:4px;background:none;border:1px solid ${T.border};border-radius:12px;padding:2px 8px;cursor:pointer;color:${T.textDim};font-size:11px">🗑</button>
            </div>
        </div>`).join('');

    return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div style="flex:1;height:1px;background:linear-gradient(90deg,${T.accent}44,transparent)"></div>
            <div style="font-size:9px;color:${T.borderBright};letter-spacing:2px;font-family:'Press Start 2P',monospace">RECENT BATTLES</div>
            <div style="flex:1;height:1px;background:linear-gradient(270deg,${T.accent}44,transparent)"></div>
        </div>
        ${cards}`;
}

// ═══════════════════════════════════════════
// 메인 패널 열기/닫기
// ═══════════════════════════════════════════
function openPanel() {
    if (document.getElementById('cr-panel')) return;
    const T = C();

    const panel = document.createElement('div');
    panel.id='cr-panel';
    panel.style.cssText=`position:fixed;top:60px;right:20px;width:min(420px,95vw);max-height:88vh;background:${T.bgPanel};border:2px solid ${T.borderBright};border-radius:14px;box-shadow:0 8px 40px ${T.shadow};z-index:9998;display:flex;flex-direction:column;overflow:hidden;min-width:320px;min-height:300px`;

    panel.innerHTML=`
        <!-- 드래그 헤더 -->
        <div id="cr-drag" style="background:${T.bgCard};border-bottom:1px solid ${T.border};padding:12px 16px;display:flex;align-items:center;gap:10px;cursor:move;flex-shrink:0;user-select:none;border-radius:12px 12px 0 0">
            <span style="font-size:18px;filter:drop-shadow(0 0 6px ${T.accent}88)">⚔️</span>
            <div style="flex:1">
                <div style="font-size:13px;font-weight:900;letter-spacing:2px;background:linear-gradient(90deg,${T.accent},${T.gold},${T.accent});background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:cr-shimmer 2.5s linear infinite;font-family:'Press Start 2P',monospace">챗틀로얄</div>
                <div style="font-size:9px;color:${T.textDim};letter-spacing:1px;margin-top:2px;font-family:'Press Start 2P',monospace">COLOSSEUM v2.0</div>
            </div>
            <!-- 테마 토글 -->
            <button id="cr-theme-btn" title="테마 전환" style="background:none;border:1px solid ${T.border};border-radius:20px;cursor:pointer;font-size:14px;padding:4px 10px;color:${T.textDim};transition:all 0.2s">${currentTheme==='dark'?'☀️':'🌙'}</button>
            <button id="cr-close" style="background:none;border:1px solid ${T.border};border-radius:20px;color:${T.textDim};cursor:pointer;font-size:13px;padding:4px 10px;font-family:monospace;transition:all 0.2s">✕</button>
        </div>
        <!-- 분자 뷰 + 스크롤 -->
        <div id="cr-molecule" style="flex:1;overflow-y:auto;overflow-x:hidden;position:relative;border-radius:0 0 12px 12px">
        </div>
        <!-- 리사이즈 핸들 -->
        <div id="cr-resize" style="position:absolute;bottom:0;right:0;width:24px;height:24px;cursor:se-resize;display:flex;align-items:flex-end;justify-content:flex-end;padding:4px;opacity:0.35;font-size:15px;user-select:none;color:${T.border}">⇲</div>`;

    document.body.appendChild(panel);
    makeDraggable(panel, document.getElementById('cr-drag'));
    makeResizable(panel, document.getElementById('cr-resize'));

    document.getElementById('cr-close')?.addEventListener('click', closePanel);
    document.getElementById('cr-theme-btn')?.addEventListener('click', toggleTheme);

    state.isPanelOpen=true;
    renderMolecule();

    // 기록 이벤트 위임
    panel.addEventListener('click', e=>{
        const rec = e.target.closest('.cr-rec');
        const del = e.target.closest('.cr-del-rec');
        if (del) {
            e.stopPropagation();
            const s=getSettings(); s.records=s.records.filter(r=>r.id!==del.dataset.id); save();
            renderMolecule(); return;
        }
        if (rec) {
            const r=getSettings().records.find(r=>r.id===rec.dataset.id);
            if (r) openResultPanel(r);
        }
    });
}

function closePanel() {
    document.getElementById('cr-panel')?.remove();
    state.isPanelOpen=false;
}
function togglePanel() {
    document.getElementById('cr-panel')?closePanel():openPanel();
}

// ═══════════════════════════════════════════
// 테마 토글
// ═══════════════════════════════════════════
function toggleTheme() {
    currentTheme = currentTheme==='dark'?'light':'dark';
    const s=getSettings(); s.theme=currentTheme; save();
    // 패널 재빌드
    closePanel(); openPanel();
}

// ═══════════════════════════════════════════
// 드래그 / 리사이즈
// ═══════════════════════════════════════════
function makeDraggable(panel, handle) {
    let drag=false,sx,sy,sl,st;
    const go=(cx,cy)=>{ drag=true; sx=cx; sy=cy; const r=panel.getBoundingClientRect(); sl=r.left; st=r.top; panel.style.right='auto'; document.body.style.userSelect='none'; };
    const mv=(cx,cy)=>{ if(!drag)return; const vw=window.innerWidth,vh=window.innerHeight; panel.style.left=Math.max(0,Math.min(vw-panel.offsetWidth,sl+cx-sx))+'px'; panel.style.top=Math.max(0,Math.min(vh-60,st+cy-sy))+'px'; };
    const up=()=>{ drag=false; document.body.style.userSelect=''; };
    handle.addEventListener('mousedown',e=>{ if(e.target.closest('button')) return; go(e.clientX,e.clientY); });
    document.addEventListener('mousemove',e=>mv(e.clientX,e.clientY));
    document.addEventListener('mouseup',up);
    handle.addEventListener('touchstart',e=>{ if(e.target.closest('button')) return; const t=e.touches[0]; go(t.clientX,t.clientY); e.preventDefault(); },{passive:false});
    document.addEventListener('touchmove',e=>{ if(!drag)return; mv(e.touches[0].clientX,e.touches[0].clientY); e.preventDefault(); },{passive:false});
    document.addEventListener('touchend',up);
}

function makeResizable(panel, handle) {
    let r=false,rx,ry,rw,rh;
    handle.addEventListener('mousedown',e=>{ r=true; rx=e.clientX; ry=e.clientY; rw=panel.offsetWidth; rh=panel.offsetHeight; document.body.style.userSelect='none'; e.preventDefault(); });
    document.addEventListener('mousemove',e=>{ if(!r)return; panel.style.width=Math.max(320,rw+e.clientX-rx)+'px'; panel.style.height=Math.max(300,rh+e.clientY-ry)+'px'; });
    document.addEventListener('mouseup',()=>{ r=false; document.body.style.userSelect=''; });
}

// ═══════════════════════════════════════════
// CSS 인젝션
// ═══════════════════════════════════════════
function injectCSS() {
    if (document.getElementById('cr-style')) return;
    const s=document.createElement('style');
    s.id='cr-style';
    s.textContent=`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes cr-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes cr-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes cr-winner-glow{0%,100%{box-shadow:0 0 10px rgba(255,200,0,0.3)}50%{box-shadow:0 0 25px rgba(255,200,0,0.7)}}
        @keyframes cr-pulse-ring{0%,100%{opacity:0.35}50%{opacity:0.9}}
        @keyframes cr-dot{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1.1);opacity:1}}
        @keyframes cr-slide-up{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes cr-pulse-btn{0%,100%{box-shadow:0 4px 16px rgba(200,100,0,0.3)}50%{box-shadow:0 4px 24px rgba(200,100,0,0.6)}}
        .cr-dot{width:6px;height:6px;border-radius:50%;background:#ff9900;display:inline-block;animation:cr-dot 1.2s ease-in-out infinite}
        .cr-dot:nth-child(2){animation-delay:0.2s}.cr-dot:nth-child(3){animation-delay:0.4s}
        .cr-satellite{transition:transform 0.2s}.cr-satellite:hover{transform:scale(1.08)}
        .cr-fighter-node .cr-node-ring:hover{box-shadow:0 0 16px rgba(255,100,0,0.6)!important}
        #cr-molecule::-webkit-scrollbar{width:4px}
        #cr-molecule::-webkit-scrollbar-track{background:transparent}
        #cr-molecule::-webkit-scrollbar-thumb{border-radius:4px;background:rgba(150,100,50,0.4)}
        #cr-result-panel > div:nth-child(2)::-webkit-scrollbar{width:5px}
        #cr-result-panel > div:nth-child(2)::-webkit-scrollbar-track{background:transparent}
        #cr-result-panel > div:nth-child(2)::-webkit-scrollbar-thumb{border-radius:4px;background:rgba(150,100,50,0.4)}
    `;
    document.head.appendChild(s);
}

// ═══════════════════════════════════════════
// 초기화
// ═══════════════════════════════════════════
export async function onActivate() {
    console.log(`[${MODULE_NAME}] activate`);
    injectCSS();

    // 저장된 테마 복원
    const s = getSettings();
    currentTheme = s.theme || 'dark';

    // 확장 설정 패널
    const ctx = SillyTavern.getContext();
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
                    <div style="font-size:0.76rem;color:var(--SmartThemeQuoteColor,#aaa)">챗씨부인(Scouter)에 캐릭터가 등록되어 있어야 합니다</div>
                </div>
            </div>
        </div>`;
        const t=document.getElementById('extensions_settings2')??document.getElementById('extensions_settings');
        t?.insertAdjacentHTML('beforeend',html);
        document.getElementById('cr-ext-prof')?.addEventListener('change',e=>{
            const s2=getSettings(); s2.selectedProfileName=e.target.value||null; save();
            toastr.success(e.target.value?`챗틀로얄 profile: "${e.target.value}"`:'현재 연결 사용');
        });
    }

    // 툴바 버튼
    if (!document.getElementById('cr-wand-btn')) {
        const btn=`<div id="cr-wand-btn" title="챗틀로얄" style="cursor:pointer;padding:4px 8px;display:flex;align-items:center;gap:5px;font-size:13px">
            <span>⚔️</span><span style="font-size:12px">챗틀로얄</span>
        </div>`;
        const tb=document.getElementById('extensionsMenu')??document.getElementById('top-bar');
        tb?.insertAdjacentHTML('beforeend',btn);
        document.getElementById('cr-wand-btn')?.addEventListener('click',togglePanel);
    }

    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&state.isPanelOpen) closePanel(); });
    console.log(`[${MODULE_NAME}] ready`);
}

jQuery(async()=>{
    const ctx=SillyTavern.getContext();
    ctx.eventSource.on(event_types.APP_READY,async()=>{ await onActivate(); });
});
