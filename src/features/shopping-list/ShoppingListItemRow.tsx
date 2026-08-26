import { AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '../../components/Badge/Badge';
import { shoppingPriorityLabels, type ShoppingListItem } from '../../domain/shopping-list';

type ShoppingListItemRowProps = {
  item: ShoppingListItem;
  onEdit: (item: ShoppingListItem) => void;
  onRemove: (item: ShoppingListItem) => void;
};

export function ShoppingListItemRow({ item, onEdit, onRemove }: ShoppingListItemRowProps) {
  return (
    <article className="shopping-item">
      <div className="shopping-item__main">
        <div className="shopping-item__title-row">
          <h3>{item.productName}</h3>
          {item.priority === 'high' && (
            <Badge className="shopping-item__priority" tone="accent">
              <AlertTriangle aria-hidden="true" size={12} /> {shoppingPriorityLabels[item.priority]}
            </Badge>
          )}
        </div>
        <div className="shopping-item__details">
          <span>
            {item.quantity} {item.unit}
          </span>
          {item.preferredBrand && <span>{item.preferredBrand}</span>}
          {item.notes && (
            <span className="shopping-item__notes" title={item.notes}>
              {item.notes}
            </span>
          )}
        </div>
      </div>
      <div className="shopping-item__actions">
        <button
          aria-label={`Editar ${item.productName}`}
          className="shopping-item__action"
          onClick={() => onEdit(item)}
          type="button"
        >
          <Pencil aria-hidden="true" size={16} />
        </button>
        <button
          aria-label={`Remover ${item.productName}`}
          className="shopping-item__action shopping-item__action--remove"
          onClick={() => onRemove(item)}
          type="button"
        >
          <Trash2 aria-hidden="true" size={16} />
        </button>
      </div>
    </article>
  );
}
