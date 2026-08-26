type AvatarProps = {
  name: string;
  imageUrl?: string;
  size?: 'small' | 'medium';
};

export function Avatar({ name, imageUrl, size = 'medium' }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <span className={`avatar avatar--${size}`} role="img" aria-label={name}>
      {imageUrl ? <img src={imageUrl} alt="" /> : initials}
    </span>
  );
}
