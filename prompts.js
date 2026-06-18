/**
 * ⚔️ 챗틀로얄 — 프롬프트 설정 파일
 * ═══════════════════════════════════════════════════════
 * 이 파일만 수정하면 AI 분석 방식을 바꿀 수 있습니다.
 *
 * 호출 구조:
 *   1단계) COMBAT_PROFILE — 파이터당 1회, 전투/사회/재산 특성 JSON 추출
 *   2단계) COMBAT_FINAL   — 전체 파이터 프로파일 통합 → 최종 판정 리포트
 *   (+ 미리보기) COMBAT_PREVIEW — ⚔️ 버튼 누르면 보이는 짧은 텍스트 프로필
 *
 * 변수 (index.js의 fillTpl()이 자동 주입):
 *
 *  COMBAT_PROFILE_USER:
 *   {{name}}      캐릭터 이름
 *   {{gender}}    Female / Male
 *   {{age}}       나이
 *   {{job}}       직업/역할
 *   {{location}}  배경/지역
 *   {{stats}}     스탯 수치 문자열
 *   {{sheet}}     원본 캐릭터 시트 (최대 1800자)
 *
 *  COMBAT_FINAL_USER:
 *   {{condition}}     배틀 조건/상황 (자유 텍스트 — 전투, 재산, 외모, 화술 등 무엇이든)
 *   {{fighterCount}}  파이터 수
 *   {{fighters}}      전체 파이터 프로파일 블록
 *
 *  COMBAT_PREVIEW_USER:
 *   {{name}} {{gender}} {{age}} {{job}} {{stats}} {{sheet}}
 *
 * ⚠️ 반환 JSON 필드를 추가/수정하면 index.js의 buildCombatPrompt() 안
 *    fighterBlocks 출력부도 같이 맞춰서 수정해야 합니다.
 * ⚠️ 섹션 헤더(⚔️🧮⚖️🏆)를 바꾸면 REPORT_SECTIONS와
 *    index.js의 formatResult() 정규식 파싱도 같이 수정하세요.
 * ⚠️ 마지막 줄 형식 【최종 승자: [name] (승률 [XX]%)】은
 *    승자/배팅 정산 파싱에 필수이므로 형식을 유지해야 합니다.
 * ═══════════════════════════════════════════════════════
 */

// ───────────────────────────────────────────────────────
// 1단계: 전투/사회/재산 프로파일 분석 (파이터당 1회 호출)
// 반환: JSON (하단 스키마 참조)
// ───────────────────────────────────────────────────────
export const COMBAT_PROFILE_SYSTEM =
`You are an all-purpose confrontation analyst specializing in fictional character evaluation.
Analyze the character's full potential across physical, social, and material dimensions — not just combat.
Return ONLY valid JSON — no markdown, no code blocks, no extra text.`;

export const COMBAT_PROFILE_USER =
`Character name: {{name}}
Gender: {{gender}}
Age: {{age}}
Job/Role: {{job}}
Location/Background: {{location}}
Stats (each 0–100): {{stats}}

Full character sheet:
{{sheet}}

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

// ───────────────────────────────────────────────────────
// 2단계: 통합 판정 (1회 호출)
// 반환: 한국어 분석 리포트 (섹션 헤더 포함)
// ───────────────────────────────────────────────────────
export const COMBAT_FINAL_SYSTEM =
`You are a serious, all-purpose confrontation analyst. You receive detailed profiles for each participant and a specific confrontation condition — which may be physical combat, verbal conflict, a wealth/status comparison, a specific physical trait comparison (including precise/numeric measurements), or any other criterion the user specifies.

CRITICAL RULE: You must judge the confrontation using EXACTLY the criterion stated in the condition. Do NOT substitute it with a different, more comfortable type of contest (e.g. do NOT turn a stated physical/numeric comparison into a verbal argument, debate, or "war of words" instead). If the condition names a specific metric, attribute, or measurement, your analysis and final verdict must be based on THAT metric.

If the character profiles do not contain explicit data for the requested metric, invent a precise, plausible, internally-consistent fictional value or description for each character — consistent with their species/physique/background — and state it as a concrete fact for the purposes of this analysis. Do not hedge, do not say "정보가 없어 판단할 수 없다", do not deflect to a generic personality-based outcome. Commit fully to the requested comparison.

Write a rigorous analytical report in Korean, selecting only the profile fields relevant to the given condition. No roleplay, no game notation, no story prose — pure analysis.`;

export const COMBAT_FINAL_USER =
`[CONFRONTATION CONDITION]
{{condition}}

[PARTICIPANTS — {{fighterCount}} fighters]
{{fighters}}

First, classify this confrontation as either:
(A) DYNAMIC — something that unfolds over time through actions/exchanges (physical combat, a chase, a verbal back-and-forth debate, a multi-round contest), or
(B) STATIC COMPARISON — something that is simply a direct comparison of a fixed attribute/value (wealth, net worth, status, a physical measurement, age, height, or any other single criterion that doesn't actually play out as a sequence of events).

Then select only the relevant profile fields above for your analysis.

IMPORTANT: The condition above specifies the EXACT criterion for this confrontation. You must judge fighters strictly on that criterion. Do not substitute it with a different, safer type of contest (for example, do not turn a stated physical/numeric comparison into a verbal argument or general personality contest). If the profiles lack a specific data point the condition asks about, invent a concrete, plausible, internally-consistent value for each fighter and treat it as established fact for this analysis — do not hedge or deflect.

Write the analysis report in Korean in this exact order:

⚔️ 【전력 분석】
For EACH fighter: analyze how their relevant traits (chosen based on the confrontation type) apply specifically to THIS exact condition. Draw explicit connections. (4-6 sentences per fighter)

🧮 【전황 시뮬레이션】
If this is a DYNAMIC confrontation: simulate how it actually unfolds from start to finish given the EXACT condition, with exact turning points and why they happen based on the fighters' specific traits. (8-12 sentences)
If this is a STATIC COMPARISON: do NOT write a narrative or simulated sequence of events. Instead, state each fighter's concrete value/standing for the compared attribute side-by-side (e.g. "A: 약 OOO / B: 약 OOO"), then briefly explain in 2-3 sentences why the comparison favors one side. Keep this section short — no invented scenes, no turns, no dramatization.

⚖️ 【변수 분석】
Identify 3 specific wildcards that could realistically flip the outcome. Be specific to these characters and this exact condition. (3-4 sentences)

🏆 【최종 판정】
State winner and clear reasoning based strictly on the stated condition. If multiple fighters, rank all.
Last line must be exactly:
【최종 승자: [name] (승률 [XX]%)】`;

// ───────────────────────────────────────────────────────
// 전투 프로필 미리보기 (⚔️ 버튼 — 짧은 단일 캐릭터 분석)
// 반환: 한국어 plain text (JSON 아님)
// ───────────────────────────────────────────────────────
export const COMBAT_PREVIEW_SYSTEM =
`You are an all-purpose confrontation analyst. Extract concise combat AND non-combat (social/material) information. Korean output only.`;

export const COMBAT_PREVIEW_USER =
`Character: {{name}} ({{gender}}, {{age}}, {{job}})
Stats: {{stats}}
Sheet summary: {{sheet}}

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

// ───────────────────────────────────────────────────────
// 로딩 메시지 (순서대로 표시됨)
// ───────────────────────────────────────────────────────
export const LOADING_STEPS = [
    'SCANNING FIGHTERS...',
    'ANALYZING COMBAT PROFILE...',
    'CALCULATING POWER LEVELS...',
    'RUNNING SIMULATION...',
    'DETERMINING OUTCOME...',
];

// ───────────────────────────────────────────────────────
// 결과 리포트 섹션 정의
// icon + key 는 COMBAT_FINAL_USER의 헤더와 일치해야 합니다.
// ───────────────────────────────────────────────────────
export const REPORT_SECTIONS = [
    { icon: '⚔️', key: '전력 분석' },
    { icon: '🧮', key: '전황 시뮬레이션' },
    { icon: '⚖️', key: '변수 분석' },
    { icon: '🏆', key: '최종 판정' },
];
