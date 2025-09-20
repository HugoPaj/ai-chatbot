import { tool, experimental_generateImage } from 'ai';
import { z } from 'zod/v3';
import type { Session } from 'next-auth';
import { myProvider } from '@/lib/ai/providers';

interface GenerateImageProps {
  session: Session;
}

export const generateImage = ({ session }: GenerateImageProps) =>
  tool({
    description:
      'Generate an image based on a text prompt. Use this when the user asks to create, generate, or make an image.',
    inputSchema: z.object({
      prompt: z
        .string()
        .describe('The detailed description of the image to generate'),
      style: z
        .enum([
          'realistic',
          'artistic',
          'cartoon',
          'photorealistic',
          'abstract',
        ])
        .optional()
        .describe('The style of the image to generate'),
    }),
    execute: async ({ prompt, style }) => {
      try {
        // Enhance prompt with style if provided
        const enhancedPrompt = style ? `${prompt}, ${style} style` : prompt;

        const { image } = await experimental_generateImage({
          model: myProvider.imageModel('image-model'),
          prompt: enhancedPrompt,
          n: 1,
        });

        return {
          prompt: enhancedPrompt,
          imageData: image.base64,
          message: `Generated an image based on: "${enhancedPrompt}"`,
        };
      } catch (error) {
        throw new Error(
          `Error generating image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  });
