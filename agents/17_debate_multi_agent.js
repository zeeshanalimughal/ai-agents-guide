// DEBATE MULTI-AGENT — Agent A argues FOR, Agent B argues AGAINST, Judge decides
// Great pattern for: pros/cons analysis, decision making, evaluating options
// GEMINI_API_KEY=your_key node 17_debate_multi_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function llm(system, prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: system });
  const r = await model.generateContent(prompt);
  return r.response.text();
}

// ── Agent A: Argues FOR ───────────────────────────────────────────────────────
async function proAgent(topic, context, opponentArg = null) {
  const prompt = opponentArg
    ? `Topic: "${topic}"\nContext: ${context}\n\nYour opponent said:\n"${opponentArg}"\n\nCounter their argument AND strengthen your position.`
    : `Make the strongest possible case FOR: "${topic}"\nContext: ${context}`;

  return llm(
    `You are a skilled debater arguing STRONGLY IN FAVOR of the given topic.
     Be persuasive, use data/examples, max 200 words. Don't be wishy-washy.`,
    prompt
  );
}

// ── Agent B: Argues AGAINST ───────────────────────────────────────────────────
async function conAgent(topic, context, opponentArg = null) {
  const prompt = opponentArg
    ? `Topic: "${topic}"\nContext: ${context}\n\nYour opponent said:\n"${opponentArg}"\n\nCounter their argument AND strengthen your position.`
    : `Make the strongest possible case AGAINST: "${topic}"\nContext: ${context}`;

  return llm(
    `You are a skilled debater arguing STRONGLY AGAINST the given topic.
     Be persuasive, use data/examples, max 200 words. Don't be wishy-washy.`,
    prompt
  );
}

// ── Judge: evaluates both sides ───────────────────────────────────────────────
async function judgeAgent(topic, rounds, context) {
  const transcript = rounds.map((r, i) =>
    `=== Round ${i + 1} ===\nFOR: ${r.pro}\n\nAGAINST: ${r.con}`
  ).join("\n\n");

  return llm(
    `You are an impartial judge evaluating a debate. Be objective and analytical.
     Score each side 1-10 on: Evidence, Logic, Persuasiveness.
     Give a final verdict with clear reasoning.
     Format:
     ## Scores
     ## Key Takeaways from Each Side  
     ## Final Verdict
     ## Recommendation`,
    `Topic: "${topic}"\nContext: ${context}\n\nDebate Transcript:\n${transcript}`
  );
}

// ── Debate Orchestrator ───────────────────────────────────────────────────────
async function runDebate({ topic, context, rounds = 2 }) {
  console.log("═".repeat(60));
  console.log(`⚖️  DEBATE: "${topic}"`);
  console.log(`   Context: ${context}`);
  console.log(`   Rounds: ${rounds}`);
  console.log("═".repeat(60));

  const debateRounds = [];
  let lastPro = null;
  let lastCon = null;

  for (let i = 1; i <= rounds; i++) {
    console.log(`\n🎤 ROUND ${i}:`);

    // First round: both open simultaneously. Later rounds: respond to opponent
    const [pro, con] = await Promise.all([
      proAgent(topic, context, i > 1 ? lastCon : null)
        .then((r) => { console.log(`  ✅ FOR argument ready`); return r; }),
      conAgent(topic, context, i > 1 ? lastPro : null)
        .then((r) => { console.log(`  ✅ AGAINST argument ready`); return r; }),
    ]);

    lastPro = pro;
    lastCon = con;
    debateRounds.push({ pro, con });

    console.log(`\n  🟢 FOR:\n${pro}`);
    console.log(`\n  🔴 AGAINST:\n${con}`);
  }

  console.log("\n\n⚖️  JUDGE deliberating...");
  const verdict = await judgeAgent(topic, debateRounds, context);

  console.log(`\n${"═".repeat(60)}`);
  console.log("👨‍⚖️  JUDGE'S VERDICT:\n");
  console.log(verdict);

  return { topic, rounds: debateRounds, verdict };
}

// ── Run debates on real decisions ────────────────────────────────────────────
async function main() {
  // Business decision debate
  await runDebate({
    topic:   "Startups should build with AI agents from day one",
    context: "Early-stage startup with 3 engineers, $200k seed funding, B2B SaaS product",
    rounds:  2,
  });

  console.log("\n\n");

  // Tech choice debate
  await runDebate({
    topic:   "Use microservices instead of a monolith for a new web app",
    context: "10-person engineering team, expected 50k users in year 1, tight 6-month deadline",
    rounds:  1,
  });
}

main().catch(console.error);
