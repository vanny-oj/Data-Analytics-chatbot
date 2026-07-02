// /api/chat.js
// Checks the user has credits, calls Claude, deducts one credit on success.

import { createClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are "Query", a friendly but precise data analytics tutor chatbot embedded on a personal brand site for someone transitioning from lab science into data analytics.
Rules:
- Only answer questions related to data analytics, statistics, SQL, Excel, Power BI, Tableau, Python for data analysis, data visualization, and adjacent career topics.
- If asked something unrelated, politely redirect back to data analytics topics.
- Keep answers clear, beginner-friendly but accurate, using short paragraphs or brief lists.
- Use concrete small examples when helpful (e.g. a tiny SQL snippet, a one-line formula).
- Keep responses concise — aim for 80-160 words unless the user asks for depth.`;

// Service role key bypasses RLS — only ever used server-side, never sent to the browser.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
  }

  const { messages, accessToken } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }
  if (!accessToken) {
    return res.status(401).json({ error: "Not signed in" });
  }

  // Verify the user's session token and get their user id
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Invalid session" });
  }
  const userId = userData.user.id;

  // Check credit balance
  const { data: creditRow, error: creditError } = await supabaseAdmin
    .from("user_credits")
    .select("credits_remaining")
    .eq("id", userId)
    .single();

  if (creditError || !creditRow) {
    return res.status(500).json({ error: "Could not check credit balance" });
  }

  if (creditRow.credits_remaining <= 0) {
    return res.status(402).json({ error: "out_of_credits" });
  }

  // Call Claude
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return res.status(response.status).json({ error: "Upstream API error" });
    }

    const data = await response.json();
    const textBlock = data?.content?.find((c) => c.type === "text");
    const reply = textBlock?.text || "";

    // Deduct one credit only after a successful response
    const { data: updated, error: deductError } = await supabaseAdmin
      .from("user_credits")
      .update({ credits_remaining: creditRow.credits_remaining - 1, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("credits_remaining")
      .single();

    if (deductError) {
      console.error("Failed to deduct credit:", deductError);
    }

    return res.status(200).json({
      reply,
      creditsRemaining: updated?.credits_remaining ?? creditRow.credits_remaining - 1,
    });
  } catch (err) {
    console.error("Chat handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
