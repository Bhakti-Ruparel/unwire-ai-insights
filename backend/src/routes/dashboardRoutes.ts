import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { getDashboardSummary } from "../controllers/dashboardController";

const router = Router();

router.get("/summary", authenticate, getDashboardSummary);

export default router;
