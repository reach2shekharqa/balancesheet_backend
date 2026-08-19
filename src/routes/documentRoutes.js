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

const uploadWithDebug = (req, res, next) => {

    console.log(
        "[UPLOAD DEBUG] request received"
    );

    upload.single("file")(req, res, (error) => {

        if (error) {

            return next(error);

        }

        console.log(
            "[UPLOAD DEBUG] multer completed",
            {
                originalFilename: req.file?.originalname,
                fileSize: req.file?.size,
                temporaryFilePath: req.file?.path
            }
        );

        return next();

    });
};


router.post(
    "/upload",
    requireAuth,
    uploadWithDebug,
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

            console.log(
                "[UPLOAD DEBUG] sending upload response"
            );


            return res.json({

                success: true,

                ...result

            });

        } catch (error) {

            console.error(
                "[UPLOAD DEBUG] route error:",
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