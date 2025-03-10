import matchingConfig from './config/matching-config.json';
import type { Task } from './types';

export interface MatchingPattern {
  meeting: string[];
  task: string[];
  description: string;
}

export function findKeywordMatches(meetingTitle: string, task: Task): { matched: boolean; reason: string } {
  meetingTitle = meetingTitle.toLowerCase();
  const taskTitle = task.title.toLowerCase();
  const taskProject = task.project.toLowerCase();
  const taskModule = task.module.toLowerCase();
  
  // Split meeting title into keywords
  const meetingKeywords = meetingTitle.split(/[\s-_]+/).filter(k => k.length > 1);
  
  // Split task details into keywords
  const taskKeywords = [
    ...taskTitle.split(/[\s-_]+/),
    ...taskProject.split(/[\s-_]+/),
    ...taskModule.split(/[\s-_]+/)
  ].filter(k => k.length > 1);

  // Check for keyword matches
  const matchedKeywords = meetingKeywords.filter(mk => 
    taskKeywords.some(tk => tk.includes(mk) || mk.includes(tk))
  );

  if (matchedKeywords.length > 0) {
    return {
      matched: true,
      reason: `Found keyword matches: ${matchedKeywords.join(', ')} between meeting "${meetingTitle}" and task "${taskTitle}" (${taskProject})`
    };
  }

  // Check common patterns from config
  for (const pattern of matchingConfig.commonPatterns) {
    const meetingHasPattern = pattern.meeting.some(m => meetingTitle.includes(m));
    const taskHasPattern = pattern.task.some(t => 
      taskTitle.includes(t) || taskProject.includes(t) || taskModule.includes(t)
    );

    if (meetingHasPattern && taskHasPattern) {
      return {
        matched: true,
        reason: `Matched common pattern "${pattern.meeting[0]}" between meeting "${meetingTitle}" and task "${taskTitle}" (${taskProject})`
      };
    }
  }

  return { matched: false, reason: '' };
}

export function generateMatchingPrompt(meetingTitle: string, tasks: Task[]): string {
  const taskList = tasks.map((task, index) => 
    `${index + 1}. ${task.title} (Project: ${task.project}, Module: ${task.module}, Status: ${task.status})`
  ).join('\n');

  const matchingRules = matchingConfig.matchingRules.map((rule, index) => 
    `${index + 1}. ${rule}`
  ).join('\n');

  return matchingConfig.promptTemplate
    .replace('{meetingTitle}', meetingTitle)
    .replace('{taskList}', taskList)
    .replace('{matchingRules}', matchingRules);
} 