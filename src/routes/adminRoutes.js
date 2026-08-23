import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";
import { pool } from "../db/db.js";
import { addCompanyAccess, changeCompanyAccessRole, changeRole, clearAuditLogs, clearUserData, createUser, deleteCompanies, deleteDocument, getDashboard, getUser, listAdminCompanies, listCompanies, listDocuments, listUserCompanies, listUsers, parseNonNegativeInteger, permanentlyDeleteUser, permanentlyDeleteUsers, removeCompanyAccess, softDeleteUser, updateUser } from "../services/adminService.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);
const sendError = (res, error) => {
    const message = error?.message || "Request failed";
    const status = message === "User not found" || message === "Document not found" ? 404 : message.startsWith("Invalid") || message.includes("required") ? 400 : 409;
    return res.status(status).json({ error: message });
};

router.get("/dashboard", async (req, res) => { try { return res.json(await getDashboard()); } catch (error) { return sendError(res, error); } });
router.get("/users", async (req, res) => { try { return res.json({ users: await listUsers(req.query) }); } catch (error) { return sendError(res, error); } });
router.post("/users", async (req, res) => { try { return res.status(201).json({ user: await createUser({ actorId: req.user.userId, userName: req.body?.userName, email: req.body?.email, password: req.body?.password }) }); } catch (error) { return sendError(res, error); } });
router.get("/users/:userId", async (req, res) => { try { const user = await getUser(req.params.userId); return user ? res.json({ user }) : res.status(404).json({ error: "User not found" }); } catch (error) { return sendError(res, error); } });
router.get("/users/:userId/companies", async (req, res) => { try { return res.json({ companies: await listUserCompanies(req.params.userId) }); } catch (error) { return sendError(res, error); } });
router.post("/users/:userId/companies", async (req, res) => { try { return res.status(201).json({ membership: await addCompanyAccess({ actorId: req.user.userId, userId: req.params.userId, companyId: req.body?.companyId, accessRole: req.body?.accessRole }) }); } catch (error) { return sendError(res, error); } });
router.patch("/users/:userId/companies/:companyId", async (req, res) => { try { return res.json({ membership: await changeCompanyAccessRole({ actorId: req.user.userId, userId: req.params.userId, companyId: req.params.companyId, accessRole: req.body?.accessRole }) }); } catch (error) { return sendError(res, error); } });
router.delete("/users/:userId/companies/:companyId", async (req, res) => { try { await removeCompanyAccess({ actorId: req.user.userId, userId: req.params.userId, companyId: req.params.companyId }); return res.json({ success: true }); } catch (error) { return sendError(res, error); } });
router.get("/companies", async (req, res) => { try { return res.json({ companies: await listCompanies() }); } catch (error) { return sendError(res, error); } });
router.get("/companies/manage", async (req, res) => { try { return res.json({ companies: await listAdminCompanies() }); } catch (error) { return sendError(res, error); } });
router.delete("/companies", async (req, res) => { try { return res.json({ success: true, deleted: await deleteCompanies({ actorId: req.user.userId, companyIds: req.body?.companyIds }) }); } catch (error) { return sendError(res, error); } });
router.get("/users/:userId/documents", async (req, res) => { try { return res.json({ documents: (await getUser(req.params.userId))?.documents ?? [] }); } catch (error) { return sendError(res, error); } });
router.patch("/users/:userId/role", async (req, res) => { try { return res.json({ user: await changeRole({ actorId: req.user.userId, userId: req.params.userId, role: req.body?.role }) }); } catch (error) { return sendError(res, error); } });
router.patch("/users/:userId/status", async (req, res) => { try { if (typeof req.body?.isActive !== "boolean") throw new Error("Invalid active status"); return res.json({ user: await updateUser({ actorId: req.user.userId, userId: req.params.userId, field: "is_active", value: req.body.isActive, action: req.body.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED" }) }); } catch (error) { return sendError(res, error); } });
router.patch("/users/:userId/quota", async (req, res) => { try { return res.json({ user: await updateUser({ actorId: req.user.userId, userId: req.params.userId, field: "upload_quota", value: parseNonNegativeInteger(req.body?.uploadLimit, "upload limit"), action: "USER_QUOTA_CHANGED" }) }); } catch (error) { return sendError(res, error); } });
router.patch("/users/:userId/storage", async (req, res) => { try { return res.json({ user: await updateUser({ actorId: req.user.userId, userId: req.params.userId, field: "storage_limit_mb", value: parseNonNegativeInteger(req.body?.storageLimitMb, "storage limit"), action: "USER_STORAGE_LIMIT_CHANGED" }) }); } catch (error) { return sendError(res, error); } });
router.delete("/users/:userId/data", async (req, res) => { try { return res.json({ success: true, deleted: await clearUserData({ actorId: req.user.userId, userId: req.params.userId }) }); } catch (error) { return sendError(res, error); } });
router.delete("/users/:userId/permanent", async (req, res) => { try { if (req.body?.confirmation !== req.params.userId) throw new Error("Type the user ID to confirm permanent deletion"); return res.json({ success: true, deleted: await permanentlyDeleteUser({ actorId: req.user.userId, userId: req.params.userId }) }); } catch (error) { return sendError(res, error); } });
router.delete("/users/permanent", async (req, res) => { try { if (req.body?.confirmation !== "PERMANENTLY DELETE") throw new Error("Type PERMANENTLY DELETE to confirm permanent deletion"); return res.json({ success: true, deleted: await permanentlyDeleteUsers({ actorId: req.user.userId, userIds: req.body?.userIds }) }); } catch (error) { return sendError(res, error); } });
router.delete("/users/:userId", async (req, res) => { try { await softDeleteUser({ actorId: req.user.userId, userId: req.params.userId, reason: req.body?.reason }); return res.json({ success: true }); } catch (error) { return sendError(res, error); } });
router.get("/documents", async (req, res) => { try { return res.json({ documents: await listDocuments(req.query) }); } catch (error) { return sendError(res, error); } });
router.delete("/documents/:documentId", async (req, res) => { try { await deleteDocument({ actorId: req.user.userId, documentId: req.params.documentId }); return res.json({ success: true }); } catch (error) { return sendError(res, error); } });
router.delete("/audit-logs", async (req, res) => { try { return res.json({ success: true, cleared: await clearAuditLogs({ actorId: req.user.userId }) }); } catch (error) { return sendError(res, error); } });
router.get("/audit-logs", async (req, res) => { try { const result = await pool.query(`SELECT a.id, a.action, a.target_type AS "targetType", a.target_id AS "targetId", a.changes, a.created_at AS "createdAt", u.user_name AS "actorName", u.email AS "actorEmail" FROM audit_logs a LEFT JOIN users u ON u.user_id = a.admin_id ORDER BY a.created_at DESC LIMIT 200`); return res.json({ logs: result.rows }); } catch (error) { return sendError(res, error); } });

export default router;