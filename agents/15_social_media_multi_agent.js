// SOCIAL MEDIA MULTI-AGENT — Idea Generator + Content Writer + Scheduler
// Give it a topic → get ready-to-post content for Twitter, LinkedIn & Instagram
// GEMINI_API_KEY=your_key node 15_social_media_multi_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── In-memory content calendar ────────────────────────────────────────────────
const contentCalendar = [];

// ── Helper ───────────────────────────────────────────────────────────────────
async function llm(system, prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: system });
  const r = await model.generateContent(prompt);
  return r.response.text();
}

// ── AGENT 1: Idea Generator ───────────────────────────────────────────────────
async function ideaAgent(topic, audience, count = 5) {
  console.log(`\n💡 Agent 1 (Idea Generator): Brainstorming ${count} angles for "${topic}"...`);
  const ideas = await llm(
    `You are a social media strategist. Generate diverse content angles for a given topic.
     Return JSON only: { "ideas": [ { "angle": "...", "hook": "...", "platform": "twitter|linkedin|instagram" } ] }`,
    `Topic: "${topic}" | Target audience: ${audience} | Generate ${count} different angles.`
  );
  try {
    const parsed = JSON.parse(ideas.replace(/```json|```/g, "").trim());
    console.log(`  ✅ Generated ${parsed.ideas.length} ideas`);
    return parsed.ideas;
  } catch {
    return [{ angle: topic, hook: `Everything you need to know about ${topic}`, platform: "linkedin" }];
  }
}

// ── AGENT 2: Content Writer (runs in parallel per platform) ──────────────────
async function writeForPlatform(platform, angle, hook, brand) {
  const rules = {
    twitter:   "Max 280 chars. Punchy hook. End with a question or CTA. Add 2-3 relevant hashtags.",
    linkedin:  "Professional tone. 150-200 words. Tell a mini-story. End with a thought-provoking question. Add 3 hashtags.",
    instagram: "Engaging caption 100-150 words. Emoji-friendly. Conversational. End with CTA. Add 5-7 hashtags in a comment block.",
  };

  return llm(
    `You write ${platform} posts for ${brand}. Rules: ${rules[platform]}`,
    `Write a post about: "${angle}"\nOpening hook: "${hook}"`
  );
}

async function contentWriterAgent(ideas, brand) {
  console.log(`\n✍️  Agent 2 (Content Writer): Writing posts for ${ideas.length} ideas in parallel...`);

  // Write all posts across all platforms simultaneously
  const tasks = ideas.slice(0, 3).map((idea) =>
    writeForPlatform(idea.platform, idea.angle, idea.hook, brand)
      .then((content) => ({ ...idea, content, brand }))
  );

  const posts = await Promise.all(tasks);
  console.log(`  ✅ Wrote ${posts.length} posts`);
  return posts;
}

// ── AGENT 3: Scheduler ────────────────────────────────────────────────────────
async function schedulerAgent(posts) {
  console.log(`\n📅 Agent 3 (Scheduler): Creating posting schedule...`);

  // Best times by platform (industry standard data)
  const bestTimes = {
    twitter:   ["9:00 AM", "12:00 PM", "5:00 PM"],
    linkedin:  ["8:00 AM", "10:00 AM", "12:00 PM"],
    instagram: ["11:00 AM", "2:00 PM", "7:00 PM"],
  };

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const scheduled = posts.map((post, i) => {
    const day = days[i % days.length];
    const times = bestTimes[post.platform] || ["10:00 AM"];
    const time = times[i % times.length];
    const entry = { ...post, scheduledDay: day, scheduledTime: time, status: "scheduled" };
    contentCalendar.push(entry);
    return entry;
  });

  console.log(`  ✅ Scheduled ${scheduled.length} posts`);
  return scheduled;
}

// ── ORCHESTRATOR ──────────────────────────────────────────────────────────────
async function socialMediaPipeline({ topic, audience, brand, postsCount = 3 }) {
  console.log("═".repeat(60));
  console.log(`📱 SOCIAL MEDIA PIPELINE`);
  console.log(`   Topic: ${topic} | Brand: ${brand} | Audience: ${audience}`);
  console.log("═".repeat(60));

  const start = Date.now();

  const ideas    = await ideaAgent(topic, audience, postsCount);
  const posts    = await contentWriterAgent(ideas, brand);
  const calendar = await schedulerAgent(posts);

  console.log(`\n${"═".repeat(60)}`);
  console.log("📋 CONTENT CALENDAR:\n");

  calendar.forEach((post, i) => {
    console.log(`\n[Post ${i + 1}] ${post.platform.toUpperCase()} — ${post.scheduledDay} at ${post.scheduledTime}`);
    console.log(`Angle: ${post.angle}`);
    console.log("─".repeat(40));
    console.log(post.content);
  });

  console.log(`\n⏱️  Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  return calendar;
}

// ── Run ───────────────────────────────────────────────────────────────────────
socialMediaPipeline({
  topic:      "Why AI agents will replace 30% of developer tasks by 2026",
  audience:   "software developers and tech founders",
  brand:      "TechInsights",
  postsCount: 3,
}).catch(console.error);
