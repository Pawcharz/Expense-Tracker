import { useNavigate } from 'react-router-dom';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return null;
  return new Date(isoStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function ReceiptCard({ receipt }) {
  const navigate = useNavigate();
  const time = formatTime(receipt.created_at);

  return (
    <div className="receipt-card" onClick={() => navigate(`/receipt/${receipt.id}`)}>
      <div className="receipt-card-header">
        <span className="receipt-store">{receipt.store || 'Unknown store'}</span>
        <span className="receipt-total" style={{ fontFamily: 'var(--font-mono)' }}>
          {receipt.total != null ? `${Number(receipt.total).toFixed(2)} PLN` : '—'}
        </span>
      </div>
      <div className="receipt-card-footer">
        <span className="receipt-date">
          {formatDate(receipt.date)}{time ? ` · ${time}` : ''}
        </span>
        {receipt.item_count != null && (
          <span className="receipt-items">{receipt.item_count} item{receipt.item_count !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}
