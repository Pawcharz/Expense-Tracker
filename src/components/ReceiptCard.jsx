import { useNavigate } from 'react-router-dom';

function formatReceiptDate(val) {
  if (!val) return '';
  const str = String(val);
  if (str.length === 10) {
    const d = new Date(str + 'T00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const d = new Date(str);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (d.getHours() === 0 && d.getMinutes() === 0) return date;
  return `${date}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
