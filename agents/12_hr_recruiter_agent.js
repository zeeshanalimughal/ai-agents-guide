// HR RECRUITER AGENT — Skills: Job Matching + Candidate Screening + Interview Scheduling
// Single agent with 3 skills that handles the full recruitment pipeline
// GEMINI_API_KEY=your_key node 12_hr_recruiter_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Fake data ────────────────────────────────────────────────────────────────
const jobListings = [
  { id: "J001", title: "Senior Node.js Developer", dept: "Engineering", salary: "$90-120k",
    required: ["Node.js", "REST APIs", "MongoDB", "3+ years"], status: "open" },
  { id: "J002", title: "React Frontend Developer", dept: "Engineering", salary: "$75-100k",
    required: ["React", "TypeScript", "CSS", "2+ years"], status: "open" },
  { id: "J003", title: "Product Manager", dept: "Product", salary: "$85-110k",
    required: ["Product roadmap", "Agile", "SQL", "5+ years"], status: "open" },
];

const candidates = [
  { id: "C001", name: "Ali Hassan",   skills: ["Node.js", "REST APIs", "MongoDB", "PostgreSQL"],
    experience: "4 years", email: "ali@email.com", status: "applied" },
  { id: "C002", name: "Sara Khan",    skills: ["React", "TypeScript", "CSS", "Redux"],
    experience: "3 years", email: "sara@email.com", status: "applied" },
  { id: "C003", name: "Ahmed Raza",   skills: ["Python", "Django", "MongoDB"],
    experience: "2 years", email: "ahmed@email.com", status: "applied" },
  { id: "C004", name: "Fatima Ali",   skills: ["React", "CSS", "JavaScript"],
    experience: "1 year",  email: "fatima@email.com", status: "applied" },
];

const interviews = [];

// ── SKILL 1: Job Matching ─────────────────────────────────────────────────────
const matchingSkill = {
  instructions: "Match candidates to open job listings based on their skills and experience.",
  tools: {
    list_jobs: () => jobListings.filter((j) => j.status === "open"),
    match_candidate_to_jobs: ({ candidate_id }) => {
      const c = candidates.find((c) => c.id === candidate_id);
      if (!c) return { error: "Candidate not found" };
      return jobListings.map((job) => {
        const matched = job.required.filter((r) =>
          c.skills.some((s) => s.toLowerCase().includes(r.toLowerCase().split(" ")[0]))
        );
        return { jobId: job.id, title: job.title, matchScore: `${matched.length}/${job.required.length}`, matchedSkills: matched };
      }).sort((a, b) => parseInt(b.matchScore) - parseInt(a.matchScore));
    },
  },
  declarations: [
    { name: "list_jobs", description: "List all open job positions",
      parameters: { type: "OBJECT", properties: {} } },
    { name: "match_candidate_to_jobs",
      description: "Match a candidate's skills to open job positions and score the fit",
      parameters: { type: "OBJECT",
        properties: { candidate_id: { type: "STRING", description: "Candidate ID like C001" } },
        required: ["candidate_id"] } },
  ],
};

// ── SKILL 2: Candidate Screening ─────────────────────────────────────────────
const screeningSkill = {
  instructions: "Screen candidates and manage their application status.",
  tools: {
    get_candidate: ({ candidate_id }) =>
      candidates.find((c) => c.id === candidate_id) || { error: "Not found" },
    list_candidates: ({ job_id }) => {
      if (!job_id) return candidates;
      const job = jobListings.find((j) => j.id === job_id);
      if (!job) return { error: "Job not found" };
      return candidates.filter((c) =>
        job.required.some((r) =>
          c.skills.some((s) => s.toLowerCase().includes(r.toLowerCase().split(" ")[0]))
        )
      );
    },
    update_candidate_status: ({ candidate_id, status }) => {
      const c = candidates.find((c) => c.id === candidate_id);
      if (!c) return { error: "Candidate not found" };
      c.status = status;
      return { success: true, candidate: c.name, newStatus: status };
    },
  },
  declarations: [
    { name: "get_candidate", description: "Get full profile of a specific candidate",
      parameters: { type: "OBJECT", properties: { candidate_id: { type: "STRING" } }, required: ["candidate_id"] } },
    { name: "list_candidates",
      description: "List all candidates, optionally filtered by job ID to see who qualifies",
      parameters: { type: "OBJECT", properties: { job_id: { type: "STRING", description: "Optional job ID to filter by" } } } },
    { name: "update_candidate_status",
      description: "Update a candidate's status (applied, shortlisted, rejected, hired)",
      parameters: { type: "OBJECT",
        properties: {
          candidate_id: { type: "STRING" },
          status: { type: "STRING", enum: ["applied", "shortlisted", "interview", "rejected", "hired"] },
        },
        required: ["candidate_id", "status"] } },
  ],
};

// ── SKILL 3: Interview Scheduling ────────────────────────────────────────────
const schedulingSkill = {
  instructions: "Schedule and manage interviews between candidates and hiring teams.",
  tools: {
    schedule_interview: ({ candidate_id, job_id, date, time, interviewer }) => {
      const c = candidates.find((c) => c.id === candidate_id);
      const j = jobListings.find((j) => j.id === job_id);
      if (!c || !j) return { error: "Candidate or job not found" };
      const interview = { id: `I00${interviews.length + 1}`, candidate: c.name,
        job: j.title, date, time, interviewer, confirmationSent: true };
      interviews.push(interview);
      c.status = "interview";
      return { success: true, interview, message: `Interview confirmation sent to ${c.email}` };
    },
    list_interviews: () => interviews.length ? interviews : { message: "No interviews scheduled yet" },
  },
  declarations: [
    { name: "schedule_interview", description: "Schedule an interview for a candidate",
      parameters: { type: "OBJECT",
        properties: {
          candidate_id: { type: "STRING" }, job_id: { type: "STRING" },
          date: { type: "STRING", description: "Date like 2024-03-15" },
          time: { type: "STRING", description: "Time like 10:00 AM" },
          interviewer: { type: "STRING", description: "Interviewer name" },
        },
        required: ["candidate_id", "job_id", "date", "time", "interviewer"] } },
    { name: "list_interviews", description: "List all scheduled interviews",
      parameters: { type: "OBJECT", properties: {} } },
  ],
};

// ── Build & run the agent ─────────────────────────────────────────────────────
const allSkills = [matchingSkill, screeningSkill, schedulingSkill];
const toolFns = Object.assign({}, ...allSkills.map((s) => s.tools));
const tools = [{ functionDeclarations: allSkills.flatMap((s) => s.declarations) }];

async function hrAgent(request) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", tools,
    systemInstruction: `You are a professional HR recruiter assistant with 3 skills:
      Matching, Screening, and Scheduling. Use tools to give data-driven recommendations.
      Be concise and professional. Always suggest next steps.`,
  });

  const chat = model.startChat();
  console.log(`\n👔 HR Request: ${request}`);
  console.log("─".repeat(55));

  let resp = await chat.sendMessage(request);
  while (true) {
    const parts = resp.response.candidates[0].content.parts;
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) { console.log("\n🤖 HR Agent:\n" + parts.map((p) => p.text || "").join("")); return; }
    const results = calls.map((p) => {
      const { name, args } = p.functionCall;
      console.log(`  🔧 ${name}(${JSON.stringify(args)})`);
      return { functionResponse: { name, response: toolFns[name](args) } };
    });
    resp = await chat.sendMessage(results);
  }
}

async function main() {
  await hrAgent("Show me all open jobs and which candidates are the best fit for the Node.js role");
  await hrAgent("Shortlist the top candidate for J001 and schedule their interview for March 15 at 10 AM with interviewer John Smith");
  await hrAgent("What interviews do we have scheduled?");
}

main().catch(console.error);
