// EMAIL AGENT — Reads, summarizes, drafts and sends emails
// npm install @google/generative-ai
// GEMINI_API_KEY=your_key node examples/08_email_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Simulated email inbox (in production: use nodemailer + IMAP/Gmail API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const inbox = [
  {
    id: 1,
    from: "boss@company.com",
    fromName: "Sarah Mitchell (CEO)",
    subject: "Q4 Report Review — Urgent",
    body: "Hi, I need you to review the Q4 financial report and send me your feedback by Friday EOD. The board meeting is Monday and we need this finalized. Please focus especially on the revenue projections and cost analysis sections.",
    date: "2024-02-26",
    read: false,
    priority: "high",
    labels: ["work", "urgent"],
  },
  {
    id: 2,
    from: "newsletter@techblog.com",
    fromName: "TechBlog Weekly",
    subject: "This Week in AI: Top 10 Stories",
    body: "This week's highlights: GPT-5 rumored release, open source models catching up, AI agents entering enterprise, new coding tools, and more. Click to read full stories...",
    date: "2024-02-25",
    read: false,
    priority: "low",
    labels: ["newsletter"],
  },
  {
    id: 3,
    from: "client@acmecorp.com",
    fromName: "James Wilson (Acme Corp)",
    subject: "Project Status Update Request",
    body: "Hello, I hope you are doing well. We haven't heard from your team in a while. Could you please provide an update on the current status of the mobile app project? We are particularly interested in knowing: 1) Current completion percentage, 2) Any blockers or risks, 3) Expected delivery date. Looking forward to your response.",
    date: "2024-02-25",
    read: false,
    priority: "high",
    labels: ["work", "client"],
  },
  {
    id: 4,
    from: "hr@company.com",
    fromName: "HR Department",
    subject: "Annual Performance Review Schedule",
    body: "Dear team member, your annual performance review has been scheduled for March 5th at 2:00 PM. Please complete the self-evaluation form before the meeting. Link: [self-eval form]. Let HR know if you need to reschedule.",
    date: "2024-02-24",
    read: true,
    priority: "medium",
    labels: ["work", "hr"],
  },
  {
    id: 5,
    from: "team@slack.com",
    fromName: "Slack",
    subject: "You have 12 unread messages in #dev-team",
    body: "Catch up on what you missed in your Slack workspace. 12 new messages in #dev-team, 3 in #general, 1 direct message from Alex.",
    date: "2024-02-27",
    read: false,
    priority: "low",
    labels: ["notification"],
  },
];

const sentEmails = [];
const drafts = [];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EMAIL TOOL IMPLEMENTATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const emailTools = {
  list_emails: ({ filter, limit = 10 }) => {
    let emails = inbox;
    if (filter === "unread") emails = inbox.filter((e) => !e.read);
    if (filter === "high_priority") emails = inbox.filter((e) => e.priority === "high");
    if (filter === "read") emails = inbox.filter((e) => e.read);

    return emails.slice(0, limit).map(({ body, ...e }) => e); // Don't include full body in list
  },

  read_email: ({ id }) => {
    const email = inbox.find((e) => e.id === id);
    if (!email) return { error: `Email #${id} not found` };
    email.read = true;
    return email;
  },

  search_emails: ({ keyword }) => {
    const kw = keyword.toLowerCase();
    return inbox
      .filter(
        (e) =>
          e.subject.toLowerCase().includes(kw) ||
          e.body.toLowerCase().includes(kw) ||
          e.from.toLowerCase().includes(kw) ||
          e.fromName.toLowerCase().includes(kw)
      )
      .map(({ body, ...e }) => e);
  },

  send_email: ({ to, subject, body, cc }) => {
    const email = {
      id: sentEmails.length + 1,
      to,
      cc: cc || null,
      subject,
      body,
      sentAt: new Date().toISOString(),
    };
    sentEmails.push(email);
    console.log(`\n  📤 EMAIL SENT:`);
    console.log(`     To: ${to}`);
    console.log(`     Subject: ${subject}`);
    console.log(`     Body preview: ${body.substring(0, 100)}...`);
    return { success: true, message: `Email sent to ${to}`, emailId: email.id };
  },

  save_draft: ({ to, subject, body }) => {
    const draft = { id: drafts.length + 1, to, subject, body, savedAt: new Date().toISOString() };
    drafts.push(draft);
    return { success: true, draftId: draft.id, message: "Draft saved" };
  },

  mark_as_read: ({ ids }) => {
    const updated = [];
    for (const id of ids) {
      const email = inbox.find((e) => e.id === id);
      if (email) { email.read = true; updated.push(id); }
    }
    return { success: true, markedRead: updated };
  },

  get_inbox_stats: () => {
    return {
      total: inbox.length,
      unread: inbox.filter((e) => !e.read).length,
      highPriority: inbox.filter((e) => e.priority === "high").length,
      unreadHighPriority: inbox.filter((e) => !e.read && e.priority === "high").length,
    };
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tool declarations for Gemini
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const emailToolDeclarations = [
  {
    functionDeclarations: [
      {
        name: "list_emails",
        description: "List emails in the inbox with optional filtering",
        parameters: {
          type: "OBJECT",
          properties: {
            filter: { type: "STRING", enum: ["all", "unread", "read", "high_priority"], description: "Filter type" },
            limit: { type: "NUMBER", description: "Max emails to return (default 10)" },
          },
        },
      },
      {
        name: "read_email",
        description: "Read the full content of a specific email",
        parameters: {
          type: "OBJECT",
          properties: { id: { type: "NUMBER", description: "Email ID to read" } },
          required: ["id"],
        },
      },
      {
        name: "search_emails",
        description: "Search emails by keyword in subject, body, or sender",
        parameters: {
          type: "OBJECT",
          properties: { keyword: { type: "STRING", description: "Keyword to search for" } },
          required: ["keyword"],
        },
      },
      {
        name: "send_email",
        description: "Send an email",
        parameters: {
          type: "OBJECT",
          properties: {
            to: { type: "STRING", description: "Recipient email address" },
            subject: { type: "STRING", description: "Email subject line" },
            body: { type: "STRING", description: "Full email body text" },
            cc: { type: "STRING", description: "CC email address (optional)" },
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "save_draft",
        description: "Save an email as a draft without sending",
        parameters: {
          type: "OBJECT",
          properties: {
            to: { type: "STRING" },
            subject: { type: "STRING" },
            body: { type: "STRING" },
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "mark_as_read",
        description: "Mark one or more emails as read",
        parameters: {
          type: "OBJECT",
          properties: {
            ids: { type: "ARRAY", items: { type: "NUMBER" }, description: "List of email IDs to mark read" },
          },
          required: ["ids"],
        },
      },
      {
        name: "get_inbox_stats",
        description: "Get summary statistics about the inbox (total, unread, high priority counts)",
        parameters: { type: "OBJECT", properties: {} },
      },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Email Agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function emailAgent(command) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    tools: emailToolDeclarations,
    systemInstruction: `
      You are a professional executive email assistant. You help manage a busy inbox.
      
      Your capabilities:
      - Read and summarize emails clearly
      - Draft and send professional replies
      - Prioritize and organize the inbox
      - Identify action items from emails
      
      Communication style:
      - Professional emails to bosses/clients: formal, concise, respectful
      - Replies to colleagues: friendly but professional
      - Always sign emails as "Best regards, [User's Name]"
      
      When drafting replies:
      - Address the specific questions/requests in the original email
      - Be direct and clear
      - Keep it appropriately brief
      - Never invent information — use placeholder text like "[PROJECT_STATUS]" if details are unknown
    `,
  });

  const chat = model.startChat();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`📧 Command: ${command}`);
  console.log(`${"─".repeat(60)}`);

  let resp = await chat.sendMessage(command);

  while (true) {
    const parts = resp.response.candidates[0].content.parts;
    const calls = parts.filter((p) => p.functionCall);

    if (!calls.length) {
      console.log(`\n🤖 Email Assistant:\n${parts.map((p) => p.text || "").join("")}`);
      return;
    }

    const results = calls.map((p) => {
      const { name, args } = p.functionCall;
      console.log(`  📬 ${name}(${JSON.stringify(args)})`);
      const result = emailTools[name](args);
      return { functionResponse: { name, response: result } };
    });

    resp = await chat.sendMessage(results);
  }
}

async function main() {
  // Test 1: Morning briefing
  await emailAgent("Give me a morning briefing — inbox stats and what high-priority items need my attention today");

  // Test 2: Read and reply to client
  await emailAgent(
    "Read the email from Acme Corp and draft a professional reply saying we're 75% complete, the main blocker was API integration which is now resolved, and we expect delivery by March 15th"
  );

  // Test 3: Bulk action
  await emailAgent("Mark all newsletter and notification emails as read");

  // Test 4: Search
  await emailAgent("Search for any emails about the performance review and tell me what action I need to take");
}

main().catch(console.error);
