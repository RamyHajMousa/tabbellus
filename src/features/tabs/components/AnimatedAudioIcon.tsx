export function AnimatedAudioIcon({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-end justify-center gap-[2px] w-4 h-4 p-[2px] ${className}`}>
      <div className="w-[3px] bg-muted-foreground rounded-full origin-bottom h-full animate-audio-bounce-1" />
      <div className="w-[3px] bg-muted-foreground rounded-full origin-bottom h-full animate-audio-bounce-2" />
      <div className="w-[3px] bg-muted-foreground rounded-full origin-bottom h-full animate-audio-bounce-3" />
    </div>
  );
}
