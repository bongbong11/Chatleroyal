/**
 * ⚔️ 챗틀로얄 v2.0
 * SillyTavern Extension
 * Scouter (character_lab) roster 읽기 전용
 * combatProfile(파이터당) → combat(통합판정) 2단계 호출
 * + 베팅/포인트 시스템 + 테마 해금
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
    platypus: {
        bg: '#fff8f0', bgCard: '#fffaf5', bgDeep: '#fcefe0',
        border: '#e8c8a0', borderBright: '#cc9955',
        text: '#7a5530', textDim: '#bb9970', textBright: '#5a3a10',
        accent: '#dd8833', gold: '#bb6622',
        resultBg: '#fffbf6', resultBorder: '#e8c8a0',
        tabInactive: '#ddbb88',
    },
    deer: {
        bg: '#f3fbf8', bgCard: '#fbfffd', bgDeep: '#e6f7ef',
        border: '#bfe8d8', borderBright: '#7fcdb0',
        text: '#3a6e5e', textDim: '#9bc9b8', textBright: '#1f4a3c',
        accent: '#5fb89a', gold: '#9b8fd9',
        resultBg: '#fbfffd', resultBorder: '#bfe8d8',
        tabInactive: '#a8d9c8',
    },
};
let _theme = 'dark';
function C() { return THEMES[_theme] || THEMES.dark; }
function saveTheme(t) { _theme = t; const s=getSettings(); s.theme=t; save(); }

const STAT_META = {
    charm:    { label: '🌹', color: '#ff44aa' },
    presence: { label: '👑', color: '#ffaa00' },
    desire:   { label: '🔥', color: '#ff1177' },
    wit:      { label: '🧠', color: '#9900ff' },
    aura:     { label: '⚡', color: '#4488ff' },
};

// ─── 해금 마일스톤 ──────────────────────────
const THEME_UNLOCKS = [
    { id: 'platypus', threshold: 500,  label: '🦆 오리너구리', icon: '🦆' },
    { id: 'deer',     threshold: 1000, label: '🦌 고라니',     icon: '🦌' },
];

// ─── 기본 설정 ─────────────────────────────
const defaultSettings = {
    records: [],
    selectedProfileName: null,
    maxTokens: 4000,
    theme: 'dark',
    points: 100,
    lifetimePoints: 0,
    lastRefillAt: 0,
    unlockedThemes: ['dark', 'light'],
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

// ─── 포인트 / 해금 시스템 ───────────────────
const REFILL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REFILL_AMOUNT = 50;

function checkRefill() {
    const s = getSettings();
    const now = Date.now();
    if (!s.lastRefillAt) { s.lastRefillAt = now; save(); return; }
    const elapsed = now - s.lastRefillAt;
    if (elapsed >= REFILL_INTERVAL_MS) {
        const cycles = Math.floor(elapsed / REFILL_INTERVAL_MS);
        s.points += REFILL_AMOUNT * cycles;
        s.lastRefillAt += REFILL_INTERVAL_MS * cycles;
        save();
        toastr.success(`⏰ 일일 포인트 +${REFILL_AMOUNT*cycles}P 충전!`);
    }
}

function getRefillCountdown() {
    const s = getSettings();
    const next = (s.lastRefillAt || Date.now()) + REFILL_INTERVAL_MS;
    const remain = Math.max(0, next - Date.now());
    const h = Math.floor(remain / 3600000);
    const m = Math.floor((remain % 3600000) / 60000);
    return `${h}h ${m}m`;
}

function checkThemeUnlocks() {
    const s = getSettings();
    let newlyUnlocked = [];
    for (const u of THEME_UNLOCKS) {
        if (s.lifetimePoints >= u.threshold && !s.unlockedThemes.includes(u.id)) {
            s.unlockedThemes.push(u.id);
            newlyUnlocked.push(u);
        }
    }
    if (newlyUnlocked.length) {
        save();
        newlyUnlocked.forEach(u => toastr.success(`🎉 새 테마 해금! ${u.label}`));
    }
    return newlyUnlocked;
}

function addPoints(amount) {
    const s = getSettings();
    s.points = Math.max(0, s.points + amount);
    if (amount > 0) s.lifetimePoints += amount;
    save();
    checkThemeUnlocks();
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
// combatProfile 프롬프트 (파이터당 1회) — 범용화
// ═══════════════════════════════════════════
const COMBAT_PROFILE_SYSTEM =
`You are an all-purpose confrontation analyst specializing in fictional character evaluation.
Analyze the character's full potential across physical, social, and material dimensions — not just combat.
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

Analyze this character across EVERY dimension that could matter in ANY kind of confrontation — physical combat, verbal/social conflict, material/wealth comparison, or purely physical trait comparison. Return ONLY this JSON:
{
  "species": "Species or entity type. If human: state human. If vampire/demi-human/spirit/god/AI/etc: fully analyze that species' inherent physical/supernatural traits, resistances, weaknesses, longevity-derived experience. Korean.",
  "physique": "Precise physical specs — inferred height/weight/build from sheet, age-bracket physical peak, how build translates to combat. Korean.",
  "physical_traits": "General physical/bodily characteristics relevant to non-combat physical comparisons (appearance, build, stamina, any specific traits mentioned in the sheet). If the sheet lacks specifics, reasonably infer from age/job/lifestyle and explicitly note it's an inference. Korean.",
  "job_combat": "Rigorous combat interpretation of the job/role. DO NOT genericize. Korean.",
  "experience": "Combat/conflict experience level in detail. Korean.",
  "skills": "Specific skills — name martial arts styles, weapon types, magic schools, special powers, tactical skills. Korean.",
  "worldsetting": "World/setting the character exists in — modern realistic / fantasy medieval / sci-fi / supernatural / mixed. Korean.",
  "resources": "Wealth, assets, social status, family background, organizational backing, connections/network. If sheet lacks explicit info, infer reasonably from job/background and note it's an inference. Korean.",
  "social_capital": "Charisma, rhetoric/debate skill, persuasiveness, social influence, reputation — relevant for verbal/social confrontations. Korean.",
  "strengths": "3 specific scenarios/conditions where this character has a decisive advantage (any domain — physical, social, material). Korean.",
  "weaknesses": "3 specific scenarios/conditions where this character is at a decisive disadvantage. Be honest. Korean.",
  "psychology": "Combat/conflict psychology — pain threshold, fight-or-flight tendency, performance under stress, confidence under scrutiny. Korean.",
  "background_factors": "Past traumas, special life experiences, grudges, survival history, near-death experiences, or formative wealth/status events that affect drive or ability in confrontation. Korean.",
  "power_ceiling": "What is the absolute maximum this character could do at peak — in whatever domain applies? Korean.",
  "anti_synergy": "What tactics, opponents, or conditions would specifically counter or neutralize this character's strengths? Korean."
}`;
}

// ═══════════════════════════════════════════
// combat 통합 판정 프롬프트 (1회) — 범용화
// ═══════════════════════════════════════════
const COMBAT_SYSTEM =
`You are a serious, all-purpose confrontation analyst. You receive detailed profiles for each participant and a specific confrontation condition — which may be physical combat, verbal conflict, a wealth/status comparison, or a purely physical trait comparison. Write a rigorous analytical report in Korean, selecting only the profile fields relevant to the given condition. No roleplay, no game notation, no story prose — pure analysis.`;

function buildCombatPrompt(fighters, profiles, condition) {
    const fighterBlocks = fighters.map((f, i) => {
        const pr = profiles[i];
        const stats = Object.entries(f.stats||{}).map(([k,v])=>`    ${k}: ${v}`).join('\n');
        return `━━━ FIGHTER ${i+1}: ${f.name} ━━━
[Stats]
${stats}
  TOTAL: ${getTotal(f)}

[Profile]
• Species/Entity: ${pr.species||'—'}
• Physique: ${pr.physique||'—'}
• Physical Traits: ${pr.physical_traits||'—'}
• Job (Combat Interpretation): ${pr.job_combat||'—'}
• Experience: ${pr.experience||'—'}
• Skills: ${pr.skills||'—'}
• World Setting: ${pr.worldsetting||'—'}
• Resources/Status: ${pr.resources||'—'}
• Social Capital: ${pr.social_capital||'—'}
• Strengths: ${pr.strengths||'—'}
• Weaknesses: ${pr.weaknesses||'—'}
• Psychology: ${pr.psychology||'—'}
• Background Factors: ${pr.background_factors||'—'}
• Power Ceiling: ${pr.power_ceiling||'—'}
• Anti-Synergy: ${pr.anti_synergy||'—'}`;
    }).join('\n\n');

    return `[CONFRONTATION CONDITION]
${condition || '기본 대결. 특별한 제약 없음.'}

[PARTICIPANTS — ${fighters.length} fighters]
${fighterBlocks}

First, identify what TYPE of confrontation this condition describes (physical combat / verbal-social / material-wealth / physical-trait comparison / other), then select only the relevant profile fields above for your analysis.

Write the analysis report in Korean in this exact order:

⚔️ 【전력 분석】
For EACH fighter: analyze how their relevant traits (chosen based on the confrontation type) apply specifically to THIS condition. Draw explicit connections. (4-6 sentences per fighter)

🧮 【전황 시뮬레이션】
Simulate how the confrontation actually unfolds from start to finish given the condition. Identify exact turning points and explain WHY they happen based on the fighters' specific traits — not generic outcomes. (8-12 sentences)

⚖️ 【변수 분석】
Identify 3 specific wildcards that could realistically flip the outcome. Be specific to these characters and this condition type. (3-4 sentences)

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
// 배틀 실행 (+ 베팅 정산)
// ═══════════════════════════════════════════
async function runBattle(condition, bet) {
    const fighters = [...state.selectedFighters];
    showLoading('SCANNING FIGHTERS...');

    try {
        const profiles = [];
        for (let i = 0; i < fighters.length; i++) {
            const f = fighters[i];
            updateLoadingMsg(`PROFILING ${f.name.toUpperCase()}... (${i+1}/${fighters.length})`);
            try {
                const raw = await callAI(buildCombatProfilePrompt(f), COMBAT_PROFILE_SYSTEM);
                const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
                profiles.push(parsed);
            } catch {
                profiles.push({
                    species: f.parsed?.traits || '인간',
                    physique: f.parsed?.appearance || '—',
                    physical_traits: f.parsed?.appearance || '—',
                    job_combat: f.parsed?.job || '—',
                    experience: '불명',
                    skills: f.parsed?.traits || '—',
                    worldsetting: '현대 현실',
                    resources: '정보 없음 (추론 불가)',
                    social_capital: '—',
                    strengths: '—', weaknesses: '—',
                    psychology: f.parsed?.personality || '—',
                    background_factors: '—',
                    power_ceiling: '—',
                    anti_synergy: '—',
                });
            }
        }

        updateLoadingMsg('RUNNING SIMULATION...');
        const combatPrompt = buildCombatPrompt(fighters, profiles, condition);
        const resultText   = await callAI(combatPrompt, COMBAT_SYSTEM);

        hideLoading();

        const wm = resultText.match(/【최종 승자:\s*(.+?)\s*\(승률\s*(\d+)%\)】/);
        const winner  = wm ? wm[1].trim() : '???';
        const winRate = wm ? parseInt(wm[2]) : null;

        // 베팅 정산
        let betResult = null;
        if (bet && bet.amount > 0) {
            const won = bet.fighterName === winner;
            if (won) {
                addPoints(bet.amount);
                betResult = { won: true, amount: bet.amount, fighterName: bet.fighterName };
            } else {
                addPoints(-bet.amount);
                betResult = { won: false, amount: bet.amount, fighterName: bet.fighterName };
            }
        }

        const record = {
            id: `battle_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            fighters: fighters.map(f => ({
                id:f.id, name:f.name, gender:f.gender, total:getTotal(f)
            })),
            profiles,
            condition: condition || '기본 대결',
            winner, winRate, resultText,
            bet: betResult,
            createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g, '.'),
        };
        const s = getSettings();
        s.records.unshift(record);
        if (s.records.length > 50) s.records.length = 50;
        save();

        openResultPanel(record);
        renderArenaTab();

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

    panel.style.cssText = `position:fixed;top:80px;left:20px;width:min(500px,90vw);height:80vh;background:${C().bgDeep};border:2px solid ${C().border};border-radius:4px;box-shadow:4px 0 30px #ff440022,0 4px 30px #cc440033;z-index:10100;display:flex;flex-direction:column;resize:both;overflow:hidden;min-width:300px;min-height:300px`;

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

    let betBanner = '';
    if (record.bet) {
        const b = record.bet;
        betBanner = `<div style="font-family:'Press Start 2P',monospace;font-size:11px;text-align:center;padding:10px;border:2px solid ${b.won?C().gold:'#cc3333'}55;border-radius:2px;background:${C().bgCard};letter-spacing:1px;margin-bottom:14px;color:${b.won?C().gold:'#ff5555'}">
            ${b.won ? `🎉 베팅 성공! +${b.amount}P` : `💸 베팅 실패... -${b.amount}P`}
            <div style="font-size:9px;margin-top:4px;color:${C().textDim}">${esc(b.fighterName)}에게 ${b.amount}P 베팅</div>
        </div>`;
    }

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
            ${betBanner}
            <div style="font-family:'Press Start 2P',monospace;font-size:13px;color:${C().gold};text-align:center;padding:14px;border:2px solid ${C().gold}55;border-radius:2px;background:${C().bgCard};letter-spacing:2px;text-shadow:0 0 12px ${C().gold}88;margin-bottom:20px;animation:ba-winner-glow 2s ease-in-out infinite">
                🏆 WINNER: ${esc(winner)} (${winRate}%)
            </div>
            ${body}
        </div>`;
}

// ═══════════════════════════════════════════
// 전투 프로필 미리보기
// ═══════════════════════════════════════════
async function showCombatProfile(char) {
    document.getElementById('ba-combat-profile-panel')?.remove();

    const p   = char.parsed||{};
    const raw = p.raw||[p.appearance,p.personality,p.traits].filter(Boolean).join('\n');

    const prompt = `Character: ${char.name} (${char.gender==='female'?'F':'M'}, ${p.age||'?'}, ${p.job||'?'})
Stats: charm=${char.stats?.charm||50} presence=${char.stats?.presence||50} desire=${char.stats?.desire||50} wit=${char.stats?.wit||50} aura=${char.stats?.aura||50}
Sheet summary: ${raw.slice(0,800)}

Extract a SHORT all-purpose confrontation profile (combat + social + material). Return in Korean, plain text, no JSON:
【종족/신체】 species/build/age-peak in 1 sentence
【직업 전투해석】 how their job translates to combat ability in 1 sentence
【전투 경험】 estimated real combat experience in 1 sentence
【주요 기술】 specific combat skills, weapons, powers in 1 sentence
【재산/지위】 wealth, status, connections — infer if not explicit, note it's inferred
【화술/매력】 rhetoric, charisma, social influence in 1 sentence
【심리】 combat/conflict psychology in 1 sentence
【강점 한줄】 biggest advantage
【약점 한줄】 biggest weakness`;

    const panel = document.createElement('div');
    panel.id = 'ba-combat-profile-panel';
    const pw = Math.min(400, window.innerWidth * 0.9);
    const pl = Math.max(10, (window.innerWidth - pw) / 2);
    panel.style.cssText = `position:fixed;top:60px;left:${pl}px;width:${pw}px;max-height:75vh;background:${C().bgCard};border:2px solid ${C().borderBright};border-radius:4px;box-shadow:0 8px 40px rgba(0,0,0,0.5);z-index:10300;display:flex;flex-direction:column;overflow:hidden`;
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
            'You are an all-purpose confrontation analyst. Extract concise combat AND non-combat (social/material) information. Korean output only.');
        const body = document.getElementById('ba-cp-body');
        if (body) {
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
// 상황 입력 모달 (+ 베팅 섹션)
// ═══════════════════════════════════════════
function showConditionModal() {
    document.getElementById('ba-condition-modal')?.remove();
    checkRefill();
    const s = getSettings();
    const fighters = state.selectedFighters;

    const modal = document.createElement('div');
    modal.id = 'ba-condition-modal';
    const mw = Math.min(380, window.innerWidth * 0.9);
    const ml = Math.max(10, (window.innerWidth - mw) / 2);
    const mt = Math.max(10, Math.min(window.innerHeight * 0.1, window.innerHeight - 480));
    modal.style.cssText = `position:fixed;top:${mt}px;left:${ml}px;width:${mw}px;max-height:85vh;overflow-y:auto;background:${C().bgCard};border:2px solid ${C().borderBright};border-radius:4px;box-shadow:0 8px 40px rgba(0,0,0,0.5);z-index:10200;display:flex;flex-direction:column`;

    const betFighterOpts = fighters.map(f =>
        `<option value="${esc(f.id)}" data-name="${esc(f.name)}">${esc(f.name)}</option>`
    ).join('');

    modal.innerHTML = `
        <div id="ba-cond-drag" style="background:${C().bg};border-bottom:1px solid ${C().border};padding:10px 14px;display:flex;align-items:center;gap:8px;cursor:move;flex-shrink:0;user-select:none">
            <span style="font-size:14px">⚔️</span>
            <div style="flex:1;font-family:'Press Start 2P',monospace;font-size:9px;color:${C().accent};letter-spacing:1px">BATTLE CONDITION</div>
            <button id="ba-cond-cancel" style="background:none;border:1px solid ${C().border};border-radius:2px;color:${C().textDim};cursor:pointer;font-size:11px;padding:2px 7px;font-family:monospace;line-height:1">✕</button>
        </div>
        <div style="padding:16px">
            <textarea id="ba-cond-ta" placeholder="어떤 상황에서 싸우나요?&#10;예) 좁은 골목 야간 칼싸움. 양쪽 단도 1자루.&#10;예) 법정 최후변론 대결.&#10;예) 재산/자산 규모 대결.&#10;예) 외모/신체 비교.&#10;비워두면 기본 대결로 진행합니다." rows="5"
                style="width:100%;background:${C().bg};border:1px solid ${C().border};border-radius:2px;padding:10px;color:${C().text};font-size:12px;font-family:system-ui;line-height:1.8;resize:vertical;outline:none;box-sizing:border-box;min-height:90px"></textarea>

            <div style="display:flex;align-items:center;gap:8px;margin:14px 0 10px">
                <div style="flex:1;height:1px;background:linear-gradient(90deg,${C().accent}44,transparent)"></div>
                <div style="font-size:10px;color:${C().borderBright};letter-spacing:2px;font-family:'Press Start 2P',monospace">🎲 BET</div>
                <div style="flex:1;height:1px;background:linear-gradient(270deg,${C().accent}44,transparent)"></div>
            </div>

            <div style="background:${C().bgDeep};border:1px solid ${C().border};border-radius:2px;padding:10px;margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${C().textDim};margin-bottom:8px">
                    <span>보유 포인트: <b style="color:${C().gold}">${s.points}P</b></span>
                    <span style="font-size:9px">⏰ 다음 충전 ${getRefillCountdown()}</span>
                </div>
                <select id="ba-bet-fighter" style="width:100%;background:${C().bgCard};border:1px solid ${C().border};border-radius:2px;color:${C().text};font-size:12px;padding:6px 8px;font-family:system-ui;outline:none;margin-bottom:8px">
                    <option value="">베팅 안 함</option>
                    ${betFighterOpts}
                </select>
                <input id="ba-bet-amount" type="number" min="0" max="${s.points}" step="5" placeholder="베팅 포인트 (0~${s.points})"
                    style="width:100%;background:${C().bgCard};border:1px solid ${C().border};border-radius:2px;color:${C().text};font-size:12px;padding:6px 8px;font-family:system-ui;outline:none;box-sizing:border-box">
            </div>

            <button id="ba-cond-go" style="width:100%;margin-top:6px;padding:12px;background:${C().accent};border:none;border-radius:2px;color:#fff;cursor:pointer;font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:2px">⚔️  FIGHT!</button>
        </div>`;

    document.body.appendChild(modal);
    makeDraggable(modal, document.getElementById('ba-cond-drag'));

    document.getElementById('ba-cond-cancel')?.addEventListener('click', ()=>modal.remove());
    document.getElementById('ba-cond-go')?.addEventListener('click', async ()=>{
        const cond = document.getElementById('ba-cond-ta')?.value.trim()||'';
        const betSelect = document.getElementById('ba-bet-fighter');
        const betAmountInput = document.getElementById('ba-bet-amount');
        const fighterId = betSelect?.value || '';
        let bet = null;
        if (fighterId) {
            const amount = parseInt(betAmountInput?.value) || 0;
            const cur = getSettings();
            if (amount <= 0) {
                toastr.warning('베팅 포인트를 1 이상 입력하세요');
                return;
            }
            if (amount > cur.points) {
                toastr.error('보유 포인트보다 많이 베팅할 수 없어요');
                return;
            }
            const fighterName = betSelect.options[betSelect.selectedIndex]?.dataset.name;
            bet = { fighterId, fighterName, amount };
        }
        modal.remove();
        await runBattle(cond, bet);
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
    checkRefill();
    const roster   = getRoster();
    const fighters = state.selectedFighters;
    const canFight = fighters.length >= 2;
    const s = getSettings();

    const lines = fighters.length >= 2
        ? getPositions(fighters.length).map((p,i,arr)=>{
            const nx=arr[(i+1)%arr.length];
            return `<line x1="${p.x}" y1="${p.y}" x2="${nx.x}" y2="${nx.y}" stroke="${C().accent}22" stroke-width="1" stroke-dasharray="4 4"/>`;
          }).join('')
        : '';

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
                <div class="ba-slot-ring" style="width:54px;height:54px;border-radius:50%;border:2px solid ${gc};overflow:hidden;background:${C().bgCard};box-shadow:0 0 8px ${gc}66;transition:all 0.2s">${inner}</div>
                <div style="font-size:13px;color:${C().accent};letter-spacing:1px;text-align:center;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</div>
                <div style="font-size:13px;color:${C().textDim};font-family:'Press Start 2P',monospace">${getTotal(f)}</div>
            </div>`;
          }).join('');

    const badges = canFight
        ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;justify-content:center">
            ${fighters.map(f=>`<div style="display:flex;align-items:center;gap:4px;background:${C().bgCard};border:1px solid ${C().border};border-radius:2px;padding:4px 8px">
                <span style="font-size:11px;color:${C().textBright};font-family:monospace">${esc(f.name)}</span>
                <span style="font-size:11px;color:${C().accent};font-family:'Press Start 2P',monospace">${getTotal(f)}</span>
            </div>`).join('')}
           </div>`
        : '';

    const cards = roster.length===0
        ? `<div style="text-align:center;color:${C().textDim};font-size:11px;padding:20px 0;letter-spacing:1px;line-height:3">NO FIGHTERS IN ROSTER<br><span style="font-size:13px;color:${C().textDim}">Add characters via Scouter first</span></div>`
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
                    <div style="flex:1;height:4px;background:${C().bgDeep};border-radius:1px;overflow:hidden;border:1px solid ${C().border}">
                        <div style="width:${v}%;height:100%;background:${STAT_META[k]?.color||C().accent};border-radius:1px;transition:width 0.6s"></div>
                    </div>
                    <div style="font-size:13px;width:18px;text-align:right;color:${C().accent};flex-shrink:0">${v}</div>
                </div>`).join('');
            return `<div class="ba-char-card" data-id="${char.id}"
                style="background:${sel?C().bgCard:C().bg};border:1px solid ${sel?C().accent:C().border};border-radius:2px;padding:8px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;margin-bottom:5px;transition:all 0.15s;${sel?`box-shadow:0 0 8px ${C().accent}33`:''}">
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

    const pointsHeader = `
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 14px;background:${C().bgDeep};border-bottom:1px solid ${C().border}">
            <span style="font-family:'Press Start 2P',monospace;font-size:11px;color:${C().gold}">💰 ${s.points}P</span>
            <span style="font-size:10px;color:${C().textDim}">⏰ ${getRefillCountdown()}</span>
        </div>`;

    content.innerHTML = `
        ${pointsHeader}
        <div style="padding:14px 14px 8px;display:flex;flex-direction:column;align-items:center">
            <div style="position:relative;width:200px;height:200px;margin:0 auto;flex-shrink:0">
                <svg viewBox="0 0 200 200" style="position:absolute;inset:0;width:100%;height:100%">
                    <circle cx="100" cy="100" r="92" fill="${C().bgDeep}" stroke="${C().border}" stroke-width="1"/>
                    <circle cx="100" cy="100" r="90" fill="none" stroke="${C().border}" stroke-width="2" stroke-dasharray="8 4" class="ba-pulse-ring"/>
                    <circle cx="100" cy="100" r="80" fill="none" stroke="${C().bgDeep}" stroke-width="1"/>
                    <line x1="100" y1="10" x2="100" y2="190" stroke="${C().border}" stroke-width="1" opacity="0.4"/>
                    <line x1="10" y1="100" x2="190" y2="100" stroke="${C().border}" stroke-width="1" opacity="0.4"/>
                    <text x="100" y="106" text-anchor="middle" fill="${C().border}" font-size="18" font-family="monospace">⚔️</text>
                    ${lines}
                </svg>
                ${slots}
            </div>
            ${badges}
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin:12px 14px 10px">
            <div style="flex:1;height:1px;background:linear-gradient(90deg,${C().accent}44,transparent)"></div>
            <div style="font-size:10px;color:${C().borderBright};letter-spacing:2px;font-family:'Press Start 2P',monospace">SELECT FIGHTERS</div>
            <div style="flex:1;height:1px;background:linear-gradient(270deg,${C().accent}44,transparent)"></div>
        </div>

        <div style="padding:0 14px 6px">${cards}</div>

        <button id="ba-fight-btn" ${canFight?'':'disabled'}
            style="display:block;width:calc(100% - 28px);margin:0 14px 14px;padding:12px;background:${canFight?C().bgCard:C().bg};border:2px solid ${canFight?C().borderBright:C().border};border-radius:2px;color:${canFight?C().accent:C().textDim};font-family:'Press Start 2P',monospace;font-size:13px;letter-spacing:2px;cursor:${canFight?'pointer':'not-allowed'};text-shadow:${canFight?`0 0 8px ${C().accent}88`:'none'};box-shadow:${canFight?`0 0 12px ${C().accent}33`:'none'};opacity:${canFight?1:0.4};transition:all 0.15s">
            ${canFight?`⚔️  FIGHT  (${fighters.length} FIGHTERS)`:fighters.length===0?'SELECT 2+ FIGHTERS':`SELECT ${2-fighters.length} MORE`}
        </button>`;

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
                    ${r.bet ? `<span style="color:${r.bet.won?C().gold:'#ff5555'};margin-left:6px">${r.bet.won?'+':'-'}${r.bet.amount}P</span>` : ''}
                </div>
                <div style="font-size:10px;color:${C().textDim};margin-top:2px">${esc(r.fighters.map(f=>f.name).join(' VS '))}</div>
                <div style="font-size:13px;color:${C().textDim};margin-top:2px">${esc((r.condition||'').slice(0,40))}${(r.condition||'').length>40?'...':''}</div>
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
    checkRefill();
    const ctx = SillyTavern.getContext();
    const s   = getSettings();
    const profiles = ctx.extensionSettings?.['connectionManager']?.profiles || [];
    const saved    = s.selectedProfileName || '';

    const themeButtons = [
        { id:'dark',     label:'🌙 다크',   always:true },
        { id:'light',    label:'☀️ 라이트', always:true },
        ...THEME_UNLOCKS.map(u=>({ id:u.id, label:u.label, always:false, threshold:u.threshold })),
    ];

    const themeButtonsHtml = themeButtons.map(t => {
        const unlocked = t.always || s.unlockedThemes.includes(t.id);
        const active = _theme === t.id;
        return `<button class="ba-theme-pick" data-theme="${t.id}" ${unlocked?'':'disabled'}
            style="padding:8px 6px;background:${active?C().accent:C().bgCard};border:1px solid ${active?C().accent:C().border};border-radius:2px;color:${active?'#fff':unlocked?C().text:C().textDim};font-size:10px;font-family:system-ui;cursor:${unlocked?'pointer':'not-allowed'};opacity:${unlocked?1:0.5};position:relative">
            ${t.label}${!unlocked?`<div style="font-size:8px;margin-top:2px">🔒 ${t.threshold}P</div>`:''}
        </button>`;
    }).join('');

    content.innerHTML = `<div style="padding:16px;font-family:system-ui,sans-serif">
        <div style="font-size:9px;font-family:'Press Start 2P',monospace;color:${C().borderBright};letter-spacing:2px;border-bottom:1px solid ${C().border};padding-bottom:6px;margin-bottom:12px">💰 POINTS</div>
        <div style="background:${C().bgDeep};border:1px solid ${C().border};border-radius:2px;padding:12px;margin-bottom:14px;text-align:center">
            <div style="font-family:'Press Start 2P',monospace;font-size:18px;color:${C().gold}">${s.points}P</div>
            <div style="font-size:10px;color:${C().textDim};margin-top:4px">누적 ${s.lifetimePoints}P · 다음 충전 ${getRefillCountdown()}</div>
        </div>

        <div style="font-size:9px;font-family:'Press Start 2P',monospace;color:${C().borderBright};letter-spacing:2px;border-bottom:1px solid ${C().border};padding-bottom:6px;margin-bottom:10px">🎨 THEMES</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px">
            ${themeButtonsHtml}
        </div>

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

    document.querySelectorAll('.ba-theme-pick').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            if (btn.disabled) return;
            const wasTab = state.currentTab;
            saveTheme(btn.dataset.theme);
            closePanel();
            openPanel();
            if (wasTab !== 'arena') switchTab(wasTab);
        });
    });

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
        panel.style.transform='none';
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
                <div style="font-size:13px;font-weight:900;letter-spacing:2px;background:linear-gradient(90deg,${C().accent},${C().gold},${C().accent});background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:ba-shimmer 2s linear infinite" class="ba-flicker">챗틀로얄</div>
                <div style="font-size:8px;color:${C().textDim};letter-spacing:1px;margin-top:1px">COLOSSEUM v2.0</div>
            </div>
            <button id="ba-theme-btn" title="테마 전환" style="background:none;border:1px solid ${C().border};border-radius:2px;cursor:pointer;font-size:13px;padding:2px 6px;color:${C().textDim};line-height:1">${_theme==='dark'?'☀️':'🌙'}</button>
            <button id="ba-close" style="background:none;border:1px solid ${C().border};border-radius:2px;color:${C().textDim};cursor:pointer;font-size:11px;padding:2px 7px;font-family:monospace;line-height:1">✕</button>
        </div>
        <div id="ba-tabs" style="display:flex;background:${C().bgCard};border-bottom:1px solid ${C().border};flex-shrink:0">
            <button class="ba-tab active" data-tab="arena" style="flex:1;background:none;border:none;border-bottom:2px solid ${C().accent};padding:8px 0;cursor:pointer;color:${C().accent};font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:1px;text-shadow:0 0 6px ${C().accent}66">⚔️ ARENA</button>
            <button class="ba-tab" data-tab="records" style="flex:1;background:none;border:none;border-bottom:2px solid transparent;padding:8px 0;cursor:pointer;color:${C().tabInactive};font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:1px">📜 RECORDS</button>
            <button class="ba-tab" data-tab="settings" style="flex:1;background:none;border:none;border-bottom:2px solid transparent;padding:8px 0;cursor:pointer;color:${C().tabInactive};font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:1px">⚙️ CONFIG</button>
        </div>
        <div id="ba-content" style="flex:1;overflow-y:auto;overflow-x:hidden;position:relative"></div>
        <div id="ba-resize" style="position:absolute;bottom:0;right:0;width:22px;height:22px;cursor:se-resize;display:flex;align-items:flex-end;justify-content:flex-end;padding:3px;opacity:0.4;font-size:14px;user-select:none;color:${C().border};touch-action:none">⇲</div>`;

    document.body.appendChild(panel);
    makeDraggable(panel, document.getElementById('ba-drag-handle'));
    makeResizable(panel, document.getElementById('ba-resize'));

    panel.querySelectorAll('.ba-tab').forEach(btn=>{
        btn.addEventListener('click',()=>{
            panel.querySelectorAll('.ba-tab').forEach(b=>{
                b.classList.remove('active');
                b.style.color=C().tabInactive;
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
        const next = _theme === 'dark' ? 'light' : 'dark';
        saveTheme(next);
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
    checkRefill();

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
        const btn = document.createElement('div');
        btn.id = 'ba-wand-btn';
        btn.title = '챗틀로얄';
        btn.style.cssText = 'cursor:pointer;padding:4px 8px;display:flex;align-items:center;gap:5px;font-size:13px;position:fixed;bottom:70px;right:20px;z-index:9000;background:#1a0800;border:2px solid #884400;border-radius:50%;width:50px;height:50px;justify-content:center;box-shadow:0 4px 16px rgba(255,100,0,0.3)';
        btn.innerHTML = '<span style="font-size:22px">⚔️</span>';

        const candidates = [
            'extensionsMenu', 'top-bar', 'top-settings-holder',
            'rightSendForm', 'send_form', 'leftSendForm',
        ];
        let target = null;
        for (const id of candidates) {
            const el = document.getElementById(id);
            if (el) { target = el; break; }
        }

        if (target) {
            btn.style.position = 'static';
            btn.style.width = 'auto';
            btn.style.height = 'auto';
            btn.style.borderRadius = '2px';
            btn.style.boxShadow = 'none';
            btn.innerHTML = '<span>⚔️</span><span style="font-size:12px;margin-left:4px">챗틀로얄</span>';
            target.appendChild(btn);
        } else {
            document.body.appendChild(btn);
        }

        btn.addEventListener('click', togglePanel);
        console.log(`[${MODULE_NAME}] 버튼 삽입 위치:`, target ? target.id : 'fallback floating button');
    }

    document.addEventListener('keydown', e=>{ if(e.key==='Escape'&&state.isPanelOpen) closePanel(); });
    console.log(`[${MODULE_NAME}] ready`);
}

jQuery(async () => {
    const ctx = SillyTavern.getContext();
    ctx.eventSource.on(event_types.APP_READY, async ()=>{ await onActivate(); });
});
