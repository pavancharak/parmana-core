import { Router } from "express";
import { API_BUILD_VERSION, API_NAME, API_VERSION } from "../apiVersionInfo.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    name: API_NAME,
    version: API_BUILD_VERSION,
    api: API_VERSION,
  });
});

export default router;
