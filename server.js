import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes
    from "./src/routes/authRoutes.js";

import documentRoutes
    from "./src/routes/documentRoutes.js";

import analyticsRoutes
    from "./src/routes/analyticsRoutes.js";

import marketRoutes
    from "./src/routes/marketRoutes.js";


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

app.use((req, res, next) => {
    console.log(
        "REQUEST:",
        req.method,
        req.originalUrl
    );

    next();
});
app.use(
    cors({
        origin: allowedOrigins,
        credentials: true
    })
);

app.use(express.json());

app.use(
    "/api/auth",
    authRoutes
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
    "/api/documents",
    documentRoutes
);


const PORT =
    process.env.PORT || 3000;


app.get("/health", (req, res) => {

    res.json({

        success: true,

        message:
            "Backend is running"

    });

});


app.listen(PORT, () => {

    console.log(
        `Backend running on port ${PORT}`
    );

});


