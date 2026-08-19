import express from "express";

const router = express.Router();

function normalizeTrendingResponse(payload) {
    const rows = Array.isArray(payload)
        ? payload
        : payload?.data ?? payload?.trending ?? payload?.stocks ?? [];

    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map(row => ({
            symbol: row.symbol ?? row.ticker ?? row.tradingSymbol ?? "",
            name: row.companyName ?? row.name ?? row.company ?? row.symbol ?? "",
            price: row.price ?? row.ltp ?? row.lastPrice ?? null,
            change: row.change ?? row.changeValue ?? null,
            changePercent: row.changePercent ?? row.pChange ?? row.percentChange ?? null,
        }))
        .filter(row => row.symbol || row.name)
        .slice(0, 20);
}

router.get("/trending", async (req, res) => {
    const apiKey = process.env.INDIAN_API_KEY;

    if (!apiKey) {
        return res.status(503).json({ error: "Market data is not configured." });
    }

    try {
        const response = await fetch("https://stock.indianapi.in/trending", {
            headers: { "x-api-key": apiKey },
        });

        if (!response.ok) {
            return res.status(502).json({ error: "Market data is temporarily unavailable." });
        }

        const payload = await response.json();
        return res.json({ stocks: normalizeTrendingResponse(payload) });
    } catch (error) {
        console.error("[MARKET] Trending request failed:", error.message);
        return res.status(502).json({ error: "Market data is temporarily unavailable." });
    }
});

export default router;