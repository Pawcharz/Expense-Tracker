import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

function formatDate(val) {
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/**
 * Line items for the selected category / subcategory, grouped by receipt.
 * `groups` is [{ receipt: {id, store, date}, items: [{id, name, amount, category}], total }]
 * sorted by receipt date descending. `amount` values are already in the
 * display currency.
 */
export default function TransactionList({ groups, currency, t, onNavigate }) {
  const navigate = useNavigate();

  if (groups.length === 0) {
    return <p className="text-muted" style={{ fontSize: 13 }}>{t('noDataMonth')}</p>;
  }

  function open(id) {
    onNavigate?.();
    navigate(`/receipt/${id}`);
  }

  return (
    <div className="tx-list">
      {groups.map(g => (
        <div key={g.receipt.id} className="tx-receipt" onClick={() => open(g.receipt.id)} role="button" tabIndex={0}>
          <div className="tx-receipt-head">
            <span className="tx-receipt-store">{g.receipt.store || t('unknownStore')}</span>
            <span className="tx-receipt-date text-muted">{formatDate(g.receipt.date)}</span>
            <span className="tx-receipt-total" style={{ fontFamily: 'var(--font-mono)' }}>
              {g.total.toFixed(2)} {currency}
            </span>
            <ChevronRight size={14} className="tx-chevron" />
          </div>
          {(g.items.length > 1 || g.items[0]?.name !== g.receipt.store) && (
            <ul className="tx-items">
              {g.items.map(it => (
                <li key={it.id} className="tx-item">
                  <span className="tx-item-name">{it.name}</span>
                  {it.categoryLabel && <span className="tx-item-cat text-muted">{it.categoryLabel}</span>}
                  <span className="tx-item-amount text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                    {it.amount.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
