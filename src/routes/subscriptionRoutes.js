import crypto from "crypto";
import express from "express";

import { activatePaidPlan } from "../services/planService.js";

const router = express.Router();

function isValidSignature(body, signature) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
    const actual = String(signature);
    return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

router.post("/checkout", (req, res) => {
    return res.status(503).json({
        success: false,
        error: "Payment checkout is not configured."
    });
});

router.post("/webhook", async (req, res) => {
    if (!isValidSignature(req.body, req.get("x-payment-signature"))) {
        return res.status(401).json({ success: false, error: "Invalid payment signature." });
    }

    const { type, userId, planCode, paymentProvider, paymentReference } = req.body ?? {};
    if (type !== "payment.succeeded" || !userId || !planCode || !paymentReference) {
        return res.status(400).json({ success: false, error: "Invalid payment event." });
    }

    try {
        await activatePaidPlan({ userId, planCode, paymentProvider, paymentReference });
        return res.json({ success: true });
    } catch (error) {
        console.error("Payment webhook failed:", error?.message ?? error);
        return res.status(500).json({ success: false, error: "Payment could not be applied." });
    }
});

export default router;