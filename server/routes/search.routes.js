const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const controller = require("../controllers/search.controller");

const router = express.Router();

// The catalog service validates the term, because an empty
// search is valid here and lists what Knowly already tracks.
router.get("/", asyncHandler(controller.search));

module.exports = router;
