/**
 * ⚔️ 챗틀로얄 — 프롬프트 설정 파일
 * ═══════════════════════════════════════════════════════
 * 이 파일만 수정하면 AI 분석 방식을 바꿀 수 있습니다.
 *
 * 호출 구조:
 *   1단계) COMBAT_PROFILE — 파이터당 1회, 전투 특성 JSON 추출
 *   2단계) COMBAT_FINAL   — 전체 파이터 프로파일 통합 → 최종 판정 리포트
 *
 * 변수 (buildCombatProfilePrompt에서 자동 주입):
 *   {{name}}      캐릭터 이름
 *   {{gender}}    Female / Male
 *   {{age}}       나이
 *   {{job}}       직업/역할
 *   {{location}}  배경/지역
 *   {{stats}}     스탯 수치 문자열
 *   {{sheet}}     원본 캐릭터 시트 (최대 1800자)
 *
 * 변수 (buildCombatPrompt에서 자동 주입):
 *   {{condition}}     배틀 조건/상황
 *   {{fighterCount}}  파이터 수
 *   {{fighters}}      전체 파이터 프로파일 블록
 * ═══════════════════════════════════════════════════════
 */

// ───────────────────────────────────────────────────────
// 1단계: 전투 프로파일 분석 (파이터당 1회 호출)
// 반환: JSON (하단 스키마 참조)
// ───────────────────────────────────────────────────────
export const COMBAT_PROFILE_SYSTEM =
`You are a combat analyst specializing in fictional character evaluation.
Analyze the character's full combat/conflict potential from every possible angle.
Return ONLY valid JSON — no markdown, no code blocks, no extra text.`;

/**
 * buildCombatProfilePrompt(char) 에서 이 템플릿을 사용합니다.
 * char.parsed.raw → {{sheet}}
 * 반환 JSON 필드를 추가/수정하면 buildCombatPrompt의 블록도 같이 수정하세요.
 */
export const COMBAT_PROFILE_USER =
`Character name: {{name}}
Gender: {{gender}}
Age: {{age}}
Job/Role: {{job}}
Location/Background: {{location}}
Stats (each 0–100): {{stats}}

Full character sheet:
{{sheet}}

Analyze this character's full combat/conflict potential and return ONLY this JSON:
{
  "species": "Species or entity type. If human: state human. If vampire/demi-human/spirit/god/AI/etc: fully analyze that species' inherent physical/supernatural traits, resistances, weaknesses, longevity-derived experience. Korean.",
  "physique": "Precise physical specs — inferred height/weight/build from sheet, age-bracket physical peak (20s explosive/30s prime/40s veteran/50s+ experience-over-power), how build translates to combat. Examples: linebacker=short burst explosive power + high pain tolerance; swimmer=endurance + reach; wizard=physical frailty + sedentary. Korean.",
  "job_combat": "Rigorous combat interpretation of the job/role. DO NOT genericize. Examples: wide receiver→explosive burst speed, jump ball, zero combat training; SAS operator→CQC muscle memory, real kill experience, cold-blooded; mafia boss→tactical command, intimidation, low direct combat but resources; court magician→magic power but physically weak. Korean.",
  "experience": "Combat/conflict experience level in detail — total civilian / street brawls / trained military / real warzone / assassin-grade / superhuman veteran. Estimate real fight count if inferrable. Korean.",
  "skills": "Specific skills — name martial arts styles, weapon types, magic schools, special powers, tactical skills. Be precise: 'Muay Thai + wrestling clinch' not just 'fighting'. Korean.",
  "worldsetting": "World/setting the character exists in — modern realistic / fantasy medieval / sci-fi / supernatural / mixed. Defines what rules apply: firearms exist? magic? superhuman healing? tech augmentation? Korean.",
  "strengths": "3 specific scenarios/conditions where this character has a decisive advantage. Tie to actual traits. Korean.",
  "weaknesses": "3 specific scenarios/conditions where this character is at a decisive disadvantage. Be honest. Korean.",
  "psychology": "Combat psychology — pain threshold, fight-or-flight tendency, performance under mortal stress, history of breaking or holding under pressure, berserker tendency or cold calculation. Korean.",
  "background_factors": "Past traumas, special life experiences, grudges, survival history, near-death experiences that affect combat ability or fighting drive. Korean.",
  "power_ceiling": "What is the absolute maximum this character could do at peak — what would their strongest moment look like? Korean.",
  "anti_synergy": "What tactics or opponents would specifically counter or neutralize this character's strengths? Korean."
}`;

// ───────────────────────────────────────────────────────
// 2단계: 통합 전투 판정 (1회 호출)
// 반환: 한국어 분석 리포트 (섹션 헤더 포함)
// ───────────────────────────────────────────────────────
export const COMBAT_FINAL_SYSTEM =
`You are a serious combat and conflict analyst. You receive detailed combat profiles for each participant and a specific conflict condition. Write a rigorous analytical report in Korean. No roleplay, no game notation, no story prose — pure analysis.`;

/**
 * 섹션 헤더 형식을 바꾸면 index.js의 formatResult() 섹션 파싱도 같이 수정하세요.
 * 마지막 줄 형식 【최종 승자: [name] (승률 [XX]%)】은 승자 파싱에 필수입니다.
 */
export const COMBAT_FINAL_USER =
`[CONFLICT CONDITION]
{{condition}}

[PARTICIPANTS — {{fighterCount}} fighters]
{{fighters}}

Write the analysis report in Korean in this exact order:

⚔️ 【전력 분석】
For EACH fighter: analyze how their species, physique, job, skills, and psychology apply specifically to THIS condition. Draw explicit connections between their traits and the condition's demands. (4–6 sentences per fighter)

🧮 【전황 시뮬레이션】
Simulate how the confrontation actually unfolds from start to finish given the condition. Identify exact turning points and explain WHY they happen based on the fighters' specific traits — not generic outcomes. (8–12 sentences)

⚖️ 【변수 분석】
Identify 3 specific wildcards that could realistically flip the outcome — psychology breaks, terrain factors, species-specific vulnerabilities, emotional triggers from background. Be specific to these characters. (3–4 sentences)

🏆 【최종 판정】
State winner and clear reasoning. If multiple fighters, rank all.
Last line must be exactly:
【최종 승자: [name] (승률 [XX]%)】`;

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
// 상황 설정 빠른선택 칩 목록
// ───────────────────────────────────────────────────────
export const CONDITION_CHIPS = [
    '맨손 격투', '무기 결투', '총기 전투', '칼싸움',
    '말싸움 / 설전', '협상 / 심리전', '법정 공방',
    '전쟁터 / 전면전', '암살 임무', '서바이벌',
    '술집 패싸움', '체스 / 두뇌 게임',
    '마법 결투', '정치 권력 싸움', '스포츠 대결',
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
