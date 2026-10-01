import { anthropic } from '@ai-sdk/anthropic';
import { createUIMessageStreamResponse, streamText, toUIMessageStream } from 'ai';

// تحديد الحد الأقصى لوقت الاستجابة (30 ثانية)
export const maxDuration = 30;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-5-5'),
    prompt: prompt,
  });

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}