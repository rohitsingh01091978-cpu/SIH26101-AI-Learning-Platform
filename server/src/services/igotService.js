const prisma = require('../utils/prisma');

/**
 * iGOT Karmayogi integration service.
 *
 * IMPORTANT (honesty note): this prototype does NOT have live iGOT
 * Karmayogi API credentials. Every course returned here comes from the
 * "Prototype iGOT Course Catalog" seeded into our own database — it is
 * clearly labelled as such via `source: "Prototype iGOT Catalog"` on every
 * record. If IGOT_API_BASE_URL / IGOT_API_KEY are ever configured with
 * authorized credentials, the four functions below are the ONLY place that
 * needs to change (swap the Prisma queries for fetch() calls to the real
 * API) — no controller or frontend code depends on the data's origin.
 */
const isLiveConfigured = () => Boolean(process.env.IGOT_API_BASE_URL && process.env.IGOT_API_KEY);

async function getCourses({ competencyId, level } = {}) {
  const courses = await prisma.course.findMany({
    where: {
      ...(competencyId ? { competencyId } : {}),
      ...(level ? { level } : {}),
    },
    include: { competency: true },
    orderBy: { createdAt: 'asc' },
  });
  return { courses, live: isLiveConfigured() };
}

async function searchCourses(query) {
  const q = (query || '').trim();
  if (!q) return { courses: [], live: isLiveConfigured() };

  const courses = await prisma.course.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { competency: { name: { contains: q, mode: 'insensitive' } } },
      ],
    },
    include: { competency: true },
  });
  return { courses, live: isLiveConfigured() };
}

async function getCourseDetails(courseId) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { competency: true },
  });
  return { course, live: isLiveConfigured() };
}

/**
 * Recommend prototype-catalog courses for a set of competency IDs, ranked by
 * how large the learner's gap is on that competency (handled by the caller —
 * this just fetches candidate courses per competency).
 */
async function recommendCourses(competencyIds = []) {
  if (!competencyIds.length) return { courses: [], live: isLiveConfigured() };

  const courses = await prisma.course.findMany({
    where: { competencyId: { in: competencyIds } },
    include: { competency: true },
  });
  return { courses, live: isLiveConfigured() };
}

module.exports = { getCourses, searchCourses, getCourseDetails, recommendCourses, isLiveConfigured };
