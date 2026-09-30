import { Sheet } from '../components/Sheet';

interface InfoSheetProps {
  title: string;
  paragraphs: string[];
  onClose: () => void;
}

/** Plain read-only text in a sheet (privacy, terms). */
export function InfoSheet({ title, paragraphs, onClose }: InfoSheetProps) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="prose">
        {paragraphs.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>
    </Sheet>
  );
}
