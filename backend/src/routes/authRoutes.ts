import { Router } from "express";
import * as ctrl from "../controllers/authController";
import { authenticate } from "../middleware/authenticate";

const router = Router();

router.post("/signup",  ctrl.signup);
router.post("/login",   ctrl.login);
router.post("/refresh", ctrl.refresh);
router.post("/logout",  ctrl.logout);
router.get("/me",       authenticate, ctrl.me);

export default router;
