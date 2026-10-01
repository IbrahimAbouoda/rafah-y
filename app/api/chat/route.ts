import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function POST(req: Request) {
  const { messages } = await req.json();

 const result = streamText({
  model: anthropic('claude-sonnet-5-5'),
  messages,
});
  return result.toTextStreamResponse();
}