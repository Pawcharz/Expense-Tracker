import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useCurrency } from '../hooks/useCurrency';

export default function Settings() {
  const { user, signOut } = useAuth();
  const { language, changeLanguage, t } = useLanguage();
  const {
    displayCurrency,
    changeDisplayCurrency,
    supportedCurrencies,
    currencyLabels,
  } = useCurrency();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="settings-page page">
      <div className="settings-section">
        <p className="settings-section-title">{t('accountLabel')}</p>
        <div className="settings-row">
          <p className="settings-email">{t('signedInAs')} {user?.email}</p>
        </div>
        <div className="settings-row">
          <button className="btn btn-ghost" onClick={handleSignOut}>
            {t('signOut')}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <p className="settings-section-title">{t('languageLabel')}</p>
        <div className="settings-row">
          <div className="lang-options">
            <button
              className={`lang-btn${language === 'en' ? ' active' : ''}`}
              onClick={() => changeLanguage('en')}
            >
              English
            </button>
            <button
              className={`lang-btn${language === 'pl' ? ' active' : ''}`}
              onClick={() => changeLanguage('pl')}
            >
              Polski
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <p className="settings-section-title">{t('displayCurrencyLabel')}</p>
        <div className="settings-row">
          <select
            className="form-select"
            value={displayCurrency}
            onChange={e => changeDisplayCurrency(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            {supportedCurrencies.map(c => (
              <option key={c} value={c}>
                {c}{currencyLabels?.[c] ? ` — ${currencyLabels[c]}` : ''}
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
          {t('displayCurrencyHint')}
        </p>
      </div>
    </div>
  );
}
