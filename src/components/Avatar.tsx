import { Avatar as AvatarRoot, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

/**
 * Circular avatar: photo if set, otherwise the name's first letter.
 * Built on Radix's Avatar primitive rather than a plain <img> so a broken
 * or slow-loading image URL falls back automatically instead of showing a
 * broken-image icon.
 */
export default function Avatar({
  url,
  name,
  size = 56,
  className = "",
}: {
  url?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <AvatarRoot className={className} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
        {(name.charAt(0) || "?").toUpperCase()}
      </AvatarFallback>
    </AvatarRoot>
  );
}
