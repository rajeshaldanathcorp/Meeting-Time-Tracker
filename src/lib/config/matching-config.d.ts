declare module '*/matching-config.json' {
  interface MatchingPattern {
    meeting: string[];
    task: string[];
    description: string;
  }

  interface MatchingConfig {
    commonPatterns: MatchingPattern[];
    matchingRules: string[];
    promptTemplate: string;
  }

  const config: MatchingConfig;
  export default config;
} 