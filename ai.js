(function () {
  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function normalizeWeights(weights) {
    const defaults = { skills: 0.4, keywords: 0.3, phrases: 0.15, title_alignment: 0.1, formatting: 0.05 };
    const merged = { ...defaults, ...(weights || {}) };
    const sum = Object.values(merged).reduce((s, v) => s + (Number(v) || 0), 0) || 1;
    const out = {};
    for (const [k, v] of Object.entries(merged)) out[k] = clamp((Number(v) || 0) / sum, 0, 1);
    return out;
  }

  async function callOpenRouter({ apiKey, model, prompt }) {
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
          { role: 'system', content: 'You are an ATS analyzer. Return strict JSON only.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return content;
  }

  async function callGemini({ apiKey, model, prompt }) {
    const m = model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0.2 },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
    return content;
  }

  function inferDomainFromText(text = '', title = '') {
    const t = `${text} ${title}`.toLowerCase();
    if (/machine learning|deep learning|nlp|computer vision|pytorch|tensorflow/.test(t)) return 'machine_learning';
    if (/data science|analytics|pandas|numpy|statistics|sql|power bi|tableau/.test(t)) return 'data_science';
    if (/react|frontend|ui|javascript|css|html/.test(t)) return 'frontend';
    if (/node|java|spring|backend|api|microservice/.test(t)) return 'backend';
    if (/full stack|fullstack/.test(t)) return 'full_stack';
    if (/devops|kubernetes|docker|terraform|ci\/cd/.test(t)) return 'devops';
    if (/product manager|product management|roadmap|stakeholder/.test(t)) return 'product';
    if (/business analyst|report|dashboard|excel|operations|process improvement/.test(t)) return 'business_analyst';
    return 'other';
  }

  function buildPrompt(jdText, jobTitle, baseResult) {
    const jd = (jdText || '').slice(0, 12000);
    const matched = Array.isArray(baseResult?.matchedKeywords) ? baseResult.matchedKeywords.slice(0, 25) : [];
    const missing = Array.isArray(baseResult?.missingKeywords) ? baseResult.missingKeywords.slice(0, 25) : [];

    return `You are an unforgiving ATS auditor. Be brutally honest, conservative, and strict.\nNever inflate scores. If evidence is weak, score low.\n\nReturn STRICT JSON ONLY. No markdown. No prose.\nJSON schema:\n{\n  "domain": "backend|frontend|full_stack|data_science|machine_learning|devops|business_analyst|product|other",\n  "seniority": "intern|junior|mid|senior|lead|unknown",\n  "must_have_skills": ["..."],\n  "nice_to_have_skills": ["..."],\n  "keyword_boosts": ["..."],\n  "negative_keywords": ["..."],\n  "weights": {"skills":0.0,"keywords":0.0,"phrases":0.0,"title_alignment":0.0,"formatting":0.0},\n  "ai_score": 0,\n  "confidence": 0.0\n}\n\nSTRICT SCORING RUBRIC:\n- 90-100: near-perfect, explicit evidence for almost all critical requirements\n- 75-89: strong but clear gaps remain\n- 55-74: moderate fit, several must-have gaps\n- 35-54: weak fit, many missing must-haves\n- 0-34: poor fit or mostly generic mismatch\n\nHARD RULES:\n1) Penalize missing must-have skills heavily.\n2) Ignore boilerplate hiring language.\n3) Prefer concrete technical terms over generic words.\n4) Do not reward buzzwords without direct relevance.\n5) ai_score must be integer 0-100.\n6) weights must sum ~1.0 and reflect strict ATS matching priorities.\n7) max 12 must_have_skills, max 12 nice_to_have_skills, max 20 keyword_boosts, max 20 negative_keywords.\n\nInput context:\nJob Title: ${jobTitle || 'Unknown'}\nLocal Base Score: ${baseResult?.score ?? '-'}\nLocal Matched Keywords: ${matched.join(', ') || 'none'}\nLocal Missing Keywords: ${missing.join(', ') || 'none'}\n\nJD:\n${jd}`;
  }

  async function analyzeJobWithAI({ provider, apiKey, model, jdText, jobTitle, baseResult }) {
    if (!apiKey) throw new Error('Missing API key. Set it in Settings.');

    const prompt = buildPrompt(jdText, jobTitle, baseResult);
    const raw = provider === 'gemini'
      ? await callGemini({ apiKey, model, prompt })
      : await callOpenRouter({ apiKey, model, prompt });

    const parsed = safeJsonParse(raw);
    if (!parsed) throw new Error('AI response was not valid JSON.');

    const allowedDomains = new Set(['backend','frontend','full_stack','data_science','machine_learning','devops','business_analyst','product','other']);
    const inferredDomain = inferDomainFromText(jdText, jobTitle);
    let normalizedDomain = allowedDomains.has(parsed.domain) ? parsed.domain : inferredDomain;
    if (normalizedDomain === 'other' && inferredDomain !== 'other') normalizedDomain = inferredDomain;

    return {
      domain: normalizedDomain || 'other',
      seniority: parsed.seniority || 'unknown',
      must_have_skills: Array.isArray(parsed.must_have_skills) ? parsed.must_have_skills.slice(0, 12) : [],
      nice_to_have_skills: Array.isArray(parsed.nice_to_have_skills) ? parsed.nice_to_have_skills.slice(0, 12) : [],
      keyword_boosts: Array.isArray(parsed.keyword_boosts) ? parsed.keyword_boosts.slice(0, 20) : [],
      negative_keywords: Array.isArray(parsed.negative_keywords) ? parsed.negative_keywords.slice(0, 20) : [],
      weights: normalizeWeights(parsed.weights),
      ai_score: Math.round(clamp(Number(parsed.ai_score) || Number(baseResult?.score) || 0, 0, 100)),
      confidence: clamp(Number(parsed.confidence) || 0.5, 0, 1)
    };
  }

  window.aiEngine = { analyzeJobWithAI };
})();