const { query } = require('../config/db');

class Patient {
  static async create(userId, patientData) {
    const { full_name, date_of_birth, gender, phone, address, emergency_contact } = patientData;

    const toNull = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s.length === 0 ? null : s;
    };

    const result = await query(
      `INSERT INTO patients (user_id, full_name, date_of_birth, gender, phone, address, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        userId,
        toNull(full_name),
        toNull(date_of_birth),
        toNull(gender),
        toNull(phone),
        toNull(address),
        toNull(emergency_contact),
      ]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await query(
      `SELECT p.*, u.email FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  static async updateProfile(userId, updateData) {
    const ALLOWED = [
      'full_name', 'date_of_birth', 'gender',
      'phone', 'address', 'emergency_contact',
      'blood_type', 'allergies',
    ];

    const fields = [];
    const values = [];
    let paramCount = 1;

    ALLOWED.forEach((key) => {
      const v = updateData[key];
      if (v === undefined) return;
      if (v === null) return;
      if (typeof v === 'string' && v.trim() === '') return;

      fields.push(`${key} = $${paramCount}`);
      values.push(v);
      paramCount++;
    });

    if (fields.length === 0) {
      const r = await query(
        `SELECT p.*, u.email FROM patients p
         JOIN users u ON p.user_id = u.id
         WHERE p.user_id = $1`,
        [userId]
      );
      return r.rows[0] || null;
    }

    values.push(userId);
    // NOTE: do NOT set updated_at here. A DB trigger will handle it if present;
    // if not, the column keeps its DEFAULT value.
    const result = await query(
      `UPDATE patients
       SET ${fields.join(', ')}
       WHERE user_id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0];
  }
}

module.exports = Patient;