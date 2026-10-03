const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const User = require("../models/user");
const Patient = require("../models/patient");
const Doctor = require("../models/doctor");

const {
    sendPasswordResetEmail
} = require("../utils/mailer");

// ============================================================
// FORGOT PASSWORD
// ============================================================

router.get("/forgot-password", (req, res) => {
    res.render("auth/forgot-password", {
        title: "Forgot Password - MediDiag",
        error: null,
        success: null
    });
});

router.post("/forgot-password", async (req, res) => {
    try {
        const email = String(req.body.email || '')
            .trim()
            .toLowerCase();

        if (!email) {
            return res.status(400).render("auth/forgot-password", {
                title: "Forgot Password - MediDiag",
                error: "Please enter your email address.",
                success: null
            });
        }

        const user = await User.findByEmail(email);

        // Always show the same response whether the account exists.
        if (!user) {
            return res.render("auth/forgot-password", {
                title: "Forgot Password - MediDiag",
                error: null,
                success:
                    "If an account exists for this email, a password reset link has been sent."
            });
        }

        // Generate secure random token.
        const rawToken = crypto.randomBytes(32).toString("hex");

        // Store only SHA-256 hash in database.
        const tokenHash = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

        // 30-minute expiry.
        const expiresAt = new Date(
            Date.now() + 30 * 60 * 1000
        );

        await User.createPasswordResetToken(
            user.id,
            tokenHash,
            expiresAt
        );

        const baseUrl =
            process.env.APP_BASE_URL ||
            `${req.protocol}://${req.get("host")}`;

        const resetUrl =
            `${baseUrl}/auth/reset-password/${rawToken}`;

        try {
            await sendPasswordResetEmail({
                to: user.email,
                resetUrl
            });
        } catch (mailError) {
            console.error(
                "Password reset email error:",
                mailError
            );

            // Remove unusable reset token if email failed.
            await User.deletePasswordResetTokens(user.id);

            return res.status(500).render(
                "auth/forgot-password",
                {
                    title: "Forgot Password - MediDiag",
                    error:
                        "We could not send the reset email. Please try again later.",
                    success: null
                }
            );
        }

        return res.render("auth/forgot-password", {
            title: "Forgot Password - MediDiag",
            error: null,
            success:
                "If an account exists for this email, a password reset link has been sent."
        });

    } catch (error) {
        console.error(
            "Forgot password error:",
            error
        );

        return res.status(500).render(
            "auth/forgot-password",
            {
                title: "Forgot Password - MediDiag",
                error:
                    "Something went wrong. Please try again later.",
                success: null
            }
        );
    }
});

// ============================================================
// RESET PASSWORD
// ============================================================

// Show reset password page
router.get("/reset-password/:token", async (req, res) => {
    try {
        const { token } = req.params;

        // Validate token format
        if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).render(
                "auth/reset-password",
                {
                    title: "Reset Password - MediDiag",
                    token: null,
                    error: "This password reset link is invalid or expired.",
                    success: null
                }
            );
        }

        // Hash token to compare with database
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        // Find valid token
        const resetToken =
            await User.findValidPasswordResetToken(tokenHash);

        if (!resetToken) {
            return res.status(400).render(
                "auth/reset-password",
                {
                    title: "Reset Password - MediDiag",
                    token: null,
                    error: "This password reset link is invalid or expired.",
                    success: null
                }
            );
        }

        // Valid token - show password reset form
        return res.render("auth/reset-password", {
            title: "Reset Password - MediDiag",
            token,
            error: null,
            success: null
        });

    } catch (error) {
        console.error(
            "Reset password page error:",
            error
        );

        return res.status(500).render(
            "auth/reset-password",
            {
                title: "Reset Password - MediDiag",
                token: null,
                error: "Something went wrong.",
                success: null
            }
        );
    }
});


// Process new password
router.post("/reset-password/:token", async (req, res) => {
    try {
        const { token } = req.params;

        const password = String(
            req.body.password || ''
        );

        const confirmPassword = String(
            req.body.confirm_password || ''
        );


        // Helper for rendering reset errors
        const renderError = (message) => {
            return res.status(400).render(
                "auth/reset-password",
                {
                    title: "Reset Password - MediDiag",
                    token,
                    error: message,
                    success: null
                }
            );
        };


        // Validate token format
        if (!/^[a-f0-9]{64}$/i.test(token)) {
            return renderError(
                "This password reset link is invalid or expired."
            );
        }


        // Validate password length
        if (password.length < 6) {
            return renderError(
                "Password must be at least 6 characters long."
            );
        }


        // Confirm passwords match
        if (password !== confirmPassword) {
            return renderError(
                "Passwords do not match."
            );
        }


        // Hash token
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");


        // Find valid reset token
        const resetToken =
            await User.findValidPasswordResetToken(
                tokenHash
            );


        if (!resetToken) {
            return renderError(
                "This password reset link is invalid or expired."
            );
        }


        // Update user's password
        await User.updatePassword(
            resetToken.user_id,
            password
        );


        // Mark token as used
        await User.markPasswordResetTokenUsed(
            resetToken.id
        );


        // Remove any remaining reset tokens
        await User.deletePasswordResetTokens(
            resetToken.user_id
        );


        // Password reset successful
        return res.render(
            "auth/reset-password",
            {
                title: "Reset Password - MediDiag",
                token: null,
                error: null,
                success:
                    "Your password has been reset successfully. You can now log in."
            }
        );

    } catch (error) {
        console.error(
            "Reset password error:",
            error
        );

        return res.status(500).render(
            "auth/reset-password",
            {
                title: "Reset Password - MediDiag",
                token: null,
                error:
                    "Unable to reset your password. Please try again.",
                success: null
            }
        );
    }
});

// ============================================================
// AUTHENTICATED CHANGE PASSWORD
// Used by both Patient and Doctor profiles.
// ============================================================

router.post("/change-password", async (req, res) => {
    try {
        if (
            !req.session ||
            !req.session.user
        ) {
            return res.status(401).json({
                success: false,
                error: "Please log in again."
            });
        }

        const userId = req.session.user.id;

        const currentPassword = String(
            req.body.currentPassword || ''
        );

        const newPassword = String(
            req.body.newPassword || ''
        );

        const confirmPassword = String(
            req.body.confirmPassword || ''
        );

        if (!currentPassword) {
            return res.status(400).json({
                success: false,
                error: "Current password is required."
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error:
                    "New password must be at least 6 characters long."
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                error: "New passwords do not match."
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User account not found."
            });
        }

        const currentPasswordValid =
            await User.verifyPassword(
                currentPassword,
                user.password
            );

        if (!currentPasswordValid) {
            return res.status(400).json({
                success: false,
                error: "Current password is incorrect."
            });
        }

        const samePassword =
            await User.verifyPassword(
                newPassword,
                user.password
            );

        if (samePassword) {
            return res.status(400).json({
                success: false,
                error:
                    "New password must be different from your current password."
            });
        }

        await User.updatePassword(
            userId,
            newPassword
        );

        // Invalidate any outstanding password-reset links.
        await User.deletePasswordResetTokens(
            userId
        );

        return res.json({
            success: true,
            message: "Password updated successfully."
        });

    } catch (error) {
        console.error(
            "Change password error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to update password. Please try again."
        });
    }
});

// Login page
router.get("/login", (req, res) => {
  res.render("auth/login", {
    title: "Login - MediDiag",
    error: null,
  });
});

// ============================================================
// LOGIN PROCESSING
// ============================================================

router.post("/login", async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const password = String(req.body.password || "");

        // Basic validation
        if (!email || !password) {
            return res.status(400).render("auth/login", {
                title: "Login - MediDiag",
                error: "Please enter your email and password."
            });
        }

        // Find user
        const user = await User.findByEmail(email);

        if (!user) {
            console.log("LOGIN FAILED: User not found:", email);

            return res.status(401).render("auth/login", {
                title: "Login - MediDiag",
                error: "Invalid email or password"
            });
        }

        // Verify password against the bcrypt hash stored in DB
        const isValidPassword = await User.verifyPassword(
            password,
            user.password
        );

        console.log(
            "LOGIN PASSWORD CHECK:",
            email,
            "valid:",
            isValidPassword
        );

        if (!isValidPassword) {
            return res.status(401).render("auth/login", {
                title: "Login - MediDiag",
                error: "Invalid email or password"
            });
        }

        // Make sure the user has a valid role
        if (user.role !== "patient" && user.role !== "doctor") {
            console.error(
                "LOGIN FAILED: Invalid user role:",
                user.role
            );

            return res.status(403).render("auth/login", {
                title: "Login - MediDiag",
                error: "Your account has an invalid role. Please contact support."
            });
        }

        // Create session
        req.session.user = {
            id: user.id,
            email: user.email,
            role: user.role
        };

        console.log(
            "LOGIN SUCCESS:",
            user.email,
            "role:",
            user.role,
            "id:",
            user.id
        );

        // Explicitly save session before redirect
        req.session.save((sessionError) => {
            if (sessionError) {
                console.error(
                    "SESSION SAVE ERROR:",
                    sessionError
                );

                return res.status(500).render("auth/login", {
                    title: "Login - MediDiag",
                    error: "Unable to create your login session. Please try again."
                });
            }

            // Redirect according to role
            if (user.role === "patient") {
                return res.redirect("/patient/dashboard");
            }

            if (user.role === "doctor") {
                return res.redirect("/doctor/dashboard");
            }
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);

        return res.status(500).render("auth/login", {
            title: "Login - MediDiag",
            error: "An error occurred during login. Please try again."
        });
    }
});

// Registration page
const ALLOWED_ROLES = ['patient', 'doctor'];

router.get("/register", (req, res) => {
  const raw = req.query.role;
  const safeRole = ALLOWED_ROLES.includes(raw) ? raw : null;

  // If a stale or invalid ?role= was passed (e.g. "?role=" or "?role=hacker"),
  // silently redirect to the clean URL so the user sees a fresh form.
  if (raw !== undefined && safeRole === null) {
    return res.redirect('/auth/register');
  }

  res.render("registerpage/register", {
    title: "Register - MediDiag",
    error: null,
    errors: {},
    values: {},
    role: safeRole,
  });
});

// Registration processing

// Helper: normalize empty strings to null for the DB layer.
const emptyToNull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
};

router.post("/register", async (req, res) => {
  try {
    const {
      email, password, confirm_password, full_name,
      role: bodyRole,
      date_of_birth, gender, phone,
      specialization, license_number, experience_years,
      hospital_affiliation, consultation_fee,
    } = req.body;

    // Prefer the submitted body value; fall back to query string only for
    // legacy links. Either way, validate against the whitelist.
const rawRole = Array.isArray(bodyRole) ? bodyRole[0] : bodyRole;
const role = ALLOWED_ROLES.includes(rawRole) ? rawRole : null;
    const errors = {};
    const values = {
      full_name: full_name || '',
      email: email || '',
      role: role || '',
      date_of_birth: date_of_birth || '',
      gender: gender || '',
      phone: phone || '',
      specialization: specialization || '',
      license_number: license_number || '',
      experience_years: experience_years || '',
      hospital_affiliation: hospital_affiliation || '',
      consultation_fee: consultation_fee || '',
    };

    if (!role) {
      errors.role = 'Please select a role: Patient or Doctor.';
    }
    if (!values.full_name.trim()) errors.full_name = 'Full name is required.';
    if (!values.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!password || password.length < 6) errors.password = 'Password must be at least 6 characters long.';
    if (!confirm_password) errors.confirm_password = 'Please confirm your password.';
    else if (password !== confirm_password) errors.confirm_password = 'Passwords do not match.';

    if (role === 'doctor') {
      if (!values.specialization.trim()) errors.specialization = 'Specialization is required.';
      if (!values.license_number.trim()) errors.license_number = 'License number is required.';
      if (!String(values.experience_years).trim()) errors.experience_years = 'Years of experience is required.';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).render("registerpage/register", {
        title: "Register - MediDiag",
        errors, values,
        role: role || null,
        error: null,
      });
    }

    const existingUser = await User.findByEmail(values.email.trim());
    if (existingUser) {
      return res.status(409).render("registerpage/register", {
        title: "Register - MediDiag",
        errors: { email: 'Email already registered. Please sign in or use a different email.' },
        values, role, error: null,
      });
    }

    const user = await User.create(values.email.trim(), password, role);

        const emptyToNull = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s.length === 0 ? null : s;
    };

    const toIntOrNull = (v) => {
      if (v === undefined || v === null || String(v).trim() === '') return null;
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? null : n;
    };
    const toNumOrNull = (v) => {
      if (v === undefined || v === null || String(v).trim() === '') return null;
      const n = parseFloat(v);
      return Number.isNaN(n) ? null : n;
    };

    if (role === 'patient') {
      await Patient.create(user.id, {
        full_name: values.full_name.trim(),
        date_of_birth: emptyToNull(values.date_of_birth),
        gender: emptyToNull(values.gender),
        phone: emptyToNull(values.phone),
      });
    } else if (role === 'doctor') {
      const spec = values.specialization.trim();
            await Doctor.create(user.id, {
        full_name: values.full_name.trim(),
        specialization: spec.charAt(0).toUpperCase() + spec.slice(1),
        license_number: values.license_number.trim(),
        experience_years: toIntOrNull(values.experience_years),
        phone: emptyToNull(values.phone),
        hospital_affiliation: emptyToNull(values.hospital_affiliation),
        consultation_fee: toNumOrNull(values.consultation_fee),
      });
    }

    req.session.user = {
  id: user.id,
  email: user.email,
  role: user.role
};

// Explicitly persist the session before redirecting.
// This is especially important on Render.
req.session.save((sessionError) => {
  if (sessionError) {
    console.error(
      '[REGISTER] SESSION SAVE ERROR:',
      sessionError
    );

    return res.status(500).render('registerpage/register', {
      title: 'Register - MediDiag',
      errors: {},
      values: req.body || {},
      role: role || null,
      error: 'Registration succeeded, but the login session could not be created. Please try logging in again.'
    });
  }

  console.log(
    '[REGISTER] SESSION SAVED:',
    req.sessionID,
    req.session.user
  );

  if (role === 'patient') {
    return res.redirect('/patient/dashboard');
  }

  return res.redirect('/doctor/dashboard');
});
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).render("registerpage/register", {
      title: "Register - MediDiag",
      errors: {}, values: req.body || {}, role: req.body && req.body.role ? req.body.role : null,
      error: "An error occurred during registration. Please try again.",
    });
  }
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

module.exports = router;