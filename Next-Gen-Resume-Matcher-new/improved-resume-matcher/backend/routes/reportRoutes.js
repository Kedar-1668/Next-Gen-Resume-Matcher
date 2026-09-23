const express = require("express");
const router = express.Router();

const {
  generateReport
} = require("../controllers/reportController");

router.post("/generate-report", generateReport);

module.exports = router;