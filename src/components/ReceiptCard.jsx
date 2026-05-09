import { useNavigate } from 'react-router-dom';

function formatReceiptDate(val) {
  if (!val) return '';
  const d = new Date(val);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const h = d.getHours(), m = d.getMinutes();
  if (h === 0 && m === 0) return date;
  return `${date}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function ReceiptCard({ receipt }) {
  const navigate = useNavigate();

  return (
    <div className="receipt-card" onClick={() => navigate(`/receipt/${receipt.id}`)}>
      <div className="receipt-card-header">
        <span className="receipt-store">{receipt.store || 'Unknown store'}</span>
        <span className="receipt-total" style={{ fontFamily: 'var(--font-mono)' }}>
          {receipt.total != null ? `${Number(receipt.total).toFixed(2)} PLN` : '—'}
        </span>
      </div>
      <div className="receipt-card-footer">
        <span className="receipt-date">{formatReceiptDate(receipt.date)}</span>
        {receipt.item_count != null && (
          <span className="receipt-items">{receipt.item_count} item{receipt.item_count !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}
