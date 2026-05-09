import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';

export default function Settings() {
  const { user, signOut } = useAuth();
  const { language, changeLanguage, t } = useLanguage();
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
    </div>
  );
}
