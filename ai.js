(function () {
  'use strict';

  // ── Utilities ───────────────────────────────────────────────────────────────

  function safeJsonParse(text) {
    try { return JSON.parse(text); } catch {}
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch {}
    }
    return null;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function normalizeWeights(weights) {
    const defaults = { skills: 0.4, keywords: 0.3, phrases: 0.15, title_alignment: 0.1, formatting: 0.05 };
    const merged   = { ...defaults, ...(weights || {}) };
    const sum      = Object.values(merged).reduce((s, v) => s + (Number(v) || 0), 0) || 1;
    const out = {};
    for (const [k, v] of Object.entries(merged)) out[k] = clamp((Number(v) || 0) / sum, 0, 1);
    return out;
  }

  // ── API callers ─────────────────────────────────────────────────────────────

  async function callOpenRouter({ apiKey, model, systemPrompt, userPrompt }) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'openrouter/auto',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   }
        ]
      })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  async function callGemini({ apiKey, model, systemPrompt, userPrompt }) {
    const m   = model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0.2 },
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
      })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini error ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
  }

  async function callAI({ provider, apiKey, model, systemPrompt, userPrompt }) {
    return provider === 'gemini'
      ? callGemini({ apiKey, model, systemPrompt, userPrompt })
      : callOpenRouter({ apiKey, model, systemPrompt, userPrompt });
  }

  // ── Domain inference ────────────────────────────────────────────────────────

  function inferDomainFromText(text = '', title = '') {
    const t = `${text} ${title}`.toLowerCase();
    if (/machine learning|deep learning|nlp|computer vision|pytorch|tensorflow/.test(t)) return 'machine_learning';
    if (/data science|analytics|pandas|numpy|statistics|sql|power bi|tableau/.test(t))   return 'data_science';
    if (/react|frontend|ui|javascript|css|html/.test(t))                                  return 'frontend';
    if (/node|java|spring|backend|api|microservice/.test(t))                              return 'backend';
    if (/full stack|fullstack/.test(t))                                                   return 'full_stack';
    if (/devops|kubernetes|docker|terraform|ci\/cd/.test(t))                              return 'devops';
    if (/product manager|product management|roadmap|stakeholder/.test(t))                 return 'product';
    if (/business analyst|report|dashboard|excel|operations|process improvement/.test(t)) return 'business_analyst';
    return 'other';
  }

  // ── Prompt 1: ATS Scoring Profile ──────────────────────────────────────────

  function buildScoringPrompt(jdText, jobTitle, baseResult) {
    const jd      = (jdText || '').slice(0, 10000);
    const matched = (baseResult?.matchedKeywords || []).slice(0, 25).join(', ') || 'none';
    const missing = (baseResult?.missingKeywords || []).slice(0, 25).join(', ') || 'none';

    const system = `You are a strict ATS auditor. Return STRICT JSON ONLY — no markdown, no prose, no code fences.`;

    const user = `Analyze the following job description for ATS scoring.

JSON schema (exact keys, no extras):
{
  "domain": "backend|frontend|full_stack|data_science|machine_learning|devops|business_analyst|product|other",
  "seniority": "intern|junior|mid|senior|lead|unknown",
  "must_have_skills": ["max 12 items"],
  "nice_to_have_skills": ["max 12 items"],
  "keyword_boosts": ["max 20 high-value ATS keywords from JD"],
  "negative_keywords": ["max 20 irrelevant/noise keywords"],
  "weights": {"skills":0.0,"keywords":0.0,"phrases":0.0,"title_alignment":0.0,"formatting":0.0},
  "ai_score": 0,
  "confidence": 0.0
}

SCORING RUBRIC:
- 90-100: near-perfect match, explicit evidence for almost all critical requirements
- 75-89: strong match, clear minor gaps
- 55-74: moderate fit, several must-have gaps
- 35-54: weak fit, many missing must-haves
- 0-34: poor fit

HARD RULES:
1. Penalize missing must-have skills heavily
2. Ignore boilerplate hiring language
3. Prefer concrete technical terms over generic words
4. Do not reward buzzwords without direct relevance
5. ai_score must be integer 0-100
6. weights must sum ~1.0
7. Never inflate scores — be brutally honest

Job Title: ${jobTitle || 'Unknown'}
Base Score (keyword matcher): ${baseResult?.score ?? '-'}
Already Matched Keywords: ${matched}
Missing Keywords: ${missing}

Job Description:
${jd}`;

    return { system, user };
  }

  // ── Prompt 2: Actionable Resume Recommendations ─────────────────────────────

  function buildRecommendationsPrompt({ jdText, jobTitle, resumeText, aiProfile, baseResult }) {
    const jd     = (jdText     || '').slice(0, 8000);
    const resume = (resumeText || '').slice(0, 6000);
    const missing = (baseResult?.missingKeywords || []).slice(0, 30).join(', ') || 'none';
    const mustHave = (aiProfile?.must_have_skills || []).join(', ') || 'none';

    const system = `You are an expert resume coach and ATS optimization specialist.
Your job is to give precise, implementable resume edits that maximize ATS pass rate.
Return STRICT JSON ONLY — no markdown, no prose, no code fences.`;

    const user = `Given the resume and job description below, produce specific, actionable resume improvements.

JSON schema (exact keys):
{
  "overall_gap_summary": "2-3 sentence summary of why the resume is missing points",
  "critical_additions": [
    {
      "section": "Skills|Experience|Summary|Projects|Certifications",
      "action": "add|rewrite|remove",
      "what": "exact keyword, phrase or skill to add",
      "why": "why this helps ATS score",
      "example": "concrete example line to add to the resume"
    }
  ],
  "rewrite_suggestions": [
    {
      "original": "existing resume bullet (partial quote)",
      "improved": "improved version with keywords woven in",
      "keywords_added": ["keyword1", "keyword2"]
    }
  ],
  "quick_wins": ["list of 5-8 short, immediately actionable tips"],
  "sections_to_add": ["sections the resume is missing entirely"],
  "estimated_score_if_applied": 0
}

RULES:
1. critical_additions: max 8 items, focus on MUST-HAVE skills
2. rewrite_suggestions: max 5 items, pick the weakest resume bullets
3. quick_wins: concrete, specific — no generic advice
4. estimated_score_if_applied: realistic integer 0-100
5. Reference actual text from the resume and JD — be specific, not generic

Job Title: ${jobTitle}
Domain: ${aiProfile?.domain || 'unknown'} | Seniority: ${aiProfile?.seniority || 'unknown'}
Current ATS Score: ${aiProfile?.ai_score ?? baseResult?.score ?? '?'}
Missing Keywords: ${missing}
Must-Have Skills from JD: ${mustHave}

Resume:
${resume}

Job Description:
${jd}`;

    return { system, user };
  }

  // ── Main entry point ────────────────────────────────────────────────────────

  async function analyzeJobWithAI({ provider, apiKey, model, jdText, jobTitle, resumeText, baseResult, onProgress }) {
    if (!apiKey) throw new Error('Missing API key. Set it in Settings.');

    // Step 1: ATS scoring profile
    onProgress?.('Analyzing job requirements…', 1);
    const { system: sys1, user: usr1 } = buildScoringPrompt(jdText, jobTitle, baseResult);
    const raw1 = await callAI({ provider, apiKey, model, systemPrompt: sys1, userPrompt: usr1 });

    const parsed1 = safeJsonParse(raw1);
    if (!parsed1) throw new Error('AI scoring response was not valid JSON. Raw: ' + raw1.slice(0, 200));

    const allowedDomains = new Set(['backend','frontend','full_stack','data_science','machine_learning','devops','business_analyst','product','other']);
    const inferredDomain = inferDomainFromText(jdText, jobTitle);
    let domain = allowedDomains.has(parsed1.domain) ? parsed1.domain : inferredDomain;
    if (domain === 'other' && inferredDomain !== 'other') domain = inferredDomain;

    const aiProfile = {
      domain,
      seniority:          parsed1.seniority || 'unknown',
      must_have_skills:   Array.isArray(parsed1.must_have_skills)   ? parsed1.must_have_skills.slice(0, 12)   : [],
      nice_to_have_skills:Array.isArray(parsed1.nice_to_have_skills) ? parsed1.nice_to_have_skills.slice(0, 12): [],
      keyword_boosts:     Array.isArray(parsed1.keyword_boosts)     ? parsed1.keyword_boosts.slice(0, 20)     : [],
      negative_keywords:  Array.isArray(parsed1.negative_keywords)  ? parsed1.negative_keywords.slice(0, 20)  : [],
      weights:            normalizeWeights(parsed1.weights),
      ai_score:           Math.round(clamp(Number(parsed1.ai_score) || Number(baseResult?.score) || 0, 0, 100)),
      confidence:         clamp(Number(parsed1.confidence) || 0.5, 0, 1)
    };

    // Step 2: Recommendations
    onProgress?.('Generating resume improvement plan…', 2);
    const { system: sys2, user: usr2 } = buildRecommendationsPrompt({ jdText, jobTitle, resumeText, aiProfile, baseResult });
    const raw2 = await callAI({ provider, apiKey, model, systemPrompt: sys2, userPrompt: usr2 });

    const parsed2 = safeJsonParse(raw2);
    if (!parsed2) {
      console.warn('[aiEngine] Recommendations parse failed, skipping. Raw:', raw2.slice(0, 300));
    }

    onProgress?.('Done!', 3);
    return { aiProfile, recommendations: parsed2 || null };
  }

  window.aiEngine = { analyzeJobWithAI };
})();