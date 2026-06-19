const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:5173/api/auth/callback"
);

const drive = google.drive({ version: "v3", auth: oauth2Client });

module.exports = { oauth2Client, drive };
