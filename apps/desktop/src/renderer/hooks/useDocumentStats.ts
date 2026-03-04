/**
 * Document statistics hook — computes line count, word count, character count,
 * and estimated reading time for mixed Chinese/English content
 */
import { useMemo } from 'react';

export interface DocumentStats {
  lineCount: number;
  wordCount: number;
  characterCount: number;
  estimatedReadingMinutes: number;
}

const WORDS_PER_MINUTE = 200;

export function useDocumentStats(content: string | undefined): DocumentStats {
  return useMemo(() => {
    if (!content || typeof content !== 'string') {
      return {
        lineCount: 0,
        wordCount: 0,
        characterCount: 0,
        estimatedReadingMinutes: 0,
      };
    }

    const lineCount = content.split('\n').length;
    const characterCount = content.length;

    // Mixed Chinese/English word count
    const chineseCharCount = (content.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = content
      .replace(/[\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    const wordCount = chineseCharCount + englishWords;

    const estimatedReadingMinutes = Math.max(
      1,
      Math.ceil(wordCount / WORDS_PER_MINUTE)
    );

    return { lineCount, wordCount, characterCount, estimatedReadingMinutes };
  }, [content]);
}
