import { describe, expect, it } from 'vitest';
import { buildGoalWorkspace, type GoalRecord } from './goal-workspace';

const goal = (changes: Partial<GoalRecord> = {}): GoalRecord => ({ id: 'g', name: 'Emergency Fund', goalType: 'emergency_fund', targetAmount: 1000, currentAmount: 800, priority: 1, targetDate: '', ...changes });

describe('goal workspace model', () => {
  it('summarizes and sorts goals by completion', () => {
    const model = buildGoalWorkspace([goal(), goal({ id: 'b', name: 'Trip', currentAmount: 900 })], [], new Date('2026-01-01'));
    expect(model.totalGoals).toBe(2);
    expect(model.totalSaved).toBe(1700);
    expect(model.sections['Closest to Completion'].map(item => item.name)).toEqual(['Trip', 'Emergency Fund']);
  });

  it('projects completion from contribution history and identifies inactivity', () => {
    const model = buildGoalWorkspace([goal({ currentAmount: 200 })], [{ id: 'c', goalId: 'g', amount: 100, contributedOn: '2025-10-01', createdAt: '2025-10-01T12:00:00Z' }], new Date('2026-01-01'));
    expect(model.items[0].estimatedCompletionDate).toBeTruthy();
    expect(model.items[0].recommendation).toContain('90 days');
  });

  it('places new and completed goals in their sections', () => {
    const model = buildGoalWorkspace([goal({ id: 'new', currentAmount: 50 }), goal({ id: 'done', currentAmount: 1000 })], [], new Date('2026-01-01'));
    expect(model.sections['Just Started']).toHaveLength(1);
    expect(model.sections.Completed).toHaveLength(1);
  });
});
