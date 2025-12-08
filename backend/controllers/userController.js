import { pool } from '../config/database.js';

// Update employee profile name
export const updateUserProfile = async (req, res) => {
  const { email, name } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Email and Name are required' });
  }

  try {
    // Update the name in the employees table where the email matches
    const [result] = await pool.execute(
      `UPDATE employees SET name = ?, updated_at = NOW() WHERE email = ?`,
      [name, email]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found or no changes made' });
    }

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: { name, email }
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};