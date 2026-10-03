const { query } = require('../config/db');
const bcrypt = require('bcryptjs');

class User {
    static async create(email, password, role) {
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await query(
            'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING *',
            [email, hashedPassword, role]
        );

        return result.rows[0];
    }

    static async findByEmail(email) {
        const result = await query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        return result.rows[0];
    }

    static async findById(id) {
        const result = await query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );

        return result.rows[0];
    }

    static async verifyPassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(
            plainPassword,
            hashedPassword
        );
    }

    static async updatePassword(userId, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const result = await query(
            `UPDATE users
             SET password = $1
             WHERE id = $2
             RETURNING id, email, role`,
            [hashedPassword, userId]
        );

        return result.rows[0];
    }

    static async createPasswordResetToken(
        userId,
        tokenHash,
        expiresAt
    ) {
        await query(
            `DELETE FROM password_reset_tokens
             WHERE user_id = $1
                OR expires_at < CURRENT_TIMESTAMP
                OR used_at IS NOT NULL`,
            [userId]
        );

        const result = await query(
            `INSERT INTO password_reset_tokens
                (user_id, token_hash, expires_at)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [userId, tokenHash, expiresAt]
        );

        return result.rows[0];
    }

    static async findValidPasswordResetToken(tokenHash) {
        const result = await query(
            `SELECT *
             FROM password_reset_tokens
             WHERE token_hash = $1
               AND used_at IS NULL
               AND expires_at > CURRENT_TIMESTAMP
             LIMIT 1`,
            [tokenHash]
        );

        return result.rows[0];
    }

    static async markPasswordResetTokenUsed(tokenId) {
        await query(
            `UPDATE password_reset_tokens
             SET used_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [tokenId]
        );
    }

    static async deletePasswordResetTokens(userId) {
        await query(
            `DELETE FROM password_reset_tokens
             WHERE user_id = $1`,
            [userId]
        );
    }
}

module.exports = User;