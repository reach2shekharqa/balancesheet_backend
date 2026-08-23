import express from "express";

import {
    extractFinancialAnalytics
} from "../services/financialAnalyticsService.js";
import { calculateKeyMetrics } from "../analytics/services/keyMetricsService.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getAccessibleDocument, hasCompanyAccess } from "../services/companyAccessService.js";


const router = express.Router();

const DEBUG_ANALYTICS_LOGGING = process.env.DEBUG_ANALYTICS !== "0";

function debugAnalyticsLog(...args) {
    if (!DEBUG_ANALYTICS_LOGGING) {
        return;
    }

    console.log("[ANALYTICS DEBUG]", ...args);
}

router.post(
    "/documents/:documentId/analytics",
    requireAuth,
    async (req, res) => {

        console.log(
            "[ANALYTICS ROUTE] POST received:",
            req.params.documentId,
            req.body?.analyticsType
        );

        try {

            const {
                documentId
            } = req.params;

            const {
                analyticsType
            } = req.body;

            const companyId = req.body?.companyId ?? null;

            debugAnalyticsLog("documentId:", documentId);
            debugAnalyticsLog("analyticsType:", analyticsType);

            if (!documentId) {

                return res.status(400).json({

                    success: false,

                    error:
                        "documentId is required."

                });

            }


            if (!analyticsType) {

                return res.status(400).json({

                    success: false,

                    error:
                        "analyticsType is required."

                });

            }

            if (companyId !== null && !(await hasCompanyAccess({ userId: req.user.userId, companyId }))) {
                return res.status(403).json({
                    success: false,
                    error: "You are not authorized to access this company."
                });
            }


            /*
             * Get the already-parsed Markdown
             * directly from PostgreSQL.
             */

            const document = await getAccessibleDocument({
                documentId,
                userId: req.user.userId,
                companyId
            });

            if (!document) {

                return res.status(403).json({

                    success: false,

                    error:
                        "You are not authorized to access this document."

                });

            }


            if (
                document.extraction_status !==
                "completed"
            ) {

                return res.status(409).json({

                    success: false,

                    error:
                        `Document is not ready. Current status: ${document.extraction_status}`

                });

            }


            const markdown =
                document
                    .extraction_payload
                    ?.markdown;


            if (
                !markdown ||
                typeof markdown !== "string"
            ) {

                return res.status(422).json({

                    success: false,

                    error:
                        "Document does not contain parsed Markdown."

                });

            }


            /*
             * Run the generic analytics engine.
             */

            const analytics =
                await extractFinancialAnalytics({

                    markdown,

                    analyticsType,

                    documentId

                });

            if (analyticsType === "profitLoss") {
                const relatedResults = await Promise.allSettled([
                    extractFinancialAnalytics({ markdown, analyticsType: "assetsBreakdown", documentId }),
                    extractFinancialAnalytics({ markdown, analyticsType: "liabilitiesBreakdown", documentId })
                ]);
                const assets = relatedResults[0].status === "fulfilled"
                    ? relatedResults[0].value
                    : null;
                const liabilities = relatedResults[1].status === "fulfilled"
                    ? relatedResults[1].value
                    : null;

                analytics.keyMetrics = calculateKeyMetrics({
                    profitLoss: analytics,
                    metrics: {
                        ...(analytics.metrics ?? {}),
                        ...(assets?.metrics ?? {}),
                        ...(liabilities?.metrics ?? {})
                    },
                    balanceSheet: {
                        analyticsType: "balanceSheet",
                        years: assets?.years ?? liabilities?.years ?? [],
                        periods: assets?.periods ?? liabilities?.periods ?? analytics.periods,
                        metrics: {
                            ...(assets?.metrics ?? {}),
                            ...(liabilities?.metrics ?? {})
                        }
                    }
                });
            }


            return res.json({

                success: true,

                documentId,

                ...analytics

            });

        } catch (error) {

            console.error(
                "Analytics extraction failed:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    error?.message ??
                    String(error)

            });

        }

    }
);


export default router;