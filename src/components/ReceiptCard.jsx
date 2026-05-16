import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../hooks/useCurrency';

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
  const { displayCurrency, toDisplay, format } = useCurrency();

  const receiptCurrency = receipt.currency || 'PLN';
  const totalNum = receipt.total != null ? Number(receipt.total) : null;
  const isForeign = receiptCurrency !== displayCurrency;
  const displayTotal = totalNum != null
    ? format(toDisplay(totalNum, receiptCurrency), displayCurrency)
    : '—';

  return (
    <div className="receipt-card" onClick={() => navigate(`/receipt/${receipt.id}`)}>
      <div className="receipt-card-header">
        <span className="receipt-store">{receipt.store || 'Unknown store'}</span>
        <div style={{ textAlign: 'right' }}>
          <span className="receipt-total" style={{ fontFamily: 'var(--font-mono)' }}>
            {isForeign && totalNum != null ? '≈ ' : ''}{displayTotal}
          </span>
          {isForeign && totalNum != null && (
            <div className="text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 1 }}>
              {totalNum.toFixed(2)} {receiptCurrency}
            </div>
          )}
        </div>
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
