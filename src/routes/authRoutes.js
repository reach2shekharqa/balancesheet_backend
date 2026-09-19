import express from "express";

import {
    authenticateUser,
    authenticateGoogleUser,
    createAuthToken,
    getAuthCookieOptions,
    getCompanyProfileForUser,
    normalizeEmail,
    registerUser,
    toPublicUser,
    updateUserEmail,
    upsertCompanyProfile,
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

    return token;
}

router.post("/register", async (req, res) => {
    const { userName, email, password, companyName, cin, pan, registrationIntent = "owner" } = req.body ?? {};
    const validationError = validateRegistrationInput({ userName, email, password, companyName, cin, pan, registrationIntent });

    if (validationError) {
        return res.status(400).json({ success: false, error: validationError });
    }

    try {
        const user = await registerUser({ userName, email: normalizeEmail(email), password, companyName, cin, pan, registrationIntent });
        const token = setAuthCookie(res, user);
        return res.status(201).json({ success: true, user: await toPublicUser(user), token });
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

        const token = setAuthCookie(res, user);

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
        const token = setAuthCookie(res, user);
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

router.get("/profile", requireAuth, async (req, res) => {
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    if (!companyId) {
        return res.status(400).json({ success: false, error: "A companyId is required." });
    }

    try {
        const profile = await getCompanyProfileForUser({ userId: req.user.userId, companyId });
        return res.json({ success: true, profile });
    } catch (error) {
        console.error("Load company profile failed:", error?.message ?? error);
        return res.status(500).json({ success: false, error: error?.message ?? "Unable to load company profile." });
    }
});

router.put("/profile", requireAuth, async (req, res) => {
    const { companyId, companyName, constitution, kyc, kycValue, email, contactNumber, state, city, businessType, productType } = req.body ?? {};

    if (!companyId) {
        return res.status(400).json({ success: false, error: "A companyId is required." });
    }

    try {
        const nextEmail = normalizeEmail(email ?? req.user.email);
        const profile = await upsertCompanyProfile({
            userId: req.user.userId,
            companyId: Number(companyId),
            profile: {
                companyName,
                constitution,
                kyc,
                kycValue,
                email: nextEmail,
                contactNumber,
                state,
                city,
                businessType,
                productType,
            },
        });

        const currentEmail = normalizeEmail(req.user.email);
        if (nextEmail && nextEmail !== currentEmail) {
            const updatedUser = await updateUserEmail({ userId: req.user.userId, email: nextEmail });
            if (!updatedUser) {
                return res.status(400).json({ success: false, error: "Unable to update your email address." });
            }

            return res.json({
                success: true,
                profile,
                user: await toPublicUser(updatedUser),
            });
        }

        return res.json({
            success: true,
            profile,
            user: await toPublicUser({
                user_id: req.user.userId,
                user_name: req.user.userName,
                email: nextEmail,
                role: req.user.role,
            }),
        });
    } catch (error) {
        if (error?.code === "23505") {
            return res.status(409).json({ success: false, error: "This email is already in use." });
        }

        console.error("Save company profile failed:", error?.message ?? error);
        return res.status(500).json({ success: false, error: error?.message ?? "Unable to save company profile." });
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

