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

    // Use LaTeX-on-HTTP API to compile LaTeX to PDF
    // This service accepts POST requests with JSON payload
    const response = await fetch('https://latex.ytotech.com/builds/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        compiler: 'pdflatex',
        resources: [
          {
            main: true,
            content: latex,
          },
        ],
      }),
    });

    if (!response.ok) {
      // If the compilation fails, try to get error details
      const errorText = await response.text();
      console.error('LaTeX compilation error:', errorText);

      return new ChatSDKError(
        'bad_request:api',
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
      'bad_request:api',
      error.message || 'An error occurred while compiling LaTeX',
    ).toResponse();
  }
}
