const axios = require("axios");

exports.generateReport = async (req, res) => {
  try {
    console.log("Node report API hit");
    console.log(req.body);

    const response = await axios.post(
      "http://localhost:5203/api/RDLC/generate",
      req.body,
      {
        responseType: "arraybuffer"
      }
    );

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=AI_Resume_Report.pdf"
    );

    res.send(response.data);

  } catch (error) {
    console.log("Node Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Report generation failed"
    });
  }
};