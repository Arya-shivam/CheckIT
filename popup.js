const els = {
  status: document.getElementById('status'),
  resumeSavedState: document.getElementById('resumeSavedState'),
  resumeInputState: document.getElementById('resumeInputState'),
  resumeMeta: document.getElementById('resumeMeta'),
  resumeText: document.getElementById('resumeText'),
  resumePdf: document.getElementById('resumePdf'),
  saveResumeBtn: document.getElementById('saveResumeBtn'),
  savePdfBtn: document.getElementById('savePdfBtn'),
  replaceBtn: document.getElementById('replaceBtn'),
  clearResumeBtn: document.getElementById('clearResumeBtn'),
  scanBtn: document.getElementById('scanBtn'),
  aiCalibrateBtn: document.getElementById('aiCalibrateBtn'),
  resultsSection: document.getElementById('resultsSection'),
  scoreValue: document.getElementById('scoreValue'),
  aiScoreValue: document.getElementById('aiScoreValue'),
  jobTitle: document.getElementById('jobTitle'),
  matchedKeywords: document.getElementById('matchedKeywords'),
  missingKeywords: document.getElementById('missingKeywords'),
  aiInsights: document.getElementById('aiInsights'),
  aiDomain: document.getElementById('aiDomain'),
  aiConfidence: document.getElementById('aiConfidence'),
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
  els.status.style.color = isError ? '#b91c1c' : '#334155';
}

function renderChips(container, items, cls) {
  container.innerHTML = '';
  if (!items || !items.length) {
    container.innerHTML = '<span style="font-size:12px;color:#64748b">None</span>';
    return;
  }
  for (const item of items.slice(0, 25)) {
    const span = document.createElement('span');
    span.className = `chip ${cls}`;
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
  const data = await chrome.storage.local.get(['resume_raw_text', 'resume_pdf', 'api_key', 'api_provider', 'model_name']);
  const resumeText = data.resume_raw_text || '';
  const resumePdf = data.resume_pdf || null;
  els.apiKey.value = data.api_key || '';
  els.apiProvider.value = data.api_provider || 'openrouter';
  els.modelName.value = data.model_name || 'openrouter/auto';

  if (resumeText || resumePdf) {
    els.resumeSavedState.classList.remove('hidden');
    els.resumeInputState.classList.add('hidden');
    if (resumeText) {
      els.resumeMeta.textContent = `${resumeText.split(/\s+/).filter(Boolean).length} words (text)`;
    } else {
      const kb = Math.round((resumePdf.size || 0) / 1024);
      els.resumeMeta.textContent = `${resumePdf.name || 'resume.pdf'} (${kb} KB, pdf)`;
    }
  } else {
    els.resumeSavedState.classList.add('hidden');
    els.resumeInputState.classList.remove('hidden');
  }
}

async function saveResume() {
  const text = els.resumeText.value.trim();
  if (!text) return setStatus('Please paste resume text first.', true);
  await chrome.storage.local.set({ resume_raw_text: text });
  els.resumeText.value = '';
  setStatus('Resume saved.');
  await loadState();
}

async function clearResume() {
  await chrome.storage.local.remove(['resume_raw_text', 'resume_pdf']);
  els.resultsSection.classList.add('hidden');
  lastScanContext = null;
  setStatus('Resume cleared.');
  await loadState();
}

async function saveResumePdf() {
  const file = els.resumePdf.files?.[0];
  if (!file) return setStatus('Please choose a PDF file first.', true);
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return setStatus('Only PDF files are supported.', true);

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read PDF file.'));
    reader.readAsDataURL(file);
  });

  await chrome.storage.local.set({
    resume_pdf: { name: file.name, type: file.type || 'application/pdf', size: file.size, lastModified: file.lastModified, dataUrl }
  });
  setStatus('Resume PDF saved locally. (Text extraction not enabled yet)');
  els.resumePdf.value = '';
  await loadState();
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
  els.resultsSection.classList.remove('hidden');
  els.scoreValue.textContent = String(baseResult.score);
  els.jobTitle.textContent = jdTitle;
  renderChips(els.matchedKeywords, baseResult.matchedKeywords, 'ok');
  renderChips(els.missingKeywords, baseResult.missingKeywords, 'miss');

  if (aiResult) {
    els.aiInsights.classList.remove('hidden');
    els.aiDomain.textContent = `${aiResult.domain || 'other'} (${aiResult.seniority || 'unknown'})`;
    els.aiConfidence.textContent = `${Math.round((aiResult.confidence || 0) * 100)}%`;
    els.aiScoreValue.textContent = String(aiResult.score);
  } else {
    els.aiInsights.classList.add('hidden');
    els.aiScoreValue.textContent = '-';
  }
}

async function scanJob() {
  try {
    setStatus('Scanning job description...');
    const { resume_raw_text, resume_pdf, learning_state } = await chrome.storage.local.get(['resume_raw_text', 'resume_pdf', 'learning_state']);
    if (!resume_raw_text && !resume_pdf) return setStatus('No resume found. Save resume first.', true);
    if (!resume_raw_text && resume_pdf) return setStatus('PDF is saved, but text extraction is not enabled yet. Paste text for now.', true);

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

async function aiCalibrate() {
  try {
    if (!lastScanContext) return setStatus('Scan a job first.', true);
    const data = await chrome.storage.local.get(['api_key', 'api_provider', 'model_name', 'learning_state']);

    setStatus('Calling AI analyzer...');
    const aiProfile = await window.aiEngine.analyzeJobWithAI({
      provider: data.api_provider || 'openrouter',
      apiKey: data.api_key || '',
      model: data.model_name || 'openrouter/auto',
      jdText: lastScanContext.cleanedJD,
      jobTitle: lastScanContext.jd.title,
      baseResult: lastScanContext.baseResult
    });

    const profileCalibrated = window.scoreResumeVsJD(lastScanContext.resumeText, lastScanContext.cleanedJD, lastScanContext.jd.title, aiProfile);
    const finalAIScore = Math.round((profileCalibrated.score * 0.55) + (aiProfile.ai_score * 0.45));

    const learningState = window.learningEngine.updateLearningState(data.learning_state || {}, aiProfile, {
      jdText: lastScanContext.cleanedJD,
      jobTitle: lastScanContext.jd.title
    });

    await chrome.storage.local.set({
      learning_state: learningState,
      last_ai_profile: aiProfile,
      last_scan: {
        title: lastScanContext.jd.title,
        url: lastScanContext.jd.url,
        ts: Date.now(),
        baseScore: lastScanContext.baseResult.score,
        aiModelScore: aiProfile.ai_score,
        aiCalibratedScore: finalAIScore,
        domain: aiProfile.domain,
        confidence: aiProfile.confidence
      }
    });

    renderResult(lastScanContext.baseResult, lastScanContext.jd.title, {
      ...aiProfile,
      score: finalAIScore
    });
    setStatus(`AI scored ${aiProfile.ai_score}/100 and learning updated for ${aiProfile.domain}. Future initial scans will improve.`);
  } catch (err) {
    setStatus(`AI calibration failed: ${err.message}`, true);
  }
}

function toggleSettings() { els.settingsSection.classList.toggle('hidden'); }

els.saveResumeBtn.addEventListener('click', saveResume);
els.savePdfBtn.addEventListener('click', saveResumePdf);
els.replaceBtn.addEventListener('click', () => { els.resumeSavedState.classList.add('hidden'); els.resumeInputState.classList.remove('hidden'); });
els.clearResumeBtn.addEventListener('click', clearResume);
els.scanBtn.addEventListener('click', scanJob);
els.aiCalibrateBtn.addEventListener('click', aiCalibrate);
els.settingsBtn.addEventListener('click', toggleSettings);
els.saveApiKeyBtn.addEventListener('click', saveApiSettings);
els.clearApiKeyBtn.addEventListener('click', clearApiSettings);

loadState();