# LeadBlast — Playwright Outreach Automation Backend

Real browser automation for bulk lead outreach. Visits each lead's website, finds the contact page, detects the form, fills it intelligently with your details, and submits it — then gives you a full report.

---

## Quick Start

### 1. Prerequisites
- **Node.js 18+** — https://nodejs.org
- **npm** (comes with Node.js)

### 2. Install

```bash
# Clone / unzip this folder, then:
cd leadblast
npm install
npm run install_browsers   # downloads Chromium (~120MB, one-time)
```

### 3. Start the server

```bash
npm start
```

Open your browser at: **http://localhost:3001**

That's it. The full UI will load in your browser.

---

## How It Works

```
Your CSV ──► Upload & Map Columns
              │
              ▼
         Sender Details (name, email, company, message template)
              │
              ▼
         Campaign Runner (parallel Playwright workers)
              │
         For each lead:
           1. Normalise & visit website URL
           2. Search for contact page (nav links + slug probing)
           3. Detect form fields (label, name, placeholder, aria-label analysis)
           4. Intelligently map fields → your sender data
           5. Fill form with human-like typing speed
           6. Submit form
           7. Stream result back to UI in real time
              │
              ▼
         Report: success / failed / no-form  +  CSV export
```

---

## CSV Format

Your file needs **at minimum** a website column. Everything else is optional but helpful.

| Column        | Example                    | Notes                         |
|---------------|----------------------------|-------------------------------|
| Company       | Acme Corp                  | Used in `{company}` template  |
| Website       | https://acmecorp.com       | **Required**                  |
| Contact Name  | John Smith                 | Optional                      |
| Email         | john@acmecorp.com          | Optional                      |
| Phone         | +1 555 0000                | Optional                      |

Any column names work — you map them in the UI.

---

## Sender Details & Message Template

Fill in the "Sender Details" tab:

- **Name, Company, Email, Phone, Website, Service** — used to fill matching form fields
- **Subject** — goes into subject/heading fields. Use `{company}` for dynamic replacement.
- **Message Body** — goes into message/textarea fields. Use `{company}` anywhere.

---

## Smart Form Detection

The engine scores each form field using keyword matching across:
- Field label text
- `name` attribute
- `placeholder`
- `aria-label`
- `id`

Matched to sender data fields:
| Form field type         | Filled with              |
|------------------------|--------------------------|
| Name / Full Name       | Your name                |
| Email                  | Your email               |
| Phone / Mobile         | Your phone               |
| Company / Organisation | Your company             |
| Subject / Heading      | Your subject line        |
| Message / Body / Comment | Your message body      |
| Website / URL          | Your website             |
| Service / Interest     | Your service offering    |

---

## Concurrency

Set the number of parallel Playwright browsers (1–5) in the Sender Details tab.

| Setting | Speed  | CPU usage |
|---------|--------|-----------|
| 1       | Slower | Low       |
| 2–3     | Good   | Medium    |
| 4–5     | Fast   | High      |

---

## Result Statuses

| Status    | Meaning                                              |
|-----------|------------------------------------------------------|
| ✓ success | Form found, filled, and submitted                    |
| ✗ failed  | Site unreachable, no fields filled, or submit failed |
| ⚠ noform  | Site loaded but no contact form found                |

---

## API Reference

The backend exposes a REST + SSE API if you want to integrate programmatically.

| Method | Endpoint                          | Description                          |
|--------|-----------------------------------|--------------------------------------|
| POST   | `/api/upload`                     | Upload CSV/XLSX → get rows + columns |
| POST   | `/api/campaign/start`             | Start a campaign                     |
| GET    | `/api/campaign/:id/stream`        | SSE stream (logs + results)          |
| POST   | `/api/campaign/:id/stop`          | Stop a running campaign              |
| GET    | `/api/campaign/:id/report`        | Full JSON report                     |
| GET    | `/api/campaign/:id/report/csv`    | Download CSV report                  |

---

## Troubleshooting

**"Could not reach website"** — The site may be down, blocking bots, or require HTTPS with a strict cert. Try opening the URL manually.

**"No contact page found"** — The site uses a non-standard contact URL pattern. You can manually add more slugs to `src/leadProcessor.js` → `CONTACT_SLUGS`.

**"Form detected but no fields could be filled"** — The form may be inside a heavily JS-rendered shadow DOM or a third-party embed (e.g. HubSpot, Salesforce). These often require extra handling.

**CAPTCHA failures** — Sites with reCAPTCHA or hCaptcha will block automated submissions. These leads will show as `failed` with a CAPTCHA note. Handle them manually.

**Port in use** — Change the port: `PORT=3002 npm start`

---

## Project Structure

```
leadblast/
├── server.js              # Express API server
├── src/
│   ├── campaignRunner.js  # Orchestrates parallel workers
│   ├── leadProcessor.js   # Playwright automation per lead
│   ├── formDetector.js    # Scans page for forms & fields
│   └── fieldMapper.js     # Maps fields → sender data
├── public/
│   └── index.html         # Full UI (served by Express)
├── package.json
└── README.md
```
