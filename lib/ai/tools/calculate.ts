import { tool } from 'ai';
import { z } from 'zod/v3';
import { Sandbox } from '@e2b/code-interpreter';

export const calculate = tool({
  description:
    'Execute Python code to perform precise mathematical calculations, data analysis, or computational tasks. Use this tool when you need to perform calculations, work with numbers, analyze data, or solve mathematical problems.',
  inputSchema: z
    .object({
      code: z
        .string()
        .describe(
          'Python code to execute. The code should be self-contained and use print() to output results. You can use common libraries like numpy, pandas, matplotlib, etc.',
        ),
    })
    .describe('Python code execution parameters'),
  execute: async ({ code }) => {
    try {
      // Check if E2B API key is configured
      if (!process.env.E2B_API_KEY) {
        return 'Error: E2B_API_KEY is not configured. Please add it to your environment variables.';
      }

      // Create a new E2B sandbox
      const sandbox = await Sandbox.create();

      try {
        // Execute the Python code in the sandbox
        const execution = await sandbox.runCode(code);

        // Check for errors
        if (execution.error) {
          return `Error: ${execution.error.name}: ${execution.error.value}\n${execution.error.traceback}`;
        }

        // Collect all output (stdout, stderr, and results)
        const output = [];

        // Add any printed output
        if (execution.logs.stdout.length > 0) {
          output.push(execution.logs.stdout.join('\n'));
        }

        if (execution.logs.stderr.length > 0) {
          output.push(execution.logs.stderr.join('\n'));
        }

        // Add the result if there is one
        if (execution.results.length > 0) {
          const results = execution.results
            .map((result) => {
              if (result.text) {
                return result.text;
              }
              if (result.data) {
                return JSON.stringify(result.data);
              }
              return '';
            })
            .filter(Boolean);

          if (results.length > 0) {
            output.push(results.join('\n'));
          }
        }

        // Return the combined output
        const finalOutput = output.join('\n').trim();
        return finalOutput || 'Code executed successfully (no output)';
      } finally {
        // Always kill the sandbox to avoid resource leaks
        await sandbox.kill();
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
