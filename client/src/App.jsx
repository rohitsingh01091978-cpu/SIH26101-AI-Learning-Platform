import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';

import Login from './pages/Login.jsx';
import LearnerDashboard from './pages/LearnerDashboard.jsx';
import Profile from './pages/Profile.jsx';
import CompetencyIntelligence from './pages/CompetencyIntelligence.jsx';
import CompetencyAssessment from './pages/CompetencyAssessment.jsx';
import SkillGaps from './pages/SkillGaps.jsx';
import LearningMaterials from './pages/LearningMaterials.jsx';
import MaterialDetail from './pages/MaterialDetail.jsx';
import AdaptiveQuiz from './pages/AdaptiveQuiz.jsx';
import QuizResults from './pages/QuizResults.jsx';
import LearningPath from './pages/LearningPath.jsx';
import IgotCourses from './pages/IgotCourses.jsx';
import Progress from './pages/Progress.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import NotFound from './pages/NotFound.jsx';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route
        element={
          <ProtectedRoute roles={['LEARNER']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<LearnerDashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/competency-intelligence" element={<CompetencyIntelligence />} />
        <Route path="/assessment" element={<CompetencyAssessment />} />
        <Route path="/skill-gaps" element={<SkillGaps />} />
        <Route path="/materials" element={<LearningMaterials />} />
        <Route path="/materials/:id" element={<MaterialDetail />} />
        <Route path="/quizzes/:id/take" element={<AdaptiveQuiz />} />
        <Route path="/quizzes/:id/results" element={<QuizResults />} />
        <Route path="/learning-path" element={<LearningPath />} />
        <Route path="/igot-courses" element={<IgotCourses />} />
        <Route path="/progress" element={<Progress />} />
      </Route>

      <Route
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminDashboard />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
