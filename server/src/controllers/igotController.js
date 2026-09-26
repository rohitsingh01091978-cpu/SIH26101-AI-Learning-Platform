const asyncHandler = require('../utils/asyncHandler');
const igotService = require('../services/igotService');

const listCourses = asyncHandler(async (req, res) => {
  const { competencyId, level } = req.query;
  const { courses, live } = await igotService.getCourses({ competencyId, level });
  res.json({ success: true, courses, source: live ? 'iGOT Karmayogi (live)' : 'iGOT-aligned Training Catalog', live });
});

const searchCourses = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const { courses, live } = await igotService.searchCourses(q);
  res.json({ success: true, courses, source: live ? 'iGOT Karmayogi (live)' : 'iGOT-aligned Training Catalog', live });
});

module.exports = { listCourses, searchCourses };
