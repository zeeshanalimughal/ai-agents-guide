// SQL AGENT — Ask questions in plain English, get SQL answers
// npm install @google/generative-ai better-sqlite3
// GEMINI_API_KEY=your_key node examples/09_sql_agent.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Database = require("better-sqlite3");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Set up a real SQLite database with sample business data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const db = new Database(":memory:");

db.exec(`
  -- Employees table
  CREATE TABLE employees (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    salary INTEGER NOT NULL,
    hire_date TEXT NOT NULL,
    manager_id INTEGER REFERENCES employees(id)
  );

  -- Products table
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    cost REAL NOT NULL,
    stock INTEGER NOT NULL
  );

  -- Sales table
  CREATE TABLE sales (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    sale_date TEXT NOT NULL,
    region TEXT NOT NULL
  );

  -- Seed employees
  INSERT INTO employees VALUES
    (1, 'Ali Hassan',    'Engineering',  95000, '2021-03-15', NULL),
    (2, 'Sara Khan',     'Marketing',    75000, '2022-01-10', 5),
    (3, 'Ahmed Raza',    'Engineering',  88000, '2020-06-20', 1),
    (4, 'Fatima Ali',    'Sales',        65000, '2023-02-01', 6),
    (5, 'Usman Malik',   'Marketing',   102000, '2019-11-05', NULL),
    (6, 'Zara Ahmed',    'Sales',        95000, '2020-08-12', NULL),
    (7, 'Omar Sheikh',   'Engineering',  78000, '2022-05-30', 1),
    (8, 'Aisha Nawaz',   'HR',           70000, '2021-09-01', NULL),
    (9, 'Bilal Chaudry', 'Sales',        58000, '2023-07-15', 6),
    (10,'Hina Baig',     'Engineering',  91000, '2020-01-20', 1);

  -- Seed products
  INSERT INTO products VALUES
    (1, 'Starter Plan',    'SaaS', 29.99,  5.00,  999),
    (2, 'Pro Plan',        'SaaS', 99.99, 15.00,  999),
    (3, 'Enterprise Plan', 'SaaS', 499.99, 50.00, 999),
    (4, 'Laptop Stand',    'Hardware', 45.00, 12.00,  30),
    (5, 'USB Hub',         'Hardware', 35.00,  8.00,  75),
    (6, 'Webcam HD',       'Hardware', 79.99, 22.00,  45);

  -- Seed sales (Jan-Feb 2024)
  INSERT INTO sales VALUES
    (1,  4, 3, 1, 499.99, '2024-01-10', 'North'),
    (2,  2, 2, 3, 299.97, '2024-01-12', 'South'),
    (3,  4, 3, 1, 499.99, '2024-01-18', 'North'),
    (4,  9, 1, 5, 149.95, '2024-01-20', 'East'),
    (5,  2, 2, 2, 199.98, '2024-01-25', 'South'),
    (6,  4, 3, 2, 999.98, '2024-02-01', 'North'),
    (7,  9, 2, 1,  99.99, '2024-02-05', 'East'),
    (8,  2, 1, 8, 239.92, '2024-02-08', 'South'),
    (9,  4, 3, 1, 499.99, '2024-02-14', 'West'),
    (10, 9, 4, 2,  90.00, '2024-02-20', 'East'),
    (11, 2, 3, 1, 499.99, '2024-02-22', 'South'),
    (12, 4, 5, 3, 105.00, '2024-02-25', 'North');
`);

console.log("✅ Database created with employees, products, and sales data\n");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SQL TOOL IMPLEMENTATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const sqlTools = {
  get_schema: () => {
    const tables = db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    return {
      tables: tables.map((t) => ({ name: t.name, ddl: t.sql })),
      tableCount: tables.length,
    };
  },

  run_query: ({ sql, explanation }) => {
    try {
      // Safety: only allow SELECT queries (no DROP, INSERT, DELETE, UPDATE)
      const trimmed = sql.trim().toUpperCase();
      if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
        return { error: "Only SELECT queries are allowed for data safety" };
      }

      const rows = db.prepare(sql).all();
      return {
        sql,
        explanation: explanation || "",
        rowCount: rows.length,
        rows: rows.slice(0, 50), // Limit to 50 rows
        truncated: rows.length > 50,
      };
    } catch (err) {
      return { error: err.message, sql, hint: "Check table names and column names with get_schema" };
    }
  },

  get_table_sample: ({ table_name, limit = 5 }) => {
    try {
      const rows = db.prepare(`SELECT * FROM ${table_name} LIMIT ?`).all(limit);
      return { table: table_name, rows, count: rows.length };
    } catch (err) {
      return { error: err.message };
    }
  },
};

const sqlToolDeclarations = [
  {
    functionDeclarations: [
      {
        name: "get_schema",
        description:
          "Get the complete database schema — all table names and their column definitions. Always call this first before writing queries.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "run_query",
        description: "Execute a SELECT SQL query on the database and return results",
        parameters: {
          type: "OBJECT",
          properties: {
            sql: {
              type: "STRING",
              description: "The SQL SELECT query to execute. Must start with SELECT or WITH.",
            },
            explanation: {
              type: "STRING",
              description: "Brief explanation of what this query does (for logging)",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "get_table_sample",
        description: "Get a sample of rows from a specific table to understand the data",
        parameters: {
          type: "OBJECT",
          properties: {
            table_name: { type: "STRING", description: "Name of the table to sample" },
            limit: { type: "NUMBER", description: "Number of rows to return (default 5)" },
          },
          required: ["table_name"],
        },
      },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SQL Agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function sqlAgent(question) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    tools: sqlToolDeclarations,
    systemInstruction: `
      You are an expert SQL analyst. When users ask business questions:
      
      1. ALWAYS start by calling get_schema to understand the database structure
      2. Write efficient, accurate SQL queries to answer the question
      3. Run the query and carefully interpret the results
      4. Present findings in plain English with specific numbers
      5. Include the SQL query you used (formatted nicely)
      
      SQL best practices:
      - Use meaningful aliases (e.g., SUM(total_amount) AS total_revenue)
      - Use JOINs when data spans multiple tables
      - Use GROUP BY for aggregations
      - ORDER BY for rankings (add LIMIT for top-N queries)
      - Use ROUND() for financial figures
      
      Answer format:
      1. Brief answer first (the key number/insight)
      2. SQL query used
      3. Detailed explanation of the findings
    `,
  });

  const chat = model.startChat();

  console.log(`\n${"═".repeat(65)}`);
  console.log(`❓ Question: ${question}`);
  console.log(`${"═".repeat(65)}`);

  let resp = await chat.sendMessage(question);

  while (true) {
    const parts = resp.response.candidates[0].content.parts;
    const calls = parts.filter((p) => p.functionCall);

    if (!calls.length) {
      console.log(`\n📊 Answer:\n${parts.map((p) => p.text || "").join("")}`);
      return;
    }

    const results = calls.map((p) => {
      const { name, args } = p.functionCall;
      console.log(`  🗃️  ${name}(${args.sql ? `"${args.sql.substring(0, 60)}..."` : JSON.stringify(args)})`);
      const result = sqlTools[name](args);
      return { functionResponse: { name, response: result } };
    });

    resp = await chat.sendMessage(results);
  }
}

async function main() {
  await sqlAgent("Who are the top 3 highest paid employees, and what departments are they in?");

  await sqlAgent("What is the total revenue and number of sales per employee? Rank them best to worst.");

  await sqlAgent(
    "Compare sales performance by region in February 2024 — total revenue and number of deals per region"
  );

  await sqlAgent(
    "What's the profit margin by product? (revenue - cost*quantity). Which product is most profitable?"
  );

  await sqlAgent(
    "Show me all Engineering employees, their salaries, and calculate the average salary for the Engineering department"
  );
}

main().catch(console.error);
