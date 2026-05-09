import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';

export default function Login() {
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await signIn(email);
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="login-screen page">
      <div className="login-container">
        <div className="login-logo">
          <span className="login-logo-icon">🧾</span>
          <h1 className="login-title">{t('appName')}</h1>
          <p className="login-subtitle">{t('appSubtitle')}</p>
        </div>

        {sent ? (
          <div className="login-sent">
            <p className="login-sent-icon">✉️</p>
            <h2>{t('checkEmail')}</h2>
            <p className="text-muted">{t('magicLinkSentTo')} <strong>{email}</strong></p>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="form-label">{t('emailLabel')}</label>
            <input
              type="email"
              className="form-input"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? t('sending') : t('sendMagicLink')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
