(function () {
  const STOPWORDS = new Set([
    'a','an','the','and','or','for','to','of','in','on','with','is','are','be','as','by','at','from','that','this','it','you','your','we','our','they','their','will','can','should','must','have','has','had','using','use','used',
    'job','role','roles','position','work','experience','requirements','required','preferred','candidate','candidates','apply','application','interview','interviews','responsibilities','responsibility',
    'various','strong','details','detail','internal','top','regarding','regard','ensure','activities','activity','content','prior','report','research','about','conduct','communicate','ability','level','month','internship','skillset'
  ]);

  const SKILLS = [
    'javascript','typescript','python','java','react','node.js','sql','nosql','aws','azure','gcp','docker','kubernetes','git','rest','graphql','html','css','mongodb','postgresql','mysql','redis','linux','ci/cd','jira','agile','scrum','testing','jest','cypress','selenium','machine learning','nlp','data analysis','pandas','numpy','pytorch','tensorflow'
  ];

  const SKILL_ALIASES = { js: 'javascript', ts: 'typescript', node: 'node.js', nodejs: 'node.js', postgre: 'postgresql' };
  const RESUME_SECTION_HEADERS = ['summary','professional summary','experience','work experience','employment','education','skills','projects','certifications'];

  function normalize(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9+.#/\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function stem(token) {
    if (token.length <= 4) return token;
    if (token.endsWith('ies') && token.length > 5) return token.slice(0, -3) + 'y';
    if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
    if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);
    if (token.endsWith('s') && token.length > 4 && !token.endsWith('ss') && !token.endsWith('ous')) return token.slice(0, -1);
    return token;
  }

  function tokenize(text) {
    return normalize(text).split(' ').map(t => SKILL_ALIASES[t] || t).map(stem).filter(t => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  }

  function keywordFreq(text) {
    const freq = new Map();
    for (const token of tokenize(text)) freq.set(token, (freq.get(token) || 0) + 1);
    return freq;
  }

  function buildNoiseSet(profile) {
    return new Set((profile?.negative_keywords || []).map(x => stem(normalize(String(x)))));
  }

  function buildBoostSet(profile) {
    return new Set((profile?.keyword_boosts || []).map(x => stem(normalize(String(x)))));
  }

  function isUsefulKeyword(k, noiseSet = new Set()) {
    if (!k || k.length < 4) return false;
    if (STOPWORDS.has(k) || noiseSet.has(k)) return false;
    if (/^\d+$/.test(k)) return false;
    const generic = ['team','business','company','client','customer','process','task','tasks','support'];
    return !generic.includes(k);
  }

  function extractPhrases(text, maxPhrases = 15, noiseSet = new Set()) {
    const words = tokenize(text);
    const ngrams = new Map();
    for (let i = 0; i < words.length - 1; i++) {
      const bi = `${words[i]} ${words[i + 1]}`;
      ngrams.set(bi, (ngrams.get(bi) || 0) + 1);
      if (i < words.length - 2) {
        const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        ngrams.set(tri, (ngrams.get(tri) || 0) + 1);
      }
    }
    return [...ngrams.entries()]
      .filter(([p, c]) => c >= 2 && p.length > 9 && p.split(' ').every(x => isUsefulKeyword(x, noiseSet)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxPhrases)
      .map(([p]) => p);
  }

  function extractSkills(text) {
    const t = normalize(text);
    return SKILLS.filter(skill => t.includes(skill));
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function detectSectionCoverage(resumeText) {
    const t = normalize(resumeText);
    const found = RESUME_SECTION_HEADERS.filter(h => t.includes(h));
    return { found, ratio: found.length / RESUME_SECTION_HEADERS.length };
  }

  function detectDateConsistency(resumeText) {
    const t = resumeText || '';
    const mmYYYY = t.match(/\b(0[1-9]|1[0-2])\/(19|20)\d{2}\b/g) || [];
    const monthYYYY = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(19|20)\d{2}\b/gi) || [];
    const total = mmYYYY.length + monthYYYY.length;
    if (!total) return { ratio: 0.5, style: 'unknown' };
    const dominant = Math.max(mmYYYY.length, monthYYYY.length);
    return { ratio: dominant / total, style: mmYYYY.length >= monthYYYY.length ? 'MM/YYYY' : 'Mon YYYY' };
  }

  function weightedKeywordCoverage(jdText, resumeNorm, profile, topN = 35) {
    const noiseSet = buildNoiseSet(profile);
    const boostSet = buildBoostSet(profile);
    const freq = [...keywordFreq(jdText).entries()]
      .filter(([k, c]) => isUsefulKeyword(k, noiseSet) && (c >= 2 || SKILLS.includes(k) || boostSet.has(k)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([k, c]) => [k, boostSet.has(k) ? c * 1.4 : c]);

    const totalWeight = freq.reduce((s, [, c]) => s + c, 0) || 1;
    let hitWeight = 0;
    const matched = [];
    const missing = [];
    for (const [kw, w] of freq) {
      if (resumeNorm.includes(kw)) { hitWeight += w; matched.push(kw); }
      else missing.push(kw);
    }
    return { ratio: hitWeight / totalWeight, matchedKeywords: matched, missingKeywords: missing, allKeywords: freq.map(([k]) => k) };
  }

  function scoreResumeVsJD(resumeText, jdText, jobTitle = '', profile = null) {
    const resumeNorm = normalize(resumeText);
    const keywordCoverage = weightedKeywordCoverage(jdText, resumeNorm, profile, 35);
    const jdKeywords = keywordCoverage.allKeywords;

    const matchedKeywords = keywordCoverage.matchedKeywords;
    const missingKeywords = keywordCoverage.missingKeywords;
    const jdPhrases = extractPhrases(jdText, 15, buildNoiseSet(profile));
    const matchedPhrases = jdPhrases.filter(p => resumeNorm.includes(p));

    const jdSkills = extractSkills(jdText);
    const resumeSkills = extractSkills(resumeText);
    const matchedSkills = jdSkills.filter(s => resumeSkills.includes(s));
    const missingSkills = jdSkills.filter(s => !resumeSkills.includes(s));

    const titleTokens = tokenize(jobTitle).slice(0, 6);
    const titleMatched = titleTokens.filter(t => resumeNorm.includes(t)).length;
    const sectionCoverage = detectSectionCoverage(resumeText);
    const dateConsistency = detectDateConsistency(resumeText);

    const keywordRatio = keywordCoverage.ratio;
    const phraseRatio = jdPhrases.length ? matchedPhrases.length / jdPhrases.length : 0.5;
    const skillsRatio = jdSkills.length ? matchedSkills.length / jdSkills.length : 0.5;
    const titleRatio = titleTokens.length ? titleMatched / titleTokens.length : 0.5;

    const w = profile?.weights || { skills: 0.4, keywords: 0.3, phrases: 0.15, title_alignment: 0.1, formatting: 0.05 };
    const mustHave = (profile?.must_have_skills || []).map(s => normalize(String(s)));
    const mustMatched = mustHave.filter(s => s && resumeNorm.includes(s));
    const mustRatio = mustHave.length ? mustMatched.length / mustHave.length : 0.5;

    const relevanceComposite = skillsRatio * w.skills + keywordRatio * w.keywords + phraseRatio * w.phrases + titleRatio * w.title_alignment;
    const formattingComposite = (sectionCoverage.ratio * 0.6 + dateConsistency.ratio * 0.4) * w.formatting;
    const relevanceScore = relevanceComposite * 92 + mustRatio * 8;
    const parseScore = formattingComposite * 100;

    const stuffingPenalty = 0;
    const score = Math.round(clamp(relevanceScore + parseScore - stuffingPenalty, 0, 100));

    const displayMatchedKeywords = [...new Set([...matchedSkills, ...matchedKeywords, ...matchedPhrases])].slice(0, 25);
    const displayMissingKeywords = [...new Set([...missingSkills, ...missingKeywords, ...jdPhrases.filter(p => !resumeNorm.includes(p))])].slice(0, 25);

    return {
      score,
      matchedKeywords: displayMatchedKeywords,
      missingKeywords: displayMissingKeywords,
      matchedSkills,
      missingSkills,
      details: {
        relevanceScore: Math.round(relevanceScore),
        parseScore: Math.round(parseScore),
        matchedPhrases: matchedPhrases.slice(0, 10),
        sectionHeadersFound: sectionCoverage.found,
        dateStyleDetected: dateConsistency.style,
        mustHaveMatched: mustMatched,
        domain: profile?.domain || null,
        confidence: profile?.confidence ?? null
      }
    };
  }

  window.scoreResumeVsJD = scoreResumeVsJD;
})();