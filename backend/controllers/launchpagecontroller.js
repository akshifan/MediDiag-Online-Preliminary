const path = require('path');
const { pool } = require('../config/db');
const { sendEmail } = require('../utils/mailer'); // <-- Update import


exports.getHome = (req, res) => {
  if (req.session.user) {
    // Redirect to appropriate dashboard if already logged in
    if (req.session.user.role === 'patient') {
      return res.redirect('/patient/dashboard');
    } else if (req.session.user.role === 'doctor') {
      return res.redirect('/doctor/dashboard');
    }
  }
  res.render('launchpage/launchpagehome', { 
    title: 'MediDiag - Online Preliminary Diagnosis',
    user: req.session.user 
  });
};

exports.getAbout = (req, res) => {
  res.render('launchpage/about', { 
    title: 'About MediDiag - Bridging Healthcare Gaps',
    user: req.session.user 
  });
};

exports.getFeatures = (req, res) => {
  res.render('launchpage/features', { 
    title: 'MediDiag Features - Revolutionizing Healthcare',
    user: req.session.user 
  });
};

exports.getFAQs = (req, res) => {
  res.render('launchpage/faqs', { 
    title: 'FAQs - MediDiag',
    user: req.session.user 
  });
};

exports.getContact = (req, res) => {
  res.render('launchpage/contact', { 
    title: 'Contact Us - MediDiag',
    user: req.session.user,
    success: req.query.alert || null,
    error: null
  });
};

// Handle contact form submissions
// Handle contact form submissions
exports.postContact = async (req, res) => {
    try {
        const {
            full_name,
            email,
            subject,
            message
        } = req.body;

        // Validate required fields
        if (!full_name || !email || !subject || !message) {
            return res.status(400).render('launchpage/contact', {
                title: 'Contact Us - MediDiag',
                user: req.session.user,
                success: null,
                error: 'Please fill in all fields.'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).render('launchpage/contact', {
                title: 'Contact Us - MediDiag',
                user: req.session.user,
                success: null,
                error: 'Please enter a valid email address.'
            });
        }

        // Check Brevo configuration
        

        if (!process.env.BREVO_API_KEY) {
            console.error('[CONTACT] BREVO_API_KEY is missing');

            return res.status(500).render('launchpage/contact', {
                title: 'Contact Us - MediDiag',
                user: req.session.user,
                success: null,
                error: 'Email service is not configured.'
            });
        }

        if (!process.env.EMAIL_FROM) {
            console.error('[CONTACT] EMAIL_FROM is missing');

            return res.status(500).render('launchpage/contact', {
                title: 'Contact Us - MediDiag',
                user: req.session.user,
                success: null,
                error: 'Email service is not configured.'
            });
        }

        // Escape HTML to prevent HTML injection in email
        const escapeHtml = (value) => {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const safeName = escapeHtml(full_name);
        const safeEmail = escapeHtml(email);
        const safeSubject = escapeHtml(subject);
        const safeMessage = escapeHtml(message);

        // Send email through Brevo SMTP
        await sendEmail({
    to: 'looserrr234@gmail.com', // Or use an env variable for the recipient
    replyTo: email,
    subject: `MediDiag Contact Form: ${subject}`,
    text: `
New message received from the MediDiag contact form.

Name: ${full_name}
Email: ${email}
Subject: ${subject}

Message:
${message}
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:30px; background:#f0fdf8; font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:650px; margin:0 auto; background:#ffffff; border:1px solid #b7eee0; border-radius:16px; padding:30px; box-shadow:0 10px 30px rgba(16,185,129,0.10);">
        <h2 style="margin-top:0; color:#065f46;">New MediDiag Contact Message</h2>
        <p style="color:#64748b; font-size:14px;">Someone submitted a message through the MediDiag contact form.</p>
        <hr style="border:none; border-top:1px solid #d1fae5; margin:25px 0;">
        <p><strong>Name:</strong><br>${full_name}</p>
        <p><strong>Email:</strong><br>${email}</p>
        <p><strong>Subject:</strong><br>${subject}</p>
        <div style="margin-top:25px; padding:20px; background:#ecfdf5; border-radius:12px; border:1px solid #d1fae5;">
            <strong style="color:#065f46;">Message</strong>
            <p style="margin-bottom:0; color:#334155; line-height:1.7; white-space:pre-wrap;">${message}</p>
        </div>
        <hr style="border:none; border-top:1px solid #e2e8f0; margin:25px 0;">
        <p style="margin:0; color:#065f46; font-weight:600;">MediDiag Contact System</p>
    </div>
</body>
</html>
    `
});

        console.log(
            `[CONTACT] Message successfully sent from ${email} to looserrr234@gmail.com`
        );

        // IMPORTANT:
        // Render the correct launchpage contact view
return res.status(200).render('launchpage/contact', {
            title: 'Contact Us - MediDiag',
            user: req.session.user,
            success: 'Your message has been sent successfully!',
            error: null
        });
    } catch (error) {

        console.error(
            '[CONTACT] Failed to send email:',
            error
        );

        // IMPORTANT:
        // Render the correct launchpage contact view
        return res.status(500).render('launchpage/contact', {
            title: 'Contact Us - MediDiag',
            user: req.session.user,
            success: null,
            error: 'Unable to send your message right now. Please try again later.'
        });
    }
};

// Prelogin pages
exports.getPreloginHome = (req, res) => {
  res.render('preloginpage/preloginhome', {
    title: 'MediDiag - Choose Your Portal',
    user: req.session.user
  });
};

exports.getPreloginAbout = (req, res) => {
  res.render('preloginpage/preloginabout', {
    title: 'About - MediDiag',
    user: req.session.user
  });
};

exports.getPreloginFeatures = (req, res) => {
  res.render('preloginpage/preloginfeatures', {
    title: 'Features - MediDiag',
    user: req.session.user
  });
};

exports.getPreloginFAQs = (req, res) => {
  res.render('preloginpage/preloginfaqs', {
    title: 'FAQs - MediDiag',
    user: req.session.user
  });
};

exports.getPreloginContact = (req, res) => {
  res.render('preloginpage/prelogincontact', {
    title: 'Contact - MediDiag',
    user: req.session.user
  });
};