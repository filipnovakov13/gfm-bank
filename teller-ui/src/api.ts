import type { Account, HealthResult, LoginResult, Transaction, TransferResult } from './types';

const BASE_URL = 'http://127.0.0.1:8000';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const form = new URLSearchParams();
  form.set('username', username);
  form.set('password', password);
  const res = await fetch(`${BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  return handleResponse<LoginResult>(res);
}

export async function getHealth(): Promise<HealthResult> {
  const res = await fetch(`${BASE_URL}/health`);
  return handleResponse<HealthResult>(res);
}

export async function getAccounts(token: string): Promise<Account[]> {
  const res = await fetch(`${BASE_URL}/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse<Account[]>(res);
}

export async function getTransactions(accountId: string, token: string): Promise<Transaction[]> {
  const res = await fetch(`${BASE_URL}/transactions/${accountId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse<Transaction[]>(res);
}

export async function transfer(
  sourceAccountId: string,
  destinationAccountId: string,
  amountEur: number,
  token: string,
): Promise<TransferResult> {
  const res = await fetch(`${BASE_URL}/transfer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_account_id: sourceAccountId,
      destination_account_id: destinationAccountId,
      amount_eur: amountEur,
    }),
  });
  return handleResponse<TransferResult>(res);
}
