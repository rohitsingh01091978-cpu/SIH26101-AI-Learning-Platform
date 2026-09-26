/**
 * Small supplementary question bank used ONLY when an uploaded document is
 * too short to yield the requested number of grounded MCQs on its own.
 * Every question generated this way is tagged sourceReference: "Prototype
 * demo bank" so the UI can clearly distinguish it from document-grounded
 * questions — it never silently pretends to be extracted from the file.
 */
const DEMO_QUESTION_BANK = [
  {
    question: 'In official statistics, what does "sampling frame" refer to?',
    options: [
      'The list or structure from which a sample is drawn',
      'The final published statistical report',
      'A software tool for data visualization',
      'The budget allocated to a survey',
    ],
    correctAnswer: 0,
    explanation: 'A sampling frame is the source list of units (e.g., households, establishments) from which a statistical sample is actually selected.',
    topic: 'Sampling',
    competency: 'Sampling',
    difficulty: 'MEDIUM',
  },
  {
    question: 'Which of the following best defines "data quality" in a statistical system?',
    options: [
      'The volume of data collected',
      'The fitness of data for its intended use, covering accuracy, timeliness, and coherence',
      'The number of respondents in a survey',
      'The speed at which data is uploaded to a portal',
    ],
    correctAnswer: 1,
    explanation: 'Data quality is a multi-dimensional concept (accuracy, timeliness, comparability, coherence, accessibility) describing whether data is fit for its intended use.',
    topic: 'Data Quality',
    competency: 'Data Quality',
    difficulty: 'MEDIUM',
  },
  {
    question: 'What is the primary purpose of the Consumer Price Index (CPI)?',
    options: [
      'To measure industrial output',
      'To track changes in the price level of a basket of consumer goods and services',
      'To measure population growth',
      'To calculate GDP directly',
    ],
    correctAnswer: 1,
    explanation: 'CPI measures the average change over time in prices paid by consumers for a representative basket of goods and services.',
    topic: 'Price Statistics',
    competency: 'Price Statistics',
    difficulty: 'EASY',
  },
  {
    question: 'In Python, which library is most commonly used for tabular data analysis?',
    options: ['pandas', 'flask', 'requests', 'pytest'],
    correctAnswer: 0,
    explanation: 'pandas provides DataFrame structures purpose-built for reading, cleaning, and analyzing tabular data.',
    topic: 'Python',
    competency: 'Python',
    difficulty: 'EASY',
  },
  {
    question: 'Which SQL clause is used to filter grouped rows after aggregation?',
    options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'],
    correctAnswer: 1,
    explanation: 'HAVING filters groups produced by GROUP BY, whereas WHERE filters rows before aggregation.',
    topic: 'SQL',
    competency: 'SQL',
    difficulty: 'MEDIUM',
  },
  {
    question: 'What does the "gap" mean in a competency gap analysis?',
    options: [
      'The difference between required competency level and current competency level',
      'The number of courses completed',
      'The time taken to complete an assessment',
      'The number of learners in a department',
    ],
    correctAnswer: 0,
    explanation: 'Competency gap = required level − current level; a positive gap indicates the learner falls short of the target proficiency.',
    topic: 'Competency Framework',
    competency: 'Data Quality',
    difficulty: 'EASY',
  },
  {
    question: 'Which SDG indicator framework component ensures countries report comparable statistics?',
    options: ['Metadata standards', 'Marketing plans', 'Server hardware specs', 'UI color palettes'],
    correctAnswer: 0,
    explanation: 'Metadata standards (definitions, classifications, methods) allow SDG indicators to be compared consistently across countries.',
    topic: 'SDG Indicators',
    competency: 'SDG Indicators',
    difficulty: 'HARD',
  },
  {
    question: 'What is stratified sampling primarily used for?',
    options: [
      'Reducing sampling error by dividing the population into homogeneous subgroups before sampling',
      'Increasing survey cost',
      'Avoiding the need for a sampling frame',
      'Replacing random sampling entirely in all cases',
    ],
    correctAnswer: 0,
    explanation: 'Stratified sampling divides a population into strata that are internally homogeneous, then samples within each, which typically reduces variance versus simple random sampling.',
    topic: 'Sampling',
    competency: 'Sampling',
    difficulty: 'MEDIUM',
  },
];

function pickFallbackQuestions(count, excludeQuestions = []) {
  const excluded = new Set(excludeQuestions);
  const pool = DEMO_QUESTION_BANK.filter((q) => !excluded.has(q.question));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((q) => ({ ...q, sourceReference: 'Prototype demo bank' }));
}

module.exports = { DEMO_QUESTION_BANK, pickFallbackQuestions };
