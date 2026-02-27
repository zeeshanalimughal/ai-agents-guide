// CUSTOMER ONBOARDING AGENT — Skills: Account Setup + Product Tour + Support Tickets
// Guides new users through signup, helps them get started, handles initial issues
// GEMINI_API_KEY=your_key node 18_onboarding_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Data stores ───────────────────────────────────────────────────────────────
const users = {};
const tickets = [];
let ticketCounter = 1;

const productFeatures = {
  dashboard:   { desc: "Your main control panel", docs: "/docs/dashboard", difficulty: "easy" },
  pipelines:   { desc: "Automate workflows end-to-end", docs: "/docs/pipelines", difficulty: "medium" },
  integrations:{ desc: "Connect 100+ tools via API", docs: "/docs/integrations", difficulty: "medium" },
  analytics:   { desc: "Real-time usage analytics", docs: "/docs/analytics", difficulty: "easy" },
  api:         { desc: "Programmatic access via REST API", docs: "/docs/api", difficulty: "advanced" },
};

// ── SKILL 1: Account Setup ────────────────────────────────────────────────────
const setupSkill = {
  instructions: "Create user accounts, set preferences, and complete profile setup.",
  tools: {
    create_account: ({ name, email, plan, useCase }) => {
      if (users[email]) return { error: "Account already exists" };
      const user = {
        id: `USR-${Object.keys(users).length + 1}`,
        name, email, plan: plan || "free",
        useCase, createdAt: new Date().toISOString().split("T")[0],
        onboardingStep: 1, onboardingComplete: false,
        preferences: { notifications: true, theme: "light" },
      };
      users[email] = user;
      return { success: true, user, message: `Welcome ${name}! Account created.`, nextStep: "Complete your profile tour" };
    },
    get_account: ({ email }) => users[email] || { error: "Account not found" },
    update_preferences: ({ email, preferences }) => {
      if (!users[email]) return { error: "Account not found" };
      users[email].preferences = { ...users[email].preferences, ...preferences };
      return { success: true, preferences: users[email].preferences };
    },
  },
  declarations: [
    { name: "create_account", description: "Create a new user account",
      parameters: { type: "OBJECT",
        properties: {
          name:    { type: "STRING" },
          email:   { type: "STRING" },
          plan:    { type: "STRING", enum: ["free", "pro", "enterprise"] },
          useCase: { type: "STRING", description: "What they plan to use the product for" },
        },
        required: ["name", "email"] } },
    { name: "get_account", description: "Get user account details",
      parameters: { type: "OBJECT", properties: { email: { type: "STRING" } }, required: ["email"] } },
    { name: "update_preferences", description: "Update user preferences like notifications or theme",
      parameters: { type: "OBJECT",
        properties: {
          email:       { type: "STRING" },
          preferences: { type: "OBJECT", description: "Key-value pairs of preferences to update" },
        },
        required: ["email", "preferences"] } },
  ],
};

// ── SKILL 2: Product Tour ─────────────────────────────────────────────────────
const tourSkill = {
  instructions: "Guide users through product features based on their use case. Personalize the tour.",
  tools: {
    get_feature_info: ({ feature }) => {
      const f = productFeatures[feature.toLowerCase()];
      return f ? { feature, ...f } : { error: `Feature "${feature}" not found`, available: Object.keys(productFeatures) };
    },
    get_recommended_features: ({ useCase }) => {
      const recommendations = {
        "automation":   ["pipelines", "integrations", "dashboard"],
        "analytics":    ["analytics", "dashboard", "api"],
        "development":  ["api", "integrations", "pipelines"],
        "marketing":    ["analytics", "dashboard", "integrations"],
        "default":      ["dashboard", "analytics", "pipelines"],
      };
      const key = Object.keys(recommendations).find((k) => useCase?.toLowerCase().includes(k)) || "default";
      return {
        useCase, features: recommendations[key],
        details: recommendations[key].map((f) => ({ name: f, ...productFeatures[f] })),
      };
    },
    complete_onboarding_step: ({ email, step }) => {
      if (!users[email]) return { error: "Account not found" };
      users[email].onboardingStep = step + 1;
      if (step >= 3) users[email].onboardingComplete = true;
      return { user: users[email].name, completedStep: step,
        nextStep: step < 3 ? step + 1 : null, onboardingComplete: step >= 3 };
    },
  },
  declarations: [
    { name: "get_feature_info", description: "Get details about a specific product feature",
      parameters: { type: "OBJECT", properties: { feature: { type: "STRING" } }, required: ["feature"] } },
    { name: "get_recommended_features", description: "Get personalized feature recommendations based on user's use case",
      parameters: { type: "OBJECT", properties: { useCase: { type: "STRING" } }, required: ["useCase"] } },
    { name: "complete_onboarding_step", description: "Mark an onboarding step as complete",
      parameters: { type: "OBJECT",
        properties: { email: { type: "STRING" }, step: { type: "NUMBER" } },
        required: ["email", "step"] } },
  ],
};

// ── SKILL 3: Support Tickets ──────────────────────────────────────────────────
const supportSkill = {
  instructions: "Create and manage support tickets for users facing issues.",
  tools: {
    create_ticket: ({ email, subject, description, priority }) => {
      const user = users[email];
      const ticket = {
        id: `TKT-${String(ticketCounter++).padStart(4, "0")}`,
        userId: user?.id || "guest", userName: user?.name || email,
        subject, description, priority: priority || "medium",
        status: "open", createdAt: new Date().toISOString().split("T")[0],
        estimatedResponse: priority === "high" ? "2 hours" : "24 hours",
      };
      tickets.push(ticket);
      return { success: true, ticket, message: `Ticket ${ticket.id} created. We'll respond within ${ticket.estimatedResponse}.` };
    },
    get_quick_answer: ({ topic }) => {
      const faq = {
        "billing":       "Update billing at Settings → Billing. Invoices sent monthly.",
        "api key":       "Find your API key at Settings → Developer → API Keys.",
        "password":      "Reset password via Login → Forgot Password. Check spam folder.",
        "integrations":  "Go to Settings → Integrations. 100+ tools available. Docs: /docs/integrations",
        "cancel":        "Cancel anytime at Settings → Billing → Cancel. No cancellation fee.",
      };
      const key = Object.keys(faq).find((k) => topic.toLowerCase().includes(k));
      return key ? { answer: faq[key], resolved: true } : { answer: "I'll create a support ticket for you.", resolved: false };
    },
  },
  declarations: [
    { name: "create_ticket", description: "Create a support ticket for a user issue",
      parameters: { type: "OBJECT",
        properties: {
          email:       { type: "STRING" },
          subject:     { type: "STRING" },
          description: { type: "STRING" },
          priority:    { type: "STRING", enum: ["low", "medium", "high"] },
        },
        required: ["email", "subject", "description"] } },
    { name: "get_quick_answer", description: "Check FAQ for instant answers before creating a ticket",
      parameters: { type: "OBJECT",
        properties: { topic: { type: "STRING", description: "Topic or issue description" } },
        required: ["topic"] } },
  ],
};

// ── Build & run ───────────────────────────────────────────────────────────────
const allSkills = [setupSkill, tourSkill, supportSkill];
const toolFns = Object.assign({}, ...allSkills.map((s) => s.tools));
const tools = [{ functionDeclarations: allSkills.flatMap((s) => s.declarations) }];

async function onboardingAgent(request) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", tools,
    systemInstruction: `You are a friendly customer onboarding specialist for a SaaS product.
      Your goal: make new users successful as fast as possible.
      - Be warm and encouraging
      - Personalize advice to their use case
      - Celebrate small wins ("Great! You've completed step 1!")
      - Proactively suggest the next thing to do`,
  });

  const chat = model.startChat();
  console.log(`\n👋 Onboarding: ${request}`);
  console.log("─".repeat(55));

  let resp = await chat.sendMessage(request);
  while (true) {
    const parts = resp.response.candidates[0].content.parts;
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) { console.log("\n🤖 Onboarding Agent:\n" + parts.map((p) => p.text || "").join("")); return; }
    const results = calls.map((p) => {
      const { name, args } = p.functionCall;
      console.log(`  🔧 ${name}(${JSON.stringify(args)})`);
      return { functionResponse: { name, response: toolFns[name](args) } };
    });
    resp = await chat.sendMessage(results);
  }
}

async function main() {
  // New user signup
  await onboardingAgent(
    "I'm Zara Ahmed, email zara@startup.com. I want to sign up for the Pro plan. I'm mainly doing marketing automation."
  );

  // Personalized product tour
  await onboardingAgent(
    "I just signed up as zara@startup.com. What features should I start with for marketing automation?"
  );

  // Support issue
  await onboardingAgent(
    "Hi, I'm zara@startup.com and I can't find my API key. Also can you submit a ticket about the dashboard loading slowly?"
  );
}

main().catch(console.error);
