const els = {
  status: document.getElementById('status'),
  resumeSavedState: document.getElementById('resumeSavedState'),
  resumeInputState: document.getElementById('resumeInputState'),
  resumeMeta: document.getElementById('resumeMeta'),
  resumeText: document.getElementById('resumeText'),
  resumePdf: document.getElementById('resumePdf'),
  saveResumeBtn: document.getElementById('saveResumeBtn'),
  replaceBtn: document.getElementById('replaceBtn'),
  clearResumeBtn: document.getElementById('clearResumeBtn'),
  scanBtn: document.getElementById('scanBtn'),
  aiCalibrateBtn: document.getElementById('aiCalibrateBtn'),
  resultsSection: document.getElementById('resultsSection'),
  scoreValue: document.getElementById('scoreValue'),
  jobTitle: document.getElementById('jobTitle'),
  matchedKeywords: document.getElementById('matchedKeywords'),
  missingKeywords: document.getElementById('missingKeywords'),
  aiInsights: document.getElementById('aiInsights'),
  aiDomain: document.getElementById('aiDomain'),
  aiConfidence: document.getElementById('aiConfidence'),
  aiGapSummary: document.getElementById('aiGapSummary'),
  aiProjectedScore: document.getElementById('aiProjectedScore'),
  aiCriticalSection: document.getElementById('aiCriticalSection'),
  aiCriticalList: document.getElementById('aiCriticalList'),
  aiRewriteSection: document.getElementById('aiRewriteSection'),
  aiRewriteList: document.getElementById('aiRewriteList'),
  aiQuickWinsSection: document.getElementById('aiQuickWinsSection'),
  aiQuickWinsList: document.getElementById('aiQuickWinsList'),
  aiSectionsSection: document.getElementById('aiSectionsSection'),
  aiSectionsList: document.getElementById('aiSectionsList'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsSection: document.getElementById('settingsSection'),
  apiProvider: document.getElementById('apiProvider'),
  apiKey: document.getElementById('apiKey'),
  modelName: document.getElementById('modelName'),
  saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
  clearApiKeyBtn: document.getElementById('clearApiKeyBtn')
};

let lastScanContext = null;

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.style.display = msg ? 'block' : 'none';
  els.status.style.background = isError ? '#ffdad6' : '#adecff';
  els.status.style.color = isError ? '#ba1a1a' : '#001f26';
}

function renderChips(container, items, cls) {
  container.innerHTML = '';
  if (!items || !items.length) {
    container.innerHTML = '<span style="font-size:11px;color:#3c494d;font-family:Sora,sans-serif;">None</span>';
    return;
  }
  for (const item of items.slice(0, 25)) {
    const span = document.createElement('span');
    if (cls === 'ok') {
      span.style.cssText = 'display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(24,210,245,0.15);color:#00687a;border:1px solid rgba(0,104,122,0.25);font-size:11px;font-weight:600;font-family:Sora,sans-serif;';
    } else {
      span.style.cssText = 'display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(228,10,101,0.08);color:#b7004f;border:1px solid rgba(183,0,79,0.25);font-size:11px;font-weight:600;font-family:Sora,sans-serif;';
    }
    span.textContent = item;
    container.appendChild(span);
  }
}

function cleanScrapedText(text) {
  return (text || '')
    .replace(/equal opportunity[\s\S]{0,300}/gi, ' ')
    .replace(/how to apply[\s\S]{0,300}/gi, ' ')
    .replace(/interview process[\s\S]{0,300}/gi, ' ')
    .replace(/cookie[s]? policy[\s\S]{0,300}/gi, ' ')
    .replace(/privacy policy[\s\S]{0,300}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferLearnedProfileForJD(jdText, title, learningState) {
  const domain = window.learningEngine.detectDomainHeuristic(jdText, title);
  const domainProfile = learningState?.domain_profiles?.[domain];
  if (!domainProfile) return null;
  return window.learningEngine.profileFromDomainLearning(domainProfile);
}

async function loadState() {
  const data = await chrome.storage.local.get(['resume_raw_text', 'resume_pdf', 'resume_source', 'api_key', 'api_provider', 'model_name']);
  const resumeText = data.resume_raw_text || '';
  const resumePdf = data.resume_pdf || null;
  els.apiKey.value = data.api_key || '';
  els.apiProvider.value = data.api_provider || 'openrouter';
  els.modelName.value = data.model_name || 'openrouter/auto';

  if (resumeText || resumePdf) {
    els.resumeSavedState.style.display = 'flex';
    els.resumeInputState.style.display = 'none';
    if (resumeText) {
      const source = data.resume_source === 'pdf' ? 'pdf' : 'text';
      els.resumeMeta.textContent = `${resumeText.split(/\s+/).filter(Boolean).length} words (${source})`;
    } else {
      const kb = Math.round((resumePdf.size || 0) / 1024);
      els.resumeMeta.textContent = `${resumePdf.name || 'resume.pdf'} (${kb} KB, pdf)`;
    }
  } else {
    els.resumeSavedState.style.display = 'none';
    els.resumeInputState.style.display = 'flex';
  }
}

async function saveResume() {
  const text = els.resumeText.value.trim();
  if (!text) return setStatus('Please paste resume text first.', true);
  await chrome.storage.local.set({ resume_raw_text: text, resume_source: 'text' });
  els.resumeText.value = '';
  setStatus('Resume saved.');
  await loadState();
}

async function clearResume() {
  await chrome.storage.local.remove(['resume_raw_text', 'resume_pdf', 'resume_source']);
  els.resultsSection.style.display = 'none';
  lastScanContext = null;
  setStatus('Resume cleared.');
  await loadState();
}

async function saveResumePdf() {
  try {
    const file = els.resumePdf.files?.[0];
    if (!file) return setStatus('Please choose a PDF or DOCX file first.', true);

    const isPdf  = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                   || file.name.toLowerCase().endsWith('.docx');

    if (!isPdf && !isDocx) {
      return setStatus('Only PDF and DOCX files are supported.', true);
    }

    let extractedText = '';

    if (isPdf) {
      setStatus('Reading PDF…');
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read PDF file.'));
        reader.readAsDataURL(file);
      });
      setStatus('Extracting text from PDF (may take a moment)…');
      extractedText = await window.resumeParser.extractTextFromPdfDataUrl(dataUrl);

    } else {
      setStatus('Reading DOCX…');
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read DOCX file.'));
        reader.readAsArrayBuffer(file);
      });
      setStatus('Extracting text from DOCX…');
      extractedText = await window.resumeParser.extractTextFromDocxArrayBuffer(arrayBuffer);
    }

    await chrome.storage.local.set({ resume_raw_text: extractedText });

    const wordCount = extractedText.split(/\s+/).filter(Boolean).length;
    setStatus(`Resume extracted and saved — ${wordCount} words from ${file.name}.`);
    els.resumePdf.value = '';
    await loadState();

  } catch (err) {
    setStatus(`File parse failed: ${err.message}`, true);
  }
}

async function saveApiSettings() {
  await chrome.storage.local.set({
    api_key: els.apiKey.value.trim(),
    api_provider: els.apiProvider.value,
    model_name: els.modelName.value.trim() || (els.apiProvider.value === 'openrouter' ? 'openrouter/auto' : 'gemini-1.5-flash')
  });
  setStatus('AI settings saved.');
}

async function clearApiSettings() {
  await chrome.storage.local.remove(['api_key', 'api_provider', 'model_name']);
  els.apiKey.value = '';
  els.apiProvider.value = 'openrouter';
  els.modelName.value = 'openrouter/auto';
  setStatus('AI settings cleared.');
}

async function scrapeActiveTabJD() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const selectors = ['.jobs-description-content__text','.jobs-box__html-content','[data-test="job-description"]','.description__text','#job-details','.job-description','[class*="job-description"]'];
      const titleSelectors = [
        'h1[data-test="job-title"]',
        '[data-test="job-title"]',
        '.job-title',
        '.jobs-unified-top-card__job-title',
        'main h1',
        'h1',
        'main h2'
      ];

      const textFrom = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();

      let best = '';
      for (const sel of selectors) {
        const node = document.querySelector(sel);
        const t = textFrom(node);
        if (t.length > best.length) best = t;
      }
      if (best.length < 400) best = textFrom(document.body).slice(0, 20000);

      const badTitlePatterns = [
        /^must\s+have:?$/i, /^requirements?:?$/i, /^responsibilities:?$/i, /^about\s+role:?$/i,
        /^about\s+intervue:?$/i, /^about:?$/i, /:$/
      ];
      const roleHint = /(intern|engineer|developer|analyst|scientist|manager|designer|associate|specialist)/i;

      const candidates = [];
      for (const sel of titleSelectors) {
        const nodes = document.querySelectorAll(sel);
        for (const node of nodes) {
          const t = textFrom(node);
          if (!t || t.length < 3 || t.length > 120) continue;
          if (badTitlePatterns.some(re => re.test(t))) continue;
          const rect = node.getBoundingClientRect();
          if (rect.top > window.innerHeight * 0.45) continue;
          const words = t.split(/\s+/).length;
          if (words > 10) continue;
          const score =
            (roleHint.test(t) ? 3 : 0) +
            (Math.max(0, 500 - rect.top) / 500) +
            (Math.min(t.length, 60) / 100);
          candidates.push({ t, score });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      let title = candidates[0]?.t || '';

      const cleanTitle = (raw) => {
        let x = (raw || '').trim();
        if (x.includes('|')) x = x.split('|')[0].trim();
        if (x.includes(' - ')) x = x.split(' - ')[0].trim();
        return x;
      };

      title = cleanTitle(title);
      const docTitle = cleanTitle(document.title || '');

      if (!title || badTitlePatterns.some(re => re.test(title))) {
        title = docTitle;
      }

      if (!title || badTitlePatterns.some(re => re.test(title))) {
        const anyHeading = [...document.querySelectorAll('h1, h2')]
          .map(textFrom)
          .find(t => t && roleHint.test(t) && !badTitlePatterns.some(re => re.test(t)));
        title = anyHeading || 'Unknown Job';
      }

      return { title, url: location.href, text: best };
    }
  });
  return result;
}


function renderResult(baseResult, jdTitle, aiResult = null) {
  els.resultsSection.style.display = 'flex';
  els.resultsSection.style.flexDirection = 'column';
  els.resultsSection.style.gap = '12px';

  els.scoreValue.textContent = String(baseResult.score);

  // Animate circular progress ring (r=45 → circumference=283)
  const scorePath = document.getElementById('scoreCirclePath');
  if (scorePath) {
    const offset = 283 - (baseResult.score / 100) * 283;
    scorePath.style.strokeDashoffset = offset;
  }

  if (els.jobTitle) els.jobTitle.textContent = jdTitle;
  renderChips(els.matchedKeywords, baseResult.matchedKeywords, 'ok');
  renderChips(els.missingKeywords, baseResult.missingKeywords, 'miss');

  if (!aiResult) {
    // Hide AI panel until AI Scoring is run
    els.aiInsights.style.display = 'none';
  }
  // Note: when aiResult is present, renderRecommendations() is called separately
  // by aiCalibrate() with the full recommendations data.
}


async function scanJob() {
  try {
    setStatus('Scanning job description...');
    const { resume_raw_text, resume_pdf, learning_state } = await chrome.storage.local.get(['resume_raw_text', 'resume_pdf', 'learning_state']);
    if (!resume_raw_text && !resume_pdf) return setStatus('No resume found. Save resume first.', true);
    if (!resume_raw_text && resume_pdf) return setStatus('PDF found but parsing failed. Please paste text resume.', true);

    const jd = await scrapeActiveTabJD();
    const cleanedJD = cleanScrapedText(jd.text);
    if (!cleanedJD || cleanedJD.length < 100) return setStatus('Could not extract enough job text from this page.', true);

    const learnedProfile = inferLearnedProfileForJD(cleanedJD, jd.title, learning_state || {});
    const baseResult = window.scoreResumeVsJD(resume_raw_text, cleanedJD, jd.title, learnedProfile);

    renderResult(baseResult, jd.title, null);
    lastScanContext = { jd, cleanedJD, resumeText: resume_raw_text, baseResult, learnedProfile };

    setStatus(learnedProfile ? 'Scan complete (learned profile applied).' : 'Scan complete. You can now run AI calibration.');
  } catch (err) {
    setStatus(`Scan failed: ${err.message}`, true);
  }
}

// ── AI Button Loader ──────────────────────────────────────────────────────────

const AI_STEPS = [
  'Analyzing job requirements…',
  'Generating improvement plan…',
  'Done!'
];

function setAiButtonLoading(stepIndex) {
  const btn = els.aiCalibrateBtn;
  if (stepIndex === null) {
    // Restore
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:17px;font-variation-settings:'FILL' 1;">psychology</span> AI Scoring`;
    return;
  }
  btn.disabled = true;
  btn.style.opacity = '0.85';
  const label = AI_STEPS[stepIndex] || 'Working…';
  btn.innerHTML = `<span class="ai-spinner"></span><span style="margin-left:6px;">${label}</span>`;
}

// ── Recommendations Renderer ──────────────────────────────────────────────────

function renderRecommendations(rec, aiProfile, finalScore) {
  if (!rec && !aiProfile) return;

  // Show the AI insights container
  els.aiInsights.style.display = 'flex';
  els.aiInsights.style.flexDirection = 'column';
  els.aiInsights.style.gap = '10px';

  // Meta
  if (aiProfile) {
    els.aiDomain.textContent = `${aiProfile.domain || 'other'} · ${aiProfile.seniority || 'unknown'}`;
    els.aiConfidence.textContent = `${Math.round((aiProfile.confidence || 0) * 100)}%`;
  }

  // Gap summary
  if (rec?.overall_gap_summary) {
    els.aiGapSummary.textContent = rec.overall_gap_summary;
  } else {
    els.aiGapSummary.textContent = aiProfile
      ? `AI Score: ${finalScore}/100. Domain: ${aiProfile.domain} · Seniority: ${aiProfile.seniority}.`
      : '';
  }

  // Projected score
  if (rec?.estimated_score_if_applied) {
    els.aiProjectedScore.style.display = 'block';
    els.aiProjectedScore.textContent =
      `🎯 Apply these changes → Estimated score: ${rec.estimated_score_if_applied}/100`;
  }

  // Critical Additions
  const crits = rec?.critical_additions || [];
  if (crits.length) {
    els.aiCriticalSection.style.display = 'block';
    els.aiCriticalList.innerHTML = '';
    crits.forEach(c => {
      const card = document.createElement('div');
      card.style.cssText = 'background:#fff0f5;border:1px solid rgba(183,0,79,0.15);border-radius:10px;padding:10px 12px;';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:10px;font-weight:700;color:#e40a65;background:#ffd9df;padding:2px 7px;border-radius:99px;">${c.section || 'Resume'}</span>
          <span style="font-size:11px;font-weight:700;color:#1a1c1f;">${c.what || ''}</span>
        </div>
        <p style="font-size:11px;color:#3c494d;margin:0 0 6px;line-height:1.5;">${c.why || ''}</p>
        ${c.example ? `<div style="font-size:11px;color:#00687a;background:#f0fdfe;border-left:3px solid #18d2f5;padding:6px 8px;border-radius:4px;font-style:italic;">"+${c.example}"</div>` : ''}
      `;
      els.aiCriticalList.appendChild(card);
    });
  } else {
    els.aiCriticalSection.style.display = 'none';
  }

  // Rewrite Suggestions
  const rewrites = rec?.rewrite_suggestions || [];
  if (rewrites.length) {
    els.aiRewriteSection.style.display = 'block';
    els.aiRewriteList.innerHTML = '';
    rewrites.forEach(r => {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #bbc9ce;border-radius:10px;overflow:hidden;';
      card.innerHTML = `
        <div style="padding:8px 12px;background:#fff8f8;border-bottom:1px solid #bbc9ce;">
          <p style="font-size:10px;font-weight:700;color:#b7004f;margin:0 0 2px;">ORIGINAL</p>
          <p style="font-size:11px;color:#3c494d;margin:0;line-height:1.5;">${r.original || ''}</p>
        </div>
        <div style="padding:8px 12px;background:#f0fdfe;">
          <p style="font-size:10px;font-weight:700;color:#00687a;margin:0 0 2px;">IMPROVED</p>
          <p style="font-size:11px;color:#1a1c1f;margin:0 0 6px;line-height:1.5;">${r.improved || ''}</p>
          ${(r.keywords_added || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">${(r.keywords_added || []).map(k => `<span style="font-size:10px;background:rgba(24,210,245,0.15);color:#00687a;border:1px solid rgba(0,104,122,0.2);padding:2px 7px;border-radius:99px;font-weight:600;">${k}</span>`).join('')}</div>` : ''}
        </div>
      `;
      els.aiRewriteList.appendChild(card);
    });
  } else {
    els.aiRewriteSection.style.display = 'none';
  }

  // Quick Wins
  const wins = rec?.quick_wins || [];
  if (wins.length) {
    els.aiQuickWinsSection.style.display = 'block';
    els.aiQuickWinsList.innerHTML = '';
    wins.forEach(w => {
      const li = document.createElement('li');
      li.style.cssText = 'font-size:12px;color:#1a1c1f;line-height:1.5;';
      li.textContent = w;
      els.aiQuickWinsList.appendChild(li);
    });
  } else {
    els.aiQuickWinsSection.style.display = 'none';
  }

  // Sections to add
  const secs = rec?.sections_to_add || [];
  if (secs.length) {
    els.aiSectionsSection.style.display = 'block';
    els.aiSectionsList.innerHTML = '';
    secs.forEach(s => {
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-block;padding:4px 12px;border-radius:99px;background:#f3f3f7;border:1px solid #bbc9ce;font-size:11px;font-weight:600;color:#1a1c1f;';
      chip.textContent = s;
      els.aiSectionsList.appendChild(chip);
    });
  } else {
    els.aiSectionsSection.style.display = 'none';
  }
}

// ── AI Calibrate ───────────────────────────────────────────────────────────────

async function aiCalibrate() {
  try {
    if (!lastScanContext) return setStatus('Scan a job first.', true);
    const data = await chrome.storage.local.get(['api_key', 'api_provider', 'model_name', 'learning_state']);
    if (!data.api_key) return setStatus('Add your API key in Settings first.', true);

    setAiButtonLoading(0);
    setStatus('Step 1/2 — Analyzing job requirements with AI…');

    const { aiProfile, recommendations } = await window.aiEngine.analyzeJobWithAI({
      provider:   data.api_provider || 'gemini',
      apiKey:     data.api_key || '',
      model:      data.model_name || 'gemini-1.5-flash',
      jdText:     lastScanContext.cleanedJD,
      jobTitle:   lastScanContext.jd.title,
      resumeText: lastScanContext.resumeText,
      baseResult: lastScanContext.baseResult,
      onProgress: (msg, step) => {
        setAiButtonLoading(step - 1);
        setStatus(`Step ${step}/2 — ${msg}`);
      }
    });

    const profileCalibrated = window.scoreResumeVsJD(
      lastScanContext.resumeText,
      lastScanContext.cleanedJD,
      lastScanContext.jd.title,
      aiProfile
    );
    const finalAIScore = Math.round((profileCalibrated.score * 0.55) + (aiProfile.ai_score * 0.45));

    const learningState = window.learningEngine.updateLearningState(
      data.learning_state || {}, aiProfile,
      { jdText: lastScanContext.cleanedJD, jobTitle: lastScanContext.jd.title }
    );

    await chrome.storage.local.set({
      learning_state: learningState,
      last_ai_profile: aiProfile,
      last_scan: {
        title: lastScanContext.jd.title, url: lastScanContext.jd.url,
        ts: Date.now(),
        baseScore: lastScanContext.baseResult.score,
        aiModelScore: aiProfile.ai_score,
        aiCalibratedScore: finalAIScore,
        domain: aiProfile.domain, confidence: aiProfile.confidence
      }
    });

    // Update score ring
    renderResult(lastScanContext.baseResult, lastScanContext.jd.title, { ...aiProfile, score: finalAIScore });

    // Render recommendations
    renderRecommendations(recommendations, aiProfile, finalAIScore);

    setAiButtonLoading(null);
    setStatus(`✅ AI score: ${finalAIScore}/100 · Domain: ${aiProfile.domain}`);
  } catch (err) {
    setAiButtonLoading(null);
    setStatus(`AI failed: ${err.message}`, true);
  }
}

function toggleSettings() {
  const s = els.settingsSection;
  s.style.display = (s.style.display === 'none' || s.style.display === '') ? 'block' : 'none';
}

els.saveResumeBtn.addEventListener('click', saveResume);
if (els.resumePdf) els.resumePdf.addEventListener('change', saveResumePdf);
els.replaceBtn.addEventListener('click', () => {
  els.resumeSavedState.style.display = 'none';
  els.resumeInputState.style.display = 'flex';
});
els.clearResumeBtn.addEventListener('click', clearResume);
els.scanBtn.addEventListener('click', scanJob);
els.aiCalibrateBtn.addEventListener('click', aiCalibrate);
els.settingsBtn.addEventListener('click', toggleSettings);
els.saveApiKeyBtn.addEventListener('click', saveApiSettings);
els.clearApiKeyBtn.addEventListener('click', clearApiSettings);

loadState();