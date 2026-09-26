/**
 * Core competency-gap math shared by the skill-gap, recommendation, and
 * performance-analysis modules. Kept isolated so the "gap formula" lives in
 * exactly one place.
 */

const clampLevel = (value) => Math.max(0, Math.min(100, Math.round(value)));

function gapStatus(gap) {
  if (gap <= 0) return 'STRONG';
  if (gap <= 20) return 'DEVELOPING';
  return 'NEEDS_IMPROVEMENT';
}

/**
 * Priority blends gap size with recent assessment performance so a large gap
 * on a competency the learner is actively bombing outranks a large gap on
 * one they haven't touched yet.
 */
function gapPriority(gap, recentAccuracy = null) {
  let score = gap; // 0-100 scale
  if (recentAccuracy !== null && recentAccuracy < 50) {
    score += 15;
  }
  if (score > 40) return 'HIGH';
  if (score > 15) return 'MEDIUM';
  return 'LOW';
}

function computeGap(currentLevel, requiredLevel) {
  const gap = clampLevel(requiredLevel) - clampLevel(currentLevel);
  return Math.max(0, gap);
}

/**
 * Target role -> required competency levels. Roles not listed fall back to
 * DEFAULT_REQUIRED_LEVEL for every competency (a generic "solid working
 * proficiency" bar), so the app still works for any free-text target role.
 */
const DEFAULT_REQUIRED_LEVEL = 65;

const ROLE_REQUIREMENTS = {
  'Senior Statistical Officer': {
    'Survey Design': 80,
    Sampling: 80,
    'National Accounts': 70,
    'Price Statistics': 65,
    'Data Quality': 85,
    Python: 65,
    SQL: 70,
    'AI/ML': 75,
    'Data Visualization': 70,
    'SDG Indicators': 65,
    Leadership: 60,
    'Project Management': 60,
  },
  'Statistical Officer': {
    'Survey Design': 65,
    Sampling: 65,
    'Data Quality': 65,
    Python: 55,
    SQL: 60,
    'Data Visualization': 60,
  },
  'Data Analyst': {
    Python: 80,
    SQL: 80,
    'AI/ML': 65,
    'Data Visualization': 85,
    'Data Quality': 70,
    'Cloud': 55,
  },
};

function requiredLevelFor(targetRole, competencyName) {
  const roleMap = ROLE_REQUIREMENTS[targetRole];
  if (roleMap && roleMap[competencyName] != null) {
    return roleMap[competencyName];
  }
  return DEFAULT_REQUIRED_LEVEL;
}

module.exports = {
  clampLevel,
  gapStatus,
  gapPriority,
  computeGap,
  requiredLevelFor,
  ROLE_REQUIREMENTS,
  DEFAULT_REQUIRED_LEVEL,
};
