// MCP SERVER — Exposes Todo + File tools to any AI client
// npm install @modelcontextprotocol/sdk
// node examples/03_mcp_server.js
//
// This server communicates over stdin/stdout (stdio transport).
// Any MCP-compatible client (Claude Desktop, Cursor, your app) can connect to it.

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require("fs");
const path = require("path");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// In-Memory Todo Database
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let todos = [
  { id: 1, text: "Buy groceries", done: false, priority: "high", created: "2024-02-26" },
  { id: 2, text: "Write project report", done: false, priority: "medium", created: "2024-02-25" },
  { id: 3, text: "Call dentist", done: true, priority: "low", created: "2024-02-20" },
  { id: 4, text: "Review PR #42", done: false, priority: "high", created: "2024-02-27" },
];
let nextId = 5;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Create the MCP Server
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const server = new Server(
  { name: "todo-filesystem-server", version: "1.0.0" },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LIST TOOLS: Advertise available tools to any connected AI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "add_todo",
      description: "Add a new todo item to the list",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The todo task description" },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Priority level (default: medium)",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "list_todos",
      description: "List all todos, with optional filtering by status or priority",
      inputSchema: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["all", "done", "pending", "high_priority"],
            description: "Filter todos by status or priority",
          },
        },
      },
    },
    {
      name: "complete_todo",
      description: "Mark a todo item as completed",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "The todo ID to mark as done" },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_todo",
      description: "Permanently delete a todo item",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "The todo ID to delete" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_todo",
      description: "Update the text or priority of an existing todo",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "The todo ID to update" },
          text: { type: "string", description: "New text for the todo" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["id"],
      },
    },
    {
      name: "read_file",
      description: "Read the contents of a file from the filesystem",
      inputSchema: {
        type: "object",
        properties: {
          filepath: { type: "string", description: "Path to the file to read" },
        },
        required: ["filepath"],
      },
    },
    {
      name: "write_file",
      description: "Write or overwrite content to a file",
      inputSchema: {
        type: "object",
        properties: {
          filepath: { type: "string", description: "Path to write the file to" },
          content: { type: "string", description: "Content to write to the file" },
        },
        required: ["filepath", "content"],
      },
    },
    {
      name: "list_files",
      description: "List files in a directory",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory path to list (default: current dir)" },
        },
      },
    },
  ],
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CALL TOOL: Handle actual tool execution requests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "add_todo": {
        const newTodo = {
          id: nextId++,
          text: args.text,
          done: false,
          priority: args.priority || "medium",
          created: new Date().toISOString().split("T")[0],
        };
        todos.push(newTodo);
        return {
          content: [{ type: "text", text: `✅ Added todo #${newTodo.id}: "${newTodo.text}" (${newTodo.priority} priority)` }],
        };
      }

      case "list_todos": {
        let filtered = todos;
        if (args.filter === "done") filtered = todos.filter((t) => t.done);
        if (args.filter === "pending") filtered = todos.filter((t) => !t.done);
        if (args.filter === "high_priority") filtered = todos.filter((t) => t.priority === "high");

        if (filtered.length === 0) {
          return { content: [{ type: "text", text: "No todos found matching filter." }] };
        }

        const formatted = filtered
          .map((t) => `[${t.done ? "✓" : " "}] #${t.id} (${t.priority}) ${t.text}`)
          .join("\n");

        return { content: [{ type: "text", text: `Todos (${filtered.length}):\n${formatted}` }] };
      }

      case "complete_todo": {
        const todo = todos.find((t) => t.id === args.id);
        if (!todo) return { content: [{ type: "text", text: `❌ Todo #${args.id} not found` }] };
        todo.done = true;
        return { content: [{ type: "text", text: `✅ Completed: "${todo.text}"` }] };
      }

      case "delete_todo": {
        const idx = todos.findIndex((t) => t.id === args.id);
        if (idx === -1) return { content: [{ type: "text", text: `❌ Todo #${args.id} not found` }] };
        const [removed] = todos.splice(idx, 1);
        return { content: [{ type: "text", text: `🗑️ Deleted: "${removed.text}"` }] };
      }

      case "update_todo": {
        const todo = todos.find((t) => t.id === args.id);
        if (!todo) return { content: [{ type: "text", text: `❌ Todo #${args.id} not found` }] };
        if (args.text) todo.text = args.text;
        if (args.priority) todo.priority = args.priority;
        return { content: [{ type: "text", text: `✅ Updated todo #${args.id}: "${todo.text}" (${todo.priority})` }] };
      }

      case "read_file": {
        const content = fs.readFileSync(args.filepath, "utf-8");
        return { content: [{ type: "text", text: content }] };
      }

      case "write_file": {
        const dir = path.dirname(args.filepath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(args.filepath, args.content, "utf-8");
        return {
          content: [{ type: "text", text: `✅ Written ${args.content.length} bytes to ${args.filepath}` }],
        };
      }

      case "list_files": {
        const dir = args.directory || ".";
        const files = fs.readdirSync(dir).map((f) => {
          const stat = fs.statSync(path.join(dir, f));
          return `${stat.isDirectory() ? "📁" : "📄"} ${f} (${stat.size} bytes)`;
        });
        return { content: [{ type: "text", text: files.join("\n") }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LIST RESOURCES: Expose data as readable resources
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "todo://all",
      name: "All Todos",
      description: "Complete todo list as JSON",
      mimeType: "application/json",
    },
    {
      uri: "todo://stats",
      name: "Todo Statistics",
      description: "Summary stats: total, done, pending by priority",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "todo://all") {
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(todos, null, 2) }],
    };
  }

  if (uri === "todo://stats") {
    const stats = {
      total: todos.length,
      done: todos.filter((t) => t.done).length,
      pending: todos.filter((t) => !t.done).length,
      byPriority: {
        high: todos.filter((t) => t.priority === "high").length,
        medium: todos.filter((t) => t.priority === "medium").length,
        low: todos.filter((t) => t.priority === "low").length,
      },
    };
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(stats, null, 2) }],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Start the MCP Server
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr (not stdout, as stdout is used for MCP protocol)
  console.error("✅ Todo + Filesystem MCP Server running on stdio");
  console.error(`   Tools available: add_todo, list_todos, complete_todo, delete_todo, update_todo, read_file, write_file, list_files`);
  console.error(`   Resources: todo://all, todo://stats`);
}

main().catch((err) => {
  console.error("MCP Server error:", err);
  process.exit(1);
});
