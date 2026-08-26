import { CalendarDays, History, MapPin, Scale, Store, Tag, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  formatCurrencyFromCents,
  formatDate,
  formatQuantity,
} from '../../application/locale-formatters';
import type { ProductPriceProjection } from '../../application/price-history-selectors';
import { PriceEvolutionChart } from './PriceEvolutionChart';
import { PriceVariationBadge } from './PriceVariationBadge';

export function ProductPriceDetailDialog({
  projection,
  onClose,
}: {
  projection: ProductPriceProjection;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [selectedUnit, setSelectedUnit] = useState(projection.primaryUnit.unit);
  const unitProjection =
    projection.units.find((candidate) => candidate.unit === selectedUnit) ?? projection.primaryUnit;
  const globalLowest = Math.min(
    ...unitProjection.stores.map((store) => store.lowestRecord.unitPriceCents),
  );

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="product-price-detail-title"
        aria-modal="true"
        className="shopping-dialog product-price-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="price-detail-header">
          <div>
            <p className="eyebrow">Histórico de preços</p>
            <h2 id="product-price-detail-title">{projection.name}</h2>
            <p>{[projection.brand, projection.categoryName].filter(Boolean).join(' · ')}</p>
            <div className="price-detail-badges">
              {projection.active === false && (
                <span className="badge badge--neutral">Produto inativo</span>
              )}
              {!projection.productId && (
                <span className="badge badge--neutral">Registro legado</span>
              )}
            </div>
          </div>
          <button
            aria-label="Fechar histórico de preços"
            className="shopping-dialog__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <div className="price-detail-content">
          {projection.units.length > 1 && (
            <div className="price-unit-switcher" aria-label="Unidade analisada">
              <span>
                <Scale aria-hidden="true" size={16} /> Comparar por unidade
              </span>
              <div>
                {projection.units.map((unit) => (
                  <button
                    aria-pressed={unit.unit === unitProjection.unit}
                    className={unit.unit === unitProjection.unit ? 'is-active' : ''}
                    key={unit.unit}
                    onClick={() => setSelectedUnit(unit.unit)}
                    type="button"
                  >
                    {unit.unit} ({unit.recordCount})
                  </button>
                ))}
              </div>
            </div>
          )}

          <section
            aria-label={`Resumo dos preços em ${unitProjection.unit}`}
            className="price-metrics"
          >
            <div className="price-metric price-metric--latest">
              <span>Último preço</span>
              <strong>{formatCurrencyFromCents(unitProjection.latestRecord.unitPriceCents)}</strong>
              <small>por {unitProjection.unit}</small>
              <PriceVariationBadge variation={unitProjection.variation} />
            </div>
            <div className="price-metric">
              <span>Menor histórico</span>
              <strong>{formatCurrencyFromCents(unitProjection.lowestRecord.unitPriceCents)}</strong>
              <small>{unitProjection.lowestRecord.storeName}</small>
            </div>
            <div className="price-metric">
              <span>Maior histórico</span>
              <strong>
                {formatCurrencyFromCents(unitProjection.highestRecord.unitPriceCents)}
              </strong>
              <small>{unitProjection.highestRecord.storeName}</small>
            </div>
            <div className="price-metric">
              <span>Média histórica</span>
              <strong>{formatCurrencyFromCents(unitProjection.averagePriceCents)}</strong>
              <small>{unitProjection.recordCount} registros</small>
            </div>
          </section>

          {unitProjection.latestRecord.unitPriceCents ===
            unitProjection.lowestRecord.unitPriceCents && (
            <p className="price-best-callout">
              <Tag aria-hidden="true" size={17} /> O último registro iguala o melhor preço deste
              histórico.
            </p>
          )}

          <section className="price-detail-section">
            <div className="price-detail-section__heading">
              <div>
                <History aria-hidden="true" size={18} />
                <h3>Evolução</h3>
              </div>
              <span>Somente preços em {unitProjection.unit}</span>
            </div>
            <PriceEvolutionChart projection={unitProjection} />
          </section>

          <section className="price-detail-section">
            <div className="price-detail-section__heading">
              <div>
                <Store aria-hidden="true" size={18} />
                <h3>Comparação entre mercados</h3>
              </div>
              <span>Valores históricos registrados</span>
            </div>
            <div className="price-store-grid">
              {unitProjection.stores.map((storeProjection) => (
                <article className="price-store-card" key={storeProjection.key}>
                  <div>
                    <strong>{storeProjection.storeName}</strong>
                    {storeProjection.lowestRecord.unitPriceCents === globalLowest && (
                      <span className="badge badge--success">Melhor histórico</span>
                    )}
                  </div>
                  <dl>
                    <div>
                      <dt>Último registrado</dt>
                      <dd>
                        {formatCurrencyFromCents(storeProjection.latestRecord.unitPriceCents)}
                      </dd>
                    </div>
                    <div>
                      <dt>Menor histórico</dt>
                      <dd>
                        {formatCurrencyFromCents(storeProjection.lowestRecord.unitPriceCents)}
                      </dd>
                    </div>
                    <div>
                      <dt>Registros</dt>
                      <dd>{storeProjection.recordCount}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="price-detail-section">
            <div className="price-detail-section__heading">
              <div>
                <CalendarDays aria-hidden="true" size={18} />
                <h3>Linha do tempo</h3>
              </div>
              <span>Do registro mais recente ao mais antigo</span>
            </div>
            <div className="price-timeline">
              {unitProjection.records.map((record) => (
                <article className="price-timeline-item" key={record.item.id}>
                  <span className="price-timeline-item__dot" aria-hidden="true" />
                  <div>
                    <strong>
                      {formatCurrencyFromCents(record.unitPriceCents)}/{record.unit}
                    </strong>
                    <span>
                      <MapPin aria-hidden="true" size={14} /> {record.storeName}
                    </span>
                    <small>
                      {formatDate(record.purchasedAt)} · {formatQuantity(record.quantity)}{' '}
                      {record.unit} · total {formatCurrencyFromCents(record.totalPriceCents)}
                    </small>
                    {record.item.productNameSnapshot !== projection.name && (
                      <small>Nome na compra: {record.item.productNameSnapshot}</small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
