const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

// @desc    Register user
// @route   POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password, company, role } = req.body;
  if (!name || !email || !password) {
    res.status(400); throw new Error('Please fill all required fields');
  }
  const exists = await User.findOne({ email });
  if (exists) { res.status(400); throw new Error('User already exists'); }
  
  const user = await User.create({ name, email, password, company, role: role || 'recruiter' });
  res.status(201).json({
    success: true,
    data: { _id: user._id, name: user.name, email: user.email, role: user.role, company: user.company },
    token: generateToken(user._id)
  });
});

// @desc    Login user
// @route   POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user && await user.matchPassword(password)) {
    res.json({
      success: true,
      data: { _id: user._id, name: user.name, email: user.email, role: user.role, company: user.company },
      token: generateToken(user._id)
    });
  } else {
    res.status(401); throw new Error('Invalid email or password');
  }
});

// @desc    Get profile
// @route   GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  res.json({ success: true, data: user });
});

// @desc    Update profile
// @route   PUT /api/auth/me
const updateMe = asyncHandler(async (req, res) => {
  const { name, company } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name, company },
    { new: true, runValidators: true }
  ).select('-password');
  res.json({ success: true, data: user });
});

module.exports = { register, login, getMe, updateMe };
