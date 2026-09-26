-- AlterTable: add uniqueness guards preventing duplicate answer submissions
CREATE UNIQUE INDEX "question_responses_quizAttemptId_quizQuestionId_key" ON "question_responses"("quizAttemptId", "quizQuestionId");
CREATE UNIQUE INDEX "question_responses_assessmentAttemptId_assessmentQuestio_key" ON "question_responses"("assessmentAttemptId", "assessmentQuestionId");
