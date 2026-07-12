export type OnboardingProfile = {
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
};

export function getAuthenticatedDestination(profile: OnboardingProfile | null) {
  return profile?.onboarding_completed ? '/' : '/welcome';
}

export function getResumeStep(profile: OnboardingProfile | null) {
  return Math.min(5, Math.max(1, Number(profile?.onboarding_step) || 1));
}

export function getWelcomeAction(profile: OnboardingProfile | null) {
  return Number(profile?.onboarding_step) > 0 ? 'Continue Setup' : 'Start Setup';
}
