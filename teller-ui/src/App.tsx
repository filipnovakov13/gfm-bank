import { useState, useEffect, useCallback } from 'react';
import { login, getHealth, getAccounts, getTransactions, transfer } from './api';
import type { Transaction } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${amount.toFixed(2)} EUR`;
}

function fmtDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function truncateTxId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const defaultUser = import.meta.env.VITE_TELLER_USER as string | undefined;
  const defaultPass = import.meta.env.VITE_TELLER_PASS as string | undefined;

  // Auth
  const [token, setToken] = useState<string | null>(null);
  const [loginUser, setLoginUser] = useState(defaultUser ?? '');
  const [loginPass, setLoginPass] = useState(defaultPass ?? '');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Health
  const [online, setOnline] = useState<boolean | null>(null);

  // Balance inquiry
  const [balIban, setBalIban] = useState('');
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  // Transfer
  const [txSrcIban, setTxSrcIban] = useState('');
  const [txDstIban, setTxDstIban] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');
  const [txSuccess, setTxSuccess] = useState('');

  // Overdraft request
  const [odIban, setOdIban] = useState('');
  const [odAmount, setOdAmount] = useState('');
  const [odMessage, setOdMessage] = useState('');

  // ---------------------------------------------------------------------------
  // Health polling
  // ---------------------------------------------------------------------------

  const checkHealth = useCallback(async () => {
    try {
      await getHealth();
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, 10_000);
    return () => clearInterval(id);
  }, [checkHealth]);

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const result = await login(loginUser, loginPass);
      setToken(result.access_token);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Balance inquiry
  // ---------------------------------------------------------------------------

  async function handleBalanceInquiry(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBalError('');
    setBalance(null);
    setTransactions(null);
    setBalLoading(true);
    try {
      const accounts = await getAccounts(token);
      const account = accounts.find((a) => a.iban === balIban.trim());
      if (!account) {
        setBalError(`No account found for IBAN: ${balIban.trim()}`);
        return;
      }
      const txs = await getTransactions(account.account_id, token);
      const total = txs.reduce((sum, t) => sum + t.amount_eur, 0);
      setBalance(total);
      // Sort by booking_ts descending and take last 10
      const sorted = [...txs].sort(
        (a, b) => new Date(b.booking_ts).getTime() - new Date(a.booking_ts).getTime(),
      );
      setTransactions(sorted.slice(0, 10));
    } catch (err) {
      setBalError(err instanceof Error ? err.message : 'Failed to retrieve balance');
    } finally {
      setBalLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Transfer
  // ---------------------------------------------------------------------------

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setTxError('');
    setTxSuccess('');
    const amount = parseFloat(txAmount);
    if (isNaN(amount) || amount <= 0) {
      setTxError('Amount must be a positive number.');
      return;
    }
    setTxLoading(true);
    try {
      const accounts = await getAccounts(token);
      const src = accounts.find((a) => a.iban === txSrcIban.trim());
      const dst = accounts.find((a) => a.iban === txDstIban.trim());
      if (!src) {
        setTxError(`Source IBAN not found: ${txSrcIban.trim()}`);
        return;
      }
      if (!dst) {
        setTxError(`Destination IBAN not found: ${txDstIban.trim()}`);
        return;
      }
      const result = await transfer(src.account_id, dst.account_id, amount, token);
      setTxSuccess(
        `Transfer posted ✓  Status: ${result.status} · ${fmtDate(result.timestamp)}`,
      );
      setTxSrcIban('');
      setTxDstIban('');
      setTxAmount('');
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setTxLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Overdraft message
  // ---------------------------------------------------------------------------

  function handleOverdraftMessage(e: React.FormEvent) {
    e.preventDefault();
    const iban = odIban.trim();
    const amount = parseFloat(odAmount);
    if (!iban) {
      setOdMessage('Please enter an IBAN.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setOdMessage('Please enter a valid requested amount.');
      return;
    }
    const now = new Date().toISOString();
    setOdMessage(
      `--- OVERDRAFT REQUEST ---\n` +
        `Date       : ${now}\n` +
        `Requested by: ${loginUser}\n` +
        `Account IBAN: ${iban}\n` +
        `Requested limit: ${amount.toFixed(2)} EUR\n` +
        `Status     : PENDING BACK-OFFICE APPROVAL\n` +
        `------------------------`,
    );
  }

  // ---------------------------------------------------------------------------
  // Render — Login screen
  // ---------------------------------------------------------------------------

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">🏦</div>
          <h1 className="login-title">GFM Bank</h1>
          <p className="login-subtitle">Teller Portal</p>
          <form className="login-form" onSubmit={handleLogin}>
            <label className="field-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="field-input"
              type="text"
              autoComplete="username"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              required
            />
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="field-input"
              type="password"
              autoComplete="current-password"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              required
            />
            {loginError && <p className="error-msg">{loginError}</p>}
            <button className="btn btn-primary" type="submit" disabled={loginLoading}>
              {loginLoading ? <Spinner /> : 'Login'}
            </button>
          </form>
          <div className="health-badge-login">
            Server:{' '}
            {online === null ? (
              <span className="badge badge-neutral">Checking…</span>
            ) : online ? (
              <span className="badge badge-online">Online</span>
            ) : (
              <span className="badge badge-offline">Offline</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — Dashboard
  // ---------------------------------------------------------------------------

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <span className="header-logo">🏦</span>
          <span className="header-title">GFM Bank — Teller Portal</span>
        </div>
        <div className="header-right">
          <span className="header-user">👤 {loginUser}</span>
          {online === null ? (
            <span className="badge badge-neutral">Checking…</span>
          ) : online ? (
            <span className="badge badge-online">● Online</span>
          ) : (
            <span className="badge badge-offline">● Offline</span>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => {
              setToken(null);
              setBalance(null);
              setTransactions(null);
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard">
        {/* ---------------------------------------------------------------- */}
        {/* Balance Inquiry                                                  */}
        {/* ---------------------------------------------------------------- */}
        <section className="card">
          <h2 className="card-title">Balance Inquiry</h2>
          <form className="inline-form" onSubmit={handleBalanceInquiry}>
            <input
              className="field-input"
              type="text"
              placeholder="Enter IBAN (e.g. DE89545769475769453536)"
              value={balIban}
              onChange={(e) => setBalIban(e.target.value)}
              required
            />
            <button className="btn btn-primary" type="submit" disabled={balLoading}>
              {balLoading ? <Spinner /> : 'Check Balance'}
            </button>
          </form>

          {balError && <p className="error-msg">{balError}</p>}

          {balance !== null && (
            <div className="balance-result">
              <span className="balance-label">Current Balance</span>
              <span className={`balance-amount ${balance < 0 ? 'negative' : 'positive'}`}>
                {balance.toFixed(2)} EUR
              </span>
            </div>
          )}

          {transactions && transactions.length > 0 && (
            <div className="table-wrapper">
              <h3 className="table-title">Last {transactions.length} Transactions</h3>
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>Tx ID</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.tx_id}>
                      <td className="mono" title={tx.tx_id}>
                        {truncateTxId(tx.tx_id)}
                      </td>
                      <td>{fmtDate(tx.booking_ts)}</td>
                      <td className={`amount ${tx.amount_eur >= 0 ? 'positive' : 'negative'}`}>
                        {fmtAmount(tx.amount_eur)}
                      </td>
                      <td>
                        <span className="type-badge">{tx.type}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {transactions && transactions.length === 0 && (
            <p className="muted">No transactions found for this account.</p>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Money Transfer                                                   */}
        {/* ---------------------------------------------------------------- */}
        <section className="card">
          <h2 className="card-title">Money Transfer</h2>
          <form className="stack-form" onSubmit={handleTransfer}>
            <label className="field-label">Source IBAN</label>
            <input
              className="field-input"
              type="text"
              placeholder="DE…"
              value={txSrcIban}
              onChange={(e) => setTxSrcIban(e.target.value)}
              required
            />
            <label className="field-label">Destination IBAN</label>
            <input
              className="field-input"
              type="text"
              placeholder="DE…"
              value={txDstIban}
              onChange={(e) => setTxDstIban(e.target.value)}
              required
            />
            <label className="field-label">Amount (EUR)</label>
            <input
              className="field-input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              required
            />
            {txError && <p className="error-msg">{txError}</p>}
            {txSuccess && <p className="success-msg">{txSuccess}</p>}
            <button className="btn btn-primary" type="submit" disabled={txLoading}>
              {txLoading ? <Spinner /> : 'Transfer'}
            </button>
          </form>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Overdraft Request Message                                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="card">
          <h2 className="card-title">Overdraft Request</h2>
          <p className="card-desc">
            Generates a formatted back-office request message. Does not modify the account limit.
          </p>
          <form className="stack-form" onSubmit={handleOverdraftMessage}>
            <label className="field-label">Account IBAN</label>
            <input
              className="field-input"
              type="text"
              placeholder="DE…"
              value={odIban}
              onChange={(e) => setOdIban(e.target.value)}
              required
            />
            <label className="field-label">Requested Limit (EUR)</label>
            <input
              className="field-input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={odAmount}
              onChange={(e) => setOdAmount(e.target.value)}
              required
            />
            <button className="btn btn-secondary" type="submit">
              Generate Message
            </button>
          </form>
          {odMessage && <pre className="od-message">{odMessage}</pre>}
        </section>
      </main>
    </div>
  );
}
