import { Router } from "express";
import * as ctrl from "../controllers/authController";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "../schemas";

const router = Router();

router.post("/signup",          validate(signupSchema), ctrl.signup);
router.post("/login",           validate(loginSchema), ctrl.login);
router.post("/refresh",         ctrl.refresh);
router.post("/logout",          ctrl.logout);
router.post("/logout-all",      authenticate, ctrl.logoutAll);
router.post("/forgot-password", validate(forgotPasswordSchema), ctrl.forgotPassword);
router.post("/reset-password",  validate(resetPasswordSchema), ctrl.resetPassword);
router.get("/verify-reset-token/:token", ctrl.verifyResetToken);
router.get("/me",               authenticate, ctrl.me);

// Profile management
router.get("/profile",          authenticate, ctrl.getProfile);
router.patch("/profile",        authenticate, ctrl.updateProfile);
router.get("/sessions",         authenticate, ctrl.getSessions);

export default router;
