/**
 * ⚔️ 챗틀로얄 v1.0
 * SillyTavern Extension
 * Scouter (character_lab) roster 읽기 전용
 * combatProfile(파이터당) → combat(통합판정) 2단계 호출
 */

import { event_types } from '../../../events.js';

const MODULE_NAME = 'chatl_royal';
const SCOUTER_KEY = 'character_lab';

// ─── 테마 ──────────────────────────────────
const THEMES = {
    dark: {
        bg: '#060400', bgCard: '#0d0600', bgDeep: '#030200',
        border: '#442200', borderBright: '#884400',
        text: '#cc9966', textDim: '#664422', textBright: '#ffcc88',
        accent: '#ff8800', gold: '#ffaa00',
        resultBg: '#050300', resultBorder: '#664400',
        tabInactive: '#442200',
    },
    light: {
        bg: '#f8f7ff', bgCard: '#ffffff', bgDeep: '#f0eeff',
        border: '#c8b8ee', borderBright: '#8855cc',
        text: '#3d2070', textDim: '#9988bb', textBright: '#220055',
        accent: '#7733cc', gold: '#5511aa',
        resultBg: '#fdfcff', resultBorder: '#c8b8ee',
        tabInactive: '#aa99cc',
    },
};
let _theme = 'dark';
function C() { return THEMES[_theme]; }
function saveTheme(t) { _theme = t; const s=getSettings(); s.theme=t; save(); }

const STAT_META = {
    charm:    { label: '🌹', color: '#ff44aa' },
    presence: { label: '👑', color: '#ffaa00' },
    desire:   { label: '🔥', color: '#ff1177' },
    wit:      { label: '🧠', color: '#9900ff' },
    aura:     { label: '⚡', color: '#4488ff' },
};

// ─── 기본 설정 ─────────────────────────────
const defaultSettings = {
    records: [],
    selectedProfileName: null,
    maxTokens: 4000,
    theme: 'dark',
};

// ─── 상태 ──────────────────────────────────
let state = {
    isPanelOpen: false,
    currentTab: 'arena',
    selectedFighters: [],
};

// ─── 유틸 ──────────────────────────────────
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
    return String(s || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getTotal(c) { return Object.values(c.stats || {}).reduce((a,b)=>a+b,0); }
function avatarHue(n) { return [...n].reduce((a,c)=>a+c.charCodeAt(0),0)%360; }
function filterPhoneTrigger(t) {
    return (t||'').replace(/<phone_trigger[^>]*>[\s\S]*?<\/phone_trigger>/gi,'').trim();
}

// ─── Scouter roster 읽기 ───────────────────
function getRoster() {
    const ctx = SillyTavern.getContext();
    return ctx.extensionSettings?.[SCOUTER_KEY]?.roster || [];
}

// ─── 아바타 URL 해결 ────────────────────────
function resolveAvatarUrl(charName) {
    const ctx = SillyTavern.getContext();
    const stChar = (ctx.characters || []).find(c => c.name === charName);
    if (stChar?.avatar)
        return `/thumbnail?type=avatar&file=${encodeURIComponent(stChar.avatar)}`;
    const personas = ctx.powerUserSettings?.personas || {};
    const pe = Object.entries(personas).find(([,name]) => name === charName);
    if (pe)
        return `/thumbnail?type=persona&file=${encodeURIComponent(pe[0])}`;
    return null;
}

// ─── 아바타 HTML ────────────────────────────
function avatarHTML(name, gender, size=54, extraStyle='') {
    const url = resolveAvatarUrl(name);
    const hue = avatarHue(name);
    const gc  = gender==='female'?'#ff44aa':'#4488ff';
    const ini = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const fallback = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:${Math.round(size*.33)}px;font-weight:900;color:hsl(${hue},50%,70%);font-family:monospace">${ini}</div>`;
    const base = `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:2px solid ${gc};flex-shrink:0;background:#0d0600;${extraStyle}`;
    if (url)
        return `<div style="${base}"><img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='${fallback.replace(/'/g,"\\'")}'"></div>`;
    return `<div style="${base};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.33)}px;font-weight:900;color:hsl(${hue},50%,70%);font-family:monospace">${ini}</div>`;
}

// ═══════════════════════════════════════════
// AI 호출
// ═══════════════════════════════════════════
async function callAI(userPrompt, systemPrompt) {
    const ctx = SillyTavern.getContext();
    const s   = getSettings();
    const pName = s.selectedProfileName;

    if (pName && ctx.ConnectionManagerRequestService) {
        const profiles = ctx.extensionSettings?.['connectionManager']?.profiles || [];
        const profile  = profiles.find(p => p.name === pName);
        if (profile) {
            const content  = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
            const response = await ctx.ConnectionManagerRequestService.sendRequest(
                profile.id,
                [{ role:'user', content }],
                s.maxTokens || 4000,
                { stream:false, extractData:true, includePreset:true, includeInstruct:false }
            );
            let raw = '';
            if (typeof response==='string') raw=response;
            else if (typeof response?.content==='string') raw=response.content;
            else if (response?.choices?.[0]?.message?.content) raw=response.choices[0].message.content;
            else if (response?.content?.[0]?.text) raw=response.content[0].text;
            return filterPhoneTrigger(raw);
        }
    }
    const result = await ctx.generateRaw({ systemPrompt: systemPrompt||undefined, prompt:userPrompt });
    return filterPhoneTrigger(result||'');
}

// ═══════════════════════════════════════════
// combatProfile 프롬프트 (파이터당 1회)
// ═══════════════════════════════════════════
const COMBAT_PROFILE_SYSTEM =
`You are a combat analyst specializing in fictional character evaluation.
Analyze the character's full combat/conflict potential from every possible angle.
Return ONLY valid JSON — no markdown, no code blocks, no extra text.`;

function buildCombatProfilePrompt(char) {
    const p = char.parsed || {};
    const raw = p.raw || [p.appearance, p.personality, p.traits].filter(Boolean).join('\n');
    return `Character name: ${char.name}
Gender: ${char.gender === 'female' ? 'Female' : 'Male'}
Age: ${p.age || 'Unknown'}
Job/Role: ${p.job || 'Unknown'}
Location/Background: ${p.location || 'Unknown'}
Stats (each 0–100): charm=${char.stats?.charm||50} presence=${char.stats?.presence||50} desire=${char.stats?.desire||50} wit=${char.stats?.wit||50} aura=${char.stats?.aura||50}

Full character sheet:
${raw.slice(0, 1800)}

Analyze this character's full combat/conflict potential and return ONLY this JSON:
{
  "species": "Species or entity type. If human: state human. If vampire/demi-human/spirit/god/AI/etc: fully analyze that species' inherent physical/supernatural traits, resistances, weaknesses, longevity-derived experience. Korean.",
  "physique": "Precise physical specs — inferred height/weight/build from sheet, age-bracket physical peak (20s explosive/30s prime/40s veteran/50s+ experience-over-power), how build translates to combat (linebacker=short burst explosive power + high pain tolerance, swimmer=endurance + reach, wizard=physical frailty + possibly sedentary). Korean.",
  "job_combat": "Rigorous combat interpretation of the job/role. DO NOT genericize. Examples: wide receiver→explosive 40-yard burst, jump ball, but zero combat training; SAS operator→CQC muscle memory, real kill experience, cold-blood; mafia boss→tactical command, intimidation, low direct combat but resources; court magician→magic power but physically weak; detective→pattern recognition + firearms but no hand-to-hand. Korean.",
  "experience": "Combat/conflict experience level in detail — total civilian / street brawls / trained military / real warzone / assassin-grade / superhuman veteran. Include estimated number of real fights if inferrable. Korean.",
  "skills": "Specific skills and disciplines — name martial arts styles, weapon types, magic schools, special powers, tactical skills. Be precise (e.g. 'Muay Thai + wrestling clinch' not just 'fighting'). Korean.",
  "worldsetting": "World/setting the character exists in — modern realistic / fantasy medieval / sci-fi / supernatural / mixed. This defines what rules apply: firearms exist? magic? superhuman healing? tech augmentation? Korean.",
  "strengths": "3 specific scenarios/conditions where this character has a decisive advantage. Tie to actual traits. Korean.",
  "weaknesses": "3 specific scenarios/conditions where this character is at a decisive disadvantage. Be honest. Korean.",
  "psychology": "Combat psychology — pain threshold, fight-or-flight tendency, performance under mortal stress, history of breaking or holding under pressure, berserker tendency or cold calculation. Korean.",
  "background_factors": "Past traumas, special life experiences, grudges, survival history, near-death experiences that affect combat ability or fighting drive. Korean.",
  "power_ceiling": "What is the absolute maximum this character could do at peak — what would their strongest moment look like? Korean.",
  "anti_synergy": "What tactics or opponents would specifically counter or neutralize this character's strengths? Korean."
}`;
}

// ═══════════════════════════════════════════
// combat 통합 판정 프롬프트 (1회)
// ═══════════════════════════════════════════
const COMBAT_SYSTEM =
`You are a serious combat and conflict analyst. You receive detailed combat profiles for each participant and a specific conflict condition. Write a rigorous analytical report in Korean. No roleplay, no game notation, no story prose — pure analysis.`;

function buildCombatPrompt(fighters, profiles, condition) {
    const fighterBlocks = fighters.map((f, i) => {
        const pr = profiles[i];
        const stats = Object.entries(f.stats||{}).map(([k,v])=>`    ${k}: ${v}`).join('\n');
        return `━━━ FIGHTER ${i+1}: ${f.name} ━━━
[Stats]
${stats}
  TOTAL: ${getTotal(f)}

[Combat Profile]
• Species/Entity: ${pr.species||'—'}
• Physique: ${pr.physique||'—'}
• Job (Combat Interpretation): ${pr.job_combat||'—'}
• Experience: ${pr.experience||'—'}
• Skills: ${pr.skills||'—'}
• World Setting: ${pr.worldsetting||'—'}
• Strengths: ${pr.strengths||'—'}
• Weaknesses: ${pr.weaknesses||'—'}
• Psychology: ${pr.psychology||'—'}
• Background Factors: ${pr.background_factors||'—'}
• Power Ceiling: ${pr.power_ceiling||'—'}
• Anti-Synergy: ${pr.anti_synergy||'—'}`;
    }).join('\n\n');

    return `[CONFLICT CONDITION]
${condition || '기본 대결. 특별한 제약 없음.'}

[PARTICIPANTS — ${fighters.length} fighters]
${fighterBlocks}

Write the analysis report in Korean in this exact order:

⚔️ 【전력 분석】
For EACH fighter: analyze how their species, physique, job, skills, and psychology apply specifically to THIS condition. Draw explicit connections between their traits and the condition's demands. (4-6 sentences per fighter)

🧮 【전황 시뮬레이션】
Simulate how the confrontation actually unfolds from start to finish given the condition. Identify exact turning points and explain WHY they happen based on the fighters' specific traits — not generic outcomes. (8-12 sentences)

⚖️ 【변수 분석】
Identify 3 specific wildcards that could realistically flip the outcome — psychology breaks, terrain factors, species-specific vulnerabilities, emotional triggers from background. Be specific to these characters. (3-4 sentences)

🏆 【최종 판정】
State winner and clear reasoning. If multiple fighters, rank all.
Last line must be exactly:
【최종 승자: [name] (승률 [XX]%)】`;
}

// ═══════════════════════════════════════════
// 로딩 UI
// ═══════════════════════════════════════════
const LOADING_STEPS = [
    'SCANNING FIGHTERS...',
    'ANALYZING COMBAT PROFILE...',
    'CALCULATING POWER LEVELS...',
    'RUNNING SIMULATION...',
    'DETERMINING OUTCOME...',
];

function showLoading(stepMsg) {
    let el = document.getElementById('ba-loading');
    if (!el) {
        el = document.createElement('div');
        el.id = 'ba-loading';
        el.innerHTML = `
            <div style="position:relative;width:28px;height:28px;flex-shrink:0">
                <svg viewBox="0 0 60 60" style="width:28px;height:28px;animation:ba-spin 1.2s linear infinite">
                    <circle cx="30" cy="30" r="24" fill="none" stroke="${C().border}" stroke-width="4"/>
                    <circle cx="30" cy="30" r="24" fill="none" stroke="${C().accent}" stroke-width="4"
                        stroke-dasharray="40 110" stroke-linecap="round"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px">⚔️</div>
            </div>
            <div style="flex:1">
                <div id="ba-loading-msg" style="font-size:10px;color:${C().accent};font-family:'Press Start 2P',monospace;letter-spacing:1px">${LOADING_STEPS[0]}</div>
                <div style="display:flex;gap:3px;margin-top:5px">
                    <div class="ba-dot"></div><div class="ba-dot"></div><div class="ba-dot"></div>
                </div>
            </div>`;
        el.style.cssText = `position:sticky;bottom:0;left:0;right:0;background:${C().bg}ee;border-top:1px solid ${C().border};z-index:10;display:flex;align-items:center;gap:12px;padding:10px 14px;backdrop-filter:blur(4px)`;
        document.getElementById('ba-content')?.appendChild(el);
    }
    const m = document.getElementById('ba-loading-msg');
    if (m && stepMsg) {
        m.style.opacity = '0';
        setTimeout(()=>{ if(m){ m.textContent=stepMsg; m.style.opacity='1'; m.style.transition='opacity 0.3s'; } }, 200);
    }
    return el;
}
function hideLoading() {
    const el = document.getElementById('ba-loading');
    if (!el) return;
    el.style.opacity='0';
    el.style.transition='opacity 0.3s';
    setTimeout(()=>el.remove(), 300);
}
function updateLoadingMsg(msg) {
    const m = document.getElementById('ba-loading-msg');
    if (!m) return;
    m.style.opacity='0';
    setTimeout(()=>{ if(m){ m.textContent=msg; m.style.opacity='1'; } }, 200);
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
        for (let i = 0; i < fighters.length; i++) {
            const f = fighters[i];
            updateLoadingMsg(`PROFILING ${f.name.toUpperCase()}... (${i+1}/${fighters.length})`);
            try {
                const raw = await callAI(buildCombatProfilePrompt(f), COMBAT_PROFILE_SYSTEM);
                const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
                profiles.push(parsed);
            } catch {
                // 파싱 실패 시 최소 폴백
                profiles.push({
                    species: f.parsed?.traits || '인간',
                    physique: f.parsed?.appearance || '—',
                    job_combat: f.parsed?.job || '—',
                    experience: '불명',
                    skills: f.parsed?.traits || '—',
                    worldsetting: '현대 현실',
                    strengths: '—', weaknesses: '—',
                    psychology: f.parsed?.personality || '—',
                    background_factors: '—',
                    power_ceiling: '—',
                    anti_synergy: '—',
                });
            }
        }

        // 2단계: 통합 판정
        updateLoadingMsg('RUNNING SIMULATION...');
        const combatPrompt = buildCombatPrompt(fighters, profiles, condition);
        const resultText   = await callAI(combatPrompt, COMBAT_SYSTEM);

        hideLoading();

        // 승자 파싱
        const wm = resultText.match(/【최종 승자:\s*(.+?)\s*\(승률\s*(\d+)%\)】/);
        const winner  = wm ? wm[1].trim() : '???';
        const winRate = wm ? parseInt(wm[2]) : null;

        // 기록 저장
        const record = {
            id: `battle_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            fighters: fighters.map(f => ({
                id:f.id, name:f.name, gender:f.gender, total:getTotal(f)
            })),
            profiles,
            condition: condition || '기본 대결',
            winner, winRate, resultText,
            createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g, '.'),
        };
        const s = getSettings();
        s.records.unshift(record);
        if (s.records.length > 50) s.records.length = 50;
        save();

        openResultPanel(record);
        renderArenaTab();

        // 승자 하이라이트
        setTimeout(() => {
            document.querySelectorAll('.ba-fighter-slot').forEach(slot => {
                const idx = parseInt(slot.dataset.idx);
                const f   = state.selectedFighters[idx];
                if (f?.name === winner) {
                    const ring = slot.querySelector('.ba-slot-ring');
                    if (ring) {
                        ring.style.borderColor = C().gold;
                        ring.style.boxShadow   = `0 0 18px ${C().gold}cc`;
                    }
                }
            });
        }, 80);

    } catch(e) {
        hideLoading();
        toastr.error(`Battle failed: ${e.message}`);
    }
}

// ═══════════════════════════════════════════
// 결과 패널
// ═══════════════════════════════════════════
function openResultPanel(record) {
    document.getElementById('ba-result-panel')?.remove();

    const panel = document.createElement('div');
    panel.id    = 'ba-result-panel';

    const fighterNames = record.fighters.map(f=>f.name).join(' VS ');
    const wm = winnerMatch(record.resultText);

    panel.innerHTML = `
        <div id="ba-result-drag" style="background:${C().bg};border-bottom:2px solid ${C().border};padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:move;flex-shrink:0;user-select:none">
            <span style="font-size:14px">📜</span>
            <div style="flex:1;font-family:'Press Start 2P',monospace;font-size:11px;color:${C().accent};letter-spacing:2px">BATTLE REPORT</div>
            <button id="ba-result-close" style="background:none;border:1px solid ${C().border};border-radius:2px;color:${C().textDim};cursor:pointer;font-size:10px;padding:2px 7px;font-family:monospace">✕</button>
        </div>
        <div id="ba-result-body" style="flex:1;overflow-y:auto;overflow-x:hidden;">
            ${formatResult(record)}
        </div>
        <div id="ba-result-resize" style="position:absolute;bottom:0;right:0;width:20px;height:20px;cursor:se-resize;display:flex;align-items:flex-end;justify-content:flex-end;padding:3px;opacity:0.4;font-size:12px;user-select:none;color:${C().border}">⇲</div>`;

    panel.style.cssText = `position:fixed;top:80px;left:20px;width:min(500px,90vw);height:80vh;background:#050300;border:2px solid ${C().border};border-radius:4px;box-shadow:4px 0 30px #ff440022,0 4px 30px #cc440033;z-index:10100;display:flex;flex-direction:column;resize:both;overflow:hidden;min-width:300px;min-height:300px`;

    document.body.appendChild(panel);

    makeDraggable(panel, document.getElementById('ba-result-drag'));
    makeResizable(panel, document.getElementById('ba-result-resize'));
    document.getElementById('ba-result-close')?.addEventListener('click', ()=>panel.remove());
}

function winnerMatch(text) {
    return (text||'').match(/【최종 승자:\s*(.+?)\s*\(승률\s*(\d+)%\)】/);
}

function formatResult(record) {
    const fighterNames = record.fighters.map(f=>f.name).join(' VS ');
    const wm = winnerMatch(record.resultText);
    const winner  = wm ? wm[1].trim() : record.winner || '???';
    const winRate = wm ? wm[2] : record.winRate || '??';

    // 섹션 파싱
    const text = record.resultText || '';
    const secs = [
        { icon:'⚔️', key:'전력 분석' },
        { icon:'🧮', key:'전황 시뮬레이션' },
        { icon:'⚖️', key:'변수 분석' },
        { icon:'🏆', key:'최종 판정' },
    ];
    let body = '';
    for (const sec of secs) {
        const rx = new RegExp(`${sec.icon}[^\\n]*【${sec.key}】([\\s\\S]*?)(?=⚔️|🧮|⚖️|🏆|$)`,'u');
        const m  = text.match(rx);
        const content = m ? m[1].trim() : '';
        body += `<div style="margin-bottom:22px">
            <div style="font-family:'Press Start 2P',monospace;font-size:11px;color:${C().accent};letter-spacing:2px;border-bottom:1px solid ${C().border};padding-bottom:5px;margin-bottom:10px">${sec.icon} ${sec.key}</div>
            <div style="color:${C().text};font-size:12px;line-height:2;white-space:pre-wrap;word-break:break-word">${esc(content||'—')}</div>
        </div>`;
    }

    const resultBodyStyle = `padding:16px 18px;font-family:'Noto Serif KR','Apple SD Gothic Neo',system-ui,sans-serif;font-size:13px;color:${C().text};line-height:2;word-break:break-word`;

    return `
        <div style="${resultBodyStyle}">
            <div style="font-family:'Press Start 2P',monospace;font-size:10px;color:${C().textDim};margin-bottom:14px;letter-spacing:1px;line-height:2.5">${esc(fighterNames)}<br>${esc(record.condition.slice(0,60))}</div>
            <div style="font-family:'Press Start 2P',monospace;font-size:13px;color:${C().gold};text-align:center;padding:14px;border:2px solid ${C().gold}55;border-radius:2px;background:#1a0800;letter-spacing:2px;text-shadow:0 0 12px ${C().gold}88;margin-bottom:20px;animation:ba-winner-glow 2s ease-in-out infinite">
                🏆 WINNER: ${esc(winner)} (${winRate}%)
            </div>
            ${body}
        </div>`;
}


// ═══════════════════════════════════════════
// 전투 프로필 미리보기
// ═══════════════════════════════════════════
async function showCombatProfile(char) {
    // 기존 창 닫기
    document.getElementById('ba-combat-profile-panel')?.remove();

    const p   = char.parsed||{};
    const raw = p.raw||[p.appearance,p.personality,p.traits].filter(Boolean).join('\n');

    // 간단 버전 프롬프트 (전투 특성만, 짧게)
    const prompt = `Character: ${char.name} (${char.gender==='female'?'F':'M'}, ${p.age||'?'}, ${p.job||'?'})
Stats: charm=${char.stats?.charm||50} presence=${char.stats?.presence||50} desire=${char.stats?.desire||50} wit=${char.stats?.wit||50} aura=${char.stats?.aura||50}
Sheet summary: ${raw.slice(0,800)}

Extract ONLY combat-relevant facts. Return in Korean, plain text, no JSON:
【종족/신체】 species/build/age-peak in 1 sentence
【직업 전투해석】 how their job translates to combat ability in 1 sentence
【전투 경험】 estimated real combat experience in 1 sentence
【주요 기술】 specific combat skills, weapons, powers in 1 sentence
【심리】 combat psychology in 1 sentence
【강점 한줄】 biggest advantage
【약점 한줄】 biggest weakness`;

    const panel = document.createElement('div');
    panel.id = 'ba-combat-profile-panel';
    panel.style.cssText = `position:fixed;top:80px;left:50%;transform:translateX(-50%);width:min(400px,90vw);max-height:75vh;background:${C().bgCard};border:2px solid ${C().borderBright};border-radius:4px;box-shadow:0 8px 40px rgba(0,0,0,0.5);z-index:10300;display:flex;flex-direction:column;overflow:hidden`;
    panel.innerHTML = `
        <div id="ba-cp-drag" style="background:${C().bg};border-bottom:1px solid ${C().border};padding:10px 14px;display:flex;align-items:center;gap:8px;flex-shrink:0;cursor:move;user-select:none">
            <span style="font-size:14px">⚔️</span>
            <div style="flex:1;font-family:'Press Start 2P',monospace;font-size:9px;color:${C().accent};letter-spacing:1px">${esc(char.name)} — 전투 프로필</div>
            <button id="ba-cp-close" style="background:none;border:1px solid ${C().border};border-radius:2px;color:${C().textDim};cursor:pointer;font-size:10px;padding:2px 6px;font-family:monospace">✕</button>
        </div>
        <div id="ba-cp-body" style="flex:1;overflow-y:auto;padding:14px 16px;font-family:system-ui,sans-serif;font-size:13px;color:${C().text};line-height:1.9">
            <div style="display:flex;gap:4px;align-items:center;color:${C().textDim};font-size:11px">
                <span>분석 중</span>
                <span class="ba-dot"></span><span class="ba-dot"></span><span class="ba-dot"></span>
            </div>
        </div>`;
    document.body.appendChild(panel);
    document.getElementById('ba-cp-close')?.addEventListener('click',()=>panel.remove());
    makeDraggable(panel, document.getElementById('ba-cp-drag'));

    try {
        const result = await callAI(prompt,
            'You are a combat analyst. Extract only combat-relevant information, concisely. Korean output only.');
        const body = document.getElementById('ba-cp-body');
        if (body) {
            // 섹션별 포맷
            const lines = result.split('\n').filter(l=>l.trim());
            body.innerHTML = lines.map(line=>{
                const isHeader = line.startsWith('【');
                return `<div style="margin-bottom:${isHeader?'2px':'10px'};${isHeader?`color:${C().accent};font-weight:700;font-size:11px;margin-top:10px`:`color:${C().text};font-size:13px;padding-left:8px`}">${esc(line)}</div>`;
            }).join('');
        }
    } catch(e) {
        const body = document.getElementById('ba-cp-body');
        if (body) body.innerHTML = `<div style="color:#ff4444;font-size:12px">분석 실패: ${esc(e.message)}</div>`;
    }
}

// ═══════════════════════════════════════════
// 상황 입력 모달
// ═══════════════════════════════════════════
const CHIPS = [
    '맨손 격투','무기 결투','총기 전투','칼싸움',
    '말싸움 / 설전','협상 / 심리전','법정 공방',
    '전쟁터 / 전면전','암살 임무','서바이벌',
    '술집 패싸움','체스 / 두뇌 게임',
    '마법 결투','정치 권력 싸움','스포츠 대결',
];

function showConditionModal() {
    document.getElementById('ba-condition-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'ba-condition-modal';
    // 드래그 가능한 플로팅 패널 — 오버레이 없음
    modal.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(380px,90vw);background:${C().bgCard};border:2px solid ${C().borderBright};border-radius:4px;box-shadow:0 8px 40px rgba(0,0,0,0.5);z-index:10200;display:flex;flex-direction:column;overflow:hidden`;

    modal.innerHTML = `
        <div id="ba-cond-drag" style="background:${C().bg};border-bottom:1px solid ${C().border};padding:10px 14px;display:flex;align-items:center;gap:8px;cursor:move;flex-shrink:0;user-select:none">
            <span style="font-size:14px">⚔️</span>
            <div style="flex:1;font-family:'Press Start 2P',monospace;font-size:9px;color:${C().accent};letter-spacing:1px">BATTLE CONDITION</div>
            <button id="ba-cond-cancel" style="background:none;border:1px solid ${C().border};border-radius:2px;color:${C().textDim};cursor:pointer;font-size:11px;padding:2px 7px;font-family:monospace;line-height:1">✕</button>
        </div>
        <div style="padding:16px">
            <textarea id="ba-cond-ta" placeholder="어떤 상황에서 싸우나요?&#10;예) 좁은 골목 야간 칼싸움. 양쪽 단도 1자루.&#10;예) 법정 최후변론 대결.&#10;예) 전쟁터 — 각자 100명 병력 지휘.&#10;예) 말싸움 / 설전 / 협상 / 심리전&#10;비워두면 기본 대결로 진행합니다." rows="6"
                style="width:100%;background:${C().bg};border:1px solid ${C().border};border-radius:2px;padding:10px;color:${C().text};font-size:12px;font-family:system-ui;line-height:1.8;resize:vertical;outline:none;box-sizing:border-box;min-height:110px"></textarea>
            <button id="ba-cond-go" style="width:100%;margin-top:10px;padding:12px;background:${C().accent};border:none;border-radius:2px;color:#fff;cursor:pointer;font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:2px">⚔️  FIGHT!</button>
        </div>`;

    document.body.appendChild(modal);
    makeDraggable(modal, document.getElementById('ba-cond-drag'));

    document.getElementById('ba-cond-cancel')?.addEventListener('click', ()=>modal.remove());
    document.getElementById('ba-cond-go')?.addEventListener('click', async ()=>{
        const cond = document.getElementById('ba-cond-ta')?.value.trim()||'';
        modal.remove();
        await runBattle(cond);
    });
}

// ═══════════════════════════════════════════
// 아레나 원형 위치
// ═══════════════════════════════════════════
function getPositions(n, r=70) {
    if (n===1) return [{x:100,y:100}];
    if (n===2) return [{x:100-r,y:100},{x:100+r,y:100}];
    return Array.from({length:n},(_,i)=>{
        const a=(i*2*Math.PI/n)-Math.PI/2;
        return {x:Math.round(100+r*Math.cos(a)),y:Math.round(100+r*Math.sin(a))};
    });
}

// ═══════════════════════════════════════════
// 아레나 탭
// ═══════════════════════════════════════════
function renderArenaTab() {
    const content = document.getElementById('ba-content');
    if (!content) return;
    const roster   = getRoster();
    const fighters = state.selectedFighters;
    const canFight = fighters.length >= 2;

    // SVG 연결선
    const lines = fighters.length >= 2
        ? getPositions(fighters.length).map((p,i,arr)=>{
            const nx=arr[(i+1)%arr.length];
            return `<line x1="${p.x}" y1="${p.y}" x2="${nx.x}" y2="${nx.y}" stroke="#ff440022" stroke-width="1" stroke-dasharray="4 4"/>`;
          }).join('')
        : '';

    // 파이터 슬롯 DOM
    const slots = fighters.length===0
        ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
               <div style="font-size:10px;color:${C().textDim};letter-spacing:2px;text-align:center;line-height:3">NO FIGHTERS<br>SELECTED</div>
           </div>`
        : getPositions(fighters.length).map((pos,i)=>{
            const f   = fighters[i];
            const url = resolveAvatarUrl(f.name);
            const hue = avatarHue(f.name);
            const gc  = f.gender==='female'?'#ff44aa':'#4488ff';
            const ini = f.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
            const inner = url
                ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
                : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:16px;font-weight:900;color:hsl(${hue},50%,70%);font-family:monospace">${ini}</div>`;
            return `<div class="ba-fighter-slot" data-idx="${i}"
                style="position:absolute;left:${pos.x}px;top:${pos.y}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;z-index:2">
                <div class="ba-slot-ring" style="width:54px;height:54px;border-radius:50%;border:2px solid ${gc};overflow:hidden;background:#0d0600;box-shadow:0 0 8px ${gc}66;transition:all 0.2s">${inner}</div>
                <div style="font-size:13px;color:${C().accent};letter-spacing:1px;text-align:center;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</div>
                <div style="font-size:13px;color:${C().textDim};font-family:'Press Start 2P',monospace">${getTotal(f)}</div>
            </div>`;
          }).join('');

    // 파워 배지
    const badges = canFight
        ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;justify-content:center">
            ${fighters.map(f=>`<div style="display:flex;align-items:center;gap:4px;background:${C().bgCard};border:1px solid ${C().border};border-radius:2px;padding:4px 8px">
                <span style="font-size:11px;color:${C().textBright};font-family:monospace">${esc(f.name)}</span>
                <span style="font-size:11px;color:${C().accent};font-family:'Press Start 2P',monospace">${getTotal(f)}</span>
            </div>`).join('')}
           </div>`
        : '';

    // 캐릭터 카드 목록
    const cards = roster.length===0
        ? `<div style="text-align:center;color:${C().textDim};font-size:11px;padding:20px 0;letter-spacing:1px;line-height:3">NO FIGHTERS IN ROSTER<br><span style="font-size:13px;color:#331500">Add characters via Scouter first</span></div>`
        : roster.map(char=>{
            const sel = !!fighters.find(f=>f.id===char.id);
            const url = resolveAvatarUrl(char.name);
            const hue = avatarHue(char.name);
            const gc  = char.gender==='female'?'#ff44aa':'#4488ff';
            const ini = char.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
            const avInner = url
                ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
                : ini;
            const statBars = Object.entries(char.stats||{}).map(([k,v])=>`
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
                    <div style="font-size:13px;width:10px;flex-shrink:0;color:${C().text}">${STAT_META[k]?.label||k}</div>
                    <div style="flex:1;height:4px;background:#1a0800;border-radius:1px;overflow:hidden;border:1px solid #331500">
                        <div style="width:${v}%;height:100%;background:${STAT_META[k]?.color||C().accent};border-radius:1px;transition:width 0.6s"></div>
                    </div>
                    <div style="font-size:13px;width:18px;text-align:right;color:${C().accent};flex-shrink:0">${v}</div>
                </div>`).join('');
            return `<div class="ba-char-card" data-id="${char.id}"
                style="background:${sel?'#1a0800':C().bgCard};border:1px solid ${sel?C().accent:C().border};border-radius:2px;padding:8px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;margin-bottom:5px;transition:all 0.15s;${sel?`box-shadow:0 0 8px ${C().accent}33`:''}">
                <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:1px solid ${gc};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;background:radial-gradient(circle at 35% 35%,hsl(${hue},30%,22%),hsl(${hue},20%,10%));color:hsl(${hue},50%,70%);font-family:monospace">${avInner}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:${sel?C().textBright:C().text};margin-bottom:5px;font-family:'Press Start 2P',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(char.name)}</div>
                    ${statBars}
                </div>
                <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                    <div style="font-size:14px;font-weight:900;color:${sel?C().accent:C().textDim};font-family:'Press Start 2P',monospace">${getTotal(char)}</div>
                    ${sel?`<div style="font-size:10px;color:${C().accent};letter-spacing:1px">✓</div>`:''}
                    <button class="ba-combat-profile-btn" data-id="${char.id}" style="background:none;border:1px solid ${C().border};border-radius:2px;padding:2px 6px;cursor:pointer;color:${C().textDim};font-size:10px;line-height:1.4" title="전투 프로필 보기">⚔️</button>
                </div>
            </div>`;
        }).join('');

    content.innerHTML = `
        <!-- 아레나 원형 -->
        <div style="padding:14px 14px 8px;display:flex;flex-direction:column;align-items:center">
            <div style="position:relative;width:200px;height:200px;margin:0 auto;flex-shrink:0">
                <svg viewBox="0 0 200 200" style="position:absolute;inset:0;width:100%;height:100%">
                    <circle cx="100" cy="100" r="92" fill="#030200" stroke="#221100" stroke-width="1"/>
                    <circle cx="100" cy="100" r="90" fill="none" stroke="#442200" stroke-width="2" stroke-dasharray="8 4" class="ba-pulse-ring"/>
                    <circle cx="100" cy="100" r="80" fill="none" stroke="#331500" stroke-width="1"/>
                    <line x1="100" y1="10" x2="100" y2="190" stroke="#221100" stroke-width="1" opacity="0.4"/>
                    <line x1="10" y1="100" x2="190" y2="100" stroke="#221100" stroke-width="1" opacity="0.4"/>
                    <text x="100" y="106" text-anchor="middle" fill="#442200" font-size="18" font-family="monospace">⚔️</text>
                    ${lines}
                </svg>
                ${slots}
            </div>
            ${badges}
        </div>

        <!-- 구분선 -->
        <div style="display:flex;align-items:center;gap:8px;margin:12px 14px 10px">
            <div style="flex:1;height:1px;background:linear-gradient(90deg,${C().accent}44,transparent)"></div>
            <div style="font-size:10px;color:${C().borderBright};letter-spacing:2px;font-family:'Press Start 2P',monospace">SELECT FIGHTERS</div>
            <div style="flex:1;height:1px;background:linear-gradient(270deg,${C().accent}44,transparent)"></div>
        </div>

        <!-- 캐릭터 목록 -->
        <div style="padding:0 14px 6px">${cards}</div>

        <!-- 배틀 버튼 -->
        <button id="ba-fight-btn" ${canFight?'':'disabled'}
            style="display:block;width:calc(100% - 28px);margin:0 14px 14px;padding:12px;background:linear-gradient(180deg,#331500,#1a0800);border:2px solid ${canFight?C().borderBright:C().border};border-radius:2px;color:${canFight?C().accent:C().textDim};font-family:'Press Start 2P',monospace;font-size:13px;letter-spacing:2px;cursor:${canFight?'pointer':'not-allowed'};text-shadow:${canFight?`0 0 8px ${C().accent}88`:'none'};box-shadow:${canFight?`0 0 12px ${C().accent}33`:'none'};opacity:${canFight?1:0.4};transition:all 0.15s">
            ${canFight?`⚔️  FIGHT  (${fighters.length} FIGHTERS)`:fighters.length===0?'SELECT 2+ FIGHTERS':`SELECT ${2-fighters.length} MORE`}
        </button>`;

    // 이벤트
    content.querySelectorAll('.ba-char-card').forEach(card=>{
        card.addEventListener('click',()=>{
            const id   = card.dataset.id;
            const char = getRoster().find(c=>c.id===id);
            if (!char) return;
            const idx  = state.selectedFighters.findIndex(f=>f.id===id);
            if (idx>=0) state.selectedFighters.splice(idx,1);
            else state.selectedFighters.push(char);
            renderArenaTab();
        });
    });

    // 전투 프로필 버튼
    content.querySelectorAll('.ba-combat-profile-btn').forEach(btn=>{
        btn.addEventListener('click', e=>{
            e.stopPropagation();
            const char = getRoster().find(c=>c.id===btn.dataset.id);
            if (char) showCombatProfile(char);
        });
    });

    document.getElementById('ba-fight-btn')?.addEventListener('click',()=>{
        if (state.selectedFighters.length<2) return;
        showConditionModal();
    });
}

// ═══════════════════════════════════════════
// 기록 탭
// ═══════════════════════════════════════════
function renderRecordsTab() {
    const content = document.getElementById('ba-content');
    if (!content) return;
    const records = getSettings().records;

    if (!records.length) {
        content.innerHTML = `<div style="text-align:center;padding:40px 14px;font-family:'Press Start 2P',monospace">
            <div style="font-size:12px;color:${C().textDim};letter-spacing:2px;line-height:3">NO BATTLES<br>RECORDED</div>
        </div>`;
        return;
    }

    content.innerHTML = `<div style="padding:14px">
        ${records.map(r=>`
        <div class="ba-rec" data-id="${r.id}"
            style="background:${C().bgCard};border:1px solid ${C().border};border-left:3px solid ${C().accent};border-radius:2px;padding:9px 11px;cursor:pointer;margin-bottom:6px;transition:all 0.15s;display:flex;align-items:center;gap:8px">
            <div style="flex:1;min-width:0">
                <div style="font-size:10px;color:${C().gold};font-family:'Press Start 2P',monospace;letter-spacing:1px;margin-bottom:3px">🏆 ${esc(r.winner)}${r.winRate?` (${r.winRate}%)`:''}
                </div>
                <div style="font-size:10px;color:${C().textDim};margin-top:2px">${esc(r.fighters.map(f=>f.name).join(' VS '))}</div>
                <div style="font-size:13px;color:#442200;margin-top:2px">${esc((r.condition||'').slice(0,40))}${(r.condition||'').length>40?'...':''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <div style="font-size:13px;color:${C().textDim}">${esc(r.createdAt||'')}</div>
                <button class="ba-del" data-id="${r.id}" style="margin-top:5px;background:none;border:1px solid ${C().border};border-radius:2px;padding:2px 6px;cursor:pointer;color:${C().textDim};font-size:13px">🗑</button>
            </div>
        </div>`).join('')}
    </div>`;

    content.querySelectorAll('.ba-rec').forEach(el=>{
        el.addEventListener('click',e=>{
            if (e.target.classList.contains('ba-del')) return;
            const rec = getSettings().records.find(r=>r.id===el.dataset.id);
            if (rec) openResultPanel(rec);
        });
    });
    content.querySelectorAll('.ba-del').forEach(btn=>{
        btn.addEventListener('click',e=>{
            e.stopPropagation();
            const s=getSettings();
            s.records=s.records.filter(r=>r.id!==btn.dataset.id);
            save(); renderRecordsTab();
        });
    });
}

// ═══════════════════════════════════════════
// 설정 탭
// ═══════════════════════════════════════════
function renderSettingsTab() {
    const content = document.getElementById('ba-content');
    if (!content) return;
    const ctx = SillyTavern.getContext();
    const s   = getSettings();
    const profiles = ctx.extensionSettings?.['connectionManager']?.profiles || [];
    const saved    = s.selectedProfileName || '';

    content.innerHTML = `<div style="padding:16px;font-family:system-ui,sans-serif">
        <div style="font-size:9px;font-family:'Press Start 2P',monospace;color:${C().borderBright};letter-spacing:2px;border-bottom:1px solid ${C().border};padding-bottom:6px;margin-bottom:12px">AI CONFIG</div>
        <div style="margin-bottom:12px">
            <div style="font-size:11px;color:${C().text};margin-bottom:5px">Connection Profile</div>
            <select id="ba-prof-sel" style="background:${C().bgCard};border:1px solid ${C().border};border-radius:2px;color:${C().text};font-size:12px;padding:6px 8px;font-family:system-ui;outline:none;width:100%">
                <option value="">현재 연결 그대로</option>
                ${profiles.map(p=>`<option value="${esc(p.name)}" ${p.name===saved?'selected':''}>${esc(p.name)}</option>`).join('')}
            </select>
        </div>
        <div style="margin-bottom:12px">
            <div style="font-size:11px;color:${C().text};margin-bottom:5px">Max Tokens</div>
            <input id="ba-tok" type="number" min="500" max="16000" step="500" value="${s.maxTokens||4000}"
                style="background:${C().bgCard};border:1px solid ${C().border};border-radius:2px;color:${C().text};font-size:12px;padding:6px 8px;font-family:system-ui;outline:none;width:100%;box-sizing:border-box">
        </div>
        <div style="border-top:1px solid ${C().border};padding-top:12px;margin-top:12px">
            <button id="ba-clear-recs" style="width:100%;background:none;border:1px solid ${C().border};border-radius:2px;padding:8px;cursor:pointer;color:${C().textDim};font-size:12px;font-family:system-ui">🗑 기록 전체 삭제</button>
        </div>
        <div style="margin-top:14px;font-size:10px;color:${C().textDim};line-height:2;font-family:system-ui">
            ※ 배틀 = 파이터수 × 프로파일 호출 + 최종 1회<br>
            챗틀로얄 v2.0 · by 봉봉
        </div>
    </div>`;

    document.getElementById('ba-prof-sel')?.addEventListener('change',e=>{
        const s2=getSettings(); s2.selectedProfileName=e.target.value||null; save();
        toastr.success(e.target.value?`Profile: "${e.target.value}"`:'Using current connection');
    });
    document.getElementById('ba-tok')?.addEventListener('change',e=>{
        const s2=getSettings(); s2.maxTokens=parseInt(e.target.value)||4000; save();
    });
    document.getElementById('ba-clear-recs')?.addEventListener('click',async()=>{
        const { Popup, POPUP_RESULT } = SillyTavern.getContext();
        const ok = await Popup.show.confirm('Clear Records','Delete all battle records?');
        if (ok===POPUP_RESULT.AFFIRMATIVE) {
            const s2=getSettings(); s2.records=[]; save();
            toastr.success('Records cleared'); renderRecordsTab();
        }
    });
}

// ═══════════════════════════════════════════
// 탭 전환
// ═══════════════════════════════════════════
function switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('#ba-float .ba-tab').forEach(btn=>{
        btn.classList.toggle('active', btn.dataset.tab===tab);
    });
    if (tab==='arena')    renderArenaTab();
    else if (tab==='records') renderRecordsTab();
    else if (tab==='settings') renderSettingsTab();
}

// ═══════════════════════════════════════════
// 드래그 / 리사이즈
// ═══════════════════════════════════════════
function makeDraggable(panel, handle) {
    let drag=false,sx,sy,sl,st;
    const go=(cx,cy)=>{
        drag=true; sx=cx; sy=cy;
        const r=panel.getBoundingClientRect(); sl=r.left; st=r.top;
        panel.style.right='auto';
        document.body.style.userSelect='none';
    };
    const mv=(cx,cy)=>{
        if (!drag) return;
        const vw=window.innerWidth,vh=window.innerHeight;
        panel.style.left=Math.max(0,Math.min(vw-panel.offsetWidth, sl+cx-sx))+'px';
        panel.style.top =Math.max(0,Math.min(vh-60, st+cy-sy))+'px';
    };
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
    document.addEventListener('mousemove',e=>{ if(!r)return; panel.style.width=Math.max(300,rw+e.clientX-rx)+'px'; panel.style.height=Math.max(300,rh+e.clientY-ry)+'px'; });
    document.addEventListener('mouseup',()=>{ r=false; document.body.style.userSelect=''; });
}

// ═══════════════════════════════════════════
// 메인 패널
// ═══════════════════════════════════════════
function openPanel() {
    if (document.getElementById('ba-float')) return;

    const panel = document.createElement('div');
    panel.id='ba-float';
    panel.style.cssText=`position:fixed;top:60px;right:20px;width:min(460px,95vw);height:82vh;background:${C().bg};border:2px solid ${C().borderBright};border-radius:4px;box-shadow:-4px 0 30px #ff440022,0 4px 30px #cc440033;z-index:9998;display:flex;flex-direction:column;resize:both;overflow:hidden;min-width:320px;min-height:400px;font-family:'Press Start 2P',monospace`;

    panel.innerHTML = `
        <div id="ba-drag-handle" style="background:${C().bg};border-bottom:2px solid ${C().border};padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:move;flex-shrink:0;user-select:none">
            <span style="font-size:16px;filter:drop-shadow(0 0 6px #ff440088)">⚔️</span>
            <div style="flex:1">
                <div style="font-size:13px;font-weight:900;letter-spacing:2px;background:linear-gradient(90deg,#ff6600,#ffaa00,#ff6600);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:ba-shimmer 2s linear infinite" class="ba-flicker">챗틀로얄</div>
                <div style="font-size:8px;color:${C().textDim};letter-spacing:1px;margin-top:1px">COLOSSEUM v2.0</div>
            </div>
            <button id="ba-theme-btn" title="테마 전환" style="background:none;border:1px solid ${C().border};border-radius:2px;cursor:pointer;font-size:13px;padding:2px 6px;color:${C().textDim};line-height:1">${_theme==='dark'?'☀️':'🌙'}</button>
            <button id="ba-close" style="background:none;border:1px solid ${C().border};border-radius:2px;color:${C().textDim};cursor:pointer;font-size:11px;padding:2px 7px;font-family:monospace;line-height:1">✕</button>
        </div>
        <div id="ba-tabs" style="display:flex;background:${C().bgCard};border-bottom:1px solid ${C().border};flex-shrink:0">
            <button class="ba-tab active" data-tab="arena" style="flex:1;background:none;border:none;border-bottom:2px solid ${C().accent};padding:8px 0;cursor:pointer;color:${C().accent};font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:1px;text-shadow:0 0 6px ${C().accent}66">⚔️ ARENA</button>
            <button class="ba-tab" data-tab="records" style="flex:1;background:none;border:none;border-bottom:2px solid transparent;padding:8px 0;cursor:pointer;color:#442200;font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:1px">📜 RECORDS</button>
            <button class="ba-tab" data-tab="settings" style="flex:1;background:none;border:none;border-bottom:2px solid transparent;padding:8px 0;cursor:pointer;color:#442200;font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:1px">⚙️ CONFIG</button>
        </div>
        <div id="ba-content" style="flex:1;overflow-y:auto;overflow-x:hidden;position:relative"></div>
        <div id="ba-resize" style="position:absolute;bottom:0;right:0;width:22px;height:22px;cursor:se-resize;display:flex;align-items:flex-end;justify-content:flex-end;padding:3px;opacity:0.4;font-size:14px;user-select:none;color:#884400;touch-action:none">⇲</div>`;

    document.body.appendChild(panel);
    makeDraggable(panel, document.getElementById('ba-drag-handle'));
    makeResizable(panel, document.getElementById('ba-resize'));

    panel.querySelectorAll('.ba-tab').forEach(btn=>{
        btn.addEventListener('click',()=>{
            panel.querySelectorAll('.ba-tab').forEach(b=>{
                b.classList.remove('active');
                b.style.color='#442200';
                b.style.borderBottom='2px solid transparent';
                b.style.textShadow='none';
            });
            btn.classList.add('active');
            btn.style.color=C().accent;
            btn.style.borderBottom=`2px solid ${C().accent}`;
            btn.style.textShadow=`0 0 6px ${C().accent}66`;
            switchTab(btn.dataset.tab);
        });
    });

    document.getElementById('ba-close')?.addEventListener('click', closePanel);
    document.getElementById('ba-theme-btn')?.addEventListener('click', () => {
        const wasTab = state.currentTab;
        saveTheme(_theme === 'dark' ? 'light' : 'dark');
        closePanel();
        openPanel();
        if (wasTab !== 'arena') switchTab(wasTab);
    });
    state.isPanelOpen=true;
    renderArenaTab();
}

function closePanel() {
    document.getElementById('ba-float')?.remove();
    state.isPanelOpen=false;
}
function togglePanel() {
    document.getElementById('ba-float') ? closePanel() : openPanel();
}

// ═══════════════════════════════════════════
// CSS 인젝션
// ═══════════════════════════════════════════
function injectCSS() {
    if (document.getElementById('ba-style')) return;
    const s = document.createElement('style');
    s.id = 'ba-style';
    s.textContent = `
        @keyframes ba-shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes ba-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes ba-winner-glow { 0%,100%{box-shadow:0 0 10px #ffaa0044} 50%{box-shadow:0 0 25px #ffaa00aa,0 0 50px #ff660044} }
        @keyframes ba-pulse-ring { 0%,100%{opacity:0.3} 50%{opacity:0.8} }
        @keyframes ba-flicker { 0%,95%,100%{opacity:1} 96%,99%{opacity:0.4} }
        @keyframes ba-dot { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1.1);opacity:1} }
        .ba-pulse-ring { animation: ba-pulse-ring 2s ease-in-out infinite; }
        .ba-flicker { animation: ba-flicker 4s ease-in-out infinite; }
        .ba-dot { width:5px;height:5px;border-radius:50%;background:#ff8800;display:inline-block;animation:ba-dot 1.2s ease-in-out infinite; }
        .ba-dot:nth-child(2){animation-delay:0.2s} .ba-dot:nth-child(3){animation-delay:0.4s}
        #ba-result-body::-webkit-scrollbar{width:4px}
        #ba-result-body::-webkit-scrollbar-track{background:#050300}
        #ba-result-body::-webkit-scrollbar-thumb{background:#664400;border-radius:2px}
        #ba-content::-webkit-scrollbar{width:4px}
        #ba-content::-webkit-scrollbar-track{background:#060400}
        #ba-content::-webkit-scrollbar-thumb{background:#884400;border-radius:2px}
    `;
    document.head.appendChild(s);
}

// ═══════════════════════════════════════════
// 초기화
// ═══════════════════════════════════════════
export async function onActivate() {
    console.log(`[${MODULE_NAME}] activate`);
    injectCSS();
    _theme = getSettings().theme || 'dark';

    const ctx = SillyTavern.getContext();
    const profiles = ctx.extensionSettings?.['connectionManager']?.profiles || [];
    const saved    = getSettings().selectedProfileName || '';
    const profOpts = profiles.map(p=>`<option value="${esc(p.name)}" ${p.name===saved?'selected':''}>${esc(p.name)}</option>`).join('');

    if (!document.getElementById('ba-ext-settings')) {
        const html = `<div class="inline-drawer" id="ba-ext-settings">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>⚔️ 챗틀로얄</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div style="padding:8px;display:flex;flex-direction:column;gap:8px">
                    <div style="font-size:0.82rem;color:var(--SmartThemeBodyColor,#ccc)">Connection Profile</div>
                    <select id="ba-ext-prof" class="text_pole" style="width:100%">
                        <option value="">현재 연결 그대로</option>${profOpts}
                    </select>
                    <div style="font-size:0.76rem;color:var(--SmartThemeQuoteColor,#aaa)">Requires Scouter with registered characters</div>
                </div>
            </div>
        </div>`;
        const t = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
        t?.insertAdjacentHTML('beforeend', html);
        document.getElementById('ba-ext-prof')?.addEventListener('change', e=>{
            const s=getSettings(); s.selectedProfileName=e.target.value||null; save();
            toastr.success(e.target.value?`챗틀로얄 profile: "${e.target.value}"`:'Using current connection');
        });
    }

    if (!document.getElementById('ba-wand-btn')) {
        const btn=`<div id="ba-wand-btn" title="챗틀로얄" style="cursor:pointer;padding:4px 8px;display:flex;align-items:center;gap:5px;font-size:13px">
            <span>⚔️</span><span style="font-size:12px">챗틀로얄</span>
        </div>`;
        const tb = document.getElementById('extensionsMenu') ?? document.getElementById('top-bar');
        tb?.insertAdjacentHTML('beforeend', btn);
        document.getElementById('ba-wand-btn')?.addEventListener('click', togglePanel);
    }

    document.addEventListener('keydown', e=>{ if(e.key==='Escape'&&state.isPanelOpen) closePanel(); });
    console.log(`[${MODULE_NAME}] ready`);
}

jQuery(async () => {
    const ctx = SillyTavern.getContext();
    ctx.eventSource.on(event_types.APP_READY, async ()=>{ await onActivate(); });
});
