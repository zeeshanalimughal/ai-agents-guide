# 🤖 AI Agents, Skills, MCP & Multi-Agent Patterns (Node.js + Gemini)

A practical collection of **23 runnable AI agent demos** plus a reusable base agent class.

This project shows how to build:
- single-tool and multi-tool agents,
- skill-composed agents,
- MCP servers and MCP-connected clients,
- sequential and orchestrated multi-agent systems,
- domain-focused assistants (email, SQL, travel, HR, finance, legal, healthcare, and more).

---

## What’s in this repo

- `index.html` — complete tutorial/guide with explanations and code walkthroughs.
- `agents/` — all runnable demo scripts.
- `package.json` — dependencies and metadata.

---

## Requirements

- **Node.js 18+**
- **npm**
- **Gemini API key**

Set your key:

### Windows PowerShell
```powershell
$env:GEMINI_API_KEY="your_api_key_here"
```

### macOS/Linux
```bash
export GEMINI_API_KEY="your_api_key_here"
```

---

## Install

```bash
npm install
```

---

## Quick start

Run any demo directly:

```bash
node agents/01_calculator_agent.js
```

MCP example:

```bash
node agents/03_mcp_server.js
# in another terminal
node agents/04_mcp_client_agent.js
```

> Note: `04_mcp_client_agent.js` can also launch/connect to the MCP server process internally, depending on script flow.

---

## Project structure

```text
.
├── index.html
├── package.json
└── agents/
    ├── 01_calculator_agent.js
    ├── 02_skilled_agent.js
    ├── 03_mcp_server.js
    ├── 04_mcp_client_agent.js
    ├── 05_research_agent.js
    ├── 06_multi_agent_pipeline.js
    ├── 07_orchestrator_pattern.js
    ├── 08_email_agent.js
    ├── 09_sql_agent.js
    ├── 10_travel_planner_agent.js
    ├── 11_news_digest_multi_agent.js
    ├── 12_hr_recruiter_agent.js
    ├── 13_code_review_multi_agent.js
    ├── 14_finance_agent.js
    ├── 15_social_media_multi_agent.js
    ├── 16_inventory_agent.js
    ├── 17_debate_multi_agent.js
    ├── 18_onboarding_agent.js
    ├── 19_api_doc_writer_agent.js
    ├── 20_bug_triager_multi_agent.js
    ├── 21_contract_reviewer_agent.js
    ├── 22_job_application_agent.js
    ├── 23_medication_agent.js
    └── base-agent.js
```

---

## 🚀 Detailed demo catalog

### 🧱 Foundations

- 🤖 **`agents/01_calculator_agent.js`**  
  **Focus:** Basic tool-calling loop (ReAct style).  
  **Shows:** Function declarations, math tool execution, iterative tool-call handling until final answer.

- 🧠 **`agents/02_skilled_agent.js`**  
  **Focus:** Skill composition in one assistant.  
  **Shows:** Merging instructions + tools for order tracking, refunds, and product lookup.

- 🧩 **`agents/base-agent.js`**  
  **Focus:** Reusable agent architecture.  
  **Shows:** `BaseAgent` class, max-steps protection, generic tool dispatch, and extensibility via subclasses.

### 🔌 MCP (Model Context Protocol)

- 🛠️ **`agents/03_mcp_server.js`**  
  **Focus:** Building an MCP server over stdio.  
  **Shows:** Tool/resource registration, todo CRUD, file read/write/list tools.

- 🔗 **`agents/04_mcp_client_agent.js`**  
  **Focus:** Gemini + MCP integration.  
  **Shows:** Tool discovery from MCP server, schema conversion, runtime dispatch of model tool calls.

### 🧭 Single-agent domain demos

- 🔎 **`agents/05_research_agent.js`**  
  **Focus:** Research workflow agent.  
  **Shows:** Web search, note save/read/list/delete/merge, timestamping, local output in `research_notes/`.

- 📧 **`agents/08_email_agent.js`**  
  **Focus:** Email operations assistant.  
  **Shows:** Inbox filtering, thread reading, drafting/sending replies, and action-oriented summaries.

- 🗃️ **`agents/09_sql_agent.js`**  
  **Focus:** Natural-language analytics over SQL.  
  **Shows:** Safe query execution pattern (`SELECT`/`WITH`), schema inspection, business KPI responses.

- ✈️ **`agents/10_travel_planner_agent.js`**  
  **Focus:** Skill-based travel planning.  
  **Shows:** Weather + flights + hotels orchestration and budget-aware itinerary suggestions.

- 🧑‍💼 **`agents/12_hr_recruiter_agent.js`**  
  **Focus:** Recruitment and screening assistant.  
  **Shows:** Candidate-job matching, status updates, interview scheduling, pipeline summaries.

- 💰 **`agents/14_finance_agent.js`**  
  **Focus:** Personal finance coaching.  
  **Shows:** Expense tracking, budget checks, goal planning, and savings guidance.

- 📦 **`agents/16_inventory_agent.js`**  
  **Focus:** Inventory intelligence assistant.  
  **Shows:** Low-stock alerts, reorder automation, purchase-order creation, stock updates.

- 👋 **`agents/18_onboarding_agent.js`**  
  **Focus:** SaaS onboarding flows.  
  **Shows:** Account setup, feature recommendations, support ticket generation.

- 📘 **`agents/19_api_doc_writer_agent.js`**  
  **Focus:** API docs generation.  
  **Shows:** Route scanning, endpoint extraction, markdown/openapi/postman outputs in `api-docs-output/`.

- 📑 **`agents/21_contract_reviewer_agent.js`**  
  **Focus:** Contract risk analysis.  
  **Shows:** Risky clause flagging, section extraction, report generation in `contract-reviews/`.

- 🧾 **`agents/22_job_application_agent.js`**  
  **Focus:** Job application package creator.  
  **Shows:** JD + resume parsing, fit scoring, tailored resume/cover letter/interview prep outputs.

- 💊 **`agents/23_medication_agent.js`**  
  **Focus:** Medication adherence assistant.  
  **Shows:** Dose logging, interaction checks, refill reminders, doctor report generation.

### 🤝 Multi-agent patterns

- 🏗️ **`agents/06_multi_agent_pipeline.js`**  
  **Pattern:** Sequential pipeline.  
  **Flow:** Researcher → Writer → Editor → Quality reviewer.

- 🎯 **`agents/07_orchestrator_pattern.js`**  
  **Pattern:** Dynamic orchestration.  
  **Flow:** Orchestrator decomposes tasks and routes work to specialist worker agents (parallel capable).

- 📰 **`agents/11_news_digest_multi_agent.js`**  
  **Pattern:** Data + summarization pipeline.  
  **Flow:** News fetcher → Topic categorizer → Digest writer.

- 🔍 **`agents/13_code_review_multi_agent.js`**  
  **Pattern:** Parallel expert review.  
  **Flow:** Quality reviewer + Security auditor + Improvement suggester → Unified final report.

- 📱 **`agents/15_social_media_multi_agent.js`**  
  **Pattern:** Content production pipeline.  
  **Flow:** Idea generator → Platform-specific writer → Scheduler/calendar planner.

- ⚖️ **`agents/17_debate_multi_agent.js`**  
  **Pattern:** Structured adversarial reasoning.  
  **Flow:** Pro agent + Con agent (parallel rounds) → Judge scoring and verdict.

- 🐞 **`agents/20_bug_triager_multi_agent.js`**  
  **Pattern:** Support + engineering dual output triage.  
  **Flow:** Classifier + duplicate finder → reporter response + internal dev brief.

---

## Dependencies

Main packages:
- `@google/generative-ai`
- `@modelcontextprotocol/sdk`
- `better-sqlite3`

Installed via `npm install`.

---

## Notes & caveats

- Most demos use **mock/in-memory data** for learning and reset on each run.
- Some demos call public endpoints (e.g., web/news fetch) and may be network-dependent.
- Several demos create local output folders/files:
  - `research_notes/`
  - `api-docs-output/`
  - `contract-reviews/`
  - `job-application-output/`
  - plus sample input folders created by certain scripts.
- Domain demos (legal/medical/finance) are **educational prototypes**, not professional advice tools.
- `package.json` script paths may not match current `agents/` layout in this workspace; direct `node agents/<file>.js` is the reliable run method.

---

## Recommended learning order

1. `01_calculator_agent.js`
2. `02_skilled_agent.js`
3. `base-agent.js`
4. `03_mcp_server.js` + `04_mcp_client_agent.js`
5. `06_multi_agent_pipeline.js`
6. `07_orchestrator_pattern.js`
7. Domain demos (`08`–`23`) by your interest

---

## Troubleshooting

- **`GEMINI_API_KEY` missing**: set env var before running demos.
- **Network/API errors**: verify internet access and API key validity.
- **SQLite build issues (`better-sqlite3`)**: ensure supported Node version and build tools.
- **MCP client/server issues**: run server and client from repo root so relative paths resolve.

---

## License

No license file is currently included in this repository. Add one if you plan to distribute publicly.
