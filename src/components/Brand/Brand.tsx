import { Link, useInRouterContext } from 'react-router-dom';

type BrandProps = { compact?: boolean; descriptor?: string };

export function Brand({ compact = false, descriptor }: BrandProps) {
  const isInsideRouter = useInRouterContext();
  const content = (
    <>
      <img className="brand__mark" src="/icons/casae-mark.svg" alt="" width="40" height="40" />
      {!compact && (
        <span className="brand__copy">
          <strong className="brand__name">Casaê</strong>
          {descriptor && <small>{descriptor}</small>}
        </span>
      )}
    </>
  );

  if (!isInsideRouter) {
    return (
      <a className="brand" aria-label="Ir para Início" href="/">
        {content}
      </a>
    );
  }

  return (
    <Link className="brand" aria-label="Ir para Início" to="/">
      {content}
    </Link>
  );
}
