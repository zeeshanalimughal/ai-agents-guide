// ============================================================
// BUG REPORT TRIAGER — Multi-Agent System
// ============================================================
// New bug report comes in →
//   Agent 1 (Classifier)     — severity, priority, labels
//   Agent 2 (Finder)         — duplicates, past fixes, root cause hints
//   Agent 3 (Responder)      — public reply to reporter
//   Agent 4 (Dev Briefer)    — internal engineering summary
//
// Agents 1+2 run in parallel, then 3+4 run in parallel using their results.
//
// SETUP:
//   npm install @google/generative-ai
//   GEMINI_API_KEY=your_key node 20_bug_triager_multi_agent.js
// ============================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────
// HISTORICAL BUG DATABASE  (your past resolved issues)
// ─────────────────────────────────────────────────────────────
const PAST_BUGS = [
  {
    id: "BUG-0041",
    title: "JWT token still valid after password reset",
    status: "fixed",
    version: "v2.3.0",
    resolution: "Added token blacklist in Redis. On password change, all existing tokens for that user are invalidated.",
    component: "auth",
    severity: "critical",
  },
  {
    id: "BUG-0038",
    title: "Login fails when password contains special characters",
    status: "fixed",
    version: "v2.1.3",
    resolution: "bcrypt was double-encoding input. Fixed by passing raw string to compare().",
    component: "auth",
    severity: "high",
  },
  {
    id: "BUG-0055",
    title: "GET /users endpoint timeout on large datasets",
    status: "fixed",
    version: "v2.4.1",
    resolution: "Added compound index on (createdAt, _id). Query now uses covered index scan.",
    component: "api",
    severity: "high",
  },
  {
    id: "BUG-0061",
    title: "File upload silently fails for PDFs over 5 MB",
    status: "open",
    version: null,
    resolution: null,
    component: "upload",
    severity: "medium",
  },
  {
    id: "BUG-0072",
    title: "Pagination returns wrong total count with search filter",
    status: "fixed",
    version: "v2.2.1",
    resolution: "countDocuments() was called without the search filter. Fixed by passing filter to both queries.",
    component: "api",
    severity: "low",
  },
  {
    id: "BUG-0080",
    title: "Dashboard crashes on Safari with CSS grid layout",
    status: "fixed",
    version: "v2.2.0",
    resolution: "Added -webkit-grid prefix. Safari 16 needs webkit prefixes for some grid features.",
    component: "frontend",
    severity: "medium",
  },
  {
    id: "BUG-0089",
    title: "Duplicate emails sent on user registration",
    status: "fixed",
    version: "v2.1.8",
    resolution: "Event listener registered twice in app.js. Removed duplicate require().",
    component: "notifications",
    severity: "low",
  },
  {
    id: "BUG-0093",
    title: "500 error when updating user with null email field",
    status: "fixed",
    version: "v2.1.5",
    resolution: "Added null/undefined guard before passing to findByIdAndUpdate.",
    component: "api",
    severity: "high",
  },
];

// ─────────────────────────────────────────────────────────────
// HELPER — call Gemini without tools (pure generation)
// ─────────────────────────────────────────────────────────────
async function llm(systemPrompt, userPrompt) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userPrompt);
  return result.response.text().trim();
}

function parseJSON(raw, fallback) {
  try {
    return JSON.parse(raw.replace(/```json\s*|```/gi, "").trim());
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// AGENT 1 — CLASSIFIER
// Reads the bug report and outputs structured severity/priority/labels
// ─────────────────────────────────────────────────────────────
async function classifierAgent(bug) {
  const raw = await llm(
    `You are a senior engineer who triages bug reports.
Analyze the bug and return ONLY a JSON object — no markdown, no extra text.

Schema:
{
  "severity":        "critical|high|medium|low",
  "priority":        "P0|P1|P2|P3",
  "component":       "auth|api|frontend|database|upload|notifications|infrastructure|unknown",
  "labels":          ["string"],
  "reproducibility": "always|sometimes|rarely|unconfirmed",
  "affectedScope":   "all-users|some-users|specific-condition",
  "severityReason":  "one sentence explaining the severity choice",
  "estimatedEffort": "< 1 hour|1–4 hours|1–2 days|3–5 days|1+ week"
}

Severity guide:
  critical = security breach, data loss, auth bypass, system down
  high     = major feature broken for many users
  medium   = feature broken with workaround available
  low      = cosmetic, minor inconvenience`,

    `Bug Title: ${bug.title}
Description: ${bug.description}
Steps to Reproduce: ${bug.steps}
Environment: ${bug.environment}
Reporter: ${bug.reporterName}`
  );

  return parseJSON(raw, {
    severity: "medium",
    priority: "P2",
    component: "unknown",
    labels: ["needs-triage"],
    reproducibility: "unconfirmed",
    affectedScope: "some-users",
    severityReason: "Unable to parse classification",
    estimatedEffort: "unknown",
  });
}

// ─────────────────────────────────────────────────────────────
// AGENT 2 — SIMILAR ISSUE FINDER
// Searches past bugs, finds duplicates, suggests root cause
// ─────────────────────────────────────────────────────────────
async function finderAgent(bug) {
  const bugList = PAST_BUGS.map(
    (b) =>
      `${b.id} [${b.severity}] ${b.title} — Status: ${b.status}${b.resolution ? " — Fix: " + b.resolution : ""}`
  ).join("\n");

  const raw = await llm(
    `You are a senior engineer analyzing a new bug against a history of past issues.
Return ONLY a JSON object — no markdown, no extra text.

Schema:
{
  "isDuplicate":        true|false,
  "duplicateOf":        "BUG-XXXX or null",
  "duplicateConfidence":"high|medium|low|none",
  "duplicateReason":    "explanation or null",
  "relatedIssues":      [ { "id": "BUG-XXXX", "similarity": "why related" } ],
  "likelyCause":        "technical root cause hypothesis",
  "affectedCode":       "file/module/function most likely responsible",
  "diagnosticSteps":    ["step 1 to confirm", "step 2", "step 3"],
  "suggestedFix":       "concrete technical suggestion based on similar past fixes, or null"
}`,

    `New Bug:
Title: ${bug.title}
Description: ${bug.description}
Steps: ${bug.steps}
Environment: ${bug.environment}

Past Issues:
${bugList}`
  );

  return parseJSON(raw, {
    isDuplicate: false,
    duplicateOf: null,
    duplicateConfidence: "none",
    relatedIssues: [],
    likelyCause: "Under investigation",
    affectedCode: "Unknown",
    diagnosticSteps: ["Reproduce the issue", "Check logs", "Debug"],
    suggestedFix: null,
  });
}

// ─────────────────────────────────────────────────────────────
// AGENT 3 — REPORTER RESPONDER
// Writes the public comment posted on the bug ticket
// ─────────────────────────────────────────────────────────────
async function responderAgent(bug, classification, findings) {
  return llm(
    `You write professional, empathetic public responses to bug reporters on GitHub/Jira.
Rules:
  - Address reporter by first name
  - Thank them genuinely (they're helping improve the product)
  - Confirm you reproduced it OR ask for specific clarifying info if steps are unclear
  - If it's a duplicate, mention the original issue number politely
  - State the severity/priority so they know how urgent it is
  - Give a realistic but non-committal timeline
  - If there's a workaround, include it clearly
  - Close with an invitation to follow up
  - Tone: human, warm, professional — not corporate-robotic
  - Max 160 words`,

    `Reporter: ${bug.reporterName}
Bug title: ${bug.title}
Severity: ${classification.severity} | Priority: ${classification.priority}
Estimated fix time: ${classification.estimatedEffort}
Is duplicate: ${findings.isDuplicate} of ${findings.duplicateOf || "none"}
Duplicate confidence: ${findings.duplicateConfidence}
Suggested workaround (if any): ${findings.suggestedFix || "none yet"}`
  );
}

// ─────────────────────────────────────────────────────────────
// AGENT 4 — DEV BRIEFER
// Writes the internal Slack/ticket comment for the engineering team
// ─────────────────────────────────────────────────────────────
async function devBrieferAgent(bug, classification, findings) {
  return llm(
    `You write concise internal engineering summaries for a dev team's triage board.
Be technical, direct, no fluff.
Use this exact format:

**🐛 Bug:** [title]
**Severity/Priority:** [severity] / [priority]
**Component:** [component]
**Affected Scope:** [who is impacted]

**🔍 Likely Cause:**
[technical hypothesis]

**📍 Where to Look:**
[specific file, function, or module]

**🧪 Steps to Confirm:**
1. [step]
2. [step]
3. [step]

**🔗 Related Past Issues:** [list or "none"]
**💡 Suggested Fix:** [concrete suggestion or "investigate"]
**⏱ Estimated Effort:** [time estimate]
**📣 Reporter Response:** Already posted ✓`,

    `Bug: ${bug.title}
Description: ${bug.description}
Classification: ${JSON.stringify(classification)}
Findings: ${JSON.stringify(findings)}`
  );
}

// ─────────────────────────────────────────────────────────────
// ORCHESTRATOR
// ─────────────────────────────────────────────────────────────
const triageLog = [];

async function triageBug(bug) {
  const bugId = `BUG-${String(100 + triageLog.length + 1).padStart(4, "0")}`;

  console.log("\n" + "═".repeat(65));
  console.log(`🐛  TRIAGING ${bugId}`);
  console.log(`    "${bug.title}"`);
  console.log(`    Reporter: ${bug.reporterName}  |  Env: ${bug.environment}`);
  console.log("═".repeat(65));

  const start = Date.now();

  // ── ROUND 1: Parallel — classification + duplicate search ──
  console.log("\n⚡ Round 1 — running Classifier + Finder in parallel…");
  const [classification, findings] = await Promise.all([
    classifierAgent(bug).then((r) => {
      console.log(`  ✅ Classifier done  →  ${r.severity.toUpperCase()} / ${r.priority}`);
      return r;
    }),
    finderAgent(bug).then((r) => {
      const dup = r.isDuplicate ? `duplicate of ${r.duplicateOf}` : "no duplicate";
      console.log(`  ✅ Finder done      →  ${dup}`);
      return r;
    }),
  ]);

  // ── ROUND 2: Parallel — reporter response + internal summary ──
  console.log("\n⚡ Round 2 — running Responder + DevBriefer in parallel…");
  const [publicResponse, internalSummary] = await Promise.all([
    responderAgent(bug, classification, findings).then((r) => {
      console.log("  ✅ Reporter response drafted");
      return r;
    }),
    devBrieferAgent(bug, classification, findings).then((r) => {
      console.log("  ✅ Dev summary drafted");
      return r;
    }),
  ]);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // ── PRINT FULL TRIAGE REPORT ──────────────────────────────
  console.log("\n" + "─".repeat(65));
  console.log(`📊  TRIAGE REPORT — ${bugId}  (${elapsed}s)`);
  console.log("─".repeat(65));

  console.log(`\n🏷️  CLASSIFICATION`);
  console.log(`   Severity   : ${classification.severity.toUpperCase()}`);
  console.log(`   Priority   : ${classification.priority}`);
  console.log(`   Component  : ${classification.component}`);
  console.log(`   Labels     : ${classification.labels?.join(", ")}`);
  console.log(`   Scope      : ${classification.affectedScope}`);
  console.log(`   Effort est : ${classification.estimatedEffort}`);
  console.log(`   Reason     : ${classification.severityReason}`);

  if (findings.isDuplicate) {
    console.log(`\n⚠️  DUPLICATE DETECTED`);
    console.log(`   Of         : ${findings.duplicateOf}`);
    console.log(`   Confidence : ${findings.duplicateConfidence}`);
    console.log(`   Reason     : ${findings.duplicateReason}`);
  }

  if (findings.relatedIssues?.length) {
    console.log(`\n🔗  RELATED ISSUES`);
    findings.relatedIssues.forEach((r) => console.log(`   ${r.id}: ${r.similarity}`));
  }

  console.log(`\n🔍  ROOT CAUSE HYPOTHESIS`);
  console.log(`   ${findings.likelyCause}`);
  console.log(`\n📍  LOOK IN: ${findings.affectedCode}`);

  if (findings.diagnosticSteps?.length) {
    console.log(`\n🧪  DIAGNOSTIC STEPS`);
    findings.diagnosticSteps.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
  }

  if (findings.suggestedFix) {
    console.log(`\n💡  SUGGESTED FIX`);
    console.log(`   ${findings.suggestedFix}`);
  }

  console.log(`\n💬  PUBLIC RESPONSE (post this on the ticket):`);
  console.log("─".repeat(65));
  console.log(publicResponse);

  console.log(`\n🔧  INTERNAL DEV SUMMARY (post in Slack / internal comment):`);
  console.log("─".repeat(65));
  console.log(internalSummary);

  const result = { bugId, bug, classification, findings, publicResponse, internalSummary, elapsed };
  triageLog.push(result);
  return result;
}

// ─────────────────────────────────────────────────────────────
// TEST WITH REAL-WORLD BUG REPORTS
// ─────────────────────────────────────────────────────────────
async function main() {
  // Bug 1 — Critical security issue (likely duplicate)
  await triageBug({
    title: "Old password still works after user changes their password",
    description:
      "I changed my password through Settings > Security. After changing it, I went to another browser where I was still logged in with my old credentials and I can still make API requests successfully. " +
      "Old JWT tokens should be invalidated when a password is changed. This is a serious security vulnerability — " +
      "if someone's account is compromised, changing the password doesn't actually protect them.",
    steps:
      "1. Log in on Browser A, copy the JWT from localStorage\n" +
      "2. Log in on Browser B\n" +
      "3. On Browser B go to Settings > Security > Change Password\n" +
      "4. Back on Browser A, make any authenticated API call using the OLD token\n" +
      "5. API returns 200 — token should have been invalidated",
    environment: "Production. Node.js v18.17, Chrome 121 and Firefox 122",
    reporterName: "Ahmed Raza",
  });

  // Bug 2 — Performance regression
  await triageBug({
    title: "Admin /api/users endpoint takes 12+ seconds with 80k users in DB",
    description:
      "The admin users list used to load in under a second. Since we crossed ~50,000 users it started slowing down, " +
      "and now with 80,000 users it consistently takes 12-15 seconds. " +
      "The admin panel is basically unusable — every page load triggers this slow query. " +
      "I checked the MongoDB Atlas performance advisor and it's flagging a full collection scan on every request.",
    steps:
      "1. Open admin panel → Users\n" +
      "2. Open browser DevTools > Network tab\n" +
      "3. Watch GET /api/users take 12-15 seconds\n" +
      "4. MongoDB Atlas shows no index being used for this query",
    environment: "Production. MongoDB 6.0, ~80k documents in users collection, AWS t3.large",
    reporterName: "Sara Khan",
  });

  // Bug 3 — New bug, no duplicate
  await triageBug({
    title: "Uploading a video file crashes the browser tab",
    description:
      "When trying to upload a video file (.mp4) larger than 50MB through the profile media upload feature, " +
      "the entire browser tab becomes unresponsive and eventually crashes. " +
      "No error is shown to the user. Small videos (< 10MB) work fine. " +
      "This happens on all browsers tested. The upload feature is important for our content creators.",
    steps:
      "1. Go to Profile → Media\n" +
      "2. Click 'Upload Video'\n" +
      "3. Select any .mp4 file larger than 50MB\n" +
      "4. Progress bar shows briefly then tab freezes\n" +
      "5. After 30-60 seconds, browser shows 'Tab has crashed' or becomes unresponsive",
    environment: "Chrome 121, Firefox 122, Safari 17. Reproduced on macOS and Windows 11.",
    reporterName: "Fatima Ali",
  });

  // Final stats
  console.log("\n\n" + "═".repeat(65));
  console.log("📈  TRIAGE SESSION COMPLETE");
  console.log("═".repeat(65));
  console.log(`   Total bugs triaged : ${triageLog.length}`);
  console.log(`   Critical/P0        : ${triageLog.filter((t) => t.classification.severity === "critical").length}`);
  console.log(`   High/P1            : ${triageLog.filter((t) => t.classification.severity === "high").length}`);
  console.log(`   Duplicates found   : ${triageLog.filter((t) => t.findings.isDuplicate).length}`);
  triageLog.forEach((t) =>
    console.log(`   ${t.bugId}  [${t.classification.severity.toUpperCase()}/${t.classification.priority}]  ${t.bug.title.slice(0, 50)}…  (${t.elapsed}s)`)
  );
}

main().catch(console.error);
