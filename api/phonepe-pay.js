// api/phonepe-pay.js
import crypto from "crypto";

export default async function handler(req, res) {
  // Allow your static site to call this API
  res.setHeader("Access-Control-Allow-Origin", "https://joyrentals.store");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, phone, email, amount } = req.body || {};

    if (!phone || !amount) {
      return res.status(400).json({ error: "phone and amount are required" });
    }

    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX || "1";

    // UAT sandbox. Change to prod when live.
    const baseUrl =
      process.env.PHONEPE_BASE_URL ||
      "https://api-preprod.phonepe.com/apis/pg-sandbox";

    const payEndpoint = "/pg/v1/pay";
    const payUrl = baseUrl + payEndpoint;

    const amountInPaise = Math.round(Number(amount) * 100);
    const merchantTransactionId = "JR" + Date.now();

    const redirectUrl =
      `https://joyrentals.store/payment-status.html?txn=${merchantTransactionId}`;

    const callbackUrl =
      process.env.PHONEPE_CALLBACK_URL ||
      "https://your-vercel-project-name.vercel.app/api/phonepe-callback";

    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: phone.toString(),
      name: name || "Joy Rentals Customer",
      amount: amountInPaise,
      redirectUrl,
      redirectMode: "POST",
      callbackUrl,
      mobileNumber: phone.toString(),
      email,
      paymentInstrument: {
        type: "PAY_PAGE"
      }
    };

    const payloadJson = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadJson).toString("base64");

    const toSign = payloadBase64 + payEndpoint + saltKey;
    const sha256 = crypto.createHash("sha256").update(toSign).digest("hex");
    const xVerify = `${sha256}###${saltIndex}`;

    const response = await fetch(payUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": xVerify,
        "X-MERCHANT-ID": merchantId
      },
      body: JSON.stringify({ request: payloadBase64 })
    });

    const data = await response.json();

    if (
      data?.success &&
      data?.data?.instrumentResponse?.redirectInfo?.url
    ) {
      const redirectUrlFromPhonePe =
        data.data.instrumentResponse.redirectInfo.url;

      return res.status(200).json({
        ok: true,
        paymentUrl: redirectUrlFromPhonePe,
        merchantTransactionId
      });
    } else {
      console.error("PhonePe pay error:", data);
      return res.status(500).json({
        ok: false,
        error: "Failed to create PhonePe payment",
        details: data
      });
    }
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}
