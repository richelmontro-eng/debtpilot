import { describe, expect, it } from 'vitest';
import { getAuthenticatedDestination, getResumeStep, getWelcomeAction } from './onboarding';

describe('onboarding routing', () => {
  it('redirects a new user to welcome', () => expect(getAuthenticatedDestination(null)).toBe('/welcome'));
  it('resumes a partial setup', () => {
    expect(getResumeStep({ onboarding_step: 3 })).toBe(3);
    expect(getWelcomeAction({ onboarding_step: 3 })).toBe('Continue Setup');
  });
  it('allows a completed user onto the dashboard', () => {
    expect(getAuthenticatedDestination({ onboarding_completed: true })).toBe('/');
  });
});
