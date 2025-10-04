import { z } from 'zod/v3';
import { streamObject } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { updateDocumentPrompt } from '@/lib/ai/prompts';
import { createDocumentHandler } from '@/lib/artifacts/server';

const latexPrompt = `
You are a LaTeX document generator. Create well-structured LaTeX documents based on the user's request.

Guidelines:
- Always include a complete, compilable LaTeX document with \\documentclass, \\begin{document}, and \\end{document}
- Use appropriate document classes (article, report, book, beamer for presentations)
- Include necessary packages (amsmath for math, graphicx for images, etc.)
- Structure content with sections, subsections, etc.
- Use proper LaTeX formatting for equations, lists, tables, and references
- Add comments to explain complex sections
- Ensure the document will compile with pdflatex

Example structure:
\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\title{Title Here}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Content here...

\\end{document}
`;

export const latexDocumentHandler = createDocumentHandler<'latex'>({
  kind: 'latex',
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamObject({
      model: myProvider.languageModel('artifact-model'),
      system: latexPrompt,
      prompt: title,
      schema: z.object({
        latex: z.string(),
      }),
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'object') {
        const { object } = delta;
        const { latex } = object;

        if (latex) {
          dataStream.write({
            type: 'data-latex-delta',
            data: latex ?? '',
            transient: true,
          });

          draftContent = latex;
        }
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamObject({
      model: myProvider.languageModel('artifact-model'),
      system: updateDocumentPrompt(document.content, 'latex'),
      prompt: description,
      schema: z.object({
        latex: z.string(),
      }),
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'object') {
        const { object } = delta;
        const { latex } = object;

        if (latex) {
          dataStream.write({
            type: 'data-latex-delta',
            data: latex ?? '',
            transient: true,
          });

          draftContent = latex;
        }
      }
    }

    return draftContent;
  },
});
