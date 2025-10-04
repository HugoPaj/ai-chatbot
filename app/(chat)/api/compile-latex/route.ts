import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:document').toResponse();
  }

  try {
    const { latex } = await request.json();

    if (!latex || typeof latex !== 'string') {
      return new ChatSDKError(
        'bad_request:api',
        'LaTeX content is required',
      ).toResponse();
    }

    // Use LaTeX.Online API to compile LaTeX to PDF
    const encodedLatex = encodeURIComponent(latex);
    const compileUrl = `https://latexonline.cc/compile?text=${encodedLatex}&command=pdflatex`;

    const response = await fetch(compileUrl, {
      method: 'GET',
    });

    if (!response.ok) {
      // If the compilation fails, try to get error details
      const errorText = await response.text();
      console.error('LaTeX compilation error:', errorText);

      return new ChatSDKError(
        'internal_server_error:api',
        'Failed to compile LaTeX document. Please check your LaTeX syntax.',
      ).toResponse();
    }

    // Get the PDF blob
    const pdfBlob = await response.blob();

    // Return the PDF with appropriate headers
    return new Response(pdfBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="document.pdf"',
      },
    });
  } catch (error: any) {
    console.error('Error compiling LaTeX:', error);
    return new ChatSDKError(
      'internal_server_error:api',
      error.message || 'An error occurred while compiling LaTeX',
    ).toResponse();
  }
}
