const asyncHandler = require("express-async-handler");
const path = require("path");
const fs = require("fs");
const Resume = require("../models/Resume");
const Match = require("../models/Match"); // ADD THIS
const { extractSkillsFromText } = require("../utils/nlpUtils");

// Extract text from PDF
async function extractTextFromPDF(filePath) {
  try {
    const pdfParse = require("pdf-parse");
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (err) {
    console.error("PDF parse error:", err.message);
    return "";
  }
}

// Extract text from DOCX
async function extractTextFromDOCX(filePath) {
  try {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (err) {
    console.error("DOCX parse error:", err.message);
    return "";
  }
}

// Parse raw text into structured resume fields
function parseResumeText(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Extract email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  const email = emailMatch ? emailMatch[0] : "";

  // Extract phone
  const phoneMatch = text.match(/(\+?\d[\d\s\-().]{8,15})/);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";

  // Extract candidate name
  const candidateName = lines[0] || "";

  // Extract skills
  const skills = extractSkillsFromText(text);

  // ---------------- EDUCATION EXTRACTION ----------------
  const education = [];

  const educationRegex =
    /(b\.tech|bachelor of technology|bachelor of engineering|computer science|cgpa[:\s]*[\d.]+)/gi;

  const educationMatches = text.match(educationRegex);

  if (educationMatches) {
    education.push({
      degree: "B.Tech",
      details: educationMatches.join(" "),
    });
  }

  // ---------------- EXPERIENCE EXTRACTION ----------------

  const experience = [];

  // Normalize PDF text
  const cleanedText = text
    .replace(/[—–]/g, "-")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Search entire resume instead of section only
  const roleRegex =
    /(python developer intern|azure cloud intern|react native intern|data science intern|machine learning intern|python programming.*?intern|software engineer.*?intern|developer.*?intern|intern)/gi;

  let match;

  while ((match = roleRegex.exec(cleanedText)) !== null) {
    experience.push({
      role: match[0].trim(),
      company: "",
      position: "",
      details: cleanedText.substring(
        Math.max(0, match.index),
        Math.min(cleanedText.length, match.index + 300),
      ),
    });
  }

  return {
    candidateName,
    email,
    phone,
    skills,
    rawText: text,
    education,
    experience,
  };
}

// @desc    Upload and parse resume(s)
// @route   POST /api/resumes/upload
const uploadResumes = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error("Please upload at least one resume file");
  }

  const savedResumes = [];

  for (const file of req.files) {
    let rawText = "";
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext === ".pdf") rawText = await extractTextFromPDF(file.path);
    else if (ext === ".docx" || ext === ".doc")
      rawText = await extractTextFromDOCX(file.path);
    else if (ext === ".txt") rawText = fs.readFileSync(file.path, "utf-8");

    const parsed = parseResumeText(rawText);

    const resume = await Resume.create({
      ...parsed,
      fileName: file.originalname,
      filePath: file.path,
      fileType: ext.replace(".", ""),
      source: "upload",
      uploadedBy: req.user?._id,
    });

    savedResumes.push(resume);
  }

  res
    .status(201)
    .json({ success: true, count: savedResumes.length, data: savedResumes });
});

// @desc    Create resume from manual form input
// @route   POST /api/resumes/manual
const createManualResume = asyncHandler(async (req, res) => {
  const resume = await Resume.create({
    ...req.body,
    source: "manual",
    uploadedBy: req.user?._id,
  });
  res.status(201).json({ success: true, data: resume });
});

// @desc    Get all resumes
// @route   GET /api/resumes
const getResumes = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.source) filter.source = req.query.source;
  if (req.query.search) {
    filter.$or = [
      { candidateName: { $regex: req.query.search, $options: "i" } },
      { skills: { $in: [new RegExp(req.query.search, "i")] } },
    ];
  }

  const total = await Resume.countDocuments(filter);
  const resumes = await Resume.find(filter)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: resumes,
  });
});

// @desc    Get single resume
// @route   GET /api/resumes/:id
const getResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findById(req.params.id);
  if (!resume) {
    res.status(404);
    throw new Error("Resume not found");
  }
  res.json({ success: true, data: resume });
});

// @desc    Delete resume
// @route   DELETE /api/resumes/:id
const deleteResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findById(req.params.id);

  if (!resume) {
    res.status(404);
    throw new Error("Resume not found");
  }

  // Delete uploaded file from storage
  if (resume.filePath && fs.existsSync(resume.filePath)) {
    fs.unlinkSync(resume.filePath);
  }

  // Delete all matches related to this resume
  await Match.deleteMany({
    resume: resume._id,
  });

  // Delete resume document
  await resume.deleteOne();

  res.json({
    success: true,
    message: "Resume and related matches deleted successfully",
  });
});

module.exports = {
  uploadResumes,
  createManualResume,
  getResumes,
  getResume,
  deleteResume,
};
