const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const auth = require("../services/auth");
const controller = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register", asyncHandler(controller.register));
router.post("/login", asyncHandler(controller.login));
router.post("/logout", controller.logout);

// Protected: needs a valid token.
router.get(
  "/me",
  auth.requireUser,
  controller.currentUser
);

module.exports = router;
