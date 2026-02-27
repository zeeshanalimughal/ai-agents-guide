// ============================================================
// MEDICATION REMINDER & TRACKER AGENT
// ============================================================
// Tracks medications, dosage schedules, logs when taken,
// detects missed doses, flags dangerous drug interactions,
// and generates a health report for doctor visits.
//
// Real-world use: elderly patients, chronic illness management,
// caregiver dashboards, pharmacy apps.
//
// SETUP:
//   npm install @google/generative-ai
//   GEMINI_API_KEY=your_key node 23_medication_agent.js
// ============================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────
// DATABASE  (in production: SQLite or MongoDB)
// ─────────────────────────────────────────────────────────────
const db = {
  patient: {
    name:      "Muhammad Arif",
    age:       62,
    weight:    "78 kg",
    allergies: ["Penicillin", "Sulfa drugs"],
    conditions:["Type 2 Diabetes", "Hypertension", "High Cholesterol"],
    doctor:    "Dr. Sana Mirza",
    phone:     "+92-300-555-0101",
  },

  medications: [
    {
      id: "MED001", name: "Metformin",      dose: "500mg",  frequency: "twice daily",
      times: ["08:00", "20:00"], purpose: "Blood sugar control", refillDue: "2024-03-15",
      stock: 18, warnStockBelow: 7, prescribedBy: "Dr. Sana Mirza",
      sideEffects: ["Nausea", "Diarrhea", "Stomach upset"],
      instructions: "Take with food",
    },
    {
      id: "MED002", name: "Lisinopril",     dose: "10mg",   frequency: "once daily",
      times: ["08:00"], purpose: "Blood pressure control", refillDue: "2024-03-20",
      stock: 12, warnStockBelow: 5, prescribedBy: "Dr. Sana Mirza",
      sideEffects: ["Dry cough", "Dizziness"],
      instructions: "Take in the morning",
    },
    {
      id: "MED003", name: "Atorvastatin",   dose: "20mg",   frequency: "once daily",
      times: ["21:00"], purpose: "Cholesterol management", refillDue: "2024-04-01",
      stock: 25, warnStockBelow: 7, prescribedBy: "Dr. Sana Mirza",
      sideEffects: ["Muscle pain", "Headache"],
      instructions: "Take at night",
    },
    {
      id: "MED004", name: "Aspirin",        dose: "75mg",   frequency: "once daily",
      times: ["08:00"], purpose: "Heart attack prevention", refillDue: "2024-03-25",
      stock: 4, warnStockBelow: 7, prescribedBy: "Dr. Sana Mirza",
      sideEffects: ["Stomach irritation"],
      instructions: "Take with food",
    },
    {
      id: "MED005", name: "Vitamin D3",     dose: "1000 IU",frequency: "once daily",
      times: ["08:00"], purpose: "Bone health supplement", refillDue: "2024-04-10",
      stock: 60, warnStockBelow: 14, prescribedBy: "Dr. Sana Mirza",
      sideEffects: [],
      instructions: "Take with a fatty meal for best absorption",
    },
  ],

  // Dose log — records every dose taken or missed
  doseLog: [
    { medId: "MED001", scheduledTime: "2024-02-26 08:00", takenAt: "2024-02-26 08:15", status: "taken"  },
    { medId: "MED002", scheduledTime: "2024-02-26 08:00", takenAt: "2024-02-26 08:15", status: "taken"  },
    { medId: "MED004", scheduledTime: "2024-02-26 08:00", takenAt: null,               status: "missed" },
    { medId: "MED005", scheduledTime: "2024-02-26 08:00", takenAt: "2024-02-26 09:00", status: "taken"  },
    { medId: "MED001", scheduledTime: "2024-02-26 20:00", takenAt: "2024-02-26 20:05", status: "taken"  },
    { medId: "MED003", scheduledTime: "2024-02-26 21:00", takenAt: null,               status: "missed" },
    { medId: "MED001", scheduledTime: "2024-02-27 08:00", takenAt: "2024-02-27 08:10", status: "taken"  },
    { medId: "MED002", scheduledTime: "2024-02-27 08:00", takenAt: null,               status: "missed" },
  ],

  // Known drug interactions database
  interactions: [
    { drugs: ["Metformin", "Alcohol"],       severity: "high",   effect: "Severe lactic acidosis risk — avoid alcohol completely" },
    { drugs: ["Lisinopril", "Potassium"],    severity: "medium", effect: "Risk of dangerously high potassium levels" },
    { drugs: ["Atorvastatin", "Grapefruit"], severity: "medium", effect: "Grapefruit increases statin blood levels — muscle damage risk" },
    { drugs: ["Aspirin", "Ibuprofen"],       severity: "high",   effect: "NSAIDs reduce Aspirin's heart-protective effect — avoid together" },
    { drugs: ["Lisinopril", "Ibuprofen"],    severity: "high",   effect: "NSAIDs reduce blood pressure medication effectiveness + kidney risk" },
    { drugs: ["Metformin", "Ibuprofen"],     severity: "medium", effect: "NSAIDs can impair kidney function, affecting Metformin clearance" },
    { drugs: ["Atorvastatin", "Erythromycin"], severity: "high", effect: "Increased statin levels — muscle damage (rhabdomyolysis) risk" },
  ],
};

// ─────────────────────────────────────────────────────────────
// TOOLS
// ─────────────────────────────────────────────────────────────

function get_todays_schedule() {
  const today    = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const schedule  = [];

  for (const med of db.medications) {
    for (const time of med.times) {
      const scheduledKey = `${today} ${time}`;
      const logged = db.doseLog.find((l) => l.medId === med.id && l.scheduledTime.startsWith(today) && l.scheduledTime.includes(time));
      schedule.push({
        medicationId:   med.id,
        name:           med.name,
        dose:           med.dose,
        scheduledTime:  time,
        instructions:   med.instructions,
        status:         logged ? logged.status : "pending",
        takenAt:        logged?.takenAt || null,
        stockRemaining: med.stock,
        lowStock:       med.stock <= med.warnStockBelow,
      });
    }
  }

  schedule.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  return { date: today, day: dayOfWeek, patient: db.patient.name, schedule, totalDoses: schedule.length };
}

function log_dose_taken({ medicationId, takenAt }) {
  const med = db.medications.find((m) => m.id === medicationId);
  if (!med) return { error: `Medication ${medicationId} not found` };

  const now      = takenAt || new Date().toISOString().replace("T", " ").slice(0, 16);
  const today    = now.split(" ")[0];
  const nextTime = med.times.find((t) => {
    const scheduled = `${today} ${t}`;
    return !db.doseLog.find((l) => l.medId === medicationId && l.scheduledTime === scheduled && l.status === "taken");
  });

  if (!nextTime) return { error: "No pending dose found for today — already taken or no dose scheduled" };

  const entry = { medId: medicationId, scheduledTime: `${today} ${nextTime}`, takenAt: now, status: "taken" };
  db.doseLog.push(entry);
  med.stock = Math.max(0, med.stock - 1);

  return {
    success: true,
    medication: med.name,
    dose: med.dose,
    takenAt: now,
    stockRemaining: med.stock,
    lowStockAlert: med.stock <= med.warnStockBelow,
    refillDue: med.stock <= med.warnStockBelow ? med.refillDue : null,
  };
}

function get_adherence_report({ days = 7 }) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const recentLogs = db.doseLog.filter((l) => new Date(l.scheduledTime) >= cutoff);
  const total      = recentLogs.length;
  const taken      = recentLogs.filter((l) => l.status === "taken").length;
  const missed     = recentLogs.filter((l) => l.status === "missed").length;
  const adherence  = total > 0 ? Math.round((taken / total) * 100) : 0;

  // Per-medication stats
  const perMed = db.medications.map((med) => {
    const medLogs   = recentLogs.filter((l) => l.medId === med.id);
    const medTaken  = medLogs.filter((l) => l.status === "taken").length;
    const medTotal  = medLogs.length;
    const medMissed = medLogs.filter((l) => l.status === "missed");
    return {
      name:           med.name,
      dose:           med.dose,
      takenCount:     medTaken,
      totalScheduled: medTotal,
      adherenceRate:  medTotal > 0 ? `${Math.round((medTaken / medTotal) * 100)}%` : "N/A",
      missedDates:    medMissed.map((l) => l.scheduledTime),
    };
  });

  return {
    periodDays:          days,
    overallAdherence:    `${adherence}%`,
    grade:               adherence >= 90 ? "Excellent 🟢" : adherence >= 75 ? "Good 🟡" : "Needs Improvement 🔴",
    totalDosesScheduled: total,
    dosesTaken:          taken,
    dosesMissed:         missed,
    perMedication:       perMed,
    advice:              adherence < 80 ? "Adherence below target — consider setting phone alarms for each dose" : "Keep up the good work!",
  };
}

function check_interactions({ medicationNames }) {
  const allMeds = [...medicationNames, ...db.medications.map((m) => m.name)];
  const found   = [];

  for (const interaction of db.interactions) {
    const bothPresent = interaction.drugs.every((drug) =>
      allMeds.some((m) => m.toLowerCase().includes(drug.toLowerCase()))
    );
    if (bothPresent) found.push(interaction);
  }

  return {
    medicationsChecked: allMeds,
    interactionsFound:  found.length,
    critical:           found.filter((i) => i.severity === "high"),
    moderate:           found.filter((i) => i.severity === "medium"),
    safe:               found.length === 0,
    summary:            found.length === 0
      ? "No known dangerous interactions detected"
      : `⚠️ ${found.filter(i=>i.severity==="high").length} high-severity and ${found.filter(i=>i.severity==="medium").length} moderate interactions found`,
  };
}

function get_refill_alerts() {
  const today     = new Date().toISOString().split("T")[0];
  const urgent    = [];
  const upcoming  = [];

  for (const med of db.medications) {
    const daysLeft    = Math.floor(med.stock / med.times.length); // days of supply remaining
    const refillDate  = new Date(med.refillDue);
    const daysToRefill = Math.round((refillDate - new Date()) / (1000 * 60 * 60 * 24));

    const alert = {
      name:       med.name,
      stock:      med.stock,
      daysOfSupply: daysLeft,
      refillDue:  med.refillDue,
      daysUntilRefill: daysToRefill,
      prescribedBy: med.prescribedBy,
    };

    if (med.stock <= med.warnStockBelow || daysToRefill <= 3) urgent.push(alert);
    else if (daysToRefill <= 10) upcoming.push(alert);
  }

  return {
    urgent,
    upcoming,
    allClear: urgent.length === 0 && upcoming.length === 0,
    message:  urgent.length > 0
      ? `🚨 ${urgent.length} medication(s) need URGENT refill`
      : upcoming.length > 0
        ? `⚠️ ${upcoming.length} medication(s) need refill soon`
        : "✅ All medications are stocked",
  };
}

function get_patient_profile() {
  return {
    ...db.patient,
    medicationCount: db.medications.length,
    medications:     db.medications.map((m) => ({
      name:    m.name,
      dose:    m.dose,
      purpose: m.purpose,
      times:   m.times,
    })),
  };
}

function generate_doctor_report() {
  const adherence = get_adherence_report({ days: 30 });
  const refills   = get_refill_alerts();
  const today     = new Date().toLocaleDateString("en-US", { dateStyle: "long" });

  return {
    patient:    db.patient,
    reportDate: today,
    adherenceSummary: adherence,
    refillStatus: refills,
    currentMedications: db.medications.map((m) => ({
      name:    m.name,
      dose:    m.dose,
      times:   m.times.join(", "),
      purpose: m.purpose,
      stock:   m.stock,
    })),
    recentMissedDoses: db.doseLog
      .filter((l) => l.status === "missed")
      .slice(-10)
      .map((l) => {
        const med = db.medications.find((m) => m.id === l.medId);
        return { medication: med?.name, scheduledTime: l.scheduledTime };
      }),
  };
}

// ─────────────────────────────────────────────────────────────
// TOOL MAP + DECLARATIONS
// ─────────────────────────────────────────────────────────────
const TOOL_MAP = {
  get_todays_schedule,
  log_dose_taken,
  get_adherence_report,
  check_interactions,
  get_refill_alerts,
  get_patient_profile,
  generate_doctor_report,
};

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_todays_schedule",
        description: "Get today's complete medication schedule showing all doses with their times and current status (pending/taken/missed)",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "log_dose_taken",
        description: "Record that a patient has taken a specific medication dose right now",
        parameters: {
          type: "OBJECT",
          properties: {
            medicationId: { type: "STRING", description: "Medication ID like MED001" },
            takenAt:      { type: "STRING", description: "Time taken (YYYY-MM-DD HH:MM) — defaults to now if omitted" },
          },
          required: ["medicationId"],
        },
      },
      {
        name: "get_adherence_report",
        description: "Generate a medication adherence report for the past N days showing compliance rates per medication",
        parameters: {
          type: "OBJECT",
          properties: {
            days: { type: "NUMBER", description: "Number of past days to analyze (default 7)" },
          },
        },
      },
      {
        name: "check_interactions",
        description: "Check for dangerous drug interactions between current medications and any new substances (drugs, supplements, foods)",
        parameters: {
          type: "OBJECT",
          properties: {
            medicationNames: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "Names of additional drugs/substances to check against current medications (e.g. ['Ibuprofen', 'Grapefruit juice'])",
            },
          },
          required: ["medicationNames"],
        },
      },
      {
        name: "get_refill_alerts",
        description: "Check which medications are running low and need to be refilled soon",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_patient_profile",
        description: "Get the patient's full profile including medical conditions, allergies, and medication list",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "generate_doctor_report",
        description: "Generate a complete report for a doctor visit — adherence history, refill status, missed doses, current medications",
        parameters: { type: "OBJECT", properties: {} },
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// AGENT
// ─────────────────────────────────────────────────────────────
async function medicationAgent(request) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    tools: TOOLS,
    systemInstruction: `
You are a caring, professional medication management assistant for ${db.patient.name}, age ${db.patient.age}.

Patient context:
- Conditions: ${db.patient.conditions.join(", ")}
- Allergies: ${db.patient.allergies.join(", ")}
- Doctor: ${db.patient.doctor}

Your responsibilities:
1. Keep track of medication schedules and log doses when taken
2. Detect missed doses and remind gently but clearly
3. Flag dangerous drug interactions immediately — treat these as urgent
4. Alert when medications are running low before they run out
5. Produce clear reports for doctor visits
6. Explain side effects and instructions in simple language

Communication style:
- Warm, caring, and reassuring — like a knowledgeable family member
- Use simple language — no medical jargon unless explaining terms
- Be direct about serious issues (interactions, missed critical doses) without causing panic
- Address the patient by their first name
- For missed doses: never double-dose — explain what to do instead
- Always note when professional medical advice is needed

IMPORTANT: Never recommend changing, stopping, or skipping prescribed medications.
Always direct serious concerns to Dr. ${db.patient.doctor}.
`,
  });

  const chat = model.startChat();
  console.log(`\n${"─".repeat(60)}`);
  console.log(`💊 Request: ${request}`);
  console.log("─".repeat(60));

  let resp  = await chat.sendMessage(request);
  let steps = 0;

  while (steps++ < 15) {
    const parts = resp.response.candidates[0].content.parts;
    const calls = parts.filter((p) => p.functionCall);

    if (!calls.length) {
      console.log("\n🤖 Medication Assistant:\n");
      console.log(parts.map((p) => p.text || "").join("").trim());
      return;
    }

    const results = calls.map((p) => {
      const { name, args } = p.functionCall;
      console.log(`  ⚙️  ${name}(${JSON.stringify(args)})`);
      return { functionResponse: { name, response: TOOL_MAP[name](args) } };
    });

    resp = await chat.sendMessage(results);
  }
}

// ─────────────────────────────────────────────────────────────
// RUN — Test all major scenarios
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(60));
  console.log("💊 MEDICATION REMINDER & TRACKER AGENT");
  console.log(`   Patient: ${db.patient.name}, Age ${db.patient.age}`);
  console.log("═".repeat(60));

  // 1. Morning check-in
  await medicationAgent(
    "Good morning! What medications do I need to take today and when? And do I have any that I already missed?"
  );

  // 2. Log a dose
  await medicationAgent(
    "I just took my Metformin (MED001) now. Can you log that for me?"
  );

  // 3. Drug interaction check — CRITICAL scenario
  await medicationAgent(
    "My knee is hurting. Can I take Ibuprofen 400mg for the pain? I also had a glass of wine last night — is that a problem with any of my medications?"
  );

  // 4. Refill alerts
  await medicationAgent(
    "Which of my medications are running low and need to be refilled? I want to call the pharmacy today."
  );

  // 5. Weekly adherence review
  await medicationAgent(
    "How well have I been taking my medications this week? Be honest with me — I want to know if I'm missing doses and which ones."
  );

  // 6. Doctor visit report
  await medicationAgent(
    "I have a doctor's appointment with Dr. Sana tomorrow. Can you give me a full summary report of my medications, how well I've been taking them, and anything she should know?"
  );
}

main().catch(console.error);
