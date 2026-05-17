# Fast Build Plan — ATS Resume Scorer Chrome Extension

Source PRD copied into this project as: `ats-extension-prd.html`

## Goal
Build a usable Chrome Extension MVP quickly:
1. Store/paste a resume.
2. Scrape the current job page.
3. Score resume vs JD locally.
4. Show matched/missing keywords.
5. Add optional AI feedback using a free/free-tier API.

## Important Product Decision
For speed, Phase 1 will prioritize pasted resume text over PDF upload. PDF parsing can be added after the core flow works.

For Phase 2, avoid paid Claude API initially. Use a free/free-tier provider option:

### Preferred Phase 2 API Options
1. **Google Gemini API free tier**
   - Good free-tier availability.
   - Browser-callable via REST.
   - User supplies their own API key.
   - Store key in `chrome.storage.local`.
2. **OpenRouter free models**
   - Can route to free/community models when available.
   - User supplies OpenRouter API key.
3. **Groq free tier**
   - Fast inference, free developer tier availability may vary.

Recommended default: **Gemini API** because it is commonly available and simple for users to set up.

---

# Phase 0 — Project Skeleton, 30–45 min

## Files to create
```txt
manifest.json
popup.html
popup.css
popup.js
content-script.js
background.js
scorer.js
ai.js
resume-parser.js
pdf-export.js
icons/
```

## Manifest permissions
- `activeTab`
- `scripting`
- `storage`
- `contextMenus`

## Deliverable
Extension loads successfully via `chrome://extensions` → Developer Mode → Load unpacked.

---

# Phase 1 — Local MVP, fastest path, 3–5 hours

## 1. Popup UI
Screens:
- No resume stored
  - textarea for paste resume
  - save button
- Resume stored
  - resume preview/status
  - replace/clear resume
  - Scan This Job button
- Results
  - score
  - matched keywords
  - missing keywords
  - AI Feedback button disabled until API key exists or shows setup prompt
- Settings
  - Gemini API key input
  - save/clear key

## 2. Resume Storage
Use `chrome.storage.local`:
```js
{
  resume_raw_text: string,
  api_provider: 'gemini',
  api_key: string,
  resume_vault: []
}
```

## 3. JD Scraping
`content-script.js`:
- Try common selectors first:
  - LinkedIn job descriptions
  - Greenhouse
  - Lever
  - Workday-like containers
- Fallback to readable visible body text.
- Return `{ title, url, text }`.

## 4. Local Scoring
`scorer.js`:
- normalize text
- tokenize
- remove stopwords
- extract phrases and keywords
- curated skills dictionary
- score formula:
  - 70% keyword overlap
  - 20% skills match
  - 10% title/role terms

Simplified MVP output:
```js
{
  score: number,
  matchedKeywords: string[],
  missingKeywords: string[],
  matchedSkills: string[],
  missingSkills: string[]
}
```

## 5. Manual Testing
Test on:
- LinkedIn job page
- Greenhouse job page
- Lever job page
- random job page fallback

## Phase 1 Acceptance Criteria
- User can paste and save resume.
- User can scan current page.
- Score appears in under 2 seconds.
- Matched/missing keywords render clearly.
- Extension works without any API key.

---

# Phase 2 — Free API AI Feedback, 1–2 hours after Phase 1

## API Provider
Use **Gemini API free tier** first.

Endpoint example:
```txt
https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=API_KEY
```

Model choice:
- `gemini-1.5-flash` or latest available flash model.

## AI Feedback Feature
Button: `Get AI Feedback`

Prompt should send:
- Resume text
- JD text
- local scoring result

Ask model to return concise JSON:
```json
{
  "summary": "...",
  "top_fixes": ["...", "...", "..."],
  "missing_keywords_priority": ["..."],
  "rewrite_suggestions": ["..."]
}
```

## Safety / Cost Controls
- Only call API when user clicks.
- Truncate resume/JD if too long.
- Show approximate text length.
- Store key locally only.
- Add clear message: user is using their own API key.

## Phase 2 Acceptance Criteria
- User can save Gemini API key.
- AI feedback returns and renders inside popup.
- If no key, UI asks user to add one.
- If API fails, show readable error.

---

# Phase 3 — Tailored Resume MVP, 2–4 hours

## Scope
Keep simple for first version:
- Generate tailored bullet suggestions, not a full complex diff engine.
- Show original resume text and AI-tailored text in separate boxes.
- Add copy button.
- Save to vault.

## Tailoring Prompt
Ask Gemini to:
- Preserve truthfulness.
- Do not invent companies, degrees, metrics, or tools.
- Reorder skills based on JD.
- Rewrite bullets to emphasize matching experience.
- Return plain text or Markdown.

## Vault
Store max 20:
```js
resume_vault: [
  {
    job_title,
    job_url,
    date,
    tailored_resume
  }
]
```

## Phase 3 Acceptance Criteria
- Tailor button generates a revised resume draft.
- User can copy tailored output.
- Tailored version is saved to local vault.

---

# Phase 4 — PDF Upload and Export, optional polish, 3–6 hours

## PDF Input
Add PDF.js only after paste-based MVP works.

## PDF Export
Add jsPDF or simpler browser print flow first.

Fastest option:
- Provide `Download .txt` first.
- Then add PDF export.

---

# Fast Implementation Order

1. Create extension skeleton.
2. Build popup UI and storage.
3. Build content script scrape function.
4. Build local scorer.
5. Wire Scan button end-to-end.
6. Add settings screen for Gemini key.
7. Add `ai.js` for Gemini feedback.
8. Add tailor resume button.
9. Add vault.
10. Add PDF features last.

---

# Suggested MVP File Responsibilities

## `manifest.json`
Chrome MV3 config.

## `popup.html`
All popup markup.

## `popup.css`
Compact extension UI styling.

## `popup.js`
- Load/save resume.
- Trigger scan.
- Render result.
- Manage settings.
- Call AI functions.

## `content-script.js`
Scrape current page text/title/url.

## `scorer.js`
Local keyword extraction and scoring.

## `ai.js`
Gemini/OpenRouter/Groq calls.

## `background.js`
Context menu and minimal service worker.

---

# Recommended First MVP Cut
Do not implement everything in the PRD immediately. The fastest useful build is:

- Paste resume only.
- Local scoring only.
- Gemini feedback only.
- Tailored text output only.
- Copy/download text instead of PDF.

Then iterate into PDF parsing, PDF export, advanced diff, and site-specific scraping.
