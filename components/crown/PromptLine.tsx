export function PromptLine({ text, lyric }: { text: string; lyric: boolean }) {
  if (!lyric) return text;
  const parts = text.split('______');
  if (parts.length < 2) return text;
  return (
    <>
      {parts[0]}
      <span className="mx-2 inline-block border border-[#e1bf47] bg-[#e1bf47]/15 px-2 text-[#e1bf47]">
        ?????
      </span>
      {parts[1] ?? ''}
    </>
  );
}
