const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Set this once with:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
// The key lives only here, server-side — it's never sent to the browser.
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const TYPE_LABELS = {
  vocab: "single vocabulary word",
  phrase: "short phrase",
  sentence: "full sentence",
  conjugation: "verb conjugation form",
};

exports.suggestContent = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const uid = request.auth.uid;
    const masterProfileId = `${uid}_master`;
    const masterSnap = await db.collection("profiles").doc(masterProfileId).get();
    if (!masterSnap.exists) {
      throw new HttpsError("permission-denied", "Only a master account can request suggestions.");
    }

    const {
      focusType = "any",       // 'vocab' | 'phrase' | 'sentence' | 'conjugation' | 'any'
      notes = "",               // free-text steer from the master, e.g. "restaurant vocabulary"
      count = 8,
      studentProfileId = null,  // optional — tailor to a specific managed student
    } = request.data || {};

    const safeCount = Math.max(1, Math.min(20, Number(count) || 8));

    // Pull existing content so we don't suggest duplicates, and so the
    // model has a sense of what's already been covered.
    const contentSnap = await db.collection("content").limit(400).get();
    const existingByType = { vocab: [], phrase: [], sentence: [], conjugation: [] };
    const existingItalianLower = new Set();
    contentSnap.forEach((d) => {
      const c = d.data();
      if (c.italian) existingItalianLower.add(c.italian.trim().toLowerCase());
      if (existingByType[c.type]) existingByType[c.type].push(c.italian);
    });

    // Optional: light signal about the student's progress/level.
    let studentContext = "No specific student context provided — suggest broadly useful beginner-to-intermediate content.";
    if (studentProfileId) {
      const master = masterSnap.data();
      if ((master.managedStudentIds || []).includes(studentProfileId)) {
        const studentSnap = await db.collection("profiles").doc(studentProfileId).get();
        if (studentSnap.exists) {
          const s = studentSnap.data();
          const pointsLogSnap = await db
            .collection("profiles").doc(studentProfileId)
            .collection("pointsLog")
            .orderBy("createdAt", "desc")
            .limit(15)
            .get();
          const recentActivity = pointsLogSnap.size;
          studentContext = `The student "${s.displayName || "the student"}" has earned ${s.totalPoints || 0} total points so far` +
            (recentActivity ? `, with ${recentActivity} recent scored activities.` : ", and hasn't logged much activity yet — keep suggestions approachable.") +
            ` Calibrate difficulty to that level (low points ≈ beginner, higher points ≈ more advanced).`;
        }
      }
    }

    const existingSample = Object.entries(existingByType)
      .map(([type, words]) => `${type}: ${words.slice(0, 60).join(", ") || "(none yet)"}`)
      .join("\n");

    const typeInstruction = focusType && focusType !== "any"
      ? `Focus specifically on ${TYPE_LABELS[focusType] || focusType} entries — every suggestion's "type" field must be "${focusType}".`
      : `Mix reasonable types (vocab, phrase, sentence, conjugation) as fits the topic.`;

    const notesInstruction = notes && notes.trim()
      ? `The master specifically asked for: "${notes.trim()}". Prioritize that theme.`
      : `No specific theme requested — suggest broadly useful, practical everyday Italian.`;

    const systemPrompt = `You are helping a private Italian-language tutor (teaching one student, for the purpose of Italian citizenship/heritage language learning) build out their lesson content library. Respond with ONLY a JSON array, no other text, no markdown code fences. Each element must be an object with exactly these keys: "type" (one of "vocab", "phrase", "sentence", "conjugation"), "italian" (the Italian word/phrase/sentence), "english" (the English translation; if there are natural alternate translations, separate them with " / "), and "hint" (a short usage note or memory aid, or null if not useful). Do not suggest anything already in the existing content list provided. Keep Italian natural and commonly used, not textbook-stiff.`;

    const userPrompt = `${notesInstruction}
${typeInstruction}
${studentContext}

Existing content already in the library (do not repeat these):
${existingSample}

Suggest exactly ${safeCount} new entries as a JSON array.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY.value(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      throw new HttpsError("internal", "The suggestion request failed. Try again in a moment.");
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      throw new HttpsError("internal", "No suggestions were returned.");
    }

    let suggestions;
    try {
      const cleaned = textBlock.text.trim().replace(/^```json\s*|```$/g, "");
      suggestions = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse suggestions JSON:", textBlock.text);
      throw new HttpsError("internal", "Couldn't parse the suggestions. Try again.");
    }

    // Filter out anything that slipped through as a duplicate, and any
    // malformed entries.
    const filtered = (Array.isArray(suggestions) ? suggestions : [])
      .filter((s) => s && s.italian && s.english && TYPE_LABELS[s.type])
      .filter((s) => !existingItalianLower.has(String(s.italian).trim().toLowerCase()));

    return { suggestions: filtered.slice(0, safeCount) };
  }
);
