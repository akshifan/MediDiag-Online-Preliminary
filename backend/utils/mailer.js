const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,

    auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_API_KEY
    }
});

async function sendPasswordResetEmail({ to, resetUrl }) {

    if (!process.env.EMAIL_FROM) {
        throw new Error('EMAIL_FROM is not configured');
    }

    if (!process.env.BREVO_API_KEY) {
        throw new Error('BREVO_API_KEY is not configured');
    }

    const mailOptions = {
        from: {
            name: process.env.EMAIL_FROM_NAME || 'MediDiag',
            address: process.env.EMAIL_FROM
        },

        to: to,

        subject: 'MediDiag - Reset Your Password',

        text: `
Hello,

We received a request to reset your MediDiag password.

Click the link below to reset your password:

${resetUrl}

This link will expire in 30 minutes.

If you did not request this password reset, you can safely ignore this email.

MediDiag Team
        `.trim(),

        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>MediDiag Password Reset</title>
</head>

<body style="
    margin:0;
    padding:0;
    background:#f0fdf8;
    font-family:Arial,Helvetica,sans-serif;
">

    <div style="
        max-width:600px;
        margin:40px auto;
        padding:32px;
        background:#ffffff;
        border-radius:16px;
        border:1px solid #b7eee0;
        box-shadow:0 10px 30px rgba(16,185,129,0.10);
    ">

        <h2 style="
            margin:0 0 16px;
            color:#065f46;
        ">
            MediDiag Password Reset
        </h2>

        <p style="
            color:#475569;
            font-size:15px;
            line-height:1.6;
        ">
            We received a request to reset your MediDiag password.
        </p>

        <p style="
            color:#475569;
            font-size:15px;
            line-height:1.6;
        ">
            Click the button below to create a new password.
        </p>

        <div style="margin:30px 0;">

            <a
                href="${resetUrl}"
                style="
                    display:inline-block;
                    padding:13px 24px;
                    background:#10b981;
                    color:#ffffff;
                    text-decoration:none;
                    border-radius:10px;
                    font-weight:600;
                "
            >
                Reset Password
            </a>

        </div>

        <p style="
            color:#64748b;
            font-size:13px;
            line-height:1.5;
        ">
            This link will expire in
            <strong>30 minutes</strong>.
        </p>

        <p style="
            color:#64748b;
            font-size:13px;
            line-height:1.5;
        ">
            If you did not request this password reset,
            you can safely ignore this email.
        </p>

        <hr style="
            border:none;
            border-top:1px solid #e2e8f0;
            margin:25px 0;
        ">

        <p style="
            margin:0;
            color:#065f46;
            font-weight:600;
        ">
            MediDiag Team
        </p>

    </div>

</body>
</html>
        `
    };

    return transporter.sendMail(mailOptions);
}

module.exports = {
    transporter,
    sendPasswordResetEmail
};