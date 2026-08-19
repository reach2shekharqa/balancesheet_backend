import express from "express";
import multer from "multer";

import {
    processDocumentUpload
} from "../services/documentUploadService.js";
import { requireAuth } from "../middleware/authMiddleware.js";


const router = express.Router();


const upload = multer({
    dest: "uploads/"
});


router.post(
    "/upload",
    requireAuth,
    upload.single("file"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error: "PDF file is required."
                });

            }


            const userId = req.user.userId;


            const result =
                await processDocumentUpload({

                    file: req.file,

                    userId

                });


            return res.json({

                success: true,

                ...result

            });

        } catch (error) {

            console.error(
                "Document upload failed:",
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