const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const controller = require("../controllers/compare.controller");

const router = express.Router();

router.post("/", asyncHandler(controller.compare));

module.exports = router;
