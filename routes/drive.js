const { Router } = require('express');
const { scanDrive, cleanDrive } = require('../controllers/driveController');

const router = Router();

router.post('/scan', scanDrive);
router.post('/clean', cleanDrive);

module.exports = router;
