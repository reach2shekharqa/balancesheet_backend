import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes
    from "./src/routes/authRoutes.js";

import documentRoutes
    from "./src/routes/documentRoutes.js";

import analyticsRoutes
    from "./src/routes/analyticsRoutes.js";


dotenv.config();


const app = express();
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
        origin: ["http://localhost:5173", "https://balancesheet-frontend.onrender.com"],
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


