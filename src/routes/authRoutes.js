import express from "express";

import {
    authenticateUser,
    authenticateGoogleUser,
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
    const token = createAuthToken(user);
    const options = getAuthCookieOptions();

    console.log("[COOKIE DEBUG] creating auth cookie", {
        cookieName: AUTH_COOKIE_NAME,
        options
    });

    res.cookie(
        AUTH_COOKIE_NAME,
        token,
        options
    );
}

router.post("/register", async (req, res) => {
    const { userName, email, password, companyName, cin, pan, registrationIntent = "owner" } = req.body ?? {};
    const validationError = validateRegistrationInput({ userName, email, password, companyName, cin, pan, registrationIntent });

    if (validationError) {
        return res.status(400).json({ success: false, error: validationError });
    }

    try {
        const user = await registerUser({ userName, email: normalizeEmail(email), password, companyName, cin, pan, registrationIntent });
        setAuthCookie(res, user);
        return res.status(201).json({ success: true, user: await toPublicUser(user) });
    } catch (error) {
        if (error?.code === "COMPANY_DETAILS_CONFLICT") {
            return res.status(409).json({ success: false, error: error.message });
        }

        if (error?.code === "23505") {
            return res.status(409).json({ success: false, error: "An account with that email already exists." });
        }

        console.error("Registration failed:", error?.message ?? error);
        return res.status(500).json({ success: false, error: error?.message ?? String(error), code: error?.code });
    }
});

router.post("/login", async (req, res) => {
    const { email, identifier, password } = req.body ?? {};
    const loginIdentifier = identifier ?? email;
    if (!loginIdentifier || typeof password !== "string") {
        return res.status(400).json({ success: false, error: "Email or username and password are required." });
    }

    try {
        const user = await authenticateUser({ identifier: loginIdentifier, password });
        if (!user) {
            return res.status(401).json({ success: false, error: "Invalid email or password." });
        }

        const token = createAuthToken(user);

        setAuthCookie(res, user);

        return res.json({
            success: true,
            user: await toPublicUser(user),
            token
        });
    } catch (error) {
        console.error("Login failed:", error?.message ?? error);
        return res.status(500).json({ success: false, error: "Login failed." });
    }
});

router.post("/google", async (req, res) => {
    const { credential } = req.body ?? {};
    if (!credential || typeof credential !== "string") {
        return res.status(400).json({ success: false, error: "Google sign-in credential is required." });
    }

    try {
        const user = await authenticateGoogleUser(credential);
        if (!user) {
            return res.status(401).json({ success: false, error: "This account is not active." });
        }
        const token = createAuthToken(user);
        setAuthCookie(res, user);
        return res.json({
            success: true,
            user: await toPublicUser(user),
            token
        });
    } catch (error) {
        const status = error?.code === "GOOGLE_TOKEN_INVALID" ? 401 : 500;
        console.error("Google login failed:", error?.message ?? error);
        return res.status(status).json({ success: false, error: error?.message ?? "Google login failed." });
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

