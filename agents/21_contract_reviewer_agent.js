// ============================================================
// LEGAL CONTRACT REVIEWER AGENT
// ============================================================
// Paste or load any contract → the agent:
//   • Scans for dangerous clauses and flags them by risk level
//   • Explains every risk in plain English (no legal jargon)
//   • Scores the overall contract risk 1–10
//   • Gives you a prioritized negotiation checklist
//   • Saves a full written report to disk
//
// Lawyers charge $300–$500/hr for this. The agent does it in seconds.
//
// SETUP:
//   npm install @google/generative-ai
//   GEMINI_API_KEY=your_key node 21_contract_reviewer_agent.js
// ============================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs   = require("fs");
const path = require("path");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────
// TOOL IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────

function read_contract({ filepath }) {
  if (!fs.existsSync(filepath))
    return { error: `File not found: ${filepath}` };
  const text = fs.readFileSync(filepath, "utf-8");
  return { text, wordCount: text.split(/\s+/).length, filepath };
}

function flag_risky_terms({ contractText }) {
  // Comprehensive list of terms that need attention — grouped by risk level
  const riskTerms = [
    // ── CRITICAL ──────────────────────────────────────────────
    { term: "unlimited liability",        risk: "critical", category: "Liability",    note: "No cap — you could owe everything" },
    { term: "indemnify and hold harmless",risk: "critical", category: "Liability",    note: "You pay their legal costs even if they cause the problem" },
    { term: "work for hire",              risk: "critical", category: "IP Rights",    note: "They own everything you create, even pre-existing work" },
    { term: "all intellectual property",  risk: "critical", category: "IP Rights",    note: "Extremely broad IP grab" },
    { term: "prior inventions",           risk: "critical", category: "IP Rights",    note: "May claim ownership of work you did before this contract" },
    // ── HIGH ──────────────────────────────────────────────────
    { term: "automatic renewal",          risk: "high",     category: "Termination",  note: "Locks you in unless YOU proactively cancel — easily missed" },
    { term: "auto-renew",                 risk: "high",     category: "Termination",  note: "Same as automatic renewal" },
    { term: "irrevocable",                risk: "high",     category: "IP Rights",    note: "You can never take this right back, ever" },
    { term: "perpetual",                  risk: "high",     category: "IP Rights",    note: "The right lasts forever — even after the contract ends" },
    { term: "non-compete",                risk: "high",     category: "Restrictions", note: "Limits your ability to work elsewhere — check scope and duration" },
    { term: "liquidated damages",         risk: "high",     category: "Penalties",    note: "Pre-agreed penalty amount — often disproportionate" },
    { term: "sole discretion",            risk: "high",     category: "Control",      note: "They decide with no obligation to be reasonable" },
    { term: "unilateral",                 risk: "high",     category: "Control",      note: "One-sided right to change terms or take action" },
    { term: "waive any right",            risk: "high",     category: "Rights",       note: "You are permanently giving up a legal protection" },
    { term: "class action waiver",        risk: "high",     category: "Disputes",     note: "You cannot join a group lawsuit — must sue alone" },
    { term: "data.*business purpose",     risk: "high",     category: "Privacy",      note: "Broad license to use your data for any reason" },
    { term: "no refund",                  risk: "high",     category: "Payment",      note: "No money back under any circumstances" },
    { term: "early termination fee",      risk: "high",     category: "Termination",  note: "Costly to exit even if they breach first" },
    // ── MEDIUM ────────────────────────────────────────────────
    { term: "non-solicitation",           risk: "medium",   category: "Restrictions", note: "Cannot hire their employees or poach their clients" },
    { term: "assignment",                 risk: "medium",   category: "Assignment",   note: "They can transfer your contract to someone else" },
    { term: "binding arbitration",        risk: "medium",   category: "Disputes",     note: "Cannot sue in court — private arbitrator decides" },
    { term: "governing law",              risk: "medium",   category: "Jurisdiction", note: "Disputes resolved under laws of their home state/country" },
    { term: "force majeure",              risk: "medium",   category: "Risk",         note: "They can delay/cancel with no penalty for broad events" },
    { term: "modify.*at any time",        risk: "medium",   category: "Control",      note: "They can change terms without your consent" },
    { term: "60 days",                    risk: "medium",   category: "Payment",      note: "Very long payment terms — cash flow risk" },
    { term: "at our discretion",          risk: "medium",   category: "Control",      note: "Subjective decision-making with no standard" },
    // ── LOW ───────────────────────────────────────────────────
    { term: "notice.*30 days",            risk: "low",      category: "Termination",  note: "Notice period before termination — standard but check both sides" },
    { term: "entire agreement",           risk: "low",      category: "General",      note: "Prior verbal promises are not enforceable" },
    { term: "severability",               risk: "low",      category: "General",      note: "Normal protective clause — usually fine" },
  ];

  const lower   = contractText.toLowerCase();
  const matched = riskTerms.filter((t) => new RegExp(t.term, "i").test(contractText));

  return {
    flaggedTerms:  matched,
    totalFlags:    matched.length,
    criticalCount: matched.filter((t) => t.risk === "critical").length,
    highCount:     matched.filter((t) => t.risk === "high").length,
    mediumCount:   matched.filter((t) => t.risk === "medium").length,
    lowCount:      matched.filter((t) => t.risk === "low").length,
    wordCount:     contractText.split(/\s+/).length,
  };
}

function extract_section({ contractText, sectionKeyword }) {
  // Pull out the paragraph(s) most likely containing this section
  const lines    = contractText.split("\n");
  const startIdx = lines.findIndex((l) =>
    l.toLowerCase().includes(sectionKeyword.toLowerCase())
  );
  if (startIdx === -1) return { found: false, sectionKeyword };

  // Grab the section heading + next ~20 lines (enough to capture the clause)
  const snippet = lines.slice(startIdx, startIdx + 20).join("\n").trim();
  return { found: true, sectionKeyword, snippet, startLine: startIdx + 1 };
}

function save_report({ filename, content }) {
  const dir = "./contract-reviews";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, content, "utf-8");
  return { success: true, filepath, sizeKB: (Buffer.byteLength(content) / 1024).toFixed(1) };
}

const TOOL_MAP = { read_contract, flag_risky_terms, extract_section, save_report };

// ─────────────────────────────────────────────────────────────
// TOOL DECLARATIONS
// ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "read_contract",
        description: "Read a contract file from disk",
        parameters: {
          type: "OBJECT",
          properties: { filepath: { type: "STRING" } },
          required: ["filepath"],
        },
      },
      {
        name: "flag_risky_terms",
        description:
          "Scan contract text for dangerous/risky terms and return a structured list grouped by risk level (critical, high, medium, low)",
        parameters: {
          type: "OBJECT",
          properties: { contractText: { type: "STRING" } },
          required: ["contractText"],
        },
      },
      {
        name: "extract_section",
        description:
          "Extract a specific section from the contract by searching for a keyword (e.g. 'termination', 'liability', 'payment')",
        parameters: {
          type: "OBJECT",
          properties: {
            contractText:   { type: "STRING" },
            sectionKeyword: { type: "STRING", description: "Keyword to search for, e.g. 'termination', 'non-compete', 'IP'" },
          },
          required: ["contractText", "sectionKeyword"],
        },
      },
      {
        name: "save_report",
        description: "Save the completed review report to a markdown file",
        parameters: {
          type: "OBJECT",
          properties: {
            filename: { type: "STRING" },
            content:  { type: "STRING" },
          },
          required: ["filename", "content"],
        },
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// SAMPLE CONTRACTS
// ─────────────────────────────────────────────────────────────
const FREELANCE_CONTRACT = `
FREELANCE SERVICES AGREEMENT
Effective Date: March 1, 2024
Between: TechCorp Inc. ("Client") and the undersigned freelancer ("Contractor")

1. SERVICES
Contractor will provide software development services as directed by Client.
Client may modify the scope, timeline, or deliverables at any time at its sole discretion
without additional compensation to Contractor.

2. PAYMENT
Rate: $85/hour. Invoices must be submitted within 7 days of task completion.
Client will pay invoices within 60 days of receipt. No interest accrues on late payments.
Client may dispute any invoice up to 90 days after receipt and withhold full payment during dispute.
No payment is owed for work completed on tasks Client later decides not to proceed with.

3. INTELLECTUAL PROPERTY
All work product, code, inventions, improvements, discoveries, and developments ("Work Product")
created by Contractor — including during personal time — that relates in any way to Client's
current or reasonably anticipated business shall be considered work-for-hire and shall be the sole,
exclusive, and irrevocable property of Client. Contractor hereby assigns all intellectual property
rights, including moral rights, to Client on a perpetual, worldwide, royalty-free basis.
This assignment includes any tools, libraries, or frameworks Contractor develops or modifies
during the engagement, even if used in prior or future projects.

4. CONFIDENTIALITY
Contractor agrees to keep all information related to Client's business strictly confidential
for 10 years after termination. This includes technical, financial, and strategic information.

5. NON-COMPETE AND NON-SOLICITATION
For 3 years after termination, Contractor shall not provide services to any entity that
competes with Client in any market globally, including direct competitors, adjacent markets,
or potential future markets as determined by Client at its sole discretion.
Contractor shall not solicit Client's customers, partners, or employees for 5 years post-termination.

6. LIABILITY
Contractor is liable for all damages arising from services, including indirect, consequential,
punitive, and special damages, with no cap or limitation.
Client's maximum liability to Contractor shall not exceed $100 regardless of the nature of the claim.

7. TERMINATION
Client may terminate immediately without cause and without notice.
Upon termination for any reason, Client owes no payment for work completed but not yet invoiced.
This agreement auto-renews annually unless Contractor provides 90 days written notice of cancellation
sent by certified mail to Client's registered address.

8. MODIFICATION OF TERMS
Client reserves the right to modify these terms at any time by posting updated terms on its website.
Contractor's continued provision of services constitutes acceptance of modified terms.

9. DISPUTES
All disputes shall be resolved by binding arbitration in San Francisco, California under AAA rules.
Contractor waives all rights to jury trial and class action proceedings.
This agreement is governed by California law.
`;

const SAAS_CONTRACT = `
SOFTWARE AS A SERVICE SUBSCRIPTION AGREEMENT

1. SUBSCRIPTION FEES
Customer subscribes to the Enterprise Plan at $2,500/month billed annually ($30,000/year).
Subscription auto-renews each year. Provider may increase pricing by up to 25% per renewal term
with 30 days notice. No prorated refunds for early cancellation.
Early termination fee: 100% of remaining contract value.

2. DATA LICENSE
Customer grants Provider a non-exclusive, perpetual, irrevocable, worldwide, royalty-free license
to use, copy, process, display, and create derivative works from Customer Data for the purpose of:
(a) providing the service; (b) improving Provider's products and AI models; (c) any other
legitimate business purpose as determined by Provider. Provider may share anonymized or aggregated
Customer Data with third parties without restriction.

3. SERVICE LEVELS
Provider will use commercially reasonable efforts to maintain 99% monthly uptime.
Provider's sole liability for SLA violations is a service credit of 10% of the monthly fee.
Provider is not liable for any damages, losses, or costs resulting from service unavailability.
Provider may perform maintenance at any time with or without advance notice.

4. INTELLECTUAL PROPERTY
All data, reports, analyses, and insights generated using Customer Data remain Provider's property.
Customer receives a limited license to view results during the subscription term only.

5. TERMINATION AND DATA
Provider may terminate this agreement immediately if Provider determines, in its sole discretion,
that Customer has violated any term of this agreement.
Upon termination for any reason, Customer Data will be permanently deleted within 24 hours.
No data export is available after termination is initiated.

6. LIMITATION OF LIABILITY
Provider's total aggregate liability under this agreement shall not exceed $500.
Provider is not liable for any indirect, consequential, incidental, special, or punitive damages
regardless of the cause, even if advised of the possibility of such damages.

7. CHANGES TO SERVICE
Provider may modify, limit, or discontinue any feature or the entire service at any time
without notice and without any obligation to Customer.

8. GOVERNING LAW AND DISPUTES
This agreement is governed by the laws of Delaware. All disputes must be resolved through
binding arbitration. Customer waives the right to participate in class action proceedings.
`;

// Write to disk
fs.mkdirSync("./contracts", { recursive: true });
fs.writeFileSync("./contracts/freelance-agreement.txt", FREELANCE_CONTRACT, "utf-8");
fs.writeFileSync("./contracts/saas-agreement.txt", SAAS_CONTRACT, "utf-8");

// ─────────────────────────────────────────────────────────────
// AGENT
// ─────────────────────────────────────────────────────────────
async function reviewContract({ filepath, contractType, signingParty }) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: TOOLS,
    systemInstruction: `
You are an experienced contract attorney protecting the interests of the person SIGNING the contract.
You are NOT the drafter — you are the reviewer protecting the weaker party.

Your review process:
1. read_contract to load the full text
2. flag_risky_terms to get a structured scan of all dangerous terms
3. extract_section for each HIGH and CRITICAL risk area to read the exact clause language
4. Write the full review report and save it with save_report

REPORT FORMAT (follow exactly):

# ⚖️ Contract Review Report
**Contract:** [type]
**Reviewed for:** [signing party]
**Date:** [today]

---

## 🚨 Overall Risk Score: X/10
[2–3 sentence plain-English verdict. Would you advise signing as-is?]

---

## 🔴 CRITICAL ISSUES — Do NOT sign until these are fixed

For each critical issue:
### [Clause Name] — [Category]
**What it says:** (quote the exact problematic language)
**What it means in plain English:** (explain like talking to a smart non-lawyer)
**The real risk:** (specific worst-case scenario with dollar/career impact)
**What to ask for instead:** (specific alternative language or deletion)

---

## 🟡 CONCERNING CLAUSES — Negotiate if possible

Same format as above but for high/medium risk items.

---

## 🟢 ACCEPTABLE CLAUSES
Brief note on what is standard and fair.

---

## 💰 Financial Risk Assessment
Quantify the potential financial exposure from the risky clauses.

## ⚖️ Power Imbalance Analysis
Who holds power in this contract and how one-sided is it?

---

## 📋 TOP 5 NEGOTIATION PRIORITIES
Numbered list, most important first.
For each: what to ask for + why + likelihood of success

---

## ✅ BEFORE SIGNING CHECKLIST
- [ ] Item 1
- [ ] Item 2
...

---

Quote exact contract language when discussing specific clauses.
Write for a smart person who is NOT a lawyer.
Be direct about how bad bad clauses actually are.
`,
  });

  console.log("\n" + "═".repeat(65));
  console.log(`⚖️  CONTRACT REVIEW`);
  console.log(`   File    : ${filepath}`);
  console.log(`   Type    : ${contractType}`);
  console.log(`   Party   : ${signingParty}`);
  console.log("═".repeat(65));

  const chat = model.startChat();
  let resp = await chat.sendMessage(
    `Please review the contract at "${filepath}". This is a ${contractType}. 
     I am ${signingParty} and I need to know if it's safe to sign.
     Do a complete review: read the contract, flag all risky terms, extract and analyze each 
     risky section in detail, then save the full report as "${path.basename(filepath, ".txt")}-review.md".`
  );

  let steps = 0;
  while (steps++ < 20) {
    const parts = resp.response.candidates[0].content.parts;
    const calls = parts.filter((p) => p.functionCall);

    if (!calls.length) {
      const text = parts.map((p) => p.text || "").join("").trim();
      if (text) console.log("\n" + text);
      break;
    }

    const results = calls.map((p) => {
      const { name, args } = p.functionCall;
      const logArgs = Object.fromEntries(
        Object.entries(args).map(([k, v]) => [
          k,
          typeof v === "string" && v.length > 100 ? `[${v.length} chars]` : v,
        ])
      );
      console.log(`  ⚙️  ${name}(${JSON.stringify(logArgs)})`);
      return { functionResponse: { name, response: TOOL_MAP[name](args) } };
    });

    resp = await chat.sendMessage(results);
  }
}

// ─────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(65));
  console.log("⚖️  LEGAL CONTRACT REVIEWER AGENT");
  console.log("═".repeat(65));

  await reviewContract({
    filepath:      "./contracts/freelance-agreement.txt",
    contractType:  "Freelance Services Agreement",
    signingParty:  "the freelance contractor (individual developer)",
  });

  await reviewContract({
    filepath:      "./contracts/saas-agreement.txt",
    contractType:  "SaaS Subscription Agreement",
    signingParty:  "the customer (business subscribing to the software)",
  });

  // Summary
  const dir = "./contract-reviews";
  if (fs.existsSync(dir)) {
    console.log("\n\n✅ Review reports saved:");
    fs.readdirSync(dir).forEach((f) => {
      const kb = (fs.statSync(path.join(dir, f)).size / 1024).toFixed(1);
      console.log(`   📄 ${path.join(dir, f)}  (${kb} KB)`);
    });
  }
}

main().catch(console.error);
