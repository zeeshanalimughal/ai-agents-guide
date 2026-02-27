// ============================================================
// API DOCUMENTATION WRITER AGENT
// ============================================================
// Give it any Express/Node.js routes file → it generates:
//   1. Human-readable Markdown API reference
//   2. OpenAPI 3.0 JSON spec
//   3. Postman collection JSON
//
// SETUP:
//   npm install @google/generative-ai
//   GEMINI_API_KEY=your_key node 19_api_doc_writer_agent.js
// ============================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs   = require("fs");
const path = require("path");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────
// TOOL IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────

function read_file({ filepath }) {
  if (!fs.existsSync(filepath))
    return { error: `File not found: ${filepath}` };
  const content = fs.readFileSync(filepath, "utf-8");
  return { content, lines: content.split("\n").length, filepath };
}

function scan_routes({ code }) {
  // Extract every route definition so the LLM knows exactly what to document
  const routes = [];
  const patterns = [
    /(?:router|app)\.(get|post|put|patch|delete|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(code)) !== null) {
      routes.push({ method: m[1].toUpperCase(), path: m[2] });
    }
  }

  // Detect middleware and auth patterns
  const authMiddleware = /authenticate|requireAuth|verifyToken|protect|isLoggedIn|passport/i.test(code);
  const validation     = /celebrate|joi|zod|express-validator|body\('|check\('/i.test(code);
  const pagination     = /page|limit|offset|skip/i.test(code);
  const fileUpload     = /multer|upload|multipart/i.test(code);

  return {
    routes,
    totalEndpoints: routes.length,
    hasAuth:        authMiddleware,
    hasValidation:  validation,
    hasPagination:  pagination,
    hasFileUpload:  fileUpload,
    uniquePaths:    [...new Set(routes.map((r) => r.path.split("/")[1] || "/"))],
  };
}

function save_file({ filename, content }) {
  const dir = "./api-docs-output";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, content, "utf-8");
  return {
    success: true,
    filepath,
    sizeKB: (Buffer.byteLength(content, "utf-8") / 1024).toFixed(1),
  };
}

const TOOL_MAP = { read_file, scan_routes, save_file };

// ─────────────────────────────────────────────────────────────
// TOOL DECLARATIONS
// ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "read_file",
        description: "Read source code from a file on disk",
        parameters: {
          type: "OBJECT",
          properties: {
            filepath: { type: "STRING", description: "Relative or absolute path to the source file" },
          },
          required: ["filepath"],
        },
      },
      {
        name: "scan_routes",
        description:
          "Scan source code to extract all route definitions, detect auth/validation patterns, and return a structured summary to guide documentation",
        parameters: {
          type: "OBJECT",
          properties: {
            code: { type: "STRING", description: "Full source code to scan" },
          },
          required: ["code"],
        },
      },
      {
        name: "save_file",
        description: "Save generated documentation content to a file",
        parameters: {
          type: "OBJECT",
          properties: {
            filename: {
              type: "STRING",
              description: "Output filename e.g. api-reference.md, openapi.json, postman.json",
            },
            content: { type: "STRING", description: "File content to save" },
          },
          required: ["filename", "content"],
        },
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// SAMPLE API — written to disk so the agent reads it naturally
// ─────────────────────────────────────────────────────────────
const SAMPLE_API = `
const express = require('express');
const router  = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');

// ── AUTH ──────────────────────────────────────────────────────

// Register a new user
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email, and password are required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const user  = await User.create({ name, email, password: await hash(password), role: role || 'user' });
    const token = signJWT({ id: user._id, role: user.role });
    res.status(201).json({ token, expiresIn: '7d', user: { id: user._id, name, email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const user = await User.findOne({ email });
    if (!user || !(await compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = signJWT({ id: user._id, role: user.role });
    res.json({ token, expiresIn: '7d', user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout (invalidate token)
router.post('/auth/logout', authenticate, async (req, res) => {
  await TokenBlacklist.create({ token: req.headers.authorization?.split(' ')[1] });
  res.json({ message: 'Logged out successfully' });
});

// ── USERS ─────────────────────────────────────────────────────

// List all users (admin only) with search + pagination
router.get('/users', authenticate, requireRole('admin'), async (req, res) => {
  const { page = 1, limit = 20, search, role } = req.query;
  const filter = {};
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
  ];
  if (role) filter.role = role;

  const [users, total] = await Promise.all([
    User.find(filter).select('-password').skip((page - 1) * limit).limit(+limit).sort('-createdAt'),
    User.countDocuments(filter),
  ]);
  res.json({ users, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

// Get single user by ID
router.get('/users/:id', authenticate, async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// Update user profile
router.put('/users/:id', authenticate, async (req, res) => {
  try {
    if (req.user.id !== req.params.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden: cannot update another user' });

    const { name, email, bio, avatar } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, bio, avatar },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// Delete user (admin only)
router.delete('/users/:id', authenticate, requireRole('admin'), async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'User deleted' });
});

// ── POSTS ─────────────────────────────────────────────────────

// List published posts with filters + pagination
router.get('/posts', async (req, res) => {
  const { page = 1, limit = 10, category, author, tag, sort = '-createdAt' } = req.query;
  const filter = { status: 'published' };
  if (category) filter.category = category;
  if (author)   filter.author   = author;
  if (tag)      filter.tags     = tag;

  const [posts, total] = await Promise.all([
    Post.find(filter).sort(sort).skip((page - 1) * limit).limit(+limit)
        .populate('author', 'name avatar'),
    Post.countDocuments(filter),
  ]);
  res.json({ posts, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

// Get single post by slug
router.get('/posts/:slug', async (req, res) => {
  const post = await Post.findOne({ slug: req.params.slug, status: 'published' })
                         .populate('author', 'name avatar bio');
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.views = (post.views || 0) + 1;
  await post.save();
  res.json({ post });
});

// Create post (authenticated)
router.post('/posts', authenticate, async (req, res) => {
  try {
    const { title, content, category, tags, status, coverImage } = req.body;
    if (!title || !content)
      return res.status(400).json({ error: 'title and content are required' });

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const post = await Post.create({
      title, content, category, tags, status: status || 'draft',
      coverImage, slug, author: req.user.id,
    });
    res.status(201).json({ post });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// Update post
router.put('/posts/:id', authenticate, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author.toString() !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden' });

    Object.assign(post, req.body);
    await post.save();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete post
router.delete('/posts/:id', authenticate, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.author.toString() !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  await post.deleteOne();
  res.json({ message: 'Post deleted' });
});

// ── COMMENTS ──────────────────────────────────────────────────

// Get comments for a post
router.get('/posts/:postId/comments', async (req, res) => {
  const comments = await Comment.find({ post: req.params.postId })
                                .populate('author', 'name avatar')
                                .sort('createdAt');
  res.json({ comments, total: comments.length });
});

// Add comment
router.post('/posts/:postId/comments', authenticate, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  const comment = await Comment.create({ post: req.params.postId, author: req.user.id, text });
  res.status(201).json({ comment });
});

// Delete comment (own or admin)
router.delete('/comments/:id', authenticate, async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.author.toString() !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  await comment.deleteOne();
  res.json({ message: 'Comment deleted' });
});

module.exports = router;
`;

// Write sample file for agent to read
fs.mkdirSync("./sample-api", { recursive: true });
fs.writeFileSync("./sample-api/routes.js", SAMPLE_API, "utf-8");

// ─────────────────────────────────────────────────────────────
// AGENT
// ─────────────────────────────────────────────────────────────
async function runAgent(task) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: TOOLS,
    systemInstruction: `
You are an expert API technical writer. Your job is to produce complete, production-grade
documentation from source code.

WORKFLOW:
1. read_file to load the source code
2. scan_routes to get structured route metadata
3. Write and save THREE files using save_file:

━━━ FILE 1: api-reference.md ━━━
# API Reference
Base URL, Auth section (how to get + send JWT), then one section per resource group.
For EVERY endpoint:
  ### METHOD /path
  > One-line description
  **Auth required:** Yes/No (role if needed)
  **Request body** (table: field | type | required | description)
  **Query params** (table: param | type | default | description)  
  **Success response** — HTTP code + full JSON example
  **Error responses** — table of all possible error codes + messages
  \`\`\`json example request body\`\`\`

━━━ FILE 2: openapi.json ━━━
Valid OpenAPI 3.0.3 JSON. Include:
  - info (title, version, description)
  - servers array
  - components.securitySchemes (BearerAuth)
  - components.schemas for User, Post, Comment, Error, Pagination
  - Full paths object with every endpoint
  - requestBody, parameters, responses with examples for each

━━━ FILE 3: postman-collection.json ━━━
Valid Postman Collection v2.1 JSON. Include:
  - collection info
  - auth folder with register + login requests
  - Each resource in its own folder
  - Pre-filled example request bodies
  - {{base_url}} variable
  - Bearer token as collection-level auth

Be thorough. Real JSON examples in every response. Every status code documented.
`,
  });

  const chat = model.startChat();
  console.log(`\n📝 Task: ${task}\n${"─".repeat(60)}`);

  let resp  = await chat.sendMessage(task);
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
      // Clean log — truncate huge strings
      const logArgs = Object.fromEntries(
        Object.entries(args).map(([k, v]) => [
          k,
          typeof v === "string" && v.length > 120 ? `[${v.length} chars]` : v,
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
  console.log("═".repeat(60));
  console.log("📚 API DOCUMENTATION WRITER AGENT");
  console.log("═".repeat(60));

  await runAgent(
    "Read ./sample-api/routes.js, scan all its routes, then generate three complete documentation files: api-reference.md (human-readable with full examples), openapi.json (valid OpenAPI 3.0.3 spec), and postman-collection.json (ready to import into Postman). Save all three."
  );

  // Summary
  const outDir = "./api-docs-output";
  if (fs.existsSync(outDir)) {
    console.log("\n\n✅ Generated documentation:");
    fs.readdirSync(outDir).forEach((f) => {
      const kb = (fs.statSync(path.join(outDir, f)).size / 1024).toFixed(1);
      console.log(`   📄 ${path.join(outDir, f)}  (${kb} KB)`);
    });
    console.log("\nOpen api-docs-output/api-reference.md for the human-readable docs.");
    console.log("Import api-docs-output/postman-collection.json into Postman to test.");
  }
}

main().catch(console.error);
