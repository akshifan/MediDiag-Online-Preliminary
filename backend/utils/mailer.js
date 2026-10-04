// backend/utils/mailer.js

const Brevo = require('@getbrevo/brevo');

const BREVO_API_KEY = process.env.BREVO_API_KEY || null;
const EMAIL_FROM = process.env.EMAIL_FROM || null;
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'MediDiag';

// Initialize the Brevo API client (v6 API shape)
// The default export is the client instance itself.
const apiInstance = new Brevo.BrevoClient({
    apiKey: BREVO_API_KEY
});

// Some versions export the client differently. Handle both.
const client = Brevo.BrevoClient
    ? new Brevo.BrevoClient({ apiKey: BREVO_API_KEY })
    : Brevo;

if (!BREVO_API_KEY) {
    console.error('[MAIL] WARNING: BREVO_API_KEY is not set. Emails will fail to send.');
} else {
    console.log('[MAIL] Brevo API client initialized.');
}

/**
 * Send a transactional email through the Brevo API.
 *
 * @param {Object} opts
 * @param {string} opts.to         - Recipient email address
 * @param {string} opts.subject    - Email subject
 * @param {string} opts.text       - Plain text body
 * @param {string} opts.html       - HTML body
 * @param {string} [opts.replyTo]  - Optional reply-to address
 */
async function sendEmail({ to, subject, text, html, replyTo }) {
    if (!BREVO_API_KEY) {
        throw new Error('Email service is not configured (missing BREVO_API_KEY).');
    }
    if (!EMAIL_FROM) {
        throw new Error('Email service is not configured (missing EMAIL_FROM).');
    }

    const payload = {
        sender: {
            name: EMAIL_FROM_NAME,
            email: EMAIL_FROM
        },
        to: [{ email: to }],
        subject: subject,
        htmlContent: html,
        textContent: text
    };

    if (replyTo) {
        payload.replyTo = { email: replyTo };
    }

    try {
        console.log(`[MAIL] Sending email to ${to} via Brevo API...`);

        // v6 SDK shape: client.transactionalEmails.sendTransacEmail(...)
        // Fallback to alternative shape if needed.
        const response =
            (client.transactionalEmails &&
                typeof client.transactionalEmails.sendTransacEmail === 'function')
                ? await client.transactionalEmails.sendTransacEmail(payload)
                : await client.sendTransacEmail(payload);

        console.log(`[MAIL] Email sent successfully to ${to}.`);
        return response;
    } catch (error) {
        const detail =
            (error && error.response && error.response.body) ||
            (error && error.body) ||
            (error && error.message) ||
            error;

        console.error('[MAIL] Failed to send email via Brevo API:', detail);
        throw new Error('Failed to send email.');
    }
}

async function sendPasswordResetEmail({ to, resetUrl }) {
    const subject = 'MediDiag - Reset Your Password';

    const text = `
Hello,

We received a request to reset your MediDiag password.

Click the link below to reset your password:

${resetUrl}

This link will expire in 30 minutes.

If you did not request this password reset, you can safely ignore this email.

MediDiag Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>MediDiag Password Reset</title>
</head>
<body style="margin:0; padding:0; background:#f0fdf8; font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px; margin:40px auto; padding:32px; background:#ffffff; border-radius:16px; border:1px solid #b7eee0; box-shadow:0 10px 30px rgba(16,185,129,0.10);">
        <h2 style="margin:0 0 16px; color:#065f46;">MediDiag Password Reset</h2>
        <p style="color:#475569; font-size:15px; line-height:1.6;">We received a request to reset your MediDiag password.</p>
        <p style="color:#475569; font-size:15px; line-height:1.6;">Click the button below to create a new password.</p>
        <div style="margin:30px 0;">
            <a href="${resetUrl}" style="display:inline-block; padding:13px 24px; background:#10b981; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:600;">Reset Password</a>
        </div>
        <p style="color:#64748b; font-size:13px; line-height:1.5;">This link will expire in <strong>30 minutes</strong>.</p>
        <p style="color:#64748b; font-size:13px; line-height:1.5;">If you did not request this password reset, you can safely ignore this email.</p>
        <hr style="border:none; border-top:1px solid #e2e8f0; margin:25px 0;">
        <p style="margin:0; color:#065f46; font-weight:600;">MediDiag Team</p>
    </div>
</body>
</html>
    `;

    return sendEmail({ to, subject, text, html });
}

module.exports = {
    sendEmail,
    sendPasswordResetEmail,
};