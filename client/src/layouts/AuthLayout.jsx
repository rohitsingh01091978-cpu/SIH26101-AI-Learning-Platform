import React from 'react';
import { Outlet } from 'react-router-dom';
import loginHero from '../assets/login-hero.png';

// The reference hero image already carries the project's own wordmark, title, tagline and the three
// feature cards baked into its composition - so nothing is duplicated as HTML on top of it, on either
// the desktop panel or the mobile banner (that would repeat the same words twice on the page).
// It is a static, local asset (bundled and hashed by Vite, no external URL) with real alt text so the
// content isn't lost for anyone who can't see images.
const HERO_ALT =
  'AI-Powered Learning & Competency Intelligence Platform - intelligent capacity building for India’s ' +
  'Official Statistical System. AI Content Intelligence: upload material and get grounded summaries, ' +
  'topics, and MCQs. Adaptive Assessment: question difficulty adjusts in real time to your responses. ' +
  'Personalized Competency Development: a learning path recomputed from your live skill gaps.';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface-subtle">
      <div className="grid min-h-screen lg:grid-cols-[1.3fr_1fr]">
        {/* Left: the reference hero image, full-bleed. object-cover fills the column at any viewport
            height (verified down to ~730px) without distorting the image; object-position keeps its
            left side (wordmark/title/feature cards) in frame rather than centering the crop. */}
        <div className="relative hidden overflow-hidden bg-surface-subtle lg:block">
          <img
            src={loginHero}
            alt={HERO_ALT}
            className="h-full w-full object-cover object-left"
          />
        </div>

        {/* Right: form. On everything narrower than lg, the same image sits above the card as a compact
            banner instead of the full panel - shown at its natural aspect ratio (no cropping) so nothing
            in it is stretched or clipped, per the source image's own 3:2 ratio. */}
        <div className="flex flex-col items-center justify-center px-4 py-10 sm:py-12">
          <div className="mb-6 w-full max-w-sm overflow-hidden rounded-xl shadow-card lg:hidden">
            <img src={loginHero} alt={HERO_ALT} className="block h-auto w-full" />
          </div>

          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
