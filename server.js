import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import authRoutes from "./src/routes/authRoutes.js";
import documentRoutes from "./src/routes/documentRoutes.js";
import analyticsRoutes from "./src/routes/analyticsRoutes.js";
import marketRoutes from "./src/routes/marketRoutes.js";
import subscriptionRoutes from "./src/routes/subscriptionRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import { permanentlyDeleteExpiredUsers } from "./src/services/adminService.js";

dotenv.config();

const app = express();

const allowedOrigins = [
    "http://localhost:5173",
    "https://balancesheet-frontend.onrender.com",
    ...(process.env.FRONTEND_URL || "")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean),
];

/* =========================================================
   REQUEST DEBUG LOGGER
   ========================================================= */

app.use((req, res, next) => {
    const startedAt = Date.now();

    console.log("[REQUEST START]", {
        method: req.method,
        path: req.originalUrl,
        origin: req.get("origin") || null,
        hasCookie: !!req.get("cookie"),
        hasAuthorization: !!req.get("authorization"),
        userAgent: req.get("user-agent") || null,
    });

    res.on("finish", () => {
        console.log("[REQUEST END]", {
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            elapsedMs: Date.now() - startedAt,
        });
    });

    res.on("close", () => {
        console.log("[REQUEST CLOSE]", {
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            elapsedMs: Date.now() - startedAt,
        });
    });

    next();
});


/* =========================================================
   CORS
   ========================================================= */

app.use(
    cors({
        origin: allowedOrigins,
        credentials: true,
    })
);


/* =========================================================
   JSON BODY PARSER
   ========================================================= */

app.use(express.json());


/* =========================================================
   ROUTES
   ========================================================= */

app.use(
    "/api/auth",
    authRoutes
);

app.use(
    "/api/admin",
    adminRoutes
);

app.use(
    "/api",
    analyticsRoutes
);

app.use(
    "/api/market",
    marketRoutes
);

app.use(
    "/api/subscriptions",
    subscriptionRoutes
);

app.use(
    "/api/documents",
    documentRoutes
);


/* =========================================================
   SERVER
   ========================================================= */

const PORT =
    process.env.PORT || 3000;


/* =========================================================
   STARTUP DEBUG
   ========================================================= */

console.log("[SERVER] STARTING", {
    port: PORT,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
});


/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/health", (req, res) => {
    res.json({
        success: true,
        message: "Backend is running",
    });
});


/* =========================================================
   LISTEN
   ========================================================= */

app.listen(PORT, () => {
    console.log(
        `Backend running on port ${PORT}`
    );
});

const runRetentionCleanup = async () => {
    try {
        const deletedUsers = await permanentlyDeleteExpiredUsers();
        if (deletedUsers > 0) console.log(`[RETENTION] Permanently deleted ${deletedUsers} expired user(s).`);
    } catch (error) {
        console.error("[RETENTION] Cleanup failed:", error?.message ?? error);
    }
};

runRetentionCleanup();
setInterval(runRetentionCleanup, 60 * 60 * 1000);