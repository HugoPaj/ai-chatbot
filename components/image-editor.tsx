import { LoaderIcon } from './icons';
import Image from 'next/image';
import cn from 'classnames';

interface ImageEditorProps {
  title: string;
  content: string;
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  status: string;
  isInline: boolean;
}

export function ImageEditor({
  title,
  content,
  status,
  isInline,
}: ImageEditorProps) {
  return (
    <div
      className={cn('flex flex-row items-center justify-center w-full', {
        'h-[calc(100dvh-60px)]': !isInline,
        'h-[200px]': isInline,
      })}
    >
      {status === 'streaming' ? (
        <div className="flex flex-row gap-4 items-center">
          {!isInline && (
            <div className="animate-spin">
              <LoaderIcon />
            </div>
          )}
          <div>Generating Image...</div>
        </div>
      ) : (
        <Image
          className={cn('w-full h-fit max-w-[800px]', {
            'p-0 md:p-20': !isInline,
          })}
          src={`data:image/png;base64,${content}`}
          alt={title}
          width={800}
          height={600}
        />
      )}
    </div>
  );
}
