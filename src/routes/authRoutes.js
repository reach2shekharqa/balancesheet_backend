import express from "express";

import {
    authenticateUser,
    createAuthToken,
    getAuthCookieOptions,
    normalizeEmail,
    registerUser,
    toPublicUser,
    validateRegistrationInput,
    AUTH_COOKIE_NAME,
} from "../services/authService.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

function setAuthCookie(res, user) {
    res.cookie(AUTH_COOKIE_NAME, createAuthToken(user), getAuthCookieOptions());
}

router.post("/register", async (req, res) => {
    const { userName, email, password } = req.body ?? {};
    const validationError = validateRegistrationInput({ userName, email, password });

    if (validationError) {
        return res.status(400).json({ success: false, error: validationError });
    }

    try {
        const user = await registerUser({ userName, email: normalizeEmail(email), password });
        setAuthCookie(res, user);
        return res.status(201).json({ success: true, user: toPublicUser(user) });
    } catch (error) {
        if (error?.code === "23505") {
            return res.status(409).json({ success: false, error: "An account with that email already exists." });
        }

        console.error("Registration failed:", error?.message ?? error);
        return res.status(500).json({ success: false, error: error?.message ?? String(error), code: error?.code });
    }
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || typeof password !== "string") {
        return res.status(400).json({ success: false, error: "Email and password are required." });
    }

    try {
        const user = await authenticateUser({ email, password });
        if (!user) {
            return res.status(401).json({ success: false, error: "Invalid email or password." });
        }

        setAuthCookie(res, user);
        return res.json({ success: true, user: toPublicUser(user) });
    } catch (error) {
        console.error("Login failed:", error?.message ?? error);
        return res.status(500).json({ success: false, error: "Login failed." });
    }
});

router.get("/me", requireAuth, (req, res) => {
    res.json({ success: true, user: req.user });
});

router.post("/logout", (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
    res.json({ success: true });
});

export default router;

