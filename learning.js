(function () {
  const MAX_TERMS = 60;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function normalizeTerm(t) {
    return String(t || '').toLowerCase().trim();
  }

  function topTermsFromMap(mapObj, max = 20) {
    return Object.entries(mapObj || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([k]) => k);
  }

  function mergeWeights(oldW = {}, newW = {}, alpha = 0.25) {
    const keys = ['skills', 'keywords', 'phrases', 'title_alignment', 'formatting'];
    const out = {};
    for (const k of keys) {
      const oldV = Number(oldW[k] ?? (k === 'skills' ? 0.4 : k === 'keywords' ? 0.3 : k === 'phrases' ? 0.15 : k === 'title_alignment' ? 0.1 : 0.05));
      const newV = Number(newW[k] ?? oldV);
      out[k] = oldV * (1 - alpha) + newV * alpha;
    }
    const sum = Object.values(out).reduce((s, v) => s + v, 0) || 1;
    for (const k of keys) out[k] = out[k] / sum;
    return out;
  }

  function addFreq(freq = {}, terms = [], inc = 1) {
    const out = { ...freq };
    for (const t of terms || []) {
      const k = normalizeTerm(t);
      if (!k || k.length < 3) continue;
      const next = (out[k] || 0) + inc;
      if (next <= 0) delete out[k];
      else out[k] = next;
    }
    // cap map size
    const sorted = Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, MAX_TERMS);
    return Object.fromEntries(sorted);
  }

  function detectDomainHeuristic(text = '', title = '') {
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

  function profileFromDomainLearning(domainProfile = {}) {
    return {
      domain: domainProfile.domain || 'other',
      confidence: Math.min(0.95, 0.5 + (domainProfile.scans || 0) * 0.03),
      weights: domainProfile.weights || undefined,
      must_have_skills: topTermsFromMap(domainProfile.mustSkillFreq, 10),
      negative_keywords: topTermsFromMap(domainProfile.noiseFreq, 20),
      keyword_boosts: topTermsFromMap(domainProfile.keywordFreq, 20)
    };
  }

  function updateLearningState(state = {}, aiProfile = {}, jdMeta = {}) {
    const domain = aiProfile.domain || detectDomainHeuristic(jdMeta.jdText, jdMeta.jobTitle);
    const prev = state.domain_profiles?.[domain] || { domain, scans: 0, weights: null, mustSkillFreq: {}, noiseFreq: {}, keywordFreq: {}, outcomes: { up: 0, down: 0 } };

    const next = {
      ...prev,
      scans: (prev.scans || 0) + 1,
      pendingProfile: {
        weights: aiProfile.weights || null,
        must_have_skills: aiProfile.must_have_skills || [],
        negative_keywords: aiProfile.negative_keywords || [],
        keyword_boosts: aiProfile.keyword_boosts || aiProfile.nice_to_have_skills || [],
        confidence: Number(aiProfile.confidence || 0.5),
        ts: Date.now()
      }
    };

    return {
      ...state,
      domain_profiles: {
        ...(state.domain_profiles || {}),
        [domain]: next
      },
      updated_at: Date.now()
    };
  }

  function applyUserFeedback(state = {}, payload = {}) {
    const domain = payload.domain || detectDomainHeuristic(payload.jdText, payload.jobTitle);
    const vote = payload.vote === 'up' ? 'up' : payload.vote === 'down' ? 'down' : null;
    if (!vote) return state;

    const prev = state.domain_profiles?.[domain] || { domain, scans: 0, weights: null, mustSkillFreq: {}, noiseFreq: {}, keywordFreq: {}, outcomes: { up: 0, down: 0 } };
    const pending = payload.aiProfile || prev.pendingProfile;
    if (!pending) return state;

    const baseConf = Number(pending.confidence || 0.5);
    const signed = vote === 'up' ? 1 : -1;
    const alpha = vote === 'up' ? clamp(0.12 + baseConf * 0.18, 0.12, 0.35) : clamp(0.08 + baseConf * 0.10, 0.08, 0.2);

    const next = {
      ...prev,
      outcomes: {
        up: (prev.outcomes?.up || 0) + (vote === 'up' ? 1 : 0),
        down: (prev.outcomes?.down || 0) + (vote === 'down' ? 1 : 0)
      },
      weights: mergeWeights(prev.weights || {}, pending.weights || {}, alpha),
      mustSkillFreq: addFreq(prev.mustSkillFreq, pending.must_have_skills, signed > 0 ? (0.8 + baseConf * 0.6) : -0.5),
      noiseFreq: addFreq(prev.noiseFreq, pending.negative_keywords, signed > 0 ? (0.8 + baseConf * 0.6) : -0.5),
      keywordFreq: addFreq(prev.keywordFreq, pending.keyword_boosts, signed > 0 ? (0.6 + baseConf * 0.5) : -0.4),
      pendingProfile: null,
      last_feedback: { vote, ts: Date.now() }
    };

    return {
      ...state,
      domain_profiles: {
        ...(state.domain_profiles || {}),
        [domain]: next
      },
      updated_at: Date.now()
    };
  }

  window.learningEngine = {
    detectDomainHeuristic,
    profileFromDomainLearning,
    updateLearningState,
    applyUserFeedback
  };
})();