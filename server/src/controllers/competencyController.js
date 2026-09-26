const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');

const listCompetencies = asyncHandler(async (req, res) => {
  const competencies = await prisma.competency.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  res.json({ success: true, competencies });
});

const myCompetencies = asyncHandler(async (req, res) => {
  const learnerCompetencies = await prisma.learnerCompetency.findMany({
    where: { userId: req.user.id },
    include: { competency: true },
    orderBy: { competency: { category: 'asc' } },
  });
  res.json({ success: true, competencies: learnerCompetencies });
});

module.exports = { listCompetencies, myCompetencies };
