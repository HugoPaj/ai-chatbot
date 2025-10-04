import { z } from 'zod/v3';
import { streamObject } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { updateDocumentPrompt } from '@/lib/ai/prompts';
import { createDocumentHandler } from '@/lib/artifacts/server';

const latexPrompt = `
You are an expert LaTeX document generator. Create professional, well-structured LaTeX documents based on the user's request.

Professional Formatting Guidelines:
- Always include a complete, compilable LaTeX document with \\documentclass, \\begin{document}, and \\end{document}
- Use appropriate document classes (article, report, book, beamer for presentations)
- Include essential packages for professional appearance:
  * amsmath, amssymb for mathematical notation
  * graphicx for images
  * hyperref for clickable links and references
  * geometry for proper margins (e.g., \\usepackage[margin=1in]{geometry})
  * fontenc and inputenc for proper character encoding
  * babel for language support when needed
  * booktabs for professional tables
  * caption for better figure/table captions
- Use proper document structure with clear hierarchy (sections, subsections, subsubsections)
- Format equations using proper LaTeX environments (equation, align, etc.)
- Create professional tables with \\toprule, \\midrule, \\bottomrule from booktabs
- Use proper spacing and paragraph formatting
- Include abstract for academic papers
- Add table of contents for longer documents (\\tableofcontents)
- Use proper citation styles when references are needed
- Ensure consistent formatting throughout
- Use professional typography (avoid excessive bold, italics, or capitalization)
- Ensure the document will compile with pdflatex

Example structure for academic paper:
\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage[margin=1in]{geometry}
\\usepackage{hyperref}
\\usepackage{booktabs}

\\title{Professional Title Here}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Brief summary of the document...
\\end{abstract}

\\tableofcontents

\\section{Introduction}
Content here with proper formatting...

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
