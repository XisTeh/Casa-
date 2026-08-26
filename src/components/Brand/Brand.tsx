type BrandProps = { compact?: boolean; descriptor?: string };

export function Brand({ compact = false, descriptor }: BrandProps) {
  return (
    <div className="brand" aria-label="Casaê">
      <img className="brand__mark" src="/icons/casae-mark.svg" alt="" width="40" height="40" />
      {!compact && (
        <span className="brand__copy">
          <strong className="brand__name">Casaê</strong>
          {descriptor && <small>{descriptor}</small>}
        </span>
      )}
    </div>
  );
}
