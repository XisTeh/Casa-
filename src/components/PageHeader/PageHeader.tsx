import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  accessory?: ReactNode;
};

export function PageHeader({ accessory, description, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {accessory && <div className="page-header__accessory">{accessory}</div>}
    </header>
  );
}
