import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { signIn } = useAuth();
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
          <h1 className="login-title">Receipt Tracker</h1>
          <p className="login-subtitle">Track your spending with AI</p>
        </div>

        {sent ? (
          <div className="login-sent">
            <p className="login-sent-icon">✉️</p>
            <h2>Check your email</h2>
            <p className="text-muted">We sent a magic link to <strong>{email}</strong></p>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="form-label">Email address</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
