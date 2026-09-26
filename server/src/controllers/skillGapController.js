const asyncHandler = require('../utils/asyncHandler');
const { computeAndStoreSkillGaps } = require('../services/skillGapService');

const getSkillGaps = asyncHandler(async (req, res) => {
  const skillGaps = await computeAndStoreSkillGaps(req.user.id);
  res.json({ success: true, skillGaps });
});

module.exports = { getSkillGaps };
