(function () {
  // ATS-aligned scoring model inspired by documented behavior:
  // Keywords 45%, Structure 25%, Skills context 20%, Metadata 10%

  const STOPWORDS = new Set([
    'a','an','the','and','or','for','to','of','in','on','with','is','are','be','as','by','at','from','that','this','it','you','your','we','our','they','their','will','can','should','must','have','has','had','using','use','used',
    'job','role','roles','position','work','experience','requirements','required','preferred','candidate','candidates','apply','application','interview','interviews','responsibilities','responsibility',
    'various','strong','details','detail','internal','top','regarding','regard','ensure','activities','activity','content','prior','about'
  ]);

  const GENERIC_NOISE = new Set([
    'team','business','company','client','customer','process','task','tasks','support','communication','communicate','ability'
  ]);

  const SKILLS = [
    'javascript','typescript','python','java','react','node.js','sql','nosql','aws','azure','gcp','docker','kubernetes','git','rest','graphql','html','css','mongodb','postgresql','mysql','redis','linux','ci/cd','jira','agile','scrum','testing','jest','cypress','selenium','machine learning','nlp','data analysis','pandas','numpy','pytorch','tensorflow','tableau','power bi','etl','a/b testing','statistics','excel'
  ];

  const SKILL_ALIASES = {
    js: 'javascript', ts: 'typescript', node: 'node.js', nodejs: 'node.js', postgre: 'postgresql', ml: 'machine learning'
  };

  const SECTION_HEADERS = ['summary','professional summary','experience','work experience','employment','education','skills','projects','certifications'];

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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
    return normalize(text)
      .split(' ')
      .map(t => SKILL_ALIASES[t] || t)
      .map(stem)
      .filter(t => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  }

  function isUsefulKeyword(token, noise = new Set()) {
    return token && token.length >= 4 && !STOPWORDS.has(token) && !GENERIC_NOISE.has(token) && !noise.has(token) && !/^\d+$/.test(token);
  }

  function keywordFreq(text) {
    const f = new Map();
    for (const t of tokenize(text)) f.set(t, (f.get(t) || 0) + 1);
    return f;
  }

  function extractSkills(text) {
    const t = normalize(text);
    return SKILLS.filter(s => t.includes(s));
  }

  function extractPhrases(text, maxPhrases = 15, noise = new Set()) {
    const words = tokenize(text);
    const unigramFreq = new Map();
    for (const w of words) unigramFreq.set(w, (unigramFreq.get(w) || 0) + 1);

    const grams = new Map();
    for (let i = 0; i < words.length - 1; i++) {
      const bi = `${words[i]} ${words[i + 1]}`;
      grams.set(bi, (grams.get(bi) || 0) + 1);
      if (i < words.length - 2) {
        const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        grams.set(tri, (grams.get(tri) || 0) + 1);
      }
    }

    return [...grams.entries()]
      .filter(([p]) => p.split(' ').every(t => isUsefulKeyword(t, noise)))
      .map(([p, tf]) => {
        const toks = p.split(' ');
        const specificity = toks.reduce((s, t) => s + (1 / Math.log2(2 + (unigramFreq.get(t) || 1))), 0) / toks.length;
        const phraseScore = (1 + Math.log2(1 + tf)) * specificity * (toks.length === 3 ? 1.1 : 1);
        return { p, phraseScore };
      })
      .sort((a, b) => b.phraseScore - a.phraseScore)
      .slice(0, maxPhrases)
      .map(x => x.p);
  }

  function extractRequiredPreferredSignals(jdText) {
    const t = normalize(jdText);
    const required = /(must have|required|requirements|minimum qualifications)/.test(t);
    const preferred = /(nice to have|preferred|good to have|bonus)/.test(t);
    return { required, preferred };
  }

  function buildNoiseSet(profile) {
    return new Set((profile?.negative_keywords || []).map(x => stem(normalize(String(x)))));
  }

  function weightedKeywordCoverage(jdText, resumeNorm, profile, topN = 40) {
    const noise = buildNoiseSet(profile);
    const boosts = new Set((profile?.keyword_boosts || []).map(x => stem(normalize(String(x)))));
    const freq = [...keywordFreq(jdText).entries()]
      .filter(([k, c]) => isUsefulKeyword(k, noise) && (c >= 1 || SKILLS.includes(k) || boosts.has(k)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([k, c]) => {
        const tfWeight = 1 + Math.log2(1 + c);
        const boost = boosts.has(k) ? 1.35 : 1;
        return [k, tfWeight * boost];
      });

    const total = freq.reduce((s, [, w]) => s + w, 0) || 1;
    let hit = 0;
    const matched = [];
    const missing = [];

    for (const [k, w] of freq) {
      if (resumeNorm.includes(k)) {
        hit += w;
        matched.push(k);
      } else {
        missing.push(k);
      }
    }

    return {
      ratio: hit / total,
      matchedKeywords: matched,
      missingKeywords: missing,
      allKeywords: freq.map(([k]) => k)
    };
  }

  function detectSectionCoverage(resumeText) {
    const t = normalize(resumeText);
    const found = SECTION_HEADERS.filter(h => t.includes(h));
    return { found, ratio: found.length / SECTION_HEADERS.length };
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

  function detectContactPresence(resumeText) {
    const t = resumeText || '';
    const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t);
    const phone = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}/.test(t);
    return email && phone ? 1 : email || phone ? 0.6 : 0.2;
  }

  function detectMetadataHints(resumeText) {
    const t = resumeText || '';
    const hasBullets = /(•|-\s|\*\s)/.test(t);
    const quantifiedHits = t.match(/(?:\b\d+(?:\.\d+)?%\b|\$\s?\d+[\d,]*(?:\.\d+)?\s?[kKmMbB]?|\b\d+(?:\.\d+)?\s?(?:x|years?|yrs?|months?|users?|clients?|projects?)\b)/g) || [];
    const quantifiedRatio = clamp(quantifiedHits.length / 12, 0, 1);
    return clamp((hasBullets ? 0.45 : 0.25) + (quantifiedRatio * 0.55), 0, 1);
  }

  function keywordDensityPenalty(keywordRatio, resumeNorm, keywords) {
    // Target overlap zone per article: 60-80%
    let zonePenalty = 0;
    if (keywordRatio < 0.6) zonePenalty = (0.6 - keywordRatio) * 18;
    if (keywordRatio > 0.85) zonePenalty = (keywordRatio - 0.85) * 12;

    // Stuffing penalty
    let stuffed = 0;
    for (const kw of keywords.slice(0, 20)) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      const c = (resumeNorm.match(re) || []).length;
      if (c >= 8) stuffed++;
    }
    const stuffingPenalty = stuffed * 1.8;
    return clamp(zonePenalty + stuffingPenalty, 0, 20);
  }

  function scoreResumeVsJD(resumeText, jdText, jobTitle = '', profile = null) {
    const resumeNorm = normalize(resumeText);
    const noise = buildNoiseSet(profile);

    const keywordCoverage = weightedKeywordCoverage(jdText, resumeNorm, profile, 40);
    const jdPhrases = extractPhrases(jdText, 15, noise);
    const matchedPhrases = jdPhrases.filter(p => resumeNorm.includes(p));

    const jdSkills = extractSkills(jdText);
    const resumeSkills = extractSkills(resumeText);
    const matchedSkills = jdSkills.filter(s => resumeSkills.includes(s));
    const missingSkills = jdSkills.filter(s => !resumeSkills.includes(s));

    const titleTokens = tokenize(jobTitle).slice(0, 6);
    const titleMatched = titleTokens.filter(t => resumeNorm.includes(t)).length;

    const sectionCoverage = detectSectionCoverage(resumeText);
    const dateConsistency = detectDateConsistency(resumeText);
    const contactPresence = detectContactPresence(resumeText);
    const metadataHints = detectMetadataHints(resumeText);

    const requiredPreferred = extractRequiredPreferredSignals(jdText);

    const keywordRatio = keywordCoverage.ratio;
    const phraseRatio = jdPhrases.length ? matchedPhrases.length / jdPhrases.length : 0.5;
    const skillsRatio = jdSkills.length ? matchedSkills.length / jdSkills.length : 0.5;
    const titleRatio = titleTokens.length ? titleMatched / titleTokens.length : 0.5;

    const mustHave = (profile?.must_have_skills || []).map(s => normalize(String(s)));
    const mustMatched = mustHave.filter(s => s && resumeNorm.includes(s));
    const mustRatio = mustHave.length ? mustMatched.length / mustHave.length : 0.5;

    // ATS weights from article + calibration profile
    const w = profile?.weights || { skills: 0.4, keywords: 0.3, phrases: 0.15, title_alignment: 0.1, formatting: 0.05 };

    // Bucket scores
    const keywordScore = (keywordRatio * 0.7 + phraseRatio * 0.2 + titleRatio * 0.1) * 45;
    const structureScore = (sectionCoverage.ratio * 0.65 + dateConsistency.ratio * 0.35) * 25;
    const skillsScore = (skillsRatio * 0.75 + mustRatio * 0.25) * 20;
    const metadataScore = (contactPresence * 0.55 + metadataHints * 0.45) * 10;

    // Calibrated recomposition on a consistent 0-100 scale
    const keywordComponent = clamp(keywordRatio * 0.75 + phraseRatio * 0.15 + titleRatio * 0.10, 0, 1);
    const skillsComponent = clamp(skillsRatio * 0.75 + mustRatio * 0.25, 0, 1);
    const phraseComponent = clamp(phraseRatio, 0, 1);
    const titleComponent = clamp(titleRatio, 0, 1);
    const formattingComponent = clamp(((sectionCoverage.ratio + dateConsistency.ratio) / 2) * 0.8 + metadataHints * 0.2, 0, 1);

    const calibrated = 100 * (
      w.keywords * keywordComponent +
      w.skills * skillsComponent +
      w.phrases * phraseComponent +
      w.title_alignment * titleComponent +
      w.formatting * formattingComponent
    );

    const strictRequiredPenalty = requiredPreferred.required && mustHave.length && mustRatio < 0.5 ? 8 : 0;
    const densityPenalty = keywordDensityPenalty(keywordRatio, resumeNorm, keywordCoverage.allKeywords);

    const rawBase = keywordScore + structureScore + skillsScore + metadataScore;
    const rawCombined = (rawBase * 0.7) + (calibrated * 0.3) - densityPenalty - strictRequiredPenalty;
    const score = Math.round(clamp(rawCombined, 0, 100));

    const displayMatched = [...new Set([...matchedSkills, ...keywordCoverage.matchedKeywords, ...matchedPhrases])].slice(0, 25);
    const displayMissing = [...new Set([...missingSkills, ...keywordCoverage.missingKeywords, ...jdPhrases.filter(p => !resumeNorm.includes(p))])].slice(0, 25);

    return {
      score,
      matchedKeywords: displayMatched,
      missingKeywords: displayMissing,
      matchedSkills,
      missingSkills,
      details: {
        keywordScore: Math.round(keywordScore),
        structureScore: Math.round(structureScore),
        skillsScore: Math.round(skillsScore),
        metadataScore: Math.round(metadataScore),
        calibratedScore: Math.round(calibrated),
        densityPenalty: Math.round(densityPenalty),
        strictRequiredPenalty: Math.round(strictRequiredPenalty),
        keywordRatio: Number(keywordRatio.toFixed(3)),
        sectionHeadersFound: sectionCoverage.found,
        dateStyleDetected: dateConsistency.style,
        matchedPhrases: matchedPhrases.slice(0, 10),
        mustHaveMatched: mustMatched,
        domain: profile?.domain || null,
        confidence: profile?.confidence ?? null
      }
    };
  }

  window.scoreResumeVsJD = scoreResumeVsJD;
})();