import { AlertCircle, Inbox, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type StateViewProps = {
  title: string;
  description: string;
  eyebrow?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  busy?: boolean;
};

function StateView({
  action,
  busy,
  description,
  eyebrow,
  icon: Icon = Inbox,
  title,
}: StateViewProps) {
  return (
    <div
      className="state-view"
      aria-live={busy ? 'polite' : undefined}
      aria-busy={busy || undefined}
    >
      <span className="state-view__icon">
        <Icon className={busy ? 'state-view__spinner' : undefined} aria-hidden="true" size={28} />
      </span>
      {eyebrow && <span className="state-view__eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function EmptyState(props: Omit<StateViewProps, 'busy'>) {
  return <StateView {...props} />;
}

export function LoadingState({
  description = 'Preparando tudo por aqui…',
}: {
  description?: string;
}) {
  return <StateView busy title="Carregando" description={description} icon={LoaderCircle} />;
}

export function ErrorState({
  action,
  description = 'Não foi possível carregar estas informações.',
}: Pick<StateViewProps, 'action' | 'description'>) {
  return (
    <StateView
      title="Algo não saiu como esperado"
      description={description}
      icon={AlertCircle}
      action={action}
    />
  );
}
