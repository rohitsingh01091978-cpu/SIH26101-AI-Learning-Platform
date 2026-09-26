const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const COMPETENCIES = [
  // STATISTICAL
  { name: 'Survey Design', category: 'STATISTICAL', description: 'Designing statistically sound surveys and questionnaires.' },
  { name: 'Sampling', category: 'STATISTICAL', description: 'Sample design, frame construction, and estimation techniques.' },
  { name: 'National Accounts', category: 'STATISTICAL', description: 'Compilation of GDP, GVA, and national income statistics.' },
  { name: 'Price Statistics', category: 'STATISTICAL', description: 'Construction and interpretation of price indices (CPI, WPI).' },
  { name: 'Labour Statistics', category: 'STATISTICAL', description: 'Employment, unemployment, and workforce measurement.' },
  { name: 'Agricultural Statistics', category: 'STATISTICAL', description: 'Crop production, yield, and agricultural census methods.' },
  { name: 'Industrial Statistics', category: 'STATISTICAL', description: 'Index of Industrial Production and related measures.' },
  { name: 'SDG Indicators', category: 'STATISTICAL', description: 'Sustainable Development Goal indicator frameworks and reporting.' },
  { name: 'Metadata Standards', category: 'STATISTICAL', description: 'SDMX and statistical metadata standardization.' },
  { name: 'Data Quality', category: 'STATISTICAL', description: 'Accuracy, timeliness, coherence, and validation of statistical data.' },
  // TECHNICAL
  { name: 'Python', category: 'TECHNICAL', description: 'Python programming for data processing and analysis.' },
  { name: 'R', category: 'TECHNICAL', description: 'R programming for statistical computing.' },
  { name: 'SQL', category: 'TECHNICAL', description: 'Relational database querying and management.' },
  { name: 'Stata', category: 'TECHNICAL', description: 'Stata for statistical analysis.' },
  { name: 'SPSS', category: 'TECHNICAL', description: 'SPSS for statistical analysis.' },
  { name: 'SAS', category: 'TECHNICAL', description: 'SAS programming for data analytics.' },
  { name: 'GIS', category: 'TECHNICAL', description: 'Geographic Information Systems for spatial statistics.' },
  { name: 'Data Visualization', category: 'TECHNICAL', description: 'Communicating data through charts and dashboards.' },
  { name: 'AI/ML', category: 'TECHNICAL', description: 'Applied machine learning for official statistics.' },
  { name: 'Cloud', category: 'TECHNICAL', description: 'Cloud infrastructure for data processing.' },
  { name: 'APIs', category: 'TECHNICAL', description: 'Designing and consuming web APIs.' },
  { name: 'Open Data', category: 'TECHNICAL', description: 'Open government data publication practices.' },
  // DIGITAL GOVERNANCE
  { name: 'Cybersecurity', category: 'DIGITAL_GOVERNANCE', description: 'Protecting government data systems from cyber threats.' },
  { name: 'Data Privacy', category: 'DIGITAL_GOVERNANCE', description: 'Personal data protection and privacy compliance.' },
  { name: 'Digital Signatures', category: 'DIGITAL_GOVERNANCE', description: 'PKI and digital signature verification.' },
  { name: 'Government Cloud', category: 'DIGITAL_GOVERNANCE', description: 'GI Cloud (Meghraj) and government cloud services.' },
  { name: 'Digital Public Infrastructure', category: 'DIGITAL_GOVERNANCE', description: 'DPI building blocks such as Aadhaar and DigiLocker.' },
  // BEHAVIOURAL / MANAGERIAL
  { name: 'Leadership', category: 'BEHAVIOURAL_MANAGERIAL', description: 'Leading teams and initiatives effectively.' },
  { name: 'Communication', category: 'BEHAVIOURAL_MANAGERIAL', description: 'Clear written and verbal communication.' },
  { name: 'Project Management', category: 'BEHAVIOURAL_MANAGERIAL', description: 'Planning and delivering projects on schedule.' },
  { name: 'Ethics', category: 'BEHAVIOURAL_MANAGERIAL', description: 'Ethical conduct and confidentiality in official statistics.' },
  { name: 'Decision Making', category: 'BEHAVIOURAL_MANAGERIAL', description: 'Evidence-based decision making.' },
  { name: 'Change Management', category: 'BEHAVIOURAL_MANAGERIAL', description: 'Leading and adapting to organizational change.' },
];

// Demo baseline competency scores for the primary demo learner (matches the
// worked example in the project brief so the dashboard looks realistic
// immediately after seeding).
const DEMO_LEVELS = {
  'Survey Design': 70,
  Sampling: 62,
  'National Accounts': 45,
  'Price Statistics': 50,
  'Labour Statistics': 40,
  'Agricultural Statistics': 35,
  'Industrial Statistics': 38,
  'SDG Indicators': 48,
  'Metadata Standards': 42,
  'Data Quality': 55,
  Python: 58,
  R: 30,
  SQL: 64,
  Stata: 25,
  SPSS: 20,
  SAS: 15,
  GIS: 28,
  'Data Visualization': 72,
  'AI/ML': 38,
  Cloud: 33,
  APIs: 40,
  'Open Data': 45,
  Cybersecurity: 50,
  'Data Privacy': 47,
  'Digital Signatures': 30,
  'Government Cloud': 25,
  'Digital Public Infrastructure': 35,
  Leadership: 55,
  Communication: 68,
  'Project Management': 52,
  Ethics: 75,
  'Decision Making': 58,
  'Change Management': 44,
};

const IGOT_COURSES = [
  { title: 'Data Quality and Official Statistics', competency: 'Data Quality', level: 'INTERMEDIATE', durationHrs: 4, description: 'Frameworks and checklists for assessing and improving statistical data quality.' },
  { title: 'Foundations of Sample Survey Design', competency: 'Survey Design', level: 'BEGINNER', durationHrs: 6, description: 'Core principles of designing representative, unbiased surveys.' },
  { title: 'Advanced Sampling Techniques', competency: 'Sampling', level: 'ADVANCED', durationHrs: 8, description: 'Stratified, cluster, and multi-stage sampling for national surveys.' },
  { title: 'Understanding National Accounts', competency: 'National Accounts', level: 'BEGINNER', durationHrs: 5, description: 'Introduction to GDP, GVA, and national income compilation.' },
  { title: 'Price Index Construction Masterclass', competency: 'Price Statistics', level: 'INTERMEDIATE', durationHrs: 6, description: 'Building and maintaining CPI and WPI indices.' },
  { title: 'Labour Force Survey Methodology', competency: 'Labour Statistics', level: 'INTERMEDIATE', durationHrs: 5, description: 'Measuring employment, unemployment, and workforce participation.' },
  { title: 'Agricultural Census Essentials', competency: 'Agricultural Statistics', level: 'BEGINNER', durationHrs: 4, description: 'Crop production and yield estimation methods.' },
  { title: 'Index of Industrial Production Explained', competency: 'Industrial Statistics', level: 'INTERMEDIATE', durationHrs: 4, description: 'Constructing and interpreting the IIP.' },
  { title: 'SDG Indicator Reporting for Statisticians', competency: 'SDG Indicators', level: 'INTERMEDIATE', durationHrs: 5, description: 'Aligning national data with global SDG indicator frameworks.' },
  { title: 'SDMX Metadata Fundamentals', competency: 'Metadata Standards', level: 'BEGINNER', durationHrs: 3, description: 'Introduction to statistical metadata exchange standards.' },
  { title: 'Python for Official Statistics', competency: 'Python', level: 'BEGINNER', durationHrs: 10, description: 'Data wrangling and analysis in Python with pandas.' },
  { title: 'Applied Python for Data Pipelines', competency: 'Python', level: 'INTERMEDIATE', durationHrs: 8, description: 'Building repeatable data processing pipelines in Python.' },
  { title: 'R for Statistical Computing', competency: 'R', level: 'BEGINNER', durationHrs: 8, description: 'Statistical analysis and visualization using R.' },
  { title: 'SQL for Official Statistics', competency: 'SQL', level: 'BEGINNER', durationHrs: 6, description: 'Querying and managing relational statistical databases.' },
  { title: 'Advanced SQL for Analysts', competency: 'SQL', level: 'ADVANCED', durationHrs: 6, description: 'Window functions, CTEs, and query optimization.' },
  { title: 'Stata Essentials', competency: 'Stata', level: 'BEGINNER', durationHrs: 5, description: 'Data management and analysis in Stata.' },
  { title: 'SPSS for Survey Analysis', competency: 'SPSS', level: 'BEGINNER', durationHrs: 5, description: 'Analyzing survey data using SPSS.' },
  { title: 'SAS Programming Basics', competency: 'SAS', level: 'BEGINNER', durationHrs: 6, description: 'Introduction to SAS for statistical data processing.' },
  { title: 'GIS for Spatial Statistics', competency: 'GIS', level: 'INTERMEDIATE', durationHrs: 7, description: 'Mapping and analyzing spatial statistical data.' },
  { title: 'Data Visualization for Decision Makers', competency: 'Data Visualization', level: 'INTERMEDIATE', durationHrs: 5, description: 'Designing clear, honest charts and dashboards.' },
  { title: 'AI/ML Fundamentals for Statisticians', competency: 'AI/ML', level: 'BEGINNER', durationHrs: 8, description: 'Core machine learning concepts applied to official statistics.' },
  { title: 'Applied Machine Learning for Forecasting', competency: 'AI/ML', level: 'INTERMEDIATE', durationHrs: 10, description: 'Using ML models for statistical forecasting.' },
  { title: 'Cloud Computing for Government Data', competency: 'Cloud', level: 'BEGINNER', durationHrs: 4, description: 'Cloud fundamentals for public-sector data systems.' },
  { title: 'Designing REST APIs for Data Services', competency: 'APIs', level: 'INTERMEDIATE', durationHrs: 5, description: 'Building APIs to serve statistical data.' },
  { title: 'Open Government Data Practices', competency: 'Open Data', level: 'BEGINNER', durationHrs: 3, description: 'Publishing statistical data as open data.' },
  { title: 'Cybersecurity Essentials for Public Servants', competency: 'Cybersecurity', level: 'BEGINNER', durationHrs: 4, description: 'Protecting government information systems.' },
  { title: 'Data Privacy and Protection Compliance', competency: 'Data Privacy', level: 'INTERMEDIATE', durationHrs: 4, description: 'Handling personal data in compliance with privacy law.' },
  { title: 'Digital Signatures and PKI', competency: 'Digital Signatures', level: 'BEGINNER', durationHrs: 3, description: 'Understanding digital signature verification.' },
  { title: 'Introduction to GI Cloud (Meghraj)', competency: 'Government Cloud', level: 'BEGINNER', durationHrs: 3, description: 'Overview of India\'s government cloud initiative.' },
  { title: 'Digital Public Infrastructure Overview', competency: 'Digital Public Infrastructure', level: 'BEGINNER', durationHrs: 4, description: 'Aadhaar, DigiLocker, and DPI building blocks.' },
  { title: 'Leadership for Statistical Officers', competency: 'Leadership', level: 'INTERMEDIATE', durationHrs: 6, description: 'Leading teams within government statistical offices.' },
  { title: 'Effective Communication for Public Servants', competency: 'Communication', level: 'BEGINNER', durationHrs: 3, description: 'Report writing and stakeholder communication.' },
  { title: 'Project Management for Statistical Programs', competency: 'Project Management', level: 'INTERMEDIATE', durationHrs: 6, description: 'Planning and delivering statistical survey programs.' },
  { title: 'Ethics in Official Statistics', competency: 'Ethics', level: 'BEGINNER', durationHrs: 2, description: 'Confidentiality and ethical conduct in data collection.' },
  { title: 'Evidence-Based Decision Making', competency: 'Decision Making', level: 'INTERMEDIATE', durationHrs: 4, description: 'Using data effectively in policy decisions.' },
  { title: 'Leading Organizational Change', competency: 'Change Management', level: 'ADVANCED', durationHrs: 5, description: 'Managing change within statistical organizations.' },
];

const DEMO_LEARNERS = [
  {
    email: 'learner@demo.gov.in',
    password: 'Learner@123',
    name: 'Anjali Verma',
    department: 'Official Statistics',
    organization: 'Ministry of Statistics and Programme Implementation',
    experience: 3,
    currentRole: 'Statistical Officer',
    targetRole: 'Senior Statistical Officer',
    learningGoals: 'Strengthen data quality practices and grow into AI/ML-assisted statistical analysis.',
    useDemoLevels: true,
  },
  {
    email: 'r.iyer@demo.gov.in',
    password: 'Learner@123',
    name: 'Ravi Iyer',
    department: 'National Accounts',
    organization: 'Central Statistics Office',
    experience: 5,
    currentRole: 'Statistical Officer',
    targetRole: 'Senior Statistical Officer',
    learningGoals: 'Improve technical skills in Python and SQL for national accounts compilation.',
    useDemoLevels: false,
  },
  {
    email: 's.gupta@demo.gov.in',
    password: 'Learner@123',
    name: 'Sanjana Gupta',
    department: 'Labour Statistics',
    organization: 'Ministry of Labour and Employment',
    experience: 2,
    currentRole: 'Junior Statistical Officer',
    targetRole: 'Statistical Officer',
    learningGoals: 'Build foundational data analysis and visualization skills.',
    useDemoLevels: false,
  },
  {
    email: 'k.das@demo.gov.in',
    password: 'Learner@123',
    name: 'Kabir Das',
    department: 'Price Statistics',
    organization: 'National Statistical Office',
    experience: 6,
    currentRole: 'Statistical Officer',
    targetRole: 'Data Analyst',
    learningGoals: 'Transition toward advanced analytics and machine learning roles.',
    useDemoLevels: false,
  },
];

async function main() {
  console.log('Seeding competencies...');
  const competencyRecords = {};
  for (const c of COMPETENCIES) {
    const rec = await prisma.competency.upsert({
      where: { name: c.name },
      update: { category: c.category, description: c.description },
      create: c,
    });
    competencyRecords[c.name] = rec;
  }

  console.log('Seeding iGOT-aligned training catalog...');
  await prisma.course.deleteMany({});
  for (const course of IGOT_COURSES) {
    const competency = competencyRecords[course.competency];
    if (!competency) continue;
    await prisma.course.create({
      data: {
        title: course.title,
        description: course.description,
        competencyId: competency.id,
        level: course.level,
        durationHrs: course.durationHrs,
        source: 'iGOT-aligned Training Catalog',
      },
    });
  }

  console.log('Seeding admin user...');
  const adminPasswordHash = await bcrypt.hash('Admin@123', Number(process.env.BCRYPT_SALT_ROUNDS || 10));
  await prisma.user.upsert({
    where: { email: 'admin@demo.gov.in' },
    update: {},
    create: {
      email: 'admin@demo.gov.in',
      password: adminPasswordHash,
      name: 'Admin User',
      role: 'ADMIN',
    },
  });

  console.log('Seeding learners...');
  for (const learner of DEMO_LEARNERS) {
    const passwordHash = await bcrypt.hash(learner.password, Number(process.env.BCRYPT_SALT_ROUNDS || 10));
    const user = await prisma.user.upsert({
      where: { email: learner.email },
      update: {},
      create: {
        email: learner.email,
        password: passwordHash,
        name: learner.name,
        role: 'LEARNER',
      },
    });

    await prisma.learnerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        department: learner.department,
        organization: learner.organization,
        experience: learner.experience,
        currentRole: learner.currentRole,
        targetRole: learner.targetRole,
        learningGoals: learner.learningGoals,
      },
    });

    for (const [name, competency] of Object.entries(competencyRecords)) {
      let currentLevel;
      if (learner.useDemoLevels) {
        currentLevel = DEMO_LEVELS[name] ?? 40;
      } else {
        // Deterministic-but-varied pseudo-random level per learner/competency
        // so every seeded learner looks distinct without being hardcoded per field.
        const seed = `${learner.email}:${name}`.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        currentLevel = 25 + (seed % 55);
      }

      await prisma.learnerCompetency.upsert({
        where: { userId_competencyId: { userId: user.id, competencyId: competency.id } },
        update: { currentLevel },
        create: { userId: user.id, competencyId: competency.id, currentLevel, requiredLevel: 65 },
      });
    }
  }

  console.log('Seeding baseline assessment...');
  const assessment = await prisma.assessment.upsert({
    where: { id: 'seed-baseline-assessment' },
    update: {},
    create: {
      id: 'seed-baseline-assessment',
      title: 'Baseline Competency Assessment',
      type: 'INITIAL',
    },
  });

  const existingQuestions = await prisma.assessmentQuestion.count({ where: { assessmentId: assessment.id } });
  if (existingQuestions === 0) {
    const baselineQuestions = [
      {
        competency: 'Survey Design',
        question: 'What is the primary purpose of a pilot survey?',
        options: ['To finalize the budget', 'To test and refine the survey instrument before full rollout', 'To publish preliminary results', 'To train field staff only'],
        correctAnswer: 1,
        difficulty: 'MEDIUM',
        explanation: 'A pilot survey tests the questionnaire, logistics, and procedures on a small scale to identify issues before the full survey.',
      },
      {
        competency: 'Sampling',
        question: 'Stratified sampling is most useful when:',
        options: ['The population is completely homogeneous', 'The population contains distinct, internally homogeneous subgroups', 'No sampling frame is available', 'Budget is unlimited'],
        correctAnswer: 1,
        difficulty: 'MEDIUM',
        explanation: 'Stratified sampling divides a heterogeneous population into homogeneous strata, improving precision.',
      },
      {
        competency: 'Data Quality',
        question: 'Which of these is NOT typically a dimension of data quality?',
        options: ['Accuracy', 'Timeliness', 'File color scheme', 'Coherence'],
        correctAnswer: 2,
        difficulty: 'EASY',
        explanation: 'Standard data quality dimensions include accuracy, timeliness, coherence, comparability, and accessibility — not presentation styling.',
      },
      {
        competency: 'Python',
        question: 'Which Python library is most commonly used for DataFrame-based analysis?',
        options: ['pandas', 'flask', 'requests', 'pytest'],
        correctAnswer: 0,
        difficulty: 'EASY',
        explanation: 'pandas provides the DataFrame structure purpose-built for tabular data analysis.',
      },
      {
        competency: 'SQL',
        question: 'Which SQL clause filters rows AFTER aggregation?',
        options: ['WHERE', 'HAVING', 'ORDER BY', 'GROUP BY'],
        correctAnswer: 1,
        difficulty: 'MEDIUM',
        explanation: 'HAVING filters aggregated groups, while WHERE filters rows before aggregation.',
      },
      {
        competency: 'AI/ML',
        question: 'In supervised machine learning, the model learns from:',
        options: ['Unlabeled data only', 'Labeled input-output pairs', 'Random noise', 'Manual rules only'],
        correctAnswer: 1,
        difficulty: 'MEDIUM',
        explanation: 'Supervised learning trains a model on labeled examples so it can predict outputs for new inputs.',
      },
      {
        competency: 'Price Statistics',
        question: 'The Consumer Price Index (CPI) primarily measures:',
        options: ['Industrial output', 'Changes in the price level of a consumer goods basket', 'Population growth', 'Export volumes'],
        correctAnswer: 1,
        difficulty: 'EASY',
        explanation: 'CPI tracks the average change in prices paid by consumers for a representative basket of goods and services.',
      },
      {
        competency: 'Data Visualization',
        question: 'Which chart type is generally best for showing a trend over time?',
        options: ['Pie chart', 'Line chart', 'Scatter plot without axes', 'Word cloud'],
        correctAnswer: 1,
        difficulty: 'EASY',
        explanation: 'Line charts naturally represent ordered, continuous change over time.',
      },
      {
        competency: 'National Accounts',
        question: 'GVA (Gross Value Added) differs from GDP primarily because:',
        options: ['GVA excludes taxes on products and includes subsidies', 'GVA only measures exports', 'GVA is calculated annually only', 'There is no difference'],
        correctAnswer: 0,
        difficulty: 'HARD',
        explanation: 'GDP = GVA + taxes on products − subsidies on products.',
      },
      {
        competency: 'SDG Indicators',
        question: 'SDG indicator frameworks primarily help countries:',
        options: ['Design corporate logos', 'Report comparable progress on Sustainable Development Goals', 'Set import tariffs', 'Manage payroll systems'],
        correctAnswer: 1,
        difficulty: 'MEDIUM',
        explanation: 'SDG indicator frameworks standardize definitions and methods so global progress is comparable across countries.',
      },
    ];

    for (const q of baselineQuestions) {
      const competency = competencyRecords[q.competency];
      if (!competency) continue;
      await prisma.assessmentQuestion.create({
        data: {
          assessmentId: assessment.id,
          competencyId: competency.id,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          difficulty: q.difficulty,
          explanation: q.explanation,
        },
      });
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
