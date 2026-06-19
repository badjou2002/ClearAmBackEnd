require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { google } = require("googleapis");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const { oauth2Client } = require("./config/google");
const statsRouter = require("./controllers/statsController");
const driveRouter = require("./controllers/driveController");

app.use("/api/stats", statsRouter);
app.use("/api/drive", driveRouter);

app.get("/api/auth/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/drive",
    ],
    prompt: "consent",
  });
  res.redirect(url);
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('No authorization code provided.');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const userEmail = userInfo.data.email;

    console.log("✅ Logged in:", userEmail);

    // 💡 FIX CRUCIAL: Nab3tho el tokens w el email fil URL lel Frontend
    // Bech React ya9rahom w y7othom fil sessionStorage!
    const stringifiedTokens = encodeURIComponent(JSON.stringify(tokens));
    
    return res.redirect(`http://localhost:5173/dashboard?tokens=${stringifiedTokens}&email=${encodeURIComponent(userEmail)}`);

  } catch (error) {
    console.error('❌ Error during OAuth callback:', error);
    return res.status(500).send('Authentication failed.');
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`Clear AM server running on port ${PORT}`));
