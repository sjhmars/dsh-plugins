/** Minimal stub for @deepseek-ai/dsh-user-questions' UserQuestionError. */

export class UserQuestionError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'UserQuestionError'
    this.code = code
  }
}
