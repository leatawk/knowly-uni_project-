const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const controller = require("../controllers/tracking.controller");

const router = express.Router();

router.post(
  "/lebtech",
  asyncHandler(controller.trackElectronics)
);

module.exports = router;
