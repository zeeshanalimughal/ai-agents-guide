// ============================================================
// JOB APPLICATION AGENT
// ============================================================
// Give it a job description + your resume → it produces:
//   1. tailored-resume.md     — rewritten to mirror the JD keywords
//   2. cover-letter.md        — personalized, compelling, 300 words
//   3. gap-analysis.md        — honest skill gap + 30-day study plan
//   4. interview-prep.md      — top 10 questions + STAR answer hints
//
// SETUP:
//   npm install @google/generative-ai
//   GEMINI_API_KEY=your_key node 22_job_application_agent.js
// ============================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs   = require("fs");
const path = require("path");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────
// TOOL IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────

function parse_job_description({ jdText }) {
  // Extract structured signals from the JD
  const techRegex  = /\b(node\.?js|react|vue|angular|python|django|fastapi|typescript|javascript|postgresql|mysql|mongodb|redis|docker|kubernetes|aws|gcp|azure|graphql|rest|grpc|git|agile|scrum|ci\/cd|terraform|kafka|elasticsearch)\b/gi;
  const softRegex  = /\b(communication|leadership|collaboration|ownership|problem.solving|cross.functional|mentoring|initiative|fast.paced|startup)\b/gi;
  const seniorSignals = /\bsenior|staff|lead|principal|architect|5\+|6\+|7\+|8\+\s*years\b/i;
  const remoteSignal  = /\bremote|distributed|work from home|hybrid\b/i;

  const techSkills   = [...new Set([...jdText.matchAll(techRegex)].map((m) => m[0].toLowerCase()))];
  const softSkills   = [...new Set([...jdText.matchAll(softRegex)].map((m) => m[0].toLowerCase()))];
  const salaryMatch  = jdText.match(/\$[\d,]+[k]?\s*[-–]\s*\$[\d,]+[k]?/i);
  const yearsMatch   = jdText.match(/(\d+)\+?\s*years?/i);

  return {
    technicalSkills: techSkills,
    softSkills,
    salary:          salaryMatch ? salaryMatch[0] : "Not specified",
    yearsRequired:   yearsMatch ? yearsMatch[0] : "Not specified",
    seniorRole:      seniorSignals.test(jdText),
    isRemote:        remoteSignal.test(jdText),
    wordCount:       jdText.split(/\s+/).length,
  };
}

function parse_resume({ resumeText }) {
  const techRegex   = /\b(node\.?js|react|vue|angular|python|django|fastapi|typescript|javascript|postgresql|mysql|mongodb|redis|docker|kubernetes|aws|gcp|azure|graphql|rest|grpc|git|agile|scrum|ci\/cd|terraform|kafka|elasticsearch|express|next\.?js|jest|mocha)\b/gi;
  const yearRegex   = /\b(20\d{2})\b/g;
  const metricRegex = /\d+%|\d+x|\$[\d,]+|\d+,\d+|\d+ (users|customers|engineers|million|thousand)/gi;

  const skills      = [...new Set([...resumeText.matchAll(techRegex)].map((m) => m[0].toLowerCase()))];
  const years       = [...resumeText.matchAll(yearRegex)].map((m) => parseInt(m[1]));
  const metrics     = [...resumeText.matchAll(metricRegex)].map((m) => m[0]);
  const hasLinkedIn = /linkedin/i.test(resumeText);
  const hasGitHub   = /github/i.test(resumeText);

  const sortedYears    = years.sort();
  const experienceYears =
    sortedYears.length >= 2
      ? new Date().getFullYear() - sortedYears[0]
      : null;

  return {
    technicalSkills: skills,
    quantifiedMetrics: metrics,
    hasLinkedIn,
    hasGitHub,
    approximateExperienceYears: experienceYears,
    wordCount: resumeText.split(/\s+/).length,
    hasMetrics: metrics.length > 0,
  };
}

function calculate_fit({ jdSkills, resumeSkills }) {
  const jdSet     = new Set(jdSkills.map((s) => s.toLowerCase()));
  const resumeSet = new Set(resumeSkills.map((s) => s.toLowerCase()));

  const matched       = [...jdSet].filter((s) => resumeSet.has(s));
  const missing       = [...jdSet].filter((s) => !resumeSet.has(s));
  const extraInResume = [...resumeSet].filter((s) => !jdSet.has(s));
  const score         = jdSet.size > 0 ? Math.round((matched.length / jdSet.size) * 100) : 0;

  return {
    matchScore:         score,
    grade:              score >= 80 ? "A — Strong match" : score >= 60 ? "B — Good match with gaps" : score >= 40 ? "C — Moderate match — significant gaps" : "D — Weak match — consider upskilling first",
    matchedSkills:      matched,
    missingSkills:      missing,
    bonusSkills:        extraInResume,
    recommendation:     score >= 60 ? "Apply — you are competitive" : "Apply but address gaps in cover letter and start upskilling now",
  };
}

function save_file({ filename, content }) {
  const dir = "./job-application-output";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, content, "utf-8");
  return { success: true, filepath, sizeKB: (Buffer.byteLength(content) / 1024).toFixed(1) };
}

const TOOL_MAP = { parse_job_description, parse_resume, calculate_fit, save_file };

// ─────────────────────────────────────────────────────────────
// TOOL DECLARATIONS
// ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "parse_job_description",
        description: "Extract technical skills, soft skills, seniority level, salary, and other signals from a job description",
        parameters: {
          type: "OBJECT",
          properties: { jdText: { type: "STRING", description: "Full job description text" } },
          required: ["jdText"],
        },
      },
      {
        name: "parse_resume",
        description: "Extract skills, experience years, metrics, and quality signals from a resume",
        parameters: {
          type: "OBJECT",
          properties: { resumeText: { type: "STRING", description: "Full resume text" } },
          required: ["resumeText"],
        },
      },
      {
        name: "calculate_fit",
        description: "Calculate match score between job requirements and candidate skills",
        parameters: {
          type: "OBJECT",
          properties: {
            jdSkills:     { type: "ARRAY", items: { type: "STRING" }, description: "Skills required by the job" },
            resumeSkills: { type: "ARRAY", items: { type: "STRING" }, description: "Skills the candidate has" },
          },
          required: ["jdSkills", "resumeSkills"],
        },
      },
      {
        name: "save_file",
        description: "Save generated content to a file",
        parameters: {
          type: "OBJECT",
          properties: {
            filename: { type: "STRING", description: "e.g. tailored-resume.md, cover-letter.md" },
            content:  { type: "STRING" },
          },
          required: ["filename", "content"],
        },
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// SAMPLE DATA
// ─────────────────────────────────────────────────────────────
const JOB_DESCRIPTION = `
Senior Full-Stack Engineer — Remote
FinFlow (Series B FinTech Startup)

About the Role
We're building the next-generation payment infrastructure used by 500+ businesses.
You'll own features from database schema to pixel-perfect UI.

What You'll Do
- Design and build RESTful APIs with Node.js and TypeScript
- Build fast, accessible React frontends with clean state management
- Design and optimize PostgreSQL schemas for high-throughput transactions
- Deploy, monitor, and scale services on AWS (ECS, RDS, CloudWatch, S3)
- Write comprehensive tests (unit, integration, e2e)
- Collaborate with product and design in 2-week Agile sprints
- Mentor 1–2 junior engineers

You Must Have
- 4+ years of professional full-stack development
- Strong Node.js + TypeScript (you prefer it over plain JS)
- React with hooks, ideally React Query or Zustand for state
- PostgreSQL — you can write complex queries and design indexes
- AWS deployment experience
- Experience with CI/CD pipelines (GitHub Actions or similar)
- Strong understanding of REST API design and HTTP

Nice to Have
- Redis caching experience
- Docker and basic Kubernetes
- Previous fintech or payments experience
- GraphQL

We Offer
$120,000–$150,000 + equity + 100% remote + generous PTO
`;

const CANDIDATE_RESUME = `
ALI HASSAN
Full-Stack Developer
ali.hassan@email.com | +92-300-1234567
github.com/ali-dev | linkedin.com/in/ali-hassan
Lahore, Pakistan (Open to Remote)

PROFESSIONAL SUMMARY
Full-stack developer with 3.5 years of experience shipping production web applications.
I love building things from end to end — from database design to polished UIs.
Focused on clean code, performance, and developer experience.

EXPERIENCE

Senior Developer · TechSolutions Pvt Ltd · Jan 2022 – Present
• Architected and built REST APIs in Node.js/Express serving 80,000+ daily requests
  with 99.9% uptime
• Built React dashboards that reduced client reporting time by 40% (from 2 hrs to 45 min)
• Led migration from MySQL to PostgreSQL — query performance improved by 60%,
  reduced DB costs by $800/month
• Implemented JWT auth + RBAC system protecting 15,000 user accounts
• Set up GitHub Actions CI/CD pipeline — reduced deployment time from 45 min to 8 min
• Mentored 2 junior developers, conducted weekly code reviews

Full-Stack Developer · StartupXYZ · Jun 2020 – Dec 2021
• Built e-commerce platform from scratch using React, Node.js, MongoDB
  — grew to 12,000 active users in 8 months
• Integrated Stripe payment gateway processing $200k/month in transactions
• Deployed on AWS EC2 + S3 + CloudFront
• Worked in Agile team, 2-week sprints, daily standups

TECHNICAL SKILLS
Languages  : JavaScript, TypeScript (1.5 years), Python (scripting/automation)
Frontend   : React 18, React Query, Tailwind CSS, HTML/CSS
Backend    : Node.js, Express.js, REST APIs
Databases  : PostgreSQL, MongoDB, MySQL
DevOps     : AWS (EC2, S3, RDS, CloudFront), Docker (intermediate), GitHub Actions
Testing    : Jest, Supertest (unit + integration tests)
Tools      : Git, Jira, Figma, Postman

EDUCATION
BS Computer Science · FAST-NUCES Lahore · 2020 · GPA 3.4/4.0

PROJECTS
• open-components — React component library with 1,200+ GitHub stars, used in 40+ projects
• Kharcha — personal finance tracker app, 3,500 active monthly users
  (React, Node.js, PostgreSQL)
`;

// ─────────────────────────────────────────────────────────────
// AGENT
// ─────────────────────────────────────────────────────────────
async function runJobAgent({ jobDescription, resume, companyName, roleName }) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: TOOLS,
    systemInstruction: `
You are an expert career coach and professional resume writer specializing in tech roles.
Your goal: maximize this candidate's chance of getting an interview.

WORKFLOW:
1. parse_job_description to extract what the role needs
2. parse_resume to extract what the candidate has
3. calculate_fit to get the match score and gap list
4. Generate and save 4 files with save_file:

━━━ FILE 1: tailored-resume.md ━━━
Rewrite the resume to match this specific job. Rules:
- Mirror the EXACT keywords from the job description (ATS optimization)
- Reorder bullet points so the most relevant experience is first
- Quantify every achievement that doesn't already have a number
- Rename job titles and section headers to match JD language where truthful
- Weave in missing-but-implied skills (e.g. if they used Express.js, they know REST APIs)
- Add a "Core Competencies" section at the top listing exact JD keywords they have
- Keep all information 100% truthful — never fabricate experience
- Format: clean markdown, professional

━━━ FILE 2: cover-letter.md ━━━
Write a compelling, human cover letter. Rules:
- Opening: specific hook about the company (show you researched them)
- Paragraph 1: connect their #1 pain point (from JD) to your #1 matching experience
- Paragraph 2: connect their #2 requirement to a specific achievement with metrics
- Paragraph 3: address the biggest skill gap proactively and honestly (shows maturity)
- Closing: confident, specific CTA — "I'd love to discuss how I can contribute to X"
- Tone: confident, specific, human — NOT corporate buzzword soup
- Length: 280–320 words exactly
- Format: proper letter format with date, greeting, sign-off

━━━ FILE 3: gap-analysis.md ━━━
Honest, detailed gap analysis:
- Overall match score and grade
- ✅ Skills you have (with evidence from resume)
- ❌ Skills you're missing (with severity: blocking vs nice-to-have)
- 🔄 Skills where experience is partial (need to frame better or upskill slightly)
- Should you apply? Direct recommendation with reasoning
- 30-day upskilling plan: specific resources (courses, docs, projects) for top 3 gaps
  with time estimates per day

━━━ FILE 4: interview-prep.md ━━━
Practical interview preparation:
- 10 most likely interview questions for this specific role (technical + behavioral)
- For each: STAR-format answer hint using their ACTUAL experience from the resume
- 5 technical topics to review before the interview (specific, not vague)
- 5 insightful questions to ask the interviewer (shows research + seniority)
- Red flags to watch for during the interview

Use real details from the resume and JD throughout. Be specific, not generic.
`,
  });

  console.log("\n" + "═".repeat(65));
  console.log("💼  JOB APPLICATION AGENT");
  console.log(`    Role    : ${roleName}`);
  console.log(`    Company : ${companyName}`);
  console.log("═".repeat(65));

  const chat = model.startChat();
  let resp = await chat.sendMessage(`
Analyze this job application and generate all 4 output files.

COMPANY: ${companyName}
ROLE: ${roleName}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE RESUME:
${resume}

Please:
1. Parse the job description
2. Parse the resume
3. Calculate the match score
4. Generate and save all 4 files: tailored-resume.md, cover-letter.md, gap-analysis.md, interview-prep.md
  `);

  let steps = 0;
  while (steps++ < 25) {
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

  // Summary
  const dir = "./job-application-output";
  if (fs.existsSync(dir)) {
    console.log("\n\n✅ Generated files:");
    fs.readdirSync(dir).forEach((f) => {
      const kb = (fs.statSync(path.join(dir, f)).size / 1024).toFixed(1);
      console.log(`   📄 ${path.join(dir, f)}  (${kb} KB)`);
    });
    console.log("\n→ Open tailored-resume.md and copy it to your resume");
    console.log("→ Open cover-letter.md, personalize the company name, and send");
    console.log("→ Read gap-analysis.md for your 30-day study plan");
    console.log("→ Study interview-prep.md the night before");
  }
}

// ─────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────
runJobAgent({
  jobDescription: JOB_DESCRIPTION,
  resume:         CANDIDATE_RESUME,
  companyName:    "FinFlow",
  roleName:       "Senior Full-Stack Engineer",
}).catch(console.error);
