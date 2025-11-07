// response-quality.js
export class ResponseQuality {
  static checkResponseQuality(answer, question) {
    const issues = [];
    
    // Check for common problems
    if (answer.toLowerCase().includes('contact hr') && question.toLowerCase().includes('how')) {
      issues.push('Avoiding direct answer');
    }
    
    if (answer.length < 50 && !question.toLowerCase().includes('yes') && !question.toLowerCase().includes('no')) {
      issues.push('Response too brief');
    }
    
    if (answer.split('\n').length === 1 && answer.length > 150) {
      issues.push('Needs better formatting');
    }
    
    return {
      score: Math.max(0, 10 - issues.length * 2),
      issues,
      suggestions: this.getImprovementSuggestions(issues)
    };
  }
  
  static getImprovementSuggestions(issues) {
    const suggestions = [];
    
    if (issues.includes('Avoiding direct answer')) {
      suggestions.push('Provide specific policy details from context');
    }
    
    if (issues.includes('Response too brief')) {
      suggestions.push('Expand with relevant details from knowledge base');
    }
    
    if (issues.includes('Needs better formatting')) {
      suggestions.push('Use bullet points or sections for readability');
    }
    
    return suggestions;
  }
}