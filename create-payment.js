// /api/create-payment.js
// Initializes a Paystack transaction for a credit pack purchase.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Credit packs — edit prices/amounts here any time.
const CREDIT_PACKS = {
  small: { credits: 20, amountKobo: 50000 },   // ₦500 for 20 questions
  medium: { credits: 50, amountKobo: 100000 }, // ₦1000 for 50 questions
  large: { credits: 120, amountKobo: 200000 }, // ₦2000 for 120 questions
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { accessToken, packId } = req.body || {};
  const pack = CREDIT_PACKS[packId];

  if (!accessToken) return res.status(401).json({ error: "Not signed in" });
  if (!pack) return res.status(400).json({ error: "Invalid pack selected" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Invalid session" });
  }
  const user = userData.user;

  try {
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: pack.amountKobo,
        callback_url: `${process.env.SITE_URL}/payment-callback`,
        metadata: {
          user_id: user.id,
          pack_id: packId,
          credits: pack.credits,
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      console.error("Paystack init error:", paystackData);
      return res.status(500).json({ error: "Could not start payment" });
    }

    // Log as pending so the webhook has a record to match against
    await supabaseAdmin.from("payments").insert({
      user_id: user.id,
      paystack_reference: paystackData.data.reference,
      amount_kobo: pack.amountKobo,
      credits_purchased: pack.credits,
      status: "pending",
    });

    return res.status(200).json({ authorizationUrl: paystackData.data.authorization_url });
  } catch (err) {
    console.error("create-payment error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
