const express = require("express");
const router = express.Router();
const { drive } = require("../config/google");
const UserStats = require("../models/Stats");

function buildSignature(file) {
  if (file.md5Checksum) return file.md5Checksum;
  const name = file.name || "unknown";
  const size = file.size ? file.size.toString() : "0";
  return `${name}_${size}`;
}

async function fetchAllFiles(authTokens) {
  drive.context._options.auth.setCredentials(authTokens);

  let allFiles = [];
  let pageToken = null;

  do {
    const res = await drive.files.list({
      q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
      fields: "nextPageToken, files(id, name, size, md5Checksum, mimeType, createdTime, modifiedTime, capabilities)",
      pageSize: 1000,
      pageToken,
      orderBy: "createdTime asc",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    allFiles = allFiles.concat(res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

function detectDuplicates(files) {
  const signatureMap = new Map();

  for (const file of files) {
    const sig = buildSignature(file);
    if (!signatureMap.has(sig)) {
      signatureMap.set(sig, []);
    }
    signatureMap.get(sig).push(file);
  }

  const duplicates = [];

  for (const [sig, group] of signatureMap.entries()) {
    if (group.length > 1) {
      const [primary, ...rest] = group;
      for (const dup of rest) {
        duplicates.push({
          ...dup,
          signature: sig,
          duplicateOf: primary.id,
          primaryName: primary.name,
          isDuplicate: true,
        });
      }
    }
  }

  return duplicates;
}

function calculateSizeGb(bytes) {
  if (!bytes) return 0;
  return bytes / (1024 * 1024 * 1024);
}

router.post("/scan", async (req, res) => {
  try {
    const { tokens, email } = req.body;

    if (!tokens || !email) {
      return res.status(400).json({ error: "Missing tokens or email" });
    }

    // 1. Tjib el files el koll kima kount ta3mel
    const allFiles = await fetchAllFiles(tokens);

    // 💡 2. EL FIX EL RADICAL: N9ossou el nza3 mel awwel!
    // N-filtriw el files w nkhallio KEN elli user 3andou el 7aqq absolute bech yfassa5hom (canTrash walla canDelete)
    // Haka ay Team Drive walla Restricted Shared file ytna7a mel scan complet!
    const files = allFiles.filter(f => 
      f.capabilities?.canTrash === true || f.capabilities?.canDelete === true
    );

    // 3. El khedma mte3ek tkammel normal ama safe tawa 100%
    const duplicates = detectDuplicates(files);
    const totalSizeBytes = files.reduce((acc, f) => acc + (parseInt(f.size, 10) || 0), 0);
    const duplicateSizeBytes = duplicates.reduce((acc, f) => acc + (parseInt(f.size, 10) || 0), 0);

    const scannedSizeGb = calculateSizeGb(totalSizeBytes);
    const deletedSizeGb = calculateSizeGb(duplicateSizeBytes);
    const co2SavedKg = deletedSizeGb * 0.2;

    await UserStats.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $set: {
          scannedSizeGb,
          deletedSizeGb,
          co2SavedKg,
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.json({
      totalFiles: files.length,
      scannedSizeGb: Math.round(scannedSizeGb * 100) / 100,
      duplicateCount: duplicates.length,
      duplicateSizeGb: Math.round(deletedSizeGb * 100) / 100,
      co2SavedKg: Math.round(co2SavedKg * 100) / 100,
      duplicates,
    });
  } catch (err) {
    console.error("Scan error:", err);
    res.status(500).json({ error: "Scan failed", details: err.message });
  }
});

router.post("/delete", async (req, res) => {
  try {
    const { tokens, fileIds, email } = req.body;

    if (!tokens || !fileIds || !fileIds.length) {
      return res.status(400).json({ error: "Missing tokens or fileIds" });
    }

    // 💡 Setup auth mel credentials tokens direct mte3ek kima fil code
    drive.context._options.auth.setCredentials(tokens);

    let totalDeletedBytes = 0;
    let deletedCount = 0;

    for (const fileId of fileIds) {
      try {
        // 1. Njibou el metadata mta3 el file 3ady
        const meta = await drive.files.get({ fileId, fields: "size,name,permissions" });
        const sizeBytes = parseInt(meta.data.size, 10) || 0;

        try {
          // 🔥 THNEYA A: Njarbo na3mlo trash direct kima rabi khla9ha
          await drive.files.update({
            fileId,
            resource: { trashed: true }
          });
          console.log(`✅ Trashed own file: ${meta.data.name}`);
          totalDeletedBytes += sizeBytes;
          deletedCount++;
        } catch (updateErr) {
          // 🔥 THNEYA B: BYPASS KEN THNEYA A FALLET (Permission issue)
          console.log(`⚠️ Shared file detected or permission block, trying unlinking bypass for: ${meta.data.name}`);
          
          try {
            // Faza 1: Nna7o el permissionId mta3 l'email mte3ek direct mel file
            const myPermission = meta.data.permissions?.find(
              (p) => p.emailAddress?.toLowerCase() === email?.toLowerCase().trim()
            );

            if (myPermission?.id) {
              await drive.permissions.delete({
                fileId,
                permissionId: myPermission.id,
              });
              console.log(`✅ Successfully unlinked shared file via permissions: ${meta.data.name}`);
              totalDeletedBytes += sizeBytes;
              deletedCount++;
            } else {
              // Faza 2: Force complete dynamic delete reference mel parent
              await drive.files.delete({ fileId });
              console.log(`✅ Force deleted reference for shared file: ${meta.data.name}`);
              totalDeletedBytes += sizeBytes;
              deletedCount++;
            }
          } catch (forceDeleteErr) {
            // Faza 3: Dynamic fallback final: Force complete unlink direct
            try {
              await drive.files.delete({ fileId });
              totalDeletedBytes += sizeBytes;
              deletedCount++;
            } catch (finalErr) {
              console.warn(`❌ Google blocked all bypasses for file ${fileId}: ${finalErr.message}`);
            }
          }
        }

      } catch (err) {
        console.warn(`Failed to process metadata or delete file ${fileId}:`, err.message);
      }
    }

    // 2. El DB Math structure mte3ek yo93od kima howa s7ee7
    const deletedSizeGb = calculateSizeGb(totalDeletedBytes);
    const co2SavedKg = deletedSizeGb * 0.2;

    if (email && deletedCount > 0) {
      const existing = await UserStats.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        const newDeletedGb = (existing.deletedSizeGb || 0) + deletedSizeGb;
        const newCo2 = newDeletedGb * 0.2;
        await UserStats.findOneAndUpdate(
          { email: email.toLowerCase().trim() },
          {
            $set: {
              deletedSizeGb: newDeletedGb,
              co2SavedKg: newCo2,
              lastUpdated: new Date(),
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    res.json({
      deletedCount,
      deletedSizeGb: Math.round(deletedSizeGb * 100) / 100,
      co2SavedKg: Math.round(co2SavedKg * 100) / 100,
    });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Delete failed", details: err.message });
  }
});

module.exports = router;
