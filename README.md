# ATS Resume Scorer (Chrome Extension)

<p align="center">
  <b>Scan any job page, compare it against your resume, and get ATS-focused improvements in seconds.</b>
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Extension%20MV3-4285F4?logo=googlechrome&logoColor=white" />
  <img alt="UI" src="https://img.shields.io/badge/UI-Side%20Panel-0EA5E9" />
  <img alt="Scoring" src="https://img.shields.io/badge/Scoring-ATS%20Weighted-10B981" />
  <img alt="AI" src="https://img.shields.io/badge/AI-Gemini%20%7C%20OpenRouter-8B5CF6" />
</p>

---

## ✨ What this extension does

**ATS Resume Scorer** helps you evaluate resume-job fit directly inside the browser:

- Extracts job description text from the current active tab
- Parses resume content from:
  - plain text
  - PDF
  - DOCX
- Computes a weighted ATS-style score (0–100)
- Shows matched vs missing keywords
- Runs AI calibration + improvement recommendations
- Learns over time using **explicit user feedback** (👍 / 👎)
- Runs as a **Chrome Side Panel** (persistent and convenient)

---

## 🧠 Scoring model (high level)

The baseline scorer combines multiple ATS-like signals:

- **Keyword relevance and coverage**
- **Phrase alignment** (TF/specificity-weighted phrase extraction)
- **Skills overlap** (including must-have weighting)
- **Title alignment**
- **Structure & formatting signals** (sections, date consistency, contact data, quantified achievements)

Then the final score is calibrated with AI profile weights on a consistent 0–100 scale.

---

## 🤖 AI calibration flow

When AI Scoring is used:

1. AI analyzes JD + baseline score and returns structured profile:
   - domain, seniority
   - must-have skills
   - keyword boosts/noise
   - scoring weights
2. AI generates practical recommendation blocks:
   - critical additions
   - rewrite suggestions
   - quick wins
   - sections to add
3. User gives feedback (**Yes/No accuracy signal**) after scoring.

> Learning updates now depend on user feedback, not only AI confidence.

---

## 🧩 Side panel UX

The extension opens in Chrome side panel via action click.

- `manifest.json` uses `side_panel.default_path = popup.html`
- `background.js` enables `openPanelOnActionClick`
- Existing UI design is preserved in side panel layout

---

## 📁 Project structure

```text
.
├── manifest.json           # Chrome extension manifest (MV3)
├── background.js           # Side panel behavior
├── popup.html              # Main UI
├── popup.css               # Styling
├── popup.js                # UI logic, scan flow, feedback wiring
├── scorer.js               # ATS baseline + calibrated scoring engine
├── ai.js                   # AI provider integration + prompt orchestration
├── learning.js             # Domain learning + feedback-based updates
├── resume-parser.js        # PDF/DOCX extraction pipeline
├── pdf.min.js              # PDF.js runtime
├── pdf.worker.min.js       # PDF.js worker
├── mammoth.browser.min.js  # DOCX parser
└── README.md
```

---

## 🚀 Setup (local)

### 1) Install dependencies

```bash
npm install
```

### 2) Load extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder

### 3) Open the extension

- Click the extension icon
- Side panel opens

---

## 🔑 Configure AI

In **Settings** inside the extension:

- Select provider (`Gemini`, `OpenAI/OpenRouter` path via current implementation)
- Paste API key
- Optionally set model
- Save

If no API key is set, baseline scoring still works; AI scoring won’t run.

---

## 🛠 Usage

1. Add resume text (or upload PDF/DOCX)
2. Open a job posting page
3. Click **Scan Job Page**
4. Review:
   - score ring
   - matched keywords
   - missing keywords
5. Click **AI Scoring** for deeper recommendations
6. Provide feedback via **👍 Yes / 👎 No**

---

## 🔒 Privacy notes

- Resume and learning state are stored in `chrome.storage.local`
- AI calls are made only when user runs AI scoring
- API keys are saved locally in extension storage

> If needed for production, consider encrypted key handling and explicit consent prompts.

---

## ⚠️ Current limitations

- Keyword/skills dictionaries are still curated and not exhaustive for every niche
- Scraping quality depends on page structure of job board
- AI output quality depends on model/provider
- No server-side analytics or outcome tracking yet

---

## 🗺 Roadmap ideas

- Broader role ontology (DevRel, Security, Data Eng, QA, PMM…)
- Better JD extraction fallback strategies per site
- Exportable resume improvement checklist
- Resume version snapshots + score comparison
- Optional outcomes tracking loop (interview callbacks/offers)

---

## 🧪 Development tips

- Use Chrome extension reload after JS/manifest changes
- Keep inline JS handlers out of HTML (CSP-safe events only)
- For large parser/vendor files, keep minified assets version-pinned

---

## 📜 License

Currently marked as **ISC** in `package.json`.

If you plan to publish publicly, consider adding a dedicated `LICENSE` file.

---

## 🙌 Credits

Built as a practical ATS assistant for rapid resume-job matching and action-oriented improvement.