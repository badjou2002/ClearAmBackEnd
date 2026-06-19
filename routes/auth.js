const { Router } = require('express');
const { getAuthUrl, getTokenFromCode } = require('../config/google');

const router = Router();

router.get('/google', (_req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });

    const tokens = await getTokenFromCode(code);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/dashboard?access_token=${tokens.access_token}`);
  } catch (err) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/?error=auth_failed`);
  }
});

module.exports = router;
