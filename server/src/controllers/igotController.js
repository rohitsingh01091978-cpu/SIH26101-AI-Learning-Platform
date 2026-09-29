const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const igotService = require('../services/igotService');

// Honest, consistent labelling everywhere a course list is returned: real iGOT
// Karmayogi data only when IGOT_API_BASE_URL/IGOT_API_KEY are configured (see
// igotService.isLiveConfigured), otherwise the seeded prototype catalog — never
// implied to be live.
const sourceLabel = (live) => (live ? 'iGOT Karmayogi (live)' : 'Prototype iGOT Course Catalog');

const listCourses = asyncHandler(async (req, res) => {
  const { competencyId, level } = req.query;
  const { courses, live } = await igotService.getCourses({ competencyId, level });
  res.json({ success: true, courses, source: sourceLabel(live), live });
});

const searchCourses = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const { courses, live } = await igotService.searchCourses(q);
  res.json({ success: true, courses, source: sourceLabel(live), live });
});

const getCourseDetails = asyncHandler(async (req, res) => {
  const { course, live } = await igotService.getCourseDetails(req.params.id);
  if (!course) throw new ApiError(404, 'Course not found.');
  res.json({ success: true, course, source: sourceLabel(live), live });
});

module.exports = { listCourses, searchCourses, getCourseDetails };
