import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

// تحديد الحد الأقصى لوقت الاستجابة (30 ثانية)
export const maxDuration = 30;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    prompt: prompt,
  });

  return result.toDataStreamResponse();
}