export type GoalRecord = { id: string; name: string; goalType: string; targetAmount: number; currentAmount: number; priority: number; targetDate: string };
export type GoalContribution = { id: string; goalId: string; amount: number; contributedOn: string; createdAt: string };
export type GoalSection = 'Closest to Completion' | 'In Progress' | 'Just Started' | 'Completed';
export type GoalWorkspaceItem = GoalRecord & { progress: number; remaining: number; section: GoalSection; estimatedCompletionDate: string | null; recommendation: string; contributions: GoalContribution[]; averagePerContribution: number; daysSinceContribution: number | null };

const dayMs = 86_400_000;
function dateOnly(value: Date) { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }
function validDate(value: string) { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? null : date; }
function monthYear(date: Date | null) { return date?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) ?? null; }

export function buildGoalWorkspace(goals: GoalRecord[], contributions: GoalContribution[], now = new Date()) {
  const today = dateOnly(now);
  const items: GoalWorkspaceItem[] = goals.map(goal => {
    const history = contributions.filter(item => item.goalId === goal.id).sort((a, b) => b.contributedOn.localeCompare(a.contributedOn) || b.createdAt.localeCompare(a.createdAt));
    const progress = goal.targetAmount > 0 ? Math.min(100, Math.max(0, goal.currentAmount / goal.targetAmount * 100)) : 0;
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    const averagePerContribution = history.length ? history.reduce((sum, item) => sum + item.amount, 0) / history.length : 0;
    const dates = [...new Set(history.map(item => item.contributedOn))].sort();
    const averageDays = dates.length > 1 ? Math.max(1, (validDate(dates.at(-1)!)!.getTime() - validDate(dates[0])!.getTime()) / dayMs / (dates.length - 1)) : 14;
    const projected = remaining <= 0 ? today : averagePerContribution > 0 ? new Date(today.getTime() + Math.ceil(remaining / averagePerContribution) * averageDays * dayMs) : validDate(goal.targetDate);
    const latest = history[0] ? validDate(history[0].contributedOn) : null;
    const daysSinceContribution = latest ? Math.max(0, Math.floor((today.getTime() - latest.getTime()) / dayMs)) : null;
    const section: GoalSection = progress >= 100 ? 'Completed' : progress >= 75 ? 'Closest to Completion' : progress <= 10 ? 'Just Started' : 'In Progress';
    const extra = Math.max(20, Math.round(Math.max(remaining * .02, averagePerContribution * .15) / 5) * 5);
    const recommendation = progress >= 100 ? 'Goal complete. Keep this money protected for its intended purpose.' : daysSinceContribution !== null && daysSinceContribution >= 45 ? `${goal.name} has had no contributions for ${daysSinceContribution} days. A small contribution can restart momentum.` : averagePerContribution > 0 ? `Adding ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(extra)} per contribution could bring the finish date forward.` : `Start with a contribution you can repeat each paycheck to build a reliable projection.`;
    return { ...goal, progress, remaining, section, estimatedCompletionDate: monthYear(projected), recommendation, contributions: history, averagePerContribution, daysSinceContribution };
  });
  const sectionNames: GoalSection[] = ['Closest to Completion', 'In Progress', 'Just Started', 'Completed'];
  const sections = Object.fromEntries(sectionNames.map(section => [section, items.filter(item => item.section === section).sort((a, b) => b.progress - a.progress || a.priority - b.priority)])) as Record<GoalSection, GoalWorkspaceItem[]>;
  const totalTarget = goals.reduce((sum, goal) => sum + Math.max(0, goal.targetAmount), 0);
  const totalSaved = goals.reduce((sum, goal) => sum + Math.max(0, goal.currentAmount), 0);
  const next = items.filter(item => item.progress < 100 && item.estimatedCompletionDate).sort((a, b) => (validDate(a.targetDate)?.getTime() ?? Infinity) - (validDate(b.targetDate)?.getTime() ?? Infinity) || b.progress - a.progress)[0] ?? items.filter(item => item.progress < 100).sort((a, b) => b.progress - a.progress)[0];
  const pilotNote = next?.estimatedCompletionDate ? `You're projected to reach ${next.name} in ${next.estimatedCompletionDate}.` : next ? next.recommendation : goals.length ? 'Every saved goal is complete. Choose what you want to build toward next.' : 'Add your first goal to start tracking progress.';
  return { totalGoals: goals.length, totalSaved, overallCompletion: totalTarget > 0 ? Math.min(100, Math.round(totalSaved / totalTarget * 100)) : 0, nextGoal: next?.name ?? 'All goals complete', nextGoalDate: next?.estimatedCompletionDate ?? null, pilotNote, sections, items };
}
