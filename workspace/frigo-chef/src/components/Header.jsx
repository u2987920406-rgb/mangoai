import { ChefHat } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <ChefHat className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold tracking-tight">Frigo Chef</p>
            <p className="hidden text-xs text-muted-foreground sm:block">
              De ton frigo à l'assiette en 3 gestes
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
