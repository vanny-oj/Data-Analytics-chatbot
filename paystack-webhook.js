// /api/paystack-webhook.js
// Paystack calls this URL automatically when a payment completes.
// We verify the signature so no one can fake a "payment successful" request.

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false, // we need the raw body to verify the signature
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const rawBody = await getRawBody(req);

  // Verify this request genuinely came from Paystack
  const signature = req.headers["x-paystack-signature"];
  const expectedSignature = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.error("Invalid Paystack webhook signature");
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(rawBody);

  if (event.event === "charge.success") {
    const { reference, metadata } = event.data;
    const userId = metadata?.user_id;
    const credits = metadata?.credits;

    if (!userId || !credits) {
      console.error("Webhook missing metadata");
      return res.status(200).send("ok"); // acknowledge anyway so Paystack stops retrying
    }

    // Check this payment hasn't already been processed
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("status")
      .eq("paystack_reference", reference)
      .single();

    if (payment?.status === "completed") {
      return res.status(200).send("already processed");
    }

    // Mark payment completed
    await supabaseAdmin
      .from("payments")
      .update({ status: "completed" })
      .eq("paystack_reference", reference);

    // Add credits to the user's balance
    const { data: creditRow } = await supabaseAdmin
      .from("user_credits")
      .select("credits_remaining")
      .eq("id", userId)
      .single();

    const newBalance = (creditRow?.credits_remaining || 0) + credits;

    await supabaseAdmin
      .from("user_credits")
      .update({ credits_remaining: newBalance, updated_at: new Date().toISOString() })
      .eq("id", userId);
  }

  return res.status(200).send("ok");
}
